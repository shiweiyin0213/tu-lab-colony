export interface ProductionEnv {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
  VITE_STRIPE_PRICE_ID?: string
  VITE_APP_URL?: string
}

export interface ProductionRuntimeConfig {
  supabaseUrl: string
  supabaseAnonKey: string
  stripePriceId: string
  appUrl: string
  supabaseReady: boolean
  stripeReady: boolean
}

export function getProductionConfig(env: ProductionEnv = import.meta.env as unknown as ProductionEnv): ProductionRuntimeConfig {
  const supabaseUrl = env.VITE_SUPABASE_URL?.trim() ?? ''
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''
  const stripePriceId = env.VITE_STRIPE_PRICE_ID?.trim() ?? ''
  const appUrl = env.VITE_APP_URL?.trim() || 'http://localhost:5174'

  return {
    supabaseUrl,
    supabaseAnonKey,
    stripePriceId,
    appUrl,
    supabaseReady: Boolean(supabaseUrl && supabaseAnonKey),
    stripeReady: Boolean(stripePriceId),
  }
}
