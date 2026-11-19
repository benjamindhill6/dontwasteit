import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { fetchTrips, kindOf, KINDS, soonestFirst, type Kind, type OrgInfo, type Trip } from '../lib/trips'
import { Page, Section } from '../components/Common'
import { ContactSheet } from '../components/ContactSheet'
import { TripCard } from '../components/TripCard'

export default function Transportation() {
  const { org } = useAuth()
  const [trips, setTrips] = useState<Trip[] | null>(null)
  const [contact, setContact] = useState<OrgInfo | null>(null)
  useEffect(() => { fetchTrips().then(setTrips) }, [])

  const back = <Link className="btn link" to="/activity">Back</Link>
  if (!trips) return <Page title="Transportation" action={back}><p>Loading…</p></Page>

  const me = org!.id
  // Businesses can't claim food, so they only make deliveries and get picked up from.
  const kinds: Kind[] = org!.type === 'pantry' ? ['pickup', 'incoming', 'outgoing', 'pickedUp'] : ['outgoing', 'pickedUp']
  const listOf = (k: Kind) => trips.filter((t) => kindOf(t, me) === k).sort(soonestFirst)

  return (
    <Page title="Transportation" action={back}>
      <p className="muted">Everything still open, soonest first. Times are the ones agreed on each claim.</p>
      <Link className="btn secondary cal-link" to="/activity/transportation/calendar">📅 Calendar view</Link>
      {kinds.map((k) => {
        const list = listOf(k)
        return (
          <Section key={k} title={`${KINDS[k].title} (${list.length})`}>
            {list.length === 0 ? <p className="muted">{KINDS[k].empty}</p> : list.map((t) => <TripCard key={t.id} t={t} kind={k} onContact={setContact} />)}
          </Section>
        )
      })}
      {contact && <ContactSheet orgId={contact.id} orgName={contact.name} onClose={() => setContact(null)} />}
    </Page>
  )
}
