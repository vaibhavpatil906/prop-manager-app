'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import Sidebar, { TopBar } from '@/app/components/Sidebar'

export default function Settings() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profile, setProfile] = useState({
    business_name: '',
    business_address: '',
    business_logo: '',
    contact_number: ''
  })

  useEffect(() => {
    if (user?.id) fetchProfile()
  }, [user])

  const fetchProfile = async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (data) setProfile(data)
    setLoading(false)
  }

  const saveProfile = async () => {
    setSaving(true)
    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      ...profile,
      updated_at: new Date()
    })
    if (error) alert(error.message)
    else alert('Branding updated successfully!')
    setSaving(false)
  }

  const labelS = { fontSize: 11, fontWeight: 900, color: '#000', display: 'block', marginBottom: 6, textTransform: 'uppercase' }
  const inputS = { width: '100%', padding: '12px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', outline: 'none', marginBottom: 20, color: '#000', fontWeight: 700 }

  if (!user) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontWeight: 800 }}>Loading...</div>

  return (
    <div className="main-wrapper" style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, sans-serif', display: 'flex' }}>
      <Sidebar active="Settings" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        
        <div style={{ padding: '24px 16px', maxWidth: 600, width: '100%', boxSizing: 'border-box', margin: '0 auto' }}>
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 24, fontWeight: 950, color: '#000', margin: 0 }}>Settings</h2>
            <p style={{ color: '#000', fontSize: 14, marginTop: 4, fontWeight: 600 }}>Configure your business details for invoices</p>
          </div>

          {loading ? <div style={{textAlign:'center', padding:60, color:'#000', fontWeight: 800}}>Loading...</div> : (
            <div style={{ background: '#fff', borderRadius: 24, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
              
              <label style={labelS}>Business Name</label>
              <input value={profile.business_name} onChange={e => setProfile({...profile, business_name: e.target.value})} placeholder="e.g. Patil Properties" style={inputS} />

              <label style={labelS}>Business Address</label>
              <textarea value={profile.business_address} onChange={e => setProfile({...profile, business_address: e.target.value})} placeholder="Full address" style={{ ...inputS, height: 100, resize: 'none', fontFamily: 'inherit' }} />

              <label style={labelS}>Contact Number</label>
              <input value={profile.contact_number} onChange={e => setProfile({...profile, contact_number: e.target.value})} placeholder="+91 ..." style={inputS} />

              <label style={labelS}>UPI ID (for Payments)</label>
              <input value={profile.upi_id || ''} onChange={e => setProfile({...profile, upi_id: e.target.value})} placeholder="yourname@okaxis" style={inputS} />

              <label style={labelS}>Logo URL</label>
              <input value={profile.business_logo} onChange={e => setProfile({...profile, business_logo: e.target.value})} placeholder="https://..." style={inputS} />

              <div style={{ background: '#f8fafc', padding: 20, borderRadius: 16, marginBottom: 32, border: '1px dashed #e2e8f0' }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: '#6366f1', marginBottom: 12 }}>INVOICE PREVIEW</div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 8, background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, overflow: 'hidden' }}>
                    {profile.business_logo ? <img src={profile.business_logo} style={{width:'100%', height:'100%', objectFit:'cover'}} /> : '🏘️'}
                  </div>
                  <div>
                    <div style={{ fontWeight: 950, fontSize: 15, color: '#000' }}>{profile.business_name || 'Business Name'}</div>
                    <div style={{ fontSize: 11, color: '#000', fontWeight: 700 }}>{profile.business_address || 'Address'}</div>
                  </div>
                </div>
              </div>

              <button onClick={saveProfile} disabled={saving} style={{ width: '100%', padding: '16px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 900, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving...' : 'Save Branding Changes'}
              </button>
            </div>
          )}
        </div>
      </div>
      <style>{`
        @media (max-width: 768px) {
          .main-wrapper { flex-direction: column !important; }
        }
      `}</style>
    </div>
  )
}
