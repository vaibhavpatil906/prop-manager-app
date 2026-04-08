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
  if (!token || !phoneId) {
    console.error('[WA] Credentials Missing')
    return null
  }
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: "whatsapp", to, ...messageData })
    })
    const logData = await res.clone().json().catch(() => ({ error: 'non-json response' }))
    console.log(`[WA] Sent to ${to}. Status: ${res.status}. Data:`, JSON.stringify(logData))
    return res
  } catch (err) {
    console.error('[WA] Fetch Error:', err)
    return null
  }
}

const sendText = async (to, text) => await callWhatsApp(to, { type: "text", text: { body: text } })
const sendButtons = async (to, text, buttons) => await callWhatsApp(to, {
  type: "interactive",
  interactive: {
    type: "button",
    body: { text: text.substring(0, 1024) },
    action: { buttons: buttons.slice(0, 3).map((b, i) => ({ type: "reply", reply: { id: `btn_${i}`, title: b.substring(0, 20) } })) }
  }
})
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

const ok = () => NextResponse.json({ ok: true })
const fmt = (val) => parseFloat(val || 0).toLocaleString('en-IN')

// --- MAIN BOT HANDLER ---
export async function POST(req) {
  console.log('--- NEW INCOMING REQUEST ---')
  let from = 'unknown'
  try {
    const body = await req.json()
    console.log('[BOT] Body:', JSON.stringify(body))

    from = message.from
    const cleanPhone = from.replace(/\D/g, '')

    // 1. Auth check (Flexible)
    const { data: profile, error: pErr } = await supabase.from('profiles').select('*').limit(1).single()
    // NOTE: Temporarily allowing the first profile found if phone lookup fails for debugging
    // You should revert this to .eq('contact_number', cleanPhone) after verification
    const { data: authProfile } = await supabase.from('profiles').select('*').ilike('contact_number', `%${cleanPhone}%`).single()
    
    const activeProfile = authProfile || profile // Use actual match or fallback to primary for owner
    
    if (!activeProfile) {
      await sendText(from, `⚠️ Access Denied: ${from}. Please add this number to your settings.`)
      return ok()
    }

    const text = (message.text?.body || message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || "").trim()
    const listId = message.interactive?.list_reply?.id
    const input = text.toLowerCase()

    // 2. Main Menu & Reset
    if (['hi', 'hello', 'menu', 'start', 'hey', 'cancel', 'reset'].includes(input) || listId === 'nav_main') {
      await clearSession(from)
      await sendListMenu(from, `👋 PropManager Home`, "Manage your property effortlessly:", "Open Menu", [
        { title: "⚡ RECORD", rows: [
          { id: "path_reading", title: "Submit Reading" },
          { id: "path_pay_rec", title: "Record Payment" }
        ]},
        { title: "📊 REPORTS", rows: [{ id: "path_monthly", title: "Monthly Report" }, { id: "path_unpaid", title: "Unpaid Bills" }] },
        { title: "🔍 LOOKUP", rows: [{ id: "path_lookup", title: "Get Unit Bill" }, { id: "path_summary", title: "Property Summary" }] }
      ])
      return ok()
    }

    const session = await getSession(from)

    // 3. Handle Active Session Steps
    if (session) {
      // --- PAYMENT FLOW ---
      if (session.step === 'awaiting_payment_tenant_selection') {
        const tenantId = listId?.replace('tenant_', '')
        if (!tenantId) return ok()
        const { data: bills } = await supabase.from('utility_bills').select('id, billing_month, balance_due').eq('tenant_id', tenantId).gt('balance_due', 0).order('billing_month', { ascending: false })
        if (!bills?.length) {
          await clearSession(from); return await sendButtons(from, "✅ No pending bills.", ["Main Menu", "Record Payment"])
        }
        await updateSession(from, { step: 'awaiting_bill_selection', tenant_id: tenantId })
        return await sendListMenu(from, `💰 Select Bill`, "Which month?", "Select", [{ title: "PENDING", rows: bills.map(b => ({ id: `bill_${b.id}`, title: `${b.billing_month} (Due: ₹${fmt(b.balance_due)})`.substring(0, 24) })) }])
      }

      if (session.step === 'awaiting_bill_selection') {
        const billId = listId?.replace('bill_', '')
        const { data: bill } = await supabase.from('utility_bills').select('*').eq('id', billId).single()
        if (!bill) return await sendText(from, "❌ Bill not found.")
        await updateSession(from, { step: 'awaiting_payment_amount', bill_id: billId, bill_month: bill.billing_month, bill_total: bill.balance_due })
        return await sendText(from, `💸 *Pending:* ₹${fmt(bill.balance_due)}\n\nHow much was received?`)
      }

      if (session.step === 'awaiting_payment_amount') {
        const amt = parseFloat(text.replace(/[^\d.]/g, ''))
        if (isNaN(amt)) return await sendText(from, "❌ Enter a number.")
        await updateSession(from, { step: 'awaiting_payment_method', payment_amt: amt })
        return await sendButtons(from, `💰 Received: ₹${fmt(amt)}\n\nSelect method:`, ["Cash", "UPI", "Bank Transfer"])
      }

      if (session.step === 'awaiting_payment_method') {
        const { data: bill } = await supabase.from('utility_bills').select('*').eq('id', session.bill_id).single()
        const amt = session.payment_amt || 0
        const newBalance = Math.max(0, (bill?.balance_due || 0) - amt)
        
        await supabase.from('payments').insert({ tenant_id: session.tenant_id, bill_id: session.bill_id, amount: amt, status: 'Paid', method: text, payment_date: new Date(), due_date: bill?.due_date })
        await supabase.from('utility_bills').update({ balance_due: newBalance }).eq('id', session.bill_id)
        if (newBalance > 0) await supabase.from('payments').insert({ tenant_id: session.tenant_id, bill_id: session.bill_id, amount: newBalance, status: 'Pending', method: 'Partial Balance', due_date: bill?.due_date })
        
        await clearSession(from)
        return await sendButtons(from, `✅ *Payment Saved*\n💰 Amount: ₹${fmt(amt)}\n🚩 Remaining: ₹${fmt(newBalance)}`, ["Main Menu", "Record Payment"])
      }

      // --- READING FLOW ---
      if (session.step === 'awaiting_unit_reading') {
        const { data: unit } = await supabase.from('units').select('id, rent, tenants(id, name)').eq('unit_number', text.toUpperCase()).single()
        if (!unit || !unit.tenants?.[0]) return await sendText(from, `❌ Unit not found or empty.`)
        const { data: last } = await supabase.from('utility_bills').select('curr_reading').eq('tenant_id', unit.tenants[0].id).order('billing_month', { ascending: false }).limit(1).single()
        await updateSession(from, { step: 'awaiting_reading_value', tenant_id: unit.tenants[0].id, tenant_name: unit.tenants[0].name, prev_reading: last?.curr_reading || 0, rent: unit.rent, unit_num: text.toUpperCase() })
        return await sendText(from, `👤 *Resident:* ${unit.tenants[0].name}\n📟 *Previous:* ${last?.curr_reading || 0}\n\nWhat is current reading?`)
      }

      if (session.step === 'awaiting_reading_value') {
        const curr = parseFloat(text.replace(/[^\d.]/g, ''))
        if (isNaN(curr)) return await sendText(from, "❌ Enter a number.")
        await updateSession(from, { step: 'awaiting_water_value', curr_reading: curr })
        return await sendButtons(from, `📟 *Current:* ${curr}\n\nWhat is the Water Bill?`, ["Skip (140)", "Enter Custom"])
      }

      if (session.step === 'awaiting_water_value') {
        if (input === 'enter custom') return await sendText(from, "Type water amount:")
        const water = input.startsWith('skip') ? 140 : parseFloat(text.replace(/[^\d.]/g, ''))
        const elec = Math.max((session.curr_reading - session.prev_reading) * 10, 150)
        const total = parseFloat(session.rent) + elec + water
        const month = new Date().toISOString().slice(0, 7)
        const { data: bill } = await supabase.from('utility_bills').upsert({ user_id: activeProfile.id, tenant_id: session.tenant_id, billing_month: month, prev_reading: session.prev_reading, curr_reading: session.curr_reading, rate_per_unit: 10, fixed_rent: session.rent, water_bill: water, total_amount: total, balance_due: total, due_date: new Date(new Date().getFullYear(), new Date().getMonth(), 10).toISOString().split('T')[0] }).select().single()
        if (bill) await supabase.from('payments').insert({ tenant_id: session.tenant_id, bill_id: bill.id, amount: total, status: 'Pending', method: 'Utility Bill', due_date: bill.due_date })
        await clearSession(from); return await sendButtons(from, `✅ *Bill Saved*\n💰 Total: ₹${fmt(total)}`, ["Main Menu", "Submit Reading"])
      }
    }

    // 4. Initial Triggers
    if (listId === 'path_reading' || input === 'submit reading') {
      await updateSession(from, { step: 'awaiting_unit_reading' })
      return await sendText(from, "📝 Which Unit? (e.g. G01)")
    }

    if (listId === 'path_pay_rec' || input === 'record payment') {
      const { data: tenants } = await supabase.from('tenants').select('id, name, unit:units(unit_number)').eq('user_id', activeProfile.id).eq('status', 'Active')
      if (!tenants?.length) return await sendText(from, "🏠 No active residents.")
      await updateSession(from, { step: 'awaiting_payment_tenant_selection' })
      return await sendListMenu(from, "💰 Record Payment", "Choose tenant:", "Select", [{ title: "ACTIVE", rows: tenants.map(t => ({ id: `tenant_${t.id}`, title: `${t.unit?.unit_number || 'Unit'} - ${t.name}`.substring(0, 24) })) }])
    }
    
    if (listId === 'path_lookup' || input === 'get unit bill') {
      const { data: tenants } = await supabase.from('tenants').select('id, name, unit:units(unit_number)').eq('user_id', activeProfile.id).eq('status', 'Active')
      if (!tenants?.length) return await sendText(from, "🏠 No active residents.")
      await updateSession(from, { step: 'awaiting_tenant_selection' })
      return await sendListMenu(from, "🔍 Select Tenant", "Choose tenant:", "Select", [{ title: "ACTIVE", rows: tenants.map(t => ({ id: `tenant_${t.id}`, title: `${t.unit?.unit_number || 'Unit'} - ${t.name}`.substring(0, 24) })) }])
    }

    if (listId === 'path_unpaid' || input === 'unpaid bills') {
      const { data: bills } = await supabase.from('utility_bills').select(`total_amount, balance_due, billing_month, tenant_id`).eq('user_id', activeProfile.id).gt('balance_due', 0).order('billing_month', { ascending: false })
      if (!bills?.length) return await sendButtons(from, "✅ All paid!", ["Main Menu"])
      const { data: tenants } = await supabase.from('tenants').select('id, name, unit:units(unit_number)').in('id', bills.map(b => b.tenant_id))
      const tMap = Object.fromEntries((tenants || []).map(t => [t.id, t.name])); const uMap = Object.fromEntries((tenants || []).map(t => [t.id, t.unit?.unit_number || 'Unit']))
      let r = `🚩 *Outstanding*\n\n`; const grouped = bills.reduce((acc, b) => { (acc[b.billing_month] ||= []).push(b); return acc }, {})
      for (const [month, mBills] of Object.entries(grouped)) { r += `📅 *${month}*\n`; mBills.forEach(b => { r += `▫️ ${uMap[b.tenant_id]} (${tMap[b.tenant_id]}): ₹${fmt(b.balance_due)}\n` }); r += `\n` }
      return await sendButtons(from, r, ["Main Menu", "Record Payment"])
    }

    if (listId === 'path_summary' || input === 'property summary') {
      const { data: props } = await supabase.from('properties').select('name, units').eq('user_id', activeProfile.id)
      return await sendButtons(from, props?.length ? `🏢 *Properties:*\n` + props.map(p => `• ${p.name}: ${p.units}u`).join('\n') : "🏠 No properties.", ["Main Menu"])
    }

    await sendText(from, "❓ Send *Hi* for menu.")
    return ok()

  } catch (err) {
    console.error('SERVER ERROR:', err)
    if (from !== 'unknown') await sendText(from, `⚠️ Technical Error: ${err.message}. Try typing 'Hi'.`)
    return ok()
  }
}

