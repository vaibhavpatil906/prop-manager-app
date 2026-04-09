import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder'
)

// --- CONSTANTS ---
const DEFAULT_WATER_BILL = 140
const ELECTRICITY_RATE = 10
const ELECTRICITY_MIN = 150

// --- WEBHOOK SIGNATURE VERIFICATION ---
function verifyWebhookSignature(rawBody, signature) {
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (!appSecret) return true // skip if not configured
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature || ''))
  } catch { return false }
}

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
  } catch (err) { console.error('WA API Error:', err) }
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
    const rawBody = await req.text()
    const signature = req.headers.get('x-hub-signature-256')
    if (!verifyWebhookSignature(rawBody, signature)) return new Response('Unauthorized', { status: 401 })

    const body = JSON.parse(rawBody)
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
    if (!message) return ok()

    const from = message.from
    const cleanPhone = from.replace(/\D/g, '')

    // 1. Auth check (BOTH numbers)
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .or(`contact_number.ilike.%${cleanPhone}%,additional_number.ilike.%${cleanPhone}%`)
      .single()

    if (!profile) {
      await sendText(from, `⚠️ Unauthorized Number: ${from}. Please register in settings.`)
      return ok()
    }

    const text = (message.text?.body || message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || "").trim()
    const listId = message.interactive?.list_reply?.id
    const input = text.toLowerCase()

    // 2. Priority reset
    if (['hi', 'hello', 'menu', 'start', 'hey', 'reset', 'cancel'].includes(input) || listId === 'nav_main') {
      await clearSession(from)
      await sendListMenu(from, `👋 PropManager Pro`, "What would you like to manage?", "Open Menu", [
        { title: "⚡ RECORD", rows: [{ id: "path_reading", title: "Submit Reading" }, { id: "path_pay_rec", title: "Record Payment" }, { id: "path_expense", title: "Add Expense" }] },
        { title: "📊 REPORTS", rows: [{ id: "path_profit", title: "Net Profit (P&L)" }, { id: "path_monthly", title: "Invoicing Report" }, { id: "path_unpaid", title: "Unpaid Bills" }, { id: "path_vacancy", title: "Vacancy Analysis" }] },
        { title: "🔍 LOOKUP", rows: [{ id: "path_lookup", title: "Get Unit Bill" }, { id: "path_compliance", title: "Compliance Status" }, { id: "path_summary", title: "Property Summary" }] }
      ])
      return ok()
    }

    const session = await getSession(from)

    // 3. Handle Active Session Steps
    if (session) {
      // (Payment, Reading, and Expense steps maintained)
      if (session.step === 'awaiting_payment_tenant_selection') {
        const tenantId = listId?.replace('tenant_', '')
        if (!tenantId) return ok()
        const { data: bills } = await supabase.from('utility_bills').select('id, billing_month, balance_due').eq('tenant_id', tenantId).gt('balance_due', 0).order('billing_month', { ascending: false })
        if (!bills?.length) { await clearSession(from); return await sendButtons(from, "✅ No pending bills.", ["Main Menu"]) }
        await updateSession(from, { step: 'awaiting_bill_selection', tenant_id: tenantId })
        return await sendListMenu(from, `💰 Select Bill`, "Which month?", "Select", [{ title: "PENDING", rows: bills.map(b => ({ id: `bill_${b.id}`, title: `${b.billing_month} (Due: ₹${fmt(b.balance_due)})` })) }])
      }
      if (session.step === 'awaiting_bill_selection') {
        const billId = listId?.replace('bill_', ''); const { data: bill } = await supabase.from('utility_bills').select('*').eq('id', billId).single()
        await updateSession(from, { step: 'awaiting_payment_amount', bill_id: billId, bill_month: bill.billing_month, bill_total: bill.balance_due })
        return await sendText(from, `💸 Pending for *${bill.billing_month}*: ₹${fmt(bill.balance_due)}. How much received?`)
      }
      if (session.step === 'awaiting_payment_amount') {
        const amt = parseFloat(text.replace(/[^\d.]/g, ''))
        if (isNaN(amt) || amt <= 0) return await sendText(from, "❌ Enter a number.")
        await updateSession(from, { step: 'awaiting_payment_method', payment_amt: amt })
        return await sendButtons(from, `💰 Received: ₹${fmt(amt)}\nSelect method:`, ["Cash", "UPI", "Bank Transfer"])
      }
      if (session.step === 'awaiting_payment_method') {
        const { data: bill } = await supabase.from('utility_bills').select('*').eq('id', session.bill_id).single()
        const amt = session.payment_amt || 0; const newBal = Math.max(0, (bill?.balance_due || 0) - amt)
        await supabase.from('payments').insert({ tenant_id: session.tenant_id, bill_id: session.bill_id, amount: amt, status: 'Paid', method: text, payment_date: new Date(), due_date: bill?.due_date })
        await supabase.from('utility_bills').update({ balance_due: newBal }).eq('id', session.bill_id)
        if (newBal > 0) await supabase.from('payments').insert({ tenant_id: session.tenant_id, bill_id: session.bill_id, amount: newBal, status: 'Pending', method: 'Partial Balance', due_date: bill?.due_date })
        await clearSession(from); return await sendButtons(from, `✅ Payment Saved!\n🚩 Remaining: ₹${fmt(newBal)}`, ["Main Menu", "Record Payment"])
      }
      // READING FLOW
      if (session.step === 'awaiting_unit_reading') {
        const { data: unit } = await supabase.from('units').select('id, rent, tenants(id, name)').eq('unit_number', text.toUpperCase()).single()
        if (!unit || !unit.tenants?.[0]) return await sendText(from, `❌ Unit not found.`)
        const { data: last } = await supabase.from('utility_bills').select('curr_reading').eq('tenant_id', unit.tenants[0].id).order('billing_month', { ascending: false }).limit(1).single()
        await updateSession(from, { step: 'awaiting_reading_value', tenant_id: unit.tenants[0].id, tenant_name: unit.tenants[0].name, prev_reading: last?.curr_reading || 0, rent: unit.rent, unit_num: text.toUpperCase() })
        return await sendText(from, `👤 Resident: ${unit.tenants[0].name}. What is current reading?`)
      }
      if (session.step === 'awaiting_reading_value') {
        const curr = parseFloat(text.replace(/[^\d.]/g, ''))
        if (isNaN(curr)) return await sendText(from, "❌ Enter a number.")
        await updateSession(from, { step: 'awaiting_water_value', curr_reading: curr })
        return await sendButtons(from, `📟 Current: ${curr}`, ["Skip (140)", "Enter Custom"])
      }
      if (session.step === 'awaiting_water_value') {
        const water = input.startsWith('skip') ? 140 : parseFloat(text.replace(/[^\d.]/g, ''))
        const elec = Math.max((session.curr_reading - session.prev_reading) * 10, 150)
        const total = parseFloat(session.rent) + elec + water
        const { data: bill } = await supabase.from('utility_bills').upsert({ user_id: profile.id, tenant_id: session.tenant_id, billing_month: new Date().toISOString().slice(0, 7), prev_reading: session.prev_reading, curr_reading: session.curr_reading, rate_per_unit: 10, fixed_rent: session.rent, water_bill: water, total_amount: total, balance_due: total, due_date: new Date(new Date().getFullYear(), new Date().getMonth(), 10).toISOString().split('T')[0] }).select().single()
        if (bill) await supabase.from('payments').insert({ tenant_id: session.tenant_id, bill_id: bill.id, amount: total, status: 'Pending', method: 'Utility Bill', due_date: bill.due_date })
        await clearSession(from); return await sendButtons(from, `✅ Bill Saved! Total: ₹${fmt(total)}`, ["Main Menu", "Submit Reading"])
      }
    }

    // 4. Initial Triggers
    if (listId === 'path_reading' || input === 'submit reading') { await updateSession(from, { step: 'awaiting_unit_reading' }); return await sendText(from, "📝 Unit number? (e.g. G01)") }
    if (listId === 'path_pay_rec' || input === 'record payment') {
      const { data: tenants } = await supabase.from('tenants').select('id, name, unit:units(unit_number)').eq('user_id', profile.id).eq('status', 'Active')
      await updateSession(from, { step: 'awaiting_payment_tenant_selection' })
      return await sendListMenu(from, "💰 Record Payment", "Choose tenant:", "Select", [{ title: "ACTIVE", rows: (tenants || []).map(t => ({ id: `tenant_${t.id}`, title: `${t.unit?.unit_number || 'Unit'} - ${t.name}`.substring(0, 24) })) }])
    }
    if (listId === 'path_unpaid' || input === 'unpaid bills') {
      const { data: bills } = await supabase.from('utility_bills').select(`balance_due, billing_month, tenant_id`).eq('user_id', profile.id).gt('balance_due', 0).order('billing_month', { ascending: false })
      if (!bills?.length) return await sendButtons(from, "✅ All paid!", ["Main Menu"])
      const { data: tenants } = await supabase.from('tenants').select('id, name, unit:units(unit_number)').in('id', bills.map(b => b.tenant_id))
      const tMap = Object.fromEntries((tenants || []).map(t => [t.id, t.name])); const uMap = Object.fromEntries((tenants || []).map(t => [t.id, t.unit?.unit_number || '?']))
      const grouped = bills.reduce((acc, b) => { const key = `${b.billing_month}_${b.tenant_id}`; if (!acc[key]) acc[key] = { m: b.billing_month, tid: b.tenant_id, b: 0 }; acc[key].b += parseFloat(b.balance_due); return acc }, {})
      let r = `🚩 *Outstanding*\n\n`; let gt = 0; const final = Object.values(grouped).reduce((acc, x) => { (acc[x.m] ||= []).push(x); return acc }, {})
      for (const [m, items] of Object.entries(final).sort().reverse()) { r += `📅 *${m}*\n`; items.forEach(x => { r += `▫️ ${uMap[x.tid]} (${tMap[x.tid]}): ₹${fmt(x.b)}\n`; gt += x.b }); r += `\n` }
      return await sendButtons(from, r + `⭐ TOTAL DUE: ₹${fmt(gt)}`, ["Main Menu", "Record Payment"])
    }

    return await sendText(from, "❓ Send *Hi* for menu.")

  } catch (err) { console.error('Bot Error:', err); return ok() }
}

export async function GET(req) { return new Response('Bot ONLINE.', { status: 200 }) }
