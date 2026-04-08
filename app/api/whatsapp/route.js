import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder'
)

// --- CONSTANTS ---
const DEFAULT_WATER_BILL = 140
const ELECTRICITY_RATE = 10
const ELECTRICITY_MIN = 150

// --- WHATSAPP HELPERS ---
async function callWhatsApp(to, messageData) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_ID
  if (!token || !phoneId) return
  try {
    return await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: "whatsapp", to, ...messageData })
    })
  } catch (err) {
    console.error('WA API Error:', err)
  }
}

const sendText = async (to, text) => await callWhatsApp(to, { type: "text", text: { body: text } })
const sendButtons = async (to, text, buttons) => await callWhatsApp(to, {
  type: "interactive",
  interactive: {
    type: "button",
    body: { text: text.substring(0, 1024) },
    action: { buttons: buttons.slice(0, 3).map((b, i) => ({ type: "reply", reply: { id: `btn_${i}`, title: b.substring(0, 20) } })) }
  }
})
const sendListMenu = async (to, header, body, buttonLabel, sections) => await callWhatsApp(to, {
  type: "interactive",
  interactive: {
    type: "list",
    header: { type: "text", text: header.substring(0, 60) },
    body: { text: body.substring(0, 1024) },
    footer: { text: "PropManager Pro" },
    action: { button: buttonLabel.substring(0, 20), sections }
  }
})

// --- STATE MANAGEMENT ---
async function getSession(phone) {
  const { data } = await supabase.from('bot_sessions').select('*').eq('phone', phone).single()
  return data
}
async function updateSession(phone, data) {
  await supabase.from('bot_sessions').upsert({ phone, ...data, updated_at: new Date() })
}
async function clearSession(phone) {
  await supabase.from('bot_sessions').delete().eq('phone', phone)
}

const ok = () => NextResponse.json({ ok: true })
const fmt = (val) => parseFloat(val || 0).toLocaleString('en-IN')

