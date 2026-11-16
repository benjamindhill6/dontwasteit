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

/** Value for <input type="datetime-local"> in local time. */
export const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export const fromLocalInput = (v: string) => new Date(v).toISOString()

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
