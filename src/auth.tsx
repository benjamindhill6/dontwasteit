import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { forgetPushDevice } from './lib/push'
import type { Org, Person } from './lib/types'
import { PRIVACY, TERMS } from './legal/documents'

type Ctx = {
  session: Session | null
  me: Person | null
  org: Org | null
  loading: boolean
  /** True once this person has agreed to the current User Agreement and Privacy Policy. */
  agreed: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthCtx = createContext<Ctx>(null as unknown as Ctx)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [me, setMe] = useState<Person | null>(null)
  const [org, setOrg] = useState<Org | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(true)
  const loadedFor = useRef<string | null>(null) // user whose profile + org have finished loading

  const load = useCallback(async (s: Session | null) => {
    if (!s) {
      loadedFor.current = null
      setMe(null)
      setOrg(null)
      setAgreed(false)
      setLoading(false)
      return
    }
    const { data: p } = await supabase.from('people').select('*').eq('id', s.user.id).maybeSingle()
    // Fetch the org before publishing either, so the app never sees a person without their org
    // (that gap made the default redirect pick the wrong landing page).
    let o: Org | null = null
    if (p?.org_id) {
      const res = await supabase.from('organizations').select('*').eq('id', p.org_id).single()
      o = (res.data as Org) ?? null
    }
    // Has this person agreed to the current version of both documents?
    let ok = false
    if (p?.active) {
      const { data: rows } = await supabase.from('agreements').select('document, version').eq('person_id', s.user.id)
      const has = (d: { id: string; version: string }) => (rows ?? []).some((r) => r.document === d.id && r.version === d.version)
      ok = has(TERMS) && has(PRIVACY)
    }
    setMe((p as Person) ?? null)
    setOrg(o)
    setAgreed(ok)
    loadedFor.current = s.user.id
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      load(data.session)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      // A different user just signed in: hold the loading screen until their profile is ready.
      if (s && loadedFor.current !== s.user.id) setLoading(true)
      // Defer to avoid deadlocking inside the auth callback.
      setTimeout(() => load(s), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [load])

  const value: Ctx = {
    session,
    me,
    org,
    loading,
    agreed,
    refresh: () => load(session),
    signOut: async () => {
      await forgetPushDevice()
      await supabase.auth.signOut()
    },
  }
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}
