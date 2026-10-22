# VivaTrace Auth Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a protected VivaTrace public entry flow so real colony data is hidden until a user completes registration, email verification, 15-day trial/card setup, lab access request, and owner approval.

**Architecture:** Add a small local auth/access state machine in `src/domain/authFlow.ts`, a public onboarding shell in `src/features/auth/PublicAccessGate.tsx`, and mount it before the existing colony app renders. Keep existing colony tables and dashboards unchanged behind the `workspace_approved` gate. MVP actions simulate email, card, and approval locally while preserving production-shaped seams for Supabase and Stripe later.

**Tech Stack:** React 19, TypeScript, Vite, date-fns, Testing Library/Vitest, localStorage.

---

## File Structure

- Create `src/domain/authFlow.ts`: local auth state types and transition helpers.
- Create `src/domain/authFlow.test.ts`: unit tests for trial dates, lab search, access visibility, and transitions.
- Create `src/features/auth/PublicAccessGate.tsx`: landing page, guidance tour, registration, email verification, trial/card gate, lab search/create lab, pending approval.
- Create `src/features/auth/auth.css`: polished responsive VivaTrace public flow styles with light motion.
- Modify `src/App.tsx`: add `authState`, render `PublicAccessGate` until approved, preserve existing protected app after approval, pass owner approval actions.
- Modify `src/App.test.tsx`: adjust existing tests to start in approved mode; add integration tests for public flow and data hiding.
- Modify `src/domain/account.ts`: change trial length from 7 days to 15 days and expose `createLabWorkspace` helper for non-TU labs.
- Modify `src/domain/account.test.ts`: update trial test and add create lab/search behavior.
- Modify `src/App.css`: rename visible brand from Colony Ops to VivaTrace where protected app still uses the brand block.
- Modify `README.md`: document MVP auth gate and production integrations.

---

## Task 1: Auth Flow Domain

**Files:**
- Create: `src/domain/authFlow.ts`
- Create: `src/domain/authFlow.test.ts`

- [ ] **Step 1: Write the failing unit tests**

Create `src/domain/authFlow.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  bindPaymentMethod,
  canViewColonyData,
  createInitialAuthState,
  createLabAccessRequest,
  markEmailVerified,
  registerAuthUser,
  searchLabDirectory,
  startTrialForUser,
} from './authFlow'

describe('authFlow', () => {
  it('hides colony data for visitors and pending users', () => {
    expect(canViewColonyData(createInitialAuthState())).toBe(false)

    const registered = registerAuthUser(createInitialAuthState(), 'Lab Member', 'member@example.com')
    const verified = markEmailVerified(registered)
    const trial = startTrialForUser(bindPaymentMethod(verified), '2026-06-20')
    const pending = createLabAccessRequest(trial, 'tu-lab')

    expect(canViewColonyData(pending)).toBe(false)
    expect(canViewColonyData({ ...pending, status: 'workspace_approved' })).toBe(true)
  })

  it('calculates a 15-day trial after payment method is attached', () => {
    const state = registerAuthUser(createInitialAuthState(), 'Lab Member', 'member@example.com')
    const verified = markEmailVerified(state)
    const paid = bindPaymentMethod(verified)
    const trial = startTrialForUser(paid, '2026-06-20')

    expect(trial.status).toBe('lab_search')
    expect(trial.billing?.paymentMethodAttached).toBe(true)
    expect(trial.billing?.trialStartedAt).toBe('2026-06-20')
    expect(trial.billing?.trialEndsAt).toBe('2026-07-05')
  })

  it('finds Yaping Tu Lab from common search terms', () => {
    expect(searchLabDirectory('tu').map((lab) => lab.name)).toContain('Yaping Tu Lab')
    expect(searchLabDirectory('yaping tu').map((lab) => lab.id)).toEqual(['tu-lab'])
    expect(searchLabDirectory('unknown lab')).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```bash
npm test -- src/domain/authFlow.test.ts
```

Expected: FAIL because `src/domain/authFlow.ts` does not exist.

- [ ] **Step 3: Implement the auth flow domain**

Create `src/domain/authFlow.ts`:

```ts
import { addDays, format, parseISO } from 'date-fns'

