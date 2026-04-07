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
  return fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: "whatsapp", to, ...messageData })
  })
}

const sendText = (to, text) => callWhatsApp(to, { type: "text", text: { body: text } })
const sendButtons = (to, text, buttons) => callWhatsApp(to, {
  type: "interactive",
  interactive: {
    type: "button",
    body: { text },
    action: { buttons: buttons.map((b, i) => ({ type: "reply", reply: { id: `btn_${i}`, title: b } })) }
  }
})
const sendListMenu = (to, header, body, buttonLabel, sections) => callWhatsApp(to, {
  type: "interactive",
  interactive: {
    type: "list",
    header: { type: "text", text: header },
    body: { text: body },
    footer: { text: "PropManager Assistant" },
    action: { button: buttonLabel, sections: sections }
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

    // 1. Auth Owner
    const { data: profile } = await supabase.from('profiles').select('*').eq('contact_number', from.replace(/\D/g, '')).single()
    if (!profile) {
      await sendText(from, `⚠️ Unauthorized Number: ${from}`)
      return NextResponse.json({ ok: true })
    }

    // 2. Main Menu / Reset
    if (['hi', 'menu', 'start', 'cancel', 'back'].includes(input)) {
      await clearSession(from)
      await sendListMenu(from, 
        `👋 Welcome, ${profile.business_name || 'Owner'}`,
        "Select an action to begin managing your properties:",
        "Main Menu",
        [
          { title: "⚡ RECORD", rows: [{ id: "path_reading", title: "Submit Reading", description: "Step-by-step entry" }] },
          { title: "📊 REPORTS", rows: [
              { id: "path_monthly", title: "Monthly Report", description: "Detailed breakdown" },
              { id: "path_unpaid", title: "Unpaid Bills", description: "Grouped by Month" }
          ]},
          { title: "🔍 LOOKUP", rows: [
              { id: "path_lookup", title: "Get Unit Bill", description: "Select Tenant & Month" },
              { id: "path_summary", title: "Property Summary", description: "Properties & Units" }
          ]}
        ]
      )
      return NextResponse.json({ ok: true })
    }

    // 3. Step-by-Step Logic
    if (session) {
      if (session.step === 'awaiting_unit_reading') {
        const unitNum = text.toUpperCase()
        const { data: unit } = await supabase.from('units').select('id, rent, tenants(id, name)').eq('unit_number', unitNum).single()
        if (!unit?.tenants?.[0]) return await sendText(from, `❌ Unit *${unitNum}* not found. Try again or type 'cancel'.`)
        const tenant = unit.tenants[0]
        const { data: last } = await supabase.from('utility_bills').select('curr_reading').eq('tenant_id', tenant.id).order('billing_month', { ascending: false }).limit(1).single()
        const prev = last?.curr_reading || 0
        await updateSession(from, { step: 'awaiting_reading_value', unit_id: unit.id, unit_num: unitNum, tenant_name: tenant.name, tenant_id: tenant.id, prev_reading: prev, rent: unit.rent })
        await sendText(from, `👤 *Tenant:* ${tenant.name}\n📟 *Previous:* ${prev}\n\nWhat is the *Current Reading*?`)
        return NextResponse.json({ ok: true })
      }

      if (session.step === 'awaiting_reading_value') {
        const curr = parseFloat(text)
        if (isNaN(curr)) return await sendText(from, "❌ Send a valid number.")
        await updateSession(from, { step: 'awaiting_water_value', curr_reading: curr })
        await sendButtons(from, `📟 *Current:* ${curr}\n📦 *Units:* ${curr - session.prev_reading}\n\nWhat is the *Water Bill*?`, ["Skip (140)", "Enter Custom"])
        return NextResponse.json({ ok: true })
      }

      if (session.step === 'awaiting_water_value') {
        if (input === 'enter custom') return await sendText(from, "Type the water bill amount:")
        const water = input === 'skip (140)' ? 140 : parseFloat(text)
        if (isNaN(water)) return await sendText(from, "❌ Invalid number.")
        const light = Math.max((session.curr_reading - session.prev_reading) * 10, 150)
        const total = parseFloat(session.rent) + light + water
        const currentMonthCode = new Date().toISOString().slice(0, 7)
        await supabase.from('utility_bills').upsert({
          user_id: profile.id, tenant_id: session.tenant_id, billing_month: currentMonthCode,
          prev_reading: session.prev_reading, curr_reading: session.curr_reading,
          rate_per_unit: 10, fixed_rent: session.rent, water_bill: water, total_amount: total,
          due_date: new Date(new Date().getFullYear(), new Date().getMonth(), 10).toISOString().split('T')[0]
        })
        const upi = profile.upi_id ? `upi://pay?pa=${profile.upi_id}&pn=${encodeURIComponent(profile.business_name)}&am=${total}&cu=INR` : ''
        await sendText(from, `✅ *Bill Saved*\n_________________________\n🏠 Unit: ${session.unit_num}\n👤 Tenant: ${session.tenant_name}\n💰 *TOTAL: ₹${total.toLocaleString()}*\n_________________________\n\n${upi ? `📲 *PAY LINK:*\n${upi}\n` : ''}_Type 'Menu' for more._`)
        await clearSession(from); return NextResponse.json({ ok: true })
      }

      if (session.step === 'awaiting_tenant_selection') {
        const tenantId = listId?.replace('tenant_', '')
        const { data: tenant } = await supabase.from('tenants').select('id, name, unit_id').eq('id', tenantId).single()
        const { data: unit } = await supabase.from('units').select('unit_number').eq('id', tenant?.unit_id).single()
        const { data: bills } = await supabase.from('utility_bills').select('billing_month').eq('tenant_id', tenantId).order('billing_month', { ascending: false }).limit(10)
        if (!bills?.length) { await sendText(from, `📭 No history for *${tenant?.name}*.`); await clearSession(from) }
        else {
          await updateSession(from, { step: 'awaiting_month_selection', tenant_id: tenantId, tenant_name: tenant?.name, unit_num: unit?.unit_number || 'Unit' })
          await sendListMenu(from, `📅 Bills: ${tenant?.name}`, "Select month:", "Select Month", [{ title: "MONTHS", rows: bills.map(b => ({ id: `month_${b.billing_month}`, title: b.billing_month })) }])
        }
        return NextResponse.json({ ok: true })
      }

      if (session.step === 'awaiting_month_selection') {
        const month = listId?.replace('month_', '')
        const { data: bill } = await supabase.from('utility_bills').select('*').eq('tenant_id', session.tenant_id).eq('billing_month', month).single()
        if (bill) {
          const units = bill.curr_reading - bill.prev_reading; const light = Math.max(units * 10, 150); const upi = profile.upi_id ? `upi://pay?pa=${profile.upi_id}&pn=${encodeURIComponent(profile.business_name)}&am=${bill.total_amount}&cu=INR` : ''
          await sendText(from, `🧾 *Bill: ${session.unit_num}*\n👤 Tenant: ${session.tenant_name}\n📅 Month: ${month}\n_________________________\n📟 Reading: ${bill.prev_reading}➔${bill.curr_reading}\n▫️ Rent: ₹${parseFloat(bill.fixed_rent).toLocaleString()}\n▫️ Light: ₹${light.toLocaleString()}\n▫️ Water: ₹${parseFloat(bill.water_bill).toLocaleString()}\n💰 *TOTAL: ₹${parseFloat(bill.total_amount).toLocaleString()}*\n_________________________\n\n${upi ? `📲 *PAY LINK:*\n${upi}\n` : ''}`)
        }
        await clearSession(from); return NextResponse.json({ ok: true })
      }

      if (session.step === 'awaiting_report_month_selection') {
        const monthCode = listId?.replace('report_', '')
        await generateMonthlyReport(from, profile.id, monthCode)
        await clearSession(from); return NextResponse.json({ ok: true })
      }
    }

    // 4. Initial Triggers
    if (listId === 'path_reading' || input === 'submit reading') {
      await updateSession(from, { step: 'awaiting_unit_reading' })
      await sendText(from, "📝 *Reading Entry*\nWhich Unit? (e.g. G01)")
    }
    else if (listId === 'path_lookup' || input === 'get unit bill') {
      const { data: tenants } = await supabase.from('tenants').select('id, name, unit_id').eq('user_id', profile.id).eq('status', 'Active')
      if (!tenants?.length) return await sendText(from, "🏠 No active tenants found.")
      const { data: units } = await supabase.from('units').select('id, unit_number').in('id', tenants.map(t => t.unit_id))
      const uMap = Object.fromEntries((units || []).map(u => [u.id, u.unit_number]))
      await updateSession(from, { step: 'awaiting_tenant_selection' })
      await sendListMenu(from, "🔍 Bill Lookup", "Select tenant:", "Select Tenant", [{ title: "ACTIVE TENANTS", rows: tenants.map(t => ({ id: `tenant_${t.id}`, title: `${uMap[t.unit_id] || 'Unit'} - ${t.name}` })) }])
    }
    else if (listId === 'path_summary' || input === 'property summary') {
      const { data: props } = await supabase.from('properties').select('name, units').eq('user_id', profile.id)
      if (!props?.length) await sendText(from, "🏠 No properties found.")
      else await sendText(from, `🏢 *Your Properties:*\n` + props.map(p => `• ${p.name}: ${p.units} units`).join('\n'))
    }
    else if (listId === 'path_monthly' || input === 'monthly report') {
      const rows = []
      for (let i = 0; i < 12; i++) {
        const d = new Date(); d.setMonth(d.getMonth() - i)
        rows.push({ id: `report_${d.toISOString().slice(0, 7)}`, title: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) })
      }
      await updateSession(from, { step: 'awaiting_report_month_selection' })
      await sendListMenu(from, "📅 Monthly Report", "Select month:", "Select Month", [{ title: "LAST 12 MONTHS", rows }])
    }
    else if (listId === 'path_unpaid' || input === 'unpaid bills') {
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
        let mt = 0; r += `📅 *${new Date(month + '-02').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}*\n`
        mBills.forEach(b => { r += `▫️ ${uMap[b.tenant_id] || 'Unit'} (${tMap[b.tenant_id] || 'Tenant'}): ₹${parseFloat(b.total_amount).toLocaleString()}\n`; mt += parseFloat(b.total_amount) })
        r += `💰 *Subtotal: ₹${mt.toLocaleString()}*\n\n`; gt += mt
      }
      await sendText(from, r + `⭐ *TOTAL: ₹${gt.toLocaleString()}*`)
    }
    else if (!session) await sendText(from, "❓ Send *Hi* for menu.")

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('SERVER ERROR:', err); return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}

