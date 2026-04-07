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
              { id: "path_monthly", title: "Monthly Report", description: "View detailed breakdown" },
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
      // PATH: SUBMIT READING (Steps)
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
        if (isNaN(curr)) return await sendText(from, "❌ Send a valid number for the reading.")
        if (curr < session.prev_reading) return await sendText(from, `❌ Current (${curr}) is lower than previous (${session.prev_reading}). Try again.`)
        await updateSession(from, { step: 'awaiting_water_value', curr_reading: curr })
        await sendButtons(from, `📟 *Current:* ${curr}\n📦 *Units:* ${curr - session.prev_reading}\n\nWhat is the *Water Bill*?`, ["Skip (140)", "Enter Custom"])
        return NextResponse.json({ ok: true })
      }

      if (session.step === 'awaiting_water_value') {
        if (input === 'enter custom') return await sendText(from, "Type the water bill amount:")
        const water = input === 'skip (140)' ? 140 : parseFloat(text)
        if (isNaN(water)) return await sendText(from, "❌ Send a valid number or click 'Skip'.")
        const lightUnits = session.curr_reading - session.prev_reading
        const lightBill = Math.max(lightUnits * 10, 150)
        const total = parseFloat(session.rent) + lightBill + water
        const month = new Date().toISOString().slice(0, 7)
        await supabase.from('utility_bills').upsert({
          user_id: profile.id, tenant_id: session.tenant_id, billing_month: month,
          prev_reading: session.prev_reading, curr_reading: session.curr_reading,
          rate_per_unit: 10, fixed_rent: session.rent, water_bill: water, total_amount: total,
          due_date: new Date(new Date().getFullYear(), new Date().getMonth(), 10).toISOString().split('T')[0]
        })
        const upi = profile.upi_id ? `upi://pay?pa=${profile.upi_id}&pn=${encodeURIComponent(profile.business_name)}&am=${total}&cu=INR` : ''
        await sendText(from, `✅ *Bill Saved*\n_________________________\n🏠 Unit: ${session.unit_num}\n👤 Tenant: ${session.tenant_name}\n📟 Reading: ${session.prev_reading}➔${session.curr_reading}\n\n▫️ Rent: ₹${parseFloat(session.rent).toLocaleString()}\n▫️ Light: ₹${lightBill.toLocaleString()}\n▫️ Water: ₹${water.toLocaleString()}\n💰 *TOTAL: ₹${total.toLocaleString()}*\n_________________________\n\n${upi ? `📲 *PAY LINK:*\n${upi}\n` : ''}_Type 'Menu' for more._`)
        await clearSession(from)
        return NextResponse.json({ ok: true })
      }

      // PATH: GET UNIT BILL (Hierarchical Selection)
      if (session.step === 'awaiting_tenant_selection') {
        const tenantId = listId.replace('tenant_', '')
        const { data: tenant } = await supabase.from('tenants').select('id, name, units(unit_number)').eq('id', tenantId).single()
        const { data: bills } = await supabase.from('utility_bills').select('billing_month').eq('tenant_id', tenantId).order('billing_month', { ascending: false }).limit(10)
        
        if (!bills?.length) {
          await sendText(from, `📭 No bill history found for *${tenant.name}*.`)
          await clearSession(from)
        } else {
          await updateSession(from, { step: 'awaiting_month_selection', tenant_id: tenantId, tenant_name: tenant.name, unit_num: tenant.units.unit_number })
          await sendListMenu(from, 
            `📅 Bills for ${tenant.name}`,
            "Select the billing month you want to view:",
            "Select Month",
            [{ title: "AVAILABLE MONTHS", rows: bills.map(b => ({ id: `month_${b.billing_month}`, title: b.billing_month })) }]
          )
        }
        return NextResponse.json({ ok: true })
      }

      if (session.step === 'awaiting_month_selection') {
        const month = listId.replace('month_', '')
        const { data: bill } = await supabase.from('utility_bills').select('*').eq('tenant_id', session.tenant_id).eq('billing_month', month).single()
        
        if (!bill) await sendText(from, `❌ Error retrieving bill for ${month}.`)
        else {
          const units = bill.curr_reading - bill.prev_reading
          const light = Math.max(units * 10, 150)
          const upi = profile.upi_id ? `upi://pay?pa=${profile.upi_id}&pn=${encodeURIComponent(profile.business_name)}&am=${bill.total_amount}&cu=INR` : ''
          await sendText(from, `🧾 *Bill: ${session.unit_num}*\n👤 Tenant: ${session.tenant_name}\n📅 Month: ${month}\n_________________________\n📟 Reading: ${bill.prev_reading}➔${bill.curr_reading} (${units}u)\n▫️ Rent: ₹${parseFloat(bill.fixed_rent).toLocaleString()}\n▫️ Light: ₹${light.toLocaleString()}\n▫️ Water: ₹${parseFloat(bill.water_bill).toLocaleString()}\n💰 *TOTAL: ₹${parseFloat(bill.total_amount).toLocaleString()}*\n_________________________\n\n${upi ? `📲 *PAY LINK:*\n${upi}\n` : ''}`)
        }
        await clearSession(from)
        return NextResponse.json({ ok: true })
      }

      // PATH: MONTHLY REPORT (Manual)
      if (session.step === 'awaiting_month_manual') {
        const manualMatch = input.match(/^(0[1-9]|1[0-2])[-/](20\d{2})$/)
        if (!manualMatch) return await sendText(from, "❌ Invalid format. Please use *MM-YYYY* (e.g., 01-2026).")
        await generateMonthlyReport(from, profile.id, `${manualMatch[2]}-${manualMatch[1]}`)
        await clearSession(from)
        return NextResponse.json({ ok: true })
      }
    }

    // 4. Initial Trigger Actions
    if (listId === 'path_reading' || input === 'submit reading') {
      await updateSession(from, { step: 'awaiting_unit_reading' })
      await sendText(from, "📝 *Reading Entry*\nWhich Unit? (e.g. G01)")
    }
    else if (listId === 'path_lookup' || input === 'get unit bill') {
      const { data: tenants } = await supabase.from('tenants').select('id, name, units(unit_number)').eq('user_id', profile.id).eq('status', 'Active').order('unit_id')
      if (!tenants?.length) return await sendText(from, "🏠 No active tenants found.")
      
      await updateSession(from, { step: 'awaiting_tenant_selection' })
      await sendListMenu(from, 
        "🔍 Bill Lookup",
        "Select a tenant to view their billing history:",
        "Select Tenant",
        [{ title: "ACTIVE TENANTS", rows: tenants.map(t => ({ id: `tenant_${t.id}`, title: `${t.units.unit_number} - ${t.name}` })) }]
      )
    }
    else if (listId === 'path_monthly' || input === 'monthly report') {
      const now = new Date(); const cur = now.toLocaleDateString('en-US',{month:'short',year:'numeric'}); const last = new Date(now.getFullYear(),now.getMonth()-1,1).toLocaleDateString('en-US',{month:'short',year:'numeric'})
      await sendButtons(from, "📅 *Detailed Report*\nSelect a month:", [cur, last, "Manual Entry"])
    }
    else if (input === 'manual entry') {
      await updateSession(from, { step: 'awaiting_month_manual' })
      await sendText(from, "⌨️ Type month in *MM-YYYY* (e.g. 01-2026):")
    }
    else if (input.match(/^([a-z]{3})\s*(20\d{2})$/)) {
      const monthsMap = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06', jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' }
      const match = input.match(/^([a-z]{3})\s*(20\d{2})$/)
      await generateMonthlyReport(from, profile.id, `${match[2]}-${monthsMap[match[1]]}`)
    }
    else if (listId === 'path_unpaid' || input === 'unpaid bills') {
      const { data: bills } = await supabase.from('utility_bills').select(`total_amount, billing_month, tenants (name, units (unit_number))`).eq('user_id', profile.id).order('billing_month', { ascending: false })
      if (!bills?.length) return await sendText(from, "✅ No unpaid bills found!")
      
      let r = `🚩 *Outstanding Balances (By Month)*\n_________________________\n\n`
      let grandTotal = 0
      const groupedByMonth = bills.reduce((acc, b) => { const k = b.billing_month; acc[k] = acc[k] || []; acc[k].push(b); return acc }, {})
      for (const [month, monthBills] of Object.entries(groupedByMonth)) {
        let monthTotal = 0
        const displayMonth = new Date(month + '-02').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        r += `📅 *${displayMonth}*\n`
        monthBills.forEach(b => { r += `▫️ ${b.tenants.units.unit_number} (${b.tenants.name}): ₹${parseFloat(b.total_amount).toLocaleString()}\n`; monthTotal += parseFloat(b.total_amount) })
        r += `💰 *Subtotal: ₹${monthTotal.toLocaleString()}*\n\n`; grandTotal += monthTotal
      }
      await sendText(from, r + `_________________________\n⭐ *TOTAL DUE: ₹${grandTotal.toLocaleString()}*`)
    }
    else if (listId === 'path_summary' || input === 'property summary') {
      const { data: props } = await supabase.from('properties').select('name, units').eq('user_id', profile.id)
      let m = props?.length ? `🏢 *Properties:*\n` + props.map(p => `• ${p.name}: ${p.units} units`).join('\n') : "🏠 No properties found."
      await sendText(from, m)
    }
    else { await sendText(from, "❓ Send *Hi* for menu.") }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(err); return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}

