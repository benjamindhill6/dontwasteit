import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { supabase } from '../lib/supabase'
import { Page, Sheet } from '../components/Common'
import { PRIVACY, TERMS, type LegalDoc, type Span } from '../legal/documents'

const SpanText = ({ s }: { s: Span }) => <>{s.b && <strong>{s.b}</strong>}{s.t}</>

/** The full text of one document. */
export function DocBody({ doc }: { doc: LegalDoc }) {
  return (
    <div className="legal">
      <p className="muted">Last updated {doc.date}</p>
      {doc.blocks.map((b, i) =>
        b.kind === 'h' ? <h2 key={i}>{b.text}</h2>
        : b.kind === 'p' ? <p key={i}><SpanText s={b.span} /></p>
        : <ul key={i}>{b.items.map((s, j) => <li key={j}><SpanText s={s} /></li>)}</ul>,
      )}
    </div>
  )
}

/** A document as its own page, opened from Profile. */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <Page title={doc.short}>
      <Link className="btn secondary" to="/profile">Back to Profile</Link>
      <h2 className="legal-title">{doc.title}</h2>
      <DocBody doc={doc} />
      <Link className="btn secondary" to="/profile">Back to Profile</Link>
    </Page>
  )
}

/** Shown before anything else until the person agrees to the current version of both documents. */
export function AgreeScreen() {
  const { refresh, signOut } = useAuth()
  const [open, setOpen] = useState<LegalDoc | null>(null)
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function agree() {
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('accept_agreements', {
      p_terms_version: TERMS.version,
      p_privacy_version: PRIVACY.version,
      p_user_agent: navigator.userAgent,
    })
    if (error) { setErr("That didn't save. Check your connection and try again."); setBusy(false); return }
    await refresh()
  }

  return (
    <div className="center-page agree">
      <span className="logo big" aria-hidden>📦</span>
      <h1>Before you start</h1>
      <p className="big-text">Please read our User Agreement and Privacy Policy. Tap each one to read it.</p>
      <button className="btn big secondary" onClick={() => setOpen(TERMS)}>📄 Read the User Agreement</button>
      <button className="btn big secondary" onClick={() => setOpen(PRIVACY)}>🔒 Read the Privacy Policy</button>
      <label className="check big-check">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        <span>I have read and agree to the User Agreement and the Privacy Policy.</span>
      </label>
      {err && <p className="error" role="alert">{err}</p>}
      <button className="btn big" disabled={!checked || busy} onClick={agree}>{busy ? 'Saving…' : 'Agree and continue'}</button>
      <button className="btn link" onClick={signOut}>Sign out</button>
      {open && (
        <Sheet title={open.short} onClose={() => setOpen(null)}>
          <h2 className="legal-title">{open.title}</h2>
          <DocBody doc={open} />
          <button className="btn big" onClick={() => setOpen(null)}>Done reading</button>
        </Sheet>
      )}
    </div>
  )
}
