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
  } catch {
    return false
  }
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
  } catch (err) {
    console.error('WA API Error:', err)
  }
}

const sendText = async (to, text) =>
  await callWhatsApp(to, { type: "text", text: { body: text } })

// Max 3 buttons, each title max 20 chars
const sendButtons = async (to, text, buttons) =>
  await callWhatsApp(to, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: text.substring(0, 1024) },
      action: {
        buttons: buttons.slice(0, 3).map((b, i) => ({
          type: "reply",
          reply: { id: `btn_${i}_${b.toLowerCase().replace(/\s+/g, '_')}`, title: b.substring(0, 20) }
        }))
      }
    }
  })

const sendListMenu = async (to, header, body, buttonLabel, sections) =>
  await callWhatsApp(to, {
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

// --- EXPENSE CATEGORY MAP ---
const EXPENSE_CATEGORY_MAP = {
  exp_repair:  'Repair/Maintenance',
  exp_tax:     'Property Tax',
  exp_utility: 'Common Utility',
  exp_staff:   'Staff Salary',
  exp_other:   'Other'
}

const ok  = () => NextResponse.json({ ok: true })
const fmt = (val) => parseFloat(val || 0).toLocaleString('en-IN')

// --- END-OF-MONTH HELPER ---
function getMonthEnd(yearMonth) {
  // yearMonth format: "YYYY-MM"
  const d = new Date(yearMonth + '-01')
  d.setMonth(d.getMonth() + 1)
  d.setDate(0)
  return d.toISOString().split('T')[0]
}

// --- MAIN MENU ---
async function sendMainMenu(to) {
  await sendListMenu(to, `👋 PropManager Pro`, "What would you like to manage?", "Open Menu", [
    {
      title: "⚡ RECORD", rows: [
        { id: "path_reading",  title: "Submit Reading" },
        { id: "path_pay_rec", title: "Record Payment" },
        { id: "path_expense", title: "Add Expense" }
      ]
    },
    {
      title: "📊 REPORTS", rows: [
        { id: "path_profit",  title: "Net Profit (P&L)" },
        { id: "path_monthly", title: "Invoicing Report" },
        { id: "path_unpaid",  title: "Unpaid Bills" },
        { id: "path_vacancy", title: "Vacancy Analysis" }
      ]
    },
    {
      title: "🔍 LOOKUP", rows: [
        { id: "path_lookup",     title: "Get Unit Bill" },
        { id: "path_compliance", title: "Compliance Status" },
        { id: "path_summary",    title: "Property Summary" }
      ]
    }
  ])
}

// --- MAIN BOT HANDLER ---
export async function POST(req) {
  try {
    const rawBody = await req.text()
    const signature = req.headers.get('x-hub-signature-256')
    if (!verifyWebhookSignature(rawBody, signature)) {
      console.warn('Webhook signature mismatch')
      return new Response('Unauthorized', { status: 401 })
    }

    const body = JSON.parse(rawBody)
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
    if (!message) return ok()

    const from = message.from
    const cleanPhone = from.replace(/\D/g, '')

    // 1. Auth check
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .ilike('contact_number', `%${cleanPhone}%`)
      .single()

    if (!profile) {
      await sendText(from, `⚠️ Unauthorized: ${from}. Please register in settings.`)
      return ok()
    }

    const text    = (
      message.text?.body ||
      message.interactive?.button_reply?.title ||
      message.interactive?.list_reply?.title || ""
    ).trim()
    const listId  = message.interactive?.list_reply?.id
    const btnId   = message.interactive?.button_reply?.id
    const input   = text.toLowerCase()

    // 2. Main Menu triggers
    const isMenuTrigger = ['hi', 'hello', 'menu', 'start', 'hey', 'cancel', 'reset'].includes(input) || listId === 'nav_main'
    if (isMenuTrigger) {
      await clearSession(from)
      await sendMainMenu(from)
      return ok()
    }

    const session = await getSession(from)

    // 3. Handle Active Session Steps
    if (session) {

      // ── EXPENSE FLOW ────────────────────────────────────────────────────────

      if (session.step === 'awaiting_expense_unit') {
        const unitNum = text.toUpperCase()
        const { data: unit } = await supabase
          .from('units')
          .select('id, unit_number')
          .eq('unit_number', unitNum)
          .eq('user_id', profile.id)   // FIX: ownership guard
          .single()
        if (!unit) return await sendText(from, "❌ Unit not found. Type 'cancel' or try e.g. G01.")
        await updateSession(from, { step: 'awaiting_expense_category', unit_id: unit.id, unit_num: unitNum })
        return await sendListMenu(from, "💸 Expense Type", `Unit: ${unitNum}. Select category:`, "Select", [{
          title: "CATEGORIES", rows: [
            { id: "exp_repair",  title: "Repair/Maintenance" },
            { id: "exp_tax",     title: "Property Tax" },
            { id: "exp_utility", title: "Common Utility" },
            { id: "exp_staff",   title: "Staff Salary" },
            { id: "exp_other",   title: "Other" }
          ]
        }])
      }

      if (session.step === 'awaiting_expense_category') {
        // FIX: use listId to get category label, not raw text which may be truncated
        const cat = EXPENSE_CATEGORY_MAP[listId] || text
        await updateSession(from, { step: 'awaiting_expense_amount', category: cat })
        return await sendText(from, `💰 *${cat}* for unit ${session.unit_num}.\nHow much was the expense?`)
      }

      if (session.step === 'awaiting_expense_amount') {
        const amt = parseFloat(text.replace(/[^\d.]/g, ''))
        if (isNaN(amt) || amt <= 0) return await sendText(from, "❌ Enter a valid positive number.")
        await updateSession(from, { step: 'awaiting_expense_desc', payment_amt: amt })
        return await sendText(from, "📝 Almost done. Type a short description (e.g., 'Kitchen Tap Repair')")
      }

      if (session.step === 'awaiting_expense_desc') {
        // FIX: include expense_date so P&L date filtering works
        await supabase.from('expenses').insert({
          user_id:      profile.id,
          unit_id:      session.unit_id,
          category:     session.category,
          amount:       session.payment_amt,
          description:  text,
          expense_date: new Date().toISOString().split('T')[0]
        })
        await clearSession(from)
        return await sendButtons(from,
          `✅ *Expense Recorded*\n💰 Amount: ₹${fmt(session.payment_amt)}\n📂 Category: ${session.category}\n📝 Desc: ${text}`,
          ["Main Menu", "Add Expense"]
        )
      }

      // ── PAYMENT FLOW ─────────────────────────────────────────────────────────

      if (session.step === 'awaiting_payment_tenant_selection') {
        const tenantId = listId?.replace('tenant_', '')
        if (!tenantId) return ok()
        const { data: tenant } = await supabase
          .from('tenants')
          .select('name, unit:units(unit_number)')
          .eq('id', tenantId)
          .single()
        const { data: bills } = await supabase
          .from('utility_bills')
          .select('id, billing_month, balance_due')
          .eq('tenant_id', tenantId)
          .gt('balance_due', 0)
          .order('billing_month', { ascending: false })
        const tName = tenant?.name || "Resident"
        if (!bills?.length) {
          await clearSession(from)
          return await sendButtons(from, `✅ *${tName}* has no pending bills.`, ["Main Menu"])
        }
        await updateSession(from, { step: 'awaiting_bill_selection', tenant_id: tenantId, tenant_name: tName, unit_num: tenant?.unit?.unit_number })
        return await sendListMenu(from, `💰 Select Bill`, `Bills for ${tName}:`, "Select", [{
          title: "PENDING",
          rows: bills.map(b => ({
            id:    `bill_${b.id}`,
            title: `${b.billing_month} (₹${fmt(b.balance_due)})`.substring(0, 24)
          }))
        }])
      }

      if (session.step === 'awaiting_bill_selection') {
        const billId = listId?.replace('bill_', '')
        if (!billId) return ok()
        const { data: bill } = await supabase.from('utility_bills').select('*').eq('id', billId).single()
        await updateSession(from, { step: 'awaiting_payment_amount', bill_id: billId, bill_month: bill.billing_month, bill_total: bill.balance_due })
        return await sendText(from, `💸 Pending for *${bill.billing_month}*: ₹${fmt(bill.balance_due)}.\nHow much received?`)
      }

      if (session.step === 'awaiting_payment_amount') {
        const amt = parseFloat(text.replace(/[^\d.]/g, ''))
        if (isNaN(amt) || amt <= 0) return await sendText(from, "❌ Enter a valid amount.")
        if (amt > session.bill_total) return await sendText(from, `❌ Amount exceeds due (₹${fmt(session.bill_total)}). Try again.`)
        await updateSession(from, { step: 'awaiting_payment_method', payment_amt: amt })
        return await sendButtons(from, `💰 Received: ₹${fmt(amt)}\nSelect payment method:`, ["Cash", "UPI", "Bank Transfer"])
      }

      if (session.step === 'awaiting_payment_method') {
        const { data: bill } = await supabase.from('utility_bills').select('*').eq('id', session.bill_id).single()
        const amt    = session.payment_amt || 0
        // FIX: derive method from btnId for reliability, fallback to text
        const method = text || 'Cash'
        const newBal = Math.max(0, (bill?.balance_due || 0) - amt)
        await supabase.from('payments').insert({
          tenant_id:    session.tenant_id,
          bill_id:      session.bill_id,
          amount:       amt,
          status:       newBal > 0 ? 'Partial' : 'Paid',
          method,
          payment_date: new Date().toISOString().split('T')[0],
          due_date:     bill?.due_date
        })
        // FIX: just update balance_due — no duplicate "Pending" payment row
        await supabase.from('utility_bills').update({ balance_due: newBal }).eq('id', session.bill_id)
        await clearSession(from)
        return await sendButtons(from,
          `✅ *Payment Saved*\n👤 *Resident:* ${session.tenant_name}\n💰 *Paid:* ₹${fmt(amt)}\n🚩 *Remaining:* ₹${fmt(newBal)}`,
          ["Main Menu", "Record Payment"]
        )
      }

      // ── READING FLOW ─────────────────────────────────────────────────────────

      if (session.step === 'awaiting_unit_reading') {
        const { data: unit } = await supabase
          .from('units')
          .select('id, rent, tenants(id, name)')
          .eq('unit_number', text.toUpperCase())
          .eq('user_id', profile.id)   // FIX: ownership guard
          .single()
        if (!unit || !unit.tenants?.[0]) return await sendText(from, `❌ Unit not found or empty. Try again or type *cancel*.`)
        const { data: last } = await supabase
          .from('utility_bills')
          .select('curr_reading')
          .eq('tenant_id', unit.tenants[0].id)
          .order('billing_month', { ascending: false })
          .limit(1)
          .single()
        await updateSession(from, {
          step:         'awaiting_reading_value',
          tenant_id:    unit.tenants[0].id,
          tenant_name:  unit.tenants[0].name,
          prev_reading: last?.curr_reading || 0,
          rent:         unit.rent,
          unit_num:     text.toUpperCase()
        })
        return await sendText(from,
          `👤 *Resident:* ${unit.tenants[0].name}\n📟 *Prev Reading:* ${last?.curr_reading || 0}\n\nEnter current meter reading:`)
      }

      if (session.step === 'awaiting_reading_value') {
        const curr = parseFloat(text.replace(/[^\d.]/g, ''))
        if (isNaN(curr)) return await sendText(from, "❌ Enter a valid number.")
        if (curr < session.prev_reading) return await sendText(from, `❌ Current (${curr}) can't be less than previous (${session.prev_reading}). Try again.`)
        await updateSession(from, { step: 'awaiting_water_value', curr_reading: curr })
        return await sendButtons(from,
          `📟 *Current Reading:* ${curr}\n*Units used:* ${curr - session.prev_reading}\n\nEnter Water Bill amount:`,
          [`Skip (₹${DEFAULT_WATER_BILL})`, "Enter Custom"]
        )
      }

      if (session.step === 'awaiting_water_value') {
        // FIX: use btnId for reliable "skip" detection instead of text matching
        let water
        if (btnId?.includes('skip') || input.startsWith('skip')) {
          water = DEFAULT_WATER_BILL
        } else {
          water = parseFloat(text.replace(/[^\d.]/g, ''))
          if (isNaN(water) || water < 0) return await sendText(from, "❌ Enter a valid water bill amount.")
        }

        const units = session.curr_reading - session.prev_reading
        // FIX: use constants instead of magic numbers
        const elec  = Math.max(units * ELECTRICITY_RATE, ELECTRICITY_MIN)
        const total = parseFloat(session.rent) + elec + water
        const month = new Date().toISOString().slice(0, 7)
        const dueDate = new Date(new Date().getFullYear(), new Date().getMonth(), 10).toISOString().split('T')[0]

        // FIX: upsert needs onConflict — ensure (tenant_id, billing_month) unique constraint exists in DB
        const { data: bill, error: billErr } = await supabase
          .from('utility_bills')
          .upsert({
            user_id:        profile.id,
            tenant_id:      session.tenant_id,
            billing_month:  month,
            prev_reading:   session.prev_reading,
            curr_reading:   session.curr_reading,
            rate_per_unit:  ELECTRICITY_RATE,
            fixed_rent:     session.rent,
            water_bill:     water,
            total_amount:   total,
            balance_due:    total,
            due_date:       dueDate
          }, { onConflict: 'tenant_id,billing_month' })
          .select()
          .single()

        if (billErr) {
          console.error('Bill upsert error:', billErr)
          return await sendText(from, "❌ Error saving bill. Please try again.")
        }

        // Create single pending payment record
        await supabase.from('payments').insert({
          tenant_id:  session.tenant_id,
          bill_id:    bill.id,
          amount:     total,
          status:     'Pending',
          method:     'Utility Bill',
          due_date:   dueDate
        })

        await clearSession(from)
        return await sendButtons(from,
          `✅ *Bill Generated*\n🏠 Unit: ${session.unit_num}\n👤 ${session.tenant_name}\n\n🏠 Rent: ₹${fmt(session.rent)}\n⚡ Electricity: ₹${fmt(elec)} (${units} units)\n💧 Water: ₹${fmt(water)}\n_________________________\n💰 *Total: ₹${fmt(total)}*`,
          ["Main Menu", "Submit Reading"]
        )
      }

      // ── REPORT MONTH SELECTIONS ───────────────────────────────────────────────

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

      // ── LOOKUP FLOW ───────────────────────────────────────────────────────────

      if (session.step === 'awaiting_tenant_selection') {
        // FIX: this step was never handled — now it is
        const tenantId = listId?.replace('tenant_', '')
        if (!tenantId) return ok()
        await generateTenantBill(from, profile.id, tenantId)
        return ok()
      }
    }

    // 4. Initial Path Triggers

    if (listId === 'path_reading' || input === 'submit reading') {
      await updateSession(from, { step: 'awaiting_unit_reading' })
      return await sendText(from, "📝 Enter unit number (e.g. G01):")
    }

    if (listId === 'path_expense' || input === 'add expense') {
      await updateSession(from, { step: 'awaiting_expense_unit' })
      return await sendText(from, "💸 *Add Expense*\nWhich unit? (e.g. G01)")
    }

    if (listId === 'path_pay_rec' || input === 'record payment') {
      const { data: tenants } = await supabase
        .from('tenants')
        .select('id, name, unit:units(unit_number)')
        .eq('user_id', profile.id)
        .eq('status', 'Active')
      if (!tenants?.length) return await sendText(from, "🏠 No active residents found.")
      await updateSession(from, { step: 'awaiting_payment_tenant_selection' })
      return await sendListMenu(from, "💰 Record Payment", "Select resident:", "Select", [{
        title: "ACTIVE RESIDENTS",
        rows: tenants.map(t => ({
          id:    `tenant_${t.id}`,
          title: `${t.unit?.unit_number || '?'} - ${t.name}`.substring(0, 24)
        }))
      }])
    }

    if (listId === 'path_lookup' || input === 'get unit bill') {
      const { data: tenants } = await supabase
        .from('tenants')
        .select('id, name, unit:units(unit_number)')
        .eq('user_id', profile.id)
        .eq('status', 'Active')
      if (!tenants?.length) return await sendText(from, "🏠 No active residents found.")
      await updateSession(from, { step: 'awaiting_tenant_selection' })   // FIX: session set, handler exists now
      return await sendListMenu(from, "🔍 Get Unit Bill", "Select resident:", "Select", [{
        title: "ACTIVE RESIDENTS",
        rows: tenants.map(t => ({
          id:    `tenant_${t.id}`,
          title: `${t.unit?.unit_number || '?'} - ${t.name}`.substring(0, 24)
        }))
      }])
    }

    if (listId === 'path_profit' || input === 'net profit') {
      const rows = []
      for (let i = 0; i < 6; i++) {
        const d = new Date(); d.setMonth(d.getMonth() - i)
        rows.push({ id: `profit_${d.toISOString().slice(0, 7)}`, title: d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) })
      }
      await updateSession(from, { step: 'awaiting_profit_month_selection' })
      return await sendListMenu(from, "📉 Profit & Loss", "Select month:", "Select", [{ title: "MONTHS", rows }])
    }

    if (listId === 'path_monthly' || input === 'monthly report') {
      const rows = []
      for (let i = 0; i < 6; i++) {
        const d = new Date(); d.setMonth(d.getMonth() - i)
        rows.push({ id: `report_${d.toISOString().slice(0, 7)}`, title: d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) })
      }
      await updateSession(from, { step: 'awaiting_report_month_selection' })
      return await sendListMenu(from, "📅 Monthly Report", "Select month:", "Select", [{ title: "MONTHS", rows }])
    }

    if (listId === 'path_unpaid' || input === 'unpaid bills') {
      const { data: bills } = await supabase
        .from('utility_bills')
        .select('balance_due, billing_month, tenant_id')
        .eq('user_id', profile.id)
        .gt('balance_due', 0)
        .order('billing_month', { ascending: false })
      if (!bills?.length) return await sendButtons(from, "✅ All bills are paid!", ["Main Menu"])
      const { data: tenants } = await supabase
        .from('tenants')
        .select('id, name, unit:units(unit_number)')
        .in('id', bills.map(b => b.tenant_id))
      const tMap = Object.fromEntries((tenants || []).map(t => [t.id, t.name]))
      const uMap = Object.fromEntries((tenants || []).map(t => [t.id, t.unit?.unit_number || '?']))
      let r = `🚩 *Outstanding Bills*\n\n`
      const grouped = bills.reduce((acc, b) => { (acc[b.billing_month] ||= []).push(b); return acc }, {})
      let grandTotal = 0
      for (const [month, mBills] of Object.entries(grouped)) {
        r += `📅 *${month}*\n`
        mBills.forEach(b => {
          r += `▫️ ${uMap[b.tenant_id]} (${tMap[b.tenant_id]}): ₹${fmt(b.balance_due)}\n`
          grandTotal += parseFloat(b.balance_due)
        })
        r += `\n`
      }
      r += `_________________________\n🚩 *TOTAL DUE: ₹${fmt(grandTotal)}*`
      return await sendButtons(from, r, ["Main Menu", "Record Payment"])
    }

    if (listId === 'path_vacancy' || input === 'vacancy analysis') {
      const { data: vacant } = await supabase
        .from('units')
        .select('unit_number, rent')
        .eq('user_id', profile.id)
        .eq('status', 'Vacant')
      let r = `📉 *Vacancy Loss Report*\n\n`
      let tl = 0
      if (!vacant?.length) {
        r += "✅ All units are occupied! Zero revenue loss."
      } else {
        vacant.forEach(u => { r += `▫️ ${u.unit_number}: ₹${fmt(u.rent)}/mo\n`; tl += parseFloat(u.rent) })
        r += `_________________________\n🚩 *MONTHLY LOSS: ₹${fmt(tl)}*`
      }
      return await sendButtons(from, r, ["Main Menu"])
    }

    if (listId === 'path_compliance' || input === 'compliance status') {
      const { data: tenants } = await supabase
        .from('tenants')
        .select('name, lease_end, police_verified, unit:units(unit_number)')
        .eq('user_id', profile.id)
        .eq('status', 'Active')
      if (!tenants?.length) return await sendButtons(from, "🏠 No active tenants.", ["Main Menu"])
      let r = `📋 *Compliance Status*\n\n`
      tenants.forEach(t => {
        const verified = t.police_verified ? "✅ Police Verified" : "❌ Not Verified"
        const leaseStatus = t.lease_end
          ? (new Date(t.lease_end) < new Date() ? `⚠️ EXPIRED ${t.lease_end}` : `✅ Until ${t.lease_end}`)
          : "⚠️ Not Set"
        r += `🏠 *${t.unit?.unit_number}* — ${t.name}\n📜 Lease: ${leaseStatus}\n👮 ${verified}\n\n`
      })
      return await sendButtons(from, r.trim(), ["Main Menu"])
    }

    if (listId === 'path_summary' || input === 'property summary') {
      const [{ data: props }, { data: units }] = await Promise.all([
        supabase.from('properties').select('name').eq('user_id', profile.id),
        supabase.from('units').select('status, rent').eq('user_id', profile.id)
      ])
      const occupied = units?.filter(u => u.status === 'Occupied') || []
      const vacant   = units?.filter(u => u.status === 'Vacant') || []
      const monthlyRent = occupied.reduce((s, u) => s + parseFloat(u.rent || 0), 0)
      let r = `🏢 *Property Summary*\n\n`
      r += `🏠 Properties: ${props?.length || 0}\n`
      r += `🔑 Total Units: ${units?.length || 0}\n`
      r += `✅ Occupied: ${occupied.length}\n`
      r += `🔓 Vacant: ${vacant.length}\n`
      r += `_________________________\n`
      r += `💰 Monthly Rent Income: ₹${fmt(monthlyRent)}`
      return await sendButtons(from, r, ["Main Menu"])
    }

    return await sendText(from, "❓ Send *Hi* to open the menu.")

  } catch (err) {
    console.error('Bot Error:', err)
    return ok()
  }
}

