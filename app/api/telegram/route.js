import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// --- CONFIG ---
const CONFIG = {
  WATER_DEFAULT: 140,
  ELEC_RATE: 10,
  ELEC_MIN: 150
}

// --- TELEGRAM API ---
async function callTelegram(method, data) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    return await res.json()
  } catch (err) {
    console.error("TG ERROR:", err)
  }
}

// --- UI ---
const ui = {
  text: (chatId, text) =>
    callTelegram('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown' }),

  buttons: (chatId, text, buttons) =>
    callTelegram('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: buttons.map(b => [{ text: b.title, callback_data: b.id }])
      }
    }),

  list: (chatId, header, text, sections) => {
    let keyboard = []
    sections.forEach(sec => {
      keyboard.push([{ text: `--- ${sec.title} ---`, callback_data: 'ignore' }])
      sec.rows.forEach(r => {
        keyboard.push([{ text: r.title, callback_data: r.id }])
      })
    })

    return callTelegram('sendMessage', {
      chat_id: chatId,
      text: `*${header}*\n${text}`,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    })
  }
}

// --- DB ---
const db = {
  getSession: async (key) => {
    const { data } = await supabase.from('bot_sessions').select('*').eq('phone', key).maybeSingle()
    return data
  },
  updateSession: (key, data) =>
    supabase.from('bot_sessions').upsert({ phone: key, ...data, updated_at: new Date() }),

  clearSession: (key) =>
    supabase.from('bot_sessions').delete().eq('phone', key),

  fmt: (v) => parseFloat(v || 0).toLocaleString('en-IN')
}

// --- MAIN ---
export async function POST(req) {
  try {
    const body = await req.json()

    const message = body.message
    const callback = body.callback_query

    const chatId = String(message?.chat?.id || callback?.message?.chat?.id)
    if (!chatId) return NextResponse.json({ ok: true })

    if (callback) {
      await callTelegram('answerCallbackQuery', { callback_query_id: callback.id })
    }

    const rawText = message?.text || callback?.data || ""
    const input = rawText.toLowerCase()

    // --- AUTH ---
    let { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('telegram_chat_id', chatId)
      .maybeSingle()

    if (!profile) {
      await ui.text(chatId, "❌ Unauthorized. Link your account first.")
      return NextResponse.json({ ok: true })
    }

    const sessionKey = `tg_${chatId}`

    // --- MENU ---
    if (input.startsWith('/') || ['menu','hi','start','reset'].includes(input)) {
      await db.clearSession(sessionKey)

      return ui.list(chatId, "👋 PropManager Home", "Select an action:", [
        { title: "⚡ RECORD", rows: [
          { id: "path_reading", title: "Submit Reading" },
          { id: "path_payment", title: "Record Payment" }
        ]},
        { title: "📊 REPORTS", rows: [
          { id: "path_unpaid", title: "Unpaid Bills" },
          { id: "path_monthly", title: "Monthly Summary" }
        ]},
        { title: "🔍 LOOKUP", rows: [
          { id: "path_lookup", title: "Get Unit Bill" },
          { id: "path_summary", title: "Property Status" }
        ]}
      ])
    }

    if (input === 'ignore') return NextResponse.json({ ok: true })

    // --- ROUTES ---
    if (input === 'path_reading') {
      await db.updateSession(sessionKey, { step: 'READ_UNIT' })
      return ui.text(chatId, "📝 Submit Reading\nWhich unit? (G01)")
    }

    if (input === 'path_payment') {
      const { data: tenants } = await supabase
        .from('tenants')
        .select('id, name, unit:units(unit_number)')
        .eq('user_id', profile.id)

      await db.updateSession(sessionKey, { step: 'PAY_TENANT' })

      return ui.list(chatId, "💰 Record Payment", "Choose tenant:", [
        { title: "TENANTS", rows: tenants.map(t => ({
          id: `t_${t.id}`,
          title: `${t.unit?.unit_number} - ${t.name}`
        })) }
      ])
    }

    if (input === 'path_unpaid') {
      const { data: bills } = await supabase
        .from('utility_bills')
        .select('*')
        .gt('balance_due', 0)

      return ui.text(chatId, `📊 Unpaid Bills: ${bills?.length || 0}`)
    }

    const session = await db.getSession(sessionKey)

    // --- FLOW ---
    if (session) {
      if (session.step === 'READ_UNIT') {
        await db.clearSession(sessionKey)
        return ui.text(chatId, "✅ Reading saved")
      }

      if (session.step === 'PAY_TENANT') {
        const tId = input.replace('t_', '')
        await db.updateSession(sessionKey, { step: 'PAY_AMOUNT', tenant_id: tId })
        return ui.text(chatId, "Enter amount")
      }

      if (session.step === 'PAY_AMOUNT') {
        const amt = parseFloat(rawText.replace(/[^\d.]/g, ''))
        if (!amt) return ui.text(chatId, "Invalid amount")

        await db.clearSession(sessionKey)
        return ui.text(chatId, `✅ Payment ₹${db.fmt(amt)}`)
      }
    }

    return ui.text(chatId, "Send /start")

  } catch (err) {
    console.error(err)
    return NextResponse.json({ ok: true })
  }
}

export async function GET() {
  return new Response("Telegram Bot Running")
}
