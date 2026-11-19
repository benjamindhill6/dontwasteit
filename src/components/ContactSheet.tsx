import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Person } from '../lib/types'
import { Sheet } from './Common'

/** The other pantry's active contacts, with call and text buttons. Used by Activity and Transportation. */
export function ContactSheet({ orgId, orgName, onClose }: { orgId: string; orgName: string; onClose: () => void }) {
  const [people, setPeople] = useState<Person[] | null>(null)
  useEffect(() => {
    supabase.from('people').select('*').eq('org_id', orgId).eq('active', true)
      .then(({ data }) => setPeople((data as Person[]) ?? []))
  }, [orgId])
  return (
    <Sheet title={orgName} onClose={onClose}>
      <div className="stack">
        {people === null && <p>Loading…</p>}
        {people?.length === 0 && <p>No contacts.</p>}
        {people?.map((p) => (
          <div className="panel" key={p.id}>
            <strong>{p.name}</strong>
            {p.phone ? <p><a href={`tel:${p.phone}`}>{p.phone}</a></p> : <p className="muted">No phone</p>}
            {p.phone && <a className="btn" href={`sms:${p.phone}`}>💬 Text</a>}
          </div>
        ))}
      </div>
    </Sheet>
  )
}
