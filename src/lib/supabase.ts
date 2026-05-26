import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _supabase: SupabaseClient | null = null
let _serviceSupabase: SupabaseClient | null = null

function getSupabaseUrl(): string {
  const url = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_SUPABASE_URL : ''
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  return url
}

function getAnonKey(): string {
  const key = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : ''
  if (!key) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set')
  return key
}

function getServiceKey(): string {
  if (typeof process !== 'undefined' && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY
  }
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
}

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(getSupabaseUrl(), getAnonKey(), {
      db: { schema: 'household_chemicals' },
    } as any)
  }
  return _supabase
}

export function getServiceSupabase(): SupabaseClient {
  if (!_serviceSupabase) {
    _serviceSupabase = createClient(getSupabaseUrl(), getServiceKey(), {
      db: { schema: 'household_chemicals' },
    } as any)
  }
  return _serviceSupabase
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    if (prop === 'then') return undefined
    return getSupabase()[prop as keyof SupabaseClient]
  },
})