export type AuthFlowStatus =
  | 'visitor'
  | 'tour'
  | 'registered_unverified'
  | 'email_verified'
  | 'trial_needs_card'
  | 'lab_search'
  | 'lab_access_pending'
  | 'workspace_approved'

export interface AuthFlowUser {
  name: string
  email: string
  emailVerified: boolean
}

export interface AuthFlowBilling {
  trialStartedAt?: string
  trialEndsAt?: string
  paymentMethodAttached: boolean
  plan: 'trial' | 'active' | 'past_due'
}

export interface LabDirectoryEntry {
  id: string
  name: string
  institution: string
}

export interface AuthSessionState {
  status: AuthFlowStatus
  user?: AuthFlowUser
  billing?: AuthFlowBilling
  selectedWorkspaceId?: string
  pendingWorkspaceName?: string
}

export const labDirectory: LabDirectoryEntry[] = [
  { id: 'tu-lab', name: 'Yaping Tu Lab', institution: 'TU Lab workspace' },
]

export function createInitialAuthState(): AuthSessionState {
  return { status: 'visitor' }
}

export function startTour(state: AuthSessionState): AuthSessionState {
  return { ...state, status: 'tour' }
}

export function registerAuthUser(state: AuthSessionState, name: string, email: string): AuthSessionState {
  return {
    ...state,
    status: 'registered_unverified',
    user: { name: name.trim(), email: email.trim().toLowerCase(), emailVerified: false },
    billing: { paymentMethodAttached: false, plan: 'trial' },
  }
}

export function markEmailVerified(state: AuthSessionState): AuthSessionState {
  if (!state.user) return state
  return {
    ...state,
    status: 'trial_needs_card',
    user: { ...state.user, emailVerified: true },
  }
}

export function bindPaymentMethod(state: AuthSessionState): AuthSessionState {
  return {
    ...state,
    billing: { ...state.billing, paymentMethodAttached: true, plan: 'trial' },
  }
}

export function startTrialForUser(state: AuthSessionState, todayIso: string): AuthSessionState {
  if (!state.billing?.paymentMethodAttached) return { ...state, status: 'trial_needs_card' }
  return {
    ...state,
    status: 'lab_search',
    billing: {
      ...state.billing,
      paymentMethodAttached: true,
      plan: 'trial',
      trialStartedAt: todayIso,
      trialEndsAt: format(addDays(parseISO(todayIso), 15), 'yyyy-MM-dd'),
    },
  }
}

export function searchLabDirectory(query: string): LabDirectoryEntry[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return []
  return labDirectory.filter((lab) => `${lab.name} ${lab.institution}`.toLowerCase().includes(normalized))
}

export function createLabAccessRequest(state: AuthSessionState, workspaceId: string): AuthSessionState {
  const workspace = labDirectory.find((lab) => lab.id === workspaceId)
  return {
    ...state,
    status: 'lab_access_pending',
    selectedWorkspaceId: workspaceId,
    pendingWorkspaceName: workspace?.name ?? 'Selected lab',
  }
}

export function approveWorkspaceAccess(state: AuthSessionState): AuthSessionState {
  return { ...state, status: 'workspace_approved' }
}

export function createOwnedLabWorkspace(state: AuthSessionState, workspaceName: string): AuthSessionState {
  return {
    ...state,
    status: 'workspace_approved',
    selectedWorkspaceId: workspaceName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    pendingWorkspaceName: workspaceName.trim(),
  }
}

