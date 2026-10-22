create extension if not exists "pgcrypto";

create type lab_role as enum ('owner', 'admin', 'viewer');
create type request_status as enum ('pending', 'approved', 'denied');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.labs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  institution text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.lab_members (
  lab_id uuid not null references public.labs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role lab_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (lab_id, user_id)
);

create table if not exists public.lab_join_requests (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_role lab_role not null default 'viewer',
  status request_status not null default 'pending',
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  unique (lab_id, user_id, status)
);

create table if not exists public.breeding_cages (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  line text not null,
  cage text not null,
  pairing text not null,
  male_genotype text not null,
  male_dob date,
  female_genotype text not null,
  female_dob date,
  extra_female text,
  pups_dob date,
  pups_count integer,
  genotype_needed boolean not null default false,
  priority boolean not null default false,
  notes text,
  custom_fields jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.individual_cages (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  line text not null,
  cage text not null,
  genotype text not null,
  sex text not null,
  dob date,
  count integer not null default 1,
  genotype_map text,
  notes text,
  source_litter_id uuid,
  source_pup_ids text[],
  custom_fields jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.litters (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  line text not null,
  reference text not null,
  breeding_cage_id uuid references public.breeding_cages(id) on delete set null,
  breeding_cage_label text not null,
  dob date not null,
  pup_count integer not null,
  genotype_required boolean not null default false,
  pups jsonb not null default '[]'::jsonb,
  attachment_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_entries (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  line text not null,
  cage text,
  work_date date not null,
  work_type text not null,
  description text not null,
  follow_up_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.evidence_files (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  related_table text not null,
  related_id uuid,
  file_path text not null,
  file_name text not null,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.colony_snapshots (
  lab_id uuid primary key references public.labs(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'colony_snapshots'
  ) then
    alter publication supabase_realtime add table public.colony_snapshots;
  end if;
end
$$;

create or replace function public.is_lab_member(target_lab_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.lab_members
    where lab_id = target_lab_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_lab_admin(target_lab_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.lab_members
    where lab_id = target_lab_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

create or replace function public.approve_lab_join_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_request public.lab_join_requests;
begin
  select * into target_request
  from public.lab_join_requests
  where id = request_id and status = 'pending';

  if target_request.id is null then
    raise exception 'Join request not found';
  end if;

  if not public.is_lab_admin(target_request.lab_id) then
    raise exception 'Only lab owners/admins can approve requests';
  end if;

  insert into public.lab_members (lab_id, user_id, role)
  values (target_request.lab_id, target_request.user_id, target_request.requested_role)
  on conflict (lab_id, user_id) do update set role = excluded.role;

  update public.lab_join_requests
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  where id = request_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.labs enable row level security;
alter table public.lab_members enable row level security;
alter table public.lab_join_requests enable row level security;
alter table public.breeding_cages enable row level security;
alter table public.individual_cages enable row level security;
alter table public.litters enable row level security;
alter table public.work_entries enable row level security;
alter table public.evidence_files enable row level security;
alter table public.colony_snapshots enable row level security;

create policy "Users can read their own profile" on public.profiles for select using (id = auth.uid());
create policy "Users can update their own profile" on public.profiles for update using (id = auth.uid());
create policy "Users can see lab directory" on public.labs for select to authenticated using (true);
create policy "Owners can create labs" on public.labs for insert to authenticated with check (created_by = auth.uid());
create policy "Members can read lab members" on public.lab_members for select using (public.is_lab_member(lab_id));
create policy "Admins can manage lab members" on public.lab_members for all using (public.is_lab_admin(lab_id));
create policy "Users can create their join requests" on public.lab_join_requests for insert with check (user_id = auth.uid());
create policy "Users and admins can read join requests" on public.lab_join_requests for select using (user_id = auth.uid() or public.is_lab_admin(lab_id));
create policy "Admins can update join requests" on public.lab_join_requests for update using (public.is_lab_admin(lab_id));

create policy "Members read breeding cages" on public.breeding_cages for select using (public.is_lab_member(lab_id));
create policy "Admins write breeding cages" on public.breeding_cages for all using (public.is_lab_admin(lab_id));
create policy "Members read individual cages" on public.individual_cages for select using (public.is_lab_member(lab_id));
create policy "Admins write individual cages" on public.individual_cages for all using (public.is_lab_admin(lab_id));
create policy "Members read litters" on public.litters for select using (public.is_lab_member(lab_id));
create policy "Admins write litters" on public.litters for all using (public.is_lab_admin(lab_id));
create policy "Members read work entries" on public.work_entries for select using (public.is_lab_member(lab_id));
create policy "Admins write work entries" on public.work_entries for all using (public.is_lab_admin(lab_id));
create policy "Members read evidence files" on public.evidence_files for select using (public.is_lab_member(lab_id));
create policy "Admins write evidence files" on public.evidence_files for all using (public.is_lab_admin(lab_id));
create policy "Members read colony snapshots" on public.colony_snapshots for select using (public.is_lab_member(lab_id));
create policy "Approved members write colony snapshots" on public.colony_snapshots for all
  using (public.is_lab_member(lab_id))
  with check (public.is_lab_member(lab_id));

insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', false)
on conflict (id) do nothing;

create policy "Lab members can view evidence storage" on storage.objects
for select using (bucket_id = 'evidence' and auth.role() = 'authenticated');

create policy "Authenticated users can upload evidence storage" on storage.objects
for insert with check (bucket_id = 'evidence' and auth.role() = 'authenticated');
