'use client'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

export function TopBar({ onMenuClick }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: '#1a1a2e', position: 'sticky', top: 0, zIndex: 50 }}>
      <button onClick={onMenuClick} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', padding: 0 }}>☰</button>
      <div style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>PropManager</div>
      <div style={{ width: 24 }} />
    </div>
  )
}

export default function Sidebar({ active, open, onClose }) {
  const router = useRouter()
  const { signOut, user } = useAuth()

  const navigate = (path) => {
    router.push(path)
    onClose()
  }

  return (
    <>
      {open && (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#0005', zIndex: 99 }} />
      )}
      <div style={{
        width: 220, background: '#1a1a2e', position: 'fixed', top: 0, left: open ? 0 : -220,
        bottom: 0, display: 'flex', flexDirection: 'column', padding: '32px 0',
        zIndex: 100, transition: 'left 0.25s'
      }}>
        <div style={{ padding: '0 24px 32px' }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>PropManager</div>
          <div style={{ fontSize: 11, color: '#ffffff55', marginTop: 2 }}>Rental Management</div>
        </div>
        {['Dashboard', 'Properties', 'Tenants', 'Maintenance', 'Payments'].map(n => (
          <button key={n} onClick={() => navigate('/' + n.toLowerCase())}
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