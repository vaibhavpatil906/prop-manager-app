'use client'
import { useState } from 'react'
import { useAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'

export default function AuthPage() {
  const [mode, setMode] = useState('signin') // signin | signup
  const [form, setForm] = useState({ email: '', password: '', firstName: '', lastName: '' })
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const { signIn, signUp } = useAuth()
  const router = useRouter()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMsg('')
    
    if (mode === 'signin') {
      const { error } = await signIn(form.email, form.password)
      if (error) setMsg(error.message)
      else router.push('/dashboard')
    } else {
      if (!form.firstName || !form.lastName) {
        setMsg('Please enter your first and last name.')
        setLoading(false)
        return
      }
      const { error } = await signUp(form.email, form.password, form.firstName, form.lastName)
      if (error) setMsg(error.message)
      else setMsg('Success! Check your email to confirm your account.')
    }
    setLoading(false)
  }

  const inputS = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '2px solid #f1f5f9', marginBottom: 16, fontSize: 14, outline: 'none', transition: '0.2s', color: '#0f172a', fontWeight: 600 }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ background: '#fff', padding: 40, borderRadius: 28, width: '100%', maxWidth: 400, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.05)' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏘️</div>
          <h2 style={{ fontSize: 24, fontWeight: 950, color: '#0f172a', margin: 0 }}>PropManager</h2>
          <p style={{ color: '#64748b', fontSize: 14, marginTop: 8, fontWeight: 600 }}>{mode === 'signin' ? 'Welcome back, Operator.' : 'Begin your professional journey.'}</p>
        </div>

        {msg && <div style={{ padding: '12px 16px', background: msg.includes('Success') ? '#ecfdf5' : '#fef2f2', color: msg.includes('Success') ? '#059669' : '#dc2626', borderRadius: 12, fontSize: 13, fontWeight: 700, marginBottom: 20, textAlign: 'center' }}>{msg}</div>}

        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <input placeholder="First Name" value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} style={inputS} />
              <input placeholder="Last Name" value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} style={inputS} />
            </div>
          )}
          <input placeholder="Email Address" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} style={inputS} />
          <input placeholder="Password" type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} style={inputS} />
          
          <button disabled={loading} style={{ width: '100%', padding: '14px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 900, cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.2)', transition: '0.2s' }}>
            {loading ? 'Authenticating...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: '#64748b', fontWeight: 600 }}>
          {mode === 'signin' ? "Don't have an account? " : "Already have an account? "}
          <span 
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            style={{ color: '#6366f1', fontWeight: 800, cursor: 'pointer' }}>
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </span>
        </p>
      </div>
    </div>
  )
}
