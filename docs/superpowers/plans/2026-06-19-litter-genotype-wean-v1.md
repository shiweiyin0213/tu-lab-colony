# Litter, Genotype, and Wean V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a locally runnable first version of the complete litter workflow: record a litter, preserve parent snapshots, enter tattoo-level genotype and sex results with gel evidence, block incomplete weaning, and create non-duplicated Individual Cages at P21.

**Architecture:** Keep the confirmed colony inventory as the existing React application's foundation, but split litter workflow logic into focused domain modules and a versioned browser repository. The UI will add a dedicated Litters workspace with detail panels for genotype and weaning; pure domain functions will enforce dates, sex requirements, capacity, grouping, and idempotent transfer before any state is saved.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, date-fns, lucide-react, browser localStorage for structured demo data, IndexedDB for uploaded gel files.

---

## Scope and File Map

This plan delivers the first operational vertical slice and intentionally leaves cloud authentication, Supabase RLS, shared deployment, euthanasia, and role management for separate plans.

- `src/domain/colony.ts`: shared colony, litter, pup, grouping, attachment, and transfer types.
- `src/domain/litterRules.ts`: pure date, status, genotype-requirement, grouping, validation, and transfer functions.
- `src/domain/litterRules.test.ts`: unit coverage for the workflow safety rules.
- `src/data/colonyRepository.ts`: versioned local persistence and migration from the current `ColonyData`.
- `src/data/attachmentRepository.ts`: IndexedDB storage for gel image blobs and metadata.
- `src/features/litters/LitterList.tsx`: searchable litter queue and status summary.
- `src/features/litters/LitterWorkspace.tsx`: persistent litter detail workspace.
- `src/features/litters/NewLitterDialog.tsx`: source-cage creation flow with parent snapshot preview.
- `src/features/litters/GenotypePanel.tsx`: gel upload and tattoo-level result editor.
- `src/features/litters/WeanPanel.tsx`: sex completion, group editing, capacity validation, and transfer.
- `src/features/litters/litters.css`: workflow-specific layout and responsive styles.
- `src/App.tsx`: navigation, repository integration, dashboard queue, and workflow routing.
- `src/types.ts`: compatibility exports for existing breeding, individual, and work records.
- `src/utils.ts`: calendar export updated to use litter records.
- `src/App.test.tsx`: UI integration coverage.
- `src/test/fixtures.ts`: compact deterministic workflow fixtures.

### Task 1: Define the Litter Domain Model

**Files:**
- Create: `src/domain/colony.ts`
- Modify: `src/types.ts`
- Create: `src/test/fixtures.ts`

- [ ] **Step 1: Add the new domain types**

Create enums/unions for:

```ts
export type BasicGenotype = 'WT' | 'HET' | 'KO'
export type PupGenotype = BasicGenotype | 'Inconclusive' | 'Rerun required' | 'Custom' | 'Unknown'
export type PupSex = 'Male' | 'Female' | 'Unknown'
export type LitterStatus =
  | 'new'
  | 'genotype_due'
  | 'genotype_in_progress'
  | 'awaiting_sex'
  | 'ready_to_wean'
  | 'wean_attention'
  | 'weaned'
  | 'closed'
export type CageSize = 'small' | 'large'

export interface ParentSnapshot {
  sex: 'Male' | 'Female'
  genotype: string
  dob: string
}

export interface PupRecord {
  id: string
  tattooNumber: number
  genotype: PupGenotype
  customGenotype?: string
  sex: PupSex
  notes?: string
  alive: boolean
  transferredAt?: string
  individualCageId?: string
}

export interface LitterRecord {
  id: string
  reference: string
  line: string
  breedingCageId: string
  breedingCageLabel: string
  dob: string
  pupCount: number
  genotypeRequired: boolean
  genotypeOverride?: boolean
  parents: ParentSnapshot[]
  pups: PupRecord[]
  gelRunDate?: string
  assayNotes?: string
  attachmentIds: string[]
  createdAt: string
  updatedAt: string
}

export interface WeanGroupDraft {
  id: string
  sex: Exclude<PupSex, 'Unknown'>
  cageSize: CageSize
  pupIds: string[]
  physicalLabel?: string
}
```

Extend `ColonyData` with `litters: LitterRecord[]` and retain existing breeding,
individual, and work arrays. Add optional `sourceLitterId` and
`sourcePupIds` fields to `IndividualCage`.

- [ ] **Step 2: Add deterministic fixtures**

