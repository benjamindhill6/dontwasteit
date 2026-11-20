import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { supabase } from '../lib/supabase'
import { Link, useSearchParams } from 'react-router-dom'
import { CLAIM_STATUS, type ClaimStatus, type TimeWindow } from '../lib/types'
import { fmtDateTime, fromLocalInput, num, toLocalInput, windowsFor, windowsPayload } from '../lib/format'
import { Badge, Page, Section, Sheet } from '../components/Common'
import { ContactSheet } from '../components/ContactSheet'
import { SlotPicker, WindowSummary, WindowsPicker, defaultWindow, windowsError } from '../components/TimePickers'

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
    pickup_start: string | null; pickup_end: string | null; pickup_windows: TimeWindow[] | null
    delivery_start: string | null; delivery_end: string | null; delivery_windows: TimeWindow[] | null
    org: { name: string }
  }
}
type PostRow = {
  id: string
  status: string
  source: 'none' | 'philabundance' | 'share'
  expires_at: string
  pickup_offered: boolean; pickup_end: string | null
  delivery_offered: boolean; delivery_end: string | null
  line_items: { name: string; quantity: number; unit: string; claim_items: { quantity: number; claim: { status: ClaimStatus } | null }[] }[]
}

/** What is still unclaimed on a line (released claims give their food back). */
const remaining = (l: PostRow['line_items'][number]) =>
  l.quantity - l.claim_items.filter((ci) => ci.claim?.status !== 'released').reduce((n, ci) => n + Number(ci.quantity), 0)

/** Every claim window on the post has ended (other pantries no longer see it). */
const windowsEnded = (p: PostRow, now: number) =>
  !((p.pickup_offered && p.pickup_end && new Date(p.pickup_end).getTime() > now) ||
    (p.delivery_offered && p.delivery_end && new Date(p.delivery_end).getTime() > now))

const lastWindowEnd = (p: PostRow) =>
  [p.pickup_offered ? p.pickup_end : null, p.delivery_offered ? p.delivery_end : null]
    .filter((x): x is string => !!x).sort().pop() ?? null

/** History shows claims closed in the last three months. Older ones stay in the database. */
const HISTORY_MONTHS = 3
const historyCutoff = () => {
  const d = new Date()
  d.setMonth(d.getMonth() - HISTORY_MONTHS)
  return d.toISOString()
}

