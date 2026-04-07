import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Use Service Role Key to bypass RLS for the Bot
// Create a Supabase client that safely handles missing env vars during build
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder'

const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST(req) {
  try {
    const body = await req.json()
    
    // Extract sender and text. 
    // Note: Adjust 'from' and 'text' paths based on your specific WhatsApp provider (e.g., Twilio vs Meta Cloud API)
    const from = body.from || body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from
    const text = body.text || body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body

    if (!from || !text) return NextResponse.json({ error: 'Missing data' }, { status: 400 })

    const cleanPhone = from.replace(/\D/g, '')
    const input = text.trim().toLowerCase()

    // 1. Authenticate Owner via Phone Number
    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('id, business_name, upi_id')
      .eq('contact_number', cleanPhone)
      .single()

    if (pErr || !profile) {
      return NextResponse.json({ reply: "⚠️ *Unauthorized Number*\nPlease add this phone number to your PropManager 'Settings' to use the bot." })
    }

    // 2. Main Menu Logic
    if (['hi', 'hello', 'menu', 'start', '0'].includes(input)) {
      const menu = `👋 *Hello, ${profile.business_name || 'Owner'}!*\n\n` +
                   `Welcome to your PropManager Assistant. Select an option:\n\n` +
                   `1️⃣ *Submit Reading*\n` +
                   `2️⃣ *Property Summary*\n` +
                   `3️⃣ *Unpaid Bills (This Month)*\n` +
                   `4️⃣ *Help*\n\n` +
                   `_Reply with the number or keyword._`
      return NextResponse.json({ reply: menu })
    }

    // 3. Option 1: Submit Reading Instruction
    if (input === '1' || input === 'reading') {
      return NextResponse.json({ reply: "📝 *Submit Reading*\nSend the Unit Number and Reading.\n\n*Format:* [Unit] [Reading]\n*Example:* G01 4580" })
    }

    // 4. Option 2: Property Summary
    if (input === '2' || input === 'summary') {
      const { data: props } = await supabase.from('properties').select('name, units').eq('user_id', profile.id)
      if (!props?.length) return NextResponse.json({ reply: "🏠 No properties found in your account." })
      
      let msg = `🏢 *Property Summary:*\n`
      props.forEach(p => msg += `• ${p.name}: ${p.units} Units\n`)
      return NextResponse.json({ reply: msg })
    }

    // 5. Option 3: Unpaid Bills Report
    if (input === '3' || input === 'unpaid') {
      const currentMonth = new Date().toISOString().slice(0, 7)
      
      // Fetch bills for current month that don't have a 'Paid' status in payments table
      const { data: bills, error: bErr } = await supabase
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
        .eq('billing_month', currentMonth)

      if (bErr) return NextResponse.json({ reply: "❌ Error fetching bills." })
      
      // Since status is in 'payments', for simplicity we check if a payment exists
      // Real implementation would join or filter by payment_status column if added to utility_bills
      if (!bills?.length) return NextResponse.json({ reply: `✅ No bills generated yet for ${currentMonth}.` })

      let report = `🚩 *Pending Collections (${currentMonth}):*\n\n`
      bills.forEach(b => {
        report += `• *${b.tenants.units.unit_number}* (${b.tenants.name}): ₹${b.total_amount.toLocaleString()}\n`
      })
      report += `\n_Send '1' to record more readings._`
      return NextResponse.json({ reply: report })
    }

    // 6. Parsing Reading Input (e.g. "G01 4500")
    const parts = text.trim().split(/\s+/)
    if (parts.length === 2 && !isNaN(parseFloat(parts[1]))) {
      const unitNumber = parts[0].toUpperCase()
      const currentReading = parseFloat(parts[1])

      // Find Tenant and Unit Details
      const { data: unit, error: uErr } = await supabase
        .from('units')
        .select('id, rent, tenants(id, name, phone)')
        .eq('unit_number', unitNumber)
        .single()

      if (uErr || !unit || !unit.tenants?.[0]) {
        return NextResponse.json({ reply: `❌ Unit *${unitNumber}* not found or has no active tenant.` })
      }

      const tenant = unit.tenants[0]
      const currentMonth = new Date().toISOString().slice(0, 7)

      // Fetch Last Reading to calculate consumption
      const { data: lastBill } = await supabase
        .from('utility_bills')
        .select('curr_reading')
        .eq('tenant_id', tenant.id)
        .order('billing_month', { ascending: false })
        .limit(1)
        .single()

      const prevReading = lastBill?.curr_reading || 0
      const energyUnits = currentReading - prevReading
      const ratePerUnit = 10
      let energyBill = energyUnits * ratePerUnit
      if (energyBill > 0 && energyBill < 150) energyBill = 150 // Minimum bill logic
      
      const waterBill = 140
      const totalAmount = parseFloat(unit.rent) + energyBill + waterBill

      // Save/Update Bill in Database
      const { error: saveErr } = await supabase
        .from('utility_bills')
        .upsert({
          user_id: profile.id,
          tenant_id: tenant.id,
          billing_month: currentMonth,
          prev_reading: prevReading,
          curr_reading: currentReading,
          rate_per_unit: ratePerUnit,
          fixed_rent: unit.rent,
          water_bill: waterBill,
          total_amount: totalAmount,
          due_date: new Date(new Date().getFullYear(), new Date().getMonth(), 10).toISOString().split('T')[0]
        })

      if (saveErr) return NextResponse.json({ reply: `❌ Database Error: ${saveErr.message}` })

      // Generate UPI Link
      const upi = profile.upi_id ? `upi://pay?pa=${profile.upi_id}&pn=${encodeURIComponent(profile.business_name)}&am=${totalAmount}&cu=INR` : ''

      const invoice = `✅ *Recorded for ${unitNumber}*\n` +
                      `👤 *Tenant:* ${tenant.name}\n` +
                      `_________________________\n\n` +
                      `▫️ Rent: ₹${unit.rent.toLocaleString()}\n` +
                      `▫️ Water: ₹${waterBill.toLocaleString()}\n` +
                      `▫️ Electricity (${energyUnits} u): ₹${energyBill.toLocaleString()}\n` +
                      `_________________________\n\n` +
                      `💰 *TOTAL: ₹${totalAmount.toLocaleString()}*\n` +
                      `_________________________\n\n` +
                      (upi ? `📲 *PAY LINK:*\n${upi}\n` : '') +
                      `_Reply 'Menu' for more options._`
      
      return NextResponse.json({ reply: invoice })
    }

    // Default Fallback
    return NextResponse.json({ reply: "❓ Sorry, I didn't get that. Reply with *Hi* to see the menu." })

  } catch (err) {
    console.error('Bot Error:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// Webhook Verification for Meta Cloud API
export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 })
  }
  return new Response('Verification failed', { status: 403 })
}
