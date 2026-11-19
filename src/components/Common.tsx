import type { ReactNode } from 'react'
import { DISTANCE_NOTE } from '../lib/format'

export const Note = () => <p className="note">📏 {DISTANCE_NOTE}</p>

export function Badge({ source }: { source: 'none' | 'philabundance' | 'share' }) {
  if (source === 'none') return null
  return <span className={`badge ${source}`}>{source === 'philabundance' ? 'Philabundance' : 'SHARE'}</span>
}

export function Page({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="page">
      <header className="page-head">
        <h1>{title}</h1>
        {action}
      </header>
      {children}
    </section>
  )
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="btn link" onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** A collapsible section (Profile, Activity). Starts closed on each visit. */
export function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <details className="section">
      <summary>{title}</summary>
      <div className="stack section-body">{children}</div>
    </details>
  )
}
