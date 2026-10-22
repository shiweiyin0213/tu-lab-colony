# Genotype Summary Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a responsive in-app genotype summary report that can be regenerated, copied, and printed or saved as PDF.

**Architecture:** A pure domain builder converts `ColonyData` into a typed report model and a separate serializer converts that model to plain text. A focused React report view renders the model, while `App` owns opening the view and invoking browser Clipboard and Print APIs.

**Tech Stack:** React 19, TypeScript 6, date-fns, lucide-react, Vitest, Testing Library, Vite.

**Spec:** `docs/superpowers/specs/2026-09-10-genotype-summary-report-design.md`

## Global Constraints

- Generate reports only from the colony data already loaded in the browser.
- Do not call an AI service or send colony data to a new third party.
- Do not add or enable automated email, scheduler, or sender credentials in this version.
- Organize the report by active colony line and omit archived lines.
- Reuse the existing mixed-cage genotype parsing rules.
- Support phone, tablet, desktop, clipboard text, and browser print/save-as-PDF.
- The project is not a Git worktree; replace commit steps with explicit verification checkpoints.

---

### Task 1: Report Domain Model And Calculations

**Files:**
- Create: `src/domain/genotypeReport.ts`
- Create: `src/domain/genotypeReport.test.ts`
- Modify: `src/utils.ts`

**Interfaces:**
- Consumes: `ColonyData`, `Genotype`, `Sex`, `getActiveColonyLines`, and the existing mixed-cage parser.
- Produces: `buildGenotypeReport(data: ColonyData, generatedAt: Date): GenotypeReport` and `serializeGenotypeReport(report: GenotypeReport): string`.

- [ ] **Step 1: Write failing calculation tests**

Create fixtures covering one WT breeding pair, one mixed individual cage with `#1 KO; #2 HET`, one incomplete mixed map, one unknown-sex cage, one genotype-required litter with living untransferred pups, and one archived line. Assert that:

```ts
const report = buildGenotypeReport(data, new Date('2026-09-10T13:00:00-05:00'))

expect(report.totals.activeLines).toBe(1)
expect(report.totals.individualMice).toBe(5)
expect(report.lines[0].genotypeCounts.KO).toBe(1)
expect(report.lines[0].genotypeCounts.HET).toBe(1)
expect(report.lines[0].pendingGenotypePups).toBe(2)
expect(report.lines[0].attention.incompleteMixedMapMice).toBe(1)
expect(report.lines.some((line) => line.line === 'Archived line')).toBe(false)
```

- [ ] **Step 2: Run the domain test and verify RED**

Run:

```bash
npm test -- --run src/domain/genotypeReport.test.ts
```

Expected: failure because `genotypeReport.ts` and its exports do not exist.

- [ ] **Step 3: Export the existing mixed-cage parser**

Change the existing function declaration in `src/utils.ts` without altering its logic:

```ts
export function genotypeCountEntries(cage: IndividualCage): Array<[Genotype, number]> {
```

- [ ] **Step 4: Implement typed report construction**

Create these public types in `src/domain/genotypeReport.ts`:

```ts
export interface GenotypeReportTotals {
  activeLines: number
  breedingCages: number
  individualCages: number
  individualMice: number
  pendingGenotypePups: number
}

export interface GenotypeReportLine {
  line: string
  breedingCages: number
  pairings: Array<{ pairing: string; count: number }>
  individualCages: number
  individualMice: number
  genotypeCounts: Record<Genotype, number>
  sexCounts: Record<Sex, number>
  pendingGenotypePups: number
  pendingSources: Array<{ label: string; count: number }>
  attention: {
    unknownGenotypeMice: number
    unknownSexMice: number
    incompleteMixedMapMice: number
  }
}

export interface GenotypeReport {
  generatedAt: string
  totals: GenotypeReportTotals
  lines: GenotypeReportLine[]
}
```

Implementation rules:

```ts
const activeLines = getActiveColonyLines(data)
const active = new Set(activeLines)
const livingUntransferred = litter.pups.filter((pup) => pup.alive && !pup.transferredAt)
const mappedCount = genotypeCountEntries(cage).reduce((sum, [, count]) => sum + count, 0)
const incomplete = cage.genotype === 'Mixed' ? Math.max(0, cage.count - mappedCount) : 0
```