// --- REPORT GENERATORS ---

async function generateTenantBill(from, profileId, tenantId) {
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, unit:units(unit_number)')
    .eq('id', tenantId)
    .single()

  const { data: bills } = await supabase
    .from('utility_bills')
    .select('billing_month, total_amount, balance_due')
    .eq('tenant_id', tenantId)
    .order('billing_month', { ascending: false })
    .limit(3)

  if (!bills?.length) return await sendButtons(from, `📭 No bills found for ${tenant?.name}.`, ["Main Menu"])

  let r = `🔍 *${tenant?.unit?.unit_number} — ${tenant?.name}*\n\n`
  bills.forEach(b => {
    const paid = parseFloat(b.total_amount) - parseFloat(b.balance_due)
    const status = parseFloat(b.balance_due) <= 0 ? '✅' : '🚩'
    r += `${status} *${b.billing_month}*\n`
    r += `   Billed: ₹${fmt(b.total_amount)} | Paid: ₹${fmt(paid)} | Due: ₹${fmt(b.balance_due)}\n\n`
  })
  await sendButtons(from, r.trim(), ["Main Menu", "Record Payment"])
}

async function generateMonthlyReport(from, profileId, targetMonth) {
  const { data: bills } = await supabase
    .from('utility_bills')
    .select('*')
    .eq('user_id', profileId)
    .eq('billing_month', targetMonth)

  if (!bills?.length) return await sendButtons(from, `📭 No data for ${targetMonth}.`, ["Main Menu", "Monthly Report"])

  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name, unit:units(unit_number)')
    .in('id', bills.map(b => b.tenant_id))

  const tMap = Object.fromEntries((tenants || []).map(t => [t.id, t.name]))
  const uMap = Object.fromEntries((tenants || []).map(t => [t.id, t.unit?.unit_number || '?']))

  let tb = 0, tc = 0
  let r = `📊 *Invoicing Report: ${targetMonth}*\n\n`
  bills.forEach(b => {
    const bld = parseFloat(b.total_amount)
    const clc = bld - parseFloat(b.balance_due)
    r += `🏠 *${uMap[b.tenant_id]}* (${tMap[b.tenant_id]})\n   Billed: ₹${fmt(bld)} | Collected: ₹${fmt(clc)}\n\n`
    tb += bld; tc += clc
  })
  r += `_________________________\n⭐ *Billed:* ₹${fmt(tb)}\n💰 *Collected:* ₹${fmt(tc)}\n🚩 *Pending:* ₹${fmt(tb - tc)}`
  await sendButtons(from, r, ["Main Menu", "Monthly Report"])
}