export default function Activity() {
  const { org } = useAuth()
  const [claims, setClaims] = useState<ClaimRow[] | null>(null)
  const [posts, setPosts] = useState<PostRow[]>([])
  const [contact, setContact] = useState<{ id: string; name: string } | null>(null)
  const [proposing, setProposing] = useState<ClaimRow | null>(null)
  const [relisting, setRelisting] = useState<PostRow | null>(null)
  const [now, setNow] = useState(0)   // when the list was loaded
  const [err, setErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [params, setParams] = useSearchParams()

  const load = useCallback(async () => {
    const since = historyCutoff()
    const [c, p] = await Promise.all([
      supabase.from('claims')
        .select('id,status,method,proposed_time,claimer_org_id,claimer:organizations!claimer_org_id(name),claim_items(quantity,line_items(name,unit)),post:posts(id,org_id,source,pickup_start,pickup_end,pickup_windows,delivery_start,delivery_end,delivery_windows,org:organizations(name))')
        .or(`status.in.(awaiting_time,time_proposed,scheduled),completed_at.gte.${since},released_at.gte.${since}`)
        .order('created_at', { ascending: false }),
      supabase.from('posts').select('id,status,source,expires_at,pickup_offered,pickup_end,delivery_offered,delivery_end,line_items(name,quantity,unit,claim_items(quantity,claim:claims(status)))').eq('org_id', org!.id).order('created_at', { ascending: false }).limit(30),
    ])
    setClaims((c.data as unknown as ClaimRow[]) ?? [])
    setPosts((p.data as unknown as PostRow[]) ?? [])
    setNow(Date.now())
  }, [org])
  useEffect(() => { load() }, [load])

  // A "declined your time" alert links to /activity?propose=<claim id>: open the sheet for it.
  const proposeId = params.get('propose')
  useEffect(() => {
    if (!proposeId || !claims) return
    const c = claims.find((x) => x.id === proposeId)
    if (c && c.claimer_org_id === org!.id && (c.status === 'awaiting_time' || c.status === 'time_proposed')) setProposing(c)
    else if (c?.status === 'scheduled') setNotice('That exchange already has a time set.')
    else setNotice('That exchange is no longer open.')
    setParams((p) => { p.delete('propose'); return p }, { replace: true })
  }, [proposeId, claims, org, setParams])

  async function act(fn: string, args: Record<string, unknown>) {
    setErr(null)
    const { error } = await supabase.rpc(fn, args)
    if (error) setErr(error.message)
    await load()
  }

  if (!claims) return <Page title="Activity"><p>Loading…</p></Page>
  const open = claims.filter((c) => c.status !== 'completed' && c.status !== 'released')
  const closed = claims.filter((c) => c.status === 'completed' || c.status === 'released')
  const isEnded = (p: PostRow) =>
    p.status === 'live' && new Date(p.expires_at).getTime() > now && windowsEnded(p, now) && p.line_items.some((l) => remaining(l) > 0)
  const endedPosts = posts.filter(isEnded)
  const livePosts = posts.filter((p) => p.status === 'live' && !isEnded(p))

  const Card = ({ c }: { c: ClaimRow }) => {
    const mine = c.claimer_org_id === org!.id
    const other = mine ? c.post.org.name : c.claimer.name
    const otherId = mine ? c.post.org_id : c.claimer_org_id
    const [label, tone] = CLAIM_STATUS[c.status]
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
          <button className="btn secondary" onClick={() => setContact({ id: otherId, name: other })}>Contact</button>
          {isOpen && <button className="btn danger" onClick={() => confirm('Release this claim and reopen the food?') && act('release_claim', { p_claim: c.id })}>Release</button>}
        </div>
      </div>
    )
  }

  return (
    <Page title="My activity" action={<Link className="btn secondary head-link" to="/activity/transportation">🚚 Transportation</Link>}>
      {notice && <p className="muted">{notice}</p>}
      <Section title={`Open exchanges (${open.length})`}>
        {open.length === 0 ? <p className="muted">Nothing open.</p> : open.map((c) => <Card key={c.id} c={c} />)}
      </Section>

      {endedPosts.length > 0 && (
        <Section title={`Claim windows ended (${endedPosts.length})`}>
          <p className="muted">Other pantries can't see these anymore. Open a new claim window to offer what's left again, or close the post out.</p>
          {endedPosts.map((p) => (
            <div className="panel" key={p.id}>
              <div className="row between"><strong>Food left over</strong><span className="pill warn">Not on offer</span></div>
              <Badge source={p.source} />
              <ul className="plain">{p.line_items.filter((l) => remaining(l) > 0).map((l, i) => (
                <li key={i}>{num(remaining(l))} {l.unit} {l.name}{remaining(l) < l.quantity ? <span className="muted"> (of {num(l.quantity)})</span> : null}</li>
              ))}</ul>
              <p className="muted">Last window ended {fmtDateTime(lastWindowEnd(p))}. If you do nothing, it closes on its own {fmtDateTime(p.expires_at)}.</p>
              <div className="actions">
                <button className="btn" onClick={() => setRelisting(p)}>New claim window</button>
                <button className="btn secondary" onClick={() => confirm("Close this post out? What's left won't be offered again. Any claims already made stay as they are.") && act('close_post', { p_post: p.id })}>Close out</button>
              </div>
            </div>
          ))}
        </Section>
      )}

      <Section title={`My live posts (${livePosts.length})`}>
        {livePosts.length === 0 ? <p className="muted">No live posts.</p> : livePosts.map((p) => (
          <div className="panel" key={p.id}>
            <Badge source={p.source} />
            <ul className="plain">{p.line_items.map((l, i) => <li key={i}>{num(l.quantity)} {l.unit} {l.name}</li>)}</ul>
            <p className="muted">Expires {fmtDateTime(p.expires_at)}</p>
            <button className="btn danger" onClick={() => confirm('Cancel this post? Anyone with a claim will be released.') && act('cancel_post', { p_post: p.id })}>Cancel post</button>
          </div>
        ))}
      </Section>

      <Section title="History">
        {closed.length === 0 ? <p className="muted">Nothing closed out in the last three months.</p> : closed.map((c) => <Card key={c.id} c={c} />)}
        <p className="muted">History goes back three months. Need something older? Email Ben at <a href="mailto:benjamindhill6@gmail.com">benjamindhill6@gmail.com</a> and he'll pull it for you.</p>
      </Section>

      {relisting && (
        <RelistSheet post={relisting} onClose={() => setRelisting(null)} onDone={() => { setRelisting(null); load() }} />
      )}
      {proposing && (
        <ProposeSheet claim={proposing} onClose={() => setProposing(null)} onDone={() => { setProposing(null); load() }} />
      )}
      {contact && <ContactSheet orgId={contact.id} orgName={contact.name} onClose={() => setContact(null)} />}
    </Page>
  )
}

