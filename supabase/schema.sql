create extension if not exists pgcrypto;

create type public.user_role as enum ('admin', 'training_manager', 'supervisor', 'employee');
create type public.training_status as enum ('Completed', 'Planned', 'In progress', 'Overdue');
create type public.training_priority as enum ('P1', 'P2', 'P3');
create type public.approval_status as enum ('Pending', 'Approved', 'Returned');

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  initials text not null,
  role text not null,
  unit text not null,
  license text,
  email text unique,
  readiness numeric(5,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete set null,
  email text not null unique,
  password_hash text not null,
  role public.user_role not null default 'employee',
  active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  programme_type text not null,
  renewal_cycle text not null default 'Once',
  owner_unit text,
  required boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.training_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete restrict,
  priority public.training_priority,
  status public.training_status not null default 'Planned',
  planned_date date,
  completed_date date,
  due_date date,
  comments text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(employee_id, course_id)
);

create table if not exists public.training_documents (
  id uuid primary key default gen_random_uuid(),
  training_record_id uuid not null references public.training_records(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  content_type text not null,
  file_size integer not null,
  uploaded_by uuid not null references public.app_users(id) on delete restrict,
  review_status public.approval_status not null default 'Pending',
  reviewed_by uuid references public.app_users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete set null,
  training_record_id uuid references public.training_records(id) on delete cascade,
  kind text not null,
  status public.approval_status not null default 'Pending',
  submitted_by uuid references public.app_users(id) on delete set null,
  reviewed_by uuid references public.app_users(id) on delete set null,
  reviewed_at timestamptz,
  comments text,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.app_users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists training_records_employee_idx on public.training_records(employee_id);
create index if not exists training_records_status_idx on public.training_records(status);
create index if not exists training_documents_record_idx on public.training_documents(training_record_id);
create index if not exists approvals_status_idx on public.approvals(status);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);

insert into storage.buckets (id, name, public)
values ('nsib-certificates', 'nsib-certificates', false)
on conflict (id) do nothing;

-- The app uses the server-only Supabase secret key, so storage access is mediated by Next.js.
-- No Supabase Auth policies are used by this application.
