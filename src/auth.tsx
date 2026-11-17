import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { Org, Person } from './lib/types'

type Ctx = {
  session: Session | null
  me: Person | null
  org: Org | null
  loading: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthCtx = createContext<Ctx>(null as unknown as Ctx)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [me, setMe] = useState<Person | null>(null)
  const [org, setOrg] = useState<Org | null>(null)
  const [loading, setLoading] = useState(true)
  const loadedFor = useRef<string | null>(null) // user whose profile + org have finished loading

  const load = useCallback(async (s: Session | null) => {
    if (!s) {
      loadedFor.current = null
      setMe(null)
      setOrg(null)
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
    setMe((p as Person) ?? null)
    setOrg(o)
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
    refresh: () => load(session),
    signOut: async () => {
      await supabase.auth.signOut()
    },
  }
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}
