'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import Sidebar, { TopBar } from '@/app/components/Sidebar'

function Modal({ title, onClose, children, width = 520 }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0007', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 24, padding: 24, width: '100%', maxWidth: width, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px #0003' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#1a1a2e' }}>{title}</h3>
          <button onClick={onClose} style={{ background: '#f5f5f5', border: 'none', borderRadius: 12, width: 32, height: 32, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Badge({ label }) {
  const colors = {
    Active: { bg: '#e8faf0', color: '#1a7a45', dot: '#22c55e' },
    Late: { bg: '#fdf2f2', color: '#991b1b', dot: '#ef4444' },
    Inactive: { bg: '#f5f5f5', color: '#888', dot: '#ccc' },
  }
  const s = colors[label] || colors.Inactive
  return (
    <span style={{ background: s.bg, color: s.color, padding: '4px 12px', borderRadius: 20, fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 5, textTransform: 'uppercase' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot }} />
      {label}
    </span>
  )
}

export default function Tenants() {
  const { user } = useAuth()
  const [tenants, setTenants] = useState([])
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [releaseModal, setReleaseModal] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({ name: '', email: '', phone: '', unit_id: '', rent: '', deposit: '', status: 'Active' })

  const fetchAll = async () => {
    setLoading(true)
    const [{ data: t }, { data: u }] = await Promise.all([
      supabase.from('tenants').select('*, unit:units(unit_number, property:properties(name))').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('units').select('*, property:properties(name)'),
    ])
    setTenants(t || [])
    setUnits(u || [])
    setLoading(false)
  }

  useEffect(() => { if (user?.id) fetchAll() }, [user])

  const saveTenant = async () => {
    if (!form.name || !form.unit_id) return alert('Name and Unit are required')
    setSaving(true)
    try {
      const payload = { ...form, user_id: user.id, rent: parseFloat(form.rent) || 0, deposit: parseFloat(form.deposit) || 0 }
      const { error } = await supabase.from('tenants').insert([payload])
      if (error) throw error
      await supabase.from('units').update({ status: 'Occupied' }).eq('id', form.unit_id)
      fetchAll(); setModal(null)
    } catch (err) { alert(err.message) }
    setSaving(false)
  }

  const handleRelease = async () => {
    setSaving(true)
    try {
      await supabase.from('tenants').update({ status: 'Inactive', unit_id: null }).eq('id', releaseModal.id)
      await supabase.from('units').update({ status: 'Vacant' }).eq('id', releaseModal.unit_id)
      fetchAll(); setReleaseModal(null)
    } catch (err) { alert(err.message) }
    setSaving(false)
  }

  const vacantUnits = units.filter(u => u.status === 'Vacant')
  const filtered = tenants.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))

  const inp = (label, key, state, setState, type = 'text') => (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: '#888', display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>{label}</label>
      <input type={type} value={state[key]} onChange={e => setState({ ...state, [key]: e.target.value })}
        style={{ width: '100%', padding: '12px 14px', border: '1px solid #e5e7eb', borderRadius: 12, fontSize: 14, boxSizing: 'border-box', outline: 'none' }} />
    </div>
  )

  if (!user) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1' }}>Loading...</div>

  return (
    <div className="main-wrapper" style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, sans-serif', display: 'flex' }}>
      <Sidebar active="Tenants" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        
        <div style={{ padding: '24px 16px', maxWidth: 1100, width: '100%', boxSizing: 'border-box', margin: '0 auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', margin: 0 }}>Residents</h2>
              <button onClick={() => { setForm({ name: '', email: '', phone: '', unit_id: '', rent: '', deposit: '', status: 'Active' }); setModal('new') }} 
                style={{ background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 20px', fontWeight: 800, cursor: 'pointer', fontSize: 13 }}>
                + Onboard
              </button>
            </div>
            <input placeholder="Search residents..." value={search} onChange={e => setSearch(e.target.value)} 
              style={{ padding: '12px 16px', border: '1px solid #e2e8f0', borderRadius: 14, fontSize: 14, width: '100%', outline: 'none', background: '#fff', boxSizing: 'border-box' }} />
          </div>

          {loading ? <div style={{textAlign:'center', padding:60, color:'#94a3b8'}}>Fetching residents...</div> : (
            <div className="residents-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {filtered.map(t => (
                <div key={t.id} style={{ background: '#fff', borderRadius: 20, padding: 20, border: '1px solid #f1f5f9', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <div>
                      <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 16 }}>{t.name}</div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{t.email}</div>
                    </div>
                    <Badge label={t.status} />
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '16px 0', borderTop: '1px solid #f8fafc', borderBottom: '1px solid #f8fafc' }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Assigned Unit</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#6366f1', marginTop: 4 }}>{t.unit ? `Unit ${t.unit.unit_number}` : 'N/A'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Monthly Rent</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>${Number(t.rent).toLocaleString()}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                    {t.status === 'Active' ? (
                      <button onClick={() => setReleaseModal(t)} style={{ flex: 1, padding: '10px', background: '#fff1f2', color: '#be123c', border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Release Resident</button>
                    ) : (
                      <div style={{ flex: 1, padding: '10px', textAlign: 'center', color: '#94a3b8', fontSize: 12, fontWeight: 600, background: '#f8fafc', borderRadius: 10 }}>Released</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {modal && (
        <Modal title="Onboarding" onClose={() => setModal(null)}>
          {inp('Full Name', 'name', form, setForm)}
          {inp('Email', 'email', form, setForm, 'email')}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#888', display: 'block', marginBottom: 6 }}>SELECT UNIT</label>
            <select value={form.unit_id} onChange={e => setForm({ ...form, unit_id: e.target.value })} style={{ width: '100%', padding: '12px', border: '1px solid #e5e7eb', borderRadius: 12, fontSize: 14 }}>
              <option value="">— Choose Vacant Unit —</option>
              {vacantUnits.map(u => <option key={u.id} value={u.id}>Unit {u.unit_number} ({u.property?.name})</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {inp('Rent ($)', 'rent', form, setForm, 'number')}
            {inp('Deposit ($)', 'deposit', form, setForm, 'number')}
          </div>
          <button onClick={saveTenant} disabled={saving} style={{ width: '100%', padding: '14px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 800, cursor: 'pointer', marginTop: 10 }}>
            {saving ? 'Saving...' : 'Complete Onboarding'}
          </button>
        </Modal>
      )}

      {releaseModal && (
        <Modal title="Release" onClose={() => setReleaseModal(null)}>
          <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.5, marginBottom: 20 }}>Setting <b>{releaseModal.name}</b> to Inactive and marking Unit <b>{releaseModal.unit?.unit_number}</b> as Vacant.</p>
          <div style={{ background: '#f8fafc', borderRadius: 16, padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}><span>Initial Deposit</span><span style={{fontWeight:700}}>${releaseModal.deposit || 0}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 900, marginTop: 12, paddingTop: 12, borderTop: '1px dashed #e2e8f0' }}><span>Refund</span><span style={{color:'#10b981'}}>${releaseModal.deposit || 0}</span></div>
          </div>
          <button onClick={handleRelease} disabled={saving} style={{ width: '100%', padding: '14px', background: '#be123c', color: '#fff', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>Confirm Release</button>
        </Modal>
      )}
      <style>{`
        @media (max-width: 768px) {
          .main-wrapper { flex-direction: column !important; }
          .residents-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
