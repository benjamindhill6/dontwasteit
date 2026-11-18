import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { callFn, supabase } from '../lib/supabase'
import type { Org, Person } from '../lib/types'
import { Note, Page } from '../components/Common'

export default function Profile() {
  const { me, org, refresh, signOut } = useAuth()
  const [name, setName] = useState(me?.name ?? '')
  const [phone, setPhone] = useState(me?.phone ?? '')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function saveMe(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    const { error } = await supabase.rpc('update_my_profile', { p_name: name, p_phone: phone, p_prefs: null })
    if (error) setErr(error.message)
    else { setMsg('Saved.'); refresh() }
  }

  return (
    <Page title="Profile">
      <Link className="btn big" to="/profile/alerts">🔔 Alerts</Link>
      <form className="stack panel" onSubmit={saveMe}>
        <h2>You</h2>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label>Phone (others can text you)<input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
        <p className="muted">{me?.email}</p>
        {msg && <p className="ok">{msg}</p>}
        {err && <p className="error">{err}</p>}
        <button className="btn">Save</button>
      </form>
      {org && <OrgForm org={org} onSaved={refresh} />}
      {org && <Contacts orgId={org.id} meId={me!.id} />}
      <Link className="btn secondary" to="/set-password">Change my password</Link>
      <button className="btn secondary" onClick={signOut}>Sign out</button>
    </Page>
  )
}

export function OrgForm({ org, onSaved, admin }: { org: Partial<Org>; onSaved: () => void; admin?: boolean }) {
  const [f, setF] = useState({
    name: org.name ?? '', street: org.street ?? '', city: org.city ?? '', state: org.state ?? 'PA', zip: org.zip ?? '',
    type: org.type ?? 'pantry',
    delivery_miles: org.delivery_miles != null ? String(org.delivery_miles) : '',
    pickup_miles: org.pickup_miles != null ? String(org.pickup_miles) : '',
    is_philabundance: org.is_philabundance ?? false, is_share: org.is_share ?? false,
  })
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const pantry = f.type === 'pantry'

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null); setMsg(null)
    try {
      await callFn('save-organization', { ...f, id: org.id })
      setMsg('Saved.')
      onSaved()
    } catch (x) { setErr((x as Error).message) }
    setBusy(false)
  }

  return (
    <form className="stack panel" onSubmit={save}>
      <h2>{org.id ? (pantry ? 'Pantry profile' : 'Business profile') : 'New organization'}</h2>
      {admin && !org.id && (
        <div className="seg">
          <button type="button" className={pantry ? 'on' : ''} onClick={() => setF({ ...f, type: 'pantry' })}>Pantry</button>
          <button type="button" className={!pantry ? 'on' : ''} onClick={() => setF({ ...f, type: 'business' })}>Restaurant / store</button>
        </div>
      )}
      <label>Name<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label>Street<input required value={f.street} onChange={(e) => setF({ ...f, street: e.target.value })} /></label>
      <div className="row">
        <label>City<input required value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></label>
        <label className="narrow">State<input required maxLength={2} value={f.state} onChange={(e) => setF({ ...f, state: e.target.value.toUpperCase() })} /></label>
        <label className="narrow">ZIP<input required inputMode="numeric" value={f.zip} onChange={(e) => setF({ ...f, zip: e.target.value })} /></label>
      </div>
      <label>Delivery distance (miles){pantry ? '' : ' — leave blank if you only offer pickup'}
        <input type="number" min="0" step="any" required={pantry} value={f.delivery_miles} onChange={(e) => setF({ ...f, delivery_miles: e.target.value })} />
      </label>
      {pantry && (
        <label>Pickup distance (miles)
          <input type="number" min="0" step="any" required value={f.pickup_miles} onChange={(e) => setF({ ...f, pickup_miles: e.target.value })} />
        </label>
      )}
      <Note />
      {pantry && <>
        <label className="check big-check"><input type="checkbox" checked={f.is_philabundance} onChange={(e) => setF({ ...f, is_philabundance: e.target.checked })} /> Philabundance client</label>
        <label className="check big-check"><input type="checkbox" checked={f.is_share} onChange={(e) => setF({ ...f, is_share: e.target.checked })} /> SHARE client</label>
      </>}
      {msg && <p className="ok">{msg}</p>}
      {err && <p className="error" role="alert">{err}</p>}
      <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
    </form>
  )
}

export function Contacts({ orgId, meId }: { orgId: string; meId: string }) {
  const [people, setPeople] = useState<Person[]>([])
  const { me } = useAuth()
  const isAdmin = !!me?.is_platform_admin
  const [f, setF] = useState({ name: '', email: '', phone: '' })
  const [direct, setDirect] = useState(false)
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = async () => {
    const { data } = await supabase.from('people').select('*').eq('org_id', orgId).order('name')
    setPeople((data as Person[]) ?? [])
  }
  useEffect(() => { load() }, [orgId])

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    setErr(null); setMsg(null)
    try {
      if (direct) {
        await callFn('manage-person', { action: 'create', org_id: orgId, ...f, password })
        setMsg(`Account created for ${f.email}. Give them the password you chose; they can change it under Profile.`)
      } else {
        await callFn('manage-person', { action: 'invite', org_id: orgId, ...f, redirect_to: `${window.location.origin}/set-password` })
        setMsg(`Invite sent to ${f.email}.`)
      }
      setF({ name: '', email: '', phone: '' })
      setPassword('')
      load()
    } catch (x) { setErr((x as Error).message) }
  }
  async function toggle(p: Person) {
    setErr(null)
    try { await callFn('manage-person', { action: p.active ? 'deactivate' : 'reactivate', person_id: p.id }); load() }
    catch (x) { setErr((x as Error).message) }
  }

  return (
    <div className="stack panel">
      <h2>Contacts</h2>
      {people.map((p) => (
        <div key={p.id} className="row between">
          <div><strong>{p.name}</strong>{!p.active && <span className="pill done">Deactivated</span>}<br /><span className="muted">{p.email}{p.phone ? ` · ${p.phone}` : ''}</span></div>
          {p.id !== meId && <button className="btn link" onClick={() => toggle(p)}>{p.active ? 'Deactivate' : 'Reactivate'}</button>}
        </div>
      ))}
      <form className="stack" onSubmit={invite}>
        <h3>{direct ? 'Create an account' : 'Invite a contact'}</h3>
        {isAdmin && (
          <div className="seg">
            <button type="button" className={!direct ? 'on' : ''} onClick={() => setDirect(false)}>Email an invite</button>
            <button type="button" className={direct ? 'on' : ''} onClick={() => setDirect(true)}>Create it for them</button>
          </div>
        )}
        <label>Name<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label>Email<input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label>Phone<input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
        {direct && (
          <label>Password for them (at least 8 characters)
            <div className="row">
              <input type="text" required minLength={8} autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="btn secondary" onClick={() => setPassword(makePassword())}>Generate</button>
            </div>
          </label>
        )}
        {msg && <p className="ok">{msg}</p>}
        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn secondary">{direct ? 'Create account' : 'Send invite'}</button>
      </form>
    </div>
  )
}

function makePassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const buf = crypto.getRandomValues(new Uint32Array(12))
  return Array.from(buf, (n) => chars[n % chars.length]).join('')
}
