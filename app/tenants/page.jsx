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
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 950, color: '#000' }}>{title}</h3>
          <button onClick={onClose} style={{ background: '#f5f5f5', border: 'none', borderRadius: 12, width: 32, height: 32, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000' }}>✕</button>
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
    Inactive: { bg: '#f5f5f5', color: '#000', dot: '#000' },
    Paid: { bg: '#ecfdf5', color: '#059669', dot: '#10b981' },
    Pending: { bg: '#fffbeb', color: '#d97706', dot: '#f59e0b' },
    Open: { bg: '#fef2f2', color: '#dc2626', dot: '#ef4444' },
    'In Progress': { bg: '#eff6ff', color: '#2563eb', dot: '#3b82f6' },
    Resolved: { bg: '#ecfdf5', color: '#059669', dot: '#10b981' },
  }
  const s = colors[label] || { bg: '#f5f5f5', color: '#000', dot: '#000' }
  return (
    <span style={{ background: s.bg, color: s.color, padding: '4px 12px', borderRadius: 20, fontSize: 10, fontWeight: 950, display: 'inline-flex', alignItems: 'center', gap: 5, textTransform: 'uppercase' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot }} />
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
  const filtered = tenants.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))

  const inp = (label, key, state, setState, type = 'text') => (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 11, fontWeight: 950, color: '#000', display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>{label}</label>
      <input type={type} value={state[key]} onChange={e => setState({ ...state, [key]: e.target.value })}
        style={{ width: '100%', padding: '12px 14px', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 14, boxSizing: 'border-box', outline: 'none', color: '#000', fontWeight: 800 }} />
    </div>
  )

  if (!user) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontWeight: 950 }}>Loading...</div>

  const sectionH = { fontSize: 13, fontWeight: 950, color: '#000', borderBottom: '2px solid #6366f1', width: 'fit-content', paddingBottom: 2, marginBottom: 16, marginTop: 24, textTransform: 'uppercase' }

  return (
    <div className="main-wrapper" style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, sans-serif', display: 'flex' }}>
      <Sidebar active="Tenants" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        
        <div style={{ padding: '24px 16px', maxWidth: 1100, width: '100%', boxSizing: 'border-box', margin: '0 auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 24, fontWeight: 950, color: '#0f172a', margin: 0 }}>Residents</h2>
              <button onClick={openAdd} 
                style={{ background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 24px', fontWeight: 950, cursor: 'pointer', fontSize: 13 }}>
                + Onboard
              </button>
            </div>
            <input placeholder="Search residents..." value={search} onChange={e => setSearch(e.target.value)} 
              style={{ padding: '12px 16px', border: '1px solid #e2e8f0', borderRadius: 14, fontSize: 14, width: '100%', outline: 'none', background: '#fff', boxSizing: 'border-box', color: '#000', fontWeight: 800 }} />
          </div>

          {loading && !tenantDetailModal ? <div style={{textAlign:'center', padding:60, color:'#000', fontWeight: 950}}>Fetching residents...</div> : (
            <div className="residents-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {filtered.map(t => (
                <div key={t.id} onClick={() => fetchTenantDetails(t)} style={{ background: '#fff', borderRadius: 20, padding: 20, border: '1px solid #f1f5f9', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', cursor: 'pointer', transition: '0.2s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <div>
                      <div style={{ fontWeight: 950, color: '#0f172a', fontSize: 16 }}>{t.name}</div>
                      <div style={{ fontSize: 12, color: '#000', marginTop: 2, fontWeight: 800 }}>{t.email}</div>
                    </div>
                    <Badge label={t.status} />
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '16px 0', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0' }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 950, color: '#000', textTransform: 'uppercase' }}>Assigned Unit</div>
                      <div style={{ fontSize: 13, fontWeight: 900, color: '#6366f1', marginTop: 4 }}>{t.unit ? `Unit ${t.unit.unit_number}` : 'N/A'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 950, color: '#000', textTransform: 'uppercase' }}>Monthly Rent</div>
                      <div style={{ fontSize: 13, fontWeight: 950, color: '#0f172a', marginTop: 4 }}>${Number(t.rent).toLocaleString()}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginTop: 16 }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setLeasesModal(t)} style={{ background: '#f8fafc', color: '#000', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px', fontSize: 12, fontWeight: 950, flex: 1, cursor: 'pointer' }}>Docs</button>
                    <button onClick={() => openEdit(t)} style={{ background: '#f0f9ff', color: '#075985', border: 'none', borderRadius: 10, padding: '10px', fontSize: 12, fontWeight: 950, flex: 1, cursor: 'pointer' }}>Edit</button>
                    {t.status === 'Active' && (
                      <button onClick={() => setReleaseModal(t)} style={{ flex: 1.5, padding: '10px', background: '#fff1f2', color: '#be123c', border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 950, cursor: 'pointer' }}>Release Resident</button>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, background: '#f8fafc', padding: 20, borderRadius: 20, border: '1px solid #f1f5f9' }}>
            <div><div style={{fontSize:10, fontWeight: 950, color:'#000'}}>EMAIL</div><div style={{fontWeight:950, color:'#000'}}>{tenantDetailModal.email}</div></div>
            <div><div style={{fontSize:10, fontWeight: 950, color:'#000'}}>PHONE</div><div style={{fontWeight:950, color:'#000'}}>{tenantDetailModal.phone || '—'}</div></div>
            <div><div style={{fontSize:10, fontWeight: 950, color:'#000'}}>UNIT</div><div style={{fontWeight:950, color:'#6366f1'}}>Unit {tenantDetailModal.unit?.unit_number} ({tenantDetailModal.unit?.property?.name})</div></div>
            <div><div style={{fontSize:10, fontWeight: 950, color:'#000'}}>DEPOSIT</div><div style={{fontWeight:950, color:'#000'}}>${tenantDetailModal.deposit?.toLocaleString()}</div></div>
          </div>

          <div style={sectionH}>Utility Billing History</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #f0f0f0' }}>
                  {['Month', 'Electricity', 'Water', 'Rent', 'Total', 'Status'].map(h => <th key={h} style={{ padding: '12px 8px', fontSize: 11, fontWeight: 950, color: '#000' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {tenantDetailModal.bills.length === 0 ? <tr><td colSpan="6" style={{padding:20, textAlign:'center', color:'#000', fontWeight:950}}>No bills found.</td></tr> :
                 tenantDetailModal.bills.map(b => {
                  const energyUnits = b.curr_reading - b.prev_reading
                  let energyBill = energyUnits * b.rate_per_unit
                  if (energyBill > 0 && energyBill < 150) energyBill = 150
                  return (
                    <tr key={b.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '12px 8px', fontWeight: 950, color: '#000' }}>{b.billing_month}</td>
                      <td style={{ padding: '12px 8px', fontWeight: 900, color: '#000' }}>${energyBill.toLocaleString()} <span style={{fontSize:10, color:'#6366f1', fontWeight: 950}}>({energyUnits}u)</span></td>
                      <td style={{ padding: '12px 8px', fontWeight: 900, color: '#000' }}>${parseFloat(b.water_bill || 0).toLocaleString()}</td>
                      <td style={{ padding: '12px 8px', fontWeight: 900, color: '#000' }}>${parseFloat(b.fixed_rent || 0).toLocaleString()}</td>
                      <td style={{ padding: '12px 8px', fontWeight: 950, color:'#6366f1' }}>${b.total_amount.toLocaleString()}</td>
                      <td style={{ padding: '12px 8px' }}>
                        <Badge label={tenantDetailModal.payments.find(p => p.due_date === b.due_date && Math.abs(Number(p.amount) - Number(b.total_amount)) < 1)?.status || 'Pending'} />
                      </td>
                    </tr>
                  )
                 })}
              </tbody>
            </table>
          </div>

          <div style={sectionH}>Recent Maintenance</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tenantDetailModal.maintenance.length === 0 ? <div style={{padding:20, textAlign:'center', color:'#000', fontWeight:950}}>No requests found.</div> :
             tenantDetailModal.maintenance.map(m => (
              <div key={m.id} style={{ padding: '12px 16px', background: '#fff', border: '1px solid #f1f5f9', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div><div style={{fontWeight:950, fontSize:14, color:'#000'}}>{m.issue}</div><div style={{fontSize:11, color:'#000', fontWeight: 900}}>{new Date(m.created_at).toLocaleDateString()}</div></div>
                <Badge label={m.status} />
              </div>
            ))}
          </div>
        </Modal>
      )}

      {modal && (
        <Modal title="Onboarding" onClose={() => setModal(null)}>
          {inp('Full Name', 'name', form, setForm)}
          {inp('Email', 'email', form, setForm, 'email')}
          {inp('Phone', 'phone', form, setForm, 'tel')}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 950, color: '#000', display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>SELECT UNIT</label>
            <select value={form.unit_id} onChange={e => setForm({ ...form, unit_id: e.target.value })} style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 14, color: '#000', fontWeight: 800 }}>
              <option value="">— Choose Unit —</option>
              {modal !== 'new' && tenants.find(t => t.id === modal.id)?.unit && (
                <option value={tenants.find(t => t.id === modal.id).unit_id}>
                  Current: Unit {tenants.find(t => t.id === modal.id).unit.unit_number}
                </option>
              )}
              {vacantUnits.map(u => <option key={u.id} value={u.id}>Unit {u.unit_number} ({u.property?.name})</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {inp('Rent ($)', 'rent', form, setForm, 'number')}
            {inp('Deposit ($)', 'deposit', form, setForm, 'number')}
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 11, fontWeight: 950, color: '#000', display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>LEASE AGREEMENT</label>
            <input type="file" accept=".pdf" onChange={e => setLeaseFile(e.target.files[0])} style={{ fontSize: 12, color: '#000', fontWeight: 800 }} />
          </div>
          <button onClick={saveTenant} disabled={saving} style={{ width: '100%', padding: '14px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 950, cursor: 'pointer' }}>
            {saving ? 'Saving...' : modal === 'new' ? 'Complete Onboarding' : 'Save Changes'}
          </button>
        </Modal>
      )}

      {releaseModal && (
        <Modal title="Release" onClose={() => setReleaseModal(null)}>
          <p style={{ fontSize: 14, color: '#000', lineHeight: 1.5, marginBottom: 20, fontWeight: 800 }}>Setting <b>{releaseModal.name}</b> to Inactive and marking Unit <b>{releaseModal.unit?.unit_number}</b> as Vacant.</p>
          <div style={{ background: '#f8fafc', borderRadius: 16, padding: 20, marginBottom: 20, border: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, color: '#000', fontWeight: 950 }}><span>Initial Deposit</span><span style={{fontWeight:950}}>${releaseModal.deposit || 0}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 950, marginTop: 12, paddingTop: 12, borderTop: '1px dashed #f1f5f9', color: '#000' }}><span>Refund</span><span style={{color:'#10b981'}}>${releaseModal.deposit || 0}</span></div>
          </div>
          <button onClick={handleRelease} disabled={saving} style={{ width: '100%', padding: '14px', background: '#be123c', color: '#fff', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 950, cursor: 'pointer' }}>Confirm Release</button>
        </Modal>
      )}

      {leasesModal && (
        <Modal title="Resident Documents" onClose={() => setLeasesModal(null)}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 950, color: '#1a1a2e' }}>{leasesModal.name}</div>
            <div style={{ fontSize: 13, color: '#000', fontWeight: 900 }}>Unit {leasesModal.unit?.unit_number}</div>
          </div>
          {leases.filter(l => l.tenant_id === leasesModal.id).length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#000', fontWeight: 950 }}>No documents uploaded.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {leases.filter(l => l.tenant_id === leasesModal.id).map(l => (
                <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, background: '#f8fafc', borderRadius: 16, border: '1px solid #f1f5f9' }}>
                  <div style={{ fontWeight: 950, fontSize: 14, color: '#1a1a2e' }}>{l.file_name}</div>
                  <a href={l.file_url} target="_blank" rel="noreferrer" style={{ background: '#1a1a2e', color: '#fff', padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 950, textDecoration: 'none' }}>View</a>
                </div>
              ))}
            </div>
          )}
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
