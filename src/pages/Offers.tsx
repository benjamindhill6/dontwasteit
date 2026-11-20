import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase, photoUrl } from '../lib/supabase'
import { CATEGORIES, catIcon, catLabel, type FeedCard } from '../lib/types'
import { fmtDate, fromLocalInput, num, toLocalInput, windowsFor } from '../lib/format'
import { Badge, Note, Page } from '../components/Common'
import { SlotPicker, WindowSummary } from '../components/TimePickers'

const ALL_CATS = CATEGORIES.map((x) => x[0] as string)
const openItems = (c: FeedCard) => c.items.filter((x) => x.remaining > 0)

export default function Offers() {
  const [cards, setCards] = useState<FeedCard[] | null>(null)
  // Position 0 is the category filter; offers start at 1.
  const [i, setI] = useState(0)
  const [cats, setCats] = useState<Set<string>>(() => new Set(ALL_CATS))
  const [openItem, setOpenItem] = useState<string | null>(null)
  const startX = useRef<number | null>(null)
  const [params, setParams] = useSearchParams()
  const wanted = params.get('post')   // set when someone taps a new-food alert
  // The claim page is its own history entry (?claim=<post id>), so the phone's Back button closes it.
  const claimId = params.get('claim')
  const nav = useNavigate()
  const location = useLocation()
  const openClaim = (id: string) => setParams({ claim: id })
  const closeClaim = () => { if (location.key !== 'default') nav(-1); else setParams({}, { replace: true }) }
  useEffect(() => { document.querySelector('.main')?.scrollTo(0, 0) }, [claimId])

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('browse_feed')
    if (error) return
    const list = data as FeedCard[]
    if (wanted) {
      const at = list.findIndex((x) => x.id === wanted)
      if (at >= 0) { setCats(new Set(ALL_CATS)); setI(at + 1) }
      setParams({}, { replace: true })
    }
    setCards(list)
  }, [wanted, setParams])
  useEffect(() => { load() }, [load])

  if (!cards) return <Page title="Offers"><p>Loading…</p></Page>
  const claiming = claimId ? cards.find((x) => x.id === claimId) : undefined
  if (claiming) return <ClaimPage card={claiming} cats={cats} onClose={closeClaim} onDone={() => { closeClaim(); load() }} />
  if (cards.length === 0) {
    return (
      <Page title="Offers">
        <div className="empty">
          <span className="logo big">🥕</span>
          <p>No open offers within your distance right now.</p>
          <button className="btn secondary" onClick={load}>Refresh</button>
        </div>
      </Page>
    )
  }

  // An offer shows when any of its open items is in a checked category.
  const shown = cards.filter((c) => openItems(c).some((x) => cats.has(x.category)))
  const total = shown.length + 1
  const idx = Math.min(i, total - 1)
  const go = (d: number) => { setI((idx + d + total) % total); setOpenItem(null) }
  const toggle = (k: string) => {
    const next = new Set(cats)
    if (next.has(k)) next.delete(k); else next.add(k)
    setCats(next)
  }
  const swipe = {
    onTouchStart: (e: React.TouchEvent) => { startX.current = e.touches[0].clientX },
    onTouchEnd: (e: React.TouchEvent) => {
      if (startX.current == null) return
      const dx = e.changedTouches[0].clientX - startX.current
      startX.current = null
      if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1)
    },
  }

  if (idx === 0) {
    const count = (k: string) => cards.filter((c) => openItems(c).some((x) => x.category === k)).length
    return (
      <Page title="Offers" action={<span className="muted">{shown.length} of {cards.length} offers</span>}>
        <article className="card" {...swipe}>
          <h2>What are you looking for?</h2>
          <div className="cat-filter">
            {CATEGORIES.map(([k, label, icon]) => (
              <label key={k} className="check cat-option">
                <input type="checkbox" checked={cats.has(k)} onChange={() => toggle(k)} />
                <span className="cat-name">{icon} {label}</span>
                <span className="muted">{count(k)}</span>
              </label>
            ))}
          </div>
          <div className="row between">
            <button className="btn link" onClick={() => setCats(new Set(ALL_CATS))}>Check all</button>
            <button className="btn link" onClick={() => setCats(new Set())}>Uncheck all</button>
          </div>
          {shown.length === 0
            ? <p className="note">No offers in the checked categories right now.</p>
            : <button className="btn" onClick={() => go(1)}>See {shown.length} {shown.length === 1 ? 'offer' : 'offers'} ›</button>}
        </article>
      </Page>
    )
  }

  const c = shown[idx - 1]
  // Items in unchecked categories are hidden, unless the offer must be taken all together.
  const items = openItems(c).filter((x) => c.require_all || cats.has(x.category))
  const lead = items[0] ?? openItems(c)[0]

  return (
    <Page title="Offers" action={<span className="muted">{idx} of {shown.length}</span>}>
      <article className="card" {...swipe}>
        <div className="photo">
          {c.photos.length ? <img src={photoUrl(c.photos[0])} alt={c.items.map((x) => x.name).join(', ')} /> : <span className="photo-fallback">{catIcon(lead?.category)}</span>}
          <Badge source={c.source} />
        </div>
        <h2>{c.org.name} <span className="muted">· {c.org.city}{c.distance_miles != null ? ` · ${c.distance_miles} mi` : ''}</span></h2>
        <ul className="items">
          {items.map((it) => (
            <li key={it.id}>
              <button className="item-row" aria-expanded={openItem === it.id} onClick={() => setOpenItem(openItem === it.id ? null : it.id)}>
                <span>{catIcon(it.category)} {it.name}</span>
                <strong>{num(it.remaining)} {it.unit}</strong>
              </button>
              {openItem === it.id && (
                <div className="item-detail">
                  {catLabel(it.category)}{it.best_by ? ` · best by ${fmtDate(it.best_by)}` : ''}
                  {it.remaining < it.quantity ? ` · ${num(it.quantity)} originally` : ''}
                </div>
              )}
            </li>
          ))}
        </ul>
        {items.length < openItems(c).length && (
          <p className="note">{openItems(c).length - items.length} more {openItems(c).length - items.length === 1 ? 'item' : 'items'} in unchecked categories.</p>
        )}
        <div className="claim-row">
          <p className="note">{c.require_all ? 'Must be taken all together.' : 'Take some or all of it.'}</p>
          <button className="btn" onClick={() => openClaim(c.id)}>Claim</button>
        </div>
        <div className="options">
          {c.options.pickup && <WindowSummary icon="🚗" label="Pickup" list={windowsFor(c, 'pickup', true)} />}
          {c.options.delivery && <WindowSummary icon="🚚" label="Delivery" list={windowsFor(c, 'delivery', true)} />}
          <Note />
        </div>
        <div className="pager">
          <button className="btn secondary" onClick={() => go(-1)} aria-label={idx === 1 ? 'Back to filter' : 'Previous offer'}>{idx === 1 ? '‹ Filter' : '‹ Prev'}</button>
          <button className="btn secondary" onClick={() => go(1)} aria-label={idx === shown.length ? 'Back to filter' : 'Next offer'}>{idx === shown.length ? 'Filter ›' : 'Next ›'}</button>
        </div>
      </article>
    </Page>
  )
}

