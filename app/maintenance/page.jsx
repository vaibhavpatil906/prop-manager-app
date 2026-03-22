'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import Sidebar, { TopBar } from '@/app/components/Sidebar'

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0007', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 32, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px #0003' }}>
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
    Open: { bg: '#fdf2f2', color: '#991b1b', dot: '#ef4444' },
    'In Progress': { bg: '#fff8e6', color: '#92600a', dot: '#f59e0b' },
    Resolved: { bg: '#e8faf0', color: '#1a7a45', dot: '#22c55e' },
  }
  const s = colors[label] || colors.Open
  return (
    <span style={{ background: s.bg, color: s.color, padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} />
      {label}
    </span>
  )
}

function PriorityBadge({ label }) {
  const colors = {
    High: { bg: '#fdf2f2', color: '#991b1b' },
    Medium: { bg: '#fff8e6', color: '#92600a' },
    Low: { bg: '#f0f9ff', color: '#075985' },
  }
  const s = colors[label] || colors.Medium
  return (
    <span style={{ background: s.bg, color: s.color, padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{label}</span>
  )
}

export default function Maintenance() {
  const { user } = useAuth()
  const [requests, setRequests] = useState([])
  const [tenants, setTenants] = useState([])
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('All')
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ tenant_id: '', unit_id: '', issue: '', description: '', priority: 'Medium', status: 'Open' })
  const [sidebarOpen, setSidebarOpen] = useState(false)

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

  useEffect(() => { if (!user?.id) return; fetchAll() }, [user])

  if (!user) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>Loading...</div>

  const openAdd = () => {
    setForm({ tenant_id: '', unit_id: '', issue: '', description: '', priority: 'Medium', status: 'Open' })
    setModal('new')
  }

  const openEdit = (r) => {
    setForm({ tenant_id: r.tenant_id, unit_id: r.unit_id, issue: r.issue, description: r.description || '', priority: r.priority, status: r.status })
    setModal(r)
  }

  const saveRequest = async () => {
    if (!form.issue) return
    setSaving(true)
    try {
      const payload = { ...form, tenant_id: form.tenant_id || null, unit_id: form.unit_id || null }
      if (modal === 'new') {
        const { error } = await supabase.from('maintenance_requests').insert([payload])
        if (error) throw error
      } else {
        const { error } = await supabase.from('maintenance_requests').update(payload).eq('id', modal.id)
        if (error) throw error
      }
      fetchAll()
      setModal(null)
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setSaving(false)
  }

  const deleteRequest = async (id) => {
    if (!confirm('Delete this request?')) return
    await supabase.from('maintenance_requests').delete().eq('id', id)
    fetchAll()
  }

  const updateStatus = async (id, status) => {
    await supabase.from('maintenance_requests').update({ status }).eq('id', id)
    fetchAll()
  }

  const filtered = filter === 'All' ? requests : requests.filter(r => r.status === filter)

  return (
    <div style={{ minHeight: '100vh', background: '#f7f8fc', fontFamily: 'sans-serif' }}>
      <Sidebar active="Maintenance" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <TopBar onMenuClick={() => setSidebarOpen(true)} />
      <div style={{ padding: '24px 16px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e', margin: 0 }}>Maintenance Requests</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            {['All', 'Open', 'In Progress', 'Resolved'].map(s => (
              <button key={s} onClick={() => setFilter(s)}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: filter === s ? '#1a1a2e' : '#fff', color: filter === s ? '#fff' : '#555', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                {s}
              </button>
            ))}
            <button onClick={openAdd}
              style={{ background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
              + Add
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#aaa' }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#aaa' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔧</div>
            <div style={{ fontWeight: 600 }}>No requests found</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map(r => (
              <div key={r.id} style={{ background: '#fff', borderRadius: 14, padding: '18px 24px', boxShadow: '0 1px 4px #0001', border: '1px solid #f0f0f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#1a1a2e', marginBottom: 4 }}>{r.issue}</div>
                    {r.description && <div style={{ fontSize: 13, color: '#888', marginBottom: 6 }}>{r.description}</div>}
                    <div style={{ fontSize: 13, color: '#aaa' }}>
                      {r.tenant?.name || 'Unknown tenant'} · {r.unit ? `Unit ${r.unit.unit_number}, ${r.unit.property?.name}` : 'No unit'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <PriorityBadge label={r.priority} />
                    <Badge label={r.status} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                  {r.status === 'Open' && (
                    <button onClick={() => updateStatus(r.id, 'In Progress')}
                      style={{ background: '#fff8e6', color: '#92600a', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      Mark In Progress
                    </button>
                  )}
                  {r.status === 'In Progress' && (
                    <button onClick={() => updateStatus(r.id, 'Resolved')}
                      style={{ background: '#e8faf0', color: '#1a7a45', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      Mark Resolved
                    </button>
                  )}
                  <button onClick={() => openEdit(r)}
                    style={{ background: '#f0f9ff', color: '#075985', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    Edit
                  </button>
                  <button onClick={() => deleteRequest(r.id)}
                    style={{ background: '#fdf2f2', color: '#991b1b', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <Modal title={modal === 'new' ? 'Add Request' : 'Edit Request'} onClose={() => setModal(null)}>
          {[['Issue Title', 'issue'], ['Description', 'description']].map(([label, key]) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 5 }}>{label}</label>
              <input value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
            </div>
          ))}

          {[['Tenant', 'tenant_id', tenants.map(t => ({ value: t.id, label: t.name }))],
            ['Unit', 'unit_id', units.map(u => ({ value: u.id, label: `${u.unit_number} (${u.property?.name})` }))],
            ['Priority', 'priority', ['Low', 'Medium', 'High'].map(v => ({ value: v, label: v }))],
            ['Status', 'status', ['Open', 'In Progress', 'Resolved'].map(v => ({ value: v, label: v }))]
          ].map(([label, key, options]) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 5 }}>{label}</label>
              <select value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14 }}>
                <option value="">— Select —</option>
                {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          ))}

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={saveRequest} disabled={saving}
              style={{ flex: 1, padding: 12, background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>
              {saving ? 'Saving...' : modal === 'new' ? 'Add Request' : 'Save Changes'}
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