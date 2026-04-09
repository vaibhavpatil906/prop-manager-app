import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder'
)

// --- CONFIG ---
const CONFIG = {
  WATER_DEFAULT: 140,
  ELEC_RATE: 10,
  ELEC_MIN: 150
}

// --- WHATSAPP ENGINE ---
async function callWhatsApp(to, messageData) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_ID
  if (!token || !phoneId) return null
  try {
    return await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: "whatsapp", to, ...messageData })
    })
  } catch (err) { return null }
}

const ui = {
  text: async (to, body) => await callWhatsApp(to, { type: "text", text: { body } }),
  buttons: async (to, body, buttons) => await callWhatsApp(to, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body.substring(0, 1024) },
      action: { buttons: buttons.slice(0, 3).map((b, i) => ({ type: "reply", reply: { id: `btn_${i}`, title: b.substring(0, 20) } })) }
    }
  }),
  list: async (to, header, body, button, sections) => await callWhatsApp(to, {
    type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: header.substring(0, 60) },
      body: { text: body.substring(0, 1024) },
      footer: { text: "PropManager Pro" },
      action: { button: button.substring(0, 20), sections }
    }
  })
}

const db = {
  getSession: async (phone) => {
    const { data } = await supabase.from('bot_sessions').select('*').eq('phone', phone).single()
    return data
  },
  updateSession: async (phone, data) => {
    await supabase.from('bot_sessions').upsert({ phone, ...data, updated_at: new Date() })
  },
  clearSession: async (phone) => {
    await supabase.from('bot_sessions').delete().eq('phone', phone)
  },
  fmt: (val) => parseFloat(val || 0).toLocaleString('en-IN')
}

// --- REPORT GENERATORS ---
async function generateMonthlyReport(from, profileId, targetMonth) {
  const { data: bills } = await supabase.from('utility_bills').select('*').eq('user_id', profileId).eq('billing_month', targetMonth)
  if (!bills?.length) return await ui.buttons(from, `📭 No data for ${targetMonth}`, ["Main Menu"])
  
  const { data: tenants } = await supabase.from('tenants').select('id, name, unit:units(unit_number)').in('id', bills.map(b => b.tenant_id))
  const tMap = Object.fromEntries((tenants || []).map(t => [t.id, t.name])); const uMap = Object.fromEntries((tenants || []).map(t => [t.id, t.unit?.unit_number || '?']))
  
  let tb = 0; let tc = 0; let r = `📊 *Report: ${targetMonth}*\n\n`
  bills.forEach(b => { 
    const bld = parseFloat(b.total_amount); const due = parseFloat(b.balance_due); const clc = bld - due
    r += `🏠 *${uMap[b.tenant_id]}* (${tMap[b.tenant_id]})\n   Billed: ₹${db.fmt(bld)} | Col: ₹${db.fmt(clc)}\n_________________________\n\n`
    tb += bld; tc += clc 
  })
  const footer = `⭐ *BILLED:* ₹${db.fmt(tb)}\n💰 *COLLECTED:* ₹${db.fmt(tc)}\n🚩 *PENDING:* ₹${db.fmt(tb-tc)}`
  await ui.buttons(from, r + footer, ["Main Menu"])
}

async function sendMainMenu(to) {
  await ui.list(to, `👋 PropManager Home`, "Select an action:", "Menu", [
    { title: "⚡ RECORD", rows: [
      { id: "path_reading", title: "Submit Reading", description: "Record meter for a unit" },
      { id: "path_payment", title: "Record Payment", description: "Save cash/UPI received" }
    ]},
    { title: "📊 REPORTS", rows: [
      { id: "path_unpaid", title: "Unpaid Bills", description: "Who owes you money?" },
      { id: "path_monthly", title: "Monthly Summary", description: "Total billed vs collected" }
    ]},
    { title: "🔍 LOOKUP", rows: [
      { id: "path_lookup", title: "Get Unit Bill", description: "See history for a resident" },
      { id: "path_summary", title: "Property Status", description: "Occupancy & Income" }
    ]}
  ])
}

