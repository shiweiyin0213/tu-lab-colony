# VivaTrace Auth, Onboarding, Trial, and Lab Access Gate Design

## Objective

Turn the current local-first mouse colony app into a protected VivaTrace product experience. Public visitors should see a polished product entry point and onboarding flow. Private TU Lab colony data should only be visible after a user has registered, verified email, started a trial with payment method, found or created a lab workspace, and received the appropriate workspace access.

The first implementation is still an MVP: it may simulate email verification and Stripe/Supabase behavior in the browser, but the UI, state model, and access gates must match the production flow closely enough that real Google OAuth, Supabase Auth, Supabase storage/database, and Stripe Checkout can replace the simulated pieces later.

## Product Name and Positioning

Product name: **VivaTrace**

Positioning: private vivarium records with traceable breeding, genotype evidence, weaning, individual cage availability, work logs, and experiment-use history.

Why this name:

- It avoids obvious direct overlap with known mouse colony tools such as SoftMouse, Transnetyx Colony, mLIMS, Moustra, MouseJ, and MouseHouse.
- It is broader than mouse-only colony management, leaving room for rat or other animal facility workflows.
- "Trace" matches the app's core value: every animal-related event is tracked from parent cage through litter, genotype, wean, individual cage, experiment use, or euthanasia.

This is not a legal trademark clearance. Before commercialization, run a formal trademark/domain/app-store review.

## User Roles

Visitor:
Can see the landing page, guidance tour, sign-in/register entry, and high-level product value. Cannot see colony data.

Registered user:
Has created an account but may not have verified email, started trial, or joined a lab. Cannot see colony data.

Trial user:
Has verified email and started a 15-day trial with a payment method on file. Can create a lab or request access to an existing lab. Cannot see a lab's private data until approved.

Viewer:
Can view approved lab data and dashboards. Cannot modify colony records unless later promoted.

Admin:
Can approve/reject access requests and manage viewer membership.

Owner:
Full workspace control. The PI and current manager can both be owners. Owners can transfer or share admin/owner permissions.

## Access Flow

1. Landing page
   - Shows VivaTrace brand, value proposition, and product preview.
   - Primary action: Start 15-day trial.
   - Secondary action: Sign in.

2. Guidance tour
   - Mobile-friendly, short animated or staged tour.
   - Explains: new litter, genotype with gel evidence, wean transfer, individual availability dashboard, work log.
   - User can skip the tour at any time.
   - Tour completion or skip advances to registration/sign-in.

3. Register/sign in
   - Email registration is supported.
   - Google OAuth is a production target, but can be a disabled/preview connection in MVP.
   - After registration, show email confirmation state.
   - MVP can simulate "email sent" and "verify email" actions; production will use Supabase Auth email confirmation.

4. Trial and payment
   - Trial length: 15 days.
   - Payment card is required before entering a lab workspace flow.
   - Price shown: $25/month after trial.
   - MVP can simulate card binding and trial status.
   - Production will use Stripe Checkout and Stripe customer/subscription state.

5. Lab workspace choice
   - User can search existing lab workspaces.
   - Searching "yaping tu", "tu", or "tu lab" should show **Yaping Tu Lab**.
   - User can request viewer access.
   - User can also create a new lab if this is their first use and they are setting up their own workspace.

6. Pending approval
   - User sees a waiting page after requesting access.
   - No colony data is visible while pending.
   - Owners/admins see pending requests and can approve or reject.

7. Approved workspace
   - After approval, the user can enter the current colony app.
   - All dashboard, breeding, individual, litters, genotype, work log, and future euthanasia features remain inside this protected workspace.

## Data Visibility Rule

No TU Lab seed data, imported data, local storage records, gel evidence, cage records, or dashboard numbers should render before workspace access is approved.

The app may keep static demo marketing screenshots outside auth, but those must not contain real TU Lab cage data.

## Application States

The MVP can model access with a local state object:

- `visitor`
- `tour`
- `registered_unverified`
- `email_verified`
- `trial_needs_card`
- `trial_active`
- `lab_search`
- `lab_access_pending`
- `workspace_approved`

The production implementation should map these to:

- Supabase Auth user/session
- Supabase profile row
- Stripe customer/subscription/trial status
- Workspace membership row
- Workspace access request row

## Main Screens

### Landing Page

First viewport:

- Brand: VivaTrace
- Headline: private vivarium records from breeding to genotype evidence to experiment-ready animals.
- Supporting copy explaining protected lab workspaces.
- Primary CTA: Start 15-day trial.
- Secondary CTA: Sign in.
- Visual preview of dashboard cards, genotype evidence, and lab approval status. Use realistic but non-private demo values.

Design tone:

- Professional, polished, biology/lab appropriate.
- Avoid cartoon mascot styling.
- More "high-end research operations" than "cute mouse app".

### Guidance Tour

Tour cards:

1. Record a new litter and automatically calculate genotype/wean windows.
2. Upload gel photos and enter tattoo-numbered genotype results.
3. Wean only after sex is confirmed, then create individual cages.
4. Find experiment-ready animals by genotype, sex, and age.
5. Keep work visible with logs and approval/audit history.

Controls:

- Next
- Back
- Skip tour
- Start setup

### Auth and Verification

Registration fields:

- Name
- Email
- Password placeholder for MVP or production-ready field layout

States:

- Confirmation email sent
- Verify email button for MVP simulation
- Sign in link

### Trial and Billing

Display:

- 15-day trial
- $25/month afterward
- Card required
- Stripe Checkout connection status

MVP:

- "Bind card" button simulates payment method attached.
- Trial end date is calculated from current date.

Production:

- Button redirects to Stripe Checkout.
- Stripe webhook updates subscription state.

### Find or Create Lab

Two primary paths:

- Find existing lab
  - Search input
  - Result card for Yaping Tu Lab
  - Request viewer access button

- Create new lab
  - Lab name
  - Institution
  - Owner email
  - Create workspace button

### Pending Approval

Display:

- Requested lab name
- Requested role: Viewer
- Status: Pending
- Explanation that private data is hidden until owner approval

### Management Account

Existing Account & Billing page should evolve into workspace administration:

- Owners/admins can view members.
- Owners/admins can approve or reject access requests.
- Owners/admins can remove viewers.
- Future: transfer owner/admin permissions.

## Data Model Additions

MVP local model:

```ts
interface AuthSessionState {
  status:
    | 'visitor'
    | 'tour'
    | 'registered_unverified'
    | 'email_verified'
    | 'trial_needs_card'
    | 'trial_active'
    | 'lab_search'
    | 'lab_access_pending'
    | 'workspace_approved'
  user?: {
    name: string
    email: string
    emailVerified: boolean
  }
  billing?: {
    trialStartedAt?: string
    trialEndsAt?: string
    paymentMethodAttached: boolean
    plan: 'trial' | 'active' | 'past_due'
  }
  selectedWorkspaceId?: string
}
```

Existing `LabWorkspace` and `AccountUser` domain objects can be reused and expanded.

Production model should separate:

- auth users
- profiles
- workspaces
- workspace memberships
- access requests
- subscription/customer records
- colony records
- file attachments

## Architecture

Introduce a top-level access gate before protected colony routes render.

High-level component structure:

- `App`
  - loads colony data
  - loads auth/access state
  - renders `PublicShell` if not approved
  - renders protected colony app only if `workspace_approved`

Suggested public components:

- `VivaTraceLanding`
- `GuidanceTour`
- `AuthCard`
- `TrialBillingGate`
- `LabWorkspaceChooser`
- `PendingApproval`

Suggested domain helpers:

- `domain/authFlow.ts`
  - transition helpers
  - trial date calculation
  - visibility guard

Existing colony dashboard and tables should not need to know about auth. They should sit behind the gate.

## Error Handling

MVP:

- Required fields block submit.
- Invalid email shape shows a small inline error.
- Trial card binding failure can be simulated with a retry state only if needed.
- Search with no result shows "No lab found. Create a lab instead."

Production:

- Auth errors from Supabase are shown inline.
- Stripe failures return users to billing gate with clear retry CTA.
- Access request duplicate attempts show existing pending status.

## Testing

Add React tests for:

- Visitor sees landing page, not dashboard data.
- User can skip guidance and register.
- Registration shows email confirmation state.
- Verified user must bind card before lab search.
- Trial user can find Yaping Tu Lab and request viewer access.
- Pending viewer cannot see colony dashboard.
- Approved viewer can see dashboard.
- User can create a new lab and become owner.
- Owner can approve a viewer request.

Regression requirement:

- Existing colony app tests must continue to pass once the test harness puts the app into `workspace_approved` state.

## Deployment Notes

Static hosting remains valid for the MVP because state is browser-local. Public deployment must not expose real colony seed data before access approval.

Production deployment needs:

- Supabase project
- Supabase Auth email confirmation enabled
- Supabase database tables and RLS policies
- Supabase storage for gel and euthanasia card photos
- Stripe product/price for $25/month
- Stripe Checkout and webhook endpoint
- Optional Google OAuth client

## Out of Scope For This Step

- Real email sending
- Real Stripe charge
- Real Supabase persistence
- Full RLS policy implementation
- Full admin audit log
- Legal trademark clearance

The step should make the flow real in the UI and local state first, so the product can be reviewed before connecting production services.
