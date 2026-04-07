import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// --- UTILS ---

async function sendWhatsApp(to, messageData) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_ID
  if (!token || !phoneId) return

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

const sendText = (to, text) => sendWhatsApp(to, { type: "text", text: { body: text } })

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
    const body = await req.json()
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
    if (!message) return NextResponse.json({ ok: true })

    const from = message.from
    const text = (message.text?.body || message.interactive?.button_reply?.title || "").trim()
    if (!from || !text) return NextResponse.json({ ok: true })

    const cleanPhone = from.replace(/\D/g, '')
    const input = text.toLowerCase()

    // 1. Auth Owner
    const { data: profile } = await supabase.from('profiles').select('*').eq('contact_number', cleanPhone).single()
    if (!profile) {
      await sendText(from, `⚠️ *Unauthorized: ${cleanPhone}*\nPlease update your PropManager Settings.`)
      return NextResponse.json({ ok: true })
    }

    // 2. Menu Logic
    if (['hi', 'hello', 'menu', 'start'].includes(input)) {
      await sendButtons(from, `👋 *Hello, ${profile.business_name || 'Owner'}!*\nWhat would you like to do?`, 
        ["Submit Reading", "Monthly Report", "Unpaid Bills"]
      )
    }

    // 3. Option: Submit Reading
    else if (input === 'submit reading') {
      await sendText(from, "📝 *Enter Reading*\nSend: *[Unit] [Reading]*\nExample: *G01 4580*")
    }

    // 4. Option: Monthly Report (Prompt for Month)
    else if (input === 'monthly report') {
      await sendText(from, "📅 *Monthly Billing Report*\nPlease send the month you want to view.\n\n*Format:* MM-YYYY (e.g., 01-2026 or Jan 2026)")
    }

    // 5. Option: Unpaid Bills
    else if (input === 'unpaid bills') {
      const month = new Date().toISOString().slice(0, 7)
      const { data: bills } = await supabase.from('utility_bills').select(`total_amount, tenants(name, units(unit_number))`).eq('user_id', profile.id).eq('billing_month', month)
      let msg = bills?.length ? `🚩 *Pending (${month}):*\n` + bills.map(b => `• *${b.tenants.units.unit_number}*: ₹${b.total_amount.toLocaleString()}`).join('\n') : `✅ All bills paid for ${month}!`
      await sendText(from, msg)
    }

    // 6. Handle Special Inputs (Readings or Months)
    else {
      // Check if input is a Month Request (e.g., "01-2026" or "Jan 2026")
      const monthRegex = /^(0[1-9]|1[0-2])[-/](20\d{2})$/
      const namedMonthRegex = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s*(20\d{2})$/
      
      let targetMonth = ""
      if (monthRegex.test(input)) {
        const [m, y] = input.split(/[-/]/)
        targetMonth = `${y}-${m}`
      } else if (namedMonthRegex.test(input)) {
        const months = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06', jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' }
        const [mName, y] = input.split(/\s+/)
        targetMonth = `${y}-${months[mName]}`
      }

      if (targetMonth) {
        const { data: bills } = await supabase
          .from('utility_bills')
          .select(`total_amount, tenants(name, units(unit_number))`)
          .eq('user_id', profile.id)
          .eq('billing_month', targetMonth)

        if (!bills?.length) {
          await sendText(from, `📭 No billing data found for *${targetMonth}*.`)
        } else {
          let report = `📊 *Billing Report for ${targetMonth}*\n_________________________\n\n`
          let total = 0
          bills.forEach(b => {
            report += `• *${b.tenants.units.unit_number}* (${b.tenants.name}): ₹${b.total_amount.toLocaleString()}\n`
            total += b.total_amount
          })
          report += `_________________________\n💰 *Month Total: ₹${total.toLocaleString()}*`
          await sendText(from, report)
        }
        return NextResponse.json({ ok: true })
      }

      // Check if input is Reading (e.g., "G01 4500")
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
          if (currentReading < prevReading) {
            await sendText(from, `❌ *Lower Reading Error*\nCurrent: ${currentReading} | Previous: ${prevReading}`)
            return NextResponse.json({ ok: true })
          }

          const energyBill = Math.max((currentReading - prevReading) * 10, 150)
          const total = parseFloat(unit.rent) + energyBill + 140

          await supabase.from('utility_bills').upsert({
            user_id: profile.id, tenant_id: tenant.id, billing_month: month,
            prev_reading: prevReading, curr_reading: currentReading,
            rate_per_unit: 10, fixed_rent: unit.rent, water_bill: 140, total_amount: total,
            due_date: new Date(new Date().getFullYear(), new Date().getMonth(), 10).toISOString().split('T')[0]
          })

          const upi = profile.upi_id ? `upi://pay?pa=${profile.upi_id}&pn=${encodeURIComponent(profile.business_name)}&am=${total}&cu=INR` : ''
          await sendText(from, `✅ *Saved for ${unitNumber}*\nTenant: ${tenant.name}\nTotal: ₹${total.toLocaleString()}\n\n${upi ? `📲 *PAY LINK:*\n${upi}\n` : ''}_Reply 'Menu' for more._`)
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
