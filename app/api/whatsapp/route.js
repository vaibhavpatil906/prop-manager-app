import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from "@google/generative-ai"

// --- SINGLETON INITIALIZATION (SAVES TIME) ---
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder'
)

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "")

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

// --- OPTIMIZED AI ENGINE ---
async function handleAISearch(from, profileId, userQuery) {
  if (!process.env.GEMINI_API_KEY) return await sendText(from, "⚠️ AI Not Configured.")

  try {
    // 1. Fetch minimal context needed for the query
    const [ { data: tenants }, { data: units }, { data: maint } ] = await Promise.all([
      supabase.from('tenants').select('id, name, unit_id, phone').eq('user_id', profileId),
      supabase.from('units').select('id, unit_number, rent, status'),
      supabase.from('maintenance_requests').select('id, status, description, tenant_id').limit(15)
    ])

    // 2. Define Tools
    const tools = [{
      functionDeclarations: [
        { name: "update_rent", description: "Change rent for a unit", parameters: { type: "OBJECT", properties: { unit: { type: "STRING" }, rent: { type: "NUMBER" } }, required: ["unit", "rent"] } },
        { name: "update_maintenance", description: "Update status of repair", parameters: { type: "OBJECT", properties: { unit: { type: "STRING" }, status: { type: "STRING" } }, required: ["unit", "status"] } },
        { name: "mark_paid", description: "Mark a month as paid", parameters: { type: "OBJECT", properties: { unit: { type: "STRING" }, month: { type: "STRING" } }, required: ["unit", "month"] } }
      ]
    }]

    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash", // Use stable flash for speed
      systemInstruction: `You are the PropManager Assistant. Context: ${JSON.stringify({ tenants, units, maint })}. 
      - Always prioritize using tools for updates. 
      - If searching, give direct, short answers. 
      - If updating, call the function first.`
    })

    const result = await model.generateContent(userQuery)
    const call = result.response.functionCalls()?.[0]

    if (call) {
      const { name, args } = call
      let msg = ""

      if (name === "update_rent") {
        const u = units?.find(x => x.unit_number.toUpperCase() === args.unit.toUpperCase())
        if (u) {
          const { error } = await supabase.from('units').update({ rent: args.rent }).eq('id', u.id)
          msg = error ? `❌ DB Error: ${error.message}` : `✅ Rent for ${args.unit} updated to ₹${args.rent}.`
        } else msg = `❌ Unit ${args.unit} not found.`
      }

      if (name === "update_maintenance") {
        const u = units?.find(x => x.unit_number.toUpperCase() === args.unit.toUpperCase())
        const t = tenants?.find(x => x.unit_id === u?.id)
        const req = maint?.find(x => x.tenant_id === t?.id && x.status !== 'Completed')
        if (req) {
          await supabase.from('maintenance_requests').update({ status: args.status }).eq('id', req.id)
          msg = `✅ Maintenance for ${args.unit} is now: ${args.status}.`
        } else msg = `❌ No active maintenance request for ${args.unit}.`
      }

      if (name === "mark_paid") {
        const u = units?.find(x => x.unit_number.toUpperCase() === args.unit.toUpperCase())
        const t = tenants?.find(x => x.unit_id === u?.id)
        if (t) {
          await supabase.from('payments').upsert({ tenant_id: t.id, billing_month: args.month, payment_status: 'Paid' })
          msg = `✅ Payment for ${args.unit} (${args.month}) marked as Paid.`
        } else msg = `❌ Tenant for unit ${args.unit} not found.`
      }

      return await sendText(from, `🤖 *AI Update*\n\n${msg}`)
    }

    // Direct text response
    await sendText(from, `🤖 *AI Assistant*\n\n${result.response.text()}`)
  } catch (err) {
    console.error('AI Error:', err)
    await sendText(from, "⚠️ AI temporarily busy. Please use the Menu.")
  }
}

