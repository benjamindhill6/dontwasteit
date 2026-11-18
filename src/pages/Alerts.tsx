import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { supabase } from '../lib/supabase'
import { pushState, turnOffPush, turnOnPush, type PushState } from '../lib/push'
import { CATEGORIES, type AlertRules } from '../lib/types'
import { Page } from '../components/Common'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ALL_CATS = CATEGORIES.map((c) => c[0] as string)
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
const hourLabel = (h: number) => (h === 0 || h === 24 ? '12 AM' : h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`)
const ALWAYS_ON = 'You always get alerts about your own posts and claims: a claim, a time proposed, accepted or declined, a post you claimed changing or being cancelled, or a claim released.'

const Back = () => <Link className="btn link" to="/profile">‹ Profile</Link>

/** Alerts home: turn alerts on for this phone, then pick which settings to change. */
export default function Alerts() {
  const { org } = useAuth()
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const pantry = org?.type === 'pantry'

  useEffect(() => { pushState().then(setState) }, [])

  async function on() {
    setBusy(true); setErr(null); setMsg(null)
    try { setState(await turnOnPush()) } catch (x) { setErr((x as Error).message) }
    setBusy(false)
  }
  async function off() {
    setBusy(true); setErr(null); setMsg(null)
    try { await turnOffPush(); setState('off') } catch (x) { setErr((x as Error).message) }
    setBusy(false)
  }
  async function test() {
    setErr(null)
    const { error } = await supabase.rpc('send_test_alert')
    if (error) setErr(error.message)
    else setMsg('Test alert sent. It should show up in a few seconds.')
  }

  return (
    <Page title="Alerts" action={<Link className="btn link" to="/profile">‹ Profile</Link>}>
      <div className="stack panel">
        <h2>This phone</h2>
        {state === null && <p>Checking…</p>}
        {state === 'ios-install' && <>
          <p className="big-text">On iPhone, alerts only work once the app is on your Home Screen.</p>
          <ol className="big-list">
            <li>Tap the <strong>Share</strong> button at the bottom of Safari.</li>
            <li>Tap <strong>Add to Home Screen</strong>.</li>
            <li>Open Don't Waste It! from your Home Screen and come back here.</li>
          </ol>
        </>}
        {state === 'unsupported' && <p className="big-text">This browser can't get alerts. Try Chrome on Android, or Safari on iPhone with the app on your Home Screen.</p>}
        {state === 'denied' && <>
          <p className="big-text">Alerts are blocked for this app.</p>
          <p>Turn them back on in your phone's settings: find Don't Waste It! (or this browser) under Notifications and allow them. Then come back here.</p>
        </>}
        {state === 'off' && <>
          <p className="big-text">Alerts are off on this phone.</p>
          <button className="btn big" disabled={busy} onClick={on}>{busy ? 'Turning on…' : 'Turn on alerts'}</button>
        </>}
        {state === 'on' && <>
          <p className="big-text ok">Alerts are on for this phone.</p>
          <button className="btn big secondary" onClick={test}>Send me a test alert</button>
          <button className="btn link" disabled={busy} onClick={off}>Turn off alerts on this phone</button>
        </>}
        {msg && <p className="ok">{msg}</p>}
        {err && <p className="error" role="alert">{err}</p>}
      </div>

      {pantry && <p className="note">Which new food you hear about is set on your Profile, under My alerts and Pantry alerts.</p>}
      <p className="note">{ALWAYS_ON}</p>
    </Page>
  )
}

// ---------------------------------------------------------------- shared pieces

function useRuleState(initial: AlertRules) {
  const [r, setR] = useState<AlertRules>(initial)
  return [r, (patch: Partial<AlertRules>) => setR((x) => ({ ...x, ...patch }))] as const
}

/** Chips for a subset of `options`. `undefined` = all of them. */
function Pick<T extends string | number>({ options, value, label, onChange }: {
  options: T[]; value: T[] | undefined; label: (o: T) => string; onChange: (v: T[] | undefined) => void
}) {
  const chosen = value ? options.filter((o) => value.includes(o)) : options
  const all = chosen.length === options.length
  const toggle = (o: T) => {
    const next = chosen.includes(o) ? chosen.filter((x) => x !== o) : [...chosen, o]
    onChange(next.length === options.length ? undefined : next)
  }
  return (
    <div className="chips big">
      <button type="button" className={'chip' + (all ? ' on' : '')} onClick={() => onChange(undefined)}>All</button>
      {options.map((o) => (
        <button type="button" key={String(o)} className={'chip' + (!all && chosen.includes(o) ? ' on' : '')}
          onClick={() => (all ? onChange([o]) : toggle(o))}>{label(o)}</button>
      ))}
    </div>
  )
}

const catName = (c: string) => CATEGORIES.find((x) => x[0] === c)?.[1] ?? c
const catChip = (c: string) => { const x = CATEGORIES.find((y) => y[0] === c); return x ? `${x[2]} ${x[1]}` : c }

function OnOff({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="seg">
      <button type="button" className={value ? 'on' : ''} onClick={() => onChange(true)}>On</button>
      <button type="button" className={!value ? 'on' : ''} onClick={() => onChange(false)}>Off</button>
    </div>
  )
}

function Handoff({ value, options, onChange }: { value: AlertRules['handoff']; options: NonNullable<AlertRules['handoff']>[]; onChange: (v: AlertRules['handoff']) => void }) {
  const names = { any: 'Pickup or delivery', delivery: 'Delivery only', pickup: 'Pickup only' }
  return (
    <div className="seg vertical">
      {options.map((o) => (
        <button type="button" key={o} className={(value ?? 'any') === o ? 'on' : ''} onClick={() => onChange(o)}>{names[o]}</button>
      ))}
    </div>
  )
}

function SaveBar({ busy, msg, err, disabled }: { busy: boolean; msg: string | null; err: string | null; disabled?: boolean }) {
  return <>
    {msg && <p className="ok">{msg}</p>}
    {err && <p className="error" role="alert">{err}</p>}
    <button className="btn big" disabled={busy || disabled}>{busy ? 'Saving…' : 'Save'}</button>
  </>
}

// ---------------------------------------------------------------- pantry rules

export function PantryAlertRules() {
  const { org, refresh } = useAuth()
  const nav = useNavigate()
  const [r, set] = useRuleState(org?.notif_rules ?? {})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  if (!org) return null
  const enabled = r.enabled ?? true

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null); setMsg(null)
    const { error } = await supabase.rpc('update_org_notif_rules', { p_org: org!.id, p_rules: r })
    setBusy(false)
    if (error) { setErr(error.message); return }
    await refresh()
    nav('/profile', { replace: true })
  }

  return (
    <Page title="Pantry alerts" action={<Back />}>
      <form className="stack" onSubmit={save}>
        <p className="note">These apply to everyone at {org.name}.</p>
        <div className="stack panel">
          <h2>New food alerts</h2>
          <OnOff value={enabled} onChange={(v) => set({ enabled: v })} />
          {!enabled && <p>Nobody at your pantry gets alerts for new food. You can still browse Offers.</p>}
        </div>
        {enabled && <>
          <div className="stack panel">
            <h2>Food types</h2>
            <Pick options={ALL_CATS} value={r.categories} label={catChip} onChange={(v) => set({ categories: v })} />
          </div>
          <div className="stack panel">
            <h2>Days</h2>
            <p className="note">Alerts only come on these days.</p>
            <Pick options={ALL_DAYS} value={r.days} label={(d) => DAYS[d]} onChange={(v) => set({ days: v })} />
          </div>
          <div className="stack panel">
            <h2>How you get food</h2>
            <Handoff value={r.handoff} options={['any', 'delivery', 'pickup']} onChange={(v) => set({ handoff: v })} />
            <p className="note">Delivery only means you hear about food only when the poster can bring it to you.</p>
          </div>
        </>}
        <SaveBar busy={busy} msg={msg} err={err} disabled={(r.categories?.length === 0) || (r.days?.length === 0)} />
        {(r.categories?.length === 0 || r.days?.length === 0) && <p className="note">Pick at least one food type and one day, or turn alerts off.</p>}
      </form>
    </Page>
  )
}

// ---------------------------------------------------------------- personal limits

export function MyAlertLimits() {
  const { me, org, refresh } = useAuth()
  const nav = useNavigate()
  const [r, set] = useRuleState(me?.notif_prefs ?? {})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  if (!me || !org) return null
  const base = org.notif_rules ?? {}
  const pantryOn = base.enabled ?? true
  const enabled = r.enabled ?? true
  // Only offer what the pantry allows, so a person can narrow but never widen.
  const cats = base.categories ? ALL_CATS.filter((c) => base.categories!.includes(c)) : ALL_CATS
  const days = base.days ? ALL_DAYS.filter((d) => base.days!.includes(d)) : ALL_DAYS
  const timed = r.start_hour != null && r.end_hour != null
  const myCats = r.categories?.filter((c) => cats.includes(c))
  const myDays = r.days?.filter((d) => days.includes(d))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('update_my_notif_prefs', { p_prefs: r })
    setBusy(false)
    if (error) { setErr(error.message); return }
    await refresh()
    nav('/profile', { replace: true })
  }

  if (!pantryOn) {
    return (
      <Page title="My alerts" action={<Back />}>
        <div className="stack panel">
          <p className="big-text">New food alerts are off for your whole pantry.</p>
          <p>Any contact can turn them back on under Pantry alert rules.</p>
        </div>
      </Page>
    )
  }

  return (
    <Page title="My alerts" action={<Back />}>
      <form className="stack" onSubmit={save}>
        <p className="note">Just for you, on top of the pantry rules.</p>
        <div className="stack panel">
          <h2>New food alerts for me</h2>
          <OnOff value={enabled} onChange={(v) => set({ enabled: v })} />
        </div>
        {enabled && <>
          <div className="stack panel">
            <h2>Time of day</h2>
            <div className="seg">
              <button type="button" className={!timed ? 'on' : ''} onClick={() => set({ start_hour: undefined, end_hour: undefined })}>Any time</button>
              <button type="button" className={timed ? 'on' : ''} onClick={() => set({ start_hour: 8, end_hour: 20 })}>Only between</button>
            </div>
            {timed && (
              <div className="row">
                <label>From
                  <select value={r.start_hour} onChange={(e) => set({ start_hour: Number(e.target.value) })}>
                    {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
                  </select>
                </label>
                <label>Until
                  <select value={r.end_hour} onChange={(e) => set({ end_hour: Number(e.target.value) })}>
                    {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
                  </select>
                </label>
              </div>
            )}
            <p className="note">Eastern time. New food posted outside these hours won't buzz you, but it still shows under Offers.</p>
          </div>
          {cats.length > 1 && (
            <div className="stack panel">
              <h2>Food types</h2>
              <Pick options={cats} value={myCats && myCats.length === cats.length ? undefined : myCats} label={catChip}
                onChange={(v) => set({ categories: v })} />
            </div>
          )}
          {cats.length === 1 && <p className="note">Your pantry only gets alerts for {catName(cats[0])}.</p>}
          {days.length > 1 && (
            <div className="stack panel">
              <h2>Days</h2>
              <Pick options={days} value={myDays && myDays.length === days.length ? undefined : myDays} label={(d) => DAYS[d]}
                onChange={(v) => set({ days: v })} />
            </div>
          )}
          {(base.handoff ?? 'any') === 'any' && (
            <div className="stack panel">
              <h2>How you get food</h2>
              <Handoff value={r.handoff} options={['any', 'delivery', 'pickup']} onChange={(v) => set({ handoff: v })} />
            </div>
          )}
        </>}
        <SaveBar busy={busy} msg={null} err={err} disabled={(myCats?.length === 0) || (myDays?.length === 0)} />
        <p className="note">{ALWAYS_ON}</p>
      </form>
    </Page>
  )
}

// ---------------------------------------------------------------- Profile sections

const dayList = (d: number[] | undefined) => (!d ? 'Every day' : d.length ? [...d].sort().map((x) => DAYS[x]).join(', ') : 'No days')
const catList = (c: string[] | undefined) => (!c ? 'All food types' : c.length ? c.map(catName).join(', ') : 'No food types')
const handoffText = (h: AlertRules['handoff']) => (h === 'delivery' ? 'Delivery only' : h === 'pickup' ? 'Pickup only' : 'Pickup or delivery')

function Summary({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="summary">
      {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  )
}

/** Profile section: this person's alerts (phone on/off plus personal limits). */
export function MyAlertsSection() {
  const { me, org } = useAuth()
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { pushState().then(setState) }, [])
  const pantry = org?.type === 'pantry'
  const r = me?.notif_prefs ?? {}
  const base = org?.notif_rules ?? {}

  async function on() {
    setBusy(true); setErr(null)
    try { setState(await turnOnPush()) } catch (x) { setErr((x as Error).message) }
    setBusy(false)
  }

  const phone = {
    on: 'On for this phone',
    off: 'Off on this phone',
    denied: 'Blocked in your phone settings',
    'ios-install': 'Add the app to your Home Screen first',
    unsupported: "This browser can't get alerts",
  }

  return (
    <div className="stack panel">
      <h2>🔔 My alerts</h2>
      <p className={'big-text' + (state === 'on' ? ' ok' : '')}>{state ? phone[state] : 'Checking…'}</p>
      {state === 'off' && <button className="btn" disabled={busy} onClick={on}>{busy ? 'Turning on…' : 'Turn on alerts'}</button>}
      {err && <p className="error" role="alert">{err}</p>}
      {pantry && (
        (base.enabled ?? true)
          ? (r.enabled ?? true)
            ? <Summary rows={[
                ['Time of day', r.start_hour != null && r.end_hour != null ? `${hourLabel(r.start_hour)} to ${hourLabel(r.end_hour)}` : 'Any time'],
                ['Food types', r.categories ? catList(r.categories) : 'Same as the pantry'],
                ['Days', r.days ? dayList(r.days) : 'Same as the pantry'],
                ['How', r.handoff && r.handoff !== 'any' ? handoffText(r.handoff) : 'Same as the pantry'],
              ]} />
            : <p>New food alerts are off for you.</p>
          : <p>New food alerts are off for your whole pantry.</p>
      )}
      {pantry && <Link className="btn secondary" to="/profile/alerts/mine">Change my alerts</Link>}
      <Link className="btn link" to="/profile/alerts">Phone setup and test alert</Link>
      <p className="note">{pantry ? 'Your settings only narrow the pantry alerts below, never widen them. ' : ''}{ALWAYS_ON}</p>
    </div>
  )
}

/** Profile section: the pantry's base alert rules, shared by every contact. */
export function PantryAlertsSection() {
  const { org } = useAuth()
  if (!org || org.type !== 'pantry') return null
  const r = org.notif_rules ?? {}
  const providers = [org.is_philabundance && 'Philabundance', org.is_share && 'SHARE'].filter(Boolean).join(' and ')
  return (
    <div className="stack panel">
      <h2>🔔 Pantry alerts</h2>
      <p className="note">For everyone at {org.name}.</p>
      {(r.enabled ?? true)
        ? <Summary rows={[['Food types', catList(r.categories)], ['Days', dayList(r.days)], ['How', handoffText(r.handoff)]]} />
        : <p className="big-text">New food alerts are off for the whole pantry.</p>}
      <p className="note">{providers
        ? `As a ${providers} client, you hear about ${providers} food during its first 2 hours, before other pantries.`
        : 'Philabundance and SHARE food reaches you after its first 2 hours, when it opens to every pantry.'}</p>
      <Link className="btn secondary" to="/profile/alerts/pantry">Change pantry alerts</Link>
    </div>
  )
}
