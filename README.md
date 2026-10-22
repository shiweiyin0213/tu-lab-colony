# Colony Ops

A local-first mouse colony management MVP built around the lab's current workflow.

## Included

- Dashboard grouped by colony line
- Breeding and individual cage records
- Parent and mouse ages shown as months plus weeks
- P21 weaning status and P7-P11 genotype windows
- Priority pairings, older breeder alerts, and mixed-cage mouse number maps
- Work log for litter, weaning, genotype, cage, and breeder changes
- Litter workspace with parent snapshots, tattoo numbers, genotype entry, gel evidence, and safe wean transfer
- Excel import for sheets whose names contain `Breeding`, `Individual`, or `Work Log`
- Outlook-compatible `.ics` calendar export for legacy cage reminders and new litter reminders
- Browser-local persistence

## Run

```bash
npm install
npm run dev
npm test
npm run build
```

Open the URL printed by Vite, normally `http://localhost:5173`.

## Verify

```bash
npm test
npm run lint
npm run build
```

## Deploy

This app is ready for static hosting on Vercel or Netlify.

```bash
npm run build
npm run preview
```

For Vercel, import this folder or connected GitHub repo. The included
`vercel.json` builds with `npm run build`, publishes `dist`, and routes all
paths back to `index.html`.

For Netlify, import this folder or connected GitHub repo. The included
`netlify.toml` builds with `npm run build`, publishes `dist`, and routes all
paths back to `index.html`.

Before public deployment, replace real colony seed data with demo data or add
authenticated Supabase-backed storage so private lab records are not bundled
into the public JavaScript.

## Data

This MVP stores records in the current browser under the local storage key
`colony-ops-data-v3`. Gel files are stored locally in IndexedDB under
`tu-lab-colony-files`. Clearing browser data will remove local edits and uploads.

The next production phase should add authenticated users, a shared Postgres
database, private cloud storage, backups, audit history, role approval, and
direct Microsoft Graph calendar sync.
