import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from "@google/generative-ai"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder'
const supabase = createClient(supabaseUrl, supabaseKey)

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "")
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" })

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
const sendFlow = (to, text, flowId, buttonLabel) => callWhatsApp(to, {
  type: "interactive",
  interactive: {
    type: "flow",
    header: { type: "text", text: "PropManager" },
    body: { text: text },
    footer: { text: "Advanced Forms" },
    action: {
      name: "flow",
      parameters: {
        flow_message_version: "3",
        flow_token: "unused",
        flow_id: flowId,
        flow_cta: buttonLabel,
        flow_action: "navigate",
        flow_action_payload: { screen: "SUBMIT_READING", data: {} }
      }
    }
  }
})
const sendButtons = (to, text, buttons) => callWhatsApp(to, {
  type: "interactive",
  interactive: {
    type: "button",
    body: { text: text.substring(0, 1024) },
    action: { buttons: buttons.slice(0, 3).map((b, i) => ({ type: "reply", reply: { id: `btn_${i}`, title: b.substring(0, 20) } })) }
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

// --- AI SEARCH HELPER ---
async function handleAISearch(from, profileId, userQuery) {
  if (!process.env.GEMINI_API_KEY) {
    console.error('AI Error: GEMINI_API_KEY is missing in environment variables.')
    return await sendText(from, "⚠️ AI Assistant is not configured. Please add the GEMINI_API_KEY to Vercel.")
  }

  try {
    // 1. Fetch current context from database
    const { data: tenants, error: tErr } = await supabase.from('tenants').select('name, status, unit_id, phone').eq('user_id', profileId)
    const { data: units, error: uErr } = await supabase.from('units').select('unit_number, rent, status, id').in('id', (tenants || []).map(t => t.unit_id))
    const { data: bills, error: bErr } = await supabase.from('utility_bills').select('billing_month, total_amount, tenant_id').eq('user_id', profileId).order('billing_month', { ascending: false }).limit(20)

    if (tErr || uErr || bErr) {
      console.error('Database Context Error:', { tErr, uErr, bErr })
    }

    // 2. Prepare context for Gemini
    const context = {
      tenants: tenants?.map(t => ({ name: t.name, status: t.status, unit: units?.find(u => u.id === t.unit_id)?.unit_number })),
      units: units?.map(u => ({ number: u.unit_number, rent: u.rent, status: u.status })),
      recent_bills: bills?.map(b => ({ month: b.billing_month, amount: b.total_amount, tenant: tenants?.find(t => t.id === b.tenant_id)?.name }))
    }

    const systemPrompt = `You are an AI Property Assistant for PropManager. 
    Use the following database context to answer the user's question accurately and concisely.
    Context: ${JSON.stringify(context)}
    
    Guidelines:
    - If you don't know the answer based on the context, say "I don't have that information."
    - Be professional but friendly.
    - Format amounts with ₹ and thousands separator.
    - User Query: ${userQuery}`

    const result = await model.generateContent(systemPrompt)
    const answer = result.response.text()
    
    await sendText(from, `🤖 *AI Assistant*\n\n${answer}`)
  } catch (err) {
    console.error('AI Error:', err)
    await sendText(from, "⚠️ AI Assistant is currently unavailable. Try using the menus.")
  }
}

// --- MAIN BOT ---
export async function POST(req) {
  try {
    const body = await req.json()
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
    if (!message) return NextResponse.json({ ok: true })

    const from = message.from
    const cleanPhone = from.replace(/\D/g, '')

    // 1. Auth Owner
    const { data: profile } = await supabase.from('profiles').select('*').eq('contact_number', cleanPhone).single()
    if (!profile) {
      await sendText(from, `⚠️ Unauthorized: ${cleanPhone}`)
      return NextResponse.json({ ok: true })
    }

    // 2. Handle Flow Response (Advanced Form)
    if (message.type === 'interactive' && message.interactive?.type === 'nfm_reply') {
      const response = JSON.parse(message.interactive.nfm_reply.response_json)
      const { unit: unitNum, reading: curr, water: waterIn } = response
      
      const { data: unit } = await supabase.from('units').select('id, rent, tenants(id, name)').eq('unit_number', unitNum.toUpperCase()).single()
      if (!unit?.tenants?.[0]) return await sendText(from, `❌ Unit *${unitNum}* not found.`)
      
      const tenant = unit.tenants[0]
      const { data: last } = await supabase.from('utility_bills').select('curr_reading').eq('tenant_id', tenant.id).order('billing_month', { ascending: false }).limit(1).single()
      
      const prev = last?.curr_reading || 0
      const water = parseFloat(waterIn) || 140
      const electricity = Math.max((parseFloat(curr) - prev) * 10, 150)
      const total = parseFloat(unit.rent) + electricity + water

      await supabase.from('utility_bills').upsert({ 
        user_id: profile.id, 
        tenant_id: tenant.id, 
        billing_month: new Date().toISOString().slice(0, 7), 
        prev_reading: prev, 
        curr_reading: parseFloat(curr), 
        rate_per_unit: 10, 
        fixed_rent: unit.rent, 
        water_bill: water, 
        total_amount: total, 
        due_date: new Date(new Date().getFullYear(), new Date().getMonth(), 10).toISOString().split('T')[0] 
      })

      return await sendButtons(from, `✅ *Bill Recorded via Form*\n🏠 Unit: ${unitNum}\n👤 Tenant: ${tenant.name}\n💰 Total: ₹${total.toLocaleString()}`, ["Main Menu", "Submit Reading"])
    }

    const text = (message.text?.body || message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || "").trim()
    const listId = message.interactive?.list_reply?.id
    if (!from || !text) return NextResponse.json({ ok: true })

    const input = text.toLowerCase()

    // 3. Global Reset / Menu
    if (['hi', 'hello', 'menu', 'start', 'cancel', 'back', 'hey'].includes(input) || listId === 'nav_main') {
      await clearSession(from)
      await sendListMenu(from, `👋 PropManager Home`, "Manage your properties:", "Main Menu", [
        { title: "⚡ RECORD", rows: [{ id: "path_reading", title: "Submit Reading" }] },
        { title: "📊 REPORTS", rows: [{ id: "path_monthly", title: "Monthly Report" }, { id: "path_unpaid", title: "Unpaid Bills" }] },
        { title: "🔍 LOOKUP", rows: [{ id: "path_lookup", title: "Get Unit Bill" }, { id: "path_summary", title: "Property Summary" }] }
      ])
      return NextResponse.json({ ok: true })
    }

    const session = await getSession(from)

    // 4. Handle Active Session Steps (Legacy/Manual entry)
    if (session) {
      if (session.step === 'awaiting_unit_reading') {
        const unitNum = text.toUpperCase()
        const { data: unit } = await supabase.from('units').select('id, rent, tenants(id, name)').eq('unit_number', unitNum).single()
        if (!unit?.tenants?.[0]) return await sendText(from, `❌ Unit *${unitNum}* not found.`)
        
        const tenant = unit.tenants[0]
        const { data: last } = await supabase.from('utility_bills').select('curr_reading').eq('tenant_id', tenant.id).order('billing_month', { ascending: false }).limit(1).single()
        await updateSession(from, { step: 'awaiting_reading_value', unit_id: unit.id, unit_num: unitNum, tenant_name: tenant.name, tenant_id: tenant.id, prev_reading: last?.curr_reading || 0, rent: unit.rent })
        await sendText(from, `👤 *Tenant:* ${tenant.name}\n📟 *Previous:* ${last?.curr_reading || 0}\n\nWhat is the *Current Reading*?`)
        return NextResponse.json({ ok: true })
      }
      
      if (session.step === 'awaiting_reading_value') {
        const curr = parseFloat(text)
        if (isNaN(curr)) return await sendText(from, "❌ Send a number.")
        await updateSession(from, { step: 'awaiting_water_value', curr_reading: curr })
        await sendButtons(from, `📟 *Current:* ${curr}`, ["Skip (140)", "Enter Custom"])
        return NextResponse.json({ ok: true })
      }

      if (session.step === 'awaiting_water_value') {
        if (input === 'enter custom') return await sendText(from, "Type water amount:")
        const water = input === 'skip (140)' ? 140 : parseFloat(text)
        const total = parseFloat(session.rent) + Math.max((session.curr_reading - session.prev_reading) * 10, 150) + water
        await supabase.from('utility_bills').upsert({ user_id: profile.id, tenant_id: session.tenant_id, billing_month: new Date().toISOString().slice(0, 7), prev_reading: session.prev_reading, curr_reading: session.curr_reading, rate_per_unit: 10, fixed_rent: session.rent, water_bill: water, total_amount: total, due_date: new Date(new Date().getFullYear(), new Date().getMonth(), 10).toISOString().split('T')[0] })
        await clearSession(from)
        await sendButtons(from, `✅ *Bill Saved*\n💰 Total: ₹${total.toLocaleString()}`, ["Main Menu", "Submit Reading"])
        return NextResponse.json({ ok: true })
      }

      if (session.step === 'awaiting_tenant_selection') {
        const tenantId = listId?.replace('tenant_', '')
        if (!tenantId) return NextResponse.json({ ok: true })
        const { data: tenant } = await supabase.from('tenants').select('id, name, unit_id').eq('id', tenantId).single()
        const { data: unit } = await supabase.from('units').select('unit_number').eq('id', tenant?.unit_id).single()
        const { data: bills } = await supabase.from('utility_bills').select('billing_month').eq('tenant_id', tenantId).order('billing_month', { ascending: false }).limit(10)
        
        if (!bills?.length) {
          await clearSession(from)
          return await sendButtons(from, `📭 No history for ${tenant?.name}`, ["Main Menu", "Get Unit Bill"])
        }
        await updateSession(from, { step: 'awaiting_month_selection', tenant_id: tenantId, tenant_name: tenant?.name, unit_num: unit?.unit_number || 'Unit' })
        await sendListMenu(from, `📅 Bills: ${tenant?.name}`, "Select month:", "Select", [{ title: "MONTHS", rows: bills.map(b => ({ id: `month_${b.billing_month}`, title: b.billing_month })) }])
        return NextResponse.json({ ok: true })
      }

      if (session.step === 'awaiting_month_selection') {
        const month = listId?.replace('month_', '')
        if (!month) return NextResponse.json({ ok: true })
        const { data: bill } = await supabase.from('utility_bills').select('*').eq('tenant_id', session.tenant_id).eq('billing_month', month).single()
        if (bill) {
          const units = bill.curr_reading - bill.prev_reading
          const elecCharge = Math.max(units * bill.rate_per_unit, 150)
          const upi = profile.upi_id ? `upi://pay?pa=${profile.upi_id}&pn=${encodeURIComponent(profile.business_name)}&am=${bill.total_amount}&cu=INR` : ''

          const detail = `🧾 *Bill: ${month}*\n` +
                         `👤 *Tenant:* ${session.tenant_name}\n` +
                         `🏠 *Unit:* ${session.unit_num}\n` +
                         `_________________________\n` +
                         `🏠 *Rent:* ₹${parseFloat(bill.fixed_rent).toLocaleString()}\n` +
                         `⚡ *Elec:* ${bill.prev_reading} to ${bill.curr_reading} (${units} u) = ₹${elecCharge.toLocaleString()}\n` +
                         `💧 *Water:* ₹${parseFloat(bill.water_bill).toLocaleString()}\n` +
                         `_________________________\n` +
                         `💰 *TOTAL: ₹${parseFloat(bill.total_amount).toLocaleString()}*\n\n` +
                         (upi ? `📲 *PAY LINK:*\n${upi}\n` : '')

          await clearSession(from)
          await sendButtons(from, detail, ["Main Menu", "Get Unit Bill"])
        }
        return NextResponse.json({ ok: true })
      }


      if (session.step === 'awaiting_report_month_selection') {
        const monthCode = listId?.replace('report_', '')
        if (!monthCode) return NextResponse.json({ ok: true })
        await generateMonthlyReport(from, profile.id, monthCode)
        await clearSession(from)
        return NextResponse.json({ ok: true })
      }
    }

    // 5. Initial Triggers
    if (listId === 'path_reading' || input === 'submit reading') {
      const flowId = process.env.WHATSAPP_FLOW_ID
      if (flowId) {
        await sendFlow(from, "Record utility readings instantly using this form:", flowId, "Open Reading Form")
      } else {
        await updateSession(from, { step: 'awaiting_unit_reading' })
        await sendText(from, "📝 Which Unit? (e.g. G01)")
      }
      return NextResponse.json({ ok: true })
    }
    if (listId === 'path_lookup' || input === 'get unit bill') {
      const { data: tenants } = await supabase.from('tenants').select('id, name, unit_id').eq('user_id', profile.id).eq('status', 'Active')
      if (!tenants?.length) return await sendText(from, "🏠 No active tenants.")
      
      const { data: units } = await supabase.from('units').select('id, unit_number').in('id', tenants.map(t => t.unit_id))
      const uMap = Object.fromEntries((units || []).map(u => [u.id, u.unit_number]))
      await updateSession(from, { step: 'awaiting_tenant_selection' })
      await sendListMenu(from, "🔍 Select Tenant", "Choose a tenant:", "Select", [{ title: "ACTIVE", rows: tenants.map(t => ({ id: `tenant_${t.id}`, title: `${uMap[t.unit_id] || 'Unit'} - ${t.name}`.substring(0, 24) })) }])
      return NextResponse.json({ ok: true })
    }
    if (listId === 'path_summary' || input === 'property summary') {
      const { data: props } = await supabase.from('properties').select('name, units').eq('user_id', profile.id)
      await sendButtons(from, props?.length ? `🏢 *Properties:*\n` + props.map(p => `• ${p.name}: ${p.units}u`).join('\n') : "🏠 No properties.", ["Main Menu"])
      return NextResponse.json({ ok: true })
    }
    if (listId === 'path_monthly' || input === 'monthly report') {
      const rows = []
      for (let i = 0; i < 10; i++) {
        const d = new Date(); d.setMonth(d.getMonth() - i)
        rows.push({ id: `report_${d.toISOString().slice(0, 7)}`, title: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) })
      }
      await updateSession(from, { step: 'awaiting_report_month_selection' })
      await sendListMenu(from, "📅 Monthly Report", "Select month:", "Select", [{ title: "MONTHS", rows }])
      return NextResponse.json({ ok: true })
    }
    if (listId === 'path_unpaid' || input === 'unpaid bills') {
      const { data: bills } = await supabase.from('utility_bills').select(`total_amount, billing_month, tenant_id`).eq('user_id', profile.id).order('billing_month', { ascending: false })
      if (!bills?.length) return await sendButtons(from, "✅ All paid!", ["Main Menu"])
      
      const { data: tenants } = await supabase.from('tenants').select('id, name, unit_id').in('id', bills.map(b => b.tenant_id))
      const { data: units } = (tenants || []).length ? await supabase.from('units').select('id, unit_number').in('id', (tenants || []).map(t => t.unit_id)) : { data: [] }
      const tMap = Object.fromEntries((tenants || []).map(t => [t.id, t.name])); const uMap = Object.fromEntries((tenants || []).map(t => [t.id, (units || []).find(u => u.id === t.unit_id)?.unit_number || 'Unit']))
      let r = `🚩 *Outstanding*\n\n`; let gt = 0; const grouped = bills.reduce((acc, b) => { const k = b.billing_month; acc[k] = acc[k] || []; acc[k].push(b); return acc }, {})
      for (const [month, mBills] of Object.entries(grouped)) {
        let mt = 0; r += `📅 *${month}*\n`; mBills.forEach(b => { r += `▫️ ${uMap[b.tenant_id]} (${tMap[b.tenant_id]}): ₹${parseFloat(b.total_amount).toLocaleString()}\n`; mt += parseFloat(b.total_amount) })
        r += `💰 Subtotal: ₹${mt.toLocaleString()}\n\n`; gt += mt
      }
      await sendButtons(from, r + `⭐ TOTAL: ₹${gt.toLocaleString()}`, ["Main Menu"])
      return NextResponse.json({ ok: true })
    }

    // 6. AI Search Fallback
    await handleAISearch(from, profile.id, text)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Bot Error:', err)
    return NextResponse.json({ ok: true })
  }
}

async function generateMonthlyReport(from, profileId, targetMonth) {
  const { data: bills } = await supabase.from('utility_bills').select('*').eq('user_id', profileId).eq('billing_month', targetMonth)
  if (!bills?.length) return await sendButtons(from, `📭 No data for ${targetMonth}`, ["Main Menu", "Monthly Report"])
  
  const { data: tenants } = await supabase.from('tenants').select('id, name, unit_id').in('id', bills.map(b => b.tenant_id))
  const { data: units } = (tenants || []).length ? await supabase.from('units').select('id, unit_number').in('id', (tenants || []).map(t => t.unit_id)) : { data: [] }
  const tMap = Object.fromEntries((tenants || []).map(t => [t.id, t.name])); const uMap = Object.fromEntries((tenants || []).map(t => [t.id, (units || []).find(u => u.id === t.unit_id)?.unit_number || 'Unit']))
  
  let r = `📊 *Report: ${targetMonth}*\n\n`; let gt = 0
  bills.forEach(b => {
    const u = b.curr_reading - b.prev_reading
    const e = Math.max(u * b.rate_per_unit, 150)
    const t = parseFloat(b.total_amount)
    r += `🏠 *${uMap[b.tenant_id]}* (${tMap[b.tenant_id]})\n` +
         `   Rent: ₹${parseFloat(b.fixed_rent).toLocaleString()} | Elec: ₹${e.toLocaleString()}\n` +
         `   Water: ₹${parseFloat(b.water_bill).toLocaleString()} | *Total: ₹${t.toLocaleString()}*\n` +
         `_________________________\n\n`
    gt += t
  })
  await sendButtons(from, r + `⭐ *GRAND TOTAL: ₹${gt.toLocaleString()}*`, ["Main Menu", "Monthly Report"])
}

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN) return new Response(searchParams.get('hub.challenge'))
  return new Response('Error', { status: 403 })
}
