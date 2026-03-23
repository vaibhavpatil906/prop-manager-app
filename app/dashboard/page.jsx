'use client'
import { useAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Sidebar, { TopBar } from '@/app/components/Sidebar'

const statIcons = {
  properties: <svg style={{width:20,height:20}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>,
  tenants: <svg style={{width:20,height:20}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>,
  occupancy: <svg style={{width:20,height:20}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>,
  revenue: <svg style={{width:20,height:20}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>,
  outstanding: <svg style={{width:20,height:20}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>,
  maintenance: <svg style={{width:20,height:20}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path></svg>,
}

function StatCard({ label, value, sub, accent, iconKey }) {
  return (
    <div style={{ background: '#fff', borderRadius: 20, padding: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)', border: '1px solid #f1f5f9', flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 11, color: '#1a1a2e', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
        <div style={{ background: `${accent}10`, color: accent, padding: 6, borderRadius: 10 }}>{statIcons[iconKey]}</div>
      </div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', letterSpacing: -1 }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: '#1a1a2e', marginTop: 2, fontWeight: 600 }}>{sub}</div>}
      </div>
    </div>
  )
}

function Badge({ label }) {
  const colors = {
    Paid: { bg: '#ecfdf5', color: '#059669', dot: '#10b981' },
    Pending: { bg: '#fffbeb', color: '#d97706', dot: '#f59e0b' },
    Overdue: { bg: '#fef2f2', color: '#dc2626', dot: '#ef4444' },
    Open: { bg: '#fef2f2', color: '#dc2626', dot: '#ef4444' },
    'In Progress': { bg: '#eff6ff', color: '#2563eb', dot: '#3b82f6' },
    Resolved: { bg: '#ecfdf5', color: '#059669', dot: '#10b981' },
  }
  const s = colors[label] || { bg: '#f8fafc', color: '#1a1a2e', dot: '#1a1a2e' }
  return (
    <span style={{ background: s.bg, color: s.color, padding: '4px 10px', borderRadius: 20, fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 5, textTransform: 'uppercase' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot }} />
      {label}
    </span>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [stats, setStats] = useState({ properties: 0, tenants: 0, revenue: 0, outstanding: 0, occupancy: 0, openMaintenance: 0 })
  const [recentPayments, setRecentPayments] = useState([])
  const [recentMaintenance, setRecentMaintenance] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const fetchStats = async () => {
      setLoading(true)
      const [
        { data: properties },
        { data: units },
        { data: tenants },
        { data: payments },
        { data: maintenance },
      ] = await Promise.all([
        supabase.from('properties').select('id').eq('user_id', user.id),
        supabase.from('units').select('id, status, property:properties!inner(user_id)').eq('property.user_id', user.id),
        supabase.from('tenants').select('id').eq('user_id', user.id),
        supabase.from('payments').select('*, tenant:tenants(name)').order('created_at', { ascending: false }),
        supabase.from('maintenance_requests').select('*, tenant:tenants(name), unit:units(unit_number)').order('created_at', { ascending: false }),
      ])

      const totalUnits = units?.length || 0
      const occupiedUnits = units?.filter(u => u.status === 'Occupied').length || 0
      const revenue = payments?.filter(p => p.status === 'Paid').reduce((a, b) => a + Number(b.amount), 0) || 0
      const outstanding = payments?.filter(p => p.status !== 'Paid').reduce((a, b) => a + Number(b.amount), 0) || 0
      const openMaintenance = maintenance?.filter(m => m.status === 'Open').length || 0

      setStats({
        properties: properties?.length || 0,
        tenants: tenants?.length || 0,
        revenue,
        outstanding,
        occupancy: totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0,
        openMaintenance,
      })
      setRecentPayments(payments?.slice(0, 4) || [])
      setRecentMaintenance(maintenance?.filter(m => m.status !== 'Resolved').slice(0, 4) || [])
      setLoading(false)
    }
    fetchStats()
  }, [user])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  if (!user) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', background: '#f8fafc' }}>Loading Dashboard...</div>

  return (
    <div className="main-wrapper" style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, -apple-system, sans-serif', display: 'flex' }}>
      <Sidebar active="Dashboard" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar onMenuClick={() => setSidebarOpen(true)} />

        <div style={{ padding: '24px 16px', maxWidth: 1100, width: '100%', boxSizing: 'border-box' }}>
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: -0.5 }}>{greeting}! 👋</h2>
            <p style={{ color: '#000', margin: '4px 0 0', fontSize: 14, fontWeight: 600 }}>Here's your portfolio overview.</p>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 80, color: '#000', fontWeight: 700 }}>Gathering your stats...</div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 12 }}>
                <StatCard label="Properties" value={stats.properties} sub="Total" accent="#6366f1" iconKey="properties" />
                <StatCard label="Tenants" value={stats.tenants} sub="Active" accent="#8b5cf6" iconKey="tenants" />
                <StatCard label="Occupancy" value={stats.occupancy + '%'} sub="Capacity" accent="#06b6d4" iconKey="occupancy" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
                <StatCard label="Revenue" value={'$' + (stats.revenue / 1000).toFixed(1) + 'k'} sub="Collected" accent="#10b981" iconKey="revenue" />
                <StatCard label="Outstanding" value={'$' + (stats.outstanding / 1000).toFixed(1) + 'k'} sub="Unpaid" accent="#ef4444" iconKey="outstanding" />
                <StatCard label="Issues" value={stats.openMaintenance} sub="Open" accent="#f59e0b" iconKey="maintenance" />
              </div>

              <div className="quick-nav" style={{ overflowX: 'auto', display: 'flex', gap: 10, marginBottom: 32, paddingBottom: 8, msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
                {[
                  { label: 'Properties', path: '/properties', color: '#6366f1' },
                  { label: 'Tenants', path: '/tenants', color: '#8b5cf6' },
                  { label: 'Maintenance', path: '/maintenance', color: '#f59e0b' },
                  { label: 'Payments', path: '/payments', color: '#10b981' },
                ].map(c => (
                  <button key={c.label} onClick={() => router.push(c.path)}
                    style={{ 
                      background: '#fff', color: c.color, border: '1px solid #e2e8f0', 
                      borderRadius: 12, padding: '12px 20px', fontWeight: 800, 
                      fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)', flexShrink: 0
                    }}>
                    {c.label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
                <div style={{ background: '#fff', borderRadius: 20, padding: 20, border: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#0f172a' }}>Recent Payments</h3>
                    <button onClick={() => router.push('/payments')} style={{ background: '#f8fafc', border: 'none', color: '#6366f1', fontSize: 12, fontWeight: 800, cursor: 'pointer', padding: '4px 10px', borderRadius: 6 }}>All</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {recentPayments.map(p => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>{p.tenant?.name || '—'}</div>
                          <div style={{ fontSize: 11, color: '#000', fontWeight: 700 }}>{p.due_date}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 950, fontSize: 14, color: '#0f172a' }}>${Number(p.amount).toLocaleString()}</div>
                          <Badge label={p.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ background: '#fff', borderRadius: 20, padding: 20, border: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#0f172a' }}>Open Issues</h3>
                    <button onClick={() => router.push('/maintenance')} style={{ background: '#f8fafc', border: 'none', color: '#6366f1', fontSize: 12, fontWeight: 800, cursor: 'pointer', padding: '4px 10px', borderRadius: 6 }}>All</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {recentMaintenance.map(m => (
                      <div key={m.id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{ fontWeight: 800, fontSize: 14, color: '#1e293b', flex: 1 }}>{m.issue}</div>
                          <Badge label={m.status} />
                        </div>
                        <div style={{ fontSize: 11, color: '#000', marginTop: 4, fontWeight: 700 }}>{m.tenant?.name} · Unit {m.unit?.unit_number}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
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