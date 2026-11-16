import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
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

  const load = useCallback(async (s: Session | null) => {
    if (!s) {
      setMe(null)
      setOrg(null)
      setLoading(false)
      return
    }
    const { data: p } = await supabase.from('people').select('*').eq('id', s.user.id).maybeSingle()
    setMe((p as Person) ?? null)
    if (p?.org_id) {
      const { data: o } = await supabase.from('organizations').select('*').eq('id', p.org_id).single()
      setOrg((o as Org) ?? null)
    } else setOrg(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      load(data.session)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
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
