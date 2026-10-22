import { describe, expect, it } from 'vitest'
import { getProductionConfig } from './productionConfig'

describe('productionConfig', () => {
  it('marks production services unavailable until required env keys are present', () => {
    const config = getProductionConfig({})

    expect(config.supabaseReady).toBe(false)
    expect(config.stripeReady).toBe(false)
    expect(config.appUrl).toBe('http://localhost:5174')
  })

  it('detects Supabase and Stripe readiness from Vite and server env keys', () => {
    const config = getProductionConfig({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon',
      VITE_STRIPE_PRICE_ID: 'price_25_monthly',
      VITE_APP_URL: 'https://vivatrace.vercel.app',
    })

    expect(config.supabaseReady).toBe(true)
    expect(config.stripeReady).toBe(true)
    expect(config.appUrl).toBe('https://vivatrace.vercel.app')
  })
})
