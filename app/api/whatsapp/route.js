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
    const lastMonthLabel = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

    // 2. Menu Logic
    if (['hi', 'hello', 'menu', 'start'].includes(input)) {
      await sendButtons(from, `👋 *Hello, ${profile.business_name || 'Owner'}!*\nWhat would you like to do?`, 
        ["Submit Reading", "Monthly Report", "Get Bill"]
      )
    }

    // 3. Option: Submit Reading
    else if (input === 'submit reading') {
      await sendText(from, "📝 *Submit Reading*\nSend: *[Unit] [Reading] [Water]*\nExample: *G01 4580 200*\n_(Water is optional, defaults to 140)_")
    }

    // 4. Option: Monthly Report
    else if (input === 'monthly report') {
      await sendButtons(from, "📅 *Detailed Report*\nSelect a month:", [curMonthLabel, lastMonthLabel, "Unpaid Bills"])
    }

    // 5. Option: Get Bill (Instruction)
    else if (input === 'get bill') {
      await sendText(from, "🔍 *Lookup Bill*\nPlease send the *Unit Number* (e.g., G01) to see the latest bill details.")
    }

    else if (input === 'unpaid bills') {
      const { data: unpaid } = await supabase.from('utility_bills').select(`total_amount, billing_month, tenants (name, units (unit_number))`).eq('user_id', profile.id).order('billing_month', { ascending: false })
      if (!unpaid?.length) return await sendText(from, "✅ No unpaid bills found!")
      
      let report = `🚩 *Outstanding Collections*\n_________________________\n\n`
      let grandTotal = 0
      const grouped = unpaid.reduce((acc, b) => {
        const k = `${b.tenants.units.unit_number} - ${b.tenants.name}`
        acc[k] = acc[k] || []; acc[k].push(b); return acc
      }, {})

      for (const [t, bills] of Object.entries(grouped)) {
        let bt = 0
        report += `👤 *${t}*\n`
        bills.forEach(b => { report += `▫️ ${b.billing_month}: ₹${parseFloat(b.total_amount).toLocaleString()}\n`; bt += parseFloat(b.total_amount) })
        report += `💰 *Balance: ₹${bt.toLocaleString()}*\n\n`; grandTotal += bt
      }
      report += `_________________________\n⭐ *TOTAL DUE: ₹${grandTotal.toLocaleString()}*`
      await sendText(from, report)
    }

    // 6. Handle Unit Lookups or Reading Submissions
    else {
      const parts = text.trim().split(/\s+/)
      
      // CASE A: Input is just a Unit Number (e.g., "G01") -> Show Latest Bill
      if (parts.length === 1 && parts[0].length <= 5) {
        const unitNum = parts[0].toUpperCase()
        const { data: unit } = await supabase.from('units').select('id, rent, tenants(id, name)').eq('unit_number', unitNum).single()

        if (unit?.tenants?.[0]) {
          const tenant = unit.tenants[0]
          const { data: bill } = await supabase.from('utility_bills').select('*').eq('tenant_id', tenant.id).order('billing_month', { ascending: false }).limit(1).single()

          if (!bill) {
            await sendText(from, `📭 No bill history found for *${unitNum}*.`)
          } else {
            const units = bill.curr_reading - bill.prev_reading
            const light = Math.max(units * (bill.rate_per_unit || 10), 150)
            const upi = profile.upi_id ? `upi://pay?pa=${profile.upi_id}&pn=${encodeURIComponent(profile.business_name)}&am=${bill.total_amount}&cu=INR` : ''
            
            const msg = `🧾 *Latest Bill: ${unitNum}*\n` +
                        `👤 *Tenant:* ${tenant.name}\n` +
                        `📅 *Month:* ${bill.billing_month}\n` +
                        `_________________________\n\n` +
                        `📟 Reading: ${bill.prev_reading} ➔ ${bill.curr_reading} (${units}u)\n` +
                        `▫️ Rent: ₹${parseFloat(bill.fixed_rent).toLocaleString()}\n` +
                        `▫️ Light: ₹${light.toLocaleString()}\n` +
                        `▫️ Water: ₹${parseFloat(bill.water_bill).toLocaleString()}\n` +
                        `💰 *TOTAL: ₹${parseFloat(bill.total_amount).toLocaleString()}*\n` +
                        `_________________________\n\n` +
                        (upi ? `📲 *PAY LINK:*\n${upi}\n` : '') +
                        `_Reply 'Menu' for more._`
            await sendText(from, msg)
          }
        } else {
          await sendText(from, `❌ Unit *${unitNum}* not found.`)
        }
      } 
      
      // CASE B: Input is Reading Submission: [Unit] [Reading] [Water (optional)]
      else if (parts.length >= 2 && !isNaN(parseFloat(parts[1]))) {
        const unitNumber = parts[0].toUpperCase()
        const currentReading = parseFloat(parts[1])
        const waterBill = parts.length === 3 ? parseFloat(parts[2]) : 140

        const { data: unit } = await supabase.from('units').select('id, rent, tenants(id, name)').eq('unit_number', unitNumber).single()

        if (unit?.tenants?.[0]) {
          const tenant = unit.tenants[0]
          const month = now.toISOString().slice(0, 7)
          const { data: last } = await supabase.from('utility_bills').select('curr_reading').eq('tenant_id', tenant.id).order('billing_month', { ascending: false }).limit(1).single()
          
          const prevReading = last?.curr_reading || 0
          if (currentReading < prevReading) {
            return await sendText(from, `❌ *Error:* Reading (${currentReading}) is lower than previous (${prevReading}).`)
          }

          const energyUnits = currentReading - prevReading
          const lightBill = Math.max(energyUnits * 10, 150)
          const total = parseFloat(unit.rent) + lightBill + waterBill

          await supabase.from('utility_bills').upsert({
            user_id: profile.id, tenant_id: tenant.id, billing_month: month,
            prev_reading: prevReading, curr_reading: currentReading,
            rate_per_unit: 10, fixed_rent: unit.rent, water_bill: waterBill, total_amount: total,
            due_date: new Date(now.getFullYear(), now.getMonth(), 10).toISOString().split('T')[0]
          })

          const upi = profile.upi_id ? `upi://pay?pa=${profile.upi_id}&pn=${encodeURIComponent(profile.business_name)}&am=${total}&cu=INR` : ''
          await sendText(from, `✅ *Saved for ${unitNumber}*\nTenant: ${tenant.name}\nReading: ${prevReading}➔${currentReading}\nTotal: ₹${total.toLocaleString()}\n\n${upi ? `📲 *PAY LINK:*\n${upi}\n` : ''}_Reply 'Menu' for more._`)
        } else {
          await sendText(from, `❌ Unit *${unitNumber}* not found.`)
        }
      } 
      
      // CASE C: Check if it's a Manual Month Request
      else {
        const mthMap = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06', jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' }
        let targetMonth = ""
        const manualMatch = input.match(/^(0[1-9]|1[0-2])[-/](20\d{2})$/)
        if (manualMatch) targetMonth = `${manualMatch[2]}-${manualMatch[1]}`
        else {
          const buttonMatch = input.match(/^([a-z]{3})\s*(20\d{2})$/)
          if (buttonMatch && mthMap[buttonMatch[1]]) targetMonth = `${buttonMatch[2]}-${mthMap[buttonMatch[1]]}`
        }

        if (targetMonth) {
          const { data: bills } = await supabase.from('utility_bills').select(`fixed_rent, water_bill, total_amount, curr_reading, prev_reading, rate_per_unit, tenants (name, units (unit_number))`).eq('user_id', profile.id).eq('billing_month', targetMonth)
          if (!bills?.length) return await sendText(from, `📭 No data for *${targetMonth}*.`)
          
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
        } else {
          await sendText(from, "❓ Send *Hi* to see the menu.")
        }
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
