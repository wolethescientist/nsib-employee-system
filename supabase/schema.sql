-- NSIB Training Repository — full schema.
-- Mirrors the "Individual Development Plan (IDP)" workbook: one employee header
-- block plus a fixed catalogue of courses grouped by programme type, with a
-- per-employee applicability / priority / status / completion row for each.
--
-- Safe to re-run: drops and recreates application tables. Storage buckets and
-- uploaded files are left alone.

drop table if exists public.ojt_tasks cascade;
drop table if exists public.ojt_charts cascade;
drop table if exists public.staff_credentials cascade;
drop table if exists public.annual_plan_items cascade;
drop table if exists public.training_requests cascade;
drop table if exists public.training_documents cascade;
drop table if exists public.approvals cascade;
drop table if exists public.training_records cascade;
drop table if exists public.audit_logs cascade;
drop table if exists public.app_users cascade;
drop table if exists public.courses cascade;
drop table if exists public.employees cascade;

drop type if exists public.user_role cascade;
drop type if exists public.training_status cascade;
drop type if exists public.training_priority cascade;
drop type if exists public.approval_status cascade;
drop type if exists public.request_status cascade;
drop type if exists public.dg_decision cascade;

create extension if not exists pgcrypto;

-- 'director' is the DG: sees every record and signs off funded training requests.
-- 'admin' is Training & Standards: maintains plans and verifies certificates.
create type public.user_role as enum ('admin', 'training_manager', 'supervisor', 'employee', 'director');

-- 'Submitted' = employee uploaded a certificate and is awaiting admin verification.
-- There is deliberately no 'Overdue' member: overdue is derived from due_date at
-- read time (see lib/programme.ts) so it can never go stale in the database.
create type public.training_status as enum ('Not started', 'Planned', 'In progress', 'Submitted', 'Completed');

-- Matches the workbook legend: High(P1), Medium(P2), Low(P3), R = recurrent every 2 years.
create type public.training_priority as enum ('P1', 'P2', 'P3', 'R');

create type public.approval_status as enum ('Pending', 'Approved', 'Returned');
create type public.request_status as enum ('Pending', 'Approved', 'Declined');

-- The IDP header block, one row per member of staff.
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  sheet_key text unique,
  name text not null,
  initials text not null,
  designation text,
  division text,
  department text,
  -- Professional background: Pilot, Aeronautical Engineer, Air Traffic
  -- Controller, Seafarer and so on. Free text, not an enum — the UI suggests the
  -- common ones but lets the administrator type anything the list misses.
  profession text,
  -- Where the person sits in the training hierarchy: Trainee, DTI (Designated
  -- Training Instructor), Director and so on. Free text like profession, since
  -- the UI offers the known levels plus a box for one the list misses.
  personnel_level text,
  training_profile text,
  years_experience smallint,
  qualifications text,
  license text,
  email text unique,
  photo_path text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete set null,
  email text not null unique,
  password_hash text not null,
  role public.user_role not null default 'employee',
  active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

-- The controlled catalogue. sort_order preserves the workbook's row order so the
-- system reads the same way the spreadsheet does. Name alone is not unique:
-- "Flight Data Analysis" exists under both Specialty and Recurrent.
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  programme_type text not null,
  sort_order integer not null default 0,
  renewal_cycle text not null default 'Once',
  owner_unit text,
  required boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (programme_type, name)
);

-- One row per employee per course — the body of the IDP grid.
create table public.training_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete restrict,
  -- The workbook's "Operations Unit" column: is this course relevant to this person?
  applicable boolean not null default true,
  priority public.training_priority,
  status public.training_status not null default 'Not started',
  planned_date date,
  planned_year smallint,      -- the workbook records a bare year, not a full date
  due_date date,              -- deadline; overdue is derived from this
  completed_date date,
  completed_year smallint,
  comments text,
  review_comment text,        -- why the admin returned the last certificate
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, course_id)
);

