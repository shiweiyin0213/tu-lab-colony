# VivaTrace Production Launch Checklist

## What Is Real Now

The app has production-ready integration points for:

- Supabase Auth: email confirmation and Google OAuth.
- Supabase Postgres: labs, members, join requests, cages, litters, work logs, and evidence files.
- Supabase Storage: private `evidence` bucket for gel and card photos.
- Stripe Checkout: 15-day subscription trial, then `$25/month`.
- Vercel: browser app plus `/api/create-checkout-session`.

The app still keeps the local-first demo path so it works before keys are configured.

## Supabase Setup

1. Create a Supabase project.
2. Open SQL Editor and run `supabase/schema.sql`.
3. In Authentication settings:
   - Enable email confirmations.
   - Enable Google provider.
   - Add redirect URL: `https://YOUR_VERCEL_DOMAIN/auth/callback`.
   - For local testing also add: `http://localhost:5174/auth/callback`.
4. Copy project URL and anon key into Vercel environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

## Where To See Backend Data

In Supabase Dashboard:

- Registered users: `Authentication > Users`
- Lab list: `Table Editor > labs`
- Members and roles: `Table Editor > lab_members`
- Join requests waiting for approval: `Table Editor > lab_join_requests`
- Gel/card photos: `Storage > evidence`
- Colony data tables: `breeding_cages`, `individual_cages`, `litters`, `work_entries`

Owners/admins can approve requests from the app later. The database approval function is already named:

```sql
select public.approve_lab_join_request('REQUEST_UUID_HERE');
```

## Stripe Setup

1. Create a Stripe product named `VivaTrace`.
2. Create a recurring monthly price: `$25/month`.
3. Copy the price ID into:
   - `VITE_STRIPE_PRICE_ID`
   - `STRIPE_PRICE_ID`
4. Copy the restricted/test secret key into:
   - `STRIPE_SECRET_KEY`

The checkout endpoint creates subscriptions with `trial_period_days: 15`.

## Vercel Setup

1. Push the repo to GitHub.
2. Import the project into Vercel as a Vite app.
3. Add environment variables from `.env.example`.
4. Deploy.

Vercel will host the app at a normal URL, so lab members can open it from any computer or phone.

## Monday Demo Recommendation

For Monday, use test-mode credentials:

- Supabase test project.
- Stripe test product and test price.
- Vercel preview deployment.

Show this flow:

1. Public VivaTrace landing page.
2. New user signs up or Google signs in.
3. User searches `Yaping Tu Lab`.
4. User requests viewer access.
5. Owner/admin sees request and approves.
6. Viewer can see dashboard only after approval.
7. Gel/card photos upload into private storage.
