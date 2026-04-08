'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import Sidebar, { TopBar, PageLoader, TOKENS } from '@/app/components/Sidebar'

function Modal({ title, onClose, children, width = 460 }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: TOKENS.radiusCard, padding: '32px 24px', width: '100%', maxWidth: width, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }} className="modal-container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 950, color: TOKENS.dark, letterSpacing: -0.5 }}>{title}</h3>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: 12, width: 36, height: 32, cursor: 'pointer', fontSize: 18, color: TOKENS.dark, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="interactive-btn">✕</button>
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
  const s = colors[label] || { bg: '#f8fafc', color: TOKENS.dark, dot: TOKENS.dark }
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
    <div style={{ background: '#fff', borderRadius: TOKENS.radiusCard, border: `1px solid ${TOKENS.border}`, overflow: 'hidden', marginBottom: 20, boxShadow: TOKENS.shadow }}>
      <div 
        onClick={() => setOpen(!open)}
        style={{ padding: '20px 28px', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', borderBottom: open ? `1px solid ${TOKENS.border}` : 'none' }} className="accordion-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 950, color: TOKENS.dark, fontSize: 16, letterSpacing: -0.5 }}>{displayMonth}</span>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 12, color: '#059669', fontWeight: 900, background: '#ecfdf5', padding: '4px 12px', borderRadius: 10 }}>Paid: ₹{totalPaid.toLocaleString()}</span>
            {totalPending > 0 && <span style={{ fontSize: 12, color: '#d97706', fontWeight: 900, background: '#fffbeb', padding: '4px 12px', borderRadius: 10 }}>Pending: ₹{totalPending.toLocaleString()}</span>}
          </div>
        </div>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', transform: open ? 'rotate(180deg)' : 'none', transition: '0.3s' }}>
          <svg style={{width:16,height:16, color: TOKENS.dark}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7"></path></svg>
        </div>
      </div>
      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20, padding: 24 }} className="accordion-content">
          {items.map(p => (
            <div key={p.id} style={{ background: '#fff', borderRadius: 20, padding: 24, border: `1px solid ${TOKENS.border}`, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)', transition: 'all 0.2s' }} className="premium-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div style={{ fontWeight: 950, color: TOKENS.dark, fontSize: 16 }}>{p.tenant?.name || '—'}</div>
                <Badge label={p.status} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '20px 0', borderTop: `1px solid ${TOKENS.border}` }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 900, color: TOKENS.slate, textTransform: 'uppercase', letterSpacing: 1 }}>Due Date</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: TOKENS.dark, marginTop: 4 }}>{p.due_date || '—'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 28, fontWeight: 950, color: TOKENS.dark, letterSpacing: -1 }}>₹{Number(p.amount).toLocaleString()}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                {p.status !== 'Paid' && <button onClick={() => onPay(p.id)} style={{ flex: 1, padding: '12px', background: TOKENS.primary, color: '#fff', border: 'none', borderRadius: 14, fontSize: 12, fontWeight: 900, cursor: 'pointer', boxShadow: `0 4px 12px ${TOKENS.primary}30` }} className="interactive-btn">Mark Paid</button>}
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
      const amt = parseFloat(form.amount)
      const payload = { ...form, amount: amt }
      
      if (modal !== 'new' && modal.id) {
        if (modal.bill_id) {
          const { data: bill } = await supabase.from('utility_bills').select('balance_due, due_date').eq('id', modal.bill_id).single()
          const newBalance = (bill.balance_due || modal.amount) - amt
          
          await supabase.from('payments').update({ amount: amt, status: 'Paid', paid_date: new Date().toISOString().split('T')[0] }).eq('id', modal.id)
          await supabase.from('utility_bills').update({ balance_due: Math.max(0, newBalance) }).eq('id', modal.bill_id)
          
          if (newBalance > 0) {
            await supabase.from('payments').insert([{
              tenant_id: modal.tenant_id, bill_id: modal.bill_id, amount: newBalance,
              status: 'Pending', method: 'Partial Balance', due_date: bill.due_date
            }])
          }
        } else {
          await supabase.from('payments').update(payload).eq('id', modal.id)
        }
      } else {
        await supabase.from('payments').insert([payload])
      }
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
      <label style={{ fontSize: 11, fontWeight: 900, color: TOKENS.slate, display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</label>
      <input type={type} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}
        style={{ width: '100%', padding: '14px 16px', border: `2px solid ${TOKENS.border}`, borderRadius: 16, fontSize: 15, boxSizing: 'border-box', color: TOKENS.dark, fontWeight: 700, transition: '0.2s', outline: 'none' }} className="focus-indigo" />
    </div>
  )

  if (!user) return <PageLoader message="Authenticating Session..." />

  return (
    <div className="main-wrapper" style={{ minHeight: '100vh', background: TOKENS.bg, fontFamily: TOKENS.font, display: 'flex' }}>
      <Sidebar active="Payments" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        
        <div style={{ padding: '32px 24px', maxWidth: 1200, width: '100%', boxSizing: 'border-box', margin: '0 auto' }} className="payments-container">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32, marginBottom: 40 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 24 }}>
              <div>
                <h2 style={{ fontSize: 'clamp(24px, 5vw, 32px)', fontWeight: 950, color: TOKENS.dark, margin: 0, letterSpacing: -1.5 }}>Payments</h2>
                <p style={{ color: TOKENS.slate, margin: '4px 0 0', fontSize: 16, fontWeight: 600 }}>Tracking your financial collections and revenue.</p>
              </div>
              <button onClick={() => { setForm({ tenant_id: '', amount: '', due_date: '', paid_date: '', status: 'Pending', method: '' }); setModal('new') }} 
                style={{ background: TOKENS.dark, color: '#fff', border: 'none', borderRadius: TOKENS.radiusBtn, padding: '14px 28px', fontWeight: 900, cursor: 'pointer', fontSize: 14, boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.3)', transition: '0.2s', width: '100%', maxWidth: 'fit-content' }} className="interactive-btn mobile-full-btn">
                + Record Payment
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
              <div style={{ background: '#fff', padding: 28, borderRadius: TOKENS.radiusCard, boxShadow: TOKENS.shadow, border: `1px solid ${TOKENS.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: '#059669', textTransform: 'uppercase', letterSpacing: 1 }}>TOTAL COLLECTED</div>
                <div style={{ fontSize: 32, fontWeight: 950, color: TOKENS.dark, marginTop: 8, letterSpacing: -1 }}>₹{totalCollected.toLocaleString()}</div>
              </div>
              <div style={{ background: '#fff', padding: 28, borderRadius: TOKENS.radiusCard, boxShadow: TOKENS.shadow, border: `1px solid ${TOKENS.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: '#dc2626', textTransform: 'uppercase', letterSpacing: 1 }}>OUTSTANDING</div>
                <div style={{ fontSize: 32, fontWeight: 950, color: TOKENS.dark, marginTop: 8, letterSpacing: -1 }}>₹{totalOutstanding.toLocaleString()}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
              {['All', 'Paid', 'Pending', 'Overdue'].map(s => (
                <button key={s} onClick={() => setFilter(s)}
                  style={{ whiteSpace: 'nowrap', padding: '10px 24px', borderRadius: 14, border: 'none', background: filter === s ? TOKENS.primary : '#fff', color: filter === s ? '#fff' : TOKENS.slate, fontWeight: 900, fontSize: 13, cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', transition: '0.2s' }} className="interactive-btn">
                  {s}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <PageLoader message="Verifying Ledger Data..." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {groupedPayments.length === 0 ? (
                <div style={{textAlign:'center', padding:80, background:'#fff', borderRadius:32, color: TOKENS.slate, fontWeight:700, border: `1px solid ${TOKENS.border}`, boxShadow: TOKENS.shadow}}>No payment history matches these filters.</div>
              ) : groupedPayments.map(group => (
                <PaymentAccordion key={group.month} month={group.month} items={group.items} onPay={markPaid} onDelete={deletePayment} />
              ))}
            </div>
          )}
        </div>
      </div>

      {modal && (
        <Modal title={modal === 'new' ? 'Manual Entry' : 'Edit Entry'} onClose={() => setModal(null)}>
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 11, fontWeight: 900, color: TOKENS.slate, display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>SELECT RESIDENT</label>
            <select value={form.tenant_id} onChange={e => setForm({...form, tenant_id: e.target.value})} style={{ width: '100%', padding: '14px 16px', border: `2px solid ${TOKENS.border}`, borderRadius: 16, fontSize: 15, color: TOKENS.dark, fontWeight: 700, outline: 'none', transition: '0.2s' }} className="focus-indigo">
              <option value="">— Select Resident —</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          {inp('Transaction Amount (₹)', 'amount', 'number')}
          {inp('Transaction Due Date', 'due_date', 'date')}
          <button onClick={savePayment} disabled={saving} style={{ width: '100%', padding: '18px', background: TOKENS.dark, color: '#fff', border: 'none', borderRadius: 18, fontSize: 16, fontWeight: 950, cursor: 'pointer', marginTop: 12, boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.3)', transition: '0.2s' }} className="interactive-btn">
            {saving ? 'Processing...' : 'Confirm Payment Record'}
          </button>
        </Modal>
      )}

      <style>{`
        @media (max-width: 768px) {
          .main-wrapper { flex-direction: column !important; }
          .payments-container { padding: 20px 16px !important; }
          .accordion-header { padding: 16px 20px !important; }
          .accordion-content { grid-template-columns: 1fr !important; padding: 16px !important; }
          .mobile-full-btn { max-width: none !important; width: 100% !important; margin-top: 12px; }
          .modal-container { padding: 20px 16px !important; border-radius: 20px !important; }
        }
        .premium-card:hover {
          transform: translateY(-6px);
          box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1) !important;
          border-color: ${TOKENS.primary}30 !important;
        }
        .focus-indigo:focus {
          border-color: ${TOKENS.primary} !important;
          box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1) !important;
        }
        .interactive-btn:active { transform: scale(0.96); }
      `}</style>
    </div>
  )
}
