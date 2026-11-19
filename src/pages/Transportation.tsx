import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { supabase } from '../lib/supabase'
import { CLAIM_STATUS, type ClaimStatus, type TimeWindow } from '../lib/types'
import { fmtDateTime, num, windowsFor } from '../lib/format'
import { Badge, Page, Section } from '../components/Common'
import { ContactSheet } from '../components/ContactSheet'
import { WindowSummary } from '../components/TimePickers'

type OrgInfo = { id: string; name: string; street: string; city: string; state: string; zip: string }
type Trip = {
  id: string
  status: ClaimStatus
  method: 'pickup' | 'delivery'
  proposed_time: string | null
  loadedAt: number   // when the list was fetched, for the "time has passed" note
  claimer: OrgInfo
  claim_items: { quantity: number; line_items: { name: string; unit: string } }[]
  post: {
    source: 'none' | 'philabundance' | 'share'
    pickup_start: string | null; pickup_end: string | null; pickup_windows: TimeWindow[] | null
    delivery_start: string | null; delivery_end: string | null; delivery_windows: TimeWindow[] | null
    org: OrgInfo
  }
}

const ORG = 'id,name,street,city,state,zip'
const address = (o: OrgInfo) => `${o.street}, ${o.city}, ${o.state} ${o.zip}`
// Apple Maps links open Apple Maps on iPhone and hand off to Google Maps everywhere else.
const mapLink = (o: OrgInfo) => `https://maps.apple.com/?q=${encodeURIComponent(address(o))}`

/** When the trip happens: the agreed time, or the first open window while a time is still being worked out. */
const whenOf = (t: Trip) => {
  if (t.proposed_time) return new Date(t.proposed_time).getTime()
  const w = windowsFor(t.post, t.method, true)[0] ?? windowsFor(t.post, t.method)[0]
  return w ? new Date(w.start).getTime() : Infinity
}
const soonestFirst = (a: Trip, b: Trip) => whenOf(a) - whenOf(b)

export default function Transportation() {
  const { org } = useAuth()
  const [trips, setTrips] = useState<Trip[] | null>(null)
  const [contact, setContact] = useState<OrgInfo | null>(null)

  useEffect(() => {
    supabase.from('claims')
      .select(`id,status,method,proposed_time,claimer:organizations!claimer_org_id(${ORG}),claim_items(quantity,line_items(name,unit)),post:posts(source,pickup_start,pickup_end,pickup_windows,delivery_start,delivery_end,delivery_windows,org:organizations(${ORG}))`)
      .in('status', ['awaiting_time', 'time_proposed', 'scheduled'])
      .then(({ data }) => {
        const at = Date.now()
        setTrips(((data as unknown as Trip[]) ?? []).map((t) => ({ ...t, loadedAt: at })))
      })
  }, [])

  const back = <Link className="btn link" to="/activity">Back</Link>
  if (!trips) return <Page title="Transportation" action={back}><p>Loading…</p></Page>

  const me = org!.id
  const isPantry = org!.type === 'pantry'
  const pickups = trips.filter((t) => t.method === 'pickup' && t.claimer.id === me).sort(soonestFirst)
  const incoming = trips.filter((t) => t.method === 'delivery' && t.claimer.id === me).sort(soonestFirst)
  const outgoing = trips.filter((t) => t.method === 'delivery' && t.post.org.id === me).sort(soonestFirst)

  return (
    <Page title="Transportation" action={back}>
      <p className="muted">Everything still open, soonest first. Times are the ones agreed on each claim.</p>
      {isPantry && <List title="Pickups I'm doing" list={pickups} kind="pickup" empty="No pickups scheduled." onContact={setContact} />}
      {isPantry && <List title="Deliveries coming to me" list={incoming} kind="incoming" empty="Nothing being delivered to you." onContact={setContact} />}
      <List title="Deliveries I'm making" list={outgoing} kind="outgoing" empty="No deliveries to make." onContact={setContact} />
      {contact && <ContactSheet orgId={contact.id} orgName={contact.name} onClose={() => setContact(null)} />}
    </Page>
  )
}

type Kind = 'pickup' | 'incoming' | 'outgoing'

function Card({ t, kind, onContact }: { t: Trip; kind: Kind; onContact: (o: OrgInfo) => void }) {
  // The pantry on the other end, and the address the driver heads to.
  const other = kind === 'outgoing' ? t.claimer : t.post.org
  const dest = kind === 'incoming' ? t.claimer : other
  const [label, tone] = CLAIM_STATUS[t.status]
  const late = t.proposed_time && new Date(t.proposed_time).getTime() < t.loadedAt
  return (
    <div className="panel">
      <div className="row between">
        <strong>{t.proposed_time ? fmtDateTime(t.proposed_time) : 'No time set yet'}</strong>
        <span className={`pill ${tone}`}>{label}</span>
      </div>
      {late && <p className="muted">This time has passed. Mark it complete in Activity once it's done.</p>}
      {!t.proposed_time && (
        <div className="muted"><WindowSummary icon={t.method === 'pickup' ? '🚗' : '🚚'} label="Windows" list={windowsFor(t.post, t.method, true)} /></div>
      )}
      <p>
        {kind === 'pickup' && <>Pick up from <strong>{other.name}</strong></>}
        {kind === 'incoming' && <><strong>{other.name}</strong> is delivering to you</>}
        {kind === 'outgoing' && <>Deliver to <strong>{other.name}</strong></>}
      </p>
      <p>📍 <a href={mapLink(dest)} target="_blank" rel="noreferrer">{address(dest)}</a></p>
      <Badge source={t.post.source} />
      <ul className="plain">{t.claim_items.map((ci, i) => <li key={i}>{num(ci.quantity)} {ci.line_items.unit} {ci.line_items.name}</li>)}</ul>
      <div className="actions">
        <button className="btn secondary" onClick={() => onContact(other)}>📞 Contact</button>
      </div>
    </div>
  )
}

function List({ title, list, kind, empty, onContact }: { title: string; list: Trip[]; kind: Kind; empty: string; onContact: (o: OrgInfo) => void }) {
  return (
    <Section title={`${title} (${list.length})`}>
      {list.length === 0 ? <p className="muted">{empty}</p> : list.map((t) => <Card key={t.id} t={t} kind={kind} onContact={onContact} />)}
    </Section>
  )
}
