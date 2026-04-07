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
// We'll use a 'bot_sessions' table to track steps. 
// If it doesn't exist, the code handles it gracefully or you can create it in Supabase.
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
      await sendText(from, `⚠️ Unauthorized: ${from}`)
      return NextResponse.json({ ok: true })
    }

    // 2. Main Menu / Reset
    if (['hi', 'menu', 'start', 'cancel'].includes(input)) {
      await clearSession(from)
      await sendListMenu(from, 
        `👋 Welcome, ${profile.business_name || 'Owner'}`,
        "Select an action to begin:",
        "Open Menu",
        [
          { title: "⚡ RECORD", rows: [{ id: "path_reading", title: "Submit Reading", description: "Step-by-step entry" }] },
          { title: "📊 REPORTS", rows: [
              { id: "path_monthly", title: "Monthly Report", description: "Detailed summary" },
              { id: "path_unpaid", title: "Unpaid Bills", description: "All outstanding" }
          ]},
          { title: "🔍 LOOKUP", rows: [{ id: "path_lookup", title: "Get Unit Bill", description: "Quick search" }] }
        ]
      )
      return NextResponse.json({ ok: true })
    }

    // 3. Step-by-Step Logic
    if (session) {
      // STEP: ENTERING UNIT
      if (session.step === 'awaiting_unit') {
        const unitNum = text.toUpperCase()
        const { data: unit } = await supabase.from('units').select('id, rent, tenants(id, name)').eq('unit_number', unitNum).single()
        
        if (!unit?.tenants?.[0]) return await sendText(from, `❌ Unit *${unitNum}* not found. Try again or type 'cancel'.`)
        
        const tenant = unit.tenants[0]
        const { data: last } = await supabase.from('utility_bills').select('curr_reading').eq('tenant_id', tenant.id).order('billing_month', { ascending: false }).limit(1).single()
        const prev = last?.curr_reading || 0

        await updateSession(from, { step: 'awaiting_reading', unit_id: unit.id, unit_num: unitNum, tenant_name: tenant.name, tenant_id: tenant.id, prev_reading: prev, rent: unit.rent })
        await sendText(from, `👤 *Tenant:* ${tenant.name}\n📟 *Previous Reading:* ${prev}\n\nWhat is the *Current Reading*?`)
        return NextResponse.json({ ok: true })
      }

      // STEP: ENTERING READING
      if (session.step === 'awaiting_reading') {
        const curr = parseFloat(text)
        if (isNaN(curr)) return await sendText(from, "❌ Please send a valid number for the reading.")
        if (curr < session.prev_reading) return await sendText(from, `❌ Current (${curr}) cannot be lower than previous (${session.prev_reading}). Try again.`)

        await updateSession(from, { step: 'awaiting_water', curr_reading: curr })
        await sendButtons(from, `📟 *Current:* ${curr}\n📦 *Units Used:* ${curr - session.prev_reading}\n\nWhat is the *Water Bill*?`, ["Skip (140)", "Enter Custom"])
        return NextResponse.json({ ok: true })
      }

      // STEP: ENTERING WATER
      if (session.step === 'awaiting_water') {
        if (input === 'enter custom') return await sendText(from, "Please type the water bill amount:")
        
        const water = input === 'skip (140)' ? 140 : parseFloat(text)
        if (isNaN(water)) return await sendText(from, "❌ Please send a valid number or click 'Skip'.")

        // FINAL CALCULATION
        const energyUnits = session.curr_reading - session.prev_reading
        const light = Math.max(energyUnits * 10, 150)
        const total = parseFloat(session.rent) + light + water
        const month = new Date().toISOString().slice(0, 7)

        await supabase.from('utility_bills').upsert({
          user_id: profile.id, tenant_id: session.tenant_id, billing_month: month,
          prev_reading: session.prev_reading, curr_reading: session.curr_reading,
          rate_per_unit: 10, fixed_rent: session.rent, water_bill: water, total_amount: total,
          due_date: new Date(new Date().getFullYear(), new Date().getMonth(), 10).toISOString().split('T')[0]
        })

        const upi = profile.upi_id ? `upi://pay?pa=${profile.upi_id}&pn=${encodeURIComponent(profile.business_name)}&am=${total}&cu=INR` : ''
        const summary = `✅ *Bill Generated*\n_________________________\n` +
                        `🏠 Unit: ${session.unit_num}\n👤 Tenant: ${session.tenant_name}\n📟 Reading: ${session.prev_reading}➔${session.curr_reading}\n\n` +
                        `▫️ Rent: ₹${parseFloat(session.rent).toLocaleString()}\n▫️ Light: ₹${light.toLocaleString()}\n▫️ Water: ₹${water.toLocaleString()}\n` +
                        `💰 *TOTAL: ₹${total.toLocaleString()}*\n_________________________\n\n${upi ? `📲 *PAY LINK:*\n${upi}\n` : ''}_Send 'Hi' for Menu._`
        
        await sendText(from, summary)
        await clearSession(from)
        return NextResponse.json({ ok: true })
      }
    }

    // 4. Initial Triggers
    if (listId === 'path_reading' || input === 'submit reading') {
      await updateSession(from, { step: 'awaiting_unit' })
      await sendText(from, "📝 *Step 1: Property Unit*\nWhich unit are you recording for? (e.g. G01)")
    }
    else if (listId === 'path_monthly' || input === 'monthly report') {
      const now = new Date()
      const cur = now.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      const last = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      await sendButtons(from, "📅 *Detailed Report*\nSelect a month:", [cur, last, "Manual MM-YYYY"])
    }
    else if (listId === 'path_unpaid' || input === 'unpaid bills') {
      const { data: unpaid } = await supabase.from('utility_bills').select(`total_amount, billing_month, tenants (name, units (unit_number))`).eq('user_id', profile.id).order('billing_month', { ascending: false })
      let r = `🚩 *Outstanding Balances*\n\n`; let gt = 0
      const g = unpaid?.reduce((acc, b) => { const k = `${b.tenants.units.unit_number} - ${b.tenants.name}`; acc[k] = acc[k] || []; acc[k].push(b); return acc }, {})
      for (const [t, bs] of Object.entries(g || {})) {
        let bt = 0; r += `👤 *${t}*\n`; bs.forEach(b => { r += `▫️ ${b.billing_month}: ₹${parseFloat(b.total_amount).toLocaleString()}\n`; bt += parseFloat(b.total_amount) })
        r += `💰 *Balance: ₹${bt.toLocaleString()}*\n\n`; gt += bt
      }
      await sendText(from, r + `_________________________\n⭐ *TOTAL DUE: ₹${gt.toLocaleString()}*`)
    }
    else if (listId === 'path_lookup' || input === 'get unit bill') {
      await updateSession(from, { step: 'awaiting_unit_lookup' })
      await sendText(from, "🔍 Which unit would you like to lookup?")
    }
    // (Additional lookup logic can follow same pattern)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(err); return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN) return new Response(searchParams.get('hub.challenge'))
  return new Response('Error', { status: 403 })
}
