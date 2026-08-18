-- NSIB Training Repository — full schema.
-- Mirrors the "Individual Development Plan (IDP)" workbook: one employee header
-- block plus a fixed catalogue of courses grouped by programme type, with a
-- per-employee applicability / priority / status / completion row for each.
--
-- Safe to re-run: drops and recreates application tables. Storage buckets and
-- uploaded files are left alone.

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

insert into storage.buckets (id, name, public)
values ('nsib-certificates', 'nsib-certificates', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('nsib-photos', 'nsib-photos', false)
on conflict (id) do nothing;

-- The app uses the server-only Supabase secret key, so storage access is mediated
-- by Next.js. No Supabase Auth policies are used by this application.
