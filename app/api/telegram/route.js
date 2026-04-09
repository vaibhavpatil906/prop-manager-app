import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder'
)

// --- CONFIG ---
const CONFIG = {
  WATER_DEFAULT: 140,
  ELEC_RATE: 10,
  ELEC_MIN: 150
}

// --- TELEGRAM HELPERS ---
async function callTelegram(method, data) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return console.error('[TG] Missing TELEGRAM_BOT_TOKEN')
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    return await res.json()
  } catch (err) { console.error('[TG] API Error:', err) }
}

const ui = {
  text: async (chatId, text) => await callTelegram('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' }),
  buttons: async (chatId, text, buttons) => {
    // Standard buttons (stack vertically)
    const inline_keyboard = buttons.map(b => [{ text: b, callback_data: b.substring(0, 60) }])
    await callTelegram('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: { inline_keyboard } })
  },
  list: async (chatId, header, text, sections) => {
    // Telegram doesn't have "Lists", so we convert sections to a nice inline keyboard
    let inline_keyboard = []
    sections.forEach(sec => {
      // Add section header as a dummy button (callback 'ignore')
      inline_keyboard.push([{ text: `— ${sec.title} —`, callback_data: 'ignore' }])
      sec.rows.forEach(r => {
        inline_keyboard.push([{ text: r.title, callback_data: r.id }])
      })
    })
    await callTelegram('sendMessage', { chat_id: chatId, text: `<b>${header}</b>\n${text}`, parse_mode: 'HTML', reply_markup: { inline_keyboard } })
  },
  requestContact: async (chatId, text) => {
    await callTelegram('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: {
        keyboard: [[{ text: "📲 Share Phone Number", request_contact: true }]],
        one_time_keyboard: true,
        resize_keyboard: true
      }
    })
  },
  removeKeyboard: async (chatId, text) => {
    await callTelegram('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: { remove_keyboard: true } })
  }
}

const db = {
  getSession: async (phone) => {
    const { data } = await supabase.from('bot_sessions').select('*').eq('phone', phone).single()
    return data
  },
  updateSession: async (phone, data) => {
    await supabase.from('bot_sessions').upsert({ phone, ...data, updated_at: new Date() })
  },
  clearSession: async (phone) => {
    await supabase.from('bot_sessions').delete().eq('phone', phone)
  },
  fmt: (val) => parseFloat(val || 0).toLocaleString('en-IN')
}

