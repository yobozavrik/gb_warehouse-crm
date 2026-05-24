import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _supabase: SupabaseClient | null = null
let _serviceSupabase: SupabaseClient | null = null

function getSupabaseUrl(): string {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
  }
  return 'https://supabase.dmytrotovstytskyi.online'
}

function getAnonKey(): string {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  }
  return 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc2MzI0OTcwMCwiZXhwIjo0OTE4OTIzMzAwLCJyb2xlIjoiYW5vbiJ9.PJ-feVraUpYtvUWqDYrNGafyNRRqCSCM35tAVQCrztw'
}

function getServiceKey(): string {
  if (typeof process !== 'undefined' && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY
  }
  return 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc2MzI0OTcwMCwiZXhwIjo0OTE4OTIzMzAwLCJyb2xlIjoic2VydmljZV9yb2xlIn0.QC9C9-CxocHb-jM-lHmXHEjEZV2hCOaSwgfxKLjKoEQ'
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
