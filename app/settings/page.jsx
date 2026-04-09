'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import Sidebar, { TopBar, PageLoader } from '@/app/components/Sidebar'

export default function Settings() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profile, setProfile] = useState({
    business_name: '',
    business_address: '',
    business_logo: '',
    contact_number: '',
    additional_number: '',
    upi_id: '',
    first_name: '',
    last_name: ''
  })

  useEffect(() => {
    if (user?.id) fetchProfile()
  }, [user])

  const fetchProfile = async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    
    // Merge database profile with Auth metadata for names
    setProfile({
      ...profile,
      ...data,
      first_name: user.user_metadata?.first_name || '',
      last_name: user.user_metadata?.last_name || ''
    })
    setLoading(false)
  }

  const saveProfile = async () => {
    setSaving(true)
    
    // 1. Update Profile in public.profiles table
    const { error: profileErr } = await supabase.from('profiles').upsert({
      id: user.id,
      business_name: profile.business_name,
      business_address: profile.business_address,
      business_logo: profile.business_logo,
      contact_number: profile.contact_number,
      additional_number: profile.additional_number,
      upi_id: profile.upi_id,
      updated_at: new Date()
    })

    // 2. Update User Metadata in auth.users
    const { error: authErr } = await supabase.auth.updateUser({
      data: { 
        first_name: profile.first_name, 
        last_name: profile.last_name,
        full_name: `${profile.first_name} ${profile.last_name}`
      }
    })

    if (profileErr || authErr) alert(profileErr?.message || authErr?.message)
    else alert('Account and business configuration updated.')
    setSaving(false)
  }

  const labelS = { fontSize: 11, fontWeight: 900, color: '#64748b', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }
  const inputS = { width: '100%', padding: '14px 16px', borderRadius: 16, border: '2px solid #f1f5f9', fontSize: 15, boxSizing: 'border-box', outline: 'none', marginBottom: 24, color: '#0f172a', fontWeight: 700, transition: '0.2s' }

  if (!user) return <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f172a', fontWeight: 950 }}>Connecting to Cloud...</div>

  return (
    <div className="main-wrapper" style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, sans-serif', display: 'flex' }}>
      <Sidebar active="Settings" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        
        <div style={{ padding: '32px 24px', maxWidth: 800, width: '100%', boxSizing: 'border-box', margin: '0 auto' }}>
          <div style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 32, fontWeight: 950, color: '#0f172a', margin: 0, letterSpacing: -1.5 }}>Settings</h2>
            <p style={{ color: '#64748b', fontSize: 16, marginTop: 4, fontWeight: 600 }}>Manage your personal account and business branding.</p>
          </div>

          {loading ? (
            <PageLoader message="Accessing System Configuration..." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              
              {/* Personal Information */}
              <div style={{ background: '#fff', borderRadius: 32, padding: 40, border: '1px solid #f1f5f9', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.03)' }} className="premium-card">
                <div style={{ fontSize: 13, fontWeight: 950, color: '#6366f1', marginBottom: 24, letterSpacing: 1, textTransform: 'uppercase' }}>Personal Information</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                  <div>
                    <label style={labelS}>First Name</label>
                    <input value={profile.first_name} onChange={e => setProfile({...profile, first_name: e.target.value})} placeholder="Your given name" style={inputS} className="focus-indigo" />
                  </div>
                  <div>
                    <label style={labelS}>Last Name</label>
                    <input value={profile.last_name} onChange={e => setProfile({...profile, last_name: e.target.value})} placeholder="Your surname" style={inputS} className="focus-indigo" />
                  </div>
                </div>
              </div>

              {/* Business Configuration */}
              <div style={{ background: '#fff', borderRadius: 32, padding: 40, border: '1px solid #f1f5f9', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.03)' }} className="premium-card">
                <div style={{ fontSize: 13, fontWeight: 950, color: '#6366f1', marginBottom: 24, letterSpacing: 1, textTransform: 'uppercase' }}>Business Branding</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                  <div>
                    <label style={labelS}>Business Entity</label>
                    <input value={profile.business_name} onChange={e => setProfile({...profile, business_name: e.target.value})} placeholder="Legal Business Name" style={inputS} className="focus-indigo" />
                  </div>
                  <div>
                    <label style={labelS}>Operator Contact</label>
                    <input value={profile.contact_number} onChange={e => setProfile({...profile, contact_number: e.target.value})} placeholder="+91 ..." style={inputS} className="focus-indigo" />
                  </div>
                  <div>
                    <label style={labelS}>Additional WhatsApp Number</label>
                    <input value={profile.additional_number || ''} onChange={e => setProfile({...profile, additional_number: e.target.value})} placeholder="+91 ..." style={inputS} className="focus-indigo" />
                  </div>
                </div>

                <label style={labelS}>Physical Billing Address</label>
                <textarea value={profile.business_address} onChange={e => setProfile({...profile, business_address: e.target.value})} placeholder="Complete registered address" style={{ ...inputS, height: 100, resize: 'none', fontFamily: 'inherit' }} className="focus-indigo" />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                  <div>
                    <label style={labelS}>Merchant UPI ID</label>
                    <input value={profile.upi_id || ''} onChange={e => setProfile({...profile, upi_id: e.target.value})} placeholder="merchant@bank" style={inputS} className="focus-indigo" />
                  </div>
                  <div>
                    <label style={labelS}>Brand Logo URL</label>
                    <input value={profile.business_logo} onChange={e => setProfile({...profile, business_logo: e.target.value})} placeholder="https://path-to-your-logo.png" style={inputS} className="focus-indigo" />
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: 28, borderRadius: 24, border: '2px dashed #e2e8f0' }}>
                  <div style={{ fontSize: 11, fontWeight: 950, color: '#6366f1', marginBottom: 20, letterSpacing: 1.5, textTransform: 'uppercase' }}>Professional Branding Preview</div>
                  <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                    <div style={{ width: 64, height: 64, borderRadius: 16, background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 28, overflow: 'hidden', boxShadow: '0 8px 16px rgba(0,0,0,0.1)' }}>
                      {profile.business_logo ? <img src={profile.business_logo} style={{width:'100%', height:'100%', objectFit:'cover'}} /> : '🏙️'}
                    </div>
                    <div>
                      <div style={{ fontWeight: 950, fontSize: 20, color: '#0f172a', letterSpacing: -0.5 }}>{profile.business_name || 'Organization Placeholder'}</div>
                      <div style={{ fontSize: 14, color: '#64748b', fontWeight: 700, marginTop: 4 }}>{profile.business_address || 'Unset Address Configuration'}</div>
                    </div>
                  </div>
                </div>
              </div>

              <button onClick={saveProfile} disabled={saving} style={{ width: '100%', padding: '20px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 20, fontSize: 16, fontWeight: 950, cursor: 'pointer', transition: '0.2s', boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.3)' }} className="interactive-btn">
                {saving ? 'Synchronizing Vault...' : 'Save All Configuration Changes'}
              </button>
            </div>
          )}
        </div>
      </div>
      <style>{`
        @media (max-width: 768px) {
          .main-wrapper { flex-direction: column !important; }
        }
        .premium-card:hover { border-color: #6366f130 !important; }
        .focus-indigo:focus {
          border-color: #6366f1 !important;
          box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1) !important;
        }
        .interactive-btn:active { transform: scale(0.96); }
      `}</style>
    </div>
  )
}
