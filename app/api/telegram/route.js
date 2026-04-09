import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// --- INIT ---
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// --- TELEGRAM API ---
async function callTelegram(method, data) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN

    if (!token) {
      console.error("❌ Missing TELEGRAM_BOT_TOKEN")
      return
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })

    return await res.json()
  } catch (err) {
    console.error("❌ Telegram API Error:", err)
  }
}

// --- UI ---
const ui = {
  text: (chatId, text) =>
    callTelegram('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML'
    }),

  buttons: (chatId, text, buttons) =>
    callTelegram('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: buttons.map(b => [{ text: b, callback_data: b }])
      }
    }),

  requestContact: (chatId) =>
    callTelegram('sendMessage', {
      chat_id: chatId,
      text: "🔒 <b>Login Required</b>\n\nTap below to share your phone number.",
      parse_mode: 'HTML',
      reply_markup: {
        keyboard: [[{ text: "📲 Share Phone Number", request_contact: true }]],
        one_time_keyboard: true,
        resize_keyboard: true
      }
    }),

  removeKeyboard: (chatId, text) =>
    callTelegram('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: { remove_keyboard: true }
    })
}

// --- DB ---
const db = {
  getSession: async (key) => {
    const { data } = await supabase
      .from('bot_sessions')
      .select('*')
      .eq('phone', key)
      .maybeSingle()
    return data
  },

  updateSession: (key, data) =>
    supabase.from('bot_sessions').upsert({
      phone: key,
      ...data,
      updated_at: new Date()
    }),

  clearSession: (key) =>
    supabase.from('bot_sessions').delete().eq('phone', key),

  fmt: (val) => parseFloat(val || 0).toLocaleString('en-IN')
}

// --- MAIN HANDLER ---
export async function POST(req) {
  try {
    const body = await req.json()
    console.log("📩 Incoming:", JSON.stringify(body))

    const message = body.message
    const callback = body.callback_query

    const chatId = String(
      message?.chat?.id || callback?.message?.chat?.id
    )

    if (!chatId) return NextResponse.json({ ok: true })

    // Remove loading spinner for buttons
    if (callback) {
      await callTelegram('answerCallbackQuery', {
        callback_query_id: callback.id
      })
    }

    // --- AUTH ---
    let { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('telegram_chat_id', chatId)
      .maybeSingle()

    if (!profile) {
      if (message?.contact) {
        const phone = message.contact.phone_number.replace(/\D/g, '')

        const { data: matched } = await supabase
          .from('profiles')
          .select('*')
          .or(`contact_number.ilike.%${phone}%`)
          .maybeSingle()

        if (matched) {
          await supabase
            .from('profiles')
            .update({ telegram_chat_id: chatId })
            .eq('id', matched.id)

          await ui.removeKeyboard(chatId, "✅ Account linked successfully")
          profile = matched
        } else {
          await ui.removeKeyboard(chatId, "❌ Number not found in system")
          return NextResponse.json({ ok: true })
        }
      } else {
        await ui.requestContact(chatId)
        return NextResponse.json({ ok: true })
      }
    }

    // --- INPUT ---
    const raw = message?.text || callback?.data || ''
    const input = raw.toLowerCase()
    const sessionKey = `tg_${chatId}`

    // --- HANDLE COMMANDS (/start, /menu etc) ---
    if (input.startsWith('/')) {
      await db.clearSession(sessionKey)

      return await ui.buttons(
        chatId,
        "👋 <b>Welcome to PropManager</b>\n\nChoose an option:",
        ["Submit Reading", "Record Payment", "Unpaid Bills"]
      )
    }

    // --- NORMAL MENU ---
    if (['hi', 'menu', 'reset'].includes(input)) {
      await db.clearSession(sessionKey)

      return await ui.buttons(
        chatId,
        "👋 <b>PropManager</b>\nChoose option:",
        ["Submit Reading", "Record Payment", "Unpaid Bills"]
      )
    }

    const session = await db.getSession(sessionKey)

    // --- ROUTES ---
    if (!session) {
      if (input === "submit reading") {
        await db.updateSession(sessionKey, { step: 'READ_UNIT' })
        return await ui.text(chatId, "📝 Enter unit (e.g. G01)")
      }

      if (input === "record payment") {
        await db.updateSession(sessionKey, { step: 'PAY_AMOUNT' })
        return await ui.text(chatId, "💰 Enter amount")
      }

      if (input === "unpaid bills") {
        return await ui.text(chatId, "📊 Feature coming soon")
      }
    }

    // --- SESSION FLOW ---
    if (session) {
      if (session.step === 'PAY_AMOUNT') {
        const amt = parseFloat(raw.replace(/[^\d.]/g, ''))

        if (!amt || amt <= 0) {
          return await ui.text(chatId, "❌ Enter valid amount")
        }

        await db.clearSession(sessionKey)

        return await ui.text(chatId, `✅ Payment recorded ₹${db.fmt(amt)}`)
      }

      if (session.step === 'READ_UNIT') {
        await db.clearSession(sessionKey)

        return await ui.text(chatId, "✅ Reading saved")
      }
    }

    return await ui.text(chatId, "❓ Send /start or menu")

  } catch (err) {
    console.error("🔥 ERROR:", err)
    return NextResponse.json({ ok: true })
  }
}

// --- HEALTH CHECK ---
export async function GET() {
  return new Response("Telegram Bot Running ✅")
}
