import { supabase } from './supabase'
import { windowsFor } from './format'
import type { ClaimStatus, TimeWindow } from './types'

export type OrgInfo = { id: string; name: string; street: string; city: string; state: string; zip: string }
export type Trip = {
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

/** Which way the food moves, from my pantry's point of view. */
export type Kind = 'pickup' | 'incoming' | 'outgoing' | 'pickedUp'

export const KINDS: Record<Kind, { title: string; short: string; icon: string; empty: string }> = {
  pickup: { title: "Pickups I'm doing", short: 'I pick up', icon: '🚗', empty: 'No pickups scheduled.' },
  incoming: { title: 'Deliveries coming to me', short: 'Coming to me', icon: '📥', empty: 'Nothing being delivered to you.' },
  outgoing: { title: "Deliveries I'm making", short: 'I deliver', icon: '🚚', empty: 'No deliveries to make.' },
  pickedUp: { title: 'Pickups from me', short: 'Picked up from me', icon: '📤', empty: 'Nobody is picking up from you.' },
}

export function kindOf(t: Trip, me: string): Kind | null {
  if (t.claimer.id === me) return t.method === 'pickup' ? 'pickup' : 'incoming'
  if (t.post.org.id === me) return t.method === 'pickup' ? 'pickedUp' : 'outgoing'
  return null
}

const ORG = 'id,name,street,city,state,zip'

/** Every open claim involving my pantry (the claims policy already limits it to mine). */
export async function fetchTrips(): Promise<Trip[]> {
  const { data } = await supabase.from('claims')
    .select(`id,status,method,proposed_time,claimer:organizations!claimer_org_id(${ORG}),claim_items(quantity,line_items(name,unit)),post:posts(source,pickup_start,pickup_end,pickup_windows,delivery_start,delivery_end,delivery_windows,org:organizations(${ORG}))`)
    .in('status', ['awaiting_time', 'time_proposed', 'scheduled'])
  const at = Date.now()
  return ((data as unknown as Trip[]) ?? []).map((t) => ({ ...t, loadedAt: at }))
}

export const address = (o: OrgInfo) => `${o.street}, ${o.city}, ${o.state} ${o.zip}`
// Apple Maps links open Apple Maps on iPhone and hand off to Google Maps everywhere else.
export const mapLink = (o: OrgInfo) => `https://maps.apple.com/?q=${encodeURIComponent(address(o))}`

/** When the trip happens: the agreed time, or the first open window while a time is still being worked out. */
export const whenOf = (t: Trip) => {
  if (t.proposed_time) return new Date(t.proposed_time).getTime()
  const w = windowsFor(t.post, t.method, true)[0] ?? windowsFor(t.post, t.method)[0]
  return w ? new Date(w.start).getTime() : Infinity
}
export const soonestFirst = (a: Trip, b: Trip) => whenOf(a) - whenOf(b)
