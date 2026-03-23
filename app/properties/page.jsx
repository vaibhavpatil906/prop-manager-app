'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import Sidebar, { TopBar } from '@/app/components/Sidebar'

function Modal({ title, onClose, children, width = 520 }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 28, padding: 32, width: '100%', maxWidth: width, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 950, color: '#0f172a', letterSpacing: -0.5 }}>{title}</h3>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: 12, width: 36, height: 32, cursor: 'pointer', fontSize: 18, color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="interactive-btn">✕</button>
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
    if (!confirm('Delete this property and all its units?')) return
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

  if (!user) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f172a', fontWeight: 950 }}>Loading Assets...</div>

  return (
    <div className="main-wrapper" style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, sans-serif', display: 'flex' }}>
      <Sidebar active="Properties" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        
        <div style={{ padding: '32px 24px', maxWidth: 1200, width: '100%', boxSizing: 'border-box', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 }}>
            <div>
              <h2 style={{ fontSize: 32, fontWeight: 950, color: '#0f172a', margin: 0, letterSpacing: -1.5 }}>Properties</h2>
              <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: 16, fontWeight: 600 }}>Manage your property inventory.</p>
            </div>
            <button onClick={() => { setForm({ name: '', address: '', units: '' }); setModal('new') }}
              style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 16, padding: '14px 28px', fontWeight: 900, cursor: 'pointer', fontSize: 14, boxShadow: '0 10px 15px -3px rgba(99, 102, 241, 0.3)', transition: '0.2s' }} className="interactive-btn">
              + Add Property
            </button>
          </div>

          {loading ? (
            <div style={{textAlign:'center', padding:100, color:'#0f172a', fontWeight: 800}}>
              <div className="skeleton-pulse" style={{ width: 48, height: 48, background: '#e2e8f0', borderRadius: '50%', margin: '0 auto 20px' }} />
              Synchronizing Portfolio...
            </div>
          ) : (
            <div className="properties-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
              {properties.map(p => (
                <div key={p.id} style={{ background: '#fff', borderRadius: 28, padding: 32, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)', border: '1px solid #f1f5f9', transition: 'all 0.2s' }} className="premium-card">
                  <div style={{ fontSize: 40, marginBottom: 24, background: '#f8fafc', width: 72, height: 72, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #f1f5f9' }}>🏠</div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 950, color: '#0f172a', letterSpacing: -0.5 }}>{p.name}</h3>
                  <p style={{ margin: '0 0 28px', fontSize: 14, color: '#64748b', lineHeight: 1.5, fontWeight: 600 }}>{p.address}</p>
                  
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', borderTop: '1px solid #f8fafc', paddingTop: 24 }}>
                    <button onClick={() => { setUnitModal(p); fetchUnits(p.id) }} style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 14, padding: '12px 20px', fontSize: 12, fontWeight: 900, cursor: 'pointer', flex: 1 }} className="interactive-btn">Inventory</button>
                    <button onClick={() => { setForm({ name: p.name, address: p.address, units: p.units }); setModal(p) }} style={{ background: '#f8fafc', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: 14, padding: '12px 20px', fontSize: 12, fontWeight: 900, cursor: 'pointer' }} className="interactive-btn">Edit</button>
                    <button onClick={() => deleteProperty(p.id)} style={{ background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 14, padding: '12px 20px', fontSize: 12, fontWeight: 900, cursor: 'pointer' }} className="interactive-btn">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {modal && (
        <Modal title={modal === 'new' ? 'Create New Property' : 'Edit Property Details'} onClose={() => setModal(null)}>
          {[
            ['Property Name', 'name', 'text', 'e.g. Navasai Heights'],
            ['Physical Address', 'address', 'text', 'Full street address'],
            ['Number of Units', 'units', 'number', '1']
          ].map(([label, key, type, placeholder]) => (
            <div key={key} style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 900, color: '#64748b', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</label>
              <input type={type} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder}
                style={{ width: '100%', padding: '14px 16px', border: '2px solid #f1f5f9', borderRadius: 16, fontSize: 15, boxSizing: 'border-box', color: '#0f172a', fontWeight: 700, outline: 'none', transition: '0.2s' }} className="focus-indigo" />
            </div>
          ))}
          <button onClick={saveProperty} disabled={saving} style={{ width: '100%', padding: '18px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 18, fontSize: 16, fontWeight: 950, cursor: 'pointer', marginTop: 12, boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.3)', transition: '0.2s' }} className="interactive-btn">
            {saving ? 'Processing...' : 'Save Property Assets'}
          </button>
        </Modal>
      )}

      {unitModal && (
        <Modal title={'Unit Inventory - ' + unitModal.name} onClose={() => setUnitModal(null)}>
          <div style={{ marginBottom: 32, padding: 24, background: '#f8fafc', borderRadius: 24, border: '1px solid #f1f5f9' }}>
            <h4 style={{ margin: '0 0 16px', fontSize: 11, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>REGISTER NEW UNIT</h4>
            <div style={{ display: 'flex', gap: 12 }}>
              <input placeholder="Unit #" value={unitForm.unit_number} onChange={e => setUnitForm({ ...unitForm, unit_number: e.target.value })} style={{ flex: 1, padding: '14px', border: '2px solid #fff', borderRadius: 14, fontSize: 14, color: '#0f172a', fontWeight: 700, outline: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }} />
              <input placeholder="Rent" type="number" value={unitForm.rent} onChange={e => setUnitForm({ ...unitForm, rent: e.target.value })} style={{ width: 110, padding: '14px', border: '2px solid #fff', borderRadius: 14, fontSize: 14, color: '#0f172a', fontWeight: 700, outline: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }} />
              <button onClick={saveUnit} style={{ padding: '14px 24px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 14, fontWeight: 950, fontSize: 13, cursor: 'pointer', boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)', transition: '0.2s' }} className="interactive-btn">Add</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {units.map(u => (
              <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: '#fff', border: '1px solid #f1f5f9', borderRadius: 18, boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }} className="hover-lift-subtle">
                <div style={{ fontSize: 15, fontWeight: 900, color: '#0f172a' }}>Unit {u.unit_number} <span style={{ color: '#6366f1', marginLeft: 12, fontWeight: 800 }}>₹{u.rent.toLocaleString()}</span></div>
                <button onClick={() => deleteUnit(u.id)} style={{ color: '#dc2626', background: '#fef2f2', border: 'none', width: 32, height: 32, borderRadius: 10, fontSize: 14, fontWeight: 950, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="interactive-btn">✕</button>
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
        .premium-card:hover {
          transform: translateY(-6px);
          box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1) !important;
          border-color: #6366f130 !important;
        }
        .hover-lift-subtle:hover {
          background: #f8fafc !important;
        }
        .focus-indigo:focus {
          border-color: #6366f1 !important;
          box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1) !important;
        }
        .interactive-btn:active {
          transform: scale(0.96);
        }
        .skeleton-pulse {
          animation: skeleton-animation 1.5s infinite linear;
        }
        @keyframes skeleton-animation {
          0% { opacity: 0.5; }
          50% { opacity: 1; }
          100% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
