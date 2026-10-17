-- Big Stepper Schema

create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text,
  created_at timestamptz default now()
);

create table if not exists challenges (
  id uuid default gen_random_uuid() primary key,
  code text unique not null,
  title text not null,
  activity_type text not null check (activity_type in ('walking', 'running', 'both')),
  entry_fee_ngn integer not null default 0,
  visibility text not null check (visibility in ('public', 'private')) default 'public',
  scoring_method text not null default 'steps',
  creator_id uuid references auth.users not null,
  status text default 'upcoming',
  start_date timestamptz,
  end_date timestamptz,
  created_at timestamptz default now()
);

create table if not exists participants (
  id uuid default gen_random_uuid() primary key,
  challenge_id uuid references challenges on delete cascade not null,
  user_id uuid references auth.users not null,
  joined_at timestamptz default now(),
  unique(challenge_id, user_id)
);

create table if not exists activities (
  id uuid default gen_random_uuid() primary key,
  challenge_id uuid references challenges not null,
  user_id uuid references auth.users not null,
  steps integer default 0,
  distance_metres integer default 0,
  duration_seconds integer,
  status text default 'accepted',
  created_at timestamptz default now()
);

create table if not exists payments (
  id uuid default gen_random_uuid() primary key,
  reference text unique not null,
  user_id uuid references auth.users not null,
  challenge_id uuid references challenges not null,
  amount_kobo integer not null,
  status text not null,
  created_at timestamptz default now()
);

-- RLS
alter table profiles enable row level security;
alter table challenges enable row level security;
alter table participants enable row level security;
alter table activities enable row level security;
alter table payments enable row level security;

-- Basic policies (expand as needed)
create policy "Public challenges are viewable" on challenges for select using (visibility = 'public');
create policy "Users can view their own challenges" on challenges for select using (auth.uid() = creator_id);
create policy "Authenticated users can insert challenges" on challenges for insert with check (auth.uid() = creator_id);

create policy "Profiles are viewable" on profiles for select using (true);
create policy "Users can insert own profile" on profiles for insert with check (auth.uid() = id);
