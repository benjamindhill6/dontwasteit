import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { supabase } from '../lib/supabase'
import type { ClaimStatus, Person } from '../lib/types'
import { fmtDateTime, fmtWindow, fromLocalInput, num, toLocalInput } from '../lib/format'
import { Badge, Page, Sheet } from '../components/Common'

type ClaimRow = {
  id: string
  status: ClaimStatus
  method: 'pickup' | 'delivery'
  proposed_time: string | null
  claimer_org_id: string
  claimer: { name: string }
  claim_items: { quantity: number; line_items: { name: string; unit: string } }[]
  post: {
    id: string
    org_id: string
    source: 'none' | 'philabundance' | 'share'
    pickup_start: string | null; pickup_end: string | null
    delivery_start: string | null; delivery_end: string | null
    org: { name: string }
  }
}
type PostRow = {
  id: string
  status: string
  source: 'none' | 'philabundance' | 'share'
  expires_at: string
  line_items: { name: string; quantity: number; unit: string }[]
}

const STATUS: Record<ClaimStatus, [string, string]> = {
  awaiting_time: ['Waiting for a new time', 'warn'],
  time_proposed: ['Time proposed', 'info'],
  scheduled: ['Time confirmed', 'good'],
  completed: ['Complete', 'done'],
  released: ['Released', 'done'],
}

