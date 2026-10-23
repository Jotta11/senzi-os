import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getEnv } from '@/lib/env'

let client: SupabaseClient | null | undefined

/** Cliente único do Supabase; `null` sem variáveis de ambiente (nunca lança no import). */
export function getSupabase(): SupabaseClient | null {
  if (client === undefined) {
    const env = getEnv()
    client = env ? createClient(env.url, env.anonKey) : null
  }
  return client
}
