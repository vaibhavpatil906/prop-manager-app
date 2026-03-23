'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import Sidebar, { TopBar } from '@/app/components/Sidebar'

function Modal({ title, onClose, children, width = 460 }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 28, padding: 32, width: '100%', maxWidth: width, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 950, color: '#0f172a', letterSpacing: -0.5 }}>{title}</h3>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: 12, width: 36, height: 32, cursor: 'pointer', fontSize: 18, color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="interactive-btn">✕</button>
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
  const s = colors[label] || { bg: '#f8fafc', color: '#0f172a', dot: '#0f172a' }
  return (
    <span style={{ background: s.bg, color: s.color, padding: '6px 14px', borderRadius: 20, fontSize: 10, fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} />
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
    <div style={{ background: '#fff', borderRadius: 24, border: '1px solid #f1f5f9', overflow: 'hidden', marginBottom: 20, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
      <div 
        onClick={() => setOpen(!open)}
        style={{ padding: '20px 28px', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', borderBottom: open ? '1px solid #f1f5f9' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ fontWeight: 950, color: '#0f172a', fontSize: 16, letterSpacing: -0.5 }}>{displayMonth}</span>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 12, color: '#059669', fontWeight: 900, background: '#ecfdf5', padding: '4px 12px', borderRadius: 10 }}>Paid: ₹{totalPaid.toLocaleString()}</span>
            {totalPending > 0 && <span style={{ fontSize: 12, color: '#d97706', fontWeight: 900, background: '#fffbeb', padding: '4px 12px', borderRadius: 10 }}>Pending: ₹{totalPending.toLocaleString()}</span>}
          </div>
        </div>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', transform: open ? 'rotate(180deg)' : 'none', transition: '0.3s' }}>
          <svg style={{width:16,height:16, color: '#0f172a'}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7"></path></svg>
        </div>
      </div>
      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20, padding: 24 }}>
          {items.map(p => (
            <div key={p.id} style={{ background: '#fff', borderRadius: 24, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.03)', transition: 'all 0.2s' }} className="premium-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div style={{ fontWeight: 950, color: '#0f172a', fontSize: 16 }}>{p.tenant?.name || '—'}</div>
                <Badge label={p.status} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '20px 0', borderTop: '1px solid #f1f5f9' }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Due Date</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>{p.due_date || '—'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 28, fontWeight: 950, color: '#0f172a', letterSpacing: -1 }}>₹{Number(p.amount).toLocaleString()}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                {p.status !== 'Paid' && <button onClick={() => onPay(p.id)} style={{ flex: 1, padding: '12px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 14, fontSize: 12, fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)' }} className="interactive-btn">Mark Paid</button>}
                <button onClick={() => onDelete(p.id)} style={{ padding: '12px 16px', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 14, fontSize: 12, fontWeight: 900, cursor: 'pointer' }} className="interactive-btn">✕</button>
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
    <div style={{ marginBottom: 20 }}>
      <label style={{ fontSize: 11, fontWeight: 900, color: '#64748b', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</label>
      <input type={type} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}
        style={{ width: '100%', padding: '14px 16px', border: '2px solid #f1f5f9', borderRadius: 16, fontSize: 15, boxSizing: 'border-box', color: '#0f172a', fontWeight: 700, transition: '0.2s', outline: 'none' }} className="focus-indigo" />
    </div>
  )

  if (!user) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f172a', fontWeight: 950 }}>Loading Ledger...</div>

  return (
    <div className="main-wrapper" style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, sans-serif', display: 'flex' }}>
      <Sidebar active="Payments" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        
        <div style={{ padding: '32px 24px', maxWidth: 1200, width: '100%', boxSizing: 'border-box', margin: '0 auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32, marginBottom: 40 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: 32, fontWeight: 950, color: '#0f172a', margin: 0, letterSpacing: -1.5 }}>Payments</h2>
                <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: 16, fontWeight: 600 }}>Tracking your financial collections.</p>
              </div>
              <button onClick={() => { setForm({ tenant_id: '', amount: '', due_date: '', paid_date: '', status: 'Pending', method: '' }); setModal('new') }} 
                style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 16, padding: '14px 28px', fontWeight: 900, cursor: 'pointer', fontSize: 14, boxShadow: '0 10px 15px -3px rgba(99, 102, 241, 0.3)', transition: '0.2s' }} className="interactive-btn">
                + Record Payment
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
              <div style={{ background: '#fff', padding: 28, borderRadius: 28, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: '#059669', textTransform: 'uppercase', letterSpacing: 1 }}>COLLECTED</div>
                <div style={{ fontSize: 32, fontWeight: 950, color: '#0f172a', marginTop: 8, letterSpacing: -1 }}>₹{totalCollected.toLocaleString()}</div>
              </div>
              <div style={{ background: '#fff', padding: 28, borderRadius: 28, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: '#dc2626', textTransform: 'uppercase', letterSpacing: 1 }}>OUTSTANDING</div>
                <div style={{ fontSize: 32, fontWeight: 950, color: '#0f172a', marginTop: 8, letterSpacing: -1 }}>₹{totalOutstanding.toLocaleString()}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
              {['All', 'Paid', 'Pending', 'Overdue'].map(s => (
                <button key={s} onClick={() => setFilter(s)}
                  style={{ whiteSpace: 'nowrap', padding: '10px 24px', borderRadius: 14, border: 'none', background: filter === s ? '#6366f1' : '#fff', color: filter === s ? '#fff' : '#64748b', fontWeight: 900, fontSize: 13, cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', transition: '0.2s' }} className="interactive-btn">
                  {s}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div style={{textAlign:'center', padding:100, color:'#0f172a', fontWeight: 800}}>
              <div className="skeleton-pulse" style={{ width: 48, height: 48, background: '#e2e8f0', borderRadius: '50%', margin: '0 auto 20px' }} />
              Verifying Ledger...
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {groupedPayments.length === 0 ? (
                <div style={{textAlign:'center', padding:80, background:'#fff', borderRadius:32, color:'#64748b', fontWeight:700, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'}}>No payment history matches these filters.</div>
              ) : groupedPayments.map(group => (
                <PaymentAccordion key={group.month} month={group.month} items={group.items} onPay={markPaid} onDelete={deletePayment} />
              ))}
            </div>
          )}
        </div>
      </div>

      {modal && (
        <Modal title={modal === 'new' ? 'Manual Payment Entry' : 'Update Payment Record'} onClose={() => setModal(null)}>
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 11, fontWeight: 900, color: '#64748b', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>RESIDENT NAME</label>
            <select value={form.tenant_id} onChange={e => setForm({...form, tenant_id: e.target.value})} style={{ width: '100%', padding: '14px 16px', border: '2px solid #f1f5f9', borderRadius: 16, fontSize: 15, color: '#0f172a', fontWeight: 700, outline: 'none', transition: '0.2s' }} className="focus-indigo">
              <option value="">— Select Resident —</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          {inp('Transaction Amount (₹)', 'amount', 'number')}
          {inp('Transaction Due Date', 'due_date', 'date')}
          <button onClick={savePayment} disabled={saving} style={{ width: '100%', padding: '18px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 18, fontSize: 16, fontWeight: 950, cursor: 'pointer', marginTop: 12, boxShadow: '0 10px 15px -3px rgba(99, 102, 241, 0.3)', transition: '0.2s' }} className="interactive-btn">
            {saving ? 'Syncing...' : 'Confirm Payment Record'}
          </button>
        </Modal>
      )}

      <style>{`
        @media (max-width: 768px) {
          .main-wrapper { flex-direction: column !important; }
        }
        .premium-card:hover {
          transform: translateY(-6px);
          box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1) !important;
          border-color: #6366f130 !important;
        }
        .focus-indigo:focus {
          border-color: #6366f1 !important;
          box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1) !important;
        }
        .interactive-btn:active {
          transform: scale(0.96);
        }
        .skeleton-pulse {
          animation: skeleton-animation 1.5s infinite linear;
        }
        @keyframes skeleton-animation {
          0% { opacity: 0.5; }
          50% { opacity: 1; }
          100% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
