-- The annual training plan, staff credentials, personnel levels and OJT charts.
--
-- Additive and idempotent: nothing is dropped, so this is safe to run on a live
-- database. Paste it into the Supabase SQL Editor if your tables predate it.

-- ---- personnel level -------------------------------------------------------
-- Trainee, DTI (Designated Training Instructor), Director and so on. Free text
-- for the same reason profession is: the UI suggests the known ones and lets an
-- administrator type one the list misses.
alter table public.employees add column if not exists personnel_level text;

-- ---- the annual training plan ---------------------------------------------
-- One row per member of staff per course per year — the "2026 ANNUAL TRAINING
-- PLAN FOR INVESTIGATORS" sheet, with the Director General's decision alongside
-- each line instead of on a separate memo.
do $$ begin
  create type public.dg_decision as enum ('Pending', 'Approved', 'Rejected', 'Amended');
exception when duplicate_object then null; end $$;

create table if not exists public.annual_plan_items (
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

create index if not exists annual_plan_year_idx on public.annual_plan_items(year, employee_id, serial);
create index if not exists annual_plan_dg_idx on public.annual_plan_items(dg_status);

-- ---- staff credentials -----------------------------------------------------
-- Qualification certificates (degrees, licences, diplomas). Never compulsory —
-- there is no per-employee requirement anywhere, a member of staff uploads these
-- if and when they have them.
create table if not exists public.staff_credentials (
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

create index if not exists staff_credentials_employee_idx on public.staff_credentials(employee_id);

-- ---- OJT progress charts ---------------------------------------------------
-- The paper "Aircraft Accident Investigator OJT Progress Chart", as a record.
-- Each task is signed off at three levels: I Discuss, II Observe/Assist,
-- III Perform.
create table if not exists public.ojt_charts (
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

create table if not exists public.ojt_tasks (
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

create index if not exists ojt_charts_employee_idx on public.ojt_charts(employee_id);
create index if not exists ojt_tasks_chart_idx on public.ojt_tasks(chart_id, sort_order);