Count modern litter pups only when `genotypeRequired` is true. Count a legacy breeding cage as pending only when it has `genotypeNeeded`, a positive `pupsCount`, and no corresponding modern litter with the same `breedingCageId`, preventing duplicate totals.

- [ ] **Step 5: Implement the plain-text serializer**

The serializer must produce stable headings that can later be reused by email:

```text
TU Lab Colony - Genotype Summary
Generated: Sep 10, 2026, 1:00 PM

COLONY TOTALS
Active lines: 1
Breeding cages: 1
Individual mice: 5

Arhgef-1
Breeding: 1 cage
Pairings: WT/WT: 1
Inventory: WT 2 | HET 1 | KO 1 | Mixed 0 | Unknown 1
Pending genotype: 2 pups
Attention: Unknown genotype 1; Unknown sex 1; Incomplete mixed map 1
```

Omit zero-valued special genotypes from the compact inventory line, but always include WT, HET, KO, Mixed, and Unknown.

- [ ] **Step 6: Run the domain tests and verify GREEN**

Run:

```bash
npm test -- --run src/domain/genotypeReport.test.ts src/utils.test.ts
```

Expected: both files pass and existing mixed-cage behavior is unchanged.

### Task 2: Responsive Report View

**Files:**
- Create: `src/features/reports/GenotypeReportView.tsx`
- Create: `src/features/reports/genotype-report.css`
- Create: `src/features/reports/GenotypeReportView.test.tsx`

**Interfaces:**
- Consumes: `GenotypeReport` from Task 1 and callbacks `onClose`, `onCopy`, `onPrint`, and `onRefresh`.
- Produces: `GenotypeReportView` with accessible controls and print-specific markup.

- [ ] **Step 1: Write failing view tests**

Render a small report and verify the heading, generated timestamp, line sections, alert copy, and callback behavior:

```tsx
render(
  <GenotypeReportView
    report={report}
    onClose={onClose}
    onCopy={onCopy}
    onPrint={onPrint}
    onRefresh={onRefresh}
  />,
)

expect(screen.getByRole('heading', { name: 'Genotype summary' })).toBeInTheDocument()
expect(screen.getByRole('region', { name: 'Arhgef-1 genotype summary' })).toBeInTheDocument()
fireEvent.click(screen.getByRole('button', { name: 'Copy report' }))
expect(onCopy).toHaveBeenCalledOnce()
```

- [ ] **Step 2: Run the component test and verify RED**

Run:

```bash
npm test -- --run src/features/reports/GenotypeReportView.test.tsx
```

Expected: failure because the component does not exist.

- [ ] **Step 3: Implement the report view**

Use lucide icons `Copy`, `Printer`, `RefreshCw`, and `X`. The root is a full-viewport dialog with `aria-modal="true"`; controls have these accessible names:

```tsx
<button aria-label="Close genotype report" onClick={onClose}><X /></button>
<button onClick={onRefresh}><RefreshCw />Refresh report</button>
<button onClick={onCopy}><Copy />Copy report</button>
<button onClick={onPrint}><Printer />Print / Save PDF</button>
```

Render colony totals in one compact summary band. Render each line as an un-nested report section with four branches: Breeding, Individual inventory, Pending genotype, and Attention. Do not add charts in this version.

- [ ] **Step 4: Add responsive and print CSS**

Desktop uses a two-column branch grid; widths below `720px` use one column. The dialog body scrolls independently, all long line names wrap, and controls have stable minimum heights. Print rules use:

```css
@media print {
  body * { visibility: hidden; }
  .genotype-report-dialog,
  .genotype-report-dialog * { visibility: visible; }
  .genotype-report-dialog { position: absolute; inset: 0; overflow: visible; }
  .genotype-report-controls { display: none; }
}
```

- [ ] **Step 5: Run component tests and verify GREEN**

Run:

```bash
npm test -- --run src/features/reports/GenotypeReportView.test.tsx
```

Expected: all report-view tests pass.

### Task 3: Application Integration And Browser Actions

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: `buildGenotypeReport`, `serializeGenotypeReport`, and `GenotypeReportView`.
- Produces: the toolbar command `Genotype report`, clipboard feedback, print invocation, and report regeneration.

- [ ] **Step 1: Write failing integration tests**

Add tests that open the report from the top toolbar and prove it uses current data:

```tsx
fireEvent.click(screen.getByRole('button', { name: 'Genotype report' }))
expect(screen.getByRole('heading', { name: 'Genotype summary' })).toBeInTheDocument()
expect(screen.getByRole('region', { name: 'Arhgef-1 genotype summary' })).toBeInTheDocument()
fireEvent.click(screen.getByRole('button', { name: 'Close genotype report' }))
expect(screen.queryByRole('heading', { name: 'Genotype summary' })).not.toBeInTheDocument()
```

Stub `navigator.clipboard.writeText` and `window.print`, then assert that Copy calls the clipboard with text beginning `TU Lab Colony - Genotype Summary`, Print calls `window.print`, and clipboard rejection shows `Could not copy genotype report.`.

- [ ] **Step 2: Run the App integration test and verify RED**

Run:

```bash
npm test -- --run src/App.test.tsx
```

Expected: failure because `Genotype report` is absent.

- [ ] **Step 3: Add App state and report generation**

Add:

```ts
const [showGenotypeReport, setShowGenotypeReport] = useState(false)
const [reportGeneratedAt, setReportGeneratedAt] = useState(() => new Date())
const genotypeReport = useMemo(
  () => buildGenotypeReport(data, reportGeneratedAt),
  [data, reportGeneratedAt],
)
```

Opening and refreshing set a new generation time. Because `data` already receives cloud synchronization, an open report updates when a newer cloud snapshot arrives.

- [ ] **Step 4: Add the toolbar command and view**

Import lucide `Network` and add before Calendar:

```tsx
<button className="button secondary report-button" onClick={openGenotypeReport}>
  <Network size={17} />Genotype report
</button>
```

Render the report dialog near the other top-level dialogs and pass callbacks for close, refresh, copy, and print.

- [ ] **Step 5: Implement Clipboard and Print behavior**

Use:

```ts
const copyGenotypeReport = async () => {
  try {
    await navigator.clipboard.writeText(serializeGenotypeReport(genotypeReport))
    setToast('Genotype report copied.')
  } catch {
    setToast('Could not copy genotype report.')
  }
}

const printGenotypeReport = () => window.print()
```

Do not introduce a new PDF library; browser printing supplies Save as PDF.

- [ ] **Step 6: Run App and report tests and verify GREEN**

Run:

```bash
npm test -- --run src/App.test.tsx src/features/reports/GenotypeReportView.test.tsx src/domain/genotypeReport.test.ts
```

Expected: all selected tests pass.

### Task 4: Full Verification And Production Deployment

**Files:**
- Verify all files changed in Tasks 1-3.
- Modify only defects directly revealed by verification.

**Interfaces:**
- Consumes: the complete report feature.
- Produces: a verified production deployment at `https://yaping-tu-lab-colony.vercel.app/`.

- [ ] **Step 1: Run the complete automated suite**

Run in the clean dependency workspace:

```bash
npm test
npm run build
npx eslint src/App.tsx src/App.test.tsx src/utils.ts src/domain/genotypeReport.ts src/domain/genotypeReport.test.ts src/features/reports/GenotypeReportView.tsx src/features/reports/GenotypeReportView.test.tsx
```

Expected: zero test failures, successful TypeScript/Vite build, and zero lint errors in changed files. Existing unrelated warnings may be reported separately.

- [ ] **Step 2: Verify phone and desktop layouts**

Start the clean preview server and use Playwright screenshots at `390x844` and `1440x1000`. Confirm the report opens, every toolbar label fits, report content does not overlap, the body scrolls, and no horizontal clipping hides counts.

- [ ] **Step 3: Deploy production**

Run:

```bash
npx vercel deploy --prod --yes --no-color
```

Expected: deployment reaches `READY` and aliases to `https://yaping-tu-lab-colony.vercel.app/`.

- [ ] **Step 4: Verify the live asset**

Fetch production HTML, load its hashed JavaScript asset, and confirm it contains `Genotype report`, `Copy report`, and `Print / Save PDF`. Open the live site once at a mobile viewport and confirm the login screen renders without console errors.

- [ ] **Step 5: Record deferred email handoff**

Report that monthly email remains disabled until a replacement colleague supplies a durable sender account. Preserve the agreed future recipient and schedule from the spec without adding browser-visible credentials.
