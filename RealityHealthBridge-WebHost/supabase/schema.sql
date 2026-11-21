-- =====================================================================
-- REALITY HEALTH BRIDGE - ONE database script for the portal AND the RHB app
-- Supabase > your RHB project > SQL Editor > New query > paste ALL > Run.
-- Safe to run again. It creates only what is missing and DELETES NO DATA.
-- (If you ran an older RHB script before, tell me first.)
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------- PORTAL: facility accounts (one per portal login) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  facility_name text not null default '',
  full_name text not null default '',
  email text not null default '',
  phone text not null default '',
  location text not null default '',
  facility_type text not null default 'Other',
  registration_code text not null default '',
  role text not null default 'subscriber' check (role in ('admin','subscriber')),
  subscription_status text not null default 'pending' check (subscription_status in ('pending','active','expired','suspended')),
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists registration_code text not null default '';

-- ---------- PORTAL: project directory ----------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  url text not null,
  platform text not null default 'Web',
  access_level text not null default 'subscriber' check (access_level in ('all','subscriber')),
  published boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- RHB APP: facilities registered inside the app ----------
create table if not exists public.facilities (
  id uuid primary key default gen_random_uuid(),
  sync_id text unique not null,
  name text not null,
  location text,
  contact text,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'),
  secret_code text not null,
  trial_ends date,
  status text not null default 'trial' check (status in ('trial','active','expired','suspended')),
  registered_at timestamptz not null default now()
);
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  package text not null,
  devices int not null default 1,
  starts_on date,
  expires_on date,
  status text not null default 'trial' check (status in ('trial','active','expired','cancelled')),
  payment_ref text,
  amount numeric,
  created_at timestamptz not null default now()
);

alter table public.profiles      enable row level security;
alter table public.projects      enable row level security;
alter table public.facilities    enable row level security;
alter table public.subscriptions enable row level security;

-- A profile is created automatically when someone registers on the portal.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, facility_name, full_name, email, phone, location, facility_type, registration_code)
  values (new.id,
    coalesce(new.raw_user_meta_data->>'facility_name',''),
    coalesce(new.raw_user_meta_data->>'full_name',''),
    coalesce(new.email,''),
    coalesce(new.raw_user_meta_data->>'phone',''),
    coalesce(new.raw_user_meta_data->>'location',''),
    coalesce(new.raw_user_meta_data->>'facility_type','Other'),
    coalesce(new.raw_user_meta_data->>'registration_code',''));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_rhb_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Portal access rules
drop policy if exists "Users can read own facility profile" on public.profiles;
create policy "Users can read own facility profile" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_rhb_admin());
drop policy if exists "Admins can manage profiles" on public.profiles;
create policy "Admins can manage profiles" on public.profiles
  for all to authenticated using (public.is_rhb_admin()) with check (public.is_rhb_admin());

drop policy if exists "Public projects visible to everyone" on public.projects;
create policy "Public projects visible to everyone" on public.projects
  for select to anon, authenticated using (published = true and access_level = 'all');
drop policy if exists "Published projects visible to entitled signed-in users" on public.projects;
create policy "Published projects visible to entitled signed-in users" on public.projects
  for select to authenticated using (published = true and exists (select 1 from public.profiles p where p.id = auth.uid() and p.subscription_status = 'active'));
drop policy if exists "Admins manage projects" on public.projects;
create policy "Admins manage projects" on public.projects
  for all to authenticated using (public.is_rhb_admin()) with check (public.is_rhb_admin());

-- facilities + subscriptions: only admins (and you, in the dashboard) can see them
drop policy if exists "Admins manage facilities" on public.facilities;
create policy "Admins manage facilities" on public.facilities
  for all to authenticated using (public.is_rhb_admin()) with check (public.is_rhb_admin());
drop policy if exists "Admins manage subscriptions" on public.subscriptions;
create policy "Admins manage subscriptions" on public.subscriptions
  for all to authenticated using (public.is_rhb_admin()) with check (public.is_rhb_admin());

-- The ONLY thing the RHB app may do with the public key: register a new facility.
create or replace function public.register_facility(
  p_sync_id text, p_name text, p_location text, p_contact text,
  p_email text, p_secret_code text, p_trial_ends date
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if coalesce(trim(p_sync_id),'') = '' or coalesce(trim(p_name),'') = '' or coalesce(trim(p_secret_code),'') = '' then
    return jsonb_build_object('ok', false, 'error', 'Missing details');
  end if;
  if coalesce(p_email,'') !~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    return jsonb_build_object('ok', false, 'error', 'A valid facility email is required');
  end if;
  insert into public.facilities (sync_id, name, location, contact, email, secret_code, trial_ends)
  values (trim(p_sync_id), trim(p_name), nullif(trim(p_location),''), nullif(trim(p_contact),''),
          lower(trim(p_email)), trim(p_secret_code), p_trial_ends)
  on conflict (sync_id) do nothing returning id into v_id;
  if v_id is null then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  insert into public.subscriptions (facility_id, package, devices, expires_on, status)
  values (v_id, 'Free trial', 1, p_trial_ends, 'trial');
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.register_facility(text,text,text,text,text,text,date) from public;
grant execute on function public.register_facility(text,text,text,text,text,text,date) to anon, authenticated;

-- =====================================================================
-- AFTER you have registered your own account on the portal, run this ONE line
-- separately (replace the email) to make yourself the administrator:
--
--   update public.profiles set role='admin', subscription_status='active'
--   where email='YOUR_LOGIN_EMAIL';
-- =====================================================================