function ProposeSheet({ claim, onClose, onDone }: { claim: ClaimRow; onClose: () => void; onDone: () => void }) {
  const windows = windowsFor(claim.post, claim.method, true)
  const [t, setT] = useState(toLocalInput(new Date(claim.proposed_time ?? windows[0]?.start ?? Date.now())))
  const [err, setErr] = useState<string | null>(null)
  async function go() {
    const { error } = await supabase.rpc('propose_time', { p_claim: claim.id, p_time: fromLocalInput(t) })
    if (error) setErr(error.message)
    else onDone()
  }
  return (
    <Sheet title="Propose a time" onClose={onClose} footer={<>
      {err && <p className="error">{err}</p>}
      <button className="btn big" onClick={go}>Send</button>
    </>}>
      <div className="stack">
        <div className="muted"><WindowSummary icon={claim.method === 'pickup' ? '🚗' : '🚚'} label={claim.method === 'pickup' ? 'Pickup' : 'Delivery'} list={windows} /></div>
        <SlotPicker windows={windows} value={t} onChange={setT} />
      </div>
    </Sheet>
  )
}

function RelistSheet({ post, onClose, onDone }: { post: PostRow; onClose: () => void; onDone: () => void }) {
  const { org } = useAuth()
  const canDeliver = org?.delivery_miles != null
  const [pickup, setPickup] = useState(post.pickup_offered || !canDeliver)
  const [delivery, setDelivery] = useState(post.delivery_offered && canDeliver)
  const [pw, setPw] = useState<TimeWindow[]>(() => [defaultWindow()])
  const [dw, setDw] = useState<TimeWindow[]>(() => [defaultWindow()])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function go() {
    if (!pickup && !delivery) return setErr('Offer pickup, delivery, or both.')
    const bad = (pickup && windowsError(pw, 'pickup')) || (delivery && windowsError(dw, 'delivery'))
    if (bad) return setErr(bad)
    setBusy(true)
    setErr(null)
    const { error } = await supabase.rpc('relist_post', {
      p_post: post.id,
      p_payload: {
        pickup: pickup ? windowsPayload(pw) : undefined,
        delivery: delivery ? windowsPayload(dw) : undefined,
      },
    })
    setBusy(false)
    if (error) setErr(error.message)
    else onDone()
  }

  return (
    <Sheet title="New claim windows" onClose={onClose} footer={<>
      {err && <p className="error" role="alert">{err}</p>}
      <button className="btn big" disabled={busy} onClick={go}>{busy ? 'Saving…' : 'Offer it again'}</button>
    </>}>
      <div className="stack">
        <p>What's left goes back in Offers for other pantries, and they get an alert the same way they do for a new post.</p>
        <label className="check big-check"><input type="checkbox" checked={pickup} onChange={(e) => setPickup(e.target.checked)} /> 🚗 Pickup at our location</label>
        {pickup && <WindowsPicker what="pickup" value={pw} onChange={setPw} />}
        {canDeliver && (
          <label className="check big-check"><input type="checkbox" checked={delivery} onChange={(e) => setDelivery(e.target.checked)} /> 🚚 We can deliver (up to {org!.delivery_miles} mi)</label>
        )}
        {delivery && <WindowsPicker what="delivery" value={dw} onChange={setDw} />}
        <p className="muted">Stays live for 7 more days.</p>
      </div>
    </Sheet>
  )
}
