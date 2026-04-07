import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// --- UTILS ---

// Verify that the request is actually from Meta
function verifyRequestSignature(req, body) {
  const signature = req.headers.get('x-hub-signature-256')
  if (!signature) return false

  const elements = signature.split('=')
  const signatureHash = elements[1]
  const expectedHash = crypto
    .createHmac('sha256', process.env.WHATSAPP_APP_SECRET || '')
    .update(body)
    .digest('hex')

  return signatureHash === expectedHash
}

async function sendWhatsApp(to, messageData) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_ID
  
  await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      ...messageData
    })
  })
}

// Helper for simple text replies
const sendText = (to, text) => sendWhatsApp(to, { type: "text", text: { body: text } })

// Helper for interactive button menus
const sendButtons = (to, text, buttons) => sendWhatsApp(to, {
  type: "interactive",
  interactive: {
    type: "button",
    body: { text },
    action: {
      buttons: buttons.map((b, i) => ({
        type: "reply",
        reply: { id: `btn_${i}`, title: b }
      }))
    }
  }
})

// --- BOT LOGIC ---

export async function POST(req) {
  try {
    const rawBody = await req.text()
    
    // Optional: Security check (Requires WHATSAPP_APP_SECRET in Vercel)
    if (process.env.WHATSAPP_APP_SECRET && !verifyRequestSignature(req, rawBody)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const body = JSON.parse(rawBody)
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
    if (!message) return NextResponse.json({ ok: true })

    const from = message.from
    const text = message.text?.body || message.interactive?.button_reply?.title
    if (!from || !text) return NextResponse.json({ ok: true })

    const cleanPhone = from.replace(/\D/g, '')
    const input = text.trim().toLowerCase()

    // 1. Auth Owner
    const { data: profile } = await supabase.from('profiles').select('*').eq('contact_number', cleanPhone).single()

    if (!profile) {
      await sendText(from, `⚠️ *Unauthorized: ${cleanPhone}*\nPlease register this number in your PropManager Settings.`)
      return NextResponse.json({ ok: true })
    }

    // 2. Menu Logic (Now with Buttons!)
    if (['hi', 'hello', 'menu', 'start'].includes(input)) {
      await sendButtons(from, `👋 *Hello, ${profile.business_name || 'Owner'}!*\nHow can I help you today?`, 
        ["Submit Reading", "Property Summary", "Unpaid Bills"]
      )
      return NextResponse.json({ ok: true })
    }

    // 3. Option: Submit Reading
    if (input === 'submit reading') {
      await sendText(from, "📝 *Enter Reading*\nSend the Unit and Reading.\nFormat: *[Unit] [Reading]*\nExample: *G01 4580*")
    }
    
    // 4. Option: Property Summary
    else if (input === 'property summary') {
      const { data: props } = await supabase.from('properties').select('name, units').eq('user_id', profile.id)
      let msg = props?.length ? `🏢 *Properties:*\n` + props.map(p => `• ${p.name}: ${p.units} units`).join('\n') : "🏠 No properties found."
      await sendText(from, msg)
    }

    // 5. Option: Unpaid Bills
    else if (input === 'unpaid bills') {
      const month = new Date().toISOString().slice(0, 7)
      const { data: bills } = await supabase.from('utility_bills').select(`total_amount, tenants(name, units(unit_number))`).eq('user_id', profile.id).eq('billing_month', month)
      let msg = bills?.length ? `🚩 *Pending (${month}):*\n` + bills.map(b => `• *${b.tenants.units.unit_number}*: ₹${b.total_amount.toLocaleString()}`).join('\n') : `✅ All paid for ${month}!`
      await sendText(from, msg)
    }

    // 6. Parsing Reading Input (e.g. "G01 4500")
    else {
      const parts = text.trim().split(/\s+/)
      if (parts.length === 2 && !isNaN(parseFloat(parts[1]))) {
        const unitNumber = parts[0].toUpperCase()
        const currentReading = parseFloat(parts[1])

        const { data: unit } = await supabase.from('units').select('id, rent, tenants(id, name)').eq('unit_number', unitNumber).single()

        if (unit?.tenants?.[0]) {
          const tenant = unit.tenants[0]
          const month = new Date().toISOString().slice(0, 7)
          const { data: last } = await supabase.from('utility_bills').select('curr_reading').eq('tenant_id', tenant.id).order('billing_month', { ascending: false }).limit(1).single()

          const prevReading = last?.curr_reading || 0
          
          // Validation: Reading cannot be lower than previous
          if (currentReading < prevReading) {
            await sendText(from, `❌ *Invalid Reading*\nCurrent (${currentReading}) is lower than previous (${prevReading}). Please check again.`)
            return NextResponse.json({ ok: true })
          }

          const energyUnits = currentReading - prevReading
          let energyBill = Math.max(energyUnits * 10, 150) // ₹150 minimum
          const total = parseFloat(unit.rent) + energyBill + 140

          await supabase.from('utility_bills').upsert({
            user_id: profile.id, tenant_id: tenant.id, billing_month: month,
            prev_reading: prevReading, curr_reading: currentReading,
            rate_per_unit: 10, fixed_rent: unit.rent, water_bill: 140, total_amount: total,
            due_date: new Date(new Date().getFullYear(), new Date().getMonth(), 10).toISOString().split('T')[0]
          })

          const upi = profile.upi_id ? `upi://pay?pa=${profile.upi_id}&pn=${encodeURIComponent(profile.business_name)}&am=${total}&cu=INR` : ''
          await sendText(from, `✅ *Recorded for ${unitNumber}*\n👤 *Tenant:* ${tenant.name}\n_________________________\n\n▫️ Rent: ₹${unit.rent.toLocaleString()}\n▫️ Water: ₹140\n▫️ Electricity (${energyUnits} u): ₹${energyBill.toLocaleString()}\n_________________________\n\n💰 *TOTAL: ₹${total.toLocaleString()}*\n_________________________\n\n${upi ? `📲 *PAY LINK:*\n${upi}\n` : ''}_Select 'Menu' for more._`)
        } else {
          await sendText(from, `❌ Unit *${unitNumber}* not found.`)
        }
      } else {
        await sendText(from, "❓ Send *Hi* to see the menu.")
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(err)
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
