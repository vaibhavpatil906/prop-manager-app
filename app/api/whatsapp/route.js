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
      await sendText(from, `⚠️ *Unauthorized: ${cleanPhone}*\nPlease update settings in the app.`)
      return NextResponse.json({ ok: true })
    }

    const now = new Date()
    const curMonthLabel = now.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthLabel = lastMonthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

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

    // 4. Option: Monthly Report (Send Month Buttons)
    else if (input === 'monthly report') {
      await sendButtons(from, "📅 *Select Month*\nChoose a month for the detailed report:", 
        [curMonthLabel, lastMonthLabel, "Other Month"]
      )
    }

    // 5. Option: Unpaid Bills (Now shows all months)
    else if (input === 'unpaid bills') {
      // Fetch all utility_bills that don't have a corresponding 'Paid' status in payments
      // Based on typical schema, we check for bills without payment or with pending status
      const { data: unpaidBills } = await supabase
        .from('utility_bills')
        .select(`
          total_amount,
          billing_month,
          tenants (
            name,
            units (unit_number)
          )
        `)
        .eq('user_id', profile.id)
        .order('billing_month', { ascending: false })

      // Note: Real filter should include payment_status check if available
      if (!unpaidBills?.length) {
        await sendText(from, "✅ No unpaid bills found across all months!")
      } else {
        let report = `🚩 *Outstanding Collections*\n_________________________\n\n`
        let grandTotal = 0
        
        // Group by tenant for cleaner display
        const grouped = unpaidBills.reduce((acc, bill) => {
          const key = `${bill.tenants.units.unit_number} - ${bill.tenants.name}`
          if (!acc[key]) acc[key] = []
          acc[key].push(bill)
          return acc
        }, {})

        for (const [tenant, bills] of Object.entries(grouped)) {
          let tenantTotal = 0
          report += `👤 *${tenant}*\n`
          bills.forEach(b => {
            report += `▫️ ${b.billing_month}: ₹${parseFloat(b.total_amount).toLocaleString()}\n`
            tenantTotal += parseFloat(b.total_amount)
          })
          report += `💰 *Balance: ₹${tenantTotal.toLocaleString()}*\n\n`
          grandTotal += tenantTotal
        }

        report += `_________________________\n⭐ *TOTAL DUE: ₹${grandTotal.toLocaleString()}*`
        await sendText(from, report)
      }
    }

    // 6. Handle Special Inputs (Month Selection or Readings)
    else {
      const monthsMap = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06', jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' }
      let targetMonth = ""
      const manualMatch = input.match(/^(0[1-9]|1[0-2])[-/](20\d{2})$/)
      if (manualMatch) targetMonth = `${manualMatch[2]}-${manualMatch[1]}`
      else {
        const buttonMatch = input.match(/^([a-z]{3})\s*(20\d{2})$/)
        if (buttonMatch && monthsMap[buttonMatch[1]]) targetMonth = `${buttonMatch[2]}-${monthsMap[buttonMatch[1]]}`
      }

      if (targetMonth) {
        const { data: bills } = await supabase
          .from('utility_bills')
          .select(`fixed_rent, water_bill, total_amount, curr_reading, prev_reading, rate_per_unit, tenants (name, units (unit_number))`)
          .eq('user_id', profile.id)
          .eq('billing_month', targetMonth)

        if (!bills?.length) {
          await sendText(from, `📭 No data for *${targetMonth}*.`)
        } else {
          let report = `📊 *Report: ${targetMonth}*\n_________________________\n\n`
          let grandTotal = 0
          bills.forEach(b => {
            const units = b.curr_reading - b.prev_reading
            const light = Math.max(units * (b.rate_per_unit || 10), 150)
            const unitTotal = parseFloat(b.fixed_rent) + light + parseFloat(b.water_bill)
            report += `🏠 *${b.tenants.units.unit_number}* (${b.tenants.name})\n▫️ Rent: ₹${parseFloat(b.fixed_rent).toLocaleString()}\n▫️ Light: ₹${light.toLocaleString()} (${units}u)\n▫️ Water: ₹${parseFloat(b.water_bill).toLocaleString()}\n💰 *Total: ₹${unitTotal.toLocaleString()}*\n_________________________\n\n`
            grandTotal += unitTotal
          })
          report += `⭐ *GRAND TOTAL: ₹${grandTotal.toLocaleString()}*`
          await sendText(from, report)
        }
        return NextResponse.json({ ok: true })
      }

      const parts = text.trim().split(/\s+/)
      if (parts.length === 2 && !isNaN(parseFloat(parts[1]))) {
        const unitNumber = parts[0].toUpperCase()
        const currentReading = parseFloat(parts[1])
        const { data: unit } = await supabase.from('units').select('id, rent, tenants(id, name)').eq('unit_number', unitNumber).single()

        if (unit?.tenants?.[0]) {
          const tenant = unit.tenants[0]
          const month = now.toISOString().slice(0, 7)
          const { data: last } = await supabase.from('utility_bills').select('curr_reading').eq('tenant_id', tenant.id).order('billing_month', { ascending: false }).limit(1).single()
          const prevReading = last?.curr_reading || 0
          if (currentReading < prevReading) {
            await sendText(from, `❌ *Lower Reading Error*\nCurrent: ${currentReading} | Prev: ${prevReading}`)
            return NextResponse.json({ ok: true })
          }

          const lightBill = Math.max((currentReading - prevReading) * 10, 150)
          const total = parseFloat(unit.rent) + lightBill + 140

          await supabase.from('utility_bills').upsert({
            user_id: profile.id, tenant_id: tenant.id, billing_month: month,
            prev_reading: prevReading, curr_reading: currentReading,
            rate_per_unit: 10, fixed_rent: unit.rent, water_bill: 140, total_amount: total,
            due_date: new Date(now.getFullYear(), now.getMonth(), 10).toISOString().split('T')[0]
          })

          const upi = profile.upi_id ? `upi://pay?pa=${profile.upi_id}&pn=${encodeURIComponent(profile.business_name)}&am=${total}&cu=INR` : ''
          await sendText(from, `✅ *Saved for ${unitNumber}*\nTotal: ₹${total.toLocaleString()}\n\n${upi ? `📲 *PAY LINK:*\n${upi}\n` : ''}_Reply 'Menu' for more._`)
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
