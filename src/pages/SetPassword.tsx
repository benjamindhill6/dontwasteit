import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function SetPassword() {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const nav = useNavigate()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) setErr(error.message)
    else nav('/', { replace: true })
  }

  return (
    <div className="center-page">
      <h1>Choose a password</h1>
      <form onSubmit={submit} className="stack">
        <label>New password (at least 8 characters)
          <input type="password" minLength={8} required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn" disabled={busy}>Save password</button>
      </form>
    </div>
  )
}