export default function Activity() {
  const { org } = useAuth()
  const [claims, setClaims] = useState<ClaimRow[] | null>(null)
  const [posts, setPosts] = useState<PostRow[]>([])
  const [contacts, setContacts] = useState<{ org: string; people: Person[] } | null>(null)
  const [proposing, setProposing] = useState<ClaimRow | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [c, p] = await Promise.all([
      supabase.from('claims')
        .select('id,status,method,proposed_time,claimer_org_id,claimer:organizations!claimer_org_id(name),claim_items(quantity,line_items(name,unit)),post:posts(id,org_id,source,pickup_start,pickup_end,delivery_start,delivery_end,org:organizations(name))')
        .order('created_at', { ascending: false }),
      supabase.from('posts').select('id,status,source,expires_at,line_items(name,quantity,unit)').eq('org_id', org!.id).order('created_at', { ascending: false }).limit(30),
    ])
    setClaims((c.data as unknown as ClaimRow[]) ?? [])
    setPosts((p.data as unknown as PostRow[]) ?? [])
  }, [org])
  useEffect(() => { load() }, [load])

  async function act(fn: string, args: Record<string, unknown>) {
    setErr(null)
    const { error } = await supabase.rpc(fn, args)
    if (error) setErr(error.message)
    await load()
  }

  async function showContacts(orgId: string, name: string) {
    const { data } = await supabase.from('people').select('*').eq('org_id', orgId).eq('active', true)
    setContacts({ org: name, people: (data as Person[]) ?? [] })
  }

  if (!claims) return <Page title="Activity"><p>Loading…</p></Page>
  const open = claims.filter((c) => c.status !== 'completed' && c.status !== 'released')
  const closed = claims.filter((c) => c.status === 'completed' || c.status === 'released')
  const livePosts = posts.filter((p) => p.status === 'live')

  const Card = ({ c }: { c: ClaimRow }) => {
    const mine = c.claimer_org_id === org!.id
    const other = mine ? c.post.org.name : c.claimer.name
    const otherId = mine ? c.post.org_id : c.claimer_org_id
    const [label, tone] = STATUS[c.status]
    const isOpen = c.status !== 'completed' && c.status !== 'released'
    return (
      <div className="panel">
        <div className="row between"><strong>{mine ? `You claimed from ${other}` : `${other} claimed yours`}</strong><span className={`pill ${tone}`}>{label}</span></div>
        <Badge source={c.post.source} />
        <ul className="plain">{c.claim_items.map((ci, i) => <li key={i}>{num(ci.quantity)} {ci.line_items.unit} {ci.line_items.name}</li>)}</ul>
        <p>{c.method === 'pickup' ? '🚗 Pickup' : '🚚 Delivery'}{c.proposed_time ? ` · ${fmtDateTime(c.proposed_time)}` : ''}</p>
        {err && <p className="error">{err}</p>}
        <div className="actions">
          {!mine && c.status === 'time_proposed' && <>
            <button className="btn" onClick={() => act('respond_to_time', { p_claim: c.id, p_accept: true })}>Confirm time</button>
            <button className="btn secondary" onClick={() => act('respond_to_time', { p_claim: c.id, p_accept: false })}>Ask for another</button>
          </>}
          {mine && (c.status === 'awaiting_time' || c.status === 'time_proposed') && (
            <button className="btn secondary" onClick={() => setProposing(c)}>{c.status === 'awaiting_time' ? 'Propose a new time' : 'Change time'}</button>
          )}
          {isOpen && <button className="btn" onClick={() => act('complete_claim', { p_claim: c.id })}>Mark complete</button>}
          <button className="btn secondary" onClick={() => showContacts(otherId, other)}>Contact</button>
          {isOpen && <button className="btn danger" onClick={() => confirm('Release this claim and reopen the food?') && act('release_claim', { p_claim: c.id })}>Release</button>}
        </div>
      </div>
    )
  }

  return (
    <Page title="My activity">
      <h2>Open exchanges</h2>
      {open.length === 0 ? <p className="muted">Nothing open.</p> : open.map((c) => <Card key={c.id} c={c} />)}

      <h2>My live posts</h2>
      {livePosts.length === 0 ? <p className="muted">No live posts.</p> : livePosts.map((p) => (
        <div className="panel" key={p.id}>
          <Badge source={p.source} />
          <ul className="plain">{p.line_items.map((l, i) => <li key={i}>{num(l.quantity)} {l.unit} {l.name}</li>)}</ul>
          <p className="muted">Expires {fmtDateTime(p.expires_at)}</p>
          <button className="btn danger" onClick={() => confirm('Cancel this post? Anyone with a claim will be released.') && act('cancel_post', { p_post: p.id })}>Cancel post</button>
        </div>
      ))}

      {closed.length > 0 && <>
        <h2>History</h2>
        {closed.slice(0, 10).map((c) => <Card key={c.id} c={c} />)}
      </>}

      {proposing && (
        <ProposeSheet claim={proposing} onClose={() => setProposing(null)} onDone={() => { setProposing(null); load() }} />
      )}
      {contacts && (
        <Sheet title={contacts.org} onClose={() => setContacts(null)}>
          <div className="stack">
            {contacts.people.length === 0 && <p>No contacts.</p>}
            {contacts.people.map((p) => (
              <div className="panel" key={p.id}>
                <strong>{p.name}</strong>
                {p.phone ? <p><a href={`tel:${p.phone}`}>{p.phone}</a></p> : <p className="muted">No phone</p>}
                {p.phone && <a className="btn" href={`sms:${p.phone}`}>💬 Text</a>}
              </div>
            ))}
          </div>
        </Sheet>
      )}
    </Page>
  )
}

function ProposeSheet({ claim, onClose, onDone }: { claim: ClaimRow; onClose: () => void; onDone: () => void }) {
  const s = claim.method === 'pickup' ? claim.post.pickup_start : claim.post.delivery_start
  const e = claim.method === 'pickup' ? claim.post.pickup_end : claim.post.delivery_end
  const [t, setT] = useState(toLocalInput(new Date(claim.proposed_time ?? s ?? Date.now())))
  const [err, setErr] = useState<string | null>(null)
  async function go() {
    const { error } = await supabase.rpc('propose_time', { p_claim: claim.id, p_time: fromLocalInput(t) })
    if (error) setErr(error.message)
    else onDone()
  }
  return (
    <Sheet title="Propose a time" onClose={onClose}>
      <div className="stack">
        <p className="muted">Window: {fmtWindow(s, e)}</p>
        <input type="datetime-local" value={t} min={s ? toLocalInput(new Date(s)) : undefined} max={e ? toLocalInput(new Date(e)) : undefined} onChange={(ev) => setT(ev.target.value)} />
        {err && <p className="error">{err}</p>}
        <button className="btn big" onClick={go}>Send</button>
      </div>
    </Sheet>
  )
}
