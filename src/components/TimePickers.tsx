import { useEffect, useMemo } from 'react'
import { fmtWindow, toLocalInput } from '../lib/format'
import type { TimeWindow } from '../lib/types'

// Day chips + short time dropdowns. All values are local "YYYY-MM-DDTHH:mm" strings,
// the same format <input type="datetime-local"> used, so callers keep using fromLocalInput().

const STEP = 30 // minutes
const FIRST = 6 * 60 // earliest start offered when posting
const LAST_START = 22 * 60
const LAST_END = 23 * 60 + 30
const DAYS = 7 // posts expire after 7 days

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const at = (day: Date, mins: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, mins)
const minsOf = (d: Date) => d.getHours() * 60 + d.getMinutes()
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

const dayLabel = (d: Date) => {
  const today = startOfDay(new Date())
  const diff = Math.round((startOfDay(d).getTime() - today.getTime()) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' })
}
const timeLabel = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
const minsLabel = (m: number) => timeLabel(at(new Date(), m))

function Chips({ days, selected, onPick }: { days: Date[]; selected: Date; onPick: (d: Date) => void }) {
  return (
    <div className="chips" role="group" aria-label="Day">
      {days.map((d) => (
        <button type="button" key={d.getTime()} className={sameDay(d, selected) ? 'chip on' : 'chip'} aria-pressed={sameDay(d, selected)} onClick={() => onPick(d)}>
          {dayLabel(d)}
        </button>
      ))}
    </div>
  )
}

/** Days still available for a new window (today only while some start slot remains). */
function postingDays(): Date[] {
  const today = startOfDay(new Date())
  const out: Date[] = []
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i)
    if (i > 0 || startSlots(d).length) out.push(d)
  }
  return out
}

function startSlots(day: Date): number[] {
  const now = Date.now()
  const out: number[] = []
  for (let m = FIRST; m <= LAST_START; m += STEP) if (at(day, m).getTime() > now) out.push(m)
  return out
}

/**
 * Default window for a new post: starts two hours from now (rounded up to the next half hour)
 * and runs two hours. Too late in the day for that to fit, it falls back to tomorrow 9am to 5pm.
 */
export function defaultWindow() {
  const soon = new Date(Date.now() + 2 * 3600_000)
  const day = startOfDay(soon)
  const from = Math.ceil(minsOf(soon) / STEP) * STEP
  if (from >= FIRST && from <= LAST_START && sameDay(day, at(day, from))) {
    return { start: toLocalInput(at(day, from)), end: toLocalInput(at(day, Math.min(from + 120, LAST_END))) }
  }
  const t = startOfDay(new Date())
  const tomorrow = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1)
  return { start: toLocalInput(at(tomorrow, 9 * 60)), end: toLocalInput(at(tomorrow, 17 * 60)) }
}

/** Pick a day, a start time and an end time (same day). */
export function WindowPicker({ value, onChange }: { value: { start: string; end: string }; onChange: (v: { start: string; end: string }) => void }) {
  const days = useMemo(postingDays, [])
  const start = new Date(value.start)
  const day = startOfDay(start)
  const fromMin = minsOf(start)
  const toMin = sameDay(start, new Date(value.end)) ? minsOf(new Date(value.end)) : fromMin + 120
  const starts = startSlots(day)
  const ends: number[] = []
  for (let m = fromMin + STEP; m <= LAST_END; m += STEP) ends.push(m)

  const emit = (d: Date, f: number, t: number) => onChange({ start: toLocalInput(at(d, f)), end: toLocalInput(at(d, t)) })
  const clampEnd = (f: number, t: number) => (t > f ? t : Math.min(f + 120, LAST_END))

  function pickDay(d: Date) {
    const slots = startSlots(d)
    const f = slots.includes(fromMin) ? fromMin : (slots.find((m) => m >= fromMin) ?? slots[slots.length - 1] ?? fromMin)
    emit(d, f, clampEnd(f, toMin))
  }

  return (
    <div className="panel">
      <Chips days={days} selected={day} onPick={pickDay} />
      <div className="row">
        <label>From
          <select value={fromMin} onChange={(e) => { const f = Number(e.target.value); emit(day, f, clampEnd(f, toMin)) }}>
            {starts.map((m) => <option key={m} value={m}>{minsLabel(m)}</option>)}
          </select>
        </label>
        <label>Until
          <select value={toMin} onChange={(e) => emit(day, fromMin, Number(e.target.value))}>
            {ends.map((m) => <option key={m} value={m}>{minsLabel(m)}</option>)}
          </select>
        </label>
      </div>
    </div>
  )
}

/**
 * A next window to suggest when "Add another window" is tapped: the same hours one day after the
 * last window, while that day is still within the post's 7 days. Otherwise the usual default.
 */
