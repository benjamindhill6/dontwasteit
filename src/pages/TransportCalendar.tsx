import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { fetchTrips, kindOf, KINDS, soonestFirst, whenOf, type Kind, type OrgInfo, type Trip } from '../lib/trips'
import { Page, Sheet } from '../components/Common'
import { ContactSheet } from '../components/ContactSheet'
import { TripCard } from '../components/TripCard'

const DAYS = 7
const HOUR_PX = 52
const BLOCK_MIN = 50   // claims have one agreed time, not a length, so each shows as a 50 minute block

type Placed = { t: Trip; kind: Kind; at: Date; lane: number; lanes: number }

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const hourLabel = (h: number) => (h === 0 || h === 24 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`)
const shortTime = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).replace(/\s?([AP])M/i, (_, a: string) => a.toLowerCase())

/** Side-by-side lanes for trips whose blocks overlap on the same day. */
function placeDay(items: { t: Trip; kind: Kind; at: Date }[]): Placed[] {
  const sorted = [...items].sort((a, b) => a.at.getTime() - b.at.getTime())
  const out: Placed[] = []
  let group: Placed[] = []
  let groupEnd = 0
  const flush = () => { const n = Math.max(...group.map((g) => g.lane)) + 1; group.forEach((g) => { g.lanes = n }); out.push(...group); group = [] }
  for (const it of sorted) {
    const start = it.at.getTime()
    if (group.length && start >= groupEnd) flush()
    const laneEnds = new Map<number, number>()
    group.forEach((g) => laneEnds.set(g.lane, Math.max(laneEnds.get(g.lane) ?? 0, g.at.getTime() + BLOCK_MIN * 60000)))
    let lane = 0
    while ((laneEnds.get(lane) ?? 0) > start) lane++
    group.push({ ...it, lane, lanes: 1 })
    groupEnd = Math.max(groupEnd, start + BLOCK_MIN * 60000)
  }
  if (group.length) flush()
  return out
}

export default function TransportCalendar() {
  const { org } = useAuth()
  const [trips, setTrips] = useState<Trip[] | null>(null)
  const [open, setOpen] = useState<{ t: Trip; kind: Kind } | null>(null)
  const [contact, setContact] = useState<OrgInfo | null>(null)
  const [loadedAt, setLoadedAt] = useState(0)
  useEffect(() => { fetchTrips().then((ts) => { setLoadedAt(Date.now()); setTrips(ts) }) }, [])

  const back = <Link className="btn link" to="/activity/transportation">Back</Link>
  if (!trips) return <Page title="This week" action={back}><p>Loading…</p></Page>

  const me = org!.id
  const now = new Date(loadedAt)
  const first = startOfDay(now)
  const days = Array.from({ length: DAYS }, (_, i) => addDays(first, i))
  const end = addDays(first, DAYS).getTime()

  const mine = trips.map((t) => ({ t, kind: kindOf(t, me) })).filter((x): x is { t: Trip; kind: Kind } => x.kind !== null)
  const timed = mine.filter((x) => x.t.proposed_time).map((x) => ({ ...x, at: new Date(x.t.proposed_time!) }))
  const thisWeek = timed.filter((x) => x.at.getTime() >= first.getTime() && x.at.getTime() < end)
  const earlier = timed.filter((x) => x.at.getTime() < first.getTime())
  const later = timed.filter((x) => x.at.getTime() >= end)
  const untimed = mine.filter((x) => !x.t.proposed_time).sort((a, b) => soonestFirst(a.t, b.t))

  // Show 8 AM to 6 PM, stretched to fit anything earlier or later.
  const hours = thisWeek.map((x) => x.at.getHours() + x.at.getMinutes() / 60)
  const fromH = Math.min(8, ...hours.map(Math.floor))
  const toH = Math.max(18, ...hours.map((h) => Math.min(24, Math.ceil(h + BLOCK_MIN / 60))))
  const rows = Array.from({ length: toH - fromH }, (_, i) => fromH + i)
  const isToday = (d: Date) => d.getTime() === first.getTime()
  const nowTop = ((now.getHours() + now.getMinutes() / 60) - fromH) * HOUR_PX
  const showNow = now.getHours() >= fromH && now.getHours() < toH

  return (
    <Page title="This week" action={back}>
      <p className="muted">Every pickup and delivery with an agreed time, today and the next six days. Tap one for the details.</p>
      <div className="cal-legend">
        {(Object.keys(KINDS) as Kind[]).map((k) => <span key={k} className={`cal-key k-${k}`}>{KINDS[k].icon} {KINDS[k].short}</span>)}
      </div>

      <div className="cal" style={{ ['--hour' as string]: `${HOUR_PX}px` }}>
        <div className="cal-head">
          <div />
          {days.map((d) => (
            <div key={d.getTime()} className={'cal-day' + (isToday(d) ? ' today' : '')}>
              <span>{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
              <strong>{d.getDate()}</strong>
            </div>
          ))}
        </div>
        <div className="cal-body" style={{ height: rows.length * HOUR_PX }}>
          <div className="cal-hours">{rows.map((h) => <div key={h} style={{ height: HOUR_PX }}>{hourLabel(h)}</div>)}</div>
          {days.map((d) => {
            const placed = placeDay(thisWeek.filter((x) => startOfDay(x.at).getTime() === d.getTime()))
            return (
              <div key={d.getTime()} className={'cal-col' + (isToday(d) ? ' today' : '')}>
                {isToday(d) && showNow && <div className="cal-now" style={{ top: nowTop }} />}
                {placed.map((p) => (
                  <button
                    key={p.t.id}
                    className={`cal-event k-${p.kind}`}
                    style={{
                      top: ((p.at.getHours() + p.at.getMinutes() / 60) - fromH) * HOUR_PX,
                      height: (BLOCK_MIN / 60) * HOUR_PX,
                      left: `${(p.lane / p.lanes) * 100}%`,
                      width: `${100 / p.lanes}%`,
                    }}
                    onClick={() => setOpen(p)}
                    aria-label={`${KINDS[p.kind].title}, ${p.at.toLocaleString()}`}
                  >
                    <span aria-hidden>{KINDS[p.kind].icon}</span>
                    {p.lanes === 1 && <span className="cal-time">{shortTime(p.at)}</span>}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {thisWeek.length === 0 && <p className="muted">Nothing with an agreed time this week.</p>}

      {(untimed.length > 0 || earlier.length > 0) && (
        <div className="stack cal-extra">
          {earlier.length > 0 && <>
            <h2>Time passed, not marked complete ({earlier.length})</h2>
            {earlier.map((x) => <MiniRow key={x.t.id} t={x.t} kind={x.kind} onOpen={setOpen} />)}
          </>}
          {untimed.length > 0 && <>
            <h2>No time set yet ({untimed.length})</h2>
            {untimed.map((x) => <MiniRow key={x.t.id} t={x.t} kind={x.kind} onOpen={setOpen} />)}
          </>}
        </div>
      )}
      {later.length > 0 && <p className="muted cal-extra">{later.length} more after this week. They're on the Transportation lists.</p>}

      {open && (
        <Sheet title={KINDS[open.kind].title} onClose={() => setOpen(null)}>
          <TripCard t={open.t} kind={open.kind} onContact={(o) => { setOpen(null); setContact(o) }} />
        </Sheet>
      )}
      {contact && <ContactSheet orgId={contact.id} orgName={contact.name} onClose={() => setContact(null)} />}
    </Page>
  )
}

function MiniRow({ t, kind, onOpen }: { t: Trip; kind: Kind; onOpen: (x: { t: Trip; kind: Kind }) => void }) {
  const other = kind === 'outgoing' || kind === 'pickedUp' ? t.claimer : t.post.org
  const when = whenOf(t)
  return (
    <button className={`cal-row k-${kind}`} onClick={() => onOpen({ t, kind })}>
      <span aria-hidden>{KINDS[kind].icon}</span>
      <span><strong>{KINDS[kind].short}</strong> · {other.name}</span>
      {t.proposed_time
        ? <span className="muted">{new Date(t.proposed_time).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
        : Number.isFinite(when) && <span className="muted">from {new Date(when).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>}
    </button>
  )
}