// --- MAIN BOT HANDLER ---
export async function POST(req) {
  try {
    const body = await req.json()
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
    if (!message) return ok()

    const from = message.from
    const cleanPhone = from.replace(/\D/g, '')

    // 1. Auth check
    const { data: profile } = await supabase.from('profiles').select('*').ilike('contact_number', `%${cleanPhone}%`).single()
    if (!profile) {
      await sendText(from, `⚠️ Unauthorized: ${from}. Please register in settings.`)
      return ok()
    }

    const text = (message.text?.body || message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || "").trim()
    const listId = message.interactive?.list_reply?.id
    const input = text.toLowerCase()

    // 2. Main Menu
    if (['hi', 'hello', 'menu', 'start', 'hey', 'cancel', 'reset'].includes(input) || listId === 'nav_main') {
      await clearSession(from)
      await sendListMenu(from, `👋 PropManager Pro`, "What would you like to manage?", "Open Menu", [
        { title: "⚡ RECORD", rows: [
          { id: "path_reading", title: "Submit Reading" },
          { id: "path_pay_rec", title: "Record Payment" },
          { id: "path_expense", title: "Add Expense" }
        ]},
        { title: "📊 REPORTS", rows: [
          { id: "path_profit", title: "Net Profit (P&L)" },
          { id: "path_monthly", title: "Invoicing Report" },
          { id: "path_unpaid", title: "Unpaid Bills" },
          { id: "path_vacancy", title: "Vacancy Analysis" }
        ]},
        { title: "🔍 LOOKUP", rows: [
          { id: "path_lookup", title: "Get Unit Bill" },
          { id: "path_compliance", title: "Compliance Status" },
          { id: "path_summary", title: "Property Summary" }
        ]}
      ])
      return ok()
    }

    const session = await getSession(from)

    // 3. Handle Active Session Steps
    if (session) {
      // --- EXPENSE FLOW ---
      if (session.step === 'awaiting_expense_unit') {
        const unitNum = text.toUpperCase()
        const { data: unit } = await supabase.from('units').select('id, unit_number').eq('unit_number', unitNum).single()
        if (!unit) return await sendText(from, "❌ Unit not found. Type 'cancel' or a valid unit like G01.")
        await updateSession(from, { step: 'awaiting_expense_category', unit_id: unit.id, unit_num: unitNum })
        return await sendListMenu(from, "💸 Expense Type", `Unit: ${unitNum}. Select category:`, "Select", [{
          title: "CATEGORIES", rows: [
            { id: "exp_repair", title: "Repair/Maintenance" },
            { id: "exp_tax", title: "Property Tax" },
            { id: "exp_utility", title: "Common Utility" },
            { id: "exp_staff", title: "Staff Salary" },
            { id: "exp_other", title: "Other" }
          ]
        }])
      }

      if (session.step === 'awaiting_expense_category') {
        const cat = text
        await updateSession(from, { step: 'awaiting_expense_amount', category: cat })
        return await sendText(from, `💰 *${cat}* for unit ${session.unit_num}. How much was the expense?`)
      }

      if (session.step === 'awaiting_expense_amount') {
        const amt = parseFloat(text.replace(/[^\d.]/g, ''))
        if (isNaN(amt)) return await sendText(from, "❌ Enter a valid number.")
        await updateSession(from, { step: 'awaiting_expense_desc', payment_amt: amt })
        return await sendText(from, "📝 Almost done. Type a short description (e.g., 'Kitchen Tap Repair')")
      }

      if (session.step === 'awaiting_expense_desc') {
        await supabase.from('expenses').insert({ user_id: profile.id, unit_id: session.unit_id, category: session.category, amount: session.payment_amt, description: text })
        await clearSession(from)
        return await sendButtons(from, `✅ *Expense Recorded*\n💰 Amount: ₹${fmt(session.payment_amt)}\n📂 Category: ${session.category}\n📝 Desc: ${text}`, ["Main Menu", "Add Expense"])
      }

      // --- PAYMENT FLOW ---
      if (session.step === 'awaiting_payment_tenant_selection') {
        const tenantId = listId?.replace('tenant_', '')
        if (!tenantId) return ok()
        const { data: tenant } = await supabase.from('tenants').select('name, unit:units(unit_number)').eq('id', tenantId).single()
        const { data: bills } = await supabase.from('utility_bills').select('id, billing_month, balance_due').eq('tenant_id', tenantId).gt('balance_due', 0).order('billing_month', { ascending: false })
        const tName = tenant?.name || "Resident"
        if (!bills?.length) { await clearSession(from); return await sendButtons(from, `✅ *${tName}* has no pending bills.`, ["Main Menu"]) }
        await updateSession(from, { step: 'awaiting_bill_selection', tenant_id: tenantId, tenant_name: tName, unit_num: tenant?.unit?.unit_number })
        return await sendListMenu(from, `💰 Select Bill`, `Bills for ${tName}:`, "Select", [{ title: "PENDING", rows: bills.map(b => ({ id: `bill_${b.id}`, title: `${b.billing_month} (Due: ₹${fmt(b.balance_due)})` })) }])
      }

      if (session.step === 'awaiting_bill_selection') {
        const billId = listId?.replace('bill_', '')
        if (!billId) return ok()
        const { data: bill } = await supabase.from('utility_bills').select('*').eq('id', billId).single()
        await updateSession(from, { step: 'awaiting_payment_amount', bill_id: billId, bill_month: bill.billing_month, bill_total: bill.balance_due })
        return await sendText(from, `💸 Pending for *${bill.billing_month}*: ₹${fmt(bill.balance_due)}. How much received?`)
      }

      if (session.step === 'awaiting_payment_amount') {
        const amt = parseFloat(text.replace(/[^\d.]/g, ''))
        if (isNaN(amt)) return await sendText(from, "❌ Enter a number.")
        await updateSession(from, { step: 'awaiting_payment_method', payment_amt: amt })
        return await sendButtons(from, `💰 Received: ₹${fmt(amt)}\nSelect method:`, ["Cash", "UPI", "Bank Transfer"])
      }

      if (session.step === 'awaiting_payment_method') {
        const { data: bill } = await supabase.from('utility_bills').select('*').eq('id', session.bill_id).single()
        const amt = session.payment_amt || 0
        const newBal = Math.max(0, (bill?.balance_due || 0) - amt)
        await supabase.from('payments').insert({ tenant_id: session.tenant_id, bill_id: session.bill_id, amount: amt, status: 'Paid', method: text, payment_date: new Date(), due_date: bill?.due_date })
        await supabase.from('utility_bills').update({ balance_due: newBal }).eq('id', session.bill_id)
        if (newBal > 0) await supabase.from('payments').insert({ tenant_id: session.tenant_id, bill_id: session.bill_id, amount: newBal, status: 'Pending', method: 'Partial Balance', due_date: bill?.due_date })
        await clearSession(from)
        return await sendButtons(from, `✅ *Payment Saved*\n👤 *Resident:* ${session.tenant_name}\n🚩 *Remaining:* ₹${fmt(newBal)}`, ["Main Menu", "Record Payment"])
      }

      // --- READING FLOW ---
      if (session.step === 'awaiting_unit_reading') {
        const { data: unit } = await supabase.from('units').select('id, rent, tenants(id, name)').eq('unit_number', text.toUpperCase()).single()
        if (!unit || !unit.tenants?.[0]) return await sendText(from, `❌ Unit not found or empty.`)
        const { data: last } = await supabase.from('utility_bills').select('curr_reading').eq('tenant_id', unit.tenants[0].id).order('billing_month', { ascending: false }).limit(1).single()
        await updateSession(from, { step: 'awaiting_reading_value', tenant_id: unit.tenants[0].id, tenant_name: unit.tenants[0].name, prev_reading: last?.curr_reading || 0, rent: unit.rent, unit_num: text.toUpperCase() })
        return await sendText(from, `👤 *Resident:* ${unit.tenants[0].name}\n📟 *Previous:* ${last?.curr_reading || 0}\n\nWhat is current reading?`)
      }

      if (session.step === 'awaiting_reading_value') {
        const curr = parseFloat(text.replace(/[^\d.]/g, ''))
        if (isNaN(curr)) return await sendText(from, "❌ Enter a number.")
        await updateSession(from, { step: 'awaiting_water_value', curr_reading: curr })
        return await sendButtons(from, `📟 *Current:* ${curr}\n\nWhat is the Water Bill?`, ["Skip (140)", "Enter Custom"])
      }

      if (session.step === 'awaiting_water_value') {
        if (input === 'enter custom') return await sendText(from, "Type water amount:")
        const water = input.startsWith('skip') ? 140 : parseFloat(text.replace(/[^\d.]/g, ''))
        const elec = Math.max((session.curr_reading - session.prev_reading) * 10, 150)
        const total = parseFloat(session.rent) + elec + water
        const month = new Date().toISOString().slice(0, 7)
        const { data: bill } = await supabase.from('utility_bills').upsert({ user_id: profile.id, tenant_id: session.tenant_id, billing_month: month, prev_reading: session.prev_reading, curr_reading: session.curr_reading, rate_per_unit: 10, fixed_rent: session.rent, water_bill: water, total_amount: total, balance_due: total, due_date: new Date(new Date().getFullYear(), new Date().getMonth(), 10).toISOString().split('T')[0] }).select().single()
        if (bill) await supabase.from('payments').insert({ tenant_id: session.tenant_id, bill_id: bill.id, amount: total, status: 'Pending', method: 'Utility Bill', due_date: bill.due_date })
        await clearSession(from); return await sendButtons(from, `✅ *Bill Saved*\n💰 Total: ₹${fmt(total)}`, ["Main Menu", "Submit Reading"])
      }

      if (session.step === 'awaiting_report_month_selection') {
        const monthCode = listId?.replace('report_', '')
        if (monthCode) await generateMonthlyReport(from, profile.id, monthCode)
        return ok()
      }
      
      if (session.step === 'awaiting_profit_month_selection') {
        const monthCode = listId?.replace('profit_', '')
        if (monthCode) await generateProfitLossReport(from, profile.id, monthCode)
        return ok()
      }
    }

    // 4. Initial Triggers
    if (listId === 'path_reading' || input === 'submit reading') {
      await updateSession(from, { step: 'awaiting_unit_reading' })
      return await sendText(from, "📝 Which Unit? (e.g. G01)")
    }

    if (listId === 'path_expense' || input === 'add expense') {
      await updateSession(from, { step: 'awaiting_expense_unit' })
      return await sendText(from, "💸 *Add Expense*\nWhich Unit is this expense for? (e.g., G01)")
    }

    if (listId === 'path_pay_rec' || input === 'record payment') {
      const { data: tenants } = await supabase.from('tenants').select('id, name, unit:units(unit_number)').eq('user_id', profile.id).eq('status', 'Active')
      if (!tenants?.length) return await sendText(from, "🏠 No active residents.")
      await updateSession(from, { step: 'awaiting_payment_tenant_selection' })
      return await sendListMenu(from, "💰 Record Payment", "Choose tenant:", "Select", [{ title: "ACTIVE", rows: tenants.map(t => ({ id: `tenant_${t.id}`, title: `${t.unit?.unit_number || 'Unit'} - ${t.name}`.substring(0, 24) })) }])
    }
    
    if (listId === 'path_lookup' || input === 'get unit bill') {
      const { data: tenants } = await supabase.from('tenants').select('id, name, unit:units(unit_number)').eq('user_id', profile.id).eq('status', 'Active')
      if (!tenants?.length) return await sendText(from, "🏠 No active residents.")
      await updateSession(from, { step: 'awaiting_tenant_selection' })
      return await sendListMenu(from, "🔍 Select Tenant", "Choose tenant:", "Select", [{ title: "ACTIVE", rows: tenants.map(t => ({ id: `tenant_${t.id}`, title: `${t.unit?.unit_number || 'Unit'} - ${t.name}`.substring(0, 24) })) }])
    }

    if (listId === 'path_profit' || input === 'net profit') {
      const rows = []; for (let i = 0; i < 6; i++) { const d = new Date(); d.setMonth(d.getMonth() - i); rows.push({ id: `profit_${d.toISOString().slice(0, 7)}`, title: d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) }) }
      await updateSession(from, { step: 'awaiting_profit_month_selection' })
      return await sendListMenu(from, "📉 Profit & Loss", "Select month:", "Select", [{ title: "MONTHS", rows }])
    }

    if (listId === 'path_vacancy' || input === 'vacancy analysis') {
      const { data: vacant } = await supabase.from('units').select('unit_number, rent').eq('status', 'Vacant')
      let r = `📉 *Vacancy Loss Report*\n\n`; let tl = 0
      if (!vacant?.length) r += "✅ All units are occupied! Zero revenue loss."
      else { vacant.forEach(u => { r += `▫️ ${u.unit_number}: Loss of ₹${fmt(u.rent)}/mo\n`; tl += parseFloat(u.rent) }); r += `\n🚩 *TOTAL POTENTIAL LOSS:* ₹${fmt(tl)}/mo` }
      return await sendButtons(from, r, ["Main Menu"])
    }

    if (listId === 'path_compliance' || input === 'compliance status') {
      const { data: tenants } = await supabase.from('tenants').select('name, lease_end, police_verified, unit:units(unit_number)').eq('user_id', profile.id).eq('status', 'Active')
      let r = `📋 *Compliance & Legal*\n\n`
      tenants?.forEach(t => {
        const status = t.police_verified ? "✅ Verified" : "❌ No Police Verification"
        r += `🏠 *${t.unit?.unit_number}* (${t.name})\n📜 Expiry: ${t.lease_end || 'Not set'}\n👮 ${status}\n_________________________\n\n`
      })
      return await sendButtons(from, r || "No active tenants.", ["Main Menu"])
    }

    if (listId === 'path_unpaid' || input === 'unpaid bills') {
      const { data: bills } = await supabase.from('utility_bills').select(`balance_due, billing_month, tenant_id`).eq('user_id', profile.id).gt('balance_due', 0).order('billing_month', { ascending: false })
      if (!bills?.length) return await sendButtons(from, "✅ All paid!", ["Main Menu"])
      const { data: tenants } = await supabase.from('tenants').select('id, name, unit:units(unit_number)').in('id', bills.map(b => b.tenant_id))
      const tMap = Object.fromEntries((tenants || []).map(t => [t.id, t.name])); const uMap = Object.fromEntries((tenants || []).map(t => [t.id, t.unit?.unit_number || 'Unit']))
      let r = `🚩 *Outstanding*\n\n`; const grouped = bills.reduce((acc, b) => { (acc[b.billing_month] ||= []).push(b); return acc }, {})
      for (const [month, mBills] of Object.entries(grouped)) { r += `📅 *${month}*\n`; mBills.forEach(b => { r += `▫️ ${uMap[b.tenant_id]} (${tMap[b.tenant_id]}): ₹${fmt(b.balance_due)}\n` }); r += `\n` }
      return await sendButtons(from, r, ["Main Menu", "Record Payment"])
    }

    if (listId === 'path_summary' || input === 'property summary') {
      const { data: props } = await supabase.from('properties').select('name, units').eq('user_id', profile.id)
      return await sendButtons(from, props?.length ? `🏢 *Properties:*\n` + props.map(p => `• ${p.name}: ${p.units}u`).join('\n') : "🏠 No properties.", ["Main Menu"])
    }

    if (listId === 'path_monthly' || input === 'monthly report') {
      const rows = []; for (let i = 0; i < 6; i++) { const d = new Date(); d.setMonth(d.getMonth() - i); rows.push({ id: `report_${d.toISOString().slice(0, 7)}`, title: d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) }) }
      await updateSession(from, { step: 'awaiting_report_month_selection' })
      return await sendListMenu(from, "📅 Monthly Report", "Select month:", "Select", [{ title: "MONTHS", rows }])
    }

    return await sendText(from, "❓ Send *Hi* for menu.")

  } catch (err) {
    console.error('Bot Error:', err)
    return ok()
  }
}