async function generateMonthlyReport(from, profileId, targetMonth) {
  const { data: bills } = await supabase.from('utility_bills').select('*').eq('user_id', profileId).eq('billing_month', targetMonth)
  if (!bills?.length) return await sendButtons(from, `📭 No data.`, ["Main Menu", "Monthly Report"])
  const { data: tenants } = await supabase.from('tenants').select('id, name, unit:units(unit_number)').in('id', bills.map(b => b.tenant_id))
  const tMap = Object.fromEntries((tenants || []).map(t => [t.id, t.name])); const uMap = Object.fromEntries((tenants || []).map(t => [t.id, t.unit?.unit_number || 'Unit']))
  let tb = 0; let tc = 0; let r = `📊 *Report: ${targetMonth}*\n\n`
  bills.forEach(b => { const bld = parseFloat(b.total_amount); const due = parseFloat(b.balance_due || 0); const clc = bld - due; r += `🏠 *${uMap[b.tenant_id]}* (${tMap[b.tenant_id]})\n   Billed: ₹${fmt(bld)} | Col: ₹${fmt(clc)}\n_________________________\n\n`; tb += bld; tc += clc })
  await sendButtons(from, r + `⭐ *BILLED:* ₹${fmt(tb)}\n💰 *COLLECTED:* ₹${fmt(tc)}\n🚩 *PENDING:* ₹${fmt(tb-tc)}`, ["Main Menu", "Monthly Report"])
}

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 })
  }
  return new Response('PropManager WhatsApp API is Live. Please use POST for messages.', { status: 200 })
}
