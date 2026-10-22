# TU Lab Mouse Colony Platform Design

## 1. Purpose

Build a shared, browser-based mouse colony management platform for TU Lab. The
system must preserve reliable lineage and genotype evidence from breeding
through litter processing, weaning, individual cage assignment, experimental
use, and euthanasia.

The product will be a Progressive Web App (PWA). It will run on phones, tablets,
and computers through a public HTTPS address and can be installed on a device
home screen. The existing local React prototype remains the UI foundation, but
the production system uses cloud authentication, a shared relational database,
and private file storage.

## 2. Success Criteria

- Every active breeding and individual cage is visible to approved lab members.
- Every genotyped pup is traceable by litter and tattoo number.
- Gel images and cage-card images remain attached to their source records.
- A pup cannot appear in Individual Cages before P21, sex confirmation, and
  destination assignment.
- A pup can be transferred into active inventory only once.
- Euthanasia automatically updates active cage counts while preserving history.
- Owners can transfer administration without transferring personal accounts.
- Dashboards show current supply by line, genotype, sex, and age.
- Members can quickly identify animals approaching or within the 6-8 week
  experimental window.

## 3. Product Architecture

### Client

- React and TypeScript PWA.
- Responsive operational interface for desktop and mobile.
- Installable app manifest and service worker.
- Online-first behavior with a clear offline/read-only state.

### Cloud

- Supabase Postgres for relational data.
- Supabase Auth for individual email/password accounts.
- Supabase Storage for gel images, cage cards, and supporting photographs.
- Row Level Security policies scoped to a lab workspace.
- Vercel for the frontend deployment and public HTTPS URL.

### Calendar

- Initial production release exports `.ics` events compatible with Outlook,
  Apple Calendar, and Google Calendar.
- Calendar events include P4-P11 genotype reminders, P21 wean reminders, and
  future breeding or experiment tasks.
- Direct Outlook account synchronization is a later optional integration and
  is not required for the first cloud release.

## 4. Workspace and Permissions

The data belongs to the `TU Lab` workspace, not to one person's account.

### Roles

- **Owner**: full data access, member approval, role management, ownership
  transfer, workspace export, and workspace settings.
- **Admin**: full colony operations and member role management, but cannot
  remove the final Owner or transfer ownership without an Owner.
- **Member**: create and edit colony records, genotype, wean, upload evidence,
  and record euthanasia.
- **Viewer**: read-only access to dashboards, animal records, genotype results,
  and images.

### Membership Rules

- The initial two Owners are the current colony manager and the PI.
- New registrations have no data access until approved.
- Approved users default to Viewer.
- Owners or Admins can promote, demote, suspend, or reactivate members.
- A workspace must always have at least one active Owner.
- Ownership transfer requires acceptance by the receiving user.
- Suspended or departed users retain their identity in audit history but lose
  access to current lab data.

## 5. Core Data Model

### Workspace and Identity

- `workspaces`
- `profiles`
- `workspace_memberships`
- `role_change_requests`

### Colony

- `colony_lines`: Prex1, RGS2, Arhgef-25, Arhgef-1, LARG, miR-466b, and future
  lines.
- `breeding_cages`
- `breeding_parents`
- `breeder_change_history`
- `litters`
- `pups`
- `individual_cages`
- `individual_cage_memberships`
- `work_log_entries`
- `euthanasia_records`
- `attachments`
- `audit_events`

### Important Identifiers

- A litter has a stable internal ID and a human-readable reference such as
  `RGS2-B07-20260618`.
- A pup is uniquely identified by `(litter_id, tattoo_number)`.
- An individual cage has an automatic system ID such as `RGS2-I001`. This is a
  software identifier and does not require a matching physical cage number.
- Each pup has at most one active individual cage membership.

## 6. Breeding Cage Workflow

- Owners, Admins, and Members can add breeding cages manually.
- Each cage records line, pairing, parent genotypes, parent DOBs, current
  parents, extra females, priority status, and notes.
- Parent replacement never overwrites history. The prior parent is closed in
  `breeder_change_history`, and the new parent becomes current.
- Parent genotypes determine whether litters require genotype:
  - HET parent pairings require genotype.
  - WT/KO and other segregating pairings require genotype.
  - Fixed-genotype pairings such as verified WT/WT or KO/KO do not require
    genotype unless manually overridden.
- Users can override the automatic rule and the override is audited.

## 7. Litter Workspace

Each litter has one persistent workspace that is updated over several days.

### Creation

The New Litter flow records:

- source breeding cage
- colony line
- pups DOB
- pup count
- parent genotypes and DOB snapshots
- whether genotype is required
- P4-P11 genotype window
- P21 wean date

Parent information is snapshotted so later breeder replacements do not alter
the litter's historical lineage.

### Pup Numbering

- Genotyped pups use tattoo numbers `1..N`.
- Tattoo number remains the stable mouse-level identifier throughout genotype,
  weaning, individual cage assignment, and euthanasia.
- A litter cannot contain duplicate tattoo numbers.

### Litter States

- `new`: litter recorded, no genotype work due.
- `genotype_due`: within P4-P11 and genotype required.
- `genotype_in_progress`: at least one result or gel image saved.
- `awaiting_sex`: genotype completed but one or more sexes remain unknown.
- `ready_to_wean`: P21 reached and all required data is complete.
- `wean_attention`: P21 reached but sex or grouping is incomplete.
- `weaned`: all living pups were assigned exactly once or explicitly marked
  otherwise.
- `closed`: no remaining active pups.

## 8. Genotype Workflow

### Reminder

- Genotype reminders begin at P4 and display a P4-P11 working window.
- The `.ics` export includes genotype events for every litter whose
  `genotype_required` flag is true.
- Dashboard action queues show overdue or incomplete genotype work separately
  from weaning.

### Recording Results

The litter workspace supports:

- one or more gel image uploads
- image preview and original-file download
- gel run date
- optional protocol, primer, or assay notes
- one row per tattoo number
- genotype selection: WT, HET, KO, inconclusive, rerun required, or custom
- optional sex: Male, Female, or Unknown
- free-text notes

Sex may remain Unknown during early genotype work. Saving genotype results does
not create Individual Cage records.

### Evidence

- Gel files are private workspace assets.
- File metadata records uploader, upload time, original name, MIME type, size,
  and checksum.
- Result edits are versioned in the audit log.
- Removing a displayed attachment archives it; it does not destroy the audit
  record.

## 9. Weaning and Automatic Transfer

### Transfer Gate

A pup can move into Individual Cages only when all are true:

1. Current date is on or after P21, or an authorized user explicitly confirms
   an early wean with a reason.
2. Sex is Male or Female.
3. A wean group is assigned.
4. The pup is alive and has not already been transferred.

Missing data creates a `wean_attention` task. The system never creates an
incomplete or duplicate Individual Cage record.

### Grouping

- Pups from the same litter and sex can share a cage even when their genotypes
  differ.
- The genotype map remains mouse-specific, for example:
  `#1 KO; #2 HET; #4 KO`.
- For litters with five or fewer living pups, the system suggests groups by
  sex. Users review and edit before confirmation.
- For litters with more than five living pups, grouping is manual.
- A small cage has a maximum capacity of three.
- A large cage has a maximum capacity of six.
- The interface prevents capacity violations, missing pups, and duplicate pup
  placement.

### Automatic IDs

- The system assigns sequential software cage IDs by line, such as
  `Prex1-I001`.
- Users can optionally add a physical location or handwritten cage label.
- Manual Individual Cage creation is supported for animals not originating
  from a managed litter.

### Idempotency

- A database uniqueness constraint prevents more than one transfer record per
  pup.
- Reopening or double-clicking the confirmation action returns the existing
  transfer rather than creating another mouse.
- Group changes after confirmation are recorded as cage transfers.

## 10. Individual Cage Inventory

Each active cage displays:

- system cage ID
- optional physical label/location
- line
- sex
- cage size and capacity
- current count
- DOB and age
- genotype composition
- mouse-level tattoo/genotype map
- source litter and breeding cage
- parent genotype and DOB snapshots
- linked gel evidence
- status: Active, Empty, Closed, or Archived

Manual cage creation requires enough source information to prevent anonymous
inventory. Unknown values are visibly flagged.

## 11. Euthanasia Workflow

Owners, Admins, and Members can open Record Euthanasia and:

- select an Individual Cage
- select one or more tattoo-numbered mice, or enter a quantity for legacy cages
- record date
- choose reason:
  - Experimental use
  - Age
  - Health or humane endpoint
  - Breeding management
  - Genotype not needed
  - Transfer out
  - Other
- add experiment/project and notes
- upload a cage-card or supporting photograph

On confirmation:

- selected mice are marked inactive with disposition history
- the active cage count decreases transactionally
- if zero mice remain, the cage becomes Closed
- the cage is not deleted
- the work log and audit log receive linked entries

The operation is reversible only by an Admin or Owner through a documented
correction action.

## 12. Dashboard Design

### Colony Overview

The overview always shows all colony lines, even when the page filter selects a
single line. The selected line is highlighted rather than replacing the whole
comparison with one full-width bar.

Each line displays paired bars for:

- active breeding cages
- active individual cages

Clicking a line applies the page filter while preserving the full comparison.

### Availability Dashboard

For the selected line or all lines:

- mouse count by genotype
- mouse count by sex
- age distribution:
  - under 4 weeks
  - 4-6 weeks
  - 6-8 weeks
  - 8-12 weeks
  - 3-6 months
  - 6-12 months
  - over 12 months
- highlighted 6-8 week experimental candidates
- highlighted older animals over 12 months
- projected animals reaching 6 weeks in the next four weeks

Filters include line, genotype, sex, age band, and availability date. Dashboard
counts link directly to the matching Individual Cage list.

## 13. Attachments

Attachment categories:

- Gel image
- Breeding cage card
- Individual cage card
- Euthanasia evidence
- Other

Files are stored in private workspace buckets. Signed URLs are generated only
for authorized members. Viewer access permits viewing and downloading but not
uploading or deleting.

Initial limits:

- JPEG, PNG, HEIC, or PDF
- maximum 20 MB per file
- multiple files per record

HEIC images are retained as originals. A browser-friendly preview is generated
when necessary.

## 14. Audit and Safety

Audit events record:

- actor
- workspace
- timestamp
- action
- record type and ID
- old and new values for significant edits
- source device metadata where appropriate

High-risk operations use database transactions:

- litter-to-individual transfer
- cage transfer
- euthanasia
- ownership transfer

Records are archived rather than hard-deleted through normal UI actions.

## 15. Error Handling

- Upload failure leaves the form draft intact and allows retry.
- Partial genotype saves are allowed.
- Wean confirmation fails atomically if any pup is duplicated, omitted,
  over-capacity, or already transferred.
- Concurrent updates show a conflict message and reload current data.
- Calendar export clearly reports how many genotype and wean events were
  generated.
- Offline mode is visibly read-only until a later offline-write design is
  implemented.

## 16. Testing

### Unit

- genotype requirement rules
- P4-P11 and P21 calculations
- age bands and 6-8 week availability
- grouping suggestions and cage capacities
- transfer gate and idempotency
- euthanasia count reduction

### Integration

- Row Level Security for each role
- image upload and signed access
- litter transfer transaction
- euthanasia transaction
- Owner transfer and final-Owner protection

### End-to-End

- register and Owner approval
- record litter
- upload gel and save tattoo results with unknown sex
- reach P21 and block incomplete transfer
- add sex, group mice, and create Individual Cages once
- euthanize selected mice and close an emptied cage
- verify dashboard counts and audit history

## 17. Delivery Phases

### Phase 1: Cloud Foundation

- Supabase project and schema
- authentication and workspace roles
- migrate the 49 breeding cages, 62 individual cages, 153 mice, and work logs
- deploy shared read-only and owner access

### Phase 2: Litter, Genotype, and Wean

- litter workspace
- genotype reminders
- gel uploads
- tattoo-level results
- safe wean transfer

### Phase 3: Inventory and Euthanasia

- manual breeding and individual cage creation
- transfers
- euthanasia workflow and cage-card uploads

### Phase 4: Dashboard and Operational Polish

- full colony comparison
- genotype, sex, age, and availability views
- PWA installation
- audit viewer
- calendar export refinements

## 18. Explicit Non-Goals for Initial Release

- automated gel image interpretation
- direct integration with institutional animal protocol systems
- billing or per-diem cage accounting
- offline data mutation
- native iOS or Android binaries
- shared passwords
