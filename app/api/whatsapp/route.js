import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder'
)

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
    footer: { text: "PropManager" },
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
      await sendText(from, `⚠️ Unauthorized Number: ${from}. Please register in settings.`)
      return ok()
    }

    const text = (message.text?.body || message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || "").trim()
    const listId = message.interactive?.list_reply?.id
    const input = text.toLowerCase()

    // 2. Priority Trigger: Main Menu & Reset
    if (['hi', 'hello', 'menu', 'start', 'hey', 'cancel', 'reset'].includes(input) || listId === 'nav_main') {
      await clearSession(from)
      await sendListMenu(from, `👋 PropManager Home`, "Select an action:", "Menu", [
        { title: "⚡ RECORD", rows: [
          { id: "path_reading", title: "Submit Reading" },
          { id: "path_pay_rec", title: "Record Payment" }
        ]},
        { title: "📊 REPORTS", rows: [{ id: "path_monthly", title: "Monthly Report" }, { id: "path_unpaid", title: "Unpaid Bills" }] },
        { title: "🔍 LOOKUP", rows: [{ id: "path_lookup", title: "Get Unit Bill" }, { id: "path_summary", title: "Property Summary" }] }
      ])
      return ok()
    }

    // 3. Priority Trigger: Initial Path Triggers (Check these BEFORE session steps to avoid "Bill Not Found")
    if (listId === 'path_reading' || input === 'submit reading') {
      await updateSession(from, { step: 'awaiting_unit_reading' })
      await sendText(from, "📝 Which Unit? (e.g. G01)")
      return ok()
    }

    if (listId === 'path_pay_rec' || input === 'record payment') {
      const { data: tenants } = await supabase.from('tenants').select('id, name, unit:units(unit_number)').eq('user_id', profile.id).eq('status', 'Active')
      if (!tenants?.length) { await sendText(from, "🏠 No active residents."); return ok() }
      await updateSession(from, { step: 'awaiting_payment_tenant_selection' })
      await sendListMenu(from, "💰 Record Payment", "Choose tenant:", "Select", [{ title: "ACTIVE", rows: tenants.map(t => ({ id: `tenant_${t.id}`, title: `${t.unit?.unit_number || 'Unit'} - ${t.name}`.substring(0, 24) })) }])
      return ok()
    }
    
    if (listId === 'path_lookup' || input === 'get unit bill') {
      const { data: tenants } = await supabase.from('tenants').select('id, name, unit:units(unit_number)').eq('user_id', profile.id).eq('status', 'Active')
      if (!tenants?.length) { await sendText(from, "🏠 No active residents."); return ok() }
      await updateSession(from, { step: 'awaiting_tenant_selection' })
      await sendListMenu(from, "🔍 Select Tenant", "Choose tenant:", "Select", [{ title: "ACTIVE", rows: tenants.map(t => ({ id: `tenant_${t.id}`, title: `${t.unit?.unit_number || 'Unit'} - ${t.name}`.substring(0, 24) })) }])
      return ok()
    }

    if (listId === 'path_unpaid' || input === 'unpaid bills') {
      const { data: bills } = await supabase.from('utility_bills').select(`total_amount, balance_due, billing_month, tenant_id`).eq('user_id', profile.id).gt('balance_due', 0).order('billing_month', { ascending: false })
      if (!bills?.length) { await sendButtons(from, "✅ All paid!", ["Main Menu"]); return ok() }
      const { data: tenants } = await supabase.from('tenants').select('id, name, unit:units(unit_number)').in('id', bills.map(b => b.tenant_id))
      const tMap = Object.fromEntries((tenants || []).map(t => [t.id, t.name])); const uMap = Object.fromEntries((tenants || []).map(t => [t.id, t.unit?.unit_number || 'Unit']))
      let r = `🚩 *Outstanding*\n\n`; const grouped = bills.reduce((acc, b) => { (acc[b.billing_month] ||= []).push(b); return acc }, {})
      for (const [month, mBills] of Object.entries(grouped)) { r += `📅 *${month}*\n`; mBills.forEach(b => { r += `▫️ ${uMap[b.tenant_id]} (${tMap[b.tenant_id]}): ₹${fmt(b.balance_due)}\n` }); r += `\n` }
      await sendButtons(from, r, ["Main Menu", "Record Payment"])
      return ok()
    }

    if (listId === 'path_summary' || input === 'property summary') {
      const { data: props } = await supabase.from('properties').select('name, units').eq('user_id', profile.id)
      await sendButtons(from, props?.length ? `🏢 *Properties:*\n` + props.map(p => `• ${p.name}: ${p.units}u`).join('\n') : "🏠 No properties.", ["Main Menu"])
      return ok()
    }

    if (listId === 'path_monthly' || input === 'monthly report') {
      const rows = []; for (let i = 0; i < 6; i++) { const d = new Date(); d.setMonth(d.getMonth() - i); rows.push({ id: `report_${d.toISOString().slice(0, 7)}`, title: d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) }) }
      await updateSession(from, { step: 'awaiting_report_month_selection' })
      await sendListMenu(from, "📅 Monthly Report", "Select month:", "Select", [{ title: "MONTHS", rows }])
      return ok()
    }

    // 4. Handle Ongoing Session Steps
    const session = await getSession(from)
    if (session) {
      // --- PAYMENT FLOW ---
      if (session.step === 'awaiting_payment_tenant_selection') {
        const tenantId = listId?.replace('tenant_', '')
        if (!tenantId) return ok()
        const { data: tenant } = await supabase.from('tenants').select('name, unit:units(unit_number)').eq('id', tenantId).single()
        const { data: bills } = await supabase.from('utility_bills').select('id, billing_month, balance_due').eq('tenant_id', tenantId).gt('balance_due', 0).order('billing_month', { ascending: false })
        const tName = tenant?.name || "Resident"
        if (!bills?.length) { await clearSession(from); await sendButtons(from, `✅ *${tName}* has no pending bills.`, ["Main Menu"]); return ok() }
        await updateSession(from, { step: 'awaiting_bill_selection', tenant_id: tenantId, tenant_name: tName, unit_num: tenant?.unit?.unit_number })
        await sendListMenu(from, `💰 Select Bill`, `Pending for ${tName}:`, "Select", [{ title: "PENDING", rows: bills.map(b => ({ id: `bill_${b.id}`, title: `${b.billing_month} (Due: ₹${fmt(b.balance_due)})` })) }])
        return ok()
      }

      if (session.step === 'awaiting_bill_selection') {
        const billId = listId?.replace('bill_', '')
        if (!billId) return ok()
        const { data: bill } = await supabase.from('utility_bills').select('*').eq('id', billId).single()
        if (!bill) { await sendText(from, "❌ Bill not found."); return ok() }
        await updateSession(from, { step: 'awaiting_payment_amount', bill_id: billId, bill_month: bill.billing_month, bill_total: bill.balance_due })
        await sendText(from, `💸 Pending for *${bill.billing_month}*: ₹${fmt(bill.balance_due)}. How much received?`)
        return ok()
      }

      if (session.step === 'awaiting_payment_amount') {
        const amt = parseFloat(text.replace(/[^\d.]/g, ''))
        if (isNaN(amt) || amt <= 0) { await sendText(from, "❌ Enter a valid number."); return ok() }
        await updateSession(from, { step: 'awaiting_payment_method', payment_amt: amt })
        await sendButtons(from, `💰 Received: ₹${fmt(amt)}\n\nSelect method:`, ["Cash", "UPI", "Bank Transfer"])
        return ok()
      }

      if (session.step === 'awaiting_payment_method') {
        const amt = session.payment_amt || 0; const method = text
        const { data: bill } = await supabase.from('utility_bills').select('*').eq('id', session.bill_id).single()
        if (!bill) { await sendText(from, "❌ Session expired."); return ok() }
        const newBal = Math.max(0, (bill.balance_due || 0) - amt)
        const { data: pendPay } = await supabase.from('payments').select('id').eq('bill_id', session.bill_id).eq('status', 'Pending').limit(1).single()
        if (pendPay) await supabase.from('payments').update({ amount: amt, status: 'Paid', method, payment_date: new Date(), paid_date: new Date().toISOString().split('T')[0] }).eq('id', pendPay.id)
        else await supabase.from('payments').insert({ tenant_id: session.tenant_id, bill_id: session.bill_id, amount: amt, status: 'Paid', method, payment_date: new Date(), paid_date: new Date().toISOString().split('T')[0], due_date: bill.due_date })
        await supabase.from('utility_bills').update({ balance_due: newBal }).eq('id', session.bill_id)
        if (newBal > 0) await supabase.from('payments').insert({ tenant_id: session.tenant_id, bill_id: session.bill_id, amount: newBal, status: 'Pending', method: 'Partial Balance', due_date: bill.due_date })
        await clearSession(from)
        await sendButtons(from, `✅ *Payment Recorded*\n👤 *Resident:* ${session.tenant_name}\n🚩 *Remaining:* ₹${fmt(newBal)}`, ["Main Menu", "Record Payment"])
        return ok()
      }

      // --- READING FLOW ---
      if (session.step === 'awaiting_unit_reading') {
        const { data: unit } = await supabase.from('units').select('id, rent, tenants(id, name)').eq('unit_number', text.toUpperCase()).single()
        if (!unit || !unit.tenants?.[0]) { await sendText(from, `❌ Unit not found.`); return ok() }
        const { data: last } = await supabase.from('utility_bills').select('curr_reading').eq('tenant_id', unit.tenants[0].id).order('billing_month', { ascending: false }).limit(1).single()
        await updateSession(from, { step: 'awaiting_reading_value', tenant_id: unit.tenants[0].id, tenant_name: unit.tenants[0].name, prev_reading: last?.curr_reading || 0, rent: unit.rent, unit_num: text.toUpperCase() })
        await sendText(from, `👤 *Resident:* ${unit.tenants[0].name}\n📟 *Previous:* ${last?.curr_reading || 0}\n\nWhat is current reading?`)
        return ok()
      }

      if (session.step === 'awaiting_reading_value') {
        const curr = parseFloat(text.replace(/[^\d.]/g, ''))
        if (isNaN(curr)) { await sendText(from, "❌ Enter a number."); return ok() }
        await updateSession(from, { step: 'awaiting_water_value', curr_reading: curr })
        await sendButtons(from, `📟 *Current:* ${curr}\n\nWhat is the Water Bill?`, ["Skip (140)", "Enter Custom"])
        return ok()
      }

      if (session.step === 'awaiting_water_value') {
        if (input === 'enter custom') { await sendText(from, "Type water amount:"); return ok() }
        const water = input.startsWith('skip') ? 140 : parseFloat(text.replace(/[^\d.]/g, ''))
        const elec = Math.max((session.curr_reading - session.prev_reading) * 10, 150)
        const total = parseFloat(session.rent) + elec + water
        const { data: bill } = await supabase.from('utility_bills').upsert({ user_id: profile.id, tenant_id: session.tenant_id, billing_month: new Date().toISOString().slice(0, 7), prev_reading: session.prev_reading, curr_reading: session.curr_reading, rate_per_unit: 10, fixed_rent: session.rent, water_bill: water, total_amount: total, balance_due: total, due_date: new Date(new Date().getFullYear(), new Date().getMonth(), 10).toISOString().split('T')[0] }).select().single()
        if (bill) await supabase.from('payments').insert({ tenant_id: session.tenant_id, bill_id: bill.id, amount: total, status: 'Pending', method: 'Utility Bill', due_date: bill.due_date })
        await clearSession(from); await sendButtons(from, `✅ *Bill Saved*\n💰 Total: ₹${fmt(total)}`, ["Main Menu", "Submit Reading"]); return ok()
      }

      if (session.step === 'awaiting_tenant_selection') {
        const tenantId = listId?.replace('tenant_', '')
        const { data: bills } = await supabase.from('utility_bills').select('billing_month').eq('tenant_id', tenantId).order('billing_month', { ascending: false }).limit(5)
        if (!bills?.length) { await clearSession(from); await sendButtons(from, "📭 No history.", ["Main Menu"]); return ok() }
        await updateSession(from, { step: 'awaiting_month_selection', tenant_id: tenantId })
        await sendListMenu(from, "📅 Select Month", "Choose:", "Select", [{ title: "MONTHS", rows: bills.map(b => ({ id: `month_${b.billing_month}`, title: b.billing_month })) }])
        return ok()
      }

      if (session.step === 'awaiting_month_selection') {
        const month = listId?.replace('month_', '')
        const { data: bill } = await supabase.from('utility_bills').select('*').eq('tenant_id', session.tenant_id).eq('billing_month', month).single()
        if (bill) {
          const detail = `🧾 *Bill Breakdown (${month})*\n\n🏠 *Rent:* ₹${fmt(bill.fixed_rent)}\n⚡ *Elec:* ₹${fmt(Math.max((bill.curr_reading - bill.prev_reading) * 10, 150))}\n💧 *Water:* ₹${fmt(bill.water_bill)}\n💰 *TOTAL: ₹${fmt(bill.total_amount)}*`
          await clearSession(from); await sendButtons(from, detail, ["Main Menu", "Get Unit Bill"]); return ok()
        }
      }

      if (session.step === 'awaiting_report_month_selection') {
        await generateMonthlyReport(from, profile.id, listId?.replace('report_', ''))
        await clearSession(from); return ok()
      }
    }

    // 5. Final Fallback (If nothing else matched)
    await sendText(from, "❓ Send *Hi* for menu.")
    return ok()

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

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const challenge = searchParams.get('hub.challenge')
  if (searchParams.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN) return new Response(challenge, { status: 200 })
  return new Response('PropManager Bot ONLINE.', { status: 200 })
}
