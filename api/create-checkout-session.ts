import Stripe from 'stripe'

const stripeSecretKey = process.env.STRIPE_SECRET_KEY
const priceId = process.env.STRIPE_PRICE_ID || process.env.VITE_STRIPE_PRICE_ID
const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:5174'

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  }
  if (!stripeSecretKey || !priceId) {
    return Response.json({ error: 'Stripe is not configured' }, { status: 500 })
  }

  const body = await request.json().catch(() => ({})) as { email?: string; labId?: string }
  const stripe = new Stripe(stripeSecretKey)
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: body.email,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: 15,
      metadata: {
        labId: body.labId ?? '',
      },
    },
    success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/billing/cancel`,
  })

  return Response.json({ url: session.url })
}
