'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import Sidebar, { TopBar } from '@/app/components/Sidebar'

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0007', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 32, width: '100%', maxWidth: 460, boxShadow: '0 8px 40px #0003' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#1a1a2e' }}>{title}</h3>
          <button onClick={onClose} style={{ background: '#f5f5f5', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 16 }}>x</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Badge({ label }) {
  const colors = {
    Paid: { bg: '#e8faf0', color: '#1a7a45', dot: '#22c55e' },
    Pending: { bg: '#fff8e6', color: '#92600a', dot: '#f59e0b' },
    Overdue: { bg: '#fdf2f2', color: '#991b1b', dot: '#ef4444' },
  }
  const s = colors[label] || colors.Pending
  return (
    <span style={{ background: s.bg, color: s.color, padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} />
      {label}
    </span>
  )
}

function StatCard({ label, value, accent }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: '24px 28px', boxShadow: '0 1px 4px #0001', border: '1px solid #f0f0f0', flex: 1 }}>
      <div style={{ fontSize: 13, color: '#888', fontWeight: 500, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: accent || '#1a1a2e' }}>{value}</div>
    </div>
  )
}

export default function Payments() {
  const { user } = useAuth()
  const [payments, setPayments] = useState([])
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('All')
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ tenant_id: '', amount: '', due_date: '', paid_date: '', status: 'Pending', method: '' })
  const [sidebarOpen, setSidebarOpen] = useState(false)

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

  useEffect(() => { if (!user?.id) return; fetchAll() }, [user])

  if (!user) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>Loading...</div>

  const openAdd = () => {
    setForm({ tenant_id: '', amount: '', due_date: '', paid_date: '', status: 'Pending', method: '' })
    setModal('new')
  }

  const openEdit = (p) => {
    setForm({ tenant_id: p.tenant_id, amount: p.amount, due_date: p.due_date || '', paid_date: p.paid_date || '', status: p.status, method: p.method || '' })
    setModal(p)
  }

  const savePayment = async () => {
    if (!form.tenant_id || !form.amount) return
    setSaving(true)
    try {
      const payload = { ...form, amount: parseFloat(form.amount), tenant_id: form.tenant_id, due_date: form.due_date || null, paid_date: form.paid_date || null }
      if (modal === 'new') {
        const { error } = await supabase.from('payments').insert([payload])
        if (error) throw error
      } else {
        const { error } = await supabase.from('payments').update(payload).eq('id', modal.id)
        if (error) throw error
      }
      fetchAll()
      setModal(null)
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setSaving(false)
  }

  const deletePayment = async (id) => {
    if (!confirm('Delete this payment record?')) return
    await supabase.from('payments').delete().eq('id', id)
    fetchAll()
  }

  const markPaid = async (id) => {
    await supabase.from('payments').update({ status: 'Paid', paid_date: new Date().toISOString().split('T')[0] }).eq('id', id)
    fetchAll()
  }

  const filtered = filter === 'All' ? payments : payments.filter(p => p.status === filter)
  const total = payments.reduce((a, b) => a + Number(b.amount), 0)
  const collected = payments.filter(p => p.status === 'Paid').reduce((a, b) => a + Number(b.amount), 0)
  const outstanding = payments.filter(p => p.status !== 'Paid').reduce((a, b) => a + Number(b.amount), 0)

  return (
    <div style={{ minHeight: '100vh', background: '#f7f8fc', fontFamily: 'sans-serif' }}>
      <Sidebar active="Payments" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <TopBar onMenuClick={() => setSidebarOpen(true)} />
      <div style={{ padding: '24px 16px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e', margin: 0 }}>Payments</h2>
          <button onClick={openAdd}
            style={{ background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
            + Add Payment
          </button>
        </div>

        {/* Summary Cards */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
          <StatCard label="Total Expected" value={'$' + total.toLocaleString()} accent="#1a1a2e" />
          <StatCard label="Collected" value={'$' + collected.toLocaleString()} accent="#16a34a" />
          <StatCard label="Outstanding" value={'$' + outstanding.toLocaleString()} accent="#dc2626" />
        </div>

        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {['All', 'Paid', 'Pending', 'Overdue'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: filter === s ? '#1a1a2e' : '#fff', color: filter === s ? '#fff' : '#555', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              {s}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#aaa' }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#aaa' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>💳</div>
            <div style={{ fontWeight: 600 }}>No payments found</div>
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 1px 4px #0001', border: '1px solid #f0f0f0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Tenant', 'Amount', 'Due Date', 'Paid Date', 'Method', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#888' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} style={{ borderTop: '1px solid #f5f5f5' }}>
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: '#1a1a2e', fontSize: 14 }}>{p.tenant?.name || '—'}</td>
                    <td style={{ padding: '14px 16px', fontWeight: 700, color: '#1a1a2e' }}>${Number(p.amount).toLocaleString()}</td>
                    <td style={{ padding: '14px 16px', fontSize: 13, color: '#555' }}>{p.due_date || '—'}</td>
                    <td style={{ padding: '14px 16px', fontSize: 13, color: '#555' }}>{p.paid_date || '—'}</td>
                    <td style={{ padding: '14px 16px', fontSize: 13, color: '#555' }}>{p.method || '—'}</td>
                    <td style={{ padding: '14px 16px' }}><Badge label={p.status} /></td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {p.status !== 'Paid' && (
                          <button onClick={() => markPaid(p.id)}
                            style={{ background: '#e8faf0', color: '#1a7a45', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            Mark Paid
                          </button>
                        )}
                        <button onClick={() => openEdit(p)}
                          style={{ background: '#f0f9ff', color: '#075985', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          Edit
                        </button>
                        <button onClick={() => deletePayment(p.id)}
                          style={{ background: '#fdf2f2', color: '#991b1b', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <Modal title={modal === 'new' ? 'Add Payment' : 'Edit Payment'} onClose={() => setModal(null)}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 5 }}>Tenant</label>
            <select value={form.tenant_id} onChange={e => setForm({ ...form, tenant_id: e.target.value })}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14 }}>
              <option value="">— Select Tenant —</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {[['Amount ($)', 'amount', 'number'], ['Due Date', 'due_date', 'date'], ['Paid Date', 'paid_date', 'date'], ['Payment Method', 'method', 'text']].map(([label, key, type]) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 5 }}>{label}</label>
              <input type={type} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
            </div>
          ))}

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 5 }}>Status</label>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14 }}>
              {['Pending', 'Paid', 'Overdue'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={savePayment} disabled={saving}
              style={{ flex: 1, padding: 12, background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>
              {saving ? 'Saving...' : modal === 'new' ? 'Add Payment' : 'Save Changes'}
            </button>
            <button onClick={() => setModal(null)}
              style={{ padding: '12px 20px', background: '#f5f5f5', color: '#555', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}