'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import Sidebar, { TopBar } from '@/app/components/Sidebar'

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0007', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 32, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px #0003', margin: '0 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#1a1a2e' }}>{title}</h3>
          <button onClick={onClose} style={{ background: '#f5f5f5', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 16 }}>x</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function Properties() {
  const { user } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [unitModal, setUnitModal] = useState(null)
  const [form, setForm] = useState({ name: '', address: '', units: '' })
  const [unitForm, setUnitForm] = useState({ unit_number: '', rent: '' })
  const [units, setUnits] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user?.id) return
    fetchProperties()
  }, [user])

  const fetchProperties = async () => {
    if (!user?.id) return
    setLoading(true)
    const { data } = await supabase.from('properties').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    setProperties(data || [])
    setLoading(false)
  }

  const fetchUnits = async (propertyId) => {
    const { data } = await supabase.from('units').select('*').eq('property_id', propertyId).order('unit_number')
    setUnits(data || [])
  }

  const saveProperty = async () => {
    if (!form.name || !form.address || !user?.id) return
    setSaving(true)
    if (modal?.id) {
      await supabase.from('properties').update({ name: form.name, address: form.address }).eq('id', modal.id)
    } else {
      await supabase.from('properties').insert([{ name: form.name, address: form.address, units: parseInt(form.units) || 1, user_id: user.id }])
    }
    setSaving(false)
    setModal(null)
    fetchProperties()
  }

  const deleteProperty = async (id) => {
    if (!confirm('Delete this property and all its units?')) return
    await supabase.from('properties').delete().eq('id', id)
    fetchProperties()
  }

  const saveUnit = async () => {
    if (!unitForm.unit_number || !unitForm.rent) return
    setSaving(true)
    await supabase.from('units').insert([{ unit_number: unitForm.unit_number, rent: parseFloat(unitForm.rent), property_id: unitModal.id }])
    setSaving(false)
    setUnitForm({ unit_number: '', rent: '' })
    fetchUnits(unitModal.id)
  }

  const deleteUnit = async (unitId) => {
    if (!confirm('Delete this unit?')) return
    await supabase.from('units').delete().eq('id', unitId)
    fetchUnits(unitModal.id)
  }

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', background: '#f7f8fc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#aaa', fontSize: 14 }}>Loading...</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f7f8fc', fontFamily: 'sans-serif' }}>
      <Sidebar active="Properties" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <TopBar onMenuClick={() => setSidebarOpen(true)} />
      <div style={{ padding: '24px 16px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e', margin: 0 }}>Properties</h2>
          <button onClick={() => { setForm({ name: '', address: '', units: '' }); setModal('new') }}
            style={{ background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
            + Add
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#aaa' }}>Loading...</div>
        ) : properties.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#aaa' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🏠</div>
            <div style={{ fontWeight: 600 }}>No properties yet</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Click Add to get started</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {properties.map(p => (
              <div key={p.id} style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 4px #0001', border: '1px solid #f0f0f0' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🏠</div>
                <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: '#1a1a2e' }}>{p.name}</h3>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: '#888' }}>{p.address}</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => { setUnitModal(p); fetchUnits(p.id) }}
                    style={{ background: '#f0f9ff', color: '#075985', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Units
                  </button>
                  <button onClick={() => { setForm({ name: p.name, address: p.address, units: p.units }); setModal(p) }}
                    style={{ background: '#f5f5f5', color: '#555', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Edit
                  </button>
                  <button onClick={() => deleteProperty(p.id)}
                    style={{ background: '#fdf2f2', color: '#991b1b', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <Modal title={modal === 'new' ? 'Add Property' : 'Edit Property'} onClose={() => setModal(null)}>
          {[['Property Name', 'name'], ['Address', 'address'], ['Number of Units', 'units']].map(([label, key]) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 5 }}>{label}</label>
              <input value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={saveProperty} disabled={saving}
              style={{ flex: 1, padding: 12, background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>
              {saving ? 'Saving...' : modal === 'new' ? 'Add Property' : 'Save Changes'}
            </button>
            <button onClick={() => setModal(null)}
              style={{ padding: '12px 20px', background: '#f5f5f5', color: '#555', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {unitModal && (
        <Modal title={'Units - ' + unitModal.name} onClose={() => setUnitModal(null)}>
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#555' }}>Add New Unit</h4>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input placeholder="Unit no. (e.g. 2A)" value={unitForm.unit_number} onChange={e => setUnitForm({ ...unitForm, unit_number: e.target.value })}
                style={{ flex: 1, minWidth: 100, padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14 }} />
              <input placeholder="Rent ($)" type="number" value={unitForm.rent} onChange={e => setUnitForm({ ...unitForm, rent: e.target.value })}
                style={{ width: 100, padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14 }} />
              <button onClick={saveUnit} disabled={saving}
                style={{ padding: '10px 16px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
                Add
              </button>
            </div>
          </div>
          <div>
            <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#555' }}>Existing Units</h4>
            {units.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: '#aaa', fontSize: 13 }}>No units yet</div>
            ) : units.map(u => (
              <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}>
                <div>
                  <span style={{ fontWeight: 700, color: '#1a1a2e' }}>Unit {u.unit_number}</span>
                  <span style={{ marginLeft: 12, fontSize: 13, color: '#888' }}>${Number(u.rent).toLocaleString()}/mo</span>
                  <span style={{ marginLeft: 8, fontSize: 12, color: u.status === 'Occupied' ? '#16a34a' : '#d97706', fontWeight: 600 }}>{u.status}</span>
                </div>
                <button onClick={() => deleteUnit(u.id)}
                  style={{ background: '#fdf2f2', color: '#991b1b', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}