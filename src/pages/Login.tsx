import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'password' | 'link'>('password')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    setMsg(null)
    if (mode === 'password') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) setErr('That email and password did not match.')
    } else {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
      })
      if (error) setErr('We could not send a link to that email. Is it the one you were invited with?')
      else setMsg('Check your email for a sign-in link.')
    }
    setBusy(false)
  }

  return (
    <div className="center-page">
      <span className="logo big" aria-hidden>📦</span>
      <h1>Don't Waste It!</h1>
      <p className="muted">Pantries sharing surplus food. Invite-only.</p>
      <form onSubmit={submit} className="stack">
        <label>Email
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode === 'password' && (
          <label>Password
            <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
        )}
        {err && <p className="error" role="alert">{err}</p>}
        {msg && <p className="ok" role="status">{msg}</p>}
        <button className="btn" disabled={busy}>{mode === 'password' ? 'Sign in' : 'Email me a link'}</button>
        <button type="button" className="btn link" onClick={() => setMode(mode === 'password' ? 'link' : 'password')}>
          {mode === 'password' ? 'Forgot password? Email me a link instead' : 'Use my password instead'}
        </button>
      </form>
    </div>
  )
}
