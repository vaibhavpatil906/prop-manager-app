import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ---------------- TELEGRAM API ----------------
async function callTelegram(method, data) {
  const token = process.env.TELEGRAM_BOT_TOKEN

  return fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(res => res.json())
}

// ---------------- UI ENGINE ----------------
const tgUI = {
  send: async (chatId, text, keyboard) => {
    const res = await callTelegram('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    })
    return res?.result?.message_id
  },

  edit: async (chatId, messageId, text, keyboard) => {
    return callTelegram('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    })
  }
}

// ---------------- SESSION ----------------
const db = {
  get: async (k) => {
    const { data } = await supabase.from('bot_sessions').select('*').eq('phone', k).maybeSingle()
    return data
  },
  set: (k, d) => supabase.from('bot_sessions').upsert({ phone: k, ...d, updated_at: new Date() }),
  clear: (k) => supabase.from('bot_sessions').delete().eq('phone', k)
}

// ---------------- SCREEN RENDER ----------------
async function render(chatId, session, text, keyboard) {
  if (session?.message_id) {
    await tgUI.edit(chatId, session.message_id, text, keyboard)
  } else {
    const msgId = await tgUI.send(chatId, text, keyboard)
    await db.set(`tg_${chatId}`, { message_id: msgId })
  }
}

// ---------------- SCREENS ----------------

// MAIN MENU
async function showMenu(chatId, session) {
  await render(chatId, session,
`👋 *PropManager Pro*

🏢 Manage your property

Choose action:`,
[
  [{ text: "📟 Submit Reading", callback_data: "reading" }],
  [{ text: "💰 Record Payment", callback_data: "payment" }],
  [{ text: "📊 Reports", callback_data: "reports" }]
])
}

// TENANT LIST
async function showTenants(chatId, session, profileId, step) {
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name, unit:units(unit_number)')
    .eq('user_id', profileId)
    .eq('status', 'Active')

  if (!tenants?.length) {
    return render(chatId, session, "❌ No tenants found", [[{ text: "⬅️ Back", callback_data: "menu" }]])
  }

  const keyboard = tenants.map(t => ([{
    text: `${t.unit?.unit_number || '?'} - ${t.name}`,
    callback_data: `${step}_${t.id}`
  }]))

  keyboard.push([{ text: "⬅️ Back", callback_data: "menu" }])

  await render(chatId, session,
`👤 *Select Tenant*

Choose from list:`,
keyboard)
}

// READING INPUT
async function showReadingInput(chatId, session) {
  await render(chatId, session,
`📟 *Submit Reading*

👤 Tenant selected

Enter current reading:`,
[
  [{ text: "⬅️ Back", callback_data: "reading" }]
])
}

// PAYMENT INPUT
async function showPaymentInput(chatId, session) {
  await render(chatId, session,
`💰 *Record Payment*

Enter amount:`,
[
  [{ text: "⬅️ Back", callback_data: "payment" }]
])
}

// ---------------- MAIN HANDLER ----------------
export async function POST(req) {
  try {
    const body = await req.json()

    const msg = body.message
    const cb = body.callback_query

    const chatId = String(msg?.chat?.id || cb?.message?.chat?.id)
    if (!chatId) return NextResponse.json({ ok: true })

    if (cb) {
      await callTelegram('answerCallbackQuery', { callback_query_id: cb.id })
    }

    const raw = msg?.text || cb?.data || ""
    const input = raw.toLowerCase()

    const sessionKey = `tg_${chatId}`
    const session = await db.get(sessionKey)

    // AUTH (IMPORTANT)
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('telegram_chat_id', chatId)
      .maybeSingle()

    if (!profile) {
      await callTelegram('sendMessage', {
        chat_id: chatId,
        text: "❌ Unauthorized user"
      })
      return NextResponse.json({ ok: true })
    }

    // ---------------- MENU ----------------
    if (input.startsWith('/') || input === 'menu') {
      await db.clear(sessionKey)
      await showMenu(chatId, {})
      return NextResponse.json({ ok: true })
    }

    // ---------------- NAVIGATION ----------------
    if (input === 'reading') {
      await db.set(sessionKey, { step: 'READ_TENANT' })
      await showTenants(chatId, session, profile.id, "read")
      return NextResponse.json({ ok: true })
    }

    if (input === 'payment') {
      await db.set(sessionKey, { step: 'PAY_TENANT' })
      await showTenants(chatId, session, profile.id, "pay")
      return NextResponse.json({ ok: true })
    }

    if (input === 'menu') {
      await db.clear(sessionKey)
      await showMenu(chatId, session)
      return NextResponse.json({ ok: true })
    }

    // ---------------- TENANT SELECT ----------------
    if (input.startsWith('read_')) {
      const tenantId = input.replace('read_', '')

      await db.set(sessionKey, {
        step: 'READ_VALUE',
        tenant_id: tenantId
      })

      await showReadingInput(chatId, session)
      return NextResponse.json({ ok: true })
    }

    if (input.startsWith('pay_')) {
      const tenantId = input.replace('pay_', '')

      await db.set(sessionKey, {
        step: 'PAY_AMOUNT',
        tenant_id: tenantId
      })

      await showPaymentInput(chatId, session)
      return NextResponse.json({ ok: true })
    }

    // ---------------- FLOW ----------------
    if (session) {

      if (session.step === 'READ_VALUE') {
        const val = parseFloat(raw)

        if (isNaN(val)) {
          await callTelegram('sendMessage', {
            chat_id: chatId,
            text: "❌ Enter valid number"
          })
          return NextResponse.json({ ok: true })
        }

        await db.clear(sessionKey)

        await callTelegram('sendMessage', {
          chat_id: chatId,
          text: `✅ Reading saved: ${val}`
        })

        await showMenu(chatId, {})
        return NextResponse.json({ ok: true })
      }

      if (session.step === 'PAY_AMOUNT') {
        const amt = parseFloat(raw)

        if (isNaN(amt)) {
          await callTelegram('sendMessage', {
            chat_id: chatId,
            text: "❌ Enter valid amount"
          })
          return NextResponse.json({ ok: true })
        }

        await db.clear(sessionKey)

        await callTelegram('sendMessage', {
          chat_id: chatId,
          text: `✅ Payment recorded ₹${amt}`
        })

        await showMenu(chatId, {})
        return NextResponse.json({ ok: true })
      }
    }

    await callTelegram('sendMessage', {
      chat_id: chatId,
      text: "Send /start"
    })

    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error(err)
    return NextResponse.json({ ok: true })
  }
}

export async function GET() {
  return new Response("Telegram Premium UI Running 🚀")
}
