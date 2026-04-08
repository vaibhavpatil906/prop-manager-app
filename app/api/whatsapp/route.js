import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder'
)

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const MAIN_MENU_TRIGGERS = new Set(['hi', 'hello', 'menu', 'start', 'hey', 'cancel', 'reset'])
const DEFAULT_WATER_BILL = 140
const ELECTRICITY_RATE = 10
const ELECTRICITY_MIN = 150
const DEFAULT_DUE_DAY = 10

// ─── WHATSAPP HELPERS ─────────────────────────────────────────────────────────

async function callWhatsApp(to, messageData) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_ID
  if (!token || !phoneId) {
    console.warn('WhatsApp credentials not configured')
    return
  }
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, ...messageData }),
    })
    if (!res.ok) console.error('WhatsApp API Error:', res.status, await res.text())
    return res
  } catch (err) {
    console.error('WhatsApp fetch failed:', err)
  }
}

const sendText = (to, text) =>
  callWhatsApp(to, { type: 'text', text: { body: text } })

const sendButtons = (to, text, buttons) =>
  callWhatsApp(to, {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: text.substring(0, 1024) },
      action: {
        buttons: buttons.slice(0, 3).map((b, i) => ({
          type: 'reply',
          reply: { id: `btn_${i}`, title: b.substring(0, 20) },
        })),
      },
    },
  })

const sendListMenu = (to, header, body, buttonLabel, sections) =>
  callWhatsApp(to, {
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: header.substring(0, 60) },
      body: { text: body.substring(0, 1024) },
      footer: { text: 'PropManager' },
      action: { button: buttonLabel.substring(0, 20), sections },
    },
  })

// ─── SESSION MANAGEMENT ───────────────────────────────────────────────────────

async function getSession(phone) {
  const { data, error } = await supabase
    .from('bot_sessions')
    .select('*')
    .eq('phone', phone)
    .single()
  if (error && error.code !== 'PGRST116') console.error('getSession error:', error.message)
  return data
}

async function updateSession(phone, data) {
  const { error } = await supabase
    .from('bot_sessions')
    .upsert({ phone, ...data, updated_at: new Date().toISOString() })
  if (error) console.error('updateSession error:', error.message, JSON.stringify(data))
}

