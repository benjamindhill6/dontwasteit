import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { supabase } from '../lib/supabase'
import { CATEGORIES } from '../lib/types'
import { compressImage, fromLocalInput, toLocalInput } from '../lib/format'
import { Note, Page } from '../components/Common'

type Line = { name: string; category: string; quantity: string; unit: string; best_by: string }
const blank = (): Line => ({ name: '', category: 'produce', quantity: '1', unit: 'boxes', best_by: '' })
const inTwo = (h: number) => toLocalInput(new Date(Date.now() + h * 3600_000))

const STEPS = ['Items', 'Photos', 'Handoff', 'Source', 'Review']

export default function NewPost() {
  const { org } = useAuth()
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const [lines, setLines] = useState<Line[]>([blank()])
  const [requireAll, setRequireAll] = useState(false)
  const [files, setFiles] = useState<{ blob: Blob; url: string }[]>([])
  const [pickup, setPickup] = useState(true)
  const [delivery, setDelivery] = useState(false)
  const [pw, setPw] = useState({ start: inTwo(2), end: inTwo(26) })
  const [dw, setDw] = useState({ start: inTwo(2), end: inTwo(26) })
  const [source, setSource] = useState<'none' | 'philabundance' | 'share'>('none')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!org) return null
  const canDeliver = org.delivery_miles != null
  const sourceOptions = org.type === 'pantry' && (org.is_philabundance || org.is_share)

  const setLine = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  function validate(s: number): string | null {
    if (s === 0) {
      if (lines.some((l) => !l.name.trim() || !l.unit.trim() || !(Number(l.quantity) > 0))) return 'Every item needs a name, a unit and a quantity above zero.'
    }
    if (s === 2) {
      if (!pickup && !delivery) return 'Offer pickup, delivery, or both.'
      if (pickup && !(new Date(pw.end) > new Date(pw.start))) return 'Pickup end must be after the start.'
      if (delivery && !(new Date(dw.end) > new Date(dw.start))) return 'Delivery end must be after the start.'
    }
    return null
  }

  function next() {
    const e = validate(step)
    setErr(e)
    if (e) return
    // Skip the source step when there's nothing to choose.
    setStep(step === 2 && !sourceOptions ? 4 : step + 1)
  }
  const back = () => { setErr(null); setStep(step === 4 && !sourceOptions ? 2 : step - 1) }

  async function addPhotos(list: FileList | null) {
    if (!list) return
    const room = 3 - files.length
    const added = []
    for (const f of Array.from(list).slice(0, room)) {
      const blob = await compressImage(f)
      added.push({ blob, url: URL.createObjectURL(blob) })
    }
    setFiles([...files, ...added])
  }

  async function submit() {
    setBusy(true)
    setErr(null)
    try {
      const paths: string[] = []
      for (const f of files) {
        const path = `${org!.id}/${crypto.randomUUID()}.jpg`
        const { error } = await supabase.storage.from('post-photos').upload(path, f.blob, { contentType: 'image/jpeg' })
        if (error) throw error
        paths.push(path)
      }
      const { error } = await supabase.rpc('create_surplus_post', {
        p_payload: {
          items: lines.map((l) => ({ ...l, quantity: Number(l.quantity) })),
          require_all: requireAll,
          photos: paths,
          source,
          pickup: pickup ? { start: fromLocalInput(pw.start), end: fromLocalInput(pw.end) } : undefined,
          delivery: delivery ? { start: fromLocalInput(dw.start), end: fromLocalInput(dw.end) } : undefined,
        },
      })
      if (error) throw error
      nav('/activity')
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Page title="New surplus post">
      <ol className="steps" aria-label="Progress">
        {STEPS.map((s, i) => <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''}>{s}</li>)}
      </ol>

      {step === 0 && (
        <div className="stack">
          {lines.map((l, i) => (
            <div className="panel" key={i}>
              <label>What is it?<input value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} placeholder="e.g. Romaine lettuce" /></label>
              <label>Category
                <select value={l.category} onChange={(e) => setLine(i, { category: e.target.value })}>
                  {CATEGORIES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
              </label>
              <div className="row">
                <label>Quantity<input type="number" inputMode="decimal" min="0" step="any" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} /></label>
                <label>Unit<input value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} placeholder="boxes, cases, bags" /></label>
              </div>
              <label>Best by (optional)<input type="date" value={l.best_by} onChange={(e) => setLine(i, { best_by: e.target.value })} /></label>
              {lines.length > 1 && <button className="btn link" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove this item</button>}
            </div>
          ))}
          <button className="btn secondary" onClick={() => setLines([...lines, blank()])}>+ Add another item</button>
          <label className="check big-check">
            <input type="checkbox" checked={requireAll} onChange={(e) => setRequireAll(e.target.checked)} />
            Claimers must take everything together
          </label>
          <p className="note">Set an item's quantity to 1 to make it go whole. Higher quantities can be split.</p>
        </div>
      )}

      {step === 1 && (
        <div className="stack">
          <p>Up to three photos. A photo helps, but it's optional.</p>
          <div className="thumbs">
            {files.map((f, i) => (
              <div key={f.url} className="thumb"><img src={f.url} alt={`Photo ${i + 1}`} />
                <button className="btn link" onClick={() => setFiles(files.filter((_, j) => j !== i))}>Remove</button></div>
            ))}
          </div>
          {files.length < 3 && (
            <label className="btn secondary filebtn">📷 Add a photo
              <input type="file" accept="image/*" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = '' }} />
            </label>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="stack">
          <label className="check big-check"><input type="checkbox" checked={pickup} onChange={(e) => setPickup(e.target.checked)} /> 🚗 Pickup at our location</label>
          {pickup && <WindowFields w={pw} set={setPw} />}
          {canDeliver && (
            <label className="check big-check"><input type="checkbox" checked={delivery} onChange={(e) => setDelivery(e.target.checked)} /> 🚚 We can deliver (up to {org.delivery_miles} mi)</label>
          )}
          {delivery && <WindowFields w={dw} set={setDw} />}
          {!canDeliver && <p className="note">Add a delivery distance to your profile if you can deliver.</p>}
          <Note />
        </div>
      )}

      {step === 3 && (
        <div className="stack">
          <p>Where did this food come from? It applies to the whole post, so mixed-source food is two posts.</p>
          <div className="seg vertical">
            <button className={source === 'none' ? 'on' : ''} onClick={() => setSource('none')}>Neither</button>
            {org.is_philabundance && <button className={source === 'philabundance' ? 'on' : ''} onClick={() => setSource('philabundance')}>Philabundance</button>}
            {org.is_share && <button className={source === 'share' ? 'on' : ''} onClick={() => setSource('share')}>SHARE</button>}
          </div>
          {source !== 'none' && <p className="note">For the first two hours, only that provider's client pantries will see it.</p>}
        </div>
      )}

      {step === 4 && (
        <div className="stack">
          <div className="panel">
            <ul className="plain">{lines.map((l, i) => <li key={i}><strong>{l.quantity} {l.unit}</strong> {l.name}</li>)}</ul>
            {requireAll && <p className="note">Must be taken together.</p>}
            <p>📷 {files.length} photo{files.length === 1 ? '' : 's'}</p>
            <p>{pickup && '🚗 Pickup '}{delivery && '🚚 Delivery'}</p>
            <p>Source: {source === 'none' ? 'Neither' : source === 'share' ? 'SHARE' : 'Philabundance'}</p>
            <p className="muted">Stays live for 7 days.</p>
          </div>
        </div>
      )}

      {err && <p className="error" role="alert">{err}</p>}
      <div className="nav-row">
        {step > 0 && <button className="btn secondary" onClick={back} disabled={busy}>Back</button>}
        {step < 4 ? <button className="btn" onClick={next}>Next</button> : <button className="btn" onClick={submit} disabled={busy}>{busy ? 'Posting…' : 'Post it'}</button>}
      </div>
    </Page>
  )
}

function WindowFields({ w, set }: { w: { start: string; end: string }; set: (v: { start: string; end: string }) => void }) {
  return (
    <div className="panel">
      <label>From<input type="datetime-local" value={w.start} onChange={(e) => set({ ...w, start: e.target.value })} /></label>
      <label>Until<input type="datetime-local" value={w.end} onChange={(e) => set({ ...w, end: e.target.value })} /></label>
    </div>
  )
}
