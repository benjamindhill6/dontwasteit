import type { TimeWindow } from './types'

export const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''

export const fmtDateTime = (s: string | null) =>
  s
    ? new Date(s).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : ''

export const fmtWindow = (a: string | null, b: string | null) => {
  if (!a || !b) return ''
  const s = new Date(a)
  const e = new Date(b)
  const day = s.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return s.toDateString() === e.toDateString() ? `${day}, ${t(s)} – ${t(e)}` : `${fmtDateTime(a)} – ${fmtDateTime(b)}`
}

type WindowCols = {
  pickup_offered?: boolean; pickup_start: string | null; pickup_end: string | null; pickup_windows?: TimeWindow[] | null
  delivery_offered?: boolean; delivery_start: string | null; delivery_end: string | null; delivery_windows?: TimeWindow[] | null
}

/**
 * The windows a post offers for one handoff, sorted. Falls back to the single start/end pair
 * (posts made before multiple windows, or an older database). With onlyOpen, ended windows are dropped.
 */
export function windowsFor(p: WindowCols, method: 'pickup' | 'delivery', onlyOpen = false): TimeWindow[] {
  const offered = method === 'pickup' ? p.pickup_offered : p.delivery_offered
  if (offered === false) return []
  const list = method === 'pickup' ? p.pickup_windows : p.delivery_windows
  const s = method === 'pickup' ? p.pickup_start : p.delivery_start
  const e = method === 'pickup' ? p.pickup_end : p.delivery_end
  const all = list?.length ? list : s && e ? [{ start: s, end: e }] : []
  const now = Date.now()
  return [...all].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()).filter((w) => !onlyOpen || new Date(w.end).getTime() > now)
}

/** Value for <input type="datetime-local"> in local time. */
export const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export const fromLocalInput = (v: string) => new Date(v).toISOString()

/** Form windows (local input strings) to what the database takes, earliest first. */
export const windowsPayload = (list: TimeWindow[]) =>
  list
    .map((w) => ({ start: fromLocalInput(w.start), end: fromLocalInput(w.end) }))
    .sort((a, b) => a.start.localeCompare(b.start))

export const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''))

/** Shrink a photo on the phone before upload. */
export async function compressImage(file: File, maxEdge = 1280, quality = 0.75): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale)
  c.height = Math.round(bmp.height * scale)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Photo failed'))), 'image/jpeg', quality))
}

export const DISTANCE_NOTE = 'Distances are measured as the crow flies (a straight line), not by road.'
