-- Add username + is_active fields to qm_profiles
alter table qm_profiles
  add column if not exists username text,
  add column if not exists is_active boolean not null default true,
  add column if not exists username_updated_at timestamptz;

-- Username constraints: 3-30 chars, lowercase letters/digits/underscore, optional dot/hyphen
alter table qm_profiles
  drop constraint if exists qm_profiles_username_check;
alter table qm_profiles
  add constraint qm_profiles_username_check
    check (username is null or username ~ '^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$');

-- Case-insensitive uniqueness
create unique index if not exists qm_profiles_username_lower_uidx
  on qm_profiles ((lower(username))) where username is not null;

-- RLS: users can update their own username column already covered by self-update policy
