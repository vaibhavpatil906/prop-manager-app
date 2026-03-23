'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import Sidebar, { TopBar } from '@/app/components/Sidebar'

function Modal({ title, onClose, children, width = 460 }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0007', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 24, padding: 32, width: '100%', maxWidth: width, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px #0003' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#000' }}>{title}</h3>
          <button onClick={onClose} style={{ background: '#f5f5f5', border: 'none', borderRadius: 12, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#000' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Badge({ label }) {
  const colors = {
    Paid: { bg: '#ecfdf5', color: '#059669', dot: '#10b981' },
    Pending: { bg: '#fffbeb', color: '#d97706', dot: '#f59e0b' },
    Overdue: { bg: '#fef2f2', color: '#dc2626', dot: '#ef4444' },
  }
  const s = colors[label] || { bg: '#f8fafc', color: '#000', dot: '#000' }
  return (
    <span style={{ background: s.bg, color: s.color, padding: '4px 12px', borderRadius: 20, fontSize: 10, fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: 5, textTransform: 'uppercase' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot }} />
      {label}
    </span>
  )
}

function PaymentAccordion({ month, items, onPay, onDelete }) {
  const [open, setOpen] = useState(true)
  const displayMonth = new Date(month + '-02').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const totalPaid = items.filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.amount), 0)
  const totalPending = items.filter(i => i.status !== 'Paid').reduce((s, i) => s + Number(i.amount), 0)

  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9', overflow: 'hidden', marginBottom: 16 }}>
      <div 
        onClick={() => setOpen(!open)}
        style={{ padding: '16px 20px', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
        <div>
          <span style={{ fontWeight: 950, color: '#000', fontSize: 14 }}>{displayMonth}</span>
          <span style={{ marginLeft: 12, fontSize: 12, color: '#059669', fontWeight: 900 }}>Paid: ${totalPaid.toLocaleString()}</span>
          {totalPending > 0 && <span style={{ marginLeft: 12, fontSize: 12, color: '#dc2626', fontWeight: 900 }}>Pending: ${totalPending.toLocaleString()}</span>}
        </div>
        <span style={{ fontSize: 12, color: '#000', transform: open ? 'rotate(180deg)' : 'none', transition: '0.2s' }}>▼</span>
      </div>
      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, padding: 16 }}>
          {items.map(p => (
            <div key={p.id} style={{ background: '#fff', borderRadius: 20, padding: 20, border: '1px solid #f1f5f9', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontWeight: 950, color: '#000', fontSize: 15 }}>{p.tenant?.name || '—'}</div>
                <Badge label={p.status} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '16px 0', borderTop: '1px solid #f0f0f0' }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 900, color: '#000', textTransform: 'uppercase' }}>Due Date</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#000', marginTop: 2 }}>{p.due_date || '—'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 24, fontWeight: 950, color: '#000' }}>${Number(p.amount).toLocaleString()}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                {p.status !== 'Paid' && <button onClick={() => onPay(p.id)} style={{ flex: 1, padding: '10px', background: '#ecfdf5', color: '#059669', border: '1px solid #ecfdf5', borderRadius: 10, fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>Mark Paid</button>}
                <button onClick={() => onDelete(p.id)} style={{ padding: '10px 12px', background: '#fff1f2', color: '#be123c', border: '1px solid #f1f5f9', borderRadius: 10, fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Payments() {
  const { user } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [payments, setPayments] = useState([])
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('All')
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ tenant_id: '', amount: '', due_date: '', paid_date: '', status: 'Pending', method: '' })

  const fetchAll = async () => {
    setLoading(true)
    const [{ data: p }, { data: t }] = await Promise.all([
      supabase.from('payments').select('*, tenant:tenants(name)').order('due_date', { ascending: false }),
      supabase.from('tenants').select('id, name').eq('user_id', user.id),
    ])
    setPayments(p || [])
    setTenants(t || [])
    setLoading(false)
  }

  useEffect(() => { if (user?.id) fetchAll() }, [user])

  const groupedPayments = useMemo(() => {
    const filtered = filter === 'All' ? payments : payments.filter(p => p.status === filter)
    const groups = {}
    filtered.forEach(p => {
      const month = p.due_date ? p.due_date.slice(0, 7) : 'N/A'
      if (!groups[month]) groups[month] = []
      groups[month].push(p)
    })
    return Object.keys(groups).sort((a, b) => b.localeCompare(a)).map(month => ({ month, items: groups[month] }))
  }, [payments, filter])

  const savePayment = async () => {
    if (!form.tenant_id || !form.amount) return
    setSaving(true)
    try {
      const payload = { ...form, amount: parseFloat(form.amount) }
      if (modal === 'new') await supabase.from('payments').insert([payload])
      else await supabase.from('payments').update(payload).eq('id', modal.id)
      fetchAll(); setModal(null)
    } catch (err) { alert(err.message) }
    setSaving(false)
  }

  const deletePayment = async (id) => {
    if (!confirm('Delete payment record?')) return
    await supabase.from('payments').delete().eq('id', id)
    fetchAll()
  }

  const markPaid = async (id) => {
    await supabase.from('payments').update({ status: 'Paid', paid_date: new Date().toISOString().split('T')[0] }).eq('id', id)
    fetchAll()
  }

  const totalCollected = payments.filter(p => p.status === 'Paid').reduce((a, b) => a + Number(b.amount), 0)
  const totalOutstanding = payments.filter(p => p.status !== 'Paid').reduce((a, b) => a + Number(b.amount), 0)

  const inp = (label, key, type = 'text') => (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 11, fontWeight: 900, color: '#000', display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>{label}</label>
      <input type={type} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}
        style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 14, boxSizing: 'border-box', color: '#000', fontWeight: 700 }} />
    </div>
  )

  if (!user) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontWeight: 800 }}>Loading...</div>

  return (
    <div className="main-wrapper" style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, sans-serif', display: 'flex' }}>
      <Sidebar active="Payments" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        
        <div style={{ padding: '24px 16px', maxWidth: 1100, width: '100%', boxSizing: 'border-box', margin: '0 auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 24, fontWeight: 950, color: '#000', margin: 0 }}>Payments</h2>
              <button onClick={() => { setForm({ tenant_id: '', amount: '', due_date: '', paid_date: '', status: 'Pending', method: '' }); setModal('new') }} 
                style={{ background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 24px', fontWeight: 900, cursor: 'pointer', fontSize: 13 }}>
                + Add Payment
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ background: '#fff', padding: 16, borderRadius: 16, border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 10, fontWeight: 900, color: '#059669', textTransform: 'uppercase' }}>Collected</div>
                <div style={{ fontSize: 20, fontWeight: 950, color: '#000', marginTop: 4 }}>${totalCollected.toLocaleString()}</div>
              </div>
              <div style={{ background: '#fff', padding: 16, borderRadius: 16, border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 10, fontWeight: 900, color: '#dc2626', textTransform: 'uppercase' }}>Outstanding</div>
                <div style={{ fontSize: 20, fontWeight: 950, color: '#000', marginTop: 4 }}>${totalOutstanding.toLocaleString()}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
              {['All', 'Paid', 'Pending', 'Overdue'].map(s => (
                <button key={s} onClick={() => setFilter(s)}
                  style={{ whiteSpace: 'nowrap', padding: '8px 16px', borderRadius: 10, border: '1px solid #000', background: filter === s ? '#000' : '#fff', color: filter === s ? '#fff' : '#000', fontWeight: 900, fontSize: 12, cursor: 'pointer' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {loading ? <div style={{textAlign:'center', padding:60, color:'#000', fontWeight: 800}}>Loading...</div> : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {groupedPayments.length === 0 ? (
                <div style={{textAlign:'center', padding:60, background:'#fff', borderRadius:20, color:'#000', fontWeight:700}}>No payment records found.</div>
              ) : groupedPayments.map(group => (
                <PaymentAccordion key={group.month} month={group.month} items={group.items} onPay={markPaid} onDelete={deletePayment} />
              ))}
            </div>
          )}
        </div>
      </div>

      {modal && (
        <Modal title={modal === 'new' ? 'Add Payment' : 'Edit Payment'} onClose={() => setModal(null)}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 900, color: '#000', display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>Resident</label>
            <select value={form.tenant_id} onChange={e => setForm({...form, tenant_id: e.target.value})} style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 14, color: '#000', fontWeight: 700 }}>
              <option value="">— Select —</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          {inp('Amount ($)', 'amount', 'number')}
          {inp('Due Date', 'due_date', 'date')}
          <button onClick={savePayment} disabled={saving} style={{ width: '100%', padding: '14px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 950, cursor: 'pointer', marginTop: 10 }}>Save Payment</button>
        </Modal>
      )}

      <style>{`
        @media (max-width: 768px) {
          .main-wrapper { flex-direction: column !important; }
        }
      `}</style>
    </div>
  )
}
