import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
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

/** A bottom sheet. It is rendered straight into <body> so it always covers the tab bar
    (inside .main it was trapped under the bar on iOS). The head and the optional footer stay
    put and only the middle scrolls, so a footer action such as Send claim is always on screen. */
export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="btn link" onClick={onClose}>Close</button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
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