async function generateMonthlyReport(from, profileId, targetMonth) {
  const { data: bills } = await supabase.from('utility_bills').select('*').eq('user_id', profileId).eq('billing_month', targetMonth)
  if (!bills?.length) return await sendButtons(from, `📭 No data.`, ["Main Menu", "Monthly Report"])
  const { data: tenants } = await supabase.from('tenants').select('id, name, unit:units(unit_number)').in('id', bills.map(b => b.tenant_id))
  const tMap = Object.fromEntries((tenants || []).map(t => [t.id, t.name])); const uMap = Object.fromEntries((tenants || []).map(t => [t.id, t.unit?.unit_number || 'Unit']))
  let tb = 0; let tc = 0; let r = `📊 *Report: ${targetMonth}*\n\n`
  bills.forEach(b => { const bld = parseFloat(b.total_amount); const due = parseFloat(b.balance_due); const clc = bld - due; r += `🏠 *${uMap[b.tenant_id]}* (${tMap[b.tenant_id]})\n   Billed: ₹${fmt(bld)} | Col: ₹${fmt(clc)}\n_________________________\n\n`; tb += bld; tc += clc })
  await sendButtons(from, r + `⭐ *BILLED:* ₹${fmt(tb)}\n💰 *COLLECTED:* ₹${fmt(tc)}\n🚩 *PENDING:* ₹${fmt(tb-tc)}`, ["Main Menu", "Monthly Report"])
}

