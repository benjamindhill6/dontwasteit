import { CLAIM_STATUS } from '../lib/types'
import { fmtDateTime, num, windowsFor } from '../lib/format'
import { address, mapLink, type Kind, type OrgInfo, type Trip } from '../lib/trips'
import { Badge } from './Common'
import { WindowSummary } from './TimePickers'

/** One pickup or delivery: time, who, where, what, and a Contact button. */
export function TripCard({ t, kind, onContact }: { t: Trip; kind: Kind; onContact: (o: OrgInfo) => void }) {
  // The pantry on the other end, and where the food changes hands:
  // the poster's place for pickups, the claimer's for deliveries.
  const other = kind === 'outgoing' || kind === 'pickedUp' ? t.claimer : t.post.org
  const dest = t.method === 'pickup' ? t.post.org : t.claimer
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
        {kind === 'pickedUp' && <><strong>{other.name}</strong> is picking up from you</>}
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
