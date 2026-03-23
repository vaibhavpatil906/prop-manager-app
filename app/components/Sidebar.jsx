'use client'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

// UI Tokens for Consistency
export const TOKENS = {
  primary: '#6366f1',
  primaryHover: '#4f46e5',
  dark: '#0f172a',
  slate: '#64748b',
  border: '#f1f5f9',
  bg: '#f8fafc',
  radiusCard: '24px',
  radiusBtn: '14px',
  shadow: '0 10px 15px -3px rgba(0, 0, 0, 0.04), 0 4px 6px -2px rgba(0, 0, 0, 0.02)',
  font: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif"
}

const icons = {
  Dashboard: <svg style={{width:18,height:18}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>,
  Properties: <svg style={{width:18,height:18}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>,
  Tenants: <svg style={{width:18,height:18}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>,
  Maintenance: <svg style={{width:18,height:18}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path></svg>,
  Payments: <svg style={{width:18,height:18}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path></svg>,
  Billing: <svg style={{width:18,height:18}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>,
  Settings: <svg style={{width:18,height:18}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path></svg>
}

export function PageLoader({ message = "Syncing Data..." }) {
  return (
    <div style={{ padding: 100, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div className="loader-container" style={{ position: 'relative', width: 64, height: 64, marginBottom: 24 }}>
        <div className="loader-ring" />
        <div className="loader-ring-outer" />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🏘️</div>
      </div>
      <div style={{ color: TOKENS.dark, fontWeight: 800, fontSize: 15, letterSpacing: 0.5, opacity: 0.8, fontFamily: TOKENS.font }}>{message}</div>
      <style>{`
        .loader-ring {
          position: absolute; inset: 0; border: 4px solid #f1f5f9; border-top-color: ${TOKENS.primary}; border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        .loader-ring-outer {
          position: absolute; inset: -8px; border: 2px solid ${TOKENS.primary}10; border-radius: 50%;
          animation: pulse 2s infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1.3); opacity: 0; }
        }
      `}</style>
    </div>
  )
}

export function TopBar({ onMenuClick }) {
  return (
    <>
      <div className="topbar-mobile" style={{ 
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
        padding: '12px 20px', background: TOKENS.dark, position: 'sticky', 
        top: 0, zIndex: 50, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', color: '#fff' 
      }}>
        <button onClick={onMenuClick} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}>☰</button>
        <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: -0.5, display: 'flex', alignItems: 'center', gap: 8, color: '#fff', fontFamily: TOKENS.font }}>
          <span style={{color: TOKENS.primary}}>🏘️</span> PropManager
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
        width: 260, background: TOKENS.dark, position: 'fixed', top: 0, 
        left: open ? 0 : -260, bottom: 0, display: 'flex', flexDirection: 'column', 
        padding: '40px 0', zIndex: 100, transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        borderRight: '1px solid #ffffff08', height: '100vh', fontFamily: TOKENS.font
      }} className="sidebar-container">
        <div style={{ padding: '0 28px 40px' }}>
          <div style={{ fontSize: 22, fontWeight: 950, color: '#fff', letterSpacing: -0.8, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{color: TOKENS.primary, fontSize: 24}}>🏘️</span> PropManager
          </div>
          <div style={{ fontSize: 10, color: TOKENS.slate, marginTop: 4, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.5, paddingLeft: 34 }}>Professional Suite</div>
        </div>
        
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, padding: '0 12px' }}>
          {['Dashboard', 'Properties', 'Tenants', 'Maintenance', 'Payments', 'Billing', 'Settings'].map(n => {
            const isA = n === active
            return (
              <button key={n} onClick={() => navigate('/' + n.toLowerCase())}
                style={{ 
                  position: 'relative',
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 20px', background: isA ? `${TOKENS.primary}15` : 'transparent', 
                  color: isA ? '#fff' : TOKENS.slate, border: 'none', 
                  borderRadius: 14, cursor: 'pointer', fontSize: 14, 
                  fontWeight: isA ? 800 : 600, width: '100%', textAlign: 'left',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                }} className="nav-btn">
                {isA && <div style={{ position: 'absolute', left: -12, top: '20%', bottom: '20%', width: 4, background: TOKENS.primary, borderRadius: '0 4px 4px 0', boxShadow: `0 0 15px ${TOKENS.primary}` }} />}
                <span style={{ color: isA ? TOKENS.primary : '#475569', transition: '0.2s' }}>{icons[n]}</span>
                {n}
              </button>
            )
          })}
        </div>

        <div style={{ marginTop: 'auto', padding: '0 20px' }}>
          <div style={{ background: '#ffffff03', borderRadius: 24, padding: 20, border: '1px solid #ffffff08' }}>
            <div style={{ color: '#ffffff40', fontSize: 10, marginBottom: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>ACTIVE OPERATOR</div>
            <div style={{ color: '#fff', fontSize: 12, fontWeight: 700, wordBreak: 'break-all', marginBottom: 16 }}>{user?.email}</div>
            <button onClick={signOut} style={{ 
              background: '#334155', color: '#fff', border: 'none', 
              borderRadius: TOKENS.radiusBtn, padding: '12px', cursor: 'pointer', 
              fontSize: 13, fontWeight: 900, width: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: '0.2s'
            }} className="logout-btn">
              <svg style={{width:16,height:16}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
              Logout
            </button>
          </div>
        </div>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
          
          @media (min-width: 769px) {
            .sidebar-container { left: 0 !important; position: sticky !important; flex-shrink: 0 !important; }
            .sidebar-overlay { display: none !important; }
          }
          .nav-btn:hover:not(:disabled) {
            background: rgba(255,255,255,0.03) !important;
            color: #fff !important;
            transform: translateX(4px);
          }
          .logout-btn:hover {
            background: #ef4444 !important;
            box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
          }
        `}</style>
      </div>
    </>
  )
}