async function generateMonthlyReport(from, profileId, targetMonth) {
  const { data: bills } = await supabase.from('utility_bills').select('*').eq('user_id', profileId).eq('billing_month', targetMonth)
  if (!bills?.length) return await sendText(from, `📭 No data for ${targetMonth}.`)
  
  const { data: tenants } = await supabase.from('tenants').select('id, name, unit_id').in('id', bills.map(b => b.tenant_id))
  const tIds = (tenants || []).map(t => t.id)
  const { data: units } = tIds.length ? await supabase.from('units').select('id, unit_number').in('id', (tenants || []).map(t => t.unit_id)) : { data: [] }
  const tMap = Object.fromEntries((tenants || []).map(t => [t.id, t.name]))
  const uMap = Object.fromEntries((tenants || []).map(t => [t.id, (units || []).find(u => u.id === t.unit_id)?.unit_number || 'Unit']))

  let r = `📊 *Report: ${targetMonth}*\n\n`; let gt = 0
  bills.forEach(b => {
    const u = b.curr_reading - b.prev_reading; const l = Math.max(u * 10, 150); const t = parseFloat(b.fixed_rent) + l + parseFloat(b.water_bill)
    r += `🏠 *${uMap[b.tenant_id] || 'Unit'}* (${tMap[b.tenant_id] || 'Tenant'})\n▫️ Rent: ₹${parseFloat(b.fixed_rent).toLocaleString()}\n▫️ Light: ₹${l.toLocaleString()} (${u}u)\n▫️ Water: ₹${parseFloat(b.water_bill).toLocaleString()}\n💰 *Total: ₹${t.toLocaleString()}*\n_________________________\n\n`; gt += t
  })
  await sendText(from, r + `⭐ *GRAND TOTAL: ₹${gt.toLocaleString()}*`)
}

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN) return new Response(searchParams.get('hub.challenge'))
  return new Response('Error', { status: 403 })
}