Create a breeding cage with a HET/HET pairing and a five-pup litter fixture.
Use fixed ISO timestamps so all tests remain independent of the machine clock.

- [ ] **Step 3: Run type checking**

Run: `npm run build`

Expected: FAIL because seed data and repository loading do not yet provide
`litters`.

- [ ] **Step 4: Commit the domain contract**

```bash
git add src/domain/colony.ts src/types.ts src/test/fixtures.ts
git commit -m "feat: define litter workflow domain"
```

### Task 2: Implement Workflow Safety Rules with TDD

**Files:**
- Create: `src/domain/litterRules.ts`
- Create: `src/domain/litterRules.test.ts`

- [ ] **Step 1: Write failing date and genotype-requirement tests**

Cover these exact expectations:

```ts
expect(litterDates('2026-06-01')).toEqual({
  genotypeStart: '2026-06-05',
  genotypeEnd: '2026-06-12',
  weanDate: '2026-06-22',
})
expect(pairingRequiresGenotype('HET', 'HET')).toBe(true)
expect(pairingRequiresGenotype('WT', 'KO')).toBe(true)
expect(pairingRequiresGenotype('WT', 'WT')).toBe(false)
expect(pairingRequiresGenotype('KO', 'KO')).toBe(false)
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- src/domain/litterRules.test.ts`

Expected: FAIL because `litterDates` and `pairingRequiresGenotype` do not exist.

- [ ] **Step 3: Implement date and pairing rules**

Use `date-fns` `addDays`, `format`, and `parseISO`. P4 is DOB + 4 days, P11 is
DOB + 11 days, and P21 is DOB + 21 days. Normalize genotype strings by upper
case and treat any non-identical fixed WT/WT or KO/KO pair as requiring
genotype.

- [ ] **Step 4: Write failing status and transfer-gate tests**

Test:

```ts
expect(getLitterStatus(litter, '2026-06-10')).toBe('genotype_due')
expect(getLitterStatus(litterWithResultsAndUnknownSex, '2026-06-22')).toBe('wean_attention')
expect(validateWeanTransfer(litterWithUnknownSex, groups, '2026-06-22'))
  .toContain('Every living pup needs a confirmed sex.')
expect(validateWeanTransfer(completeLitter, duplicateGroups, '2026-06-22'))
  .toContain('A pup can only appear in one wean group.')
```

- [ ] **Step 5: Implement status and validation rules**

`getLitterStatus` must derive status instead of storing it. The validation
function must reject pre-P21 transfer, unknown sex, omitted pups, duplicate
pups, sex-mismatched groups, small cages above three, large cages above six,
and already transferred pups.

- [ ] **Step 6: Write failing grouping and idempotency tests**

Test that a five-pup litter suggests one male and one female group, a six-pup
litter returns no automatic groups, and calling transfer twice returns the
original generated cage IDs without adding inventory.

- [ ] **Step 7: Implement grouping and transfer**

Export:

```ts
export function suggestWeanGroups(litter: LitterRecord): WeanGroupDraft[]
export function transferLitter(
  data: ColonyData,
  litterId: string,
  groups: WeanGroupDraft[],
  transferDate: string,
): ColonyData
```

Generated cage IDs use the next available line sequence, e.g. `RGS2-I013`.
Each created cage includes a tattoo/genotype map such as
`#1 KO; #2 HET; #4 KO`, source litter ID, and source pup IDs. Existing
`transferredAt` values make repeated confirmation return the unchanged data.

- [ ] **Step 8: Run tests and commit**

Run: `npm test -- src/domain/litterRules.test.ts`

Expected: PASS.

```bash
git add src/domain/litterRules.ts src/domain/litterRules.test.ts
git commit -m "feat: enforce litter genotype and wean rules"
```

### Task 3: Add Versioned Browser Persistence

