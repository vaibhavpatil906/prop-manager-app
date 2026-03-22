'use client'
import { useAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

function Sidebar({ active, open, onClose }) {
  const router = useRouter()
  const { signOut, user } = useAuth()
  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#0005', zIndex: 99 }} />}
      <div style={{ width: 220, background: '#1a1a2e', position: 'fixed', top: 0, left: open ? 0 : -220, bottom: 0, display: 'flex', flexDirection: 'column', padding: '32px 0', zIndex: 100, transition: 'left 0.25s' }}>
        <div style={{ padding: '0 24px 32px' }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>PropManager</div>
          <div style={{ fontSize: 11, color: '#ffffff55', marginTop: 2 }}>Rental Management</div>
        </div>
        {['Dashboard', 'Properties', 'Tenants', 'Maintenance', 'Payments'].map(n => (
          <button key={n} onClick={() => { router.push('/' + n.toLowerCase()); onClose() }}
            style={{ padding: '12px 24px', background: n === active ? '#ffffff15' : 'transparent', color: n === active ? '#fff' : '#ffffff80', border: 'none', borderLeft: n === active ? '3px solid #6366f1' : '3px solid transparent', cursor: 'pointer', fontSize: 14, fontWeight: n === active ? 700 : 500, width: '100%', textAlign: 'left' }}>
            {n}
          </button>
        ))}
        <div style={{ marginTop: 'auto', padding: 24, borderTop: '1px solid #ffffff15' }}>
          <div style={{ color: '#ffffff80', fontSize: 12, marginBottom: 8, wordBreak: 'break-all' }}>{user?.email}</div>
          <button onClick={signOut} style={{ background: '#ffffff15', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600, width: '100%' }}>
            Sign Out
          </button>
        </div>
      </div>
    </>
  )
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: '22px 24px', boxShadow: '0 1px 4px #0001', border: '1px solid #f0f0f0', flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 12, color: '#888', fontWeight: 500, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent || '#1a1a2e' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function Badge({ label }) {
  const colors = {
    Paid: { bg: '#e8faf0', color: '#1a7a45', dot: '#22c55e' },
    Pending: { bg: '#fff8e6', color: '#92600a', dot: '#f59e0b' },
    Overdue: { bg: '#fdf2f2', color: '#991b1b', dot: '#ef4444' },
    Open: { bg: '#fdf2f2', color: '#991b1b', dot: '#ef4444' },
    'In Progress': { bg: '#fff8e6', color: '#92600a', dot: '#f59e0b' },
    Resolved: { bg: '#e8faf0', color: '#1a7a45', dot: '#22c55e' },
  }
  const s = colors[label] || { bg: '#f5f5f5', color: '#888', dot: '#ccc' }
  return (
    <span style={{ background: s.bg, color: s.color, padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} />
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

  return (
    <div style={{ minHeight: '100vh', background: '#f7f8fc', fontFamily: 'sans-serif' }}>
      <Sidebar active="Dashboard" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Mobile Top Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: '#1a1a2e', position: 'sticky', top: 0, zIndex: 50 }}>
        <button onClick={() => setSidebarOpen(true)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', padding: 0 }}>☰</button>
        <div style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>PropManager</div>
        <div style={{ width: 24 }} />
      </div>

      <div style={{ padding: '24px 16px', maxWidth: 900, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e', margin: 0 }}>{greeting}! 👋</h2>
          <p style={{ color: '#888', margin: '4px 0 0', fontSize: 13 }}>Here is your portfolio overview</p>
        </div>

        {/* Stat Cards */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>Loading stats...</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <StatCard label="Properties" value={stats.properties} sub="Total properties" accent="#2563eb" />
              <StatCard label="Tenants" value={stats.tenants} sub="Active tenants" accent="#7c3aed" />
              <StatCard label="Occupancy" value={stats.occupancy + '%'} sub="Units occupied" accent="#0891b2" />
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
              <StatCard label="Revenue Collected" value={'$' + stats.revenue.toLocaleString()} sub="Paid this period" accent="#16a34a" />
              <StatCard label="Outstanding" value={'$' + stats.outstanding.toLocaleString()} sub="Pending + overdue" accent="#dc2626" />
              <StatCard label="Open Maintenance" value={stats.openMaintenance} sub="Needs attention" accent="#d97706" />
            </div>

            {/* Quick Nav */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
              {[
                { label: 'Properties', path: '/properties', bg: '#eff6ff', color: '#2563eb' },
                { label: 'Tenants', path: '/tenants', bg: '#f5f3ff', color: '#7c3aed' },
                { label: 'Maintenance', path: '/maintenance', bg: '#fff7ed', color: '#d97706' },
                { label: 'Payments', path: '/payments', bg: '#f0fdf4', color: '#16a34a' },
              ].map(c => (
                <button key={c.label} onClick={() => router.push(c.path)}
                  style={{ background: c.bg, color: c.color, border: 'none', borderRadius: 12, padding: '12px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer', flex: 1, minWidth: 120 }}>
                  {c.label}
                </button>
              ))}
            </div>

            {/* Recent Activity */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              {/* Recent Payments */}
              <div style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 4px #0001', border: '1px solid #f0f0f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>Recent Payments</h3>
                  <button onClick={() => router.push('/payments')} style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>View all</button>
                </div>
                {recentPayments.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: '#aaa', fontSize: 13 }}>No payments yet</div>
                ) : recentPayments.map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#1a1a2e' }}>{p.tenant?.name || '—'}</div>
                      <div style={{ fontSize: 11, color: '#aaa' }}>{p.due_date || p.created_at?.split('T')[0]}</div>
                    </div>
                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#1a1a2e' }}>${Number(p.amount).toLocaleString()}</div>
                      <Badge label={p.status} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Open Maintenance */}
              <div style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 4px #0001', border: '1px solid #f0f0f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>Open Requests</h3>
                  <button onClick={() => router.push('/maintenance')} style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>View all</button>
                </div>
                {recentMaintenance.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: '#aaa', fontSize: 13 }}>No open requests</div>
                ) : recentMaintenance.map(m => (
                  <div key={m.id} style={{ padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#1a1a2e', flex: 1, marginRight: 8 }}>{m.issue}</div>
                      <Badge label={m.status} />
                    </div>
                    <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                      {m.tenant?.name || '—'} · Unit {m.unit?.unit_number || '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}