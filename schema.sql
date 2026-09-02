-- Physics Quiz Centre — Supabase schema
-- Run this once in the Supabase SQL editor for a fresh project.

create extension if not exists "pgcrypto";

-- ─── USERS ──────────────────────────────────────────────────────────────────
create table if not exists users (
  code text primary key,
  name text not null,
  class_name text,
  year text,
  created_at timestamptz not null default now()
);

-- ─── QUESTIONS ──────────────────────────────────────────────────────────────
-- One flat bank per inquiry question. module_id / inquiry_id are the string
-- ids from MODULE_DEFS in the app (e.g. "module-5", "5.1").
create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  module_id text not null,
  inquiry_id text not null,
  type text not null check (type in (
    'multiple-choice','true-false','word-bank','drag-drop','ordering','numeric-entry'
  )),
  prompt text not null,
  image text default '',
  options jsonb,        -- multiple-choice / true-false
  bank jsonb,            -- word-bank
  pairs jsonb,           -- drag-drop
  items jsonb,           -- ordering
  answer jsonb not null, -- shape depends on type; for numeric-entry it is the expected number
  -- numeric-entry only:
  tolerance numeric,                       -- null -> app default (2, treated as percent)
  tolerance_mode text default 'relative'
    check (tolerance_mode in ('relative','absolute')),
  unit text default '',                    -- shown beside the input, not typed by the student
  hint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_questions_module_inquiry on questions (module_id, inquiry_id);

-- ─── QUESTION FLAGS ─────────────────────────────────────────────────────────
create table if not exists question_flags (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  user_code text not null,
  reasons text[] not null default '{}',
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_flags_resolved on question_flags (resolved);

-- ─── ATTEMPTS ───────────────────────────────────────────────────────────────
-- Every practice attempt is its own row (full history kept). Each attempt
-- snapshots the exact questions it was built from, so history stays accurate
-- even if a question is later edited or deleted.
create table if not exists attempts (
  id uuid primary key default gen_random_uuid(),
  user_code text not null,
  scope_type text not null check (scope_type in ('inquiry','module','year')),
  scope_id text not null,          -- inquiry id, module id, or 'year' literal
  question_snapshot jsonb not null,
  answers jsonb not null default '{}',
  correct int not null default 0,
  total int not null default 0,
  submitted_at timestamptz not null default now()
);

create index if not exists idx_attempts_user on attempts (user_code);
create index if not exists idx_attempts_scope on attempts (scope_type, scope_id);

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────────────────────
-- Simple school revision tool: the app uses the anon key directly (no Supabase
-- auth), matching the Biology Quiz Centre's pattern. RLS is enabled with
-- permissive policies so the anon key can read/write everything. This is fine
-- for a low-stakes internal tool but is NOT a real access-control boundary --
-- anyone with the anon key (visible in the deployed frontend) can read/write
-- these tables.
alter table users enable row level security;
alter table questions enable row level security;
alter table question_flags enable row level security;
alter table attempts enable row level security;

create policy "public full access" on users for all using (true) with check (true);
create policy "public full access" on questions for all using (true) with check (true);
create policy "public full access" on question_flags for all using (true) with check (true);
create policy "public full access" on attempts for all using (true) with check (true);
