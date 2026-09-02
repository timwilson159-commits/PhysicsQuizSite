-- Run once in the Supabase SQL editor. Moves the admin panel password out of
-- the app's source code (where it was hardcoded) into the database, so it can
-- be changed at runtime from Admin Panel -> Change Password and stored in a
-- password manager.
--
-- Starts as "admin123" (the previous hardcoded value) -- change it from the
-- admin panel immediately after running this.

create table if not exists app_settings (
  id int primary key default 1,
  admin_password text not null default 'admin123',
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id = 1)
);

insert into app_settings (id, admin_password) values (1, 'admin123')
on conflict (id) do nothing;

alter table app_settings enable row level security;

create policy "public full access" on app_settings for all using (true) with check (true);