function nextWindow(list: TimeWindow[]): TimeWindow {
  const last = list[list.length - 1]
  if (last) {
    const s = new Date(last.start)
    const e = new Date(last.end)
    const day = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1)
    if (postingDays().some((d) => sameDay(d, day))) {
      return { start: toLocalInput(at(day, minsOf(s))), end: toLocalInput(at(day, minsOf(e))) }
    }
  }
  return defaultWindow()
}

/** One or more windows. One is the default; "Add another window" adds more (up to 10). */
export function WindowsPicker({ value, onChange, what }: { value: TimeWindow[]; onChange: (v: TimeWindow[]) => void; what: 'pickup' | 'delivery' }) {
  const set = (i: number, w: TimeWindow) => onChange(value.map((x, j) => (j === i ? w : x)))
  return (
    <div className="stack">
      {value.map((w, i) => (
        <div key={i} className="stack">
          {value.length > 1 && (
            <div className="row between">
              <p className="lbl">{what === 'pickup' ? 'Pickup' : 'Delivery'} window {i + 1}</p>
              <button type="button" className="btn link" onClick={() => onChange(value.filter((_, j) => j !== i))}>Remove</button>
            </div>
          )}
          <WindowPicker value={w} onChange={(v) => set(i, v)} />
        </div>
      ))}
      {value.length < 10 && (
        <button type="button" className="btn secondary" onClick={() => onChange([...value, nextWindow(value)])}>
          + Add another {what} window
        </button>
      )}
    </div>
  )
}

/** A problem with a list of windows from WindowsPicker, or null when they're fine. */
export function windowsError(list: TimeWindow[], what: 'pickup' | 'delivery'): string | null {
  const name = what === 'pickup' ? 'Pickup' : 'Delivery'
  if (list.some((w) => !(new Date(w.end) > new Date(w.start)))) return `${name} end must be after the start.`
  const sorted = [...list].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  for (let i = 1; i < sorted.length; i++) {
    if (new Date(sorted[i].start) < new Date(sorted[i - 1].end)) return `${name} windows can't overlap. Change or remove one.`
  }
  return null
}

/** Pick one time inside any of the windows (ISO strings). Used when proposing a pickup/delivery time. */
export function SlotPicker({ windows, value, onChange }: { windows: TimeWindow[]; value: string; onChange: (v: string) => void }) {
  const key = windows.map((w) => `${w.start}/${w.end}`).join(',')
  const slots = useMemo(() => {
    const now = Date.now()
    const out: Date[] = []
    for (const part of key ? key.split(',') : []) {
      const [a, b] = part.split('/')
      const lo = Math.max(new Date(a).getTime(), now)
      const hi = new Date(b).getTime()
      if (lo > hi) continue
      out.push(new Date(lo))
      for (let t = Math.ceil(lo / (STEP * 60_000)) * STEP * 60_000; t < hi; t += STEP * 60_000) if (t > lo) out.push(new Date(t))
      if (hi > lo) out.push(new Date(hi))
    }
    out.sort((x, y) => x.getTime() - y.getTime())
    return out.filter((d, i) => i === 0 || d.getTime() !== out[i - 1].getTime())
  }, [key])

  const selected = slots.find((s) => toLocalInput(s) === value) ?? slots[0]
  useEffect(() => {
    if (selected && toLocalInput(selected) !== value) onChange(toLocalInput(selected))
  }, [selected, value, onChange])

  if (!selected) return <p className="error">{windows.length > 1 ? 'These windows have' : 'This window has'} already passed.</p>

  const days: Date[] = []
  slots.forEach((s) => { if (!days.some((d) => sameDay(d, s))) days.push(startOfDay(s)) })
  const forDay = slots.filter((s) => sameDay(s, selected))

  return (
    <div className="stack">
      {days.length > 1 && (
        <Chips days={days} selected={selected} onPick={(d) => onChange(toLocalInput(slots.find((s) => sameDay(s, d))!))} />
      )}
      <label>Time
        <select value={toLocalInput(selected)} onChange={(e) => onChange(e.target.value)}>
          {forDay.map((s) => <option key={s.getTime()} value={toLocalInput(s)}>{timeLabel(s)}</option>)}
        </select>
      </label>
    </div>
  )
}

/** Shows one handoff's windows: one line for a single window, a short list for several. */
export function WindowSummary({ icon, label, list }: { icon: string; label: string; list: TimeWindow[] }) {
  const sorted = [...list].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  if (sorted.length === 0) return null
  if (sorted.length === 1) return <p>{icon} <strong>{label}</strong> {fmtWindow(sorted[0].start, sorted[0].end)}</p>
  return (
    <div>
      <p>{icon} <strong>{label}</strong>, any of these times:</p>
      <ul className="plain windows">{sorted.map((w) => <li key={w.start}>{fmtWindow(w.start, w.end)}</li>)}</ul>
    </div>
  )
}
