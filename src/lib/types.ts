export type Org = {
  id: string
  type: 'pantry' | 'business'
  name: string
  street: string
  city: string
  state: string
  zip: string
  delivery_miles: number | null
  pickup_miles: number | null
  is_philabundance: boolean
  is_share: boolean
  active: boolean
}

export type Person = {
  id: string
  org_id: string | null
  email: string
  name: string
  phone: string | null
  is_platform_admin: boolean
  active: boolean
}

export const CATEGORIES = [
  ['produce', 'Produce', '🥬'],
  ['dairy', 'Dairy', '🥛'],
  ['meat', 'Meat', '🍗'],
  ['frozen', 'Frozen', '🧊'],
  ['shelf_stable', 'Shelf-stable', '🥫'],
  ['bread', 'Bread', '🍞'],
  ['non_food', 'Non-food', '🧴'],
  ['other', 'Other', '📦'],
] as const

export const catLabel = (c: string) => CATEGORIES.find((x) => x[0] === c)?.[1] ?? c
export const catIcon = (c: string) => CATEGORIES.find((x) => x[0] === c)?.[2] ?? '📦'

export type FeedItem = {
  id: string
  name: string
  category: string
  quantity: number
  unit: string
  best_by: string | null
  remaining: number
}

export type FeedCard = {
  id: string
  source: 'none' | 'philabundance' | 'share'
  created_at: string
  expires_at: string
  require_all: boolean
  pickup_offered: boolean
  pickup_start: string | null
  pickup_end: string | null
  delivery_offered: boolean
  delivery_start: string | null
  delivery_end: string | null
  org: { id: string; name: string; city: string; type: string }
  distance_miles: number | null
  options: { pickup: boolean; delivery: boolean }
  items: FeedItem[]
  photos: string[]
}

export type ClaimStatus = 'awaiting_time' | 'time_proposed' | 'scheduled' | 'completed' | 'released'
