import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// --- WHATSAPP HELPERS ---
async function callWhatsApp(to, messageData) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_ID
  if (!token || !phoneId) return
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: "whatsapp", to, ...messageData })
  })
  const resData = await res.json()
  if (resData.error) console.error('WhatsApp API Error:', JSON.stringify(resData.error))
  return res
}

const sendText = (to, text) => callWhatsApp(to, { type: "text", text: { body: text } })
const sendButtons = (to, text, buttons) => callWhatsApp(to, {
  type: "interactive",
  interactive: {
    type: "button",
    body: { text },
    action: { buttons: buttons.map((b, i) => ({ type: "reply", reply: { id: `btn_${i}`, title: b.substring(0, 20) } })) }
  }
})
const sendListMenu = (to, header, body, buttonLabel, sections) => callWhatsApp(to, {
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

// --- MAIN BOT ---
export async function POST(req) {
  try {
    const body = await req.json()
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
    if (!message) return NextResponse.json({ ok: true })

    const from = message.from
    const text = (message.text?.body || message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || "").trim()
    const listId = message.interactive?.list_reply?.id
    if (!from || !text) return NextResponse.json({ ok: true })

    const input = text.toLowerCase()
    const session = await getSession(from)

    // 1. Auth
    const { data: profile } = await supabase.from('profiles').select('*').eq('contact_number', from.replace(/\D/g, '')).single()
    if (!profile) {
      await sendText(from, `⚠️ Unauthorized: ${from}`)
      return NextResponse.json({ ok: true })
    }

    // 2. Menu Reset
    if (['hi', 'menu', 'start', 'cancel', 'back'].includes(input)) {
      await clearSession(from)
      await sendListMenu(from, `👋 ${profile.business_name || 'Owner'}`, "Manage your properties:", "Main Menu", [
        { title: "⚡ RECORD", rows: [{ id: "path_reading", title: "Submit Reading" }] },
        { title: "📊 REPORTS", rows: [{ id: "path_monthly", title: "Monthly Report" }, { id: "path_unpaid", title: "Unpaid Bills" }] },
        { title: "🔍 LOOKUP", rows: [{ id: "path_lookup", title: "Get Unit Bill" }, { id: "path_summary", title: "Property Summary" }] }
      ])
      return NextResponse.json({ ok: true })
    }

    // 3. Triggers
    if (listId === 'path_reading' || input === 'submit reading') {
      await updateSession(from, { step: 'awaiting_unit_reading' })
      return await sendText(from, "📝 Which Unit? (e.g. G01)")
    }
    
    if (listId === 'path_lookup' || input === 'get unit bill') {
      const { data: tenants } = await supabase.from('tenants').select('id, name, unit_id').eq('user_id', profile.id).eq('status', 'Active').limit(10)
      if (!tenants?.length) return await sendText(from, "🏠 No active tenants.")
      const { data: units } = await supabase.from('units').select('id, unit_number').in('id', tenants.map(t => t.unit_id))
      const uMap = Object.fromEntries((units || []).map(u => [u.id, u.unit_number]))
      await updateSession(from, { step: 'awaiting_tenant_selection' })
      return await sendListMenu(from, "🔍 Select Tenant", "Choose a tenant:", "Select", [{ 
        title: "TENANTS", 
        rows: tenants.map(t => ({ id: `tenant_${t.id}`, title: `${uMap[t.unit_id] || 'Unit'} - ${t.name}`.substring(0, 24) })) 
      }])
    }
    
    if (listId === 'path_summary' || input === 'property summary') {
      const { data: props } = await supabase.from('properties').select('name, units').eq('user_id', profile.id)
      return await sendText(from, props?.length ? `🏢 *Properties:*\n` + props.map(p => `• ${p.name}: ${p.units} units`).join('\n') : "🏠 No properties found.")
    }
    
    if (listId === 'path_monthly' || input === 'monthly report') {
      const rows = []
      for (let i = 0; i < 10; i++) {
        const d = new Date(); d.setMonth(d.getMonth() - i)
        rows.push({ id: `report_${d.toISOString().slice(0, 7)}`, title: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) })
      }
      await updateSession(from, { step: 'awaiting_report_month_selection' })
      return await sendListMenu(from, "📅 Monthly Report", "Select month:", "Select", [{ title: "MONTHS", rows }])
    }
    
    if (listId === 'path_unpaid' || input === 'unpaid bills') {
      const { data: bills } = await supabase.from('utility_bills').select(`total_amount, billing_month, tenant_id`).eq('user_id', profile.id).order('billing_month', { ascending: false })
      if (!bills?.length) return await sendText(from, "✅ No unpaid bills.")
      const { data: tenants } = await supabase.from('tenants').select('id, name, unit_id').in('id', bills.map(b => b.tenant_id))
      const tIds = (tenants || []).map(t => t.id)
      const { data: units } = tIds.length ? await supabase.from('units').select('id, unit_number').in('id', (tenants || []).map(t => t.unit_id)) : { data: [] }
      const tMap = Object.fromEntries((tenants || []).map(t => [t.id, t.name]))
      const uMap = Object.fromEntries((tenants || []).map(t => [t.id, (units || []).find(u => u.id === t.unit_id)?.unit_number || 'Unit']))
      let r = `🚩 *Outstanding Balances*\n\n`; let gt = 0
      const grouped = bills.reduce((acc, b) => { const k = b.billing_month; acc[k] = acc[k] || []; acc[k].push(b); return acc }, {})
      for (const [month, mBills] of Object.entries(grouped)) {
        let mt = 0; r += `📅 *${month}*\n`
        mBills.forEach(b => { r += `▫️ ${uMap[b.tenant_id] || 'Unit'} (${tMap[b.tenant_id] || 'Tenant'}): ₹${parseFloat(b.total_amount).toLocaleString()}\n`; mt += parseFloat(b.total_amount) })
        r += `💰 Subtotal: ₹${mt.toLocaleString()}\n\n`; gt += mt
      }
      return await sendText(from, r + `⭐ TOTAL: ₹${gt.toLocaleString()}`)
    }

    // 4. Session Steps
    if (session) {
      if (session.step === 'awaiting_unit_reading') {
        const unitNum = text.toUpperCase()
        const { data: unit } = await supabase.from('units').select('id, rent, tenants(id, name)').eq('unit_number', unitNum).single()
        if (!unit?.tenants?.[0]) return await sendText(from, `❌ Unit *${unitNum}* not found.`)
        const tenant = unit.tenants[0]
        const { data: last } = await supabase.from('utility_bills').select('curr_reading').eq('tenant_id', tenant.id).order('billing_month', { ascending: false }).limit(1).single()
        await updateSession(from, { step: 'awaiting_reading_value', unit_id: unit.id, unit_num: unitNum, tenant_name: tenant.name, tenant_id: tenant.id, prev_reading: last?.curr_reading || 0, rent: unit.rent })
        return await sendText(from, `👤 *Tenant:* ${tenant.name}\n📟 *Previous:* ${last?.curr_reading || 0}\n\nWhat is the *Current Reading*?`)
      }
      if (session.step === 'awaiting_reading_value') {
        const curr = parseFloat(text)
        if (isNaN(curr)) return await sendText(from, "❌ Send a valid number.")
        await updateSession(from, { step: 'awaiting_water_value', curr_reading: curr })
        return await sendButtons(from, `📟 *Current:* ${curr}`, ["Skip (140)", "Enter Custom"])
      }
      if (session.step === 'awaiting_water_value') {
        if (input === 'enter custom') return await sendText(from, "Type the amount:")
        const water = input === 'skip (140)' ? 140 : parseFloat(text)
        const total = parseFloat(session.rent) + Math.max((session.curr_reading - session.prev_reading) * 10, 150) + water
        await supabase.from('utility_bills').upsert({ user_id: profile.id, tenant_id: session.tenant_id, billing_month: new Date().toISOString().slice(0, 7), prev_reading: session.prev_reading, curr_reading: session.curr_reading, rate_per_unit: 10, fixed_rent: session.rent, water_bill: water, total_amount: total, due_date: new Date(new Date().getFullYear(), new Date().getMonth(), 10).toISOString().split('T')[0] })
        const upi = profile.upi_id ? `upi://pay?pa=${profile.upi_id}&pn=${encodeURIComponent(profile.business_name)}&am=${total}&cu=INR` : ''
        await sendText(from, `✅ *Bill Saved*\n💰 TOTAL: ₹${total.toLocaleString()}\n\n${upi ? `📲 *PAY LINK:*\n${upi}\n` : ''}`)
        return await clearSession(from)
      }
      if (session.step === 'awaiting_tenant_selection') {
        const tenantId = listId?.replace('tenant_', '')
        const { data: tenant } = await supabase.from('tenants').select('id, name, unit_id').eq('id', tenantId).single()
        const { data: unit } = await supabase.from('units').select('unit_number').eq('id', tenant?.unit_id).single()
        const { data: bills } = await supabase.from('utility_bills').select('billing_month').eq('tenant_id', tenantId).order('billing_month', { ascending: false }).limit(10)
        if (!bills?.length) { await sendText(from, `📭 No history for ${tenant?.name}.`); return await clearSession(from) }
        await updateSession(from, { step: 'awaiting_month_selection', tenant_id: tenantId, tenant_name: tenant?.name, unit_num: unit?.unit_number || 'Unit' })
        return await sendListMenu(from, `📅 Bills: ${tenant?.name}`, "Select month:", "Select Month", [{ title: "MONTHS", rows: bills.map(b => ({ id: `month_${b.billing_month}`, title: b.billing_month })) }])
      }
      if (session.step === 'awaiting_month_selection') {
        const month = listId?.replace('month_', '')
        const { data: bill } = await supabase.from('utility_bills').select('*').eq('tenant_id', session.tenant_id).eq('billing_month', month).single()
        if (bill) {
          const u = bill.curr_reading - bill.prev_reading; const l = Math.max(u * 10, 150); const upi = profile.upi_id ? `upi://pay?pa=${profile.upi_id}&pn=${encodeURIComponent(profile.business_name)}&am=${bill.total_amount}&cu=INR` : ''
          await sendText(from, `🧾 *Bill: ${session.unit_num}*\n👤 ${session.tenant_name}\n📅 ${month}\n📟 Reading: ${bill.prev_reading}➔${bill.curr_reading}\n▫️ Rent: ₹${parseFloat(bill.fixed_rent).toLocaleString()}\n▫️ Light: ₹${l.toLocaleString()}\n▫️ Water: ₹${parseFloat(bill.water_bill).toLocaleString()}\n💰 TOTAL: ₹${parseFloat(bill.total_amount).toLocaleString()}\n${upi ? `📲 *PAY LINK:*\n${upi}\n` : ''}`)
        }
        return await clearSession(from)
      }
      if (session.step === 'awaiting_report_month_selection') {
        await generateMonthlyReport(from, profile.id, listId?.replace('report_', ''))
        return await clearSession(from)
      }
    }

    await sendText(from, "❓ Send *Hi* for the menu.")
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('ERROR:', err); return NextResponse.json({ ok: true })
  }
}

async function generateMonthlyReport(from, profileId, targetMonth) {
  const { data: bills } = await supabase.from('utility_bills').select('*').eq('user_id', profileId).eq('billing_month', targetMonth)
  if (!bills?.length) return await sendText(from, `📭 No data for ${targetMonth}.`)
  const { data: tenants } = await supabase.from('tenants').select('id, name, unit_id').in('id', bills.map(b => b.tenant_id))
  const { data: units } = (tenants || []).length ? await supabase.from('units').select('id, unit_number').in('id', (tenants || []).map(t => t.unit_id)) : { data: [] }
  const tMap = Object.fromEntries((tenants || []).map(t => [t.id, t.name]))
  const uMap = Object.fromEntries((tenants || []).map(t => [t.id, (units || []).find(u => u.id === t.unit_id)?.unit_number || 'Unit']))
  let r = `📊 *Report: ${targetMonth}*\n\n`; let gt = 0
  bills.forEach(b => {
    const u = b.curr_reading - b.prev_reading; const l = Math.max(u * 10, 150); const t = parseFloat(b.fixed_rent) + l + parseFloat(b.water_bill)
    r += `🏠 *${uMap[b.tenant_id] || 'Unit'}* (${tMap[b.tenant_id] || 'Tenant'})\n▫️ Rent: ₹${parseFloat(b.fixed_rent).toLocaleString()}\n▫️ Light: ₹${l.toLocaleString()} (${u}u)\n▫️ Water: ₹${parseFloat(b.water_bill).toLocaleString()}\n💰 Total: ₹${t.toLocaleString()}\n_________________________\n\n`; gt += t
  })
  await sendText(from, r + `⭐ GRAND TOTAL: ₹${gt.toLocaleString()}`)
}

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN) return new Response(searchParams.get('hub.challenge'))
  return new Response('Error', { status: 403 })
}
