'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import Sidebar, { TopBar, PageLoader, TOKENS } from '@/app/components/Sidebar'

function InvoiceModal({ data, onClose }) {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  
  useEffect(() => {
    const fetchProfile = async () => {
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (p) setProfile(p)
    }
    fetchProfile()
  }, [user])

  const print = () => window.print()
  const energyUnits = data.curr_reading - data.prev_reading
  let energyBill = energyUnits * data.rate_per_unit
  if (energyBill > 0 && energyBill < 150) energyBill = 150
  
  const displayMonth = data.billing_month ? new Date(data.billing_month + '-02').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'N/A'
  
  const upiLink = profile?.upi_id ? `upi://pay?pa=${profile.upi_id}&pn=${encodeURIComponent(profile.business_name || 'PropManager')}&am=${parseFloat(data.total_amount || data.total)}&cu=INR` : null

  const msg = `🏠 *${(profile?.business_name || 'NAVASAI PROPERTIES').toUpperCase()}*\n` +
              `_________________________\n\n` +
              `📅 *Month:* ${displayMonth}\n` +
              `👤 *Tenant:* ${data.tenantName}\n` +
              `_________________________\n\n` +
              `▫️ Rent: ₹${parseFloat(data.fixed_rent).toLocaleString()}\n` +
              `▫️ Water: ₹${parseFloat(data.water_bill || 0).toLocaleString()}\n` +
              `▫️ Electricity: ₹${energyBill.toLocaleString()}\n` +
              `_________________________\n\n` +
              `💰 *TOTAL DUE: ₹${parseFloat(data.total_amount || data.total).toLocaleString()}*\n` +
              `_________________________\n\n` +
              (upiLink ? `📲 *PAY NOW (Click Link below):*\n${upiLink}\n` +
              `_________________________\n\n` : '') +
              `_Please share screen shot/ref id after payment._`

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} className="modal-wrapper">
      <div style={{ background: '#fff', borderRadius: 32, width: '100%', maxWidth: 500, overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }} className="modal-content">
        <div id="printable-invoice" style={{ padding: 32, background: '#fff', color: TOKENS.dark }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, borderBottom: `2px solid ${TOKENS.border}`, paddingBottom: 24 }}>
            <div style={{ flex: 1 }}>
              {profile?.business_logo && <img src={profile.business_logo} style={{ height: 40, marginBottom: 12, borderRadius: 8 }} />}
              <div style={{ fontSize: 18, fontWeight: 950, color: TOKENS.dark, letterSpacing: -0.5 }}>{profile?.business_name || 'PropManager'}</div>
              <div style={{ fontSize: 12, color: TOKENS.slate, marginTop: 4, lineHeight: 1.4, fontWeight: 700 }}>{profile?.business_address}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 20, fontWeight: 950, color: TOKENS.primary, letterSpacing: 1 }}>INVOICE</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: TOKENS.dark, marginTop: 4 }}>{displayMonth}</div>
            </div>
          </div>

          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 10, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6, letterSpacing: 1 }}>BILLED TO</div>
            <div style={{ fontSize: 16, fontWeight: 950, color: TOKENS.dark }}>{data.tenantName}</div>
            <div style={{ fontSize: 13, color: TOKENS.slate, fontWeight: 700, marginTop: 2 }}>{data.unitDetails}</div>
          </div>

          <div style={{ borderTop: `1px solid ${TOKENS.border}`, paddingTop: 24, marginBottom: 28 }}>
            {[
              ['Fixed Base Rent', parseFloat(data.fixed_rent)],
              [`Electricity (${energyUnits} units)`, energyBill],
              ['Water Utility', parseFloat(data.water_bill || 0)],
              ['Other Charges', parseFloat(data.other_utilities || 0)]
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 14 }}>
                <div style={{ fontWeight: 700, color: TOKENS.slate }}>{label}</div>
                <div style={{ fontWeight: 900, color: TOKENS.dark }}>₹{val.toLocaleString()}</div>
              </div>
            ))}
          </div>

          <div style={{ background: TOKENS.dark, borderRadius: 20, padding: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#fff', boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.2)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#94a3b8' }}>TOTAL PAYABLE</div>
            <div style={{ fontSize: 24, fontWeight: 950, color: TOKENS.primary }}>₹{parseFloat(data.total_amount || data.total).toLocaleString()}</div>
          </div>
        </div>

        <div style={{ padding: '24px 32px', background: '#f8fafc', borderTop: `1px solid ${TOKENS.border}`, display: 'flex', flexWrap: 'wrap', gap: 12 }} className="no-print">
          <button onClick={print} style={{ flex: 1, padding: '14px', background: TOKENS.dark, color: '#fff', border: 'none', borderRadius: 14, fontWeight: 900, cursor: 'pointer', fontSize: 13 }} className="interactive-btn">Print PDF</button>
          <button onClick={() => window.open(`https://wa.me/${data.tenantPhone?.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank')} style={{ flex: 1, padding: '14px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 14, fontWeight: 900, cursor: 'pointer', fontSize: 13 }} className="interactive-btn">WhatsApp</button>
          <button onClick={onClose} style={{ width: '100%', padding: '14px', background: '#fff', color: TOKENS.dark, border: `2px solid ${TOKENS.border}`, borderRadius: 14, fontWeight: 900, cursor: 'pointer', fontSize: 13 }} className="interactive-btn">Close Preview</button>
        </div>
      </div>
    </div>
  )
}

function HistoryAccordion({ month, items, onEdit, onInvoice, onDelete, onPay }) {
  const [open, setOpen] = useState(true)
  const displayMonth = new Date(month + '-02').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const totalMonth = items.reduce((sum, item) => sum + Number(item.total_amount), 0)

  return (
    <div style={{ background: '#fff', borderRadius: TOKENS.radiusCard, border: `1px solid ${TOKENS.border}`, overflow: 'hidden', marginBottom: 16, boxShadow: TOKENS.shadow }}>
      <div 
        onClick={() => setOpen(!open)}
        style={{ padding: '20px 24px', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', borderBottom: open ? `1px solid ${TOKENS.border}` : 'none' }}>
        <div>
          <span style={{ fontWeight: 950, color: TOKENS.dark, fontSize: 15, letterSpacing: -0.5 }}>{displayMonth}</span>
          <span style={{ marginLeft: 16, fontSize: 12, color: TOKENS.primary, fontWeight: 900, background: `${TOKENS.primary}10`, padding: '4px 12px', borderRadius: 10 }}>₹{totalMonth.toLocaleString()}</span>
        </div>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', transform: open ? 'rotate(180deg)' : 'none', transition: '0.3s' }}>
          <svg style={{width:16,height:16, color: TOKENS.dark}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7"></path></svg>
        </div>
      </div>
      {open && (
        <div style={{ padding: '8px 0' }}>
          {items.map(h => (
            <div key={h.id} style={{ padding: '16px 24px', borderBottom: `1px solid ${TOKENS.bg}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="hover-row-indigo">
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 900, fontSize: 15, color: TOKENS.dark }}>{h.tenant?.name}</div>
                <div style={{ fontSize: 12, color: TOKENS.slate, marginTop: 4, fontWeight: 700, display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{color: TOKENS.dark, fontWeight: 900}}>₹{h.total_amount.toLocaleString()}</span>
                  <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 9, fontWeight: 950, background: h.payment_status === 'Paid' ? '#ecfdf5' : '#fffbeb', color: h.payment_status === 'Paid' ? '#059669' : '#d97706', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h.payment_status}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {h.payment_status !== 'Paid' && (
                  <button onClick={() => onPay(h)} style={{ background: '#ecfdf5', color: '#059669', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 11, fontWeight: 900, cursor: 'pointer' }} className="interactive-btn">Mark Paid</button>
                )}
                <button onClick={() => onInvoice(h)} style={{ background: '#f8fafc', color: TOKENS.dark, border: `1px solid ${TOKENS.border}`, borderRadius: 10, padding: '10px 16px', fontSize: 11, fontWeight: 900, cursor: 'pointer' }} className="interactive-btn">Invoice</button>
                <button onClick={() => onEdit(h)} style={{ background: '#fff', color: TOKENS.primary, border: `1px solid ${TOKENS.primary}20`, borderRadius: 10, padding: '10px', fontSize: 11, fontWeight: 900, cursor: 'pointer' }} className="interactive-btn">✎</button>
                <button onClick={() => onDelete(h.id)} style={{ background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 10, padding: '10px', fontSize: 11, fontWeight: 900, cursor: 'pointer' }} className="interactive-btn">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Billing() {
  const { user } = useAuth()
  const [tenants, setTenants] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showInvoice, setShowInvoice] = useState(null)
  const [view, setView] = useState('individual')
  const [editingId, setEditingId] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  
  const lastMonthDate = new Date(); lastMonthDate.setMonth(lastMonthDate.getMonth() - 1)
  const defaultMonth = lastMonthDate.toISOString().slice(0, 7)

  const [form, setForm] = useState({
    tenant_id: '', prev_reading: '', curr_reading: '', rate_per_unit: '10',
    water_bill: '0', fixed_rent: 0, other_utilities: '0',
    due_date: new Date().toISOString().split('T')[0],
    billing_month: defaultMonth, mark_paid: false
  })

  const [bulkInputs, setBulkInputs] = useState({})

  useEffect(() => { if (user?.id) { fetchTenants(); fetchHistory() } }, [user])

  const fetchTenants = async () => {
    const { data } = await supabase.from('tenants').select('id, name, email, phone, rent, unit:units(unit_number, property:properties(name))').eq('user_id', user.id).eq('status', 'Active')
    setTenants(data || [])
  }

  const fetchHistory = async () => {
    setLoading(true)
    const { data: bills } = await supabase.from('utility_bills').select('*, tenant:tenants(name, email, phone, unit:units(unit_number, property:properties(name)))').eq('user_id', user.id).order('created_at', { ascending: false })
    const { data: payments } = await supabase.from('payments').select('*').eq('method', 'Utility Bill')
    
    const enrichedHistory = (bills || []).map(bill => {
      const match = payments?.find(p => p.bill_id === bill.id)
      return { ...bill, payment_status: match?.status || (bill.balance_due === 0 ? 'Paid' : 'Pending'), payment_id: match?.id }
    })
    setHistory(enrichedHistory)
    setLoading(false)
  }

  const groupedHistory = useMemo(() => {
    const groups = {}
    history.forEach(h => {
      const month = h.billing_month || 'N/A'
      if (!groups[month]) groups[month] = []
      groups[month].push(h)
    })
    return Object.keys(groups).sort((a, b) => b.localeCompare(a)).map(month => ({ month, items: groups[month] }))
  }, [history])

  const bulkData = useMemo(() => {
    return tenants
      .filter(t => !history.some(h => h.tenant_id === t.id && h.billing_month === form.billing_month))
      .map(t => {
        const lastBill = history.find(h => h.tenant_id === t.id)
        const inputs = bulkInputs[t.id] || {}
        return {
          tenant_id: t.id, name: t.name, email: t.email, phone: t.phone, unit: t.unit, fixed_rent: t.rent || 0,
          prev_reading: lastBill ? lastBill.curr_reading : 0,
          curr_reading: inputs.curr || '', water_bill: inputs.water || '0', other_utilities: inputs.other || '0',
          mark_paid: inputs.mark_paid || false
        }
      })
  }, [tenants, history, form.billing_month, bulkInputs])

  const handleBulkChange = (tid, field, val) => {
    setBulkInputs(prev => ({ ...prev, [tid]: { ...prev[tid], [field]: val } }))
  }

  const handleTenantChange = (tid) => {
    const tenant = tenants.find(t => t.id === tid)
    const lastBill = history.find(h => h.tenant_id === tid)
    setForm({ ...form, tenant_id: tid, fixed_rent: tenant?.rent || 0, prev_reading: lastBill ? lastBill.curr_reading : '', water_bill: lastBill ? lastBill.water_bill : '0' })
  }

  const calculateRowTotal = (row) => {
    const energyUnits = Math.max(0, (parseFloat(row.curr_reading) || 0) - (parseFloat(row.prev_reading) || 0))
    const rate = parseFloat(form.rate_per_unit) || 10
    
    // Logic: If there is a reading, the minimum charge is ₹150
    let energyBill = energyUnits * rate
    if (energyBill < 150) energyBill = 150
    
    return (parseFloat(row.fixed_rent) || 0) + energyBill + (parseFloat(row.water_bill) || 0) + (parseFloat(row.other_utilities) || 0)
  }

  const generateSingleBill = async (row) => {
    if (!row.curr_reading) return alert('Enter current reading')
    setSaving(true)
    const total = calculateRowTotal(row)
    try {
      const billData = {
        user_id: user.id, tenant_id: row.tenant_id, prev_reading: parseFloat(row.prev_reading || 0),
        curr_reading: parseFloat(row.curr_reading), rate_per_unit: parseFloat(form.rate_per_unit),
        water_bill: parseFloat(row.water_bill || 0), fixed_rent: parseFloat(row.fixed_rent),
        other_utilities: parseFloat(row.other_utilities), total_amount: total, due_date: form.due_date,
        billing_month: form.billing_month
      }

      if (editingId) {
        await supabase.from('utility_bills').update(billData).eq('id', editingId)
        const oldBill = history.find(h => h.id === editingId)
        if (oldBill?.payment_id) {
          await supabase.from('payments').update({ amount: total, due_date: form.due_date }).eq('id', oldBill.payment_id)
        }
      } else {
        await supabase.from('utility_bills').insert([billData])
        const status = row.mark_paid ? 'Paid' : 'Pending'
        const paid_date = row.mark_paid ? new Date().toISOString().split('T')[0] : null
        await supabase.from('payments').insert([{ 
          tenant_id: row.tenant_id, amount: total, due_date: form.due_date, 
          status, method: 'Utility Bill', paid_date 
        }])
      }

      setEditingId(null)
      setDrawerOpen(false)
      setForm({ ...form, tenant_id: '', curr_reading: '', water_bill: '0', other_utilities: '0', mark_paid: false })
      fetchHistory()
    } catch (err) { alert(err.message) }
    setSaving(false)
  }

  const editBill = (h) => {
    setView('individual')
    setEditingId(h.id)
    setForm({
      tenant_id: h.tenant_id, prev_reading: h.prev_reading, curr_reading: h.curr_reading,
      rate_per_unit: h.rate_per_unit, water_bill: h.water_bill, fixed_rent: h.fixed_rent,
      other_utilities: h.other_utilities, due_date: h.due_date, billing_month: h.billing_month,
      mark_paid: h.payment_status === 'Paid'
    })
    setDrawerOpen(true)
  }

  const updatePaymentStatus = async (bill) => {
    let pid = bill.payment_id
    if (!pid) {
      const { data } = await supabase.from('payments').select('id').eq('tenant_id', bill.tenant_id).eq('due_date', bill.due_date).eq('method', 'Utility Bill').single()
      pid = data?.id
    }
    if (!pid) return alert('Associated payment record not found.')
    const { error } = await supabase.from('payments').update({ status: 'Paid', paid_date: new Date().toISOString().split('T')[0] }).eq('id', pid)
    if (error) alert(error.message)
    else fetchHistory()
  }

  const deleteBill = async (id) => {
    if (!confirm('Delete record?')) return
    await supabase.from('utility_bills').delete().eq('id', id)
    fetchHistory()
  }

  const labelS = { fontSize: 11, fontWeight: 900, color: TOKENS.slate, display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }
  const inputS = { width: '100%', padding: '14px 16px', borderRadius: 16, border: `2px solid ${TOKENS.border}`, fontSize: 15, boxSizing: 'border-box', color: TOKENS.dark, fontWeight: 700, outline: 'none', transition: '0.2s' }

  if (!user) return <PageLoader message="Authenticating Invoicing Suite..." />

  return (
    <div className="main-wrapper" style={{ minHeight: '100vh', background: TOKENS.bg, fontFamily: TOKENS.font, display: 'flex' }}>
      <Sidebar active="Billing" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }} className="content-container">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        
        <div style={{ padding: '32px 24px', maxWidth: 1200, width: '100%', boxSizing: 'border-box', margin: '0 auto' }} className="billing-ui-container">
          
          {/* Header Section */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40 }} className="no-print">
            <div className="header-flex">
              <h2 style={{ fontSize: 'clamp(24px, 5vw, 32px)', fontWeight: 950, color: TOKENS.dark, margin: 0, letterSpacing: -1.5 }}>Invoicing</h2>
              <p style={{ color: TOKENS.slate, margin: '4px 0 0', fontSize: 16, fontWeight: 600 }}>Create and manage monthly resident bills.</p>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }} className="mobile-full-btn">
              <div style={{ background: '#f1f5f9', padding: 6, borderRadius: 18, display: 'flex', gap: 4 }}>
                {['individual', 'bulk', 'summary'].map(v => (
                  <button key={v} onClick={() => { setView(v); setEditingId(null); }} 
                    style={{ padding: '10px 24px', border: 'none', borderRadius: 14, cursor: 'pointer', fontSize: 12, fontWeight: 900, background: view === v ? TOKENS.primary : 'transparent', color: view === v ? '#fff' : TOKENS.slate, transition: '0.2s', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {v}
                  </button>
                ))}
              </div>
              {view === 'individual' && (
                <button onClick={() => { setEditingId(null); setForm({...form, tenant_id: ''}); setDrawerOpen(true); }}
                  style={{ background: TOKENS.primary, color: '#fff', border: 'none', borderRadius: TOKENS.radiusBtn, padding: '14px 28px', fontWeight: 900, cursor: 'pointer', fontSize: 14, boxShadow: `0 10px 15px -3px ${TOKENS.primary}30`, transition: '0.2s' }} className="interactive-btn">
                  + Create Bill
                </button>
              )}
            </div>
          </div>

          {/* Config Strip */}
          <div style={{ background: '#fff', borderRadius: 24, padding: '20px 28px', boxShadow: TOKENS.shadow, border: `1px solid ${TOKENS.border}`, marginBottom: 32, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 24 }} className="no-print">
            <div><label style={labelS}>Billing Cycle</label><input type="month" value={form.billing_month} onChange={e => setForm({...form, billing_month: e.target.value})} style={{...inputS, border: 'none', background: TOKENS.bg, padding: '10px 16px'}} className="focus-indigo" /></div>
            <div><label style={labelS}>Rate/Unit</label><input type="number" value={form.rate_per_unit} onChange={e => setForm({...form, rate_per_unit: e.target.value})} style={{...inputS, border: 'none', background: TOKENS.bg, padding: '10px 16px'}} className="focus-indigo" /></div>
            <div><label style={labelS}>Due Date</label><input type="date" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} style={{...inputS, border: 'none', background: TOKENS.bg, padding: '10px 16px'}} className="focus-indigo" /></div>
          </div>

          {/* Main Content Area */}
          <div style={{ position: 'relative' }}>
            {loading ? <PageLoader message="Synchronizing Records..." /> : (
              <>
                {view === 'summary' ? (
                  <div className="summary-report-container" style={{ background: '#fff', borderRadius: 32, border: `1px solid ${TOKENS.border}`, overflow: 'hidden', boxShadow: TOKENS.shadow }}>
                    <div style={{ padding: '24px 32px', borderBottom: `1px solid ${TOKENS.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: TOKENS.bg }}>
                      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 950, color: TOKENS.dark, letterSpacing: -0.5 }}>Summary: {new Date(form.billing_month + '-02').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h3>
                      <button onClick={() => window.print()} className="no-print interactive-btn" style={{ background: TOKENS.dark, color: '#fff', border: 'none', borderRadius: 14, padding: '12px 24px', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>Print Report</button>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                        <thead>
                          <tr style={{ textAlign: 'left', background: TOKENS.bg }}>
                            {['Resident', 'Rent', 'Light', 'Water', 'Other', 'Total'].map(h => (
                              <th key={h} style={{ padding: '18px 24px', fontSize: 11, color: TOKENS.slate, textTransform: 'uppercase', fontWeight: 950, letterSpacing: 1 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {history.filter(h => h.billing_month === form.billing_month).length === 0 ? (
                            <tr><td colSpan="6" style={{ padding: 60, textAlign: 'center', color: TOKENS.slate, fontWeight: 700 }}>No data available for this cycle.</td></tr>
                          ) : history.filter(h => h.billing_month === form.billing_month).map(h => {
                            const energyUnits = h.curr_reading - h.prev_reading
                            let energyBill = energyUnits * h.rate_per_unit
                            if (energyBill > 0 && energyBill < 150) energyBill = 150
                            return (
                              <tr key={h.id} style={{ borderBottom: `1px solid ${TOKENS.border}` }} className="hover-row-indigo">
                                <td style={{ padding: '18px 24px' }}>
                                  <div style={{ fontWeight: 950, fontSize: 15, color: TOKENS.dark }}>{h.tenant?.name}</div>
                                  <div style={{ fontSize: 12, color: TOKENS.primary, fontWeight: 800, marginTop: 4 }}>Unit {h.tenant?.unit?.unit_number}</div>
                                </td>
                                <td style={{ padding: '18px 24px', fontWeight: 800, color: TOKENS.dark }}>₹{parseFloat(h.fixed_rent).toLocaleString()}</td>
                                <td style={{ padding: '18px 24px', fontWeight: 800, color: TOKENS.dark }}>₹{energyBill.toLocaleString()}</td>
                                <td style={{ padding: '18px 24px', fontWeight: 800, color: TOKENS.dark }}>₹{parseFloat(h.water_bill).toLocaleString()}</td>
                                <td style={{ padding: '18px 24px', fontWeight: 800, color: TOKENS.dark }}>₹{parseFloat(h.other_utilities).toLocaleString()}</td>
                                <td style={{ padding: '18px 24px', fontWeight: 950, color: TOKENS.primary, fontSize: 16 }}>₹{h.total_amount.toLocaleString()}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                        {history.filter(h => h.billing_month === form.billing_month).length > 0 && (
                          <tfoot style={{ background: TOKENS.dark }}>
                            <tr>
                              <td style={{ padding: '24px', fontWeight: 950, color: TOKENS.slate, fontSize: 12, textTransform: 'uppercase' }}>TOTALS</td>
                              <td style={{ padding: '24px', fontWeight: 900, color: '#fff' }}>₹{history.filter(h => h.billing_month === form.billing_month).reduce((s, x) => s + Number(x.fixed_rent), 0).toLocaleString()}</td>
                              <td style={{ padding: '24px', fontWeight: 900, color: '#fff' }}>₹{history.filter(h => h.billing_month === form.billing_month).reduce((s, x) => {
                                const u = x.curr_reading - x.prev_reading; 
                                let b = u * x.rate_per_unit; 
                                if (b > 0 && b < 150) b = 150; 
                                return s + b;
                              }, 0).toLocaleString()}</td>
                              <td style={{ padding: '24px', fontWeight: 900, color: '#fff' }}>₹{history.filter(h => h.billing_month === form.billing_month).reduce((s, x) => s + Number(x.water_bill), 0).toLocaleString()}</td>
                              <td style={{ padding: '24px', fontWeight: 900, color: '#fff' }}>₹{history.filter(h => h.billing_month === form.billing_month).reduce((s, x) => s + Number(x.other_utilities), 0).toLocaleString()}</td>
                              <td style={{ padding: '24px', fontWeight: 950, color: TOKENS.primary, fontSize: 20 }}>₹{history.filter(h => h.billing_month === form.billing_month).reduce((s, x) => s + Number(x.total_amount), 0).toLocaleString()}</td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                ) : view === 'bulk' ? (
                  <div style={{ background: '#fff', borderRadius: 32, border: `1px solid ${TOKENS.border}`, overflow: 'hidden', boxShadow: TOKENS.shadow }} className="no-print">
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                        <thead>
                          <tr style={{ textAlign: 'left', background: TOKENS.bg }}>
                            {['Resident', 'Prev', 'Current', 'Water', 'Total', 'Paid', ''].map(h => <th key={h} style={{ padding: '18px 24px', fontSize: 10, color: TOKENS.slate, textTransform: 'uppercase', fontWeight: 950, letterSpacing: 1 }}>{h}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {bulkData.map((row) => (
                            <tr key={row.tenant_id} style={{ borderTop: `1px solid ${TOKENS.border}` }} className="hover-row-indigo">
                              <td style={{ padding: '18px 24px' }}><div style={{ fontWeight: 950, fontSize: 15, color: TOKENS.dark }}>{row.name}</div><div style={{ fontSize: 12, color: TOKENS.primary, fontWeight: 800, marginTop: 2 }}>Unit {row.unit?.unit_number}</div></td>
                              <td style={{ padding: '18px 24px' }}><div style={{ background: TOKENS.bg, padding: '10px', borderRadius: 12, width: 80, textAlign: 'center', fontWeight: 800, color: TOKENS.dark }}>{row.prev_reading}</div></td>
                              <td style={{ padding: '18px 24px' }}><input type="number" value={row.curr_reading} onChange={e => handleBulkChange(row.tenant_id, 'curr', e.target.value)} style={{ ...inputS, width: 100, marginBottom: 0, padding: '10px' }} className="focus-indigo" /></td>
                              <td style={{ padding: '18px 24px' }}><input type="number" value={row.water_bill} onChange={e => handleBulkChange(row.tenant_id, 'water', e.target.value)} style={{...inputS, width: 90, marginBottom: 0, padding: '10px'}} className="focus-indigo" /></td>
                              <td style={{ padding: '18px 24px' }}><div style={{ fontSize: 16, fontWeight: 950, color: TOKENS.dark }}>₹{calculateRowTotal(row).toLocaleString()}</div></td>
                              <td style={{ padding: '18px 24px', textAlign: 'center' }}><input type="checkbox" checked={row.mark_paid} onChange={e => handleBulkChange(row.tenant_id, 'mark_paid', e.target.checked)} style={{ width: 20, height: 20, cursor: 'pointer', accentColor: TOKENS.primary }} /></td>
                              <td style={{ padding: '18px 24px' }}><button onClick={() => generateSingleBill(row)} disabled={saving} style={{ padding: '12px 20px', background: TOKENS.dark, color: '#fff', border: 'none', borderRadius: 12, fontSize: 11, fontWeight: 900, cursor: 'pointer' }} className="interactive-btn">GENERATE</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {groupedHistory.map(group => (
                      <HistoryAccordion key={group.month} month={group.month} items={group.items} onPay={updatePaymentStatus} onEdit={editBill}
                        onInvoice={(h) => setShowInvoice({...h, tenantName: h.tenant.name, tenantEmail: h.tenant.email, tenantPhone: h.tenant.phone, unitDetails: `${h.tenant.unit?.property?.name} - Unit ${h.tenant.unit?.unit_number}`})}
                        onDelete={deleteBill} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Slide-out Drawer */}
      {drawerOpen && (
        <>
          <div onClick={() => setDrawerOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', zIndex: 1001 }} />
          <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: '100%', maxWidth: 420, background: '#fff', zIndex: 1002, boxShadow: '-20px 0 50px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', animation: 'slideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1)', fontFamily: TOKENS.font }}>
            <div style={{ padding: '32px', borderBottom: `1px solid ${TOKENS.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 950, color: TOKENS.dark, letterSpacing: -0.5 }}>{editingId ? 'Modify Invoice' : 'New Invoice'}</h3>
                <p style={{ color: TOKENS.slate, fontSize: 13, fontWeight: 600, marginTop: 4 }}>Cycle: {form.billing_month}</p>
              </div>
              <button onClick={() => setDrawerOpen(false)} style={{ background: TOKENS.bg, border: 'none', borderRadius: 12, width: 36, height: 32, cursor: 'pointer', color: TOKENS.dark, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="interactive-btn">✕</button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
              <div style={{ marginBottom: 28 }}>
                <label style={labelS}>SELECT RESIDENT</label>
                <select value={form.tenant_id} onChange={e => handleTenantChange(e.target.value)} disabled={!!editingId} style={{...inputS, background: editingId ? TOKENS.bg : '#fff'}} className="focus-indigo">
                  <option value="">— Choose Household —</option>
                  {tenants.map(t => <option key={t.id} value={t.id}>{t.name} (Unit {t.unit?.unit_number})</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
                <div><label style={labelS}>Previous Units</label><input type="number" value={form.prev_reading} onChange={e => setForm({...form, prev_reading: e.target.value})} style={inputS} className="focus-indigo" /></div>
                <div><label style={labelS}>Current Units</label><input type="number" value={form.curr_reading} onChange={e => setForm({...form, curr_reading: e.target.value})} style={inputS} className="focus-indigo" /></div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
                <div><label style={labelS}>Water (₹)</label><input type="number" value={form.water_bill} onChange={e => setForm({...form, water_bill: e.target.value})} style={inputS} className="focus-indigo" /></div>
                <div><label style={labelS}>Other (₹)</label><input type="number" value={form.other_utilities} onChange={e => setForm({...form, other_utilities: e.target.value})} style={inputS} className="focus-indigo" /></div>
              </div>

              {!editingId && (
                <div style={{ marginBottom: 32, display: 'flex', alignItems: 'center', gap: 12, background: TOKENS.bg, padding: '16px', borderRadius: 16 }}>
                  <input type="checkbox" id="mark_paid" checked={form.mark_paid} onChange={e => setForm({...form, mark_paid: e.target.checked})} style={{ width: 20, height: 20, cursor: 'pointer', accentColor: TOKENS.primary }} />
                  <label htmlFor="mark_paid" style={{ fontSize: 14, fontWeight: 800, color: TOKENS.dark, cursor: 'pointer' }}>Mark as Paid immediately</label>
                </div>
              )}

              <div style={{ background: TOKENS.dark, borderRadius: 24, padding: 28, marginBottom: 32, color: '#fff', boxShadow: '0 15px 30px -10px rgba(15, 23, 42, 0.3)' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: TOKENS.slate, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Total Payable Amount</div>
                <div style={{ fontSize: 36, fontWeight: 950, color: TOKENS.primary, letterSpacing: -1.5 }}>₹{calculateRowTotal(form).toLocaleString()}</div>
              </div>
            </div>

            <div style={{ padding: '32px', borderTop: `1px solid ${TOKENS.border}`, background: TOKENS.bg }}>
              <button onClick={() => generateSingleBill(form)} disabled={saving || !form.tenant_id} style={{ width: '100%', padding: '18px', background: TOKENS.primary, color: '#fff', border: 'none', borderRadius: 18, fontSize: 16, fontWeight: 950, cursor: 'pointer', boxShadow: `0 10px 15px -3px ${TOKENS.primary}30`, transition: '0.2s' }} className="interactive-btn">
                {saving ? 'Processing...' : editingId ? 'Update Invoice' : 'Confirm & Generate Invoice'}
              </button>
            </div>
          </div>
        </>
      )}

      {showInvoice && <InvoiceModal data={showInvoice} onClose={() => setShowInvoice(null)} />}
      
      <style>{`
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .hover-row-indigo:hover { background: rgba(99, 102, 241, 0.03) !important; }
        .focus-indigo:focus {
          border-color: ${TOKENS.primary} !important;
          box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1) !important;
        }
        .interactive-btn:active { transform: scale(0.96); }
        @media (max-width: 768px) {
          .main-wrapper { flex-direction: column !important; }
          .header-flex { flex-direction: column !important; align-items: flex-start !important; }
          .mobile-full-btn { max-width: none !important; width: 100% !important; margin-top: 12px; }
        }
        @media print {
          @page { size: A4 portrait; margin: 15mm; }
          *, *:before, *:after { box-sizing: border-box !important; }
          html, body { background: #fff !important; width: 100% !important; height: auto !important; margin: 0 !important; padding: 0 !important; }
          .main-wrapper { min-height: 0 !important; height: auto !important; display: block !important; }
          .sidebar-container, .TopBar, .topbar-mobile, .no-print, .modal-wrapper button { display: none !important; }
          body:has(.modal-wrapper) .content-container { display: none !important; }
          .modal-wrapper { position: static !important; display: block !important; background: none !important; padding: 0 !important; width: 100% !important; }
          .modal-content { width: 100% !important; max-width: 100% !important; box-shadow: none !important; border: 1px solid #eee !important; position: static !important; margin: 0 !important; }
          .summary-report-container { padding: 0 !important; border: none !important; width: 100% !important; margin: 0 !important; }
          .summary-report-container table { width: 100% !important; max-width: 100% !important; min-width: 0 !important; font-size: 10pt !important; table-layout: fixed !important; word-wrap: break-word !important; }
          .summary-report-container th, .summary-report-container td { padding: 6px 4px !important; overflow: hidden !important; }
        }
      `}</style>
    </div>
  )
}
