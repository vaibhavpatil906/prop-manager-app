import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder'
const supabase = createClient(supabaseUrl, supabaseKey)

// Helper to send WhatsApp messages back
async function sendWhatsApp(to, text) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_ID // From Meta Dashboard
  
  if (!token || !phoneId) {
    console.error('Missing WhatsApp API credentials')
    return
  }

  await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: to,
      type: "text",
      text: { body: text }
    })
  })
}

export async function POST(req) {
  try {
    const body = await req.json()
    
    // Meta Cloud API structure
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
    if (!message) return NextResponse.json({ ok: true })

    const from = message.from
    const text = message.text?.body
    if (!from || !text) return NextResponse.json({ ok: true })

    const cleanPhone = from.replace(/\D/g, '')
    const input = text.trim().toLowerCase()

    // 1. Auth Owner
    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('id, business_name, upi_id')
      .eq('contact_number', cleanPhone)
      .single()

    if (pErr || !profile) {
      await sendWhatsApp(from, `⚠️ *Unauthorized Number: ${cleanPhone}*\nPlease add this exact number to your PropManager 'Settings' to use the bot.`)
      return NextResponse.json({ ok: true })
    }

    let reply = ""

    // 2. Menu Logic
    if (['hi', 'hello', 'menu', 'start', '0'].includes(input)) {
      reply = `👋 *Hello, ${profile.business_name || 'Owner'}!*\n\n` +
              `Select an option:\n\n` +
              `1️⃣ *Submit Reading*\n` +
              `2️⃣ *Property Summary*\n` +
              `3️⃣ *Unpaid Bills (This Month)*\n` +
              `4️⃣ *Help*\n\n` +
              `_Reply with the number or keyword._`
    } 
    else if (input === '1' || input === 'reading') {
      reply = "📝 *Submit Reading*\nSend the Unit Number and Reading.\n\n*Format:* [Unit] [Reading]\n*Example:* G01 4580"
    }
    else if (input === '2' || input === 'summary') {
      const { data: props } = await supabase.from('properties').select('name, units').eq('user_id', profile.id)
      if (!props?.length) reply = "🏠 No properties found."
      else {
        reply = `🏢 *Property Summary:*\n`
        props.forEach(p => reply += `• ${p.name}: ${p.units} Units\n`)
      }
    }
    else if (input === '3' || input === 'unpaid') {
      const currentMonth = new Date().toISOString().slice(0, 7)
      const { data: bills } = await supabase
        .from('utility_bills')
        .select(`total_amount, tenants (name, units (unit_number))`)
        .eq('user_id', profile.id)
        .eq('billing_month', currentMonth)

      if (!bills?.length) reply = `✅ No bills found for ${currentMonth}.`
      else {
        reply = `🚩 *Pending Collections (${currentMonth}):*\n\n`
        bills.forEach(b => {
          reply += `• *${b.tenants.units.unit_number}* (${b.tenants.name}): ₹${b.total_amount.toLocaleString()}\n`
        })
      }
    }
    else {
      // Check for reading input: [Unit] [Reading]
      const parts = text.trim().split(/\s+/)
      if (parts.length === 2 && !isNaN(parseFloat(parts[1]))) {
        const unitNumber = parts[0].toUpperCase()
        const currentReading = parseFloat(parts[1])

        const { data: unit } = await supabase
          .from('units')
          .select('id, rent, tenants(id, name)')
          .eq('unit_number', unitNumber)
          .single()

        if (unit?.tenants?.[0]) {
          const tenant = unit.tenants[0]
          const currentMonth = new Date().toISOString().slice(0, 7)
          const { data: lastBill } = await supabase
            .from('utility_bills')
            .select('curr_reading')
            .eq('tenant_id', tenant.id)
            .order('billing_month', { ascending: false }).limit(1).single()

          const prevReading = lastBill?.curr_reading || 0
          const energyUnits = currentReading - prevReading
          let energyBill = energyUnits * 10
          if (energyBill > 0 && energyBill < 150) energyBill = 150
          const totalAmount = parseFloat(unit.rent) + energyBill + 140

          await supabase.from('utility_bills').upsert({
            user_id: profile.id,
            tenant_id: tenant.id,
            billing_month: currentMonth,
            prev_reading: prevReading,
            curr_reading: currentReading,
            rate_per_unit: 10,
            fixed_rent: unit.rent,
            water_bill: 140,
            total_amount: totalAmount,
            due_date: new Date(new Date().getFullYear(), new Date().getMonth(), 10).toISOString().split('T')[0]
          })

          const upi = profile.upi_id ? `upi://pay?pa=${profile.upi_id}&pn=${encodeURIComponent(profile.business_name)}&am=${totalAmount}&cu=INR` : ''
          reply = `✅ *Recorded for ${unitNumber}*\n👤 *Tenant:* ${tenant.name}\n_________________________\n\n▫️ Rent: ₹${unit.rent.toLocaleString()}\n▫️ Water: ₹140\n▫️ Electricity (${energyUnits} u): ₹${energyBill.toLocaleString()}\n_________________________\n\n💰 *TOTAL: ₹${totalAmount.toLocaleString()}*\n_________________________\n\n${upi ? `📲 *PAY LINK:*\n${upi}\n` : ''}_Reply 'Menu' for more._`
        } else {
          reply = `❌ Unit *${unitNumber}* not found.`
        }
      } else {
        reply = "❓ Sorry, I didn't get that. Reply with *Hi* to see the menu."
      }
    }

    if (reply) await sendWhatsApp(from, reply)
    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error('Bot Error:', err)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(searchParams.get('hub.challenge'))
  }
  return new Response('Error', { status: 403 })
}
