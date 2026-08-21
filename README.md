# NSIB Training Repository

The Individual Development Plan (IDP) workbook, as a system. Every investigator
has one record: their header block, and a course grid grouped by programme type
— the same shape as the spreadsheet, so nobody has to relearn how to read it.

## How the system reads the workbook

| Workbook | System |
| --- | --- |
| One sheet per member of staff | One investigator record, opened from the register |
| Rows 3–9 (name, designation, division, department, training profile, years of experience, qualifications) | The IDP header block, plus a photograph. "Department" reads as **directorate** and "training profile" as **specialty** — both renamed at the Director General's review |
| `Programme Type` column | Collapsible sections: Initial → OJT → Basic → Advanced → Additional → Specialty → Recurrent |
| `Operations Unit` = Applicable / Not Applicable | Per-course applicability. Only applicable courses count towards completion |
| `Priority` = High / Medium / Low / R | P1 / P2 / P3 / R, with the workbook's legend shown under every plan |
| `Planned Date`, `Year completed` | Real dates for new scheduling; the bare years from the workbook are preserved |
| Certificate hyperlinks in `Comments` | Files in private storage, filed by Training & Standards |

## Exporting

CSV, laid out like the workbook sheet — header block, then the course grid in
columns B–J, the priority legend in L–M, and the sign-off box at the foot. It
opens straight in Excel.

- **Admin → Investigators → Export to CSV** — everyone (one plan after another) or a single investigator.
- **Admin → open a record → Export IDP** — that one plan.
- **Admin → Analytics → Export this view** — the rows behind whatever is on screen.
- **Employee → Download my plan** — their own, and only their own.

Under the hood: `GET /api/plan/export[?employee=<id>]`. An employee always gets
their own plan whatever id they pass. The layout lives in `lib/idp-csv.ts` and is
pinned by `npm run check`.

## The bureau

Five directorates, and no others: **CEO**, **Directorate of Transport
Investigation** (DTI), **Directorate of Technical Services** (DTS), **Transport
Safety Lab** and **Material Lab**. Anything else recorded against somebody reads
as *Unassigned* until it is placed by hand — the register is normalised in
`lib/org.ts`, never guessed.

The register is ordered by rank rather than alphabetically: the Director General,
then directors, deputy directors, general managers, managers, investigators and
trainees. Rank is read from the designation already on the sheet.

## Roles

- **Employee** — sees their own plan, their OJT charts and what has been recorded against them. They do not upload course certificates.
- **Administrator** (Training & Standards) — maintains every plan, files certificates, builds the annual plan, raises funding requests.
- **Director** (DG) — sees every record, and approves, rejects or amends training. Nobody else can, and his own password confirms the first decision of each sitting.

### The firewall around the DG's sign-off

Three things, answering "is there a way that maybe I can override it?":

1. The API refuses `decide_request` and `decide_plan_item` from any role but `director`.
2. Editing anything of substance on a line he has already decided — the course, the institution, the dates, the duration, the cost, the priority — sends that line back to `Pending` automatically. His signature never ends up against something he did not see.
3. His first decision in any 30-minute window asks for his password (`POST /api/auth/confirm`, a second short-lived signed cookie). One password, one sitting, however long the plan.

## The course lifecycle

```
Not started
   │  administrator sets a planned date
   ▼
Planned ──── planned date arrives ────▶ In progress
   │                                        │
   │                                        │  Training & Standards files the certificate
   │                                        ▼
   │                                   Completed
   │
   ├── withdrawn ──▶ Not started  ("we are not going again")
   └── deferred  ──▶ Planned, later deadline  ("don't worry, till next year")
```

Certificates reach the bureau through Training & Standards, so filing one *is*
the verification — there is no separate review queue and staff upload nothing.
Withdrawing or deferring an assigned course both require a reason, which is
written onto the course and into the audit log.

`Overdue` is not a stored state — it is derived from the deadline every time the
plan is read, so a record can never sit stale because a nightly job did not run.
Same for the Planned → In progress rollover.

## The annual training plan

The paper form, made electronic: every investigator with their courses, the
institution, the dates, the **duration** and the cost. It goes to the Director
General, who accepts, rejects or amends each line. Once a line is approved,
Training & Standards puts it on the person's plan — *"it is from that plan that I
come and select, and I say planned"* — which creates the training record with the
institution, dates, duration and approved cost carried across as a note.

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

   **On an existing database, run the migrations instead** — they are additive and
   safe to re-run:

   ```
   supabase/migrations/001-add-profession.sql
   supabase/migrations/002-annual-plan-credentials-ojt.sql
   supabase/migrations/003-director-review.sql
   ```

   `003` is the Director General's review: `training_profile` becomes `specialty`,
   directorate spellings are normalised onto the five, the training-organisations
   directory is created and seeded, OJT charts are attached to their OJT course,
   and the annual plan gains a duration and a link to the catalogue. The
   application reads `employees.specialty`, so it will not start until this has
   been run.

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

## Analytics

`Admin → Analytics` exists because of one question the Director General was asked
at an audit and could not answer: *what percentage of the training you laid down
for 2025 did you achieve?* Set a year, a directorate, a programme type or a
priority, and every figure answers for that slice — achievement against plan,
completion by directorate and by programme type, the weakest courses, and every
person in the slice. `GET /api/analytics` sends the whole register in a compact
form, so the page can answer questions nobody precomputed.

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
| `lib/org.ts` | The five directorates, the spellings that map onto them, and the civil-service rank order |
| `lib/idp-server.ts` | Row → payload mapping, paged reads, role checks |
| `components/ProgrammePlan.tsx` | The collapsible programme-type grid |
| `components/IdpHeader.tsx` | The IDP header block. The completion figure is hidden until it is asked for — a bare "33%" in front of an auditor reads as a score, and it is not one |
| `components/admin/Analytics.tsx` | The queryable analytics console |
| `components/admin/Organisations.tsx` | The directory of training schools |
| `lib/idp-csv.ts` | CSV export in the workbook's own column layout |
| `app/admin/` | Administrator and Director workspace |
| `app/employee/` | Employee workspace |
| `scripts/extract-workbook.py` | IDP workbook → JSON, including title de-duplication |
| `scripts/extract-organisations.py` | AIA workbook's "Training Organisations" sheet → JSON |
| `scripts/import-idp.mjs` | JSON → Supabase |
