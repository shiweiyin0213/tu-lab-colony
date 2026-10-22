import { createClient } from '@supabase/supabase-js'
import { getProductionConfig } from './productionConfig'

const config = getProductionConfig()

export const supabase = config.supabaseReady
  ? createClient(config.supabaseUrl, config.supabaseAnonKey)
  : null

export function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  return supabase
}