create table public.training_documents (
  id uuid primary key default gen_random_uuid(),
  training_record_id uuid not null references public.training_records(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  content_type text not null,
  file_size integer not null,
  uploaded_by uuid not null references public.app_users(id) on delete restrict,
  review_status public.approval_status not null default 'Pending',
  review_comment text,
  reviewed_by uuid references public.app_users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Funded / overseas training that needs the DG's signature before it is assigned.
create table public.training_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  course_title text not null,
  provider text,
  location text,
  travel text not null default 'Local',
  start_date date,
  end_date date,
  cost numeric(14,2),
  currency text not null default 'NGN',
  justification text,
  status public.request_status not null default 'Pending',
  raised_by uuid references public.app_users(id) on delete set null,
  decided_by uuid references public.app_users(id) on delete set null,
  decided_at timestamptz,
  decision_comment text,
  assigned_record_id uuid references public.training_records(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.app_users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index training_records_employee_idx on public.training_records(employee_id);
create index training_records_course_idx on public.training_records(course_id);
create index training_records_status_idx on public.training_records(status);
create index training_documents_record_idx on public.training_documents(training_record_id);
create index training_documents_review_idx on public.training_documents(review_status);
create index training_requests_status_idx on public.training_requests(status);
create index courses_order_idx on public.courses(programme_type, sort_order);
create index audit_logs_created_idx on public.audit_logs(created_at desc);

-- ---- the annual training plan ---------------------------------------------
-- One row per member of staff per course per year — the "2026 ANNUAL TRAINING
-- PLAN FOR INVESTIGATORS" sheet, with the Director General's decision alongside
-- each line instead of on a separate memo.
create type public.dg_decision as enum ('Pending', 'Approved', 'Rejected', 'Amended');

create table public.annual_plan_items (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  year smallint not null,
  -- The "1) 2) 3)" numbering inside one person's year, so the plan reads in the
  -- order Training & Standards wrote it rather than alphabetically.
  serial smallint not null default 1,
  course_title text not null,
  institution text,            -- INSTITUTION / COUNTRY, e.g. "Cranfield University, UK"
  -- Free text on purpose. The sheet holds "6 -24 July 2026", "TBD", "5 Days" and
  -- bare years; forcing a date range would lose most of the plan on import.
  training_dates text,
  priority public.training_priority,
  training_type text,          -- Initial / Basic / Advance / Specialize / Recurrent / OJT
  cost numeric(14,2),
  currency text not null default 'NGN',
  -- External by default; "In-house" is what the DG picks when an NSIB expert can
  -- deliver the course instead of a foreign provider.
  delivery text not null default 'External',

  -- The Director General's column.
  dg_status public.dg_decision not null default 'Pending',
  dg_institution text,         -- "not the UK — send them to the USA"
  dg_delivery text,            -- "an in-house expert can do this"
  dg_comment text,
  dg_decided_by uuid references public.app_users(id) on delete set null,
  dg_decided_at timestamptz,
  -- ponytail: no dg_cost column. The DG amends venue and delivery; Training &
  -- Standards re-prices and the new figure lands on `cost`. Add one if the DG
  -- starts quoting figures himself.

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, year, course_title)
);

create index annual_plan_year_idx on public.annual_plan_items(year, employee_id, serial);
create index annual_plan_dg_idx on public.annual_plan_items(dg_status);

-- ---- staff credentials -----------------------------------------------------
-- Qualification certificates (degrees, licences, diplomas). Never compulsory —
-- there is no per-employee requirement anywhere, a member of staff uploads these
-- if and when they have them.
create table public.staff_credentials (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  title text not null,         -- "B.Eng. Mechanical Engineering"
  institution text,
  year_obtained smallint,
  file_name text not null,
  storage_path text not null unique,
  content_type text not null,
  file_size integer not null,
  uploaded_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index staff_credentials_employee_idx on public.staff_credentials(employee_id);

-- ---- OJT progress charts ---------------------------------------------------
-- The paper "Aircraft Accident Investigator OJT Progress Chart", as a record.
-- Each task is signed off at three levels: I Discuss, II Observe/Assist,
-- III Perform.
create table public.ojt_charts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  title text not null default 'Aircraft Accident Investigator OJT Progress Chart',
  grade_level text,            -- "ASI V"
  supervisor text,             -- the OJT instructor, who may not have a login
  status text not null default 'Open',   -- Open | Completed
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.ojt_tasks (
  id uuid primary key default gen_random_uuid(),
  chart_id uuid not null references public.ojt_charts(id) on delete cascade,
  task text not null,
  source text,                 -- "Initial/Basic", "Basic", "Advanced"
  sort_order integer not null default 0,
  -- "Confirmed By" and "Sign. & Date" from the form, once per level. Held as the
  -- instructor's name rather than a user id: the confirming instructor is often
  -- a supervisor with no account in this system.
  level1_by text, level1_at date,
  level2_by text, level2_at date,
  level3_by text, level3_at date,
  comment text
);

create index ojt_charts_employee_idx on public.ojt_charts(employee_id);
create index ojt_tasks_chart_idx on public.ojt_tasks(chart_id, sort_order);

insert into storage.buckets (id, name, public)
values ('nsib-certificates', 'nsib-certificates', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('nsib-photos', 'nsib-photos', false)
on conflict (id) do nothing;

-- The app uses the server-only Supabase secret key, so storage access is mediated
-- by Next.js. No Supabase Auth policies are used by this application.