async function generateMonthlyReport(from, profileId, targetMonth) {
  const { data: bills } = await supabase.from('utility_bills').select(`fixed_rent, water_bill, total_amount, curr_reading, prev_reading, rate_per_unit, tenants (name, units (unit_number))`).eq('user_id', profileId).eq('billing_month', targetMonth)
  if (!bills?.length) return await sendText(from, `📭 No data for ${targetMonth}.`)
  let r = `📊 *Detailed Report: ${targetMonth}*\n_________________________\n\n`; let gt = 0
  bills.forEach(b => {
    const units = b.curr_reading - b.prev_reading; const light = Math.max(units * 10, 150); const t = parseFloat(b.fixed_rent) + light + parseFloat(b.water_bill)
    r += `🏠 *${b.tenants.units.unit_number}* (${b.tenants.name})\n▫️ Rent: ₹${parseFloat(b.fixed_rent).toLocaleString()}\n▫️ Light: ₹${light.toLocaleString()} (${units}u)\n▫️ Water: ₹${parseFloat(b.water_bill).toLocaleString()}\n💰 *Total: ₹${t.toLocaleString()}*\n_________________________\n\n`; gt += t
  })
  await sendText(from, r + `⭐ *GRAND TOTAL: ₹${gt.toLocaleString()}*`)
}

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN) return new Response(searchParams.get('hub.challenge'))
  return new Response('Error', { status: 403 })
}
