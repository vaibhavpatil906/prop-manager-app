'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import Sidebar, { TopBar } from '@/app/components/Sidebar'

function Modal({ title, onClose, children, width = 460 }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0007', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 24, padding: 32, width: '100%', maxWidth: width, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px #0003' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#1a1a2e' }}>{title}</h3>
          <button onClick={onClose} style={{ background: '#f5f5f5', border: 'none', borderRadius: 12, width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>✕</button>
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
  const s = colors[label] || { bg: '#f8fafc', color: '#64748b', dot: '#94a3b8' }
  return (
    <span style={{ background: s.bg, color: s.color, padding: '4px 12px', borderRadius: 20, fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 5, textTransform: 'uppercase' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot }} />
      {label}
    </span>
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
      supabase.from('payments').select('*, tenant:tenants(name)').order('created_at', { ascending: false }),
      supabase.from('tenants').select('id, name').eq('user_id', user.id),
    ])
    setPayments(p || [])
    setTenants(t || [])
    setLoading(false)
  }

  useEffect(() => { if (user?.id) fetchAll() }, [user])

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

  const filtered = filter === 'All' ? payments : payments.filter(p => p.status === filter)
  const totalCollected = payments.filter(p => p.status === 'Paid').reduce((a, b) => a + Number(b.amount), 0)
  const totalOutstanding = payments.filter(p => p.status !== 'Paid').reduce((a, b) => a + Number(b.amount), 0)

  const inp = (label, key, type = 'text') => (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: '#888', display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>{label}</label>
      <input type={type} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}
        style={{ width: '100%', padding: '12px', border: '1px solid #e5e7eb', borderRadius: 12, fontSize: 14, boxSizing: 'border-box' }} />
    </div>
  )

  if (!user) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1' }}>Loading...</div>

  return (
    <div className="main-wrapper" style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, sans-serif', display: 'flex' }}>
      <Sidebar active="Payments" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        
        <div style={{ padding: '24px 16px', maxWidth: 1100, width: '100%', boxSizing: 'border-box', margin: '0 auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', margin: 0 }}>Payments</h2>
              <button onClick={() => { setForm({ tenant_id: '', amount: '', due_date: '', paid_date: '', status: 'Pending', method: '' }); setModal('new') }} 
                style={{ background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 20px', fontWeight: 800, cursor: 'pointer', fontSize: 13 }}>
                + Add Payment
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ background: '#fff', padding: 16, borderRadius: 16, border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#059669', textTransform: 'uppercase' }}>Collected</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', marginTop: 4 }}>${totalCollected.toLocaleString()}</div>
              </div>
              <div style={{ background: '#fff', padding: 16, borderRadius: 16, border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#dc2626', textTransform: 'uppercase' }}>Outstanding</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', marginTop: 4 }}>${totalOutstanding.toLocaleString()}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
              {['All', 'Paid', 'Pending', 'Overdue'].map(s => (
                <button key={s} onClick={() => setFilter(s)}
                  style={{ whiteSpace: 'nowrap', padding: '8px 16px', borderRadius: 10, border: '1px solid #e2e8f0', background: filter === s ? '#1a1a2e' : '#fff', color: filter === s ? '#fff' : '#64748b', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {loading ? <div style={{textAlign:'center', padding:60, color:'#94a3b8'}}>Loading...</div> : (
            <div className="payments-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {filtered.map(p => (
                <div key={p.id} style={{ background: '#fff', borderRadius: 20, padding: 20, border: '1px solid #f1f5f9', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 15 }}>{p.tenant?.name || '—'}</div>
                    <Badge label={p.status} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '16px 0', borderTop: '1px solid #f8fafc' }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Due Date</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginTop: 2 }}>{p.due_date || '—'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 24, fontWeight: 950, color: '#0f172a' }}>${Number(p.amount).toLocaleString()}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    {p.status !== 'Paid' && <button onClick={() => markPaid(p.id)} style={{ flex: 1, padding: '10px', background: '#ecfdf5', color: '#059669', border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 700 }}>Mark Paid</button>}
                    <button onClick={() => deletePayment(p.id)} style={{ padding: '10px 12px', background: '#fff1f2', color: '#be123c', border: 'none', borderRadius: 10, fontSize: 12 }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <style>{`
        @media (max-width: 768px) {
          .main-wrapper { flex-direction: column !important; }
          .payments-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
