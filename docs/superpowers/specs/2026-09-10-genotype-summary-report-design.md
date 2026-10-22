# Genotype Summary Report Design

## Scope

Add a first-version, in-app genotype summary report to TU Lab Colony. The report is generated from the colony data currently loaded in the signed-in browser. It does not call an AI service and does not send colony data to a new third party.

Automated email is intentionally deferred. The future delivery settings are recorded as `YapingTu@creighton.edu`, monthly on the first day at 8:00 AM America/Chicago, but no scheduler or sender credentials are added in this version.

## User Flow

- Add a `Genotype report` command to the main application toolbar using an appropriate report/network icon.
- Selecting it opens a dedicated report view that is usable on phone, tablet, and desktop.
- The view shows the generation date and a hierarchical outline organized by active colony line.
- The user can regenerate the report from the latest loaded data, copy the report as plain text, or print it/save it as PDF using the browser print dialog.
- Closing the report returns to the previous colony view without changing colony data.

## Report Content

The report contains:

1. Colony-wide totals: active lines, breeding cages, individual cages, and recorded individual mice.
2. One section per active line.
3. Breeding summary per line: number of breeding cages and pairing counts based on male/female genotype.
4. Individual inventory per line: mouse counts for WT, HET, KO, RGS2 WT, Prex KO, Mixed, and Unknown, with male/female/mixed/unknown sex counts.
5. Pending genotype work: genotype-required litters with living, untransferred pups and legacy breeding cages whose pups still need genotyping.
6. Attention items: unknown genotype inventory, unknown sex inventory, and mixed cages whose mouse-level genotype map is incomplete.

All totals use existing parsing rules for mixed cages so the report agrees with the dashboard inventory.

## Technical Design

- Extract reusable genotype counting/parsing into a report-domain module instead of duplicating calculations in the UI.
- Build a pure `buildGenotypeReport(data, generatedAt)` function returning a typed report model.
- Build a pure text serializer for clipboard output and email reuse later.
- Render the model in a focused React report view. The first version uses a compact nested outline rather than charts.
- Add print styles that hide application navigation and report controls while preserving the complete report.
- Use the browser Clipboard and Print APIs; failures display an in-app toast and do not affect colony data.

## Testing

- Unit-test totals, mixed-cage maps, pending litter counts, and attention items.
- Component-test opening, closing, copying, and printing the report.
- Verify the existing full test suite and production build before deployment.
- Check the report at phone and desktop widths to ensure content remains readable and does not overlap.

## Deferred Email Phase

Once the replacement colleague provides a durable sender account, add an authenticated server-side monthly job. It will load the current cloud snapshot, render the same report model, and email it to `YapingTu@creighton.edu` on the first day of each month at 8:00 AM America/Chicago. Sender credentials will never be stored in browser code.
