'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import Sidebar, { TopBar, PageLoader, TOKENS } from '@/app/components/Sidebar'

function Modal({ title, onClose, children, width = 520 }) {
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
    Open: { bg: '#fef2f2', color: '#dc2626', dot: '#ef4444' },
    'In Progress': { bg: '#eff6ff', color: '#2563eb', dot: '#3b82f6' },
    Resolved: { bg: '#ecfdf5', color: '#059669', dot: '#10b981' },
  }
  const s = colors[label] || colors.Open
  return (
    <span style={{ background: s.bg, color: s.color, padding: '6px 14px', borderRadius: 20, fontSize: 10, fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} />
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
    <div style={{ marginBottom: 20 }}>
      <label style={{ fontSize: 11, fontWeight: 900, color: TOKENS.slate, display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</label>
      <input type={type} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}
        style={{ width: '100%', padding: '14px 16px', border: `2px solid ${TOKENS.border}`, borderRadius: 16, fontSize: 15, boxSizing: 'border-box', color: TOKENS.dark, fontWeight: 700, transition: '0.2s', outline: 'none' }} className="focus-indigo" />
    </div>
  )

  if (!user) return <PageLoader message="Authenticating Maintenance Access..." />

  return (
    <div className="main-wrapper" style={{ minHeight: '100vh', background: TOKENS.bg, fontFamily: TOKENS.font, display: 'flex' }}>
      <Sidebar active="Maintenance" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        
        <div style={{ padding: '32px 24px', maxWidth: 1200, width: '100%', boxSizing: 'border-box', margin: '0 auto' }} className="maintenance-container">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32, marginBottom: 40 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 24 }}>
              <div>
                <h2 style={{ fontSize: 'clamp(24px, 5vw, 32px)', fontWeight: 950, color: TOKENS.dark, margin: 0, letterSpacing: -1.5 }}>Maintenance</h2>
                <p style={{ color: TOKENS.slate, margin: '4px 0 0', fontSize: 16, fontWeight: 600 }}>Track and resolve property upkeep requests.</p>
              </div>
              <button onClick={() => { setForm({ tenant_id: '', unit_id: '', issue: '', description: '', priority: 'Medium', status: 'Open' }); setModal('new') }} 
                style={{ background: TOKENS.primary, color: '#fff', border: 'none', borderRadius: TOKENS.radiusBtn, padding: '14px 28px', fontWeight: 900, cursor: 'pointer', fontSize: 14, boxShadow: '0 10px 15px -3px rgba(99, 102, 241, 0.3)', transition: '0.2s', width: '100%', maxWidth: 'fit-content' }} className="interactive-btn mobile-full-btn">
                + Report Issue
              </button>
            </div>
            
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
              {['All', 'Open', 'In Progress', 'Resolved'].map(s => (
                <button key={s} onClick={() => setFilter(s)}
                  style={{ whiteSpace: 'nowrap', padding: '10px 24px', borderRadius: 14, border: 'none', background: filter === s ? TOKENS.primary : '#fff', color: filter === s ? '#fff' : TOKENS.slate, fontWeight: 900, fontSize: 13, cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', transition: '0.2s' }} className="interactive-btn">
                  {s}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <PageLoader message="Retrieving Maintenance Logs..." />
          ) : (
            <div className="maintenance-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
              {filtered.map(r => (
                <div key={r.id} style={{ background: '#fff', borderRadius: TOKENS.radiusCard, padding: 32, border: `1px solid ${TOKENS.border}`, boxShadow: TOKENS.shadow, transition: 'all 0.2s' }} className="premium-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                    <div style={{ fontWeight: 950, color: TOKENS.dark, fontSize: 16, flex: 1, marginRight: 16, letterSpacing: -0.5 }}>{r.issue}</div>
                    <Badge label={r.status} />
                  </div>
                  {r.description && <p style={{ margin: '0 0 24px', fontSize: 14, color: TOKENS.slate, lineHeight: 1.6, fontWeight: 600 }}>{r.description}</p>}
                  <div style={{ fontSize: 12, color: TOKENS.dark, fontWeight: 800, padding: '16px 0', borderTop: `1px solid ${TOKENS.bg}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{color: TOKENS.primary}}>📍</span> {r.tenant?.name || 'Unknown'} · Unit {r.unit?.unit_number}
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                    {r.status === 'Open' && <button onClick={() => updateStatus(r.id, 'In Progress')} style={{ flex: 1, padding: '12px', background: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: 14, fontSize: 12, fontWeight: 900, cursor: 'pointer' }} className="interactive-btn">In Progress</button>}
                    {r.status === 'In Progress' && <button onClick={() => updateStatus(r.id, 'Resolved')} style={{ flex: 1, padding: '12px', background: '#ecfdf5', color: '#059669', border: 'none', borderRadius: 14, fontSize: 12, fontWeight: 900, cursor: 'pointer' }} className="interactive-btn">Mark Resolved</button>}
                    <button onClick={() => deleteRequest(r.id)} style={{ padding: '12px 16px', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 14, fontSize: 12, fontWeight: 900, cursor: 'pointer' }} className="interactive-btn">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {modal && (
        <Modal title={modal === 'new' ? 'Report New Issue' : 'Modify Request'} onClose={() => setModal(null)}>
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 11, fontWeight: 900, color: TOKENS.slate, display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>ASSIGNED RESIDENT</label>
            <select value={form.tenant_id} onChange={e => setForm({...form, tenant_id: e.target.value})} style={{ width: '100%', padding: '14px 16px', border: `2px solid ${TOKENS.border}`, borderRadius: 16, fontSize: 15, color: TOKENS.dark, fontWeight: 700, outline: 'none', transition: '0.2s' }} className="focus-indigo">
              <option value="">— Select Household —</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          {inp('Issue Title', 'issue')}
          <div style={{ marginBottom: 32 }}>
            <label style={{ fontSize: 11, fontWeight: 900, color: TOKENS.slate, display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>DESCRIPTION</label>
            <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Describe the problem..." style={{ width: '100%', padding: '14px 16px', border: `2px solid ${TOKENS.border}`, borderRadius: 16, fontSize: 15, color: TOKENS.dark, fontWeight: 700, height: 120, resize: 'none', outline: 'none', transition: '0.2s' }} className="focus-indigo" />
          </div>
          <button onClick={saveRequest} disabled={saving} style={{ width: '100%', padding: '18px', background: TOKENS.dark, color: '#fff', border: 'none', borderRadius: 18, fontSize: 16, fontWeight: 950, cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.3)', transition: '0.2s' }} className="interactive-btn">
            {saving ? 'Processing...' : 'Submit Maintenance Request'}
          </button>
        </Modal>
      )}

      <style>{`
        @media (max-width: 768px) {
          .main-wrapper { flex-direction: column !important; }
          .maintenance-container { padding: 20px 16px !important; }
          .mobile-full-btn { max-width: none !important; width: 100% !important; margin-top: 12px; }
          .maintenance-grid { grid-template-columns: 1fr !important; }
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
