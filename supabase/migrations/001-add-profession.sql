-- Adds the profession field to the profile dashboard.
--
-- Additive and idempotent: no data is dropped, safe to run on a live database.
-- Run this in the Supabase SQL Editor if your tables were created before it.
--
-- Profession is free text, not an enum. The UI offers a dropdown of the common
-- ones (Pilot, Aeronautical Engineer, Air Traffic Controller, Seafarer, ...) plus
-- a box to type anything the list does not cover, so the column has to accept
-- values nobody anticipated.

alter table public.employees add column if not exists profession text;