async function generateProfitLossReport(from, profileId, targetMonth) {
  const [{ data: bills }, { data: expenses }] = await Promise.all([
    supabase.from('utility_bills').select('total_amount, balance_due').eq('user_id', profileId).eq('billing_month', targetMonth),
    supabase.from('expenses').select('amount, category').eq('user_id', profileId).filter('expense_date', 'gte', `${targetMonth}-01`).filter('expense_date', 'lte', `${targetMonth}-31`)
  ])

  let collected = 0; let outgoings = 0
  bills?.forEach(b => collected += (parseFloat(b.total_amount) - parseFloat(b.balance_due)))
  expenses?.forEach(e => outgoings += parseFloat(e.amount))

  const r = `📉 *Profit & Loss: ${targetMonth}*\n\n` +
            `💰 *Cash In (Rent/Light):* ₹${fmt(collected)}\n` +
            `💸 *Cash Out (Expenses):* ₹${fmt(outgoings)}\n` +
            `_________________________\n\n` +
            `💎 *NET PROFIT:* ₹${fmt(collected - outgoings)}\n` +
            `_________________________`
  await sendButtons(from, r, ["Main Menu", "Net Profit (P&L)"])
}

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const challenge = searchParams.get('hub.challenge')
  if (searchParams.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN) return new Response(challenge, { status: 200 })
  return new Response('PropManager Bot ONLINE.', { status: 200 })
}
