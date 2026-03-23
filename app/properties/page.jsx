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
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#000' }}>{title}</h3>
          <button onClick={onClose} style={{ background: '#f5f5f5', border: 'none', borderRadius: 12, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#000' }}>✕</button>
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

  useEffect(() => { if (user?.id) fetchProperties() }, [user])

  const fetchProperties = async () => {
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
    if (!form.name || !form.address) return
    setSaving(true)
    if (modal?.id) {
      await supabase.from('properties').update({ name: form.name, address: form.address }).eq('id', modal.id)
    } else {
      await supabase.from('properties').insert([{ name: form.name, address: form.address, units: parseInt(form.units) || 1, user_id: user.id }])
    }
    setSaving(false); setModal(null); fetchProperties()
  }

  const deleteProperty = async (id) => {
    if (!confirm('Delete this property?')) return
    await supabase.from('properties').delete().eq('id', id)
    fetchProperties()
  }

  const saveUnit = async () => {
    if (!unitForm.unit_number || !unitForm.rent) return
    setSaving(true)
    await supabase.from('units').insert([{ unit_number: unitForm.unit_number, rent: parseFloat(unitForm.rent), property_id: unitModal.id }])
    setSaving(false); setUnitForm({ unit_number: '', rent: '' }); fetchUnits(unitModal.id)
  }

  const deleteUnit = async (unitId) => {
    if (!confirm('Delete unit?')) return
    await supabase.from('units').delete().eq('id', unitId)
    fetchUnits(unitModal.id)
  }

  if (!user) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontWeight: 800 }}>Loading...</div>

  return (
    <div className="main-wrapper" style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, sans-serif', display: 'flex' }}>
      <Sidebar active="Properties" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        
        <div style={{ padding: '24px 16px', maxWidth: 1100, width: '100%', boxSizing: 'border-box', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
            <h2 style={{ fontSize: 24, fontWeight: 950, color: '#000', margin: 0 }}>Properties</h2>
            <button onClick={() => { setForm({ name: '', address: '', units: '' }); setModal('new') }}
              style={{ background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 24px', fontWeight: 900, cursor: 'pointer', fontSize: 13 }}>
              + Add
            </button>
          </div>

          {loading ? <div style={{textAlign:'center', padding:60, color:'#000', fontWeight: 800}}>Loading...</div> : (
            <div className="properties-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {properties.map(p => (
                <div key={p.id} style={{ background: '#fff', borderRadius: 20, padding: 24, boxShadow: '0 2px 4px rgba(0,0,0,0.02)', border: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: 36, marginBottom: 16 }}>🏠</div>
                  <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 950, color: '#000' }}>{p.name}</h3>
                  <p style={{ margin: '0 0 20px', fontSize: 14, color: '#000', lineHeight: 1.4, fontWeight: 600 }}>{p.address}</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
                    <button onClick={() => { setUnitModal(p); fetchUnits(p.id) }} style={{ background: '#f0f9ff', color: '#075985', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 16px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Units</button>
                    <button onClick={() => { setForm({ name: p.name, address: p.address, units: p.units }); setModal(p) }} style={{ background: '#f8fafc', color: '#000', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 16px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Edit</button>
                    <button onClick={() => deleteProperty(p.id)} style={{ background: '#fff1f2', color: '#be123c', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 16px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {modal && (
        <Modal title={modal === 'new' ? 'Add Property' : 'Edit Property'} onClose={() => setModal(null)}>
          {[
            ['Property Name', 'name', 'text'],
            ['Address', 'address', 'text'],
            ['Number of Units', 'units', 'number']
          ].map(([label, key, type]) => (
            <div key={key} style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 900, color: '#000', display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>{label}</label>
              <input type={type} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}
                style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 14, boxSizing: 'border-box', color: '#000', fontWeight: 700 }} />
            </div>
          ))}
          <button onClick={saveProperty} disabled={saving} style={{ width: '100%', padding: '14px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 950, cursor: 'pointer', marginTop: 10 }}>Save Property</button>
        </Modal>
      )}

      {unitModal && (
        <Modal title={'Units - ' + unitModal.name} onClose={() => setUnitModal(null)}>
          <div style={{ marginBottom: 24, padding: 16, background: '#f8fafc', borderRadius: 16, border: '1px solid #f1f5f9' }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 950, color: '#000' }}>ADD UNIT</h4>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input placeholder="Unit #" value={unitForm.unit_number} onChange={e => setUnitForm({ ...unitForm, unit_number: e.target.value })} style={{ flex: 1, minWidth: 80, padding: '10px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, color: '#000', fontWeight: 700 }} />
              <input placeholder="Rent" type="number" value={unitForm.rent} onChange={e => setUnitForm({ ...unitForm, rent: e.target.value })} style={{ width: 80, padding: '10px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, color: '#000', fontWeight: 700 }} />
              <button onClick={saveUnit} style={{ padding: '10px 16px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 900 }}>Add</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {units.map(u => (
              <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#fff', border: '1px solid #f1f5f9', borderRadius: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#000' }}>Unit {u.unit_number} <span style={{ color: '#6366f1', marginLeft: 8, fontWeight: 800 }}>₹{u.rent}</span></div>
                <button onClick={() => deleteUnit(u.id)} style={{ color: '#be123c', background: 'none', border: 'none', fontSize: 14, fontWeight: 950 }}>✕</button>
              </div>
            ))}
          </div>
        </Modal>
      )}
      <style>{`
        @media (max-width: 768px) {
          .main-wrapper { flex-direction: column !important; }
          .properties-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