// --- MAIN HANDLER ---
export async function POST(req) {
  try {
    const body = await req.json()
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
    if (!message) return NextResponse.json({ ok: true })

    const from = message.from
    const cleanPhone = from.replace(/\D/g, '')

    // 1. Auth
    const { data: profile } = await supabase.from('profiles').select('*').or(`contact_number.ilike.%${cleanPhone}%,additional_number.ilike.%${cleanPhone}%`).single()
    if (!profile) {
      await ui.text(from, `⚠️ Unauthorized: ${from}`)
      return NextResponse.json({ ok: true })
    }

    const rawText = (message.text?.body || message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || "").trim()
    const listId = message.interactive?.list_reply?.id
    const input = rawText.toLowerCase()

    // 2. Global Reset
    if (['hi', 'hello', 'menu', 'reset', 'start', 'hey', 'cancel'].includes(input) || listId === 'nav_main') {
      await db.clearSession(from)
      await sendMainMenu(from)
      return NextResponse.json({ ok: true })
    }

    // 3. ROUTER: INITIAL TRIGGERS
    if (listId === 'path_reading') {
      await db.updateSession(from, { step: 'READ_UNIT' })
      await ui.text(from, "📝 *Submit Reading*\nWhich unit? (e.g. G01)")
      return NextResponse.json({ ok: true })
    }
    if (listId === 'path_payment') {
      const { data: tenants } = await supabase.from('tenants').select('id, name, unit:units(unit_number)').eq('user_id', profile.id).eq('status', 'Active')
      if (!tenants?.length) return await ui.text(from, "🏠 No active residents found.")
      await db.updateSession(from, { step: 'PAY_TENANT' })
      return await ui.list(from, "💰 Record Payment", "Choose tenant:", "Select", [{ title: "RESIDENTS", rows: tenants.map(t => ({ id: `t_${t.id}`, title: `${t.unit?.unit_number || '?'} - ${t.name}`.substring(0, 24) })) }])
    }
    if (listId === 'path_lookup') {
      const { data: tenants } = await supabase.from('tenants').select('id, name, unit:units(unit_number)').eq('user_id', profile.id).eq('status', 'Active')
      await db.updateSession(from, { step: 'LOOKUP_TENANT' })
      return await ui.list(from, "🔍 Get Unit Bill", "Choose resident:", "Select", [{ title: "RESIDENTS", rows: (tenants || []).map(t => ({ id: `t_${t.id}`, title: `${t.unit?.unit_number || '?'} - ${t.name}`.substring(0, 24) })) }])
    }
    if (listId === 'path_unpaid') {
      const { data: bills } = await supabase.from('utility_bills').select(`balance_due, billing_month, tenant_id`).eq('user_id', profile.id).gt('balance_due', 0).order('billing_month', { ascending: false })
      if (!bills?.length) return await ui.buttons(from, "✅ All bills are fully paid!", ["Main Menu"])
      const { data: tenants } = await supabase.from('tenants').select('id, name, unit:units(unit_number)').in('id', bills.map(b => b.tenant_id))
      const tMap = Object.fromEntries((tenants || []).map(t => [t.id, t.name])); const uMap = Object.fromEntries((tenants || []).map(t => [t.id, t.unit?.unit_number || '?']))
      let r = `🚩 *Outstanding Bills*\n\n`; const grouped = bills.reduce((acc, b) => { (acc[b.billing_month] ||= []).push(b); return acc }, {})
      for (const [month, mBills] of Object.entries(grouped)) { r += `📅 *${month}*\n`; mBills.forEach(b => { r += `▫️ ${uMap[b.tenant_id]} (${tMap[b.tenant_id]}): ₹${db.fmt(b.balance_due)}\n` }); r += `\n` }
      return await ui.buttons(from, r, ["Main Menu"])
    }
    if (listId === 'path_summary') {
      const { data: props } = await supabase.from('properties').select('name, units').eq('user_id', profile.id)
      let r = `🏢 *Property Summary*\n\n` + (props?.length ? props.map(p => `• ${p.name}: ${p.units} units`).join('\n') : "No properties found.")
      return await ui.buttons(from, r, ["Main Menu"])
    }
    if (listId === 'path_monthly') {
      const rows = []; for (let i = 0; i < 6; i++) { const d = new Date(); d.setMonth(d.getMonth() - i); rows.push({ id: `rep_${d.toISOString().slice(0, 7)}`, title: d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) }) }
      await db.updateSession(from, { step: 'REP_MONTH' })
      return await ui.list(from, "📅 Monthly Summary", "Select month:", "Select", [{ title: "MONTHS", rows }])
    }

    // 4. ROUTER: SESSION STEPS
    const session = await db.getSession(from)
    if (session) {
      if (session.step === 'PAY_TENANT') {
        const tId = listId?.replace('t_', '')
        const { data: bills } = await supabase.from('utility_bills').select('id, billing_month, balance_due').eq('tenant_id', tId).gt('balance_due', 0).order('billing_month', { ascending: false })
        if (!bills?.length) { await db.clearSession(from); return await ui.buttons(from, "✅ No pending bills.", ["Main Menu"]) }
        await db.updateSession(from, { step: 'PAY_BILL', tenant_id: tId })
        return await ui.list(from, `💰 Select Month`, "Choose month:", "Select", [{ title: "PENDING", rows: bills.map(b => ({ id: `b_${b.id}`, title: `${b.billing_month} (Due: ₹${db.fmt(b.balance_due)})` })) }])
      }
      if (session.step === 'PAY_BILL') {
        const bId = listId?.replace('b_', ''); const { data: bill } = await supabase.from('utility_bills').select('*').eq('id', bId).single()
        await db.updateSession(from, { step: 'PAY_AMOUNT', bill_id: bId, bill_month: bill.billing_month })
        return await ui.text(from, `💸 Pending for *${bill.billing_month}*: ₹${db.fmt(bill.balance_due)}\n\nHow much received?`)
      }
      if (session.step === 'PAY_AMOUNT') {
        const amt = parseFloat(rawText.replace(/[^\d.]/g, ''))
        if (isNaN(amt) || amt <= 0) return await ui.text(from, "❌ Enter a number.")
        await db.updateSession(from, { step: 'PAY_METHOD', payment_amt: amt })
        return await ui.buttons(from, `💰 Amount: ₹${db.fmt(amt)}\nMethod:`, ["Cash", "UPI", "Bank Transfer"])
      }
      if (session.step === 'PAY_METHOD') {
        const { data: bill } = await supabase.from('utility_bills').select('*').eq('id', session.bill_id).single()
        const newBal = Math.max(0, (bill?.balance_due || 0) - session.payment_amt)
        await supabase.from('payments').insert({ tenant_id: session.tenant_id, bill_id: session.bill_id, amount: session.payment_amt, status: 'Paid', method: rawText, payment_date: new Date(), due_date: bill?.due_date })
        await supabase.from('utility_bills').update({ balance_due: newBal }).eq('id', session.bill_id)
        if (newBal > 0) await supabase.from('payments').insert({ tenant_id: session.tenant_id, bill_id: session.bill_id, amount: newBal, status: 'Pending', method: 'Partial Balance', due_date: bill?.due_date })
        await db.clearSession(from); return await ui.buttons(from, `✅ Payment Recorded!\n🚩 Remaining: ₹${db.fmt(newBal)}`, ["Main Menu"])
      }
      if (session.step === 'READ_UNIT') {
        const { data: unit } = await supabase.from('units').select('id, rent, tenants(id, name)').eq('unit_number', rawText.toUpperCase()).single()
        if (!unit || !unit.tenants?.[0]) return await ui.text(from, "❌ Unit not found.")
        const { data: last } = await supabase.from('utility_bills').select('curr_reading').eq('tenant_id', unit.tenants[0].id).order('billing_month', { ascending: false }).limit(1).single()
        await db.updateSession(from, { step: 'READ_VALUE', tenant_id: unit.tenants[0].id, tenant_name: unit.tenants[0].name, prev_reading: last?.curr_reading || 0, rent: unit.rent, unit_num: rawText.toUpperCase() })
        return await ui.text(from, `👤 Resident: ${unit.tenants[0].name}. What is current reading?`)
      }
      if (session.step === 'READ_VALUE') {
        const curr = parseFloat(rawText.replace(/[^\d.]/g, ''))
        if (isNaN(curr)) return await ui.text(from, "❌ Enter a number.")
        await db.updateSession(from, { step: 'READ_WATER', curr_reading: curr })
        return await ui.buttons(from, `📟 Current: ${curr}`, ["Skip (140)", "Enter Custom"])
      }
      if (session.step === 'READ_WATER') {
        if (input === 'enter custom') return await ui.text(from, "Type water amount:")
        const water = input.startsWith('skip') ? CONFIG.WATER_DEFAULT : parseFloat(rawText.replace(/[^\d.]/g, ''))
        const elec = Math.max((session.curr_reading - session.prev_reading) * CONFIG.ELEC_RATE, CONFIG.ELEC_MIN)
        const total = parseFloat(session.rent) + elec + water
        const { data: bill } = await supabase.from('utility_bills').upsert({ user_id: profile.id, tenant_id: session.tenant_id, billing_month: new Date().toISOString().slice(0, 7), prev_reading: session.prev_reading, curr_reading: session.curr_reading, rate_per_unit: CONFIG.ELEC_RATE, fixed_rent: session.rent, water_bill: water, total_amount: total, balance_due: total, due_date: new Date(new Date().getFullYear(), new Date().getMonth(), 10).toISOString().split('T')[0] }).select().single()
        if (bill) await supabase.from('payments').insert({ tenant_id: session.tenant_id, bill_id: bill.id, amount: total, status: 'Pending', method: 'Utility Bill', due_date: bill.due_date })
        await db.clearSession(from); return await ui.buttons(from, `✅ Bill Saved! Total: ₹${db.fmt(total)}`, ["Main Menu"])
      }
      if (session.step === 'LOOKUP_TENANT') {
        const tId = listId?.replace('t_', ''); const { data: bills } = await supabase.from('utility_bills').select('*').eq('tenant_id', tId).order('billing_month', { ascending: false }).limit(3)
        if (!bills?.length) { await db.clearSession(from); return await ui.buttons(from, "📭 No history found.", ["Main Menu"]) }
        let r = `🧾 *History*\n\n`; bills.forEach(b => { r += `📅 *${b.billing_month}*\n💰 Total: ₹${db.fmt(b.total_amount)}\n🚩 Due: ₹${db.fmt(b.balance_due)}\n\n` })
        await db.clearSession(from); return await ui.buttons(from, r, ["Main Menu"])
      }
      if (session.step === 'REP_MONTH') {
        const m = listId?.replace('rep_', '')
        await db.clearSession(from)
        await generateMonthlyReport(from, profile.id, m)
        return NextResponse.json({ ok: true })
      }
    }

    // 5. FALLBACK
    return await ui.text(from, "❓ Send *Hi* or *Menu* to start.")

  } catch (err) { return NextResponse.json({ ok: true }) }
}

export async function GET(req) { return new Response('Bot ONLINE.', { status: 200 }) }