/** Claiming is a full page instead of a pop-up, so short phones get the whole screen and the page just scrolls. */
function ClaimPage({ card, cats, onClose, onDone }: { card: FeedCard; cats: Set<string>; onClose: () => void; onDone: () => void }) {
  const open = card.items.filter((x) => x.remaining > 0)
  const splittable = (it: (typeof open)[number]) => !card.require_all && it.quantity > 1
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(open.map((x) => [x.id, String(x.remaining)])))
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(open.map((x) => [x.id, cats.has(x.category)])))
  const [method, setMethod] = useState<'pickup' | 'delivery'>(card.options.pickup ? 'pickup' : 'delivery')
  const windows = windowsFor(card, method, true)
  const [time, setTime] = useState(() => toLocalInput(new Date(windows[0]?.start ?? Date.now())))
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setErr(null)
    const items = open
      .filter((x) => card.require_all || on[x.id])
      .map((x) => ({ line_item_id: x.id, quantity: Number(qty[x.id]) }))
    const { error } = await supabase.rpc('claim_post', {
      p_post: card.id, p_items: items, p_method: method, p_time: fromLocalInput(time),
    })
    setBusy(false)
    if (error) setErr(error.message)
    else onDone()
  }

  return (
    <Page title="Claim this food" action={<button className="btn link" onClick={onClose}>‹ Back</button>}>
      <div className="stack claim-page">
        <p className="muted claim-from">From <strong>{card.org.name}</strong> · {card.org.city}{card.distance_miles != null ? ` · ${card.distance_miles} mi` : ''}</p>
        {open.map((it) => (
          <div key={it.id} className="claim-line">
            {!card.require_all && (
              <label className="check"><input type="checkbox" checked={on[it.id]} onChange={(e) => setOn({ ...on, [it.id]: e.target.checked })} /> {it.name}</label>
            )}
            {card.require_all && <strong>{it.name}</strong>}
            {splittable(it) ? (
              <label>Quantity ({it.unit}, up to {num(it.remaining)})
                <input type="number" inputMode="decimal" min={0.01} max={it.remaining} step="any" value={qty[it.id]} onChange={(e) => setQty({ ...qty, [it.id]: e.target.value })} />
              </label>
            ) : <span className="muted">{num(it.remaining)} {it.unit} (taken whole)</span>}
          </div>
        ))}
        {card.options.pickup && card.options.delivery && (
          <div className="seg">
            <button className={method === 'pickup' ? 'on' : ''} onClick={() => setMethod('pickup')}>🚗 I'll pick up</button>
            <button className={method === 'delivery' ? 'on' : ''} onClick={() => setMethod('delivery')}>🚚 Deliver to me</button>
          </div>
        )}
        <div className="muted"><WindowSummary icon={method === 'pickup' ? '🚗' : '🚚'} label={method === 'pickup' ? 'Pickup' : 'Delivery'} list={windows} /></div>
        <p className="lbl">Propose a time</p>
        <SlotPicker windows={windows} value={time} onChange={setTime} />
        <p className="note">The poster confirms your time. You'll find it under Activity.</p>
        <p className="disclaimer" role="note">⚠️ Don't Waste It! does not check the condition of any food. The receiving pantry is responsible for inspecting it before accepting it.</p>
        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn big" disabled={busy} onClick={submit}>{busy ? 'Sending…' : 'Send claim'}</button>
        <button className="btn secondary" onClick={onClose}>Cancel</button>
      </div>
    </Page>
  )
}
