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
  if (!token || !phoneId) return console.error('Missing WA Keys')
  
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: "whatsapp", to, ...messageData })
    })
    return res
  } catch (err) {
    console.error('WA Fetch Error:', err)
  }
}

const sendText = async (to, text) => await callWhatsApp(to, { type: "text", text: { body: text } })
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

// --- MAIN BOT HANDLER ---
export async function POST(req) {
  console.log('>>> WEBHOOK RECEIVED <<<')
  try {
    const body = await req.json()
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
    
    if (!message) {
      console.log('>>> No message found in body')
      return NextResponse.json({ ok: true })
    }

    const from = message.from
    console.log(`>>> Message from: ${from}`)

    // TEMPORARY: Auto-Auth for debugging (Will always show menu)
    const { data: profile } = await supabase.from('profiles').select('*').limit(1).single()
    
    await sendListMenu(from, `👋 PropManager Active`, "Connection Successful! Select an action:", "Menu", [
      { title: "⚡ RECORD", rows: [{ id: "path_reading", title: "Submit Reading" }] },
      { title: "📊 REPORTS", rows: [{ id: "path_unpaid", title: "Unpaid Bills" }] }
    ])
    
    console.log('>>> Menu sent successfully')
    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error('>>> CRITICAL ERROR:', err.message)
    return NextResponse.json({ ok: true })
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (token === process.env.WHATSAPP_VERIFY_TOKEN) return new Response(challenge, { status: 200 })
  return new Response('PropManager Bot is ONLINE. URL is correct.', { status: 200 })
}
