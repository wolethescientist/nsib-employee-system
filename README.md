# NSIB Training Repository

The Individual Development Plan (IDP) workbook, as a system. Every member of
staff has one record: their header block, and a course grid grouped by
programme type — the same shape as the spreadsheet, so nobody has to relearn
how to read it.

## How the system reads the workbook

| Workbook | System |
| --- | --- |
| One sheet per member of staff | One employee record, opened from the staff directory |
| Rows 3–9 (name, designation, division, department, training profile, years of experience, qualifications) | The IDP header block, plus a photograph |
| `Programme Type` column | Collapsible sections: Initial → OJT → Basic → Advanced → Additional → Specialty → Recurrent |
| `Operations Unit` = Applicable / Not Applicable | Per-course applicability. Only applicable courses count towards completion |
| `Priority` = High / Medium / Low / R | P1 / P2 / P3 / R, with the workbook's legend shown under every plan |
| `Planned Date`, `Year completed` | Real dates for new scheduling; the bare years from the workbook are preserved |
| Certificate hyperlinks in `Comments` | Uploaded files in private storage, verified by an administrator |

## Exporting

CSV, laid out like the workbook sheet — header block, then the course grid in
columns B–J, the priority legend in L–M, and the sign-off box at the foot. It
opens straight in Excel.

- **Admin → Staff records → Export to CSV** — all staff (one plan after another) or a single member of staff.
- **Admin → open a staff record → Export IDP** — that one plan.
- **Employee → Download my plan** — their own, and only their own.

Under the hood: `GET /api/plan/export[?employee=<id>]`. An employee always gets
their own plan whatever id they pass. The layout lives in `lib/idp-csv.ts` and is
pinned by `npm run check`.

## Roles

- **Employee** — sees their own plan, submits certificates, reads why one was returned.
- **Administrator** (Training & Standards) — maintains every plan, verifies certificates, raises funding requests.
- **Director** (DG) — sees every record, and approves or declines funded/overseas training requests.

## The course lifecycle

```
Not started
   │  administrator sets a planned date
   ▼
Planned ──── planned date arrives ────▶ In progress
                                            │  employee submits a certificate
                                            ▼
                                       Submitted (awaiting verification)
                                            │
                    administrator approves ──┴── administrator returns with a comment
                            ▼                              ▼
                        Completed                    In progress
```

`Overdue` is not a stored state — it is derived from the deadline every time the
plan is read, so a record can never sit stale because a nightly job did not run.
Same for the Planned → In progress rollover.

## The funding chain

Training & Standards raises a request (course, provider, location, travel, cost,
justification) → the Director General approves or declines it, with a comment →
once approved, the administrator assigns it, and the provider, location, travel
and approved cost travel with it onto the employee's plan.

## Setup

1. **Environment** — copy `.env.example` to `.env.local` and fill it in.

2. **Database** — paste `supabase/schema.sql` into the Supabase SQL Editor and run it.
   It drops and recreates the application tables, so only do this on a project
   whose contents you are willing to lose. Uploaded files are not touched.

3. **Load the register from the workbook**

   ```bash
   npm run extract   # workbook -> data/idp-dataset.json  (needs python + openpyxl)
   npm run import    # JSON -> Supabase
   ```

   The import is idempotent. Every login — the administrator, the Director
   General and each member of staff — gets a random temporary password, written
   to `data/staff-credentials.csv` (gitignored) for Training & Standards to hand
   out. A login that already exists is skipped, so re-running never resets a
   password somebody is already using.

4. **Run it**

   ```bash
   npm run dev
   ```

## Checks

```bash
npm run check   # status, progress and deadline rules
npx tsc --noEmit
npm run build
```

## Where things live

| Path | What |
| --- | --- |
| `lib/programme.ts` | Programme order, priority legend, status derivation. The domain vocabulary, shared by API and UI |
| `lib/idp-server.ts` | Row → payload mapping, paged reads, role checks |
| `components/ProgrammePlan.tsx` | The collapsible programme-type grid |
| `components/IdpHeader.tsx` | The IDP header block |
| `lib/idp-csv.ts` | CSV export in the workbook's own column layout |
| `app/admin/` | Administrator and Director workspace |
| `app/employee/` | Employee workspace |
| `scripts/extract-workbook.py` | Workbook → JSON, including title de-duplication |
| `scripts/import-idp.mjs` | JSON → Supabase |