async function clearSession(phone) {
  const { error } = await supabase.from('bot_sessions').delete().eq('phone', phone)
  if (error) console.error('clearSession error:', error.message)
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────

const ok = () => NextResponse.json({ ok: true })

/** IST-aware current month string YYYY-MM */
function getCurrentMonth() {
  const now = new Date()
  // IST = UTC+5:30
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  return ist.toISOString().slice(0, 7)
}

/** Due date: 10th of current IST month */
function getDueDate() {
  const now = new Date()
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  return `${ist.toISOString().slice(0, 7)}-${String(DEFAULT_DUE_DAY).padStart(2, '0')}`
}

function calcElectricity(units) {
  return Math.max(units * ELECTRICITY_RATE, ELECTRICITY_MIN)
}

function fmt(amount) {
  return parseFloat(amount || 0).toLocaleString('en-IN')
}

// ─── STEP HANDLERS ────────────────────────────────────────────────────────────

async function handlePaymentTenantSelection({ from, listId }) {
  const tenantId = listId?.replace('tenant_', '')
  if (!tenantId) return ok()

  const [{ data: tenant }, { data: bills }] = await Promise.all([
    supabase.from('tenants').select('name, unit:units(unit_number)').eq('id', tenantId).single(),
    supabase
      .from('utility_bills')
      .select('id, billing_month, balance_due')
      .eq('tenant_id', tenantId)
      .gt('balance_due', 0)
      .order('billing_month', { ascending: false }),
  ])

  if (!bills?.length) {
    await clearSession(from)
    await sendButtons(from, `✅ *${tenant?.name || 'Resident'}* has no pending balance.`, [
      'Main Menu',
      'Record Payment',
    ])
    return ok()
  }

  await updateSession(from, {
    step: 'awaiting_bill_selection',
    tenant_id: tenantId,
    tenant_name: tenant?.name,
    unit_num: tenant?.unit?.unit_number,
  })
  await sendListMenu(from, '💰 Select Bill', 'Which month are they paying?', 'Select', [
    {
      title: 'PENDING',
      rows: bills.map((b) => ({
        id: `bill_${b.id}`,
        title: `${b.billing_month} (Due: ₹${fmt(b.balance_due)})`.substring(0, 24),
      })),
    },
  ])
  return ok()
}

async function handleBillSelection({ from, listId }) {
  const billId = listId?.replace('bill_', '')
  if (!billId) return ok()

  const { data: bill } = await supabase.from('utility_bills').select('*').eq('id', billId).single()
  if (!bill) {
    await sendText(from, '❌ Bill record not found. Please try again.')
    return ok()
  }

  await updateSession(from, {
    step: 'awaiting_payment_amount',
    bill_id: billId,
    bill_month: bill.billing_month,
    bill_total: bill.balance_due,
  })
  await sendText(
    from,
    `💸 *Pending for ${bill.billing_month}:* ₹${fmt(bill.balance_due)}\n\nHow much was received? (Numbers only)`
  )
  return ok()
}

async function handlePaymentAmount({ from, text, session }) {
  const amt = parseFloat(text.replace(/[^\d.]/g, ''))
  if (isNaN(amt) || amt <= 0) {
    await sendText(from, '❌ Please enter a valid number (e.g., 5000).')
    return ok()
  }
  await updateSession(from, { step: 'awaiting_payment_method', payment_amt: amt })
  await sendButtons(from, `💰 Received: ₹${fmt(amt)}\n\nSelect payment method:`, [
    'Cash',
    'UPI',
    'Bank Transfer',
  ])
  return ok()
}

async function handlePaymentMethod({ from, text, session }) {
  const amt = parseFloat(session.payment_amt) || 0
  const method = text

  const { data: bill } = await supabase
    .from('utility_bills')
    .select('*')
    .eq('id', session.bill_id)
    .single()
  if (!bill) {
    await sendText(from, '❌ Session expired. Please start over.')
    return ok()
  }

  const newBalance = Math.max(0, (parseFloat(bill.balance_due) || 0) - amt)
  const paymentDate = new Date().toISOString()
  const paidDate = paymentDate.split('T')[0]

  // Update or insert payment record + update bill balance atomically-ish
  const { data: pendPay } = await supabase
    .from('payments')
    .select('id')
    .eq('bill_id', session.bill_id)
    .eq('status', 'Pending')
    .neq('method', 'Partial Balance') // don't match leftover partial rows
    .limit(1)
    .single()

  if (pendPay) {
    await supabase
      .from('payments')
      .update({ amount: amt, status: 'Paid', method, payment_date: paymentDate, paid_date: paidDate })
      .eq('id', pendPay.id)
  } else {
    await supabase.from('payments').insert({
      tenant_id: session.tenant_id,
      bill_id: session.bill_id,
      amount: amt,
      status: 'Paid',
      method,
      payment_date: paymentDate,
      paid_date: paidDate,
      due_date: bill.due_date,
    })
  }

  // Update balance
  await supabase.from('utility_bills').update({ balance_due: newBalance }).eq('id', session.bill_id)

  // Insert partial balance row only if genuinely still owed
  if (newBalance > 0) {
    // Remove any existing stale partial balance row first to avoid duplicates
    await supabase
      .from('payments')
      .delete()
      .eq('bill_id', session.bill_id)
      .eq('status', 'Pending')
      .eq('method', 'Partial Balance')

    await supabase.from('payments').insert({
      tenant_id: session.tenant_id,
      bill_id: session.bill_id,
      amount: newBalance,
      status: 'Pending',
      method: 'Partial Balance',
      due_date: bill.due_date,
    })
  }

  await clearSession(from)
  const receipt =
    `✅ *Payment Recorded*\n` +
    `👤 *Tenant:* ${session.tenant_name || 'Resident'}\n` +
    `🏠 *Unit:* ${session.unit_num || 'Unit'}\n` +
    `📅 *Month:* ${session.bill_month || 'N/A'}\n` +
    `_________________________\n` +
    `💰 *Amount:* ₹${fmt(amt)}\n` +
    `💳 *Method:* ${method}\n` +
    `🚩 *Remaining:* ₹${fmt(newBalance)}\n` +
    `_________________________`
  await sendButtons(from, receipt, ['Main Menu', 'Record Payment'])
  return ok()
}

async function handleUnitReading({ from, text }) {
  const unitNum = text.toUpperCase()
  const { data: unit } = await supabase
    .from('units')
    .select('id, rent, tenants(id, name)')
    .eq('unit_number', unitNum)
    .single()

  if (!unit || !unit.tenants?.[0]) {
    await sendText(from, `❌ Unit *${unitNum}* not found or has no active resident.`)
    return ok()
  }

  const tenant = unit.tenants[0]
  const { data: last } = await supabase
    .from('utility_bills')
    .select('curr_reading')
    .eq('tenant_id', tenant.id)
    .order('billing_month', { ascending: false })
    .limit(1)
    .single()

  const prevReading = parseFloat(last?.curr_reading) || 0
  await updateSession(from, {
    step: 'awaiting_reading_value',
    unit_id: unit.id,
    unit_num: unitNum,
    tenant_name: tenant.name,
    tenant_id: tenant.id,
    prev_reading: prevReading,
    rent: parseFloat(unit.rent) || 0,
  })
  await sendText(
    from,
    `👤 *Resident:* ${tenant.name}\n📟 *Previous:* ${prevReading}\n\nWhat is the *Current Reading*?`
  )
  return ok()
}

async function handleReadingValue({ from, text }) {
  const curr = parseFloat(text.replace(/[^\d.]/g, ''))
  if (isNaN(curr)) {
    await sendText(from, '❌ Please enter a valid number.')
    return ok()
  }
  await updateSession(from, { step: 'awaiting_water_value', curr_reading: curr })
  await sendButtons(from, `📟 *Current:* ${curr}\n\nWhat is the Water Bill?`, [
    `Skip (${DEFAULT_WATER_BILL})`,
    'Enter Custom',
  ])
  return ok()
}

async function handleWaterValue({ from, text, input, session, profile }) {
  if (input === 'enter custom') {
    await sendText(from, 'Type the water bill amount:')
    return ok()
  }

  // Accept either the skip button OR a plain number
  const isSkip = input.startsWith('skip')
  const water = isSkip ? DEFAULT_WATER_BILL : parseFloat(text.replace(/[^\d.]/g, ''))
  if (isNaN(water)) {
    await sendText(from, '❌ Please enter a valid amount.')
    return ok()
  }

  const unitsUsed = Math.max(0, (parseFloat(session.curr_reading) || 0) - (parseFloat(session.prev_reading) || 0))
  const elec = calcElectricity(unitsUsed)
  const rent = parseFloat(session.rent) || 0
  const total = rent + elec + water
  const dueDate = getDueDate()
  const billingMonth = getCurrentMonth()

  const { data: bill, error: billErr } = await supabase
    .from('utility_bills')
    .upsert(
      {
        user_id: profile.id,
        tenant_id: session.tenant_id,
        billing_month: billingMonth,
        prev_reading: session.prev_reading,
        curr_reading: session.curr_reading,
        rate_per_unit: ELECTRICITY_RATE,
        fixed_rent: rent,
        water_bill: water,
        total_amount: total,
        balance_due: total,
        due_date: dueDate,
      },
      { onConflict: 'tenant_id,billing_month' } // requires unique constraint in DB
    )
    .select()
    .single()

  if (billErr) {
    console.error('Bill upsert error:', billErr.message)
    await sendText(from, '❌ Failed to save bill. Please try again.')
    return ok()
  }

  // Remove stale pending payment for this bill before inserting fresh one
  if (bill) {
    await supabase.from('payments').delete().eq('bill_id', bill.id).eq('status', 'Pending')
    await supabase.from('payments').insert({
      tenant_id: session.tenant_id,
      bill_id: bill.id,
      amount: total,
      status: 'Pending',
      method: 'Utility Bill',
      due_date: dueDate,
    })
  }

  await clearSession(from)
  await sendButtons(from, `✅ *Bill Saved*\n💰 Total: ₹${fmt(total)}`, ['Main Menu', 'Submit Reading'])
  return ok()
}

async function handleTenantSelection({ from, listId }) {
  const tenantId = listId?.replace('tenant_', '')
  if (!tenantId) return ok()

  const { data: bills } = await supabase
    .from('utility_bills')
    .select('billing_month')
    .eq('tenant_id', tenantId)
    .order('billing_month', { ascending: false })
    .limit(5)

  if (!bills?.length) {
    await clearSession(from)
    await sendButtons(from, '📭 No history found for this resident.', ['Main Menu', 'Get Unit Bill'])
    return ok()
  }

  await updateSession(from, { step: 'awaiting_month_selection', tenant_id: tenantId })
  await sendListMenu(from, '📅 Select Month', 'Choose month:', 'Select', [
    { title: 'MONTHS', rows: bills.map((b) => ({ id: `month_${b.billing_month}`, title: b.billing_month })) },
  ])
  return ok()
}

async function handleMonthSelection({ from, listId, session }) {
  const month = listId?.replace('month_', '')
  if (!month) return ok()

  const { data: bill } = await supabase
    .from('utility_bills')
    .select('*')
    .eq('tenant_id', session.tenant_id)
    .eq('billing_month', month)
    .single()

  await clearSession(from)

  if (!bill) {
    await sendButtons(from, `📭 No bill found for ${month}.`, ['Main Menu', 'Get Unit Bill'])
    return ok()
  }

  const unitsUsed = Math.max(0, (bill.curr_reading || 0) - (bill.prev_reading || 0))
  const detail =
    `🧾 *Bill Breakdown (${month})*\n\n` +
    `🏠 *Rent:* ₹${fmt(bill.fixed_rent)}\n` +
    `⚡ *Elec:* ₹${fmt(calcElectricity(unitsUsed))}\n` +
    `💧 *Water:* ₹${fmt(bill.water_bill)}\n` +
    `_________________________\n` +
    `💰 *TOTAL: ₹${fmt(bill.total_amount)}*`

  await sendButtons(from, detail, ['Main Menu', 'Get Unit Bill'])
  return ok()
}

async function handleReportMonthSelection({ from, listId, profileId }) {
  const monthCode = listId?.replace('report_', '')
  if (!monthCode) return ok()
  await generateMonthlyReport(from, profileId, monthCode)
  await clearSession(from)
  return ok()
}

// ─── STEP ROUTER ──────────────────────────────────────────────────────────────

const STEP_HANDLERS = {
  awaiting_payment_tenant_selection: handlePaymentTenantSelection,
  awaiting_bill_selection: handleBillSelection,
  awaiting_payment_amount: handlePaymentAmount,
  awaiting_payment_method: handlePaymentMethod,
  awaiting_unit_reading: handleUnitReading,
  awaiting_reading_value: handleReadingValue,
  awaiting_water_value: handleWaterValue,
  awaiting_tenant_selection: handleTenantSelection,
  awaiting_month_selection: handleMonthSelection,
  awaiting_report_month_selection: handleReportMonthSelection,
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

export async function POST(req) {
  // 1. Webhook signature verification (security fix)
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (appSecret) {
    const sig = req.headers.get('x-hub-signature-256')
    const rawBody = await req.text()
    const expected = 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex')
    if (sig !== expected) {
      console.warn('Invalid webhook signature')
      return NextResponse.json({ ok: false }, { status: 403 })
    }
    var body = JSON.parse(rawBody)
  } else {
    var body = await req.json()
  }

  const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
  if (!message) return ok()

  const from = message.from
  const cleanPhone = from.replace(/\D/g, '')

  try {
    // 2. Auth check
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('contact_number', cleanPhone)
      .single()

    if (!profile) {
      await sendText(from, `⚠️ Unauthorized number: ${cleanPhone}. Please register in app settings.`)
      return ok()
    }

    const text = (
      message.text?.body ||
      message.interactive?.button_reply?.title ||
      message.interactive?.list_reply?.title ||
      ''
    ).trim()
    const listId = message.interactive?.list_reply?.id
    const input = text.toLowerCase()

    // 3. Main menu reset
    if (MAIN_MENU_TRIGGERS.has(input) || listId === 'nav_main') {
      await clearSession(from)
      await sendListMenu(from, '👋 PropManager Home', 'Select an action:', 'Menu', [
        {
          title: '⚡ RECORD',
          rows: [
            { id: 'path_reading', title: 'Submit Reading' },
            { id: 'path_pay_rec', title: 'Record Payment' },
          ],
        },
        {
          title: '📊 REPORTS',
          rows: [
            { id: 'path_monthly', title: 'Monthly Report' },
            { id: 'path_unpaid', title: 'Unpaid Bills' },
          ],
        },
        {
          title: '🔍 LOOKUP',
          rows: [
            { id: 'path_lookup', title: 'Get Unit Bill' },
            { id: 'path_summary', title: 'Property Summary' },
          ],
        },
      ])
      return ok()
    }

    // 4. Active session — route to step handler
    const session = await getSession(from)
    if (session?.step && STEP_HANDLERS[session.step]) {
      return await STEP_HANDLERS[session.step]({
        from,
        text,
        input,
        listId,
        session,
        profile,
        profileId: profile.id,
      })
    }

    // 5. Path triggers (no session)
    if (listId === 'path_reading' || input === 'submit reading') {
      await updateSession(from, { step: 'awaiting_unit_reading' })
      await sendText(from, '📝 Which Unit? (e.g. G01)')
      return ok()
    }

    if (listId === 'path_pay_rec' || input === 'record payment') {
      const { data: tenants } = await supabase
        .from('tenants')
        .select('id, name, unit:units(unit_number)')
        .eq('user_id', profile.id)
        .eq('status', 'Active')
      if (!tenants?.length) {
        await sendText(from, '🏠 No active residents found.')
        return ok()
      }
      await updateSession(from, { step: 'awaiting_payment_tenant_selection' })
      await sendListMenu(from, '💰 Record Payment', 'Choose tenant:', 'Select', [
        {
          title: 'ACTIVE',
          rows: tenants.map((t) => ({
            id: `tenant_${t.id}`,
            title: `${t.unit?.unit_number || 'Unit'} - ${t.name}`.substring(0, 24),
          })),
        },
      ])
      return ok()
    }

    if (listId === 'path_lookup' || input === 'get unit bill') {
      const { data: tenants } = await supabase
        .from('tenants')
        .select('id, name, unit:units(unit_number)')
        .eq('user_id', profile.id)
        .eq('status', 'Active')
      if (!tenants?.length) {
        await sendText(from, '🏠 No active residents found.')
        return ok()
      }
      await updateSession(from, { step: 'awaiting_tenant_selection' })
      await sendListMenu(from, '🔍 Select Tenant', 'Choose tenant:', 'Select', [
        {
          title: 'ACTIVE',
          rows: tenants.map((t) => ({
            id: `tenant_${t.id}`,
            title: `${t.unit?.unit_number || 'Unit'} - ${t.name}`.substring(0, 24),
          })),
        },
      ])
      return ok()
    }

    if (listId === 'path_summary' || input === 'property summary') {
      const { data: props } = await supabase
        .from('properties')
        .select('name, units')
        .eq('user_id', profile.id)
      const msg = props?.length
        ? `🏢 *Properties:*\n` + props.map((p) => `• ${p.name}: ${p.units}u`).join('\n')
        : '🏠 No properties found.'
      await sendButtons(from, msg, ['Main Menu'])
      return ok()
    }

    if (listId === 'path_monthly' || input === 'monthly report') {
      const rows = Array.from({ length: 6 }, (_, i) => {
        const d = new Date()
        d.setMonth(d.getMonth() - i)
        return {
          id: `report_${d.toISOString().slice(0, 7)}`,
          title: d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
        }
      })
      await updateSession(from, { step: 'awaiting_report_month_selection' })
      await sendListMenu(from, '📅 Monthly Report', 'Select month:', 'Select', [
        { title: 'MONTHS', rows },
      ])
      return ok()
    }

    if (listId === 'path_unpaid' || input === 'unpaid bills') {
      const { data: bills } = await supabase
        .from('utility_bills')
        .select('total_amount, balance_due, billing_month, tenant_id')
        .eq('user_id', profile.id)
        .gt('balance_due', 0)
        .order('billing_month', { ascending: false })

      if (!bills?.length) {
        await sendButtons(from, '✅ All bills are paid!', ['Main Menu'])
        return ok()
      }

      const { data: tenants } = await supabase
        .from('tenants')
        .select('id, name, unit:units(unit_number)')
        .in('id', bills.map((b) => b.tenant_id))

      const nameMap = Object.fromEntries((tenants || []).map((t) => [t.id, t.name]))
      const unitMap = Object.fromEntries((tenants || []).map((t) => [t.id, t.unit?.unit_number || 'Unit']))

      const grouped = bills.reduce((acc, b) => {
        ;(acc[b.billing_month] ||= []).push(b)
        return acc
      }, {})

      let report = '🚩 *Outstanding Balances*\n\n'
      for (const [month, mBills] of Object.entries(grouped)) {
        report += `📅 *${month}*\n`
        mBills.forEach((b) => {
          report += `▫️ ${unitMap[b.tenant_id]} (${nameMap[b.tenant_id]}): ₹${fmt(b.balance_due)}\n`
        })
        report += '\n'
      }

      await sendButtons(from, report, ['Main Menu', 'Record Payment'])
      return ok()
    }

    // Fallback
    await sendText(from, '❓ Send *Hi* to see the menu.')
    return ok()
  } catch (err) {
    console.error('Bot Critical Error:', err)
    await sendText(from, '⚠️ A technical error occurred. Please try again or send *Hi* to restart.')
    return ok()
  }
}

// ─── MONTHLY REPORT GENERATOR ─────────────────────────────────────────────────

async function generateMonthlyReport(from, profileId, targetMonth) {
  const { data: bills } = await supabase
    .from('utility_bills')
    .select('*')
    .eq('user_id', profileId)
    .eq('billing_month', targetMonth)

  if (!bills?.length) {
    await sendButtons(from, `📭 No data for ${targetMonth}`, ['Main Menu', 'Monthly Report'])
    return
  }

  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name, unit:units(unit_number)')
    .in('id', bills.map((b) => b.tenant_id))

  const nameMap = Object.fromEntries((tenants || []).map((t) => [t.id, t.name]))
  const unitMap = Object.fromEntries((tenants || []).map((t) => [t.id, t.unit?.unit_number || 'Unit']))

  let totalBilled = 0
  let totalCollected = 0
  let report = `📊 *Report: ${targetMonth}*\n\n`

  for (const b of bills) {
    const billed = parseFloat(b.total_amount) || 0
    const due = parseFloat(b.balance_due) || 0
    const collected = billed - due
    totalBilled += billed
    totalCollected += collected
    report +=
      `🏠 *${unitMap[b.tenant_id]}* (${nameMap[b.tenant_id]})\n` +
      `   Billed: ₹${fmt(billed)} | Collected: ₹${fmt(collected)}\n` +
      `_________________________\n\n`
  }

  const footer =
    `⭐ *TOTAL BILLED:* ₹${fmt(totalBilled)}\n` +
    `💰 *TOTAL COLLECTED:* ₹${fmt(totalCollected)}\n` +
    `🚩 *TOTAL PENDING:* ₹${fmt(totalBilled - totalCollected)}`

  await sendButtons(from, report + footer, ['Main Menu', 'Monthly Report'])
}

// ─── WEBHOOK VERIFICATION ─────────────────────────────────────────────────────

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(searchParams.get('hub.challenge'))
  }
  return new Response('Forbidden', { status: 403 })
}
