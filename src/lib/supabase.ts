import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configured = Boolean(url && key)
export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing')

/** Call a Supabase Edge Function as the signed-in user; throws with the server's message. */
export async function callFn<T = unknown>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    let msg = error.message
    try {
      const ctx = (error as { context?: Response }).context
      if (ctx) msg = (await ctx.json()).error ?? msg
    } catch { /* keep default */ }
    throw new Error(msg)
  }
  return data as T
}

export function photoUrl(path: string) {
  return supabase.storage.from('post-photos').getPublicUrl(path).data.publicUrl
}
