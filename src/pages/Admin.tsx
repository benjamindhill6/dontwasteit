import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { callFn, supabase } from '../lib/supabase'
import type { Org } from '../lib/types'
import { Page } from '../components/Common'
import { Contacts, OrgForm } from './Profile'

export default function Admin() {
  const { me } = useAuth()
  const [orgs, setOrgs] = useState<Org[]>([])
  const [sel, setSel] = useState<Org | 'new' | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('organizations').select('*').order('name')
    setOrgs((data as Org[]) ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  if (sel) {
    const org = sel === 'new' ? undefined : sel
    return (
      <Page title={org ? org.name : 'Add organization'} action={<button className="btn link" onClick={() => setSel(null)}>‹ All</button>}>
        <OrgForm key={org?.id ?? 'new'} org={org ?? {}} admin onSaved={() => { load(); if (!org) setSel(null) }} />
        {org && <Contacts orgId={org.id} meId={me!.id} />}
        {org && (
          <button className="btn danger" onClick={async () => {
            await callFn('save-organization', { ...org, active: !org.active })
            await load(); setSel(null)
          }}>{org.active ? 'Deactivate organization' : 'Reactivate organization'}</button>
        )}
      </Page>
    )
  }

  return (
    <Page title="Network" action={<button className="btn" onClick={() => setSel('new')}>+ Add</button>}>
      {orgs.length === 0 && <p className="muted">No organizations yet. Add the first pantry to begin.</p>}
      {orgs.map((o) => (
        <button key={o.id} className="panel list-btn" onClick={() => setSel(o)}>
          <strong>{o.name}</strong> {!o.active && <span className="pill done">Inactive</span>}
          <span className="muted">{o.type === 'pantry' ? 'Pantry' : 'Business'} · {o.city}, {o.state}</span>
        </button>
      ))}
    </Page>
  )
}
