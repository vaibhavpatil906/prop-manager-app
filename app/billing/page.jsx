'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import Sidebar, { TopBar } from '@/app/components/Sidebar'

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

  const sendWhatsApp = () => {
    const phone = data.tenantPhone?.replace(/\D/g, '')
    if (!phone) return alert('No phone number found for this tenant.')
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const sendEmail = () => {
    if (!data.tenantEmail) return alert('No email found for this tenant.')
    window.open(`mailto:${data.tenantEmail}?subject=Invoice for ${displayMonth}&body=${encodeURIComponent(msg)}`, '_blank')
  }

  return (
    <div className="no-print" style={{ position: 'fixed', inset: 0, background: '#0007', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 24, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
        <div id="printable-invoice" style={{ padding: 24, background: '#fff', color: '#000' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, borderBottom: '1px solid #f1f5f9', paddingBottom: 16 }}>
            <div style={{ flex: 1 }}>
              {profile?.business_logo && <img src={profile.business_logo} style={{ height: 32, marginBottom: 8, borderRadius: 6 }} />}
              <div style={{ fontSize: 16, fontWeight: 950, color: '#000' }}>{profile?.business_name || 'PropManager'}</div>
              <div style={{ fontSize: 11, color: '#000', marginTop: 2, lineHeight: 1.3, fontWeight: 700 }}>{profile?.business_address}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 18, fontWeight: 950, color: '#6366f1' }}>INVOICE</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#000' }}>{displayMonth}</div>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 900, color: '#000', textTransform: 'uppercase', marginBottom: 4 }}>Billed To:</div>
            <div style={{ fontSize: 14, fontWeight: 950, color: '#000' }}>{data.tenantName}</div>
            <div style={{ fontSize: 12, color: '#000', fontWeight: 700 }}>{data.unitDetails}</div>
          </div>

          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16, marginBottom: 20 }}>
            {[
              ['Fixed Rent', parseFloat(data.fixed_rent)],
              [`Light (${energyUnits} units)`, energyUnits * data.rate_per_unit],
              ['Water Bill', parseFloat(data.water_bill || 0)],
              ['Other Utilities', parseFloat(data.other_utilities || 0)]
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                <div style={{ fontWeight: 800, color: '#000' }}>{label}</div>
                <div style={{ fontWeight: 950, color: '#000' }}>₹{val.toLocaleString()}</div>
              </div>
            ))}
          </div>

          <div style={{ background: '#000', borderRadius: 12, padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#fff' }}>
            <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.9 }}>Total Due</div>
            <div style={{ fontSize: 20, fontWeight: 950 }}>₹{parseFloat(data.total_amount || data.total).toLocaleString()}</div>
          </div>
        </div>

        <div style={{ padding: '16px 24px', background: '#f8fafc', borderTop: '1px solid #e5e7eb', display: 'flex', flexWrap: 'wrap', gap: 8 }} className="no-print">
          <button onClick={print} style={{ flex: 1, padding: '10px', background: '#000', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer', fontSize: 12 }}>Print</button>
          <button onClick={sendWhatsApp} style={{ flex: 1, padding: '10px', background: '#25D366', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer', fontSize: 12 }}>WhatsApp</button>
          <button onClick={sendEmail} style={{ flex: 1, padding: '10px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer', fontSize: 12 }}>Email</button>
          <button onClick={onClose} style={{ width: '100%', padding: '10px', background: '#fff', color: '#000', border: '1px solid #e2e8f0', borderRadius: 10, fontWeight: 800, cursor: 'pointer', fontSize: 12 }}>Close</button>
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
    <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9', overflow: 'hidden', marginBottom: 12 }}>
      <div 
        onClick={() => setOpen(!open)}
        style={{ padding: '16px 20px', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
        <div>
          <span style={{ fontWeight: 950, color: '#000', fontSize: 14 }}>{displayMonth}</span>
          <span style={{ marginLeft: 12, fontSize: 12, color: '#6366f1', fontWeight: 900 }}>₹{totalMonth.toLocaleString()}</span>
        </div>
        <span style={{ fontSize: 12, color: '#000', transform: open ? 'rotate(180deg)' : 'none', transition: '0.2s' }}>▼</span>
      </div>
      {open && (
        <div style={{ padding: '8px 0' }}>
          {items.map(h => (
            <div key={h.id} style={{ padding: '12px 20px', borderBottom: '1px solid #f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 900, fontSize: 14, color: '#000' }}>{h.tenant?.name}</div>
                <div style={{ fontSize: 11, color: '#000', marginTop: 4, fontWeight: 700, display: 'flex', gap: 8, alignItems: 'center' }}>
                  ₹{h.total_amount.toLocaleString()}
                  <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 950, background: h.payment_status === 'Paid' ? '#ecfdf5' : '#fff7ed', color: h.payment_status === 'Paid' ? '#059669' : '#d97706' }}>{h.payment_status.toUpperCase()}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {h.payment_status !== 'Paid' && (
                  <button onClick={() => onPay(h)} style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Pay</button>
                )}
                <button onClick={() => onEdit(h)} style={{ background: '#f8fafc', color: '#000', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>Edit</button>
                <button onClick={() => onInvoice(h)} style={{ background: '#f0f9ff', color: '#075985', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>Invoice</button>
                <button onClick={() => onDelete(h.id)} style={{ background: '#fff1f2', color: '#be123c', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>✕</button>
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
      const match = payments?.find(p => p.tenant_id === bill.tenant_id && p.due_date === bill.due_date && Math.abs(Number(p.amount) - Number(bill.total_amount)) < 1)
      return { ...bill, payment_status: match?.status || 'Pending', payment_id: match?.id }
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
    let energyBill = energyUnits * (parseFloat(form.rate_per_unit) || 10)
    if (energyBill > 0 && energyBill < 150) energyBill = 150
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

  const labelS = { fontSize: 11, fontWeight: 900, color: '#000', display: 'block', marginBottom: 6, textTransform: 'uppercase' }
  const inputS = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', color: '#000', fontWeight: 700 }

  if (!user) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontWeight: 800 }}>Loading...</div>

  return (
    <div className="main-wrapper" style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, sans-serif', display: 'flex' }}>
      <Sidebar active="Billing" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        
        <div style={{ padding: '20px 16px', maxWidth: 1200, width: '100%', boxSizing: 'border-box', margin: '0 auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
            <h2 style={{ fontSize: 24, fontWeight: 950, color: '#000', margin: 0 }}>{editingId ? 'Edit Bill' : 'Billing'}</h2>
            <div style={{ background: '#eee', padding: 4, borderRadius: 12, display: 'flex', width: 'fit-content', border: '1px solid #e2e8f0' }}>
              {['individual', 'bulk', 'summary'].map(v => (
                <button key={v} onClick={() => { setView(v); setEditingId(null); }} style={{ padding: '8px 16px', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 900, background: view === v ? '#000' : 'transparent', color: view === v ? '#fff' : '#000' }}>
                  {v.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div style={{ background: '#fff', borderRadius: 20, padding: 20, border: '1px solid #f1f5f9', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
              <div><label style={labelS}>Month</label><input type="month" value={form.billing_month} onChange={e => setForm({...form, billing_month: e.target.value})} style={{...inputS, border: '2px solid #6366f1'}} /></div>
              <div><label style={labelS}>Rate/Unit</label><input type="number" value={form.rate_per_unit} onChange={e => setForm({...form, rate_per_unit: e.target.value})} style={inputS} /></div>
              <div><label style={labelS}>Due Date</label><input type="date" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} style={inputS} /></div>
            </div>
          </div>

          {view === 'summary' ? (
            <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 950, color: '#000' }}>Summary Report: {new Date(form.billing_month + '-02').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h3>
                <button onClick={() => window.print()} className="no-print" style={{ background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Print Report</button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', background: '#f9fafb' }}>
                      {['Resident', 'Base Rent', 'Light Bill', 'Water Bill', 'Other', 'Total'].map(h => (
                        <th key={h} style={{ padding: '14px 20px', fontSize: 11, color: '#000', textTransform: 'uppercase', fontWeight: 950, borderBottom: '2px solid #f1f5f9' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.filter(h => h.billing_month === form.billing_month).length === 0 ? (
                      <tr><td colSpan="6" style={{ padding: 40, textAlign: 'center', color: '#000', fontWeight: 700 }}>No bills generated for this month yet.</td></tr>
                    ) : history.filter(h => h.billing_month === form.billing_month).map(h => {
                      const energyUnits = h.curr_reading - h.prev_reading
                      let energyBill = energyUnits * h.rate_per_unit
                      if (energyBill > 0 && energyBill < 150) energyBill = 150
                      return (
                        <tr key={h.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '14px 20px' }}>
                            <div style={{ fontWeight: 900, fontSize: 14, color: '#000' }}>{h.tenant?.name}</div>
                            <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 700 }}>Unit {h.tenant?.unit?.unit_number}</div>
                          </td>
                          <td style={{ padding: '14px 20px', fontWeight: 700, color: '#000' }}>₹{parseFloat(h.fixed_rent).toLocaleString()}</td>
                          <td style={{ padding: '14px 20px', fontWeight: 700, color: '#000' }}>₹{energyBill.toLocaleString()} <span style={{ fontSize: 10, color: '#94a3b8' }}>({energyUnits}u)</span></td>
                          <td style={{ padding: '14px 20px', fontWeight: 700, color: '#000' }}>₹{parseFloat(h.water_bill).toLocaleString()}</td>
                          <td style={{ padding: '14px 20px', fontWeight: 700, color: '#000' }}>₹{parseFloat(h.other_utilities).toLocaleString()}</td>
                          <td style={{ padding: '14px 20px', fontWeight: 950, color: '#6366f1', fontSize: 15 }}>₹{h.total_amount.toLocaleString()}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {history.filter(h => h.billing_month === form.billing_month).length > 0 && (
                    <tfoot style={{ background: '#f8fafc' }}>
                      <tr>
                        <td style={{ padding: '16px 20px', fontWeight: 950, color: '#000' }}>TOTALS</td>
                        <td style={{ padding: '16px 20px', fontWeight: 950, color: '#000' }}>₹{history.filter(h => h.billing_month === form.billing_month).reduce((s, x) => s + Number(x.fixed_rent), 0).toLocaleString()}</td>
                        <td style={{ padding: '16px 20px', fontWeight: 950, color: '#000' }}>₹{history.filter(h => h.billing_month === form.billing_month).reduce((s, x) => {
                          const u = x.curr_reading - x.prev_reading; 
                          let b = u * x.rate_per_unit; 
                          if (b > 0 && b < 150) b = 150; 
                          return s + b;
                        }, 0).toLocaleString()}</td>
                        <td style={{ padding: '16px 20px', fontWeight: 950, color: '#000' }}>₹{history.filter(h => h.billing_month === form.billing_month).reduce((s, x) => s + Number(x.water_bill), 0).toLocaleString()}</td>
                        <td style={{ padding: '16px 20px', fontWeight: 950, color: '#000' }}>₹{history.filter(h => h.billing_month === form.billing_month).reduce((s, x) => s + Number(x.other_utilities), 0).toLocaleString()}</td>
                        <td style={{ padding: '16px 20px', fontWeight: 950, color: '#6366f1', fontSize: 16 }}>₹{history.filter(h => h.billing_month === form.billing_month).reduce((s, x) => s + Number(x.total_amount), 0).toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          ) : view === 'bulk' ? (
            <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', background: '#f9fafb' }}>
                      {['Tenant', 'Prev', 'Curr', 'Water', 'Total', 'Paid?', ''].map(h => <th key={h} style={{ padding: '12px 16px', fontSize: 10, color: '#000', textTransform: 'uppercase', fontWeight: 900 }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {bulkData.map((row) => (
                      <tr key={row.tenant_id} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 16px' }}><div style={{ fontWeight: 950, fontSize: 14, color: '#000' }}>{row.name}</div><div style={{ fontSize: 11, color: '#6366f1', fontWeight: 800 }}>Unit {row.unit?.unit_number}</div></td>
                        <td style={{ padding: '12px 16px' }}><div style={{...inputS, background: '#f8fafc', width: 70, border: '1px solid #f1f5f9'}}>{row.prev_reading}</div></td>
                        <td style={{ padding: '12px 16px' }}><input type="number" value={row.curr_reading} onChange={e => handleBulkChange(row.tenant_id, 'curr', e.target.value)} style={{ ...inputS, width: 70, border: !row.curr_reading ? '2px solid #fbbf24' : '1px solid #e2e8f0' }} /></td>
                        <td style={{ padding: '12px 16px' }}><input type="number" value={row.water_bill} onChange={e => handleBulkChange(row.tenant_id, 'water', e.target.value)} style={{...inputS, width: 70}} /></td>
                        <td style={{ padding: '12px 16px' }}><div style={{ fontSize: 14, fontWeight: 950, color: '#000' }}>₹{calculateRowTotal(row).toLocaleString()}</div></td>
                        <td style={{ padding: '12px 16px' }}><input type="checkbox" checked={row.mark_paid} onChange={e => handleBulkChange(row.tenant_id, 'mark_paid', e.target.checked)} style={{ width: 18, height: 18, cursor: 'pointer' }} /></td>
                        <td style={{ padding: '12px 16px' }}><button onClick={() => generateSingleBill(row)} disabled={saving} style={{ padding: '8px 12px', background: '#000', color: '#fff', border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 900, cursor: 'pointer' }}>Generate</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="billing-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
              <div style={{ background: '#fff', borderRadius: 20, padding: 24, border: '1px solid #f1f5f9' }}>
                <label style={labelS}>Resident</label>
                <select value={form.tenant_id} onChange={e => handleTenantChange(e.target.value)} disabled={!!editingId} style={{...inputS, marginBottom: 16, background: editingId ? '#f8fafc' : '#fff'}}>
                  <option value="">— Select —</option>
                  {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div><label style={labelS}>Prev Light</label><input type="number" value={form.prev_reading} onChange={e => setForm({...form, prev_reading: e.target.value})} style={inputS} /></div>
                  <div><label style={labelS}>Curr Light</label><input type="number" value={form.curr_reading} onChange={e => setForm({...form, curr_reading: e.target.value})} style={inputS} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div><label style={labelS}>Water (₹)</label><input type="number" value={form.water_bill} onChange={e => setForm({...form, water_bill: e.target.value})} style={inputS} /></div>
                  <div><label style={labelS}>Other (₹)</label><input type="number" value={form.other_utilities} onChange={e => setForm({...form, other_utilities: e.target.value})} style={inputS} /></div>
                </div>
                {!editingId && (
                  <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" id="mark_paid" checked={form.mark_paid} onChange={e => setForm({...form, mark_paid: e.target.checked})} style={{ width: 16, height: 16 }} />
                    <label htmlFor="mark_paid" style={{ fontSize: 13, fontWeight: 800, color: '#000', cursor: 'pointer' }}>Mark as Paid immediately</label>
                  </div>
                )}
                <div style={{ background: '#000', borderRadius: 14, padding: 16, marginBottom: 16, color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 800 }}>Total Due</span>
                  <span style={{ fontSize: 18, fontWeight: 950, color: '#818cf8' }}>₹{calculateRowTotal(form).toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => generateSingleBill(form)} disabled={saving || !form.tenant_id} style={{ flex: 2, padding: '14px', background: '#000', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 950, cursor: 'pointer' }}>{editingId ? 'Update Bill' : 'Generate Bill'}</button>
                  {editingId && <button onClick={() => { setEditingId(null); setForm({...form, tenant_id: ''}); }} style={{ flex: 1, padding: '14px', background: '#f8fafc', color: '#000', border: '1px solid #e2e8f0', borderRadius: 12, fontWeight: 800, cursor: 'pointer' }}>Cancel</button>}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {groupedHistory.map(group => (
                  <HistoryAccordion key={group.month} month={group.month} items={group.items} onPay={updatePaymentStatus} onEdit={editBill}
                    onInvoice={(h) => setShowInvoice({...h, tenantName: h.tenant.name, tenantEmail: h.tenant.email, tenantPhone: h.tenant.phone, unitDetails: `${h.tenant.unit?.property?.name} - Unit ${h.tenant.unit?.unit_number}`})}
                    onDelete={deleteBill} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {showInvoice && <InvoiceModal data={showInvoice} onClose={() => setShowInvoice(null)} />}
      <style>{`
        @media (max-width: 768px) {
          .main-wrapper { flex-direction: column !important; }
          .billing-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
