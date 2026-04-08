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
      await sendText(from, `⚠️ Unauthorized: ${cleanPhone}`)
      return NextResponse.json({ ok: true })
    }

    const text = (message.text?.body || message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || "").trim()
    const listId = message.interactive?.list_reply?.id
    const input = text.toLowerCase()

    // 2. Main Menu & Cancel
    if (['hi', 'hello', 'menu', 'start', 'hey', 'cancel'].includes(input) || listId === 'nav_main') {
      await clearSession(from)
      await sendListMenu(from, `👋 PropManager Home`, "Select an action:", "Menu", [
        { title: "⚡ ACTIONS", rows: [{ id: "path_reading", title: "Submit Reading" }] },
        { title: "📊 REPORTS", rows: [{ id: "path_monthly", title: "Monthly Report" }, { id: "path_unpaid", title: "Unpaid Bills" }] },
        { title: "🔍 LOOKUP", rows: [{ id: "path_lookup", title: "Get Unit Bill" }, { id: "path_summary", title: "Property Summary" }] }
      ])
      return NextResponse.json({ ok: true })
    }

    // 3. Session Handling (Ongoing Tasks)
    const session = await getSession(from)
    if (session) {
      // --- Reading Submission Steps ---
      if (session.step === 'awaiting_unit_reading') {
        const unitNum = text.toUpperCase()
        const { data: unit } = await supabase.from('units').select('id, rent, tenants(id, name)').eq('unit_number', unitNum).single()
        if (!unit?.tenants?.[0]) return await sendText(from, `❌ Unit *${unitNum}* not found or has no tenant.`)
        
        const tenant = unit.tenants[0]
        const { data: last } = await supabase.from('utility_bills').select('curr_reading').eq('tenant_id', tenant.id).order('billing_month', { ascending: false }).limit(1).single()
        
        await updateSession(from, { step: 'awaiting_reading_value', unit_id: unit.id, unit_num: unitNum, tenant_name: tenant.name, tenant_id: tenant.id, prev_reading: last?.curr_reading || 0, rent: unit.rent })
        return await sendText(from, `👤 *Tenant:* ${tenant.name}\n📟 *Previous:* ${last?.curr_reading || 0}\n\nWhat is the *Current Reading*? (Reply 'cancel' to stop)`)
      }
      
      if (session.step === 'awaiting_reading_value') {
        const curr = parseFloat(text)
        if (isNaN(curr)) return await sendText(from, "❌ Please send a valid number.")
        await updateSession(from, { step: 'awaiting_water_value', curr_reading: curr })
        return await sendButtons(from, `📟 *Current:* ${curr}`, ["Skip (140)", "Enter Custom"])
      }

      if (session.step === 'awaiting_water_value') {
        if (input === 'enter custom') return await sendText(from, "Type water amount:")
        const water = input === 'skip (140)' ? 140 : parseFloat(text)
        if (isNaN(water)) return await sendText(from, "❌ Please send a valid number.")
        
        const units = session.curr_reading - session.prev_reading
        const elec = Math.max(units * 10, 150)
        const total = parseFloat(session.rent) + elec + water
        
        await supabase.from('utility_bills').upsert({ user_id: profile.id, tenant_id: session.tenant_id, billing_month: new Date().toISOString().slice(0, 7), prev_reading: session.prev_reading, curr_reading: session.curr_reading, rate_per_unit: 10, fixed_rent: session.rent, water_bill: water, total_amount: total, due_date: new Date(new Date().getFullYear(), new Date().getMonth(), 10).toISOString().split('T')[0] })
        await clearSession(from)
        return await sendButtons(from, `✅ *Bill Saved for ${session.unit_num}*\n💰 Total: ₹${total.toLocaleString()}`, ["Main Menu", "Submit Reading"])
      }

      // --- Bill Lookup Steps ---
      if (session.step === 'awaiting_tenant_selection') {
        const tenantId = listId?.replace('tenant_', '')
        if (!tenantId) return NextResponse.json({ ok: true })
        const { data: bills } = await supabase.from('utility_bills').select('billing_month').eq('tenant_id', tenantId).order('billing_month', { ascending: false }).limit(5)
        if (!bills?.length) {
          await clearSession(from)
          return await sendButtons(from, `📭 No history found.`, ["Main Menu", "Get Unit Bill"])
        }
        await updateSession(from, { step: 'awaiting_month_selection', tenant_id: tenantId })
        return await sendListMenu(from, `📅 Select Month`, "Choose:", "Select", [{ title: "MONTHS", rows: bills.map(b => ({ id: `month_${b.billing_month}`, title: b.billing_month })) }])
      }

      if (session.step === 'awaiting_month_selection') {
        const month = listId?.replace('month_', '')
        if (!month) return NextResponse.json({ ok: true })
        const { data: bill } = await supabase.from('utility_bills').select('*').eq('tenant_id', session.tenant_id).eq('billing_month', month).single()
        if (bill) {
          const detail = `🧾 *Bill Breakdown (${month})*\n\n🏠 *Rent:* ₹${parseFloat(bill.fixed_rent).toLocaleString()}\n⚡ *Elec:* ₹${Math.max((bill.curr_reading - bill.prev_reading) * 10, 150).toLocaleString()}\n💧 *Water:* ₹${parseFloat(bill.water_bill).toLocaleString()}\n_________________________\n💰 *TOTAL: ₹${parseFloat(bill.total_amount).toLocaleString()}*`
          await clearSession(from)
          return await sendButtons(from, detail, ["Main Menu", "Get Unit Bill"])
        }
        return NextResponse.json({ ok: true })
      }

      // --- Monthly Report Step ---
      if (session.step === 'awaiting_report_month_selection') {
        const monthCode = listId?.replace('report_', '')
        if (!monthCode) return NextResponse.json({ ok: true })
        
        const { data: bills } = await supabase.from('utility_bills').select('*').eq('user_id', profile.id).eq('billing_month', monthCode)
        if (!bills?.length) {
          await clearSession(from)
          return await sendButtons(from, `📭 No data for ${monthCode}`, ["Main Menu", "Monthly Report"])
        }
        
        const { data: tenants } = await supabase.from('tenants').select('id, name, unit_id').in('id', bills.map(b => b.tenant_id))
        const { data: units } = await supabase.from('units').select('id, unit_number').in('id', (tenants || []).map(t => t.unit_id))
        const tMap = Object.fromEntries((tenants || []).map(t => [t.id, t.name]))
        const uMap = Object.fromEntries((tenants || []).map(t => [t.id, (units || []).find(u => u.id === t.unit_id)?.unit_number || 'Unit']))
        
        let r = `📊 *Report: ${monthCode}*\n\n`; let gt = 0
        bills.forEach(b => {
          const t = parseFloat(b.total_amount)
          r += `🏠 *${uMap[b.tenant_id]}* (${tMap[b.tenant_id]}): ₹${t.toLocaleString()}\n`
          gt += t
        })
        
        await clearSession(from)
        return await sendButtons(from, r + `\n⭐ *TOTAL: ₹${gt.toLocaleString()}*`, ["Main Menu", "Monthly Report"])
      }
    }

    // 4. Initial Triggers (Start of flows)
    if (listId === 'path_reading' || input === 'submit reading') {
      await updateSession(from, { step: 'awaiting_unit_reading' })
      return await sendText(from, "📝 Which Unit? (e.g. G01)")
    }
    
    if (listId === 'path_lookup' || input === 'get unit bill') {
      const { data: tenants } = await supabase.from('tenants').select('id, name, unit_id').eq('user_id', profile.id).eq('status', 'Active')
      if (!tenants?.length) return await sendText(from, "🏠 No active tenants.")
      const { data: units } = await supabase.from('units').select('id, unit_number').in('id', tenants.map(t => t.unit_id))
      const uMap = Object.fromEntries((units || []).map(u => [u.id, u.unit_number]))
      await updateSession(from, { step: 'awaiting_tenant_selection' })
      return await sendListMenu(from, "🔍 Select Tenant", "Choose:", "Select", [{ title: "ACTIVE", rows: tenants.map(t => ({ id: `tenant_${t.id}`, title: `${uMap[t.unit_id] || 'Unit'} - ${t.name}`.substring(0, 24) })) }])
    }

    if (listId === 'path_summary' || input === 'property summary') {
      const { data: props } = await supabase.from('properties').select('name, units').eq('user_id', profile.id)
      return await sendButtons(from, props?.length ? `🏢 *Properties:*\n` + props.map(p => `• ${p.name}: ${p.units}u`).join('\n') : "🏠 No properties.", ["Main Menu"])
    }

    if (listId === 'path_monthly' || input === 'monthly report') {
      const rows = []
      for (let i = 0; i < 6; i++) {
        const d = new Date()
        d.setMonth(d.getMonth() - i)
        rows.push({ id: `report_${d.toISOString().slice(0, 7)}`, title: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) })
      }
      await updateSession(from, { step: 'awaiting_report_month_selection' })
      return await sendListMenu(from, "📅 Monthly Report", "Select month:", "Select", [{ title: "MONTHS", rows }])
    }

    // 5. Action Fallbacks (Direct Response)
    if (listId === 'path_unpaid' || input === 'unpaid bills') {
      const { data: bills } = await supabase.from('utility_bills').select(`total_amount, billing_month, tenant_id`).eq('user_id', profile.id).order('billing_month', { ascending: false }).limit(10)
      if (!bills?.length) return await sendButtons(from, "✅ All Paid.", ["Main Menu"])
      const { data: tenants } = await supabase.from('tenants').select('id, name, unit_id').in('id', bills.map(b => b.tenant_id))
      const { data: units } = await supabase.from('units').select('id, unit_number').in('id', (tenants || []).map(t => t.unit_id))
      const tMap = Object.fromEntries((tenants || []).map(t => [t.id, t.name])); const uMap = Object.fromEntries((tenants || []).map(t => [t.id, (units || []).find(u => u.id === t.unit_id)?.unit_number || 'Unit']))
      let r = `🚩 Outstanding Bills:\n\n`; bills.forEach(b => { r += `▫️ ${uMap[b.tenant_id]}: ₹${parseFloat(b.total_amount).toLocaleString()}\n` })
      return await sendButtons(from, r, ["Main Menu"])
    }

    // 6. Generic Help
    await sendText(from, "❓ Sorry, I didn't understand that. Please send *Hi* to see the menu.")
    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error('Bot Error:', err)
    return NextResponse.json({ ok: true })
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN) return new Response(searchParams.get('hub.challenge'))
  return new Response('Error', { status: 403 })
}
