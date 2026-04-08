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
  return await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: "whatsapp", to, ...messageData })
  })
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

// --- MAIN BOT HANDLER ---
export async function POST(req) {
  try {
    const body = await req.json()
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
    if (!message) return NextResponse.json({ ok: true })

    const from = message.from
    const cleanPhone = from.replace(/\D/g, '')

    // 1. Auth check
    const { data: profile } = await supabase.from('profiles').select('*').eq('contact_number', cleanPhone).single()
    if (!profile) {
      await sendText(from, `⚠️ Unauthorized: ${cleanPhone}`)
      return NextResponse.json({ ok: true })
    }

    const text = (message.text?.body || message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || "").trim()
    const listId = message.interactive?.list_reply?.id
    const input = text.toLowerCase()

    // 2. Main Menu & Reset
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
      return NextResponse.json({ ok: true })
    }

    const session = await getSession(from)

    // 3. Handle Active Session Steps
    if (session) {
      // PAYMENT STEPS
      if (session.step === 'awaiting_payment_tenant_selection') {
        const tenantId = listId?.replace('tenant_', '')
        if (!tenantId) return NextResponse.json({ ok: true })
        const { data: bills } = await supabase.from('utility_bills').select('id, billing_month, balance_due').eq('tenant_id', tenantId).gt('balance_due', 0).order('billing_month', { ascending: false })
        if (!bills?.length) {
          await clearSession(from)
          await sendButtons(from, "✅ This tenant has no pending balance.", ["Main Menu", "Record Payment"])
          return NextResponse.json({ ok: true })
        }
        await updateSession(from, { step: 'awaiting_bill_selection', tenant_id: tenantId })
        await sendListMenu(from, `💰 Select Bill`, "Which bill are they paying?", "Select", [{ title: "PENDING", rows: bills.map(b => ({ id: `bill_${b.id}`, title: `${b.billing_month} (Due: ₹${b.balance_due})` })) }])
        return NextResponse.json({ ok: true })
      }

      if (session.step === 'awaiting_bill_selection') {
        const billId = listId?.replace('bill_', '')
        if (!billId) return NextResponse.json({ ok: true })
        const { data: bill } = await supabase.from('utility_bills').select('*').eq('id', billId).single()
        await updateSession(from, { step: 'awaiting_payment_amount', bill_id: billId, bill_total: bill.balance_due })
        await sendText(from, `💸 *Balance:* ₹${bill.balance_due}\nHow much was received?`)
        return NextResponse.json({ ok: true })
      }

      if (session.step === 'awaiting_payment_amount') {
        const amt = parseFloat(text)
        if (isNaN(amt)) {
          await sendText(from, "❌ Please enter a valid number.")
          return NextResponse.json({ ok: true })
        }
        const { data: bill } = await supabase.from('utility_bills').select('*').eq('id', session.bill_id).single()
        const newBalance = bill.balance_due - amt
        const { data: pendPay } = await supabase.from('payments').select('id').eq('bill_id', session.bill_id).eq('status', 'Pending').limit(1).single()
        if (pendPay) await supabase.from('payments').update({ amount: amt, status: 'Paid', payment_date: new Date() }).eq('id', pendPay.id)
        await supabase.from('utility_bills').update({ balance_due: Math.max(0, newBalance) }).eq('id', session.bill_id)
        if (newBalance > 0) await supabase.from('payments').insert({ tenant_id: session.tenant_id, bill_id: session.bill_id, amount: newBalance, status: 'Pending', method: 'Partial Balance', due_date: bill.due_date })
        await clearSession(from)
        await sendButtons(from, `✅ *Payment Recorded*\n💰 Received: ₹${amt}\n🚩 Remaining: ₹${Math.max(0, newBalance)}`, ["Main Menu", "Record Payment"])
        return NextResponse.json({ ok: true })
      }

      // READING STEPS
      if (session.step === 'awaiting_unit_reading') {
        const unitNum = text.toUpperCase()
        const { data: unit } = await supabase.from('units').select('id, rent, tenants(id, name)').eq('unit_number', unitNum).single()
        if (!unit?.tenants?.[0]) {
          await sendText(from, `❌ Unit *${unitNum}* not found or has no tenant.`)
          return NextResponse.json({ ok: true })
        }
        const tenant = unit.tenants[0]
        const { data: last } = await supabase.from('utility_bills').select('curr_reading').eq('tenant_id', tenant.id).order('billing_month', { ascending: false }).limit(1).single()
        await updateSession(from, { step: 'awaiting_reading_value', unit_id: unit.id, unit_num: unitNum, tenant_name: tenant.name, tenant_id: tenant.id, prev_reading: last?.curr_reading || 0, rent: unit.rent })
        await sendText(from, `👤 *Tenant:* ${tenant.name}\n📟 *Previous:* ${last?.curr_reading || 0}\n\nWhat is the *Current Reading*?`)
        return NextResponse.json({ ok: true })
      }

      if (session.step === 'awaiting_reading_value') {
        const curr = parseFloat(text)
        if (isNaN(curr)) {
          await sendText(from, "❌ Please enter a valid number.")
          return NextResponse.json({ ok: true })
        }
        await updateSession(from, { step: 'awaiting_water_value', curr_reading: curr })
        await sendButtons(from, `📟 *Current:* ${curr}`, ["Skip (140)", "Enter Custom"])
        return NextResponse.json({ ok: true })
      }

      if (session.step === 'awaiting_water_value') {
        if (input === 'enter custom') {
          await sendText(from, "Type water amount:")
          return NextResponse.json({ ok: true })
        }
        const water = input === 'skip (140)' ? 140 : parseFloat(text)
        const unitsUsed = session.curr_reading - session.prev_reading
        const elec = Math.max(unitsUsed * 10, 150)
        const total = parseFloat(session.rent) + elec + water
        const { data: bill, error: billErr } = await supabase.from('utility_bills').upsert({ user_id: profile.id, tenant_id: session.tenant_id, billing_month: new Date().toISOString().slice(0, 7), prev_reading: session.prev_reading, curr_reading: session.curr_reading, rate_per_unit: 10, fixed_rent: session.rent, water_bill: water, total_amount: total, balance_due: total, due_date: new Date(new Date().getFullYear(), new Date().getMonth(), 10).toISOString().split('T')[0] }).select().single()
        if (!billErr && bill) await supabase.from('payments').insert({ tenant_id: session.tenant_id, bill_id: bill.id, amount: total, status: 'Pending', method: 'Utility Bill', due_date: bill.due_date })
        await clearSession(from)
        await sendButtons(from, `✅ *Bill Saved*\n💰 Total: ₹${total.toLocaleString()}`, ["Main Menu", "Submit Reading"])
        return NextResponse.json({ ok: true })
      }

      // LOOKUP STEPS
      if (session.step === 'awaiting_tenant_selection') {
        const tenantId = listId?.replace('tenant_', '')
        if (!tenantId) return NextResponse.json({ ok: true })
        const { data: bills } = await supabase.from('utility_bills').select('billing_month').eq('tenant_id', tenantId).order('billing_month', { ascending: false }).limit(5)
        if (!bills?.length) {
          await clearSession(from)
          await sendButtons(from, `📭 No history found.`, ["Main Menu", "Get Unit Bill"])
          return NextResponse.json({ ok: true })
        }
        await updateSession(from, { step: 'awaiting_month_selection', tenant_id: tenantId })
        await sendListMenu(from, `📅 Select Month`, "Choose month:", "Select", [{ title: "MONTHS", rows: bills.map(b => ({ id: `month_${b.billing_month}`, title: b.billing_month })) }])
        return NextResponse.json({ ok: true })
      }

      if (session.step === 'awaiting_month_selection') {
        const month = listId?.replace('month_', '')
        if (!month) return NextResponse.json({ ok: true })
        const { data: bill } = await supabase.from('utility_bills').select('*').eq('tenant_id', session.tenant_id).eq('billing_month', month).single()
        if (bill) {
          const detail = `🧾 *Bill Breakdown (${month})*\n\n🏠 *Rent:* ₹${parseFloat(bill.fixed_rent).toLocaleString()}\n⚡ *Elec:* ₹${Math.max((bill.curr_reading - bill.prev_reading) * 10, 150).toLocaleString()}\n💧 *Water:* ₹${parseFloat(bill.water_bill).toLocaleString()}\n_________________________\n💰 *TOTAL: ₹${parseFloat(bill.total_amount).toLocaleString()}*`
          await clearSession(from)
          await sendButtons(from, detail, ["Main Menu", "Get Unit Bill"])
        }
        return NextResponse.json({ ok: true })
      }

      if (session.step === 'awaiting_report_month_selection') {
        const monthCode = listId?.replace('report_', '')
        if (!monthCode) return NextResponse.json({ ok: true })
        const { data: bills } = await supabase.from('utility_bills').select('*').eq('user_id', profile.id).eq('billing_month', monthCode)
        if (!bills?.length) {
          await clearSession(from)
          await sendButtons(from, `📭 No data for ${monthCode}`, ["Main Menu", "Monthly Report"])
          return NextResponse.json({ ok: true })
        }
        const { data: tenants } = await supabase.from('tenants').select('id, name, unit_id').in('id', bills.map(b => b.tenant_id))
        const { data: units } = await supabase.from('units').select('id, unit_number').in('id', (tenants || []).map(t => t.unit_id))
        const tMap = Object.fromEntries((tenants || []).map(t => [t.id, t.name])); const uMap = Object.fromEntries((tenants || []).map(t => [t.id, (units || []).find(u => u.id === t.unit_id)?.unit_number || 'Unit']))
        let r = `📊 *Report: ${monthCode}*\n\n`; let gt = 0
        bills.forEach(b => { const t = parseFloat(b.total_amount); r += `🏠 *${uMap[b.tenant_id]}* (${tMap[b.tenant_id]}): ₹${t.toLocaleString()}\n`; gt += t })
        await clearSession(from)
        await sendButtons(from, r + `\n⭐ *TOTAL: ₹${gt.toLocaleString()}*`, ["Main Menu", "Monthly Report"])
        return NextResponse.json({ ok: true })
      }
    }

    // 4. Initial Triggers
    if (listId === 'path_reading' || input === 'submit reading') {
      await updateSession(from, { step: 'awaiting_unit_reading' })
      await sendText(from, "📝 Which Unit? (e.g. G01)")
      return NextResponse.json({ ok: true })
    }

    if (listId === 'path_pay_rec' || input === 'record payment') {
      const { data: tenants } = await supabase.from('tenants').select('id, name, unit_id').eq('user_id', profile.id).eq('status', 'Active')
      if (!tenants?.length) {
        await sendText(from, "🏠 No active tenants.")
        return NextResponse.json({ ok: true })
      }
      const { data: units } = await supabase.from('units').select('id, unit_number').in('id', tenants.map(t => t.unit_id))
      const uMap = Object.fromEntries((units || []).map(u => [u.id, u.unit_number]))
      await updateSession(from, { step: 'awaiting_payment_tenant_selection' })
      await sendListMenu(from, "💰 Record Payment", "Choose tenant:", "Select", [{ title: "ACTIVE", rows: tenants.map(t => ({ id: `tenant_${t.id}`, title: `${uMap[t.unit_id] || 'Unit'} - ${t.name}`.substring(0, 24) })) }])
      return NextResponse.json({ ok: true })
    }
    
    if (listId === 'path_lookup' || input === 'get unit bill') {
      const { data: tenants } = await supabase.from('tenants').select('id, name, unit_id').eq('user_id', profile.id).eq('status', 'Active')
      if (!tenants?.length) {
        await sendText(from, "🏠 No active tenants.")
        return NextResponse.json({ ok: true })
      }
      const { data: units } = await supabase.from('units').select('id, unit_number').in('id', tenants.map(t => t.unit_id))
      const uMap = Object.fromEntries((units || []).map(u => [u.id, u.unit_number]))
      await updateSession(from, { step: 'awaiting_tenant_selection' })
      await sendListMenu(from, "🔍 Select Tenant", "Choose tenant:", "Select", [{ title: "ACTIVE", rows: tenants.map(t => ({ id: `tenant_${t.id}`, title: `${uMap[t.unit_id] || 'Unit'} - ${t.name}`.substring(0, 24) })) }])
      return NextResponse.json({ ok: true })
    }

    if (listId === 'path_summary' || input === 'property summary') {
      const { data: props } = await supabase.from('properties').select('name, units').eq('user_id', profile.id)
      await sendButtons(from, props?.length ? `🏢 *Properties:*\n` + props.map(p => `• ${p.name}: ${p.units}u`).join('\n') : "🏠 No properties.", ["Main Menu"])
      return NextResponse.json({ ok: true })
    }

    if (listId === 'path_monthly' || input === 'monthly report') {
      const rows = []; for (let i = 0; i < 6; i++) { const d = new Date(); d.setMonth(d.getMonth() - i); rows.push({ id: `report_${d.toISOString().slice(0, 7)}`, title: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) }) }
      await updateSession(from, { step: 'awaiting_report_month_selection' })
      await sendListMenu(from, "📅 Monthly Report", "Select month:", "Select", [{ title: "MONTHS", rows }])
      return NextResponse.json({ ok: true })
    }

    if (listId === 'path_unpaid' || input === 'unpaid bills') {
      const { data: bills } = await supabase.from('utility_bills').select(`total_amount, balance_due, billing_month, tenant_id`).eq('user_id', profile.id).gt('balance_due', 0).order('billing_month', { ascending: false })
      if (!bills?.length) {
        await sendButtons(from, "✅ All paid!", ["Main Menu"])
        return NextResponse.json({ ok: true })
      }
      const { data: tenants } = await supabase.from('tenants').select('id, name, unit_id').in('id', bills.map(b => b.tenant_id))
      const { data: units } = await supabase.from('units').select('id, unit_number').in('id', (tenants || []).map(t => t.unit_id))
      const tMap = Object.fromEntries((tenants || []).map(t => [t.id, t.name])); const uMap = Object.fromEntries((tenants || []).map(t => [t.id, (units || []).find(u => u.id === t.unit_id)?.unit_number || 'Unit']))
      let r = `🚩 *Outstanding*\n\n`; const grouped = bills.reduce((acc, b) => { acc[b.billing_month] = acc[b.billing_month] || []; acc[b.billing_month].push(b); return acc }, {})
      for (const [month, mBills] of Object.entries(grouped)) { r += `📅 *${month}*\n`; mBills.forEach(b => { r += `▫️ ${uMap[b.tenant_id]} (${tMap[b.tenant_id]}): ₹${parseFloat(b.balance_due).toLocaleString()}\n` }); r += `\n` }
      await sendButtons(from, r, ["Main Menu", "Record Payment"])
      return NextResponse.json({ ok: true })
    }

    // 5. Catch-all
    await sendText(from, "❓ Send *Hi* for menu.")
    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error('Bot Error:', err)
    return NextResponse.json({ ok: true })
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN) return new Response(searchParams.get('hub.challenge'))
  return new Response('Error', { status: 403 })
}