// --- MAIN WEBHOOK HANDLER ---
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

    // 2. Handle Form Submission (WhatsApp Flows)
    if (message.type === 'interactive' && message.interactive?.type === 'nfm_reply') {
      const response = JSON.parse(message.interactive.nfm_reply.response_json)
      const { unit: unitNum, reading: curr, water: waterIn } = response
      const { data: unit } = await supabase.from('units').select('id, rent, tenants(id, name)').eq('unit_number', unitNum.toUpperCase()).single()
      if (!unit?.tenants?.[0]) return await sendText(from, `❌ Unit *${unitNum}* not found.`)
      
      const tenant = unit.tenants[0]
      const { data: last } = await supabase.from('utility_bills').select('curr_reading').eq('tenant_id', tenant.id).order('billing_month', { ascending: false }).limit(1).single()
      const prev = last?.curr_reading || 0
      const water = parseFloat(waterIn) || 140
      const total = parseFloat(unit.rent) + Math.max((parseFloat(curr) - prev) * 10, 150) + water

      await supabase.from('utility_bills').upsert({ user_id: profile.id, tenant_id: tenant.id, billing_month: new Date().toISOString().slice(0, 7), prev_reading: prev, curr_reading: parseFloat(curr), rate_per_unit: 10, fixed_rent: unit.rent, water_bill: water, total_amount: total, due_date: new Date(new Date().getFullYear(), new Date().getMonth(), 10).toISOString().split('T')[0] })
      await sendButtons(from, `✅ *Recorded*\n💰 Total: ₹${total.toLocaleString()}`, ["Main Menu", "Submit Reading"])
      return NextResponse.json({ ok: true })
    }

    const text = (message.text?.body || message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || "").trim()
    const listId = message.interactive?.list_reply?.id
    if (!from || !text) return NextResponse.json({ ok: true })

    const input = text.toLowerCase()

    // 3. Main Menu Trigger (Explicit only)
    if (['hi', 'hello', 'menu', 'start', 'hey'].includes(input) || listId === 'nav_main') {
      await clearSession(from)
      await sendListMenu(from, `👋 PropManager Home`, "Quick Actions:", "Select Option", [
        { title: "⚡ RECORD", rows: [{ id: "path_reading", title: "Submit Reading" }] },
        { title: "📊 REPORTS", rows: [{ id: "path_monthly", title: "Monthly Report" }, { id: "path_unpaid", title: "Unpaid Bills" }] },
        { title: "🔍 LOOKUP", rows: [{ id: "path_lookup", title: "Get Unit Bill" }, { id: "path_summary", title: "Property Summary" }] }
      ])
      return NextResponse.json({ ok: true })
    }

    const session = await getSession(from)

    // 4. Manual Session Handling (Fallback)
    if (session) {
      if (session.step === 'awaiting_unit_reading') {
        const { data: unit } = await supabase.from('units').select('id, rent, tenants(id, name)').eq('unit_number', text.toUpperCase()).single()
        if (!unit?.tenants?.[0]) return await sendText(from, `❌ Unit not found.`)
        const { data: last } = await supabase.from('utility_bills').select('curr_reading').eq('tenant_id', unit.tenants[0].id).order('billing_month', { ascending: false }).limit(1).single()
        await updateSession(from, { step: 'awaiting_reading_value', unit_id: unit.id, prev_reading: last?.curr_reading || 0, rent: unit.rent, tenant_id: unit.tenants[0].id })
        return await sendText(from, `📟 Previous: ${last?.curr_reading || 0}. What is current?`)
      }
      // ... (rest of manual steps)
    }

    // 5. Explicit Action Triggers
    if (listId === 'path_reading' || input === 'submit reading') {
      const flowId = process.env.WHATSAPP_FLOW_ID
      if (flowId) await sendFlow(from, "Open reading form:", flowId, "Open Form")
      else { await updateSession(from, { step: 'awaiting_unit_reading' }); await sendText(from, "Which Unit?") }
      return NextResponse.json({ ok: true })
    }
    if (listId === 'path_lookup' || input === 'get unit bill') {
      const { data: tenants } = await supabase.from('tenants').select('id, name, unit_id').eq('user_id', profile.id).eq('status', 'Active')
      if (!tenants?.length) return await sendText(from, "No active tenants.")
      const { data: units } = await supabase.from('units').select('id, unit_number').in('id', tenants.map(t => t.unit_id))
      const uMap = Object.fromEntries((units || []).map(u => [u.id, u.unit_number]))
      await updateSession(from, { step: 'awaiting_tenant_selection' })
      return await sendListMenu(from, "🔍 Select Tenant", "Choose:", "Select", [{ title: "ACTIVE", rows: tenants.map(t => ({ id: `tenant_${t.id}`, title: `${uMap[t.unit_id] || 'Unit'} - ${t.name}` })) }])
    }
    if (listId === 'path_unpaid' || input === 'unpaid bills') {
      const { data: bills } = await supabase.from('utility_bills').select(`total_amount, billing_month, tenant_id`).eq('user_id', profile.id).order('billing_month', { ascending: false }).limit(10)
      let r = `🚩 Outstanding Bills:\n\n`; bills?.forEach(b => { r += `▫️ ${b.billing_month}: ₹${b.total_amount}\n` })
      return await sendButtons(from, r || "✅ All Paid.", ["Main Menu"])
    }

    // 6. Final AI Processing (Catch-all for natural language)
    await handleAISearch(from, profile.id, text)
    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error('Critical Bot Error:', err)
    return NextResponse.json({ ok: true })
  }
}

async function generateMonthlyReport(from, profileId, targetMonth) {
  const { data: bills } = await supabase.from('utility_bills').select('*').eq('user_id', profileId).eq('billing_month', targetMonth)
  let r = `📊 Report: ${targetMonth}\n\n`; let gt = 0
  bills?.forEach(b => { r += `🏠 Unit: ₹${b.total_amount}\n`; gt += parseFloat(b.total_amount) })
  await sendButtons(from, r + `⭐ TOTAL: ₹${gt}`, ["Main Menu", "Monthly Report"])
}

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN) return new Response(searchParams.get('hub.challenge'))
  return new Response('Error', { status: 403 })
}
