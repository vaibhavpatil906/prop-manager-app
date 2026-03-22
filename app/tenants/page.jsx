'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import Sidebar, { TopBar } from '@/app/components/Sidebar'

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0007', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 32, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px #0003' }}>
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
    Active: { bg: '#e8faf0', color: '#1a7a45', dot: '#22c55e' },
    Late: { bg: '#fdf2f2', color: '#991b1b', dot: '#ef4444' },
    Inactive: { bg: '#f5f5f5', color: '#888', dot: '#ccc' },
  }
  const s = colors[label] || colors.Inactive
  return (
    <span style={{ background: s.bg, color: s.color, padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
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
  const [leasesModal, setLeasesModal] = useState(null)
  const [leaseFile, setLeaseFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', unit_id: '', lease_start: '', lease_end: '', rent: '', status: 'Active' })
  const [sidebarOpen, setSidebarOpen] = useState(false)

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

  useEffect(() => { if (!user?.id) return; fetchAll() }, [user])

  if (!user) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>Loading...</div>

  const openAdd = () => {
    setForm({ name: '', email: '', phone: '', unit_id: '', lease_start: '', lease_end: '', rent: '', status: 'Active' })
    setLeaseFile(null)
    setModal('new')
  }

  const openEdit = (t) => {
    setForm({ name: t.name, email: t.email, phone: t.phone || '', unit_id: t.unit_id || '', lease_start: t.lease_start || '', lease_end: t.lease_end || '', rent: t.rent || '', status: t.status })
    setLeaseFile(null)
    setModal(t)
  }

  const saveTenant = async () => {
    if (!form.name || !form.email) return
    setSaving(true)
    try {
      const payload = { ...form, user_id: user.id, rent: parseFloat(form.rent) || null, unit_id: form.unit_id || null }
      let tenantId = modal?.id

      if (modal === 'new') {
        const { data, error } = await supabase.from('tenants').insert([payload]).select().single()
        if (error) throw error
        tenantId = data.id
      } else {
        const { error } = await supabase.from('tenants').update(payload).eq('id', modal.id)
        if (error) throw error
      }

      // Upload lease file if selected
      if (leaseFile && tenantId) {
        const ext = leaseFile.name.split('.').pop()
        const path = `${user.id}/${tenantId}/${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage.from('leases').upload(path, leaseFile)
        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage.from('leases').getPublicUrl(path)
          await supabase.from('leases').insert([{
            tenant_id: tenantId,
            unit_id: form.unit_id || null,
            file_url: publicUrl,
            file_name: leaseFile.name,
            start_date: form.lease_start || null,
            end_date: form.lease_end || null,
            rent: parseFloat(form.rent) || null,
            status: 'Active'
          }])
        }
      }

      if (form.unit_id) {
        await supabase.from('units').update({ status: 'Occupied' }).eq('id', form.unit_id)
      }

      fetchAll()
      setModal(null)
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setSaving(false)
  }

  const deleteTenant = async (id) => {
    if (!confirm('Delete this tenant?')) return
    await supabase.from('tenants').delete().eq('id', id)
    fetchAll()
  }

  const filtered = tenants.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.email.toLowerCase().includes(search.toLowerCase())
  )

  const inp = (label, key, type = 'text') => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 5 }}>{label}</label>
      <input type={type} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}
        style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f7f8fc', fontFamily: 'sans-serif' }}>
      <Sidebar active="Tenants" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <TopBar onMenuClick={() => setSidebarOpen(true)} />
      <div style={{ padding: '24px 16px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e', margin: 0 }}>Tenants</h2>
          <div style={{ display: 'flex', gap: 10 }}>
            <input placeholder="Search tenants..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ padding: '10px 16px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14, width: 220, outline: 'none' }} />
            <button onClick={openAdd}
              style={{ background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
              + Add Tenant
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#aaa' }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#aaa' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>👥</div>
            <div style={{ fontWeight: 600 }}>No tenants yet</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Click "Add Tenant" to get started</div>
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 1px 4px #0001', border: '1px solid #f0f0f0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Tenant', 'Unit', 'Rent', 'Lease End', 'Status', 'Docs', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#888' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id} style={{ borderTop: '1px solid #f5f5f5' }}>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: 700, color: '#1a1a2e', fontSize: 14 }}>{t.name}</div>
                      <div style={{ fontSize: 12, color: '#aaa' }}>{t.email}</div>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: 13, color: '#555' }}>
                      {t.unit ? `${t.unit.unit_number} - ${t.unit.property?.name}` : '—'}
                    </td>
                    <td style={{ padding: '14px 16px', fontWeight: 700, color: '#1a1a2e' }}>
                      {t.rent ? `$${Number(t.rent).toLocaleString()}/mo` : '—'}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: 13, color: '#555' }}>{t.lease_end || '—'}</td>
                    <td style={{ padding: '14px 16px' }}><Badge label={t.status} /></td>
                    <td style={{ padding: '14px 16px' }}>
                      <button onClick={() => setLeasesModal(t)}
                        style={{ background: '#f0f0ff', color: '#6366f1', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        Docs ({leases.filter(l => l.tenant_id === t.id).length})
                      </button>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => openEdit(t)}
                          style={{ background: '#f0f9ff', color: '#075985', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          Edit
                        </button>
                        <button onClick={() => deleteTenant(t.id)}
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

      {/* Add/Edit Tenant Modal */}
      {modal && (
        <Modal title={modal === 'new' ? 'Add Tenant' : 'Edit Tenant'} onClose={() => setModal(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            {inp('Full Name', 'name')}
            {inp('Email', 'email', 'email')}
            {inp('Phone', 'phone', 'tel')}
            {inp('Monthly Rent ($)', 'rent', 'number')}
            {inp('Lease Start', 'lease_start', 'date')}
            {inp('Lease End', 'lease_end', 'date')}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 5 }}>Unit</label>
            <select value={form.unit_id} onChange={e => setForm({ ...form, unit_id: e.target.value })}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14 }}>
              <option value="">— No unit assigned —</option>
              {units.map(u => (
                <option key={u.id} value={u.id}>{u.unit_number} ({u.property?.name})</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 5 }}>Status</label>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14 }}>
              {['Active', 'Late', 'Inactive'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 5 }}>Lease Document (PDF)</label>
            <input type="file" accept=".pdf,.doc,.docx" onChange={e => setLeaseFile(e.target.files[0])}
              style={{ width: '100%', padding: '10px 12px', border: '1px dashed #e5e7eb', borderRadius: 8, fontSize: 13, boxSizing: 'border-box', background: '#fafafa' }} />
            {leaseFile && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#6366f1' }}>Selected: {leaseFile.name}</p>}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={saveTenant} disabled={saving}
              style={{ flex: 1, padding: 12, background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>
              {saving ? 'Saving...' : modal === 'new' ? 'Add Tenant' : 'Save Changes'}
            </button>
            <button onClick={() => setModal(null)}
              style={{ padding: '12px 20px', background: '#f5f5f5', color: '#555', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* Lease Documents Modal */}
      {leasesModal && (
        <Modal title={'Documents - ' + leasesModal.name} onClose={() => setLeasesModal(null)}>
          {leases.filter(l => l.tenant_id === leasesModal.id).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#aaa' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
              <div>No documents uploaded yet</div>
            </div>
          ) : leases.filter(l => l.tenant_id === leasesModal.id).map(l => (
            <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f5f5f5' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#1a1a2e' }}>{l.file_name}</div>
                <div style={{ fontSize: 12, color: '#aaa' }}>{l.start_date} to {l.end_date}</div>
              </div>
              <a href={l.file_url} target="_blank" rel="noreferrer"
                style={{ background: '#1a1a2e', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
                Download
              </a>
            </div>
          ))}
        </Modal>
      )}
    </div>
  )
}