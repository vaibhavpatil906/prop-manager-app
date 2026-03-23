'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import Sidebar, { TopBar } from '@/app/components/Sidebar'

function Modal({ title, onClose, children, width = 500 }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0007', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 24, padding: 24, width: '100%', maxWidth: width, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px #0003' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
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
    Open: { bg: '#fef2f2', color: '#dc2626', dot: '#ef4444' },
    'In Progress': { bg: '#eff6ff', color: '#2563eb', dot: '#3b82f6' },
    Resolved: { bg: '#ecfdf5', color: '#059669', dot: '#10b981' },
  }
  const s = colors[label] || colors.Open
  return (
    <span style={{ background: s.bg, color: s.color, padding: '4px 12px', borderRadius: 20, fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 5, textTransform: 'uppercase' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot }} />
      {label}
    </span>
  )
}

export default function Maintenance() {
  const { user } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [requests, setRequests] = useState([])
  const [tenants, setTenants] = useState([])
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('All')
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ tenant_id: '', unit_id: '', issue: '', description: '', priority: 'Medium', status: 'Open' })

  const fetchAll = async () => {
    setLoading(true)
    const [{ data: r }, { data: t }, { data: u }] = await Promise.all([
      supabase.from('maintenance_requests').select('*, tenant:tenants(name), unit:units(unit_number, property:properties(name))').order('created_at', { ascending: false }),
      supabase.from('tenants').select('id, name').eq('user_id', user.id),
      supabase.from('units').select('id, unit_number, property:properties(name)'),
    ])
    setRequests(r || [])
    setTenants(t || [])
    setUnits(u || [])
    setLoading(false)
  }

  useEffect(() => { if (user?.id) fetchAll() }, [user])

  const saveRequest = async () => {
    if (!form.issue) return
    setSaving(true)
    try {
      const payload = { ...form, tenant_id: form.tenant_id || null, unit_id: form.unit_id || null }
      if (modal === 'new') await supabase.from('maintenance_requests').insert([payload])
      else await supabase.from('maintenance_requests').update(payload).eq('id', modal.id)
      fetchAll(); setModal(null)
    } catch (err) { alert(err.message) }
    setSaving(false)
  }

  const deleteRequest = async (id) => {
    if (!confirm('Delete request?')) return
    await supabase.from('maintenance_requests').delete().eq('id', id)
    fetchAll()
  }

  const updateStatus = async (id, status) => {
    await supabase.from('maintenance_requests').update({ status }).eq('id', id)
    fetchAll()
  }

  const filtered = filter === 'All' ? requests : requests.filter(r => r.status === filter)

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
      <Sidebar active="Maintenance" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        
        <div style={{ padding: '24px 16px', maxWidth: 1100, width: '100%', boxSizing: 'border-box', margin: '0 auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', margin: 0 }}>Maintenance</h2>
              <button onClick={() => { setForm({ tenant_id: '', unit_id: '', issue: '', description: '', priority: 'Medium', status: 'Open' }); setModal('new') }} 
                style={{ background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 20px', fontWeight: 800, cursor: 'pointer', fontSize: 13 }}>
                + Add Issue
              </button>
            </div>
            
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
              {['All', 'Open', 'In Progress', 'Resolved'].map(s => (
                <button key={s} onClick={() => setFilter(s)}
                  style={{ whiteSpace: 'nowrap', padding: '8px 16px', borderRadius: 10, border: '1px solid #e2e8f0', background: filter === s ? '#1a1a2e' : '#fff', color: filter === s ? '#fff' : '#64748b', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {loading ? <div style={{textAlign:'center', padding:60, color:'#94a3b8'}}>Loading...</div> : (
            <div className="maintenance-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {filtered.map(r => (
                <div key={r.id} style={{ background: '#fff', borderRadius: 20, padding: 20, border: '1px solid #f1f5f9', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 15, flex: 1, marginRight: 12 }}>{r.issue}</div>
                    <Badge label={r.status} />
                  </div>
                  {r.description && <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b', lineHeight: 1.4 }}>{r.description}</p>}
                  <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, padding: '12px 0', borderTop: '1px solid #f8fafc' }}>
                    {r.tenant?.name || 'Unknown'} · Unit {r.unit?.unit_number}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    {r.status === 'Open' && <button onClick={() => updateStatus(r.id, 'In Progress')} style={{ flex: 1, padding: '8px', background: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 700 }}>In Progress</button>}
                    {r.status === 'In Progress' && <button onClick={() => updateStatus(r.id, 'Resolved')} style={{ flex: 1, padding: '8px', background: '#ecfdf5', color: '#059669', border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 700 }}>Resolved</button>}
                    <button onClick={() => deleteRequest(r.id)} style={{ padding: '8px 12px', background: '#fff1f2', color: '#be123c', border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 700 }}>✕</button>
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
          .maintenance-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