export function canViewColonyData(state: AuthSessionState): boolean {
  return state.status === 'workspace_approved'
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run:

```bash
npm test -- src/domain/authFlow.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/authFlow.ts src/domain/authFlow.test.ts
git commit -m "feat: add vivatrace auth flow domain"
```

---

## Task 2: Account Domain Trial Length and Lab Creation

**Files:**
- Modify: `src/domain/account.ts`
- Modify: `src/domain/account.test.ts`

- [ ] **Step 1: Write failing tests**

In `src/domain/account.test.ts`, update the trial expectation to 15 days and add a create-lab test:

```ts
it('starts a 15-day trial for workspace billing', () => {
  const workspace = createOwnerWorkspace('owner@example.com', 'Owner', '2026-06-20')
  const trial = startTrial(workspace, '2026-06-20')

  expect(trial.billing.status).toBe('Trialing')
  expect(trial.billing.trialEndsAt).toBe('2026-07-05')
})

it('creates a new owner lab workspace', () => {
  const workspace = createLabWorkspace('My New Lab', 'pi@example.com', 'PI Name', '2026-06-20')

  expect(workspace.name).toBe('My New Lab')
  expect(workspace.ownerEmail).toBe('pi@example.com')
  expect(workspace.members[0]).toMatchObject({ email: 'pi@example.com', role: 'Owner' })
  expect(workspace.billing.monthlyPriceUsd).toBe(25)
})
```

Add `createLabWorkspace` to the import list.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- src/domain/account.test.ts
```

Expected: FAIL because trial still ends after 7 days and `createLabWorkspace` does not exist.

- [ ] **Step 3: Implement minimal account changes**

In `src/domain/account.ts`, add:

```ts
export function createLabWorkspace(name: string, ownerEmail: string, ownerName: string, nowIso: string): LabWorkspace {
  const owner = registerUser(ownerName, ownerEmail)
  return {
    id: stableId(name),
    name: name.trim(),
    ownerEmail: owner.email,
    members: [{ id: owner.id, name: owner.name, email: owner.email, role: 'Owner' }],
    requests: [],
    billing: {
      status: 'Not started',
      monthlyPriceUsd: 25,
      paymentProvider: 'Stripe Checkout',
      cardStoredInApp: false,
      trialStartedAt: nowIso,
    },
  }
}
```

Change `startTrial`:

```ts
trialEndsAt: format(addDays(parseISO(todayIso), 15), 'yyyy-MM-dd'),
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm test -- src/domain/account.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/account.ts src/domain/account.test.ts
git commit -m "feat: support 15 day trials and lab creation"
```

---

## Task 3: Public Access Gate UI

**Files:**
- Create: `src/features/auth/PublicAccessGate.tsx`
- Create: `src/features/auth/auth.css`
- Test through: `src/App.test.tsx`

- [ ] **Step 1: Write failing integration tests**

At the top of `src/App.test.tsx`, add helper:

```ts
function approveWorkspaceForTest() {
  localStorage.setItem('vivatrace-auth-state-v1', JSON.stringify({ status: 'workspace_approved' }))
}
```

Do not call this helper in the new public-flow tests.

Add tests:

```ts
describe('vivatrace public access gate', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows the VivaTrace landing page and hides colony data from visitors', () => {
    render(<App />)

    expect(screen.getByText('VivaTrace')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start 15-day trial' })).toBeInTheDocument()
    expect(screen.queryByText('Breeding cages')).not.toBeInTheDocument()
    expect(screen.queryByText('153 mice recorded')).not.toBeInTheDocument()
  })

  it('lets a user register, verify email, bind card, and request access to Yaping Tu Lab', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Start 15-day trial' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lab Member' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'member@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(screen.getByText('Confirmation email sent')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'I verified my email' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bind card and start trial' }))

    expect(screen.getByText('Trial active until Jul 5, 2026')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Find lab'), { target: { value: 'yaping tu' } })
    fireEvent.click(screen.getByRole('button', { name: 'Request viewer access to Yaping Tu Lab' }))

    expect(screen.getByText('Access request pending')).toBeInTheDocument()
    expect(screen.queryByText('153 mice recorded')).not.toBeInTheDocument()
  })

  it('lets a first-time user create their own lab workspace', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Start 15-day trial' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'PI Name' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'pi@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    fireEvent.click(screen.getByRole('button', { name: 'I verified my email' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bind card and start trial' }))

    fireEvent.click(screen.getByRole('button', { name: 'Create a new lab' }))
    fireEvent.change(screen.getByLabelText('Lab name'), { target: { value: 'Demo Immunology Lab' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create lab workspace' }))

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Demo Immunology Lab')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- src/App.test.tsx -t "vivatrace public access gate"
```

Expected: FAIL because app still renders the protected dashboard immediately.

- [ ] **Step 3: Implement the public access component**

Create `src/features/auth/PublicAccessGate.tsx`:

```tsx
import { useState } from 'react'
import { CalendarCheck, CheckCircle2, FlaskConical, LockKeyhole, Search, ShieldCheck, SkipForward, Sparkles } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import {
  bindPaymentMethod,
  createLabAccessRequest,
  createOwnedLabWorkspace,
  markEmailVerified,
  registerAuthUser,
  searchLabDirectory,
  startTour,
  startTrialForUser,
  type AuthSessionState,
} from '../../domain/authFlow'
import './auth.css'

interface PublicAccessGateProps {
  state: AuthSessionState
  todayIso: string
  onStateChange: (state: AuthSessionState) => void
}

export function PublicAccessGate({ state, todayIso, onStateChange }: PublicAccessGateProps) {
  const [tourIndex, setTourIndex] = useState(0)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [labQuery, setLabQuery] = useState('')
  const [newLabName, setNewLabName] = useState('')
  const [creatingLab, setCreatingLab] = useState(false)
  const results = searchLabDirectory(labQuery)
  const trialEndsAt = state.billing?.trialEndsAt ? format(parseISO(state.billing.trialEndsAt), 'MMM d, yyyy') : ''

  if (state.status === 'tour') {
    const cards = [
      ['Record litters', 'Calculate genotype and P21 windows automatically.'],
      ['Keep gel evidence', 'Upload raw gel images with tattoo-numbered results.'],
      ['Transfer safely', 'Wean only after sex is confirmed.'],
      ['Find usable mice', 'Filter by line, genotype, sex, and age.'],
      ['Show the work', 'Every change becomes visible operational history.'],
    ]
    const card = cards[tourIndex]
    return (
      <main className="auth-shell tour-shell">
        <section className="tour-card">
          <div className="tour-icon"><Sparkles /></div>
          <p className="auth-eyebrow">Quick guidance</p>
          <h1>{card[0]}</h1>
          <p>{card[1]}</p>
          <div className="tour-dots">{cards.map((_, index) => <span key={index} className={index === tourIndex ? 'active' : ''} />)}</div>
          <div className="auth-actions">
            <button className="auth-secondary" onClick={() => onStateChange({ ...state, status: 'visitor' })}><SkipForward size={16} />Skip tour</button>
            <button className="auth-primary" onClick={() => tourIndex === cards.length - 1 ? onStateChange({ ...state, status: 'visitor' }) : setTourIndex(tourIndex + 1)}>Next</button>
          </div>
        </section>
      </main>
    )
  }

  if (state.status === 'registered_unverified') {
    return (
      <AuthFrame title="Confirmation email sent" subtitle={`We sent a verification email to ${state.user?.email}.`}>
        <button className="auth-primary wide" onClick={() => onStateChange(markEmailVerified(state))}>I verified my email</button>
      </AuthFrame>
    )
  }

  if (state.status === 'trial_needs_card' || state.status === 'email_verified') {
    return (
      <AuthFrame title="Start your 15-day trial" subtitle="$25/month after trial. Card details will be handled by Stripe Checkout in production.">
        <div className="billing-preview"><CalendarCheck /><span>15 days included before billing starts</span></div>
        <button className="auth-primary wide" onClick={() => onStateChange(startTrialForUser(bindPaymentMethod(state), todayIso))}>Bind card and start trial</button>
      </AuthFrame>
    )
  }

  if (state.status === 'lab_search') {
    return (
      <AuthFrame title="Join or create a lab" subtitle={trialEndsAt ? `Trial active until ${trialEndsAt}` : 'Trial active'}>
        <div className="lab-choice-grid">
          <div className="lab-card">
            <label>Find lab<input aria-label="Find lab" value={labQuery} onChange={(event) => setLabQuery(event.target.value)} placeholder="Search Yaping Tu Lab" /></label>
            {results.map((lab) => (
              <button key={lab.id} className="lab-result-button" onClick={() => onStateChange(createLabAccessRequest(state, lab.id))}>Request viewer access to {lab.name}</button>
            ))}
          </div>
          <div className="lab-card">
            {!creatingLab ? (
              <button className="auth-secondary wide" onClick={() => setCreatingLab(true)}>Create a new lab</button>
            ) : (
              <>
                <label>Lab name<input aria-label="Lab name" value={newLabName} onChange={(event) => setNewLabName(event.target.value)} placeholder="Demo Immunology Lab" /></label>
                <button className="auth-primary wide" onClick={() => onStateChange(createOwnedLabWorkspace(state, newLabName || 'New Lab'))}>Create lab workspace</button>
              </>
            )}
          </div>
        </div>
      </AuthFrame>
    )
  }

  if (state.status === 'lab_access_pending') {
    return (
      <AuthFrame title="Access request pending" subtitle={`${state.pendingWorkspaceName ?? 'Your lab'} must approve your viewer access before private data appears.`}>
        <div className="pending-panel"><LockKeyhole /><span>Colony data is hidden while your request is pending.</span></div>
      </AuthFrame>
    )
  }

  return (
    <main className="auth-shell">
      <section className="landing-hero">
        <nav className="auth-nav"><strong>VivaTrace</strong><button className="auth-link">Sign in</button></nav>
        <div className="landing-grid">
          <div>
            <p className="auth-eyebrow">Private vivarium records</p>
            <h1>Trace breeding, genotype evidence, weaning, and experiment-ready animals.</h1>
            <p>VivaTrace keeps lab colony work protected until a workspace owner approves access.</p>
            <div className="auth-actions">
              <button className="auth-primary" onClick={() => onStateChange(startTour(state))}>Start 15-day trial</button>
              <button className="auth-secondary" onClick={() => onStateChange(startTour(state))}>Watch guidance</button>
            </div>
          </div>
          <div className="hero-preview">
            <div><ShieldCheck /><span>Owner-approved lab access</span></div>
            <div><FlaskConical /><span>Gel evidence and tattoo-numbered results</span></div>
            <div><Search /><span>Find mice by genotype, sex, and age</span></div>
          </div>
        </div>
        <RegisterPanel name={name} email={email} password={password} onName={setName} onEmail={setEmail} onPassword={setPassword} onSubmit={() => onStateChange(registerAuthUser(state, name, email))} />
      </section>
    </main>
  )
}

function AuthFrame({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <main className="auth-shell"><section className="auth-card"><CheckCircle2 /><h1>{title}</h1><p>{subtitle}</p>{children}</section></main>
}

function RegisterPanel({ name, email, password, onName, onEmail, onPassword, onSubmit }: {
  name: string
  email: string
  password: string
  onName: (value: string) => void
  onEmail: (value: string) => void
  onPassword: (value: string) => void
  onSubmit: () => void
}) {
  return (
    <form className="register-panel" onSubmit={(event) => { event.preventDefault(); onSubmit() }}>
      <h2>Create account</h2>
      <label>Name<input aria-label="Name" value={name} onChange={(event) => onName(event.target.value)} required /></label>
      <label>Email<input aria-label="Email" type="email" value={email} onChange={(event) => onEmail(event.target.value)} required /></label>
      <label>Password<input aria-label="Password" type="password" value={password} onChange={(event) => onPassword(event.target.value)} required /></label>
      <button className="auth-primary wide">Create account</button>
    </form>
  )
}
```

Create `src/features/auth/auth.css` with:

```css
.auth-shell { min-height: 100vh; background: #f6f8f7; color: #17211d; display: grid; place-items: center; padding: 28px; }
.landing-hero { width: min(1180px, 100%); background: white; border: 1px solid #dce4df; border-radius: 10px; padding: 28px; }
.auth-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 34px; }
.auth-nav strong { font-size: 22px; color: #176b4b; }
.auth-link { border: 0; background: transparent; color: #176b4b; font-weight: 750; }
.landing-grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(320px, .9fr); gap: 28px; align-items: center; }
.auth-eyebrow { color: #176b4b; font-size: 11px; font-weight: 800; text-transform: uppercase; }
.landing-hero h1, .auth-card h1, .tour-card h1 { font-size: clamp(34px, 6vw, 58px); line-height: 1.02; margin: 8px 0 14px; letter-spacing: 0; }
.landing-hero p, .auth-card p, .tour-card p { color: #63736b; line-height: 1.5; }
.auth-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
.auth-primary, .auth-secondary { min-height: 42px; border-radius: 6px; padding: 0 15px; border: 0; display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-weight: 800; }
.auth-primary { background: #176b4b; color: white; }
.auth-secondary { background: #edf4f0; color: #1b6248; border: 1px solid #d7e6de; }
.wide { width: 100%; }
.hero-preview { display: grid; gap: 10px; }
.hero-preview div, .billing-preview, .pending-panel { border: 1px solid #dce4df; background: #f8fbf9; border-radius: 8px; padding: 14px; display: flex; align-items: center; gap: 10px; color: #46534d; }
.register-panel { margin-top: 28px; border-top: 1px solid #e2e9e5; padding-top: 20px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; align-items: end; }
.register-panel h2 { margin: 0; font-size: 18px; }
.register-panel label, .lab-card label { display: grid; gap: 6px; color: #5e6b64; font-size: 11px; font-weight: 800; }
.register-panel input, .lab-card input { height: 40px; border: 1px solid #d5ddd8; border-radius: 6px; padding: 0 10px; font: inherit; }
.auth-card, .tour-card { width: min(680px, 100%); background: white; border: 1px solid #dce4df; border-radius: 10px; padding: 30px; box-shadow: 0 24px 70px rgba(23, 33, 29, .08); }
.auth-card > svg, .tour-icon { color: #176b4b; }
.tour-shell { background: #17251f; }
.tour-card { text-align: center; }
.tour-dots { display: flex; justify-content: center; gap: 7px; margin: 20px 0; }
.tour-dots span { width: 8px; height: 8px; border-radius: 99px; background: #dce4df; }
.tour-dots span.active { width: 22px; background: #176b4b; }
.lab-choice-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 18px; }
.lab-card { border: 1px solid #e1e8e4; border-radius: 8px; padding: 14px; display: grid; gap: 12px; }
.lab-result-button { border: 1px solid #c9e0d3; background: #f1faf5; color: #176b4b; border-radius: 6px; min-height: 42px; font-weight: 800; }
@media (max-width: 760px) {
  .landing-grid, .register-panel, .lab-choice-grid { grid-template-columns: 1fr; }
  .landing-hero { padding: 20px; }
}
```

- [ ] **Step 4: Run targeted tests**

Run:

```bash
npm test -- src/App.test.tsx -t "vivatrace public access gate"
```

Expected initially still FAIL until `App.tsx` mounts the gate in Task 4.

- [ ] **Step 5: Commit after Task 4, not here**

This task intentionally creates files used by Task 4. Commit after wiring.

---

## Task 4: Mount Access Gate Before Protected Colony Data

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Update existing tests to start approved**

In `src/App.test.tsx`, after each `localStorage.clear()` in existing protected app describes, call:

```ts
approveWorkspaceForTest()
```

Do not call this helper in `describe('vivatrace public access gate', ...)`.

- [ ] **Step 2: Wire auth state in App**

In `src/App.tsx`, import:

```ts
import { canViewColonyData, createInitialAuthState, type AuthSessionState } from './domain/authFlow'
import { PublicAccessGate } from './features/auth/PublicAccessGate'
```

Add constants near the top:

```ts
const authStorageKey = 'vivatrace-auth-state-v1'

function loadAuthState(): AuthSessionState {
  try {
    const raw = localStorage.getItem(authStorageKey)
    return raw ? JSON.parse(raw) as AuthSessionState : createInitialAuthState()
  } catch {
    return createInitialAuthState()
  }
}
```

Inside `App`, add:

```ts
const [authState, setAuthState] = useState<AuthSessionState>(loadAuthState)
const setAuth = (next: AuthSessionState) => {
  setAuthState(next)
  localStorage.setItem(authStorageKey, JSON.stringify(next))
}
```

Before the protected app `return`, add:

```tsx
if (!canViewColonyData(authState)) {
  return <PublicAccessGate state={authState} todayIso={todayIso} onStateChange={setAuth} />
}
```

In the brand block, change visible text:

```tsx
<div><strong>VivaTrace</strong><span>{authState.pendingWorkspaceName || 'Mouse room'}</span></div>
```

- [ ] **Step 3: Run public gate tests**

Run:

```bash
npm test -- src/App.test.tsx -t "vivatrace public access gate"
```

Expected: PASS.

- [ ] **Step 4: Run full App tests**

Run:

```bash
npm test -- src/App.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/features/auth/PublicAccessGate.tsx src/features/auth/auth.css
git commit -m "feat: gate colony data behind vivatrace onboarding"
```

---

## Task 5: Owner Approval Path for Yaping Tu Lab

**Files:**
- Modify: `src/features/auth/PublicAccessGate.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Write failing test for approval simulation**

Add to public gate describe:

```ts
it('lets the TU Lab owner approve a pending viewer before dashboard access', () => {
  render(<App />)

  fireEvent.click(screen.getByRole('button', { name: 'Start 15-day trial' }))
  fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }))
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lab Member' } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'member@example.com' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
  fireEvent.click(screen.getByRole('button', { name: 'I verified my email' }))
  fireEvent.click(screen.getByRole('button', { name: 'Bind card and start trial' }))
  fireEvent.change(screen.getByLabelText('Find lab'), { target: { value: 'tu lab' } })
  fireEvent.click(screen.getByRole('button', { name: 'Request viewer access to Yaping Tu Lab' }))

  expect(screen.queryByText('153 mice recorded')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Owner approve viewer' }))

  expect(screen.getByText('Dashboard')).toBeInTheDocument()
  expect(screen.getByText('153 mice recorded')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm test -- src/App.test.tsx -t "owner approve"
```

Expected: FAIL because pending screen does not expose owner approval simulation.

- [ ] **Step 3: Add MVP owner approval simulation**

In `PublicAccessGateProps`, add:

```ts
onOwnerApprove?: () => void
```

In pending screen, add:

```tsx
{onOwnerApprove && <button className="auth-secondary wide" onClick={onOwnerApprove}>Owner approve viewer</button>}
```

In `App.tsx`, import:

```ts
import { approveWorkspaceAccess } from './domain/authFlow'
```

Pass:

```tsx
<PublicAccessGate state={authState} todayIso={todayIso} onStateChange={setAuth} onOwnerApprove={() => setAuth(approveWorkspaceAccess(authState))} />
```

- [ ] **Step 4: Run test**

Run:

```bash
npm test -- src/App.test.tsx -t "owner approve"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/features/auth/PublicAccessGate.tsx
git commit -m "feat: add owner approval simulation"
```

---

## Task 6: Polish, Docs, and Production Preview

**Files:**
- Modify: `README.md`
- Modify as needed: `src/features/auth/auth.css`

- [ ] **Step 1: Update README**

Add under Data or Deploy:

```md
## VivaTrace access gate

The MVP uses local browser state under `vivatrace-auth-state-v1` to simulate:

- email registration and verification
- 15-day trial with payment method attached
- finding Yaping Tu Lab
- requesting viewer access
- owner approval

Private colony data renders only when auth state is `workspace_approved`.
Production should replace this state with Supabase Auth, Supabase tables/RLS,
Supabase Storage, Stripe Checkout, and Stripe webhooks.
```

- [ ] **Step 2: Run all checks**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all PASS.

- [ ] **Step 3: Start production preview**

Run:

```bash
npm run preview:host -- --port 4174
```

Expected output includes:

```text
Local:   http://localhost:4174/
```

- [ ] **Step 4: Browser smoke test**

Open `http://localhost:4174/` and verify:

- Visitor sees VivaTrace landing page.
- Visitor does not see "153 mice recorded".
- Registration flow reaches pending approval.
- Owner approval reveals dashboard.

- [ ] **Step 5: Commit**

```bash
git add README.md src/features/auth/auth.css
git commit -m "docs: document vivatrace access gate"
```

---

## Self-Review

Spec coverage:

- VivaTrace product name and landing page: Task 3.
- Guidance with skip: Task 3.
- Email registration and confirmation simulation: Tasks 1, 3, 4.
- 15-day trial and card binding: Tasks 1, 2, 3.
- Find Yaping Tu Lab and request viewer: Tasks 1, 3.
- Create a new lab: Tasks 1, 2, 3.
- Pending approval blocks data: Tasks 1, 3, 4.
- Owner approval opens data: Task 5.
- Production integration notes: Task 6.

Known deferred work:

- Real Supabase Auth and email delivery.
- Real Stripe Checkout.
- Real database-backed workspace membership.
- Final animation polish.
- Trademark/domain clearance.

Placeholder scan: no placeholders or open-ended implementation instructions remain. Each task includes concrete files, commands, expected outcomes, and code snippets.
