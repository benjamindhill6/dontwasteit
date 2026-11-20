import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase, photoUrl } from '../lib/supabase'
import { catIcon, catLabel, type FeedCard } from '../lib/types'
import { fmtDate, fromLocalInput, num, toLocalInput, windowsFor } from '../lib/format'
import { Badge, Note, Page, Sheet } from '../components/Common'
import { SlotPicker, WindowSummary } from '../components/TimePickers'

export default function Offers() {
  const [cards, setCards] = useState<FeedCard[] | null>(null)
  const [i, setI] = useState(0)
  const [claiming, setClaiming] = useState<FeedCard | null>(null)
  const [openItem, setOpenItem] = useState<string | null>(null)
  const startX = useRef<number | null>(null)
  const [params, setParams] = useSearchParams()
  const wanted = params.get('post')   // set when someone taps a new-food alert

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('browse_feed')
    if (error) return
    const list = data as FeedCard[]
    if (wanted) {
      const at = list.findIndex((x) => x.id === wanted)
      if (at >= 0) setI(at)
      setParams({}, { replace: true })
    }
    setCards(list)
  }, [wanted, setParams])
  useEffect(() => { load() }, [load])

  if (!cards) return <Page title="Offers"><p>Loading…</p></Page>
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
  const idx = Math.min(i, cards.length - 1)
  const c = cards[idx]
  const go = (d: number) => { setI((idx + d + cards.length) % cards.length); setOpenItem(null) }

  return (
    <Page title="Offers" action={<span className="muted">{idx + 1} of {cards.length}</span>}>
      <article
        className="card"
        onTouchStart={(e) => { startX.current = e.touches[0].clientX }}
        onTouchEnd={(e) => {
          if (startX.current == null) return
          const dx = e.changedTouches[0].clientX - startX.current
          startX.current = null
          if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1)
        }}
      >
        <div className="photo">
          {c.photos.length ? <img src={photoUrl(c.photos[0])} alt={c.items.map((x) => x.name).join(', ')} /> : <span className="photo-fallback">{catIcon(c.items[0]?.category)}</span>}
          <Badge source={c.source} />
        </div>
        <h2>{c.org.name} <span className="muted">· {c.org.city}{c.distance_miles != null ? ` · ${c.distance_miles} mi` : ''}</span></h2>
        <ul className="items">
          {c.items.filter((x) => x.remaining > 0).map((it) => (
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
        <div className="claim-row">
          <p className="note">{c.require_all ? 'Must be taken all together.' : 'Take some or all of it.'}</p>
          <button className="btn" onClick={() => setClaiming(c)}>Claim</button>
        </div>
        <div className="options">
          {c.options.pickup && <WindowSummary icon="🚗" label="Pickup" list={windowsFor(c, 'pickup', true)} />}
          {c.options.delivery && <WindowSummary icon="🚚" label="Delivery" list={windowsFor(c, 'delivery', true)} />}
          <Note />
        </div>
        <div className="pager">
          <button className="btn secondary" onClick={() => go(-1)} aria-label="Previous offer">‹ Prev</button>
          <button className="btn secondary" onClick={() => go(1)} aria-label="Next offer">Next ›</button>
        </div>
      </article>
      {claiming && <ClaimSheet card={claiming} onClose={() => setClaiming(null)} onDone={() => { setClaiming(null); load() }} />}
    </Page>
  )
}

function ClaimSheet({ card, onClose, onDone }: { card: FeedCard; onClose: () => void; onDone: () => void }) {
  const open = card.items.filter((x) => x.remaining > 0)
  const splittable = (it: (typeof open)[number]) => !card.require_all && it.quantity > 1
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(open.map((x) => [x.id, String(x.remaining)])))
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(open.map((x) => [x.id, true])))
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
    <Sheet title="Claim this food" onClose={onClose}>
      <div className="stack">
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
        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn big" disabled={busy} onClick={submit}>Send claim</button>
      </div>
    </Sheet>
  )
}