// --- MAIN BOT HANDLER ---
export async function POST(req) {
  try {
    const body = await req.json()
    
    // Telegram sends either 'message' (text/contact) or 'callback_query' (button clicks)
    const message = body.message
    const callbackQuery = body.callback_query

    const chatId = message?.chat?.id || callbackQuery?.message?.chat?.id?.toString()
    if (!chatId) return NextResponse.json({ ok: true })

    // If it's a button click, tell Telegram we received it to stop the loading spinner
    if (callbackQuery) {
      await callTelegram('answerCallbackQuery', { callback_query_id: callbackQuery.id })
    }

    // 1. AUTHENTICATION (Telegram Chat ID)
    let { data: profile } = await supabase.from('profiles').select('*').eq('telegram_chat_id', chatId).single()

    // If not authenticated by chat ID, check if they sent a contact to link the account
    if (!profile) {
      if (message?.contact) {
        const phone = message.contact.phone_number.replace(/\D/g, '')
        // Find profile by phone
        const { data: matchedProfile } = await supabase.from('profiles').select('*').or(`contact_number.ilike.%${phone}%,additional_number.ilike.%${phone}%`).single()
        
        if (matchedProfile) {
          // Link Telegram Chat ID to Profile
          await supabase.from('profiles').update({ telegram_chat_id: chatId }).eq('id', matchedProfile.id)
          await ui.removeKeyboard(chatId, "✅ <b>Account Linked!</b> Your Telegram is now securely connected.")
          profile = matchedProfile
        } else {
          await ui.removeKeyboard(chatId, `⚠️ Unauthorized Number: ${phone}. Please ensure this number is in your Profile settings.`)
          return NextResponse.json({ ok: true })
        }
      } else {
        await ui.requestContact(chatId, "🔒 <b>Authentication Required</b>\n\nTo access PropManager, please share your phone number so I can verify your identity.")
        return NextResponse.json({ ok: true })
      }
    }

    // Prepare inputs
    const rawText = message?.text || callbackQuery?.data || ""
    const input = rawText.toLowerCase()
    const fromId = profile.id // Use profile ID as the session key instead of phone for internal consistency
    const sessionKey = `tg_${chatId}` // unique session key for Telegram

    // 2. MAIN MENU & RESET
    if (['hi', 'hello', 'menu', 'reset', 'start', 'cancel', 'main menu'].includes(input) || input === 'nav_main') {
      await db.clearSession(sessionKey)
      await ui.list(chatId, `👋 PropManager Pro`, "Select an action:", [
        { title: "⚡ RECORD", rows: [{ id: "path_reading", title: "Submit Reading" }, { id: "path_pay_rec", title: "Record Payment" }] },
        { title: "📊 REPORTS", rows: [{ id: "path_unpaid", title: "Unpaid Bills" }, { id: "path_monthly", title: "Monthly Summary" }] },
        { title: "🔍 LOOKUP", rows: [{ id: "path_lookup", title: "Get Unit Bill" }, { id: "path_summary", title: "Property Status" }] }
      ])
      return NextResponse.json({ ok: true })
    }

    // Ignore dummy button clicks
    if (input === 'ignore') return NextResponse.json({ ok: true })

    const session = await db.getSession(sessionKey)

    // 3. ROUTER: INITIAL TRIGGERS
    if (!session) {
      if (input === 'path_reading') {
        await db.updateSession(sessionKey, { step: 'READ_UNIT' })
        await ui.text(chatId, "📝 <b>Submit Reading</b>\nWhich unit? (e.g. G01)")
        return NextResponse.json({ ok: true })
      }
      if (input === 'path_payment') {
        const { data: tenants } = await supabase.from('tenants').select('id, name, unit:units(unit_number)').eq('user_id', profile.id).eq('status', 'Active')
        if (!tenants?.length) return await ui.text(chatId, "🏠 No active residents found.")
        await db.updateSession(sessionKey, { step: 'PAY_TENANT' })
        return await ui.list(chatId, "💰 Record Payment", "Choose tenant:", [{ title: "RESIDENTS", rows: tenants.map(t => ({ id: `t_${t.id}`, title: `${t.unit?.unit_number || '?'} - ${t.name}`.substring(0, 24) })) }])
      }
      if (input === 'path_lookup') {
        const { data: tenants } = await supabase.from('tenants').select('id, name, unit:units(unit_number)').eq('user_id', profile.id).eq('status', 'Active')
        await db.updateSession(sessionKey, { step: 'LOOKUP_TENANT' })
        return await ui.list(chatId, "🔍 Get Unit Bill", "Choose resident:", [{ title: "RESIDENTS", rows: (tenants || []).map(t => ({ id: `t_${t.id}`, title: `${t.unit?.unit_number || '?'} - ${t.name}`.substring(0, 24) })) }])
      }
      if (input === 'path_unpaid') {
        const { data: bills } = await supabase.from('utility_bills').select(`balance_due, billing_month, tenant_id`).eq('user_id', profile.id).gt('balance_due', 0).order('billing_month', { ascending: false })
        if (!bills?.length) return await ui.buttons(chatId, "✅ All bills are fully paid!", ["Main Menu"])
        const { data: tenants } = await supabase.from('tenants').select('id, name, unit:units(unit_number)').in('id', bills.map(b => b.tenant_id))
        const tMap = Object.fromEntries((tenants || []).map(t => [t.id, t.name])); const uMap = Object.fromEntries((tenants || []).map(t => [t.id, t.unit?.unit_number || '?']))
        let r = `🚩 <b>Outstanding Bills</b>\n\n`; const grouped = bills.reduce((acc, b) => { (acc[b.billing_month] ||= []).push(b); return acc }, {})
        let gt = 0;
        for (const [month, mBills] of Object.entries(grouped)) { r += `📅 <b>${month}</b>\n`; mBills.forEach(b => { r += `▫️ ${uMap[b.tenant_id]} (${tMap[b.tenant_id]}): ₹${db.fmt(b.balance_due)}\n`; gt += parseFloat(b.balance_due) }); r += `\n` }
        return await ui.buttons(chatId, r + `⭐ <b>TOTAL DUE: ₹${db.fmt(gt)}</b>`, ["Main Menu"])
      }
      if (input === 'path_summary') {
        const { data: props } = await supabase.from('properties').select('name, units').eq('user_id', profile.id)
        let r = `🏢 <b>Property Summary</b>\n\n` + (props?.length ? props.map(p => `• ${p.name}: ${p.units} units`).join('\n') : "No properties found.")
        return await ui.buttons(chatId, r, ["Main Menu"])
      }
      if (input === 'path_monthly') {
        const rows = []; for (let i = 0; i < 6; i++) { const d = new Date(); d.setMonth(d.getMonth() - i); rows.push({ id: `rep_${d.toISOString().slice(0, 7)}`, title: d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) }) }
        await db.updateSession(sessionKey, { step: 'REP_MONTH' })
        return await ui.list(chatId, "📅 Monthly Summary", "Select month:", [{ title: "MONTHS", rows }])
      }
    }

    // 4. ROUTER: SESSION STEPS
    if (session) {
      if (session.step === 'PAY_TENANT') {
        const tId = input.replace('t_', '')
        const { data: bills } = await supabase.from('utility_bills').select('id, billing_month, balance_due').eq('tenant_id', tId).gt('balance_due', 0).order('billing_month', { ascending: false })
        if (!bills?.length) { await db.clearSession(sessionKey); return await ui.buttons(chatId, "✅ No pending bills.", ["Main Menu"]) }
        await db.updateSession(sessionKey, { step: 'PAY_BILL', tenant_id: tId })
        return await ui.list(chatId, `💰 Select Bill`, "Choose month:", [{ title: "PENDING", rows: bills.map(b => ({ id: `b_${b.id}`, title: `${b.billing_month} (Due: ₹${db.fmt(b.balance_due)})` })) }])
      }
      if (session.step === 'PAY_BILL') {
        const bId = input.replace('b_', ''); const { data: bill } = await supabase.from('utility_bills').select('*').eq('id', bId).single()
        await db.updateSession(sessionKey, { step: 'PAY_AMOUNT', bill_id: bId, bill_month: bill.billing_month })
        return await ui.text(chatId, `💸 Pending for <b>${bill.billing_month}</b>: ₹${db.fmt(bill.balance_due)}\n\nHow much received?`)
      }
      if (session.step === 'PAY_AMOUNT') {
        const amt = parseFloat(rawText.replace(/[^\d.]/g, ''))
        if (isNaN(amt) || amt <= 0) return await ui.text(chatId, "❌ Enter a valid number.")
        await db.updateSession(sessionKey, { step: 'PAY_METHOD', payment_amt: amt })
        return await ui.buttons(chatId, `💰 Amount: ₹${db.fmt(amt)}\nSelect Method:`, ["Cash", "UPI", "Bank Transfer"])
      }
      if (session.step === 'PAY_METHOD') {
        const { data: bill } = await supabase.from('utility_bills').select('*').eq('id', session.bill_id).single()
        const newBal = Math.max(0, (bill?.balance_due || 0) - session.payment_amt)
        await supabase.from('payments').insert({ tenant_id: session.tenant_id, bill_id: session.bill_id, amount: session.payment_amt, status: 'Paid', method: rawText, payment_date: new Date(), due_date: bill?.due_date })
        await supabase.from('utility_bills').update({ balance_due: newBal }).eq('id', session.bill_id)
        if (newBal > 0) await supabase.from('payments').insert({ tenant_id: session.tenant_id, bill_id: session.bill_id, amount: newBal, status: 'Pending', method: 'Partial Balance', due_date: bill?.due_date })
        await db.clearSession(sessionKey); return await ui.buttons(chatId, `✅ Payment Recorded!\n🚩 Remaining: ₹${db.fmt(newBal)}`, ["Main Menu"])
      }

      // READING FLOW
      if (session.step === 'READ_UNIT') {
        const { data: unit } = await supabase.from('units').select('id, rent, tenants(id, name)').eq('unit_number', rawText.toUpperCase()).single()
        if (!unit || !unit.tenants?.[0]) return await ui.text(chatId, "❌ Unit not found.")
        const { data: last } = await supabase.from('utility_bills').select('curr_reading').eq('tenant_id', unit.tenants[0].id).order('billing_month', { ascending: false }).limit(1).single()
        await db.updateSession(sessionKey, { step: 'READ_VALUE', tenant_id: unit.tenants[0].id, tenant_name: unit.tenants[0].name, prev_reading: last?.curr_reading || 0, rent: unit.rent, unit_num: rawText.toUpperCase() })
        return await ui.text(chatId, `👤 Resident: ${unit.tenants[0].name}\n📟 Previous: ${last?.curr_reading || 0}\n\nEnter current reading:`)
      }
      if (session.step === 'READ_VALUE') {
        const curr = parseFloat(rawText.replace(/[^\d.]/g, ''))
        if (isNaN(curr)) return await ui.text(chatId, "❌ Enter a number.")
        await db.updateSession(sessionKey, { step: 'READ_WATER', curr_reading: curr })
        return await ui.buttons(chatId, `📟 Current: ${curr}\n\nEnter Water Bill:`, [`Skip (${CONFIG.WATER_DEFAULT})`, "Enter Custom"])
      }
      if (session.step === 'READ_WATER') {
        if (input === 'enter custom') return await ui.text(chatId, "Type water amount:")
        const water = input.startsWith('skip') ? CONFIG.WATER_DEFAULT : parseFloat(rawText.replace(/[^\d.]/g, ''))
        if (isNaN(water)) return await ui.text(chatId, "❌ Enter a valid amount.")
        const elec = Math.max((session.curr_reading - session.prev_reading) * CONFIG.ELEC_RATE, CONFIG.ELEC_MIN)
        const total = parseFloat(session.rent) + elec + water
        const { data: bill } = await supabase.from('utility_bills').upsert({ user_id: profile.id, tenant_id: session.tenant_id, billing_month: new Date().toISOString().slice(0, 7), prev_reading: session.prev_reading, curr_reading: session.curr_reading, rate_per_unit: CONFIG.ELEC_RATE, fixed_rent: session.rent, water_bill: water, total_amount: total, balance_due: total, due_date: new Date(new Date().getFullYear(), new Date().getMonth(), 10).toISOString().split('T')[0] }).select().single()
        if (bill) await supabase.from('payments').insert({ tenant_id: session.tenant_id, bill_id: bill.id, amount: total, status: 'Pending', method: 'Utility Bill', due_date: bill.due_date })
        await db.clearSession(sessionKey); return await ui.buttons(chatId, `✅ Bill Saved! Total: ₹${db.fmt(total)}`, ["Main Menu"])
      }

      // LOOKUP & REPORTS
      if (session.step === 'LOOKUP_TENANT') {
        const tId = input.replace('t_', ''); const { data: bills } = await supabase.from('utility_bills').select('*').eq('tenant_id', tId).order('billing_month', { ascending: false }).limit(3)
        if (!bills?.length) { await db.clearSession(sessionKey); return await ui.buttons(chatId, "📭 No history found.", ["Main Menu"]) }
        let r = `🧾 <b>Financial History</b>\n\n`
        bills.forEach(b => {
          const u = Math.max(0, b.curr_reading - b.prev_reading)
          const e = Math.max(u * (b.rate_per_unit || 10), 150)
          r += `📅 <b>${b.billing_month}</b>\n▫️ Rent: ₹${db.fmt(b.fixed_rent)}\n▫️ Elec: ₹${db.fmt(e)} (${u} units)\n▫️ Water: ₹${db.fmt(b.water_bill)}\n💰 <b>TOTAL: ₹${db.fmt(b.total_amount)}</b>\n🚩 <b>DUE: ₹${db.fmt(b.balance_due)}</b>\n_________________________\n\n`
        })
        await db.clearSession(sessionKey); return await ui.buttons(chatId, r, ["Main Menu"])
      }
      if (session.step === 'REP_MONTH') {
        const m = input.replace('rep_', '')
        await db.clearSession(sessionKey)
        const { data: bills } = await supabase.from('utility_bills').select('*').eq('user_id', profile.id).eq('billing_month', m)
        if (!bills?.length) return await ui.buttons(chatId, `📭 No data for ${m}`, ["Main Menu"])
        const { data: tenants } = await supabase.from('tenants').select('id, name, unit:units(unit_number)').in('id', bills.map(b => b.tenant_id))
        const tMap = Object.fromEntries((tenants || []).map(t => [t.id, t.name])); const uMap = Object.fromEntries((tenants || []).map(t => [t.id, t.unit?.unit_number || '?']))
        let tb = 0; let tc = 0; let r = `📊 <b>Report: ${m}</b>\n\n`
        bills.forEach(b => { const bld = parseFloat(b.total_amount); const due = parseFloat(b.balance_due); const clc = bld - due; r += `🏠 <b>${uMap[b.tenant_id]}</b> (${tMap[b.tenant_id]})\n   Billed: ₹${db.fmt(bld)} | Col: ₹${db.fmt(clc)}\n_________________________\n\n`; tb += bld; tc += clc })
        const footer = `⭐ <b>BILLED:</b> ₹${db.fmt(tb)}\n💰 <b>COLLECTED:</b> ₹${db.fmt(tc)}\n🚩 <b>PENDING:</b> ₹${db.fmt(tb-tc)}`
        return await ui.buttons(chatId, r + footer, ["Main Menu"])
      }
    }

    // 5. FALLBACK
    return await ui.text(chatId, "❓ Send <b>Menu</b> to start.")

  } catch (err) { console.error('[TG_ERROR]', err); return NextResponse.json({ ok: true }) }
}

export async function GET(req) { return new Response('Telegram Bot Endpoint Active.', { status: 200 }) }
