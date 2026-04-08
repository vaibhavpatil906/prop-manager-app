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
    Active: { bg: '#ecfdf5', color: '#059669', dot: '#10b981' },
    Late: { bg: '#fef2f2', color: '#dc2626', dot: '#ef4444' },
    Inactive: { bg: '#f8fafc', color: '#64748b', dot: '#94a3b8' },
    Paid: { bg: '#ecfdf5', color: '#059669', dot: '#10b981' },
    Pending: { bg: '#fffbeb', color: '#d97706', dot: '#f59e0b' },
    Open: { bg: '#fef2f2', color: '#dc2626', dot: '#ef4444' },
    'In Progress': { bg: '#eff6ff', color: '#2563eb', dot: '#3b82f6' },
    Resolved: { bg: '#ecfdf5', color: '#059669', dot: '#10b981' },
  }
  const s = colors[label] || { bg: '#f8fafc', color: TOKENS.dark, dot: TOKENS.dark }
  return (
    <span style={{ background: s.bg, color: s.color, padding: '6px 14px', borderRadius: 20, fontSize: 10, fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: 6, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} />
      {label}
    </span>
  )
}

export default function Tenants() {
  const { user } = useAuth()
  const [tenants, setTenants] = useState([])
  const [units, setUnits] = useState([])
  const [leases, setLeases] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [releaseModal, setReleaseModal] = useState(null)
  const [leasesModal, setLeasesModal] = useState(null)
  const [tenantDetailModal, setTenantDetailModal] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [leaseFile, setLeaseFile] = useState(null)

  const [form, setForm] = useState({ name: '', email: '', phone: '', unit_id: '', rent: '', deposit: '', status: 'Active' })

  const fetchAll = async () => {
    setLoading(true)
    const [{ data: t }, { data: u }, { data: l }] = await Promise.all([
      supabase.from('tenants').select('*, unit:units(unit_number, property:properties(name))').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('units').select('*, property:properties(name)'),
      supabase.from('leases').select('*').order('created_at', { ascending: false }),
    ])
    setTenants(t || [])
    setUnits(u || [])
    setLeases(l || [])
    setLoading(false)
  }

  useEffect(() => { if (user?.id) fetchAll() }, [user])

  const openAdd = () => {
    setForm({ name: '', email: '', phone: '', unit_id: '', rent: '', deposit: '', status: 'Active' })
    setLeaseFile(null)
    setModal('new')
  }

  const openEdit = (t) => {
    setForm({ name: t.name, email: t.email, phone: t.phone || '', unit_id: t.unit_id || '', rent: t.rent || '', deposit: t.deposit || '', status: t.status })
    setLeaseFile(null)
    setModal(t)
  }

  const saveTenant = async () => {
    if (!form.name || !form.email || !form.unit_id) return alert('Name, Email, and Unit are required')
    setSaving(true)
    try {
      const payload = { ...form, user_id: user.id, rent: parseFloat(form.rent) || 0, deposit: parseFloat(form.deposit) || 0 }
      let tenantId = modal?.id

      if (modal === 'new') {
        const { data, error } = await supabase.from('tenants').insert([payload]).select().single()
        if (error) throw error
        tenantId = data.id
      } else {
        const { error } = await supabase.from('tenants').update(payload).eq('id', modal.id)
        if (error) throw error
      }

      if (leaseFile && tenantId) {
        const ext = leaseFile.name.split('.').pop()
        const path = `${user.id}/${tenantId}/${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage.from('leases').upload(path, leaseFile)
        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage.from('leases').getPublicUrl(path)
          await supabase.from('leases').insert([{
            tenant_id: tenantId, unit_id: form.unit_id || null, file_url: publicUrl,
            file_name: leaseFile.name, status: 'Active'
          }])
        }
      }

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

  const fetchTenantDetails = async (t) => {
    setLoading(true)
    const [
      { data: b },
      { data: p },
      { data: m }
    ] = await Promise.all([
      supabase.from('utility_bills').select('*').eq('tenant_id', t.id).order('billing_month', { ascending: false }),
      supabase.from('payments').select('*').eq('tenant_id', t.id).order('due_date', { ascending: false }),
      supabase.from('maintenance_requests').select('*').eq('tenant_id', t.id).order('created_at', { ascending: false })
    ])
    setTenantDetailModal({ ...t, bills: b || [], payments: p || [], maintenance: m || [] })
    setLoading(false)
  }

  const vacantUnits = units.filter(u => u.status === 'Vacant')
  const filtered = tenants.filter(t => t.name.toLowerCase().includes(search.toLowerCase()) || (t.unit?.unit_number && t.unit.unit_number.toString().includes(search)))

  const inp = (label, key, state, setState, type = 'text') => (
    <div style={{ marginBottom: 20 }}>
      <label style={{ fontSize: 11, fontWeight: 900, color: TOKENS.slate, display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</label>
      <input type={type} value={state[key]} onChange={e => setState({ ...state, [key]: e.target.value })}
        style={{ width: '100%', padding: '14px 16px', border: `2px solid ${TOKENS.border}`, borderRadius: 16, fontSize: 15, boxSizing: 'border-box', outline: 'none', color: TOKENS.dark, fontWeight: 700, transition: '0.2s' }} className="focus-indigo" />
    </div>
  )

  if (!user) return <PageLoader message="Authenticating Session..." />

  const sectionH = { fontSize: 13, fontWeight: 950, color: TOKENS.dark, borderBottom: `2px solid ${TOKENS.primary}`, width: 'fit-content', paddingBottom: 4, marginBottom: 20, marginTop: 32, textTransform: 'uppercase', letterSpacing: 1 }

  return (
    <div className="main-wrapper" style={{ minHeight: '100vh', background: TOKENS.bg, fontFamily: TOKENS.font, display: 'flex' }}>
      <Sidebar active="Tenants" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        
        <div style={{ padding: '32px 24px', maxWidth: 1200, width: '100%', boxSizing: 'border-box', margin: '0 auto' }} className="tenants-container">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 40 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 24 }}>
              <div>
                <h2 style={{ fontSize: 'clamp(24px, 5vw, 32px)', fontWeight: 950, color: TOKENS.dark, margin: 0, letterSpacing: -1.5 }}>Residents</h2>
                <p style={{ color: TOKENS.slate, margin: '4px 0 0', fontSize: 16, fontWeight: 600 }}>Managing active households across your units.</p>
              </div>
              <button onClick={openAdd} 
                style={{ background: TOKENS.primary, color: '#fff', border: 'none', borderRadius: TOKENS.radiusBtn, padding: '14px 28px', fontWeight: 900, cursor: 'pointer', fontSize: 14, boxShadow: '0 10px 15px -3px rgba(99, 102, 241, 0.3)', transition: '0.2s', width: '100%', maxWidth: 'fit-content' }} className="interactive-btn mobile-full-btn">
                + Onboard Resident
              </button>
            </div>
            <div style={{ position: 'relative' }}>
              <input placeholder="Search by name or unit number..." value={search} onChange={e => setSearch(e.target.value)} 
                style={{ padding: '16px 20px 16px 48px', border: `1px solid ${TOKENS.border}`, borderRadius: 20, fontSize: 15, width: '100%', outline: 'none', background: '#fff', boxSizing: 'border-box', color: TOKENS.dark, fontWeight: 700, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }} />
              <svg style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', width: 20, height: 20, color: TOKENS.slate }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
          </div>

          {loading && !tenantDetailModal ? (
            <PageLoader message="Retrieving Household Data..." />
          ) : (
            <div className="residents-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
              {filtered.map(t => (
                <div key={t.id} onClick={() => fetchTenantDetails(t)} style={{ background: '#fff', borderRadius: TOKENS.radiusCard, padding: 32, boxShadow: TOKENS.shadow, cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)', border: `1px solid ${TOKENS.border}` }} className="premium-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                    <div>
                      <div style={{ fontWeight: 950, color: TOKENS.dark, fontSize: 18, letterSpacing: -0.5 }}>{t.name}</div>
                      <div style={{ fontSize: 13, color: TOKENS.slate, marginTop: 4, fontWeight: 700 }}>{t.email}</div>
                    </div>
                    <Badge label={t.status} />
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '20px 0', borderTop: `1px solid ${TOKENS.bg}`, borderBottom: `1px solid ${TOKENS.bg}` }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 950, color: TOKENS.slate, textTransform: 'uppercase', letterSpacing: 1 }}>RESIDENCE</div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: TOKENS.primary, marginTop: 6 }}>{t.unit ? `Unit ${t.unit.unit_number}` : 'Unassigned'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 950, color: TOKENS.slate, textTransform: 'uppercase', letterSpacing: 1 }}>BASE RENT</div>
                      <div style={{ fontSize: 14, fontWeight: 950, color: TOKENS.dark, marginTop: 6 }}>₹{Number(t.rent).toLocaleString()}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 12, marginTop: 24 }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => openEdit(t)} style={{ background: TOKENS.bg, color: TOKENS.dark, border: `1px solid ${TOKENS.border}`, borderRadius: 14, padding: '12px', fontSize: 12, fontWeight: 900, flex: 1, cursor: 'pointer' }} className="interactive-btn">Edit Profile</button>
                    {t.status === 'Active' && (
                      <button onClick={() => setReleaseModal(t)} style={{ flex: 1.5, padding: '12px', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 14, fontSize: 12, fontWeight: 900, cursor: 'pointer' }} className="interactive-btn">Release Resident</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {tenantDetailModal && (
        <Modal title={`Resident Profile: ${tenantDetailModal.name}`} onClose={() => setTenantDetailModal(null)} width={900}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 24, background: TOKENS.bg, padding: 28, borderRadius: 24, border: `1px solid ${TOKENS.border}` }}>
            <div><div style={{fontSize:10, fontWeight: 950, color: TOKENS.slate, letterSpacing: 1, marginBottom: 6}}>EMAIL ADDRESS</div><div style={{fontWeight:900, color: TOKENS.dark, fontSize: 15}}>{tenantDetailModal.email}</div></div>
            <div><div style={{fontSize:10, fontWeight: 950, color: TOKENS.slate, letterSpacing: 1, marginBottom: 6}}>CONTACT PHONE</div><div style={{fontWeight:900, color: TOKENS.dark, fontSize: 15}}>{tenantDetailModal.phone || '—'}</div></div>
            <div><div style={{fontSize:10, fontWeight: 950, color: TOKENS.slate, letterSpacing: 1, marginBottom: 6}}>CURRENT UNIT</div><div style={{fontWeight:900, color: TOKENS.primary, fontSize: 15}}>Unit {tenantDetailModal.unit?.unit_number} ({tenantDetailModal.unit?.property?.name})</div></div>
            <div><div style={{fontSize:10, fontWeight: 950, color: TOKENS.slate, letterSpacing: 1, marginBottom: 6}}>SECURITY DEPOSIT</div><div style={{fontWeight:900, color: TOKENS.dark, fontSize: 15}}>₹{tenantDetailModal.deposit?.toLocaleString()}</div></div>
          </div>

          <div style={sectionH}>Financial Ledger</div>
          <div style={{ overflowX: 'auto', borderRadius: 20, border: `1px solid ${TOKENS.border}` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr style={{ textAlign: 'left', background: TOKENS.bg }}>
                  {['Cycle', 'Electricity', 'Water', 'Base Rent', 'Total Due', 'Status'].map(h => <th key={h} style={{ padding: '16px 20px', fontSize: 11, fontWeight: 950, color: TOKENS.slate, textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {tenantDetailModal.bills.length === 0 ? <tr><td colSpan="6" style={{padding:40, textAlign:'center', color: TOKENS.slate, fontWeight:700}}>No past financial activity.</td></tr> :
                 tenantDetailModal.bills.map(b => {
                  const energyUnits = Math.max(0, b.curr_reading - b.prev_reading)
                  let energyBill = energyUnits * b.rate_per_unit
                  if (energyBill < 150) energyBill = 150
                  
                  const payment = tenantDetailModal.payments.find(p => p.bill_id === b.id)
                  const status = payment?.status || (b.balance_due === 0 ? 'Paid' : 'Pending')
                  
                  return (
                    <tr key={b.id} style={{ borderBottom: `1px solid ${TOKENS.border}` }}>
                      <td style={{ padding: '16px 20px', fontWeight: 950, color: TOKENS.dark }}>{b.billing_month}</td>
                      <td style={{ padding: '16px 20px', fontWeight: 800, color: TOKENS.dark }}>₹{energyBill.toLocaleString()} <span style={{fontSize:10, color: TOKENS.primary, fontWeight: 900}}>({energyUnits}u)</span></td>
                      <td style={{ padding: '16px 20px', fontWeight: 800, color: TOKENS.dark }}>₹{parseFloat(b.water_bill || 0).toLocaleString()}</td>
                      <td style={{ padding: '16px 20px', fontWeight: 800, color: TOKENS.dark }}>₹{parseFloat(b.fixed_rent || 0).toLocaleString()}</td>
                      <td style={{ padding: '16px 20px', fontWeight: 950, color: TOKENS.primary, fontSize: 15 }}>₹{b.total_amount.toLocaleString()}</td>
                      <td style={{ padding: '16px 20px' }}>
                        <Badge label={status} />
                      </td>
                    </tr>
                  )
                 })}
              </tbody>
            </table>
          </div>

          <div style={sectionH}>Maintenance Requests</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {tenantDetailModal.maintenance.length === 0 ? <div style={{padding:40, textAlign:'center', color: TOKENS.slate, fontWeight:700, background: TOKENS.bg, borderRadius: 20}}>No maintenance history available.</div> :
             tenantDetailModal.maintenance.map(m => (
              <div key={m.id} style={{ padding: '20px 24px', background: '#fff', border: `1px solid ${TOKENS.border}`, borderRadius: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                <div><div style={{fontWeight:900, fontSize:15, color: TOKENS.dark}}>{m.issue}</div><div style={{fontSize:12, color: TOKENS.slate, fontWeight:700, marginTop: 4}}>{new Date(m.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div></div>
                <Badge label={m.status} />
              </div>
            ))}
          </div>
        </Modal>
      )}

      {modal && (
        <Modal title={modal === 'new' ? 'Onboard New Resident' : 'Edit Resident Details'} onClose={() => setModal(null)}>
          {inp('Full Name', 'name', form, setForm)}
          {inp('Email Address', 'email', form, setForm, 'email')}
          {inp('Contact Phone', 'phone', form, setForm, 'tel')}
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 11, fontWeight: 900, color: TOKENS.slate, display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>SELECT ASSIGNED UNIT</label>
            <select value={form.unit_id} onChange={e => setForm({ ...form, unit_id: e.target.value })} style={{ width: '100%', padding: '14px 16px', border: `2px solid ${TOKENS.border}`, borderRadius: 16, fontSize: 15, color: TOKENS.dark, fontWeight: 700, outline: 'none', transition: '0.2s' }} className="focus-indigo">
              <option value="">— Choose Available Unit —</option>
              {modal !== 'new' && tenants.find(t => t.id === modal.id)?.unit && (
                <option value={tenants.find(t => t.id === modal.id).unit_id}>
                  Current: Unit {tenants.find(t => t.id === modal.id).unit.unit_number}
                </option>
              )}
              {vacantUnits.map(u => <option key={u.id} value={u.id}>Unit {u.unit_number} ({u.property?.name})</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {inp('Monthly Rent (₹)', 'rent', form, setForm, 'number')}
            {inp('Security Deposit (₹)', 'deposit', form, setForm, 'number')}
          </div>
          <div style={{ marginBottom: 32 }}>
            <label style={{ fontSize: 11, fontWeight: 900, color: TOKENS.slate, display: 'block', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>LEASE AGREEMENT</label>
            <div style={{ position: 'relative', background: TOKENS.bg, padding: 20, borderRadius: 16, border: '2px dashed #e2e8f0', textAlign: 'center' }}>
              <input type="file" accept=".pdf" onChange={e => setLeaseFile(e.target.files[0])} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
              <div style={{ color: TOKENS.dark, fontWeight: 800, fontSize: 14 }}>{leaseFile ? leaseFile.name : 'Upload Signed Lease (PDF)'}</div>
            </div>
          </div>
          <button onClick={saveTenant} disabled={saving} style={{ width: '100%', padding: '18px', background: TOKENS.primary, color: '#fff', border: 'none', borderRadius: 18, fontSize: 16, fontWeight: 950, cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(99, 102, 241, 0.3)', transition: '0.2s' }} className="interactive-btn">
            {saving ? 'Processing...' : modal === 'new' ? 'Complete Onboarding' : 'Update Resident'}
          </button>
        </Modal>
      )}

      {releaseModal && (
        <Modal title="Resident Release Settlement" onClose={() => setReleaseModal(null)}>
          <p style={{ fontSize: 15, color: TOKENS.slate, lineHeight: 1.6, marginBottom: 28, fontWeight: 600 }}>Confirm release for <b>{releaseModal.name}</b>? This will free up Unit <b>{releaseModal.unit?.unit_number}</b> for new tenants.</p>
          <div style={{ background: TOKENS.bg, borderRadius: 24, padding: 28, marginBottom: 32, border: `1px solid ${TOKENS.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 14, color: TOKENS.slate, fontWeight: 700 }}><span>Initial Deposit</span><span style={{fontWeight:900, color: TOKENS.dark}}>₹{releaseModal.deposit || 0}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 950, marginTop: 16, paddingTop: 16, borderTop: '2px dashed #e2e8f0', color: TOKENS.dark }}><span>Settlement Refund</span><span style={{color:'#10b981'}}>₹{releaseModal.deposit || 0}</span></div>
          </div>
          <button onClick={handleRelease} disabled={saving} style={{ width: '100%', padding: '18px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 18, fontSize: 16, fontWeight: 950, cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(220, 38, 38, 0.3)', transition: '0.2s' }} className="interactive-btn">Confirm Release & Refund</button>
        </Modal>
      )}

      <style>{`
        @media (max-width: 768px) {
          .main-wrapper { flex-direction: column !important; }
          .tenants-container { padding: 20px 16px !important; }
          .mobile-full-btn { max-width: none !important; width: 100% !important; margin-top: 12px; }
          .residents-grid { grid-template-columns: 1fr !important; }
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
        .interactive-btn:active {
          transform: scale(0.96);
        }
      `}</style>
    </div>
  )
}
