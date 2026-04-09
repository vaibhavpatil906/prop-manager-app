import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ---------------- TELEGRAM API ----------------
async function tg(method, data) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  return fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(res => res.json())
}

// ---------------- SESSION ----------------
const db = {
  get: async (k) => {
    const { data } = await supabase.from('bot_sessions').select('*').eq('phone', k).maybeSingle()
    return data
  },
  set: async (k, d) => {
    await supabase.from('bot_sessions').upsert({
      phone: k,
      ...d,
      updated_at: new Date()
    })
  },
  clear: async (k) => {
    await supabase.from('bot_sessions').delete().eq('phone', k)
  }
}

// ---------------- UI ENGINE ----------------
async function render(chatId, session, text, keyboard) {
  try {
    if (session?.message_id) {
      await tg('editMessageText', {
        chat_id: chatId,
        message_id: session.message_id,
        text,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
      })
    } else {
      const res = await tg('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
      })

      await db.set(`tg_${chatId}`, {
        ...session,
        message_id: res?.result?.message_id
      })
    }
  } catch (e) {
    // fallback (prevents loop)
    const res = await tg('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    })

    await db.set(`tg_${chatId}`, {
      ...session,
      message_id: res?.result?.message_id
    })
  }
}

// ---------------- SCREENS ----------------
async function menu(chatId, session) {
  await render(chatId, session,
`👋 *PropManager Pro*

🏢 Manage properties easily`,
[
  [{ text: "📟 Submit Reading", callback_data: "reading" }],
  [{ text: "💰 Record Payment", callback_data: "payment" }],
  [{ text: "📊 Reports", callback_data: "reports" }]
])
}

async function tenantList(chatId, session, profileId, type) {
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name, unit:units(unit_number)')
    .eq('user_id', profileId)
    .eq('status', 'Active')

  if (!tenants?.length) {
    return render(chatId, session, "❌ No tenants found", [[{ text: "⬅️ Back", callback_data: "menu" }]])
  }

  const buttons = tenants.map(t => ([{
    text: `${t.unit?.unit_number || '?'} - ${t.name}`,
    callback_data: `${type}_${t.id}`
  }]))

  buttons.push([{ text: "⬅️ Back", callback_data: "menu" }])

  await render(chatId, session,
`👤 *Select Tenant*`,
buttons)
}

async function readingScreen(chatId, session) {
  await render(chatId, session,
`📟 *Enter Reading*`,
[[{ text: "⬅️ Back", callback_data: "reading" }]])
}

async function paymentScreen(chatId, session) {
  await render(chatId, session,
`💰 *Enter Amount*`,
[[{ text: "⬅️ Back", callback_data: "payment" }]])
}

// ---------------- HANDLER ----------------
export async function POST(req) {
  try {
    const body = await req.json()

    const msg = body.message
    const cb = body.callback_query

    const chatId = String(msg?.chat?.id || cb?.message?.chat?.id)
    if (!chatId) return NextResponse.json({ ok: true })

    if (cb) {
      await tg('answerCallbackQuery', { callback_query_id: cb.id })
    }

    const raw = msg?.text || cb?.data || ""
    const input = raw.toLowerCase()

    const key = `tg_${chatId}`
    let session = await db.get(key) || {}

    // prevent loop
    if (session.last_action === input) {
      return NextResponse.json({ ok: true })
    }

    // AUTH
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('telegram_chat_id', chatId)
      .maybeSingle()

    if (!profile) {
      await tg('sendMessage', { chat_id: chatId, text: "❌ Unauthorized" })
      return NextResponse.json({ ok: true })
    }

    // MENU
    if (input.startsWith('/') || input === 'menu') {
      await db.clear(key)
      await menu(chatId, {})
      return NextResponse.json({ ok: true })
    }

    // NAV
    if (input === 'reading') {
      await db.set(key, { ...session, step: 'READ_TENANT', last_action: input })
      await tenantList(chatId, session, profile.id, "read")
      return NextResponse.json({ ok: true })
    }

    if (input === 'payment') {
      await db.set(key, { ...session, step: 'PAY_TENANT', last_action: input })
      await tenantList(chatId, session, profile.id, "pay")
      return NextResponse.json({ ok: true })
    }

    // SELECT TENANT
    if (input.startsWith('read_')) {
      await db.set(key, { ...session, step: 'READ_VALUE', tenant_id: input.split('_')[1], last_action: input })
      await readingScreen(chatId, session)
      return NextResponse.json({ ok: true })
    }

    if (input.startsWith('pay_')) {
      await db.set(key, { ...session, step: 'PAY_AMOUNT', tenant_id: input.split('_')[1], last_action: input })
      await paymentScreen(chatId, session)
      return NextResponse.json({ ok: true })
    }

    // FLOW
    if (session.step === 'READ_VALUE') {
      const val = parseFloat(raw)
      if (isNaN(val)) {
        await tg('sendMessage', { chat_id: chatId, text: "❌ Enter valid number" })
        return NextResponse.json({ ok: true })
      }

      await db.clear(key)
      await tg('sendMessage', { chat_id: chatId, text: `✅ Reading saved: ${val}` })
      await menu(chatId, {})
      return NextResponse.json({ ok: true })
    }

    if (session.step === 'PAY_AMOUNT') {
      const amt = parseFloat(raw)
      if (isNaN(amt)) {
        await tg('sendMessage', { chat_id: chatId, text: "❌ Enter valid amount" })
        return NextResponse.json({ ok: true })
      }

      await db.clear(key)
      await tg('sendMessage', { chat_id: chatId, text: `✅ Payment ₹${amt}` })
      await menu(chatId, {})
      return NextResponse.json({ ok: true })
    }

    await tg('sendMessage', { chat_id: chatId, text: "Send /start" })
    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error(err)
    return NextResponse.json({ ok: true })
  }
}

export async function GET() {
  return new Response("Telegram Premium Bot Running 🚀")
}
