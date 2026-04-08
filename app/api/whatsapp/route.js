import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from "@google/generative-ai"

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

// --- AI ENGINE WITH AUTO-FALLBACK ---
async function handleAISearch(from, profileId, userQuery) {
  if (!process.env.GEMINI_API_KEY) return await sendText(from, "⚠️ AI Key Missing.")

  try {
    // 1. Fetch Context
    const { data: tenants } = await supabase.from('tenants').select('name, unit_id').eq('user_id', profileId)
    const { data: units } = await supabase.from('units').select('id, unit_number, rent')
    const context = (tenants || []).map(t => {
      const u = (units || []).find(un => un.id === t.unit_id)
      return `${t.name} is in unit ${u?.unit_number || '?'}. Rent: ₹${u?.rent || '?'}`
    }).join('. ')

    const prompt = `Assistant for PropManager. Context: ${context || 'Empty'}. Question: ${userQuery}. Instruction: 1 sentence answer.`

    // 2. Try multiple model names to solve 404 errors
    const models = ["gemini-pro", "gemini-1.5-flash", "gemini-1.0-pro"]
    let aiResponse = ""
    let success = false

    for (const modelName of models) {
      if (success) break
      try {
        const model = genAI.getGenerativeModel({ model: modelName })
        const result = await model.generateContent(prompt)
        aiResponse = result.response.text()
        success = true
      } catch (err) {
        console.error(`AI Fail (${modelName}):`, err.message)
      }
    }

    if (success) {
      await sendText(from, `🤖 *AI Assistant*\n\n${aiResponse}`)
    } else {
      await sendText(from, "🤖 Sorry, I couldn't reach my AI brain. Please use the Menu buttons below.")
    }
  } catch (err) {
    console.error('Final AI Error:', err)
  }
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
      await sendText(from, `⚠️ Unauthorized Number: ${cleanPhone}`)
      return NextResponse.json({ ok: true })
    }

    const text = (message.text?.body || message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || "").trim()
    const listId = message.interactive?.list_reply?.id
    const input = text.toLowerCase()

    // 2. Main Menu
    if (['hi', 'hello', 'menu', 'start', 'hey'].includes(input) || listId === 'nav_main') {
      await clearSession(from)
      await sendListMenu(from, `👋 PropManager Home`, "Select an action:", "Open Menu", [
        { title: "⚡ ACTIONS", rows: [{ id: "path_reading", title: "Submit Reading" }] },
        { title: "📊 REPORTS", rows: [{ id: "path_monthly", title: "Monthly Report" }, { id: "path_unpaid", title: "Unpaid Bills" }] },
        { title: "🔍 LOOKUP", rows: [{ id: "path_lookup", title: "Get Unit Bill" }, { id: "path_summary", title: "Property Summary" }] }
      ])
      return NextResponse.json({ ok: true })
    }

    // 3. Lookup Trigger
    if (listId === 'path_lookup' || input === 'get unit bill') {
      const { data: tenants } = await supabase.from('tenants').select('id, name, unit_id').eq('user_id', profile.id).eq('status', 'Active')
      const { data: units } = await supabase.from('units').select('id, unit_number').in('id', (tenants || []).map(t => t.unit_id))
      const uMap = Object.fromEntries((units || []).map(u => [u.id, u.unit_number]))
      await updateSession(from, { step: 'awaiting_tenant_selection' })
      return await sendListMenu(from, "🔍 Select Tenant", "Choose a tenant:", "Select", [{ title: "ACTIVE", rows: (tenants || []).map(t => ({ id: `tenant_${t.id}`, title: `${uMap[t.unit_id] || 'Unit'} - ${t.name}`.substring(0, 24) })) }])
    }

    // 4. Session Handling
    const session = await getSession(from)
    if (session) {
      if (session.step === 'awaiting_tenant_selection') {
        const tenantId = listId?.replace('tenant_', '')
        const { data: bills } = await supabase.from('utility_bills').select('billing_month').eq('tenant_id', tenantId).order('billing_month', { ascending: false }).limit(5)
        await updateSession(from, { step: 'awaiting_month_selection', tenant_id: tenantId })
        return await sendListMenu(from, `📅 Select Month`, "Choose a month:", "Select", [{ title: "MONTHS", rows: (bills || []).map(b => ({ id: `month_${b.billing_month}`, title: b.billing_month })) }])
      }
      if (session.step === 'awaiting_month_selection') {
        const month = listId?.replace('month_', '')
        const { data: bill } = await supabase.from('utility_bills').select('*').eq('tenant_id', session.tenant_id).eq('billing_month', month).single()
        if (bill) {
          const detail = `🧾 *Bill Breakdown (${month})*\n\n🏠 *Rent:* ₹${parseFloat(bill.fixed_rent).toLocaleString()}\n⚡ *Elec:* ₹${Math.max((bill.curr_reading - bill.prev_reading) * 10, 150).toLocaleString()}\n💧 *Water:* ₹${parseFloat(bill.water_bill).toLocaleString()}\n_________________________\n💰 *TOTAL: ₹${parseFloat(bill.total_amount).toLocaleString()}*`
          await clearSession(from)
          await sendButtons(from, detail, ["Main Menu", "Get Unit Bill"])
        }
        return NextResponse.json({ ok: true })
      }
    }

    // 5. Action Fallbacks
    if (listId === 'path_unpaid' || input === 'unpaid bills') {
      const { data: bills } = await supabase.from('utility_bills').select(`total_amount, billing_month, tenant_id`).eq('user_id', profile.id).order('billing_month', { ascending: false }).limit(10)
      let r = `🚩 Outstanding Bills:\n\n`; bills?.forEach(b => { r += `▫️ ${b.billing_month}: ₹${b.total_amount}\n` })
      return await sendButtons(from, r || "✅ All Paid.", ["Main Menu"])
    }

    // 6. AI Natural Language Search
    if (text.length > 2) {
      await handleAISearch(from, profile.id, text)
    }
    
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('SERVER ERROR:', err)
    return NextResponse.json({ ok: true })
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN) return new Response(searchParams.get('hub.challenge'))
  return new Response('Error', { status: 403 })
}