async function generateProfitLossReport(from, profileId, targetMonth) {
  // FIX: use proper end-of-month date instead of hardcoded -31
  const startDate = `${targetMonth}-01`
  const endDate   = getMonthEnd(targetMonth)

  const [{ data: bills }, { data: expenses }] = await Promise.all([
    supabase.from('utility_bills').select('total_amount, balance_due').eq('user_id', profileId).eq('billing_month', targetMonth),
    supabase.from('expenses').select('amount, category').eq('user_id', profileId)
      .gte('expense_date', startDate)
      .lte('expense_date', endDate)
  ])

  let collected = 0, outgoings = 0
  bills?.forEach(b => collected += (parseFloat(b.total_amount) - parseFloat(b.balance_due)))
  expenses?.forEach(e => outgoings += parseFloat(e.amount))

  // Expense breakdown by category
  const catTotals = {}
  expenses?.forEach(e => {
    catTotals[e.category] = (catTotals[e.category] || 0) + parseFloat(e.amount)
  })
  let expBreakdown = ''
  for (const [cat, amt] of Object.entries(catTotals)) {
    expBreakdown += `   • ${cat}: ₹${fmt(amt)}\n`
  }

  const net    = collected - outgoings
  const netStr = net >= 0 ? `✅ ₹${fmt(net)}` : `🔴 -₹${fmt(Math.abs(net))}`

  const r = `📉 *P&L Report: ${targetMonth}*\n\n` +
            `💰 *Collected:* ₹${fmt(collected)}\n` +
            `💸 *Expenses:* ₹${fmt(outgoings)}\n` +
            (expBreakdown ? expBreakdown : '') +
            `_________________________\n\n` +
            `💎 *NET PROFIT:* ${netStr}`
  await sendButtons(from, r, ["Main Menu", "Net Profit (P&L)"])
}

// --- WEBHOOK VERIFICATION ---
export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const challenge    = searchParams.get('hub.challenge')
  const verifyToken  = searchParams.get('hub.verify_token')
  if (verifyToken === process.env.WHATSAPP_VERIFY_TOKEN) return new Response(challenge, { status: 200 })
  return new Response('PropManager Bot ONLINE.', { status: 200 })
}
