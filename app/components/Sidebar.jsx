'use client'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

const icons = {
  Dashboard: <svg style={{width:18,height:18}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>,
  Properties: <svg style={{width:18,height:18}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>,
  Tenants: <svg style={{width:18,height:18}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>,
  Maintenance: <svg style={{width:18,height:18}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path></svg>,
  Payments: <svg style={{width:18,height:18}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path></svg>,
  Billing: <svg style={{width:18,height:18}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>,
  Settings: <svg style={{width:18,height:18}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path></svg>
}

export function TopBar({ onMenuClick }) {
  return (
    <>
      <div className="topbar-mobile" style={{ 
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
        padding: '12px 20px', background: '#1a1a2e', position: 'sticky', 
        top: 0, zIndex: 50, boxShadow: '0 4px 12px #0002', color: '#fff' 
      }}>
        <button onClick={onMenuClick} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}>☰</button>
        <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: -0.5, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{fontSize: 22}}>🏘️</span> PropManager
        </div>
        <div style={{ width: 32 }} />
      </div>
      <style>{`
        @media (min-width: 769px) { .topbar-mobile { display: none !important; } }
      `}</style>
    </>
  )
}

export default function Sidebar({ active, open, onClose }) {
  const router = useRouter()
  const { signOut, user } = useAuth()

  const navigate = (path) => {
    router.push(path)
    if (onClose) onClose()
  }

  return (
    <>
      <div 
        className="sidebar-overlay"
        onClick={onClose} 
        style={{ 
          position: 'fixed', inset: 0, background: '#0008', 
          backdropFilter: 'blur(4px)', zIndex: 99,
          opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.3s'
        }} 
      />
      <div style={{
        width: 240, background: '#1a1a2e', position: 'fixed', top: 0, 
        left: open ? 0 : -240, bottom: 0, display: 'flex', flexDirection: 'column', 
        padding: '40px 0', zIndex: 100, transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        borderRight: '1px solid #ffffff10', height: '100vh'
      }} className="sidebar-container">
        <div style={{ padding: '0 28px 40px' }}>
          <div style={{ fontSize: 22, fontWeight: 950, color: '#fff', letterSpacing: -0.8, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{fontSize: 24}}>🏘️</span> PropManager
          </div>
          <div style={{ fontSize: 11, color: '#ffffff40', marginTop: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, paddingLeft: 34 }}>Rental Management</div>
        </div>
        
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, padding: '0 12px' }}>
          {['Dashboard', 'Properties', 'Tenants', 'Maintenance', 'Payments', 'Billing', 'Settings'].map(n => {
            const isA = n === active
            return (
              <button key={n} onClick={() => navigate('/' + n.toLowerCase())}
                style={{ 
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', background: isA ? '#6366f120' : 'transparent', 
                  color: isA ? '#818cf8' : '#ffffff70', border: 'none', 
                  borderRadius: 12, cursor: 'pointer', fontSize: 14, 
                  fontWeight: isA ? 700 : 600, width: '100%', textAlign: 'left',
                  transition: 'all 0.2s'
                }}>
                <span style={{ color: isA ? '#818cf8' : '#ffffff30' }}>{icons[n]}</span>
                {n}
              </button>
            )
          })}
        </div>

        <div style={{ marginTop: 'auto', padding: '0 20px' }}>
          <div style={{ background: '#ffffff05', borderRadius: 16, padding: 16, border: '1px solid #ffffff08' }}>
            <div style={{ color: '#ffffff40', fontSize: 11, marginBottom: 10, fontWeight: 600, wordBreak: 'break-all' }}>Logged in as:<br/><span style={{color: '#ffffff80'}}>{user?.email}</span></div>
            <button onClick={signOut} style={{ 
              background: '#ef444415', color: '#f87171', border: 'none', 
              borderRadius: 10, padding: '10px', cursor: 'pointer', 
              fontSize: 13, fontWeight: 700, width: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
            }}>
              <svg style={{width:16,height:16}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
              Sign Out
            </button>
          </div>
        </div>
        <style>{`
          @media (min-width: 769px) {
            .sidebar-container { left: 0 !important; position: sticky !important; flex-shrink: 0 !important; }
            .sidebar-overlay { display: none !important; }
          }
        `}</style>
      </div>
    </>
  )
}