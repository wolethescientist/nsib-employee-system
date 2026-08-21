-- Changes asked for by the Director General at the system review.
--
--   1. "Technical profile" is not what belongs there — it is the person's
--      SPECIALTY. Column renamed.
--   2. Five directorates and no others. The register spells the same one four
--      ways; the confident spellings are normalised here.
--   3. The bureau's directory of training schools becomes a page of its own, so
--      it needs a table. Seeded from the "Training Organisations" sheet of the
--      AIA Training Program Management workbook.
--   4. The OJT progress chart is content of OJT 1 / OJT 2 / OJT 3, not a
--      separate item — a chart now points at the course it belongs to.
--   5. The annual plan carries a duration alongside the dates and the cost, and
--      an approved line can be taken onto somebody's plan.
--
-- Safe to re-run.

-- ---- 1. training profile -> specialty --------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'employees' and column_name = 'training_profile')
     and not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'employees' and column_name = 'specialty')
  then
    alter table public.employees rename column training_profile to specialty;
  end if;
end $$;

alter table public.employees add column if not exists specialty text;

-- ---- 2. the five directorates ----------------------------------------------
-- Only spellings there is no doubt about. "Operations" and "Special duties" are
-- deliberately left alone: the Director removed Operations without saying where
-- those staff go, and the application shows anything outside the five as
-- "Unassigned" so Training & Standards can place them by hand.
create or replace function public.nsib_directorate(value text) returns text as $$
  select case regexp_replace(lower(coalesce(value, '')), '[^a-z]', '', 'g')
    when 'ceo' then 'CEO'
    when 'dg' then 'CEO'
    when 'dti' then 'Directorate of Transport Investigation'
    when 'investigation' then 'Directorate of Transport Investigation'
    when 'transportinvestigation' then 'Directorate of Transport Investigation'
    when 'traansportinvestigation' then 'Directorate of Transport Investigation'
    when 'technicalinvestigation' then 'Directorate of Transport Investigation'
    when 'directorateoftransportinvestigation' then 'Directorate of Transport Investigation'
    when 'dts' then 'Directorate of Technical Services'
    when 'technical' then 'Directorate of Technical Services'
    when 'technicalservices' then 'Directorate of Technical Services'
    when 'directorateoftechnicalservices' then 'Directorate of Technical Services'
    when 'safetylab' then 'Transport Safety Lab'
    when 'transportsafetylab' then 'Transport Safety Lab'
    when 'materiallab' then 'Material Lab'
    when 'materialslab' then 'Material Lab'
    else null
  end;
$$ language sql immutable;

update public.employees set division = public.nsib_directorate(division) where public.nsib_directorate(division) is not null;
update public.employees set department = public.nsib_directorate(department) where public.nsib_directorate(department) is not null;

-- The hierarchy ordering reads the designation, and the register spells the top
-- of it "Director Geenral".
update public.employees set designation = 'Director General' where designation ilike 'director%ge_nral';

-- The helper was only ever for these two statements.
drop function if exists public.nsib_directorate(text);

-- ---- 3. training organisations ---------------------------------------------
create table if not exists public.training_organisations (
  id uuid primary key default gen_random_uuid(),
  serial smallint,
  name text not null unique,
  website text,
  email text,
  phone text,
  contact text,
  address text,
  -- What the bureau actually sends people there for. Free text: the sheet holds
  -- "Basic Training", "PH2.3 OJT" and course names side by side.
  courses text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists training_organisations_name_idx on public.training_organisations(name);

-- Seeded from the "Training Organisations" sheet, via
-- scripts/extract-organisations.py. `do nothing` on conflict, so re-running the
-- migration never overwrites a contact Training & Standards has corrected.
insert into public.training_organisations (serial, name, website, email, phone, contact, address) values
  (1, 'EGIS AVIA', 'https://www.egis-group.com/sectors/aviation', null, null, null, null),
  (2, 'ENAC', 'https://www.training.enac.fr', null, '+33 (0)5 62 17 40 00', null, '7, avenue Edouard Belin, BP 31055, Toulouse Cedex 4 FRANCE'),
  (3, 'G2ACAMAS', 'https://www.g2acamas.com', 'training@g2acamas.com', '+230 673 1453', null, '3 De Caen Street, Forest Side (Opposite Imperial College), MAURITIUS'),
  (4, 'IGAT ICAO', 'https://www.igat.icao.int', 'sales@icao.int', '+1 514-954-8022', null, 'ICAO Store, 999 Robert-Bourassa Boulevard, Montréal (Quebec) Canada H3C 5H7, ICAO Offices'),
  (7, 'Joint Aviation Authorities Training Organisation', 'https://www.jaato.com', 'training@jaato.com', '31 (0) 23 56 797 90, +31 (0) 23 56 797 10', null, 'Beechavenue 1 - 19, 1119 RA, Schiphol-Rijk, The Netherlands'),
  (8, 'Singapore aviation academy (SAA)', 'https://www.saa.caas.gov.sg', 'Jasmin_ISMAIL@caas.gov.sg', '+33661299938', null, 'Singpapore'),
  (9, 'Southern California Safety Institute', 'https://www.scsi-inc.com', 'registrar@scsi-inc.com', '+310-517-8844', null, '24325 Crenshaw Blvd, #226, Torrance, CA 90505'),
  (10, 'Southpac Aerospace Courses', 'https://www.southpac.biz', 'admin@southpac.biz', '+61 7 5533 9988', null, 'Unit 2b - 5 Executive Drive, Burleigh Waters QLD 4220'),
  (11, 'Nigeria college of aviation technology', 'https://www.ncat.gov.ng', 'info@ncat.gov.ng, academics@ncat.gov.ng', '+2347015099833', null, 'Zaria, Kaduna State, Nigeria .'),
  (12, 'Sofema Aviation services', 'https://www.sassofia.com', 'team@sassofia.com', null, null, 'Yakubitsa str. 19, Fl. 4, 1164, Sofia, Bulgari'),
  (13, 'Centro de investigaçao e prevencao de acidentes aeronauticos', 'https://www.fab.mil.br', 'Protocol.cenipa@fab.mil.br', null, null, 'SHIS-QI5 aera especial 12 Lago Sul'),
  (14, 'Cranfield aviation training', 'https://www.cranfield.co.za', 'info@cranfield.co.za', '+27 11 708 2588/98', null, null),
  (15, 'IATA', 'https://www.iata.org/en/training/courses', null, null, null, null),
  (16, 'UK civil aviation authority', 'https://www.caa.co.uk', null, null, null, null),
  (17, 'Global Air Training', 'https://www.globalairtraining.com', 'ops@globalairtraining.com', '+44 (0)1829 771334', null, null),
  (18, 'Entreprise University of Pretoria', 'https://www.enterprises.up.ac.za', null, null, null, null),
  (19, 'Embry-Riddle aeronautical university', 'https://www.enrole.com', 'dbproed@erau.edu', '386.226.6928', 'Sarah Ochs', 'Daytona Beach Campus, Advanced Flight Simulation Center (Daytona Beach Campus, FL), 311 Aerospace Blvd., Room 204, Daytona Beach, FL 32114'),
  (20, 'USC Viterbi', 'https://aviationsafety.usc.edu/courses', 'scalese@usc.edu', '310-342-1345', null, '6033 West Century Blvd. Ste. 920, Los Angeles CA 90045'),
  (21, 'East African School of Aviation', 'https://www.easa.ac.ke', 'info@easa.ac.ke', '+254 20 6823699', null, 'P.O. Box: 30689-00100,, Nairobi, Kenya'),
  (22, 'Air formation', 'https://airformationelearning.com', null, null, null, null),
  (23, 'Lift Aviation', 'https://liftaviation.com.br', null, null, null, null),
  (24, 'Absant Training', 'https://absant-group.pt', 'formacao@absant-group.pt', '+351 927 413 517', null, 'Rua de São Pedro N.o 1 – Escritório 203 2685-110 Sacavém, Portugal'),
  (25, 'Global Aviation Training (GAT) ICAO', 'https://www.icao.int/training/Pages/default.aspx', null, null, null, null)
on conflict (name) do nothing;

-- ---- 4. an OJT chart belongs to an OJT course ------------------------------
alter table public.ojt_charts add column if not exists course_id uuid references public.courses(id) on delete set null;
create index if not exists ojt_charts_course_idx on public.ojt_charts(course_id);

-- Charts opened before this change are not attached to a phase. Attach each
-- employee's charts to OJT 1, OJT 2, OJT 3 in the order they were opened, which
-- is the order the phases run in.
with numbered as (
  select c.id, row_number() over (partition by c.employee_id order by c.created_at) as phase
  from public.ojt_charts c
  where c.course_id is null
),
phases as (
  select id, row_number() over (order by sort_order) as phase
  from public.courses
  where programme_type = 'OJT'
)
update public.ojt_charts
set course_id = phases.id
from numbered join phases on phases.phase = numbered.phase
where public.ojt_charts.id = numbered.id;

-- ---- 5. the annual plan ----------------------------------------------------
-- The Director: "courses against everybody's name with the amount, the time,
-- the duration". Dates and duration are separate things on the paper form.
alter table public.annual_plan_items add column if not exists duration text;
-- Once the DG has approved a line, Training & Standards takes it onto the
-- person's plan: that is what "I will say planned" means.
alter table public.annual_plan_items add column if not exists course_id uuid references public.courses(id) on delete set null;
alter table public.annual_plan_items add column if not exists assigned_record_id uuid references public.training_records(id) on delete set null;

-- ponytail: no table for the Director General's step-up confirmation. It is a
-- second short-lived signed cookie (lib/session.ts), so nothing has to be
-- cleaned up when it expires.