**Files:**
- Create: `src/data/colonyRepository.ts`
- Create: `src/data/colonyRepository.test.ts`
- Modify: `src/seed.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write migration tests**

Test that current `colony-ops-data-v2` data migrates to version 3 with an empty
`litters` array and preserves all 49 breeding cages, 62 individual cages, and
153 mice.

- [ ] **Step 2: Run migration tests and verify failure**

Run: `npm test -- src/data/colonyRepository.test.ts`

Expected: FAIL because the repository does not exist.

- [ ] **Step 3: Implement the repository**

Expose:

```ts
export const storageKey = 'colony-ops-data-v3'
export function loadColonyData(storage: Storage = localStorage): ColonyData
export function saveColonyData(data: ColonyData, storage: Storage = localStorage): void
```

Load v3 first; otherwise migrate v2; otherwise clone `seedData`. Save a wrapper
`{ version: 3, data }` so future migrations can be explicit.

- [ ] **Step 4: Update seed and App loading**

Add `litters: []` to `seedData`, remove `loadData`, `saveData`, and the local
storage key from `App.tsx`, and consume the repository functions.

- [ ] **Step 5: Run all tests and commit**

Run: `npm test`

Expected: all repository, workflow, and existing line-filter tests PASS.

```bash
git add src/data/colonyRepository.ts src/data/colonyRepository.test.ts src/seed.ts src/App.tsx
git commit -m "feat: add versioned colony repository"
```

### Task 4: Store Gel Attachments in IndexedDB

**Files:**
- Create: `src/data/attachmentRepository.ts`
- Create: `src/data/attachmentRepository.test.ts`

- [ ] **Step 1: Write failing metadata and validation tests**

Test acceptance of JPEG, PNG, HEIC, and PDF; rejection above 20 MB; and stable
metadata containing ID, original name, MIME type, byte size, category
`gel-image`, uploader label `Local demo user`, and timestamp.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- src/data/attachmentRepository.test.ts`

Expected: FAIL because attachment validation is undefined.

- [ ] **Step 3: Implement attachment validation and IndexedDB methods**

Export:

```ts
export function validateAttachment(file: File): string[]
export async function saveAttachment(file: File): Promise<AttachmentMetadata>
export async function readAttachment(id: string): Promise<Blob | undefined>
export async function deleteAttachment(id: string): Promise<void>
```

Use database `tu-lab-colony-files`, object store `attachments`, and store the
blob with metadata. Archive semantics in the cloud version will replace local
deletion; this demo method exists only to undo an unsaved upload.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- src/data/attachmentRepository.test.ts`

Expected: PASS.

```bash
git add src/data/attachmentRepository.ts src/data/attachmentRepository.test.ts
git commit -m "feat: persist local gel attachments"
```

### Task 5: Build New Litter and Litter Queue UI

**Files:**
- Create: `src/features/litters/NewLitterDialog.tsx`
- Create: `src/features/litters/LitterList.tsx`
- Create: `src/features/litters/litters.css`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Test that:

- Litters appears in navigation.
- New Litter shows source cage, parent genotypes, and parent DOBs.
- Saving a five-pup HET/HET litter creates tattoo numbers 1 through 5.
- The litter queue displays genotype window, P21 date, and derived status.

- [ ] **Step 2: Run UI tests and verify failure**

Run: `npm test -- src/App.test.tsx`

Expected: FAIL because the Litters navigation and workspace do not exist.

- [ ] **Step 3: Implement the New Litter dialog**

Replace the current compact modal with a dialog that:

- filters breeding cages by line
- previews current parent snapshots
- calculates `genotypeRequired` from pairing with an audited-style override
- previews P4-P11 and P21
- creates one `PupRecord` per count with tattoo numbers `1..N`
- writes a linked work-log entry

- [ ] **Step 4: Implement the litter list**

Rows show reference, line/cage, DOB, count, genotype requirement, genotype
window, P21, and derived status. Status filters include Needs genotype,
Awaiting sex, Wean attention, Ready, and Completed.

- [ ] **Step 5: Integrate navigation and run tests**

Run: `npm test -- src/App.test.tsx`

Expected: PASS including the original dashboard inventory counts.

- [ ] **Step 6: Commit**

```bash
git add src/features/litters src/App.tsx src/App.test.tsx
git commit -m "feat: add litter workspace and creation flow"
```

### Task 6: Build Tattoo-Level Genotype Workspace

**Files:**
- Create: `src/features/litters/LitterWorkspace.tsx`
- Create: `src/features/litters/GenotypePanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Write failing genotype workflow tests**

Open a litter and assert:

- one editable row exists per tattoo number
- genotype can be saved while sex remains Unknown
- a gel image can be selected and its metadata appears
- saving updates status to `genotype_in_progress` or `awaiting_sex`
- no Individual Cage is created

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- src/App.test.tsx -t "genotype workflow"`

Expected: FAIL because the genotype workspace does not exist.

- [ ] **Step 3: Implement the persistent workspace shell**

Use an unframed page header with litter reference, source breeding cage,
parents, DOB, P21, and status. Use tabs for Overview, Genotype, and Wean.

- [ ] **Step 4: Implement the genotype panel**

Provide gel upload with preview, gel run date, assay notes, and a compact table:

```text
Tattoo | Genotype | Sex | Notes
#1     | KO       | Male | ...
```

Allow partial saves. Disable upload for invalid type/size and retain form values
after an upload failure.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- src/App.test.tsx`

Expected: PASS.

```bash
git add src/features/litters/LitterWorkspace.tsx src/features/litters/GenotypePanel.tsx src/App.tsx src/App.test.tsx
git commit -m "feat: record tattoo genotype results and gel evidence"
```

### Task 7: Build Safe Wean Grouping and Transfer UI

**Files:**
- Create: `src/features/litters/WeanPanel.tsx`
- Modify: `src/features/litters/LitterWorkspace.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Write failing transfer-gate UI tests**

Test:

- confirmation is blocked before P21
- confirmation is blocked when any living pup has Unknown sex
- five or fewer pups receive editable sex-based suggestions
- more than five pups show an empty manual grouping editor
- capacity violations show a specific error
- successful confirmation creates cages once and changes status to Weaned
- a second click does not create duplicate mice or cages

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- src/App.test.tsx -t "wean transfer"`

Expected: FAIL because the Wean panel does not exist.

- [ ] **Step 3: Implement grouping editor**

Use group rows with sex segmented control, small/large cage selector, optional
physical label, and tattoo-number checkboxes. Show an always-visible placement
summary and unassigned/duplicate warnings.

- [ ] **Step 4: Implement confirmation**

Call `validateWeanTransfer`; display all errors without mutating state. On
success call `transferLitter`, save once, add a work entry, and navigate to the
newly created Individual Cage list.

- [ ] **Step 5: Run tests and commit**

Run: `npm test`

Expected: all tests PASS.

```bash
git add src/features/litters/WeanPanel.tsx src/features/litters/LitterWorkspace.tsx src/App.tsx src/App.test.tsx
git commit -m "feat: safely transfer weaned pups to inventory"
```

### Task 8: Update Dashboard, Calendar, and Visual QA

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/utils.ts`
- Create: `src/utils.test.ts`
- Modify: `src/App.css`
- Modify: `src/features/litters/litters.css`
- Modify: `README.md`

- [ ] **Step 1: Write failing calendar tests**

Test that a genotype-required litter exports a P4 event and a P21 event, a
fixed-genotype litter exports only P21, and transferred litters produce no
future wean event.

- [ ] **Step 2: Implement litter-based calendar export**

Change `downloadIcs` to accept litters, escape ICS text safely, generate unique
UIDs from litter IDs, and return the event count for the success toast.

- [ ] **Step 3: Add dashboard workflow metrics**

Add metrics and action rows for:

- genotype due
- awaiting sex
- ready/wean attention
- 6-8 week Individual mice

Keep the all-line paired breeding/individual comparison visible even when one
line is selected.

- [ ] **Step 4: Document the demo**

Update `README.md` with:

```bash
npm install
npm run dev
npm test
npm run build
```

Explain that structured records are stored in browser storage, gel files are
stored in IndexedDB, and cloud accounts are the next delivery plan.

- [ ] **Step 5: Run full verification**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 6: Perform browser QA**

Use the in-app browser at desktop `1440x900` and mobile `390x844`. Verify:

- all six colony lines remain visible
- New Litter is usable without horizontal overflow
- a litter can be created and opened
- genotype results persist after reload
- unknown sex blocks transfer
- completed transfer appears exactly once in Individual Cages
- no controls or text overlap

- [ ] **Step 7: Commit the verified V1**

```bash
git add src README.md
git commit -m "feat: complete litter genotype and wean v1"
```

## Self-Review

- Spec coverage in this plan: breeding-cage parent snapshots, litter creation,
  P4-P11 genotype reminders, tattoo-level results, gel evidence, optional early
  sex, P21 gate, manual grouping above five pups, cage capacities, automatic
  Individual Cage IDs, mouse-level genotype maps, idempotent transfer, calendar
  export, and dashboard action queues.
- Deferred to separate plans: Supabase project/schema, authentication and
  roles, cloud file security, migration to shared data, manual cage editing,
  breeder replacement history, euthanasia, audit viewer, and PWA deployment.
- Placeholder scan: no TBD/TODO steps remain.
- Type consistency: `LitterRecord`, `PupRecord`, `WeanGroupDraft`, and
  `IndividualCage.sourcePupIds` use the same names throughout all tasks.
