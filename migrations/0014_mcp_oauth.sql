-- 0014_mcp_oauth.sql
-- Lapisan OAuth 2.1 untuk Kuizen MCP Server

begin;

create schema if not exists mcp;
alter schema mcp owner to supabase_admin;

create table if not exists mcp.oauth_clients (
  client_id            text primary key,
  client_secret_hash   text,
  client_name          text not null default 'Unknown MCP Client',
  redirect_uris        text[] not null,
  grant_types          text[] not null default array['authorization_code','refresh_token'],
  response_types       text[] not null default array['code'],
  token_endpoint_auth_method text not null default 'none',
  scope                text not null default 'kuizen:read kuizen:write',
  created_at           timestamptz not null default now(),
  last_used_at         timestamptz
);

create table if not exists mcp.auth_codes (
  code_hash            text primary key,
  client_id            text not null references mcp.oauth_clients(client_id) on delete cascade,
  user_id              uuid not null,
  redirect_uri         text not null,
  scope                text not null,
  resource             text,
  code_challenge       text not null,
  code_challenge_method text not null default 'S256',
  sb_refresh_token     text not null,
  expires_at           timestamptz not null,
  consumed_at          timestamptz,
  created_at           timestamptz not null default now()
);

create index if not exists auth_codes_expires_idx on mcp.auth_codes (expires_at);

create table if not exists mcp.tokens (
  id                   uuid primary key default gen_random_uuid(),
  family_id            uuid not null default gen_random_uuid(),
  access_token_hash    text unique not null,
  refresh_token_hash   text unique,
  client_id            text not null references mcp.oauth_clients(client_id) on delete cascade,
  user_id              uuid not null,
  scope                text not null,
  resource             text,
  sb_refresh_token     text not null,
  sb_access_token      text,
  sb_access_expires_at timestamptz,
  expires_at           timestamptz not null,
  refresh_expires_at   timestamptz,
  revoked_at           timestamptz,
  created_at           timestamptz not null default now(),
  last_used_at         timestamptz
);

create index if not exists tokens_user_idx    on mcp.tokens (user_id);
create index if not exists tokens_family_idx  on mcp.tokens (family_id);
create index if not exists tokens_expires_idx on mcp.tokens (expires_at);

create table if not exists mcp.tool_calls (
  id           bigserial primary key,
  user_id      uuid,
  client_id    text,
  tool_name    text not null,
  arguments    jsonb,
  ok           boolean not null,
  error        text,
  duration_ms  integer,
  created_at   timestamptz not null default now()
);

create index if not exists tool_calls_user_idx    on mcp.tool_calls (user_id, created_at desc);
create index if not exists tool_calls_created_idx on mcp.tool_calls (created_at desc);

alter table mcp.oauth_clients enable row level security;
alter table mcp.auth_codes    enable row level security;
alter table mcp.tokens        enable row level security;
alter table mcp.tool_calls    enable row level security;

-- Tiada policy = tiada akses untuk anon/authenticated.
-- service_role memintas RLS, jadi hanya kod server boleh membaca jadual ini.

revoke all on all tables in schema mcp from anon, authenticated;
grant usage on schema mcp to service_role;
grant all on all tables in schema mcp to service_role;
grant all on all sequences in schema mcp to service_role;

-- PostgREST menyambung sebagai `authenticator` dan memuatkan cache skema
-- SEBELUM SET ROLE. Tanpa grant ini, skema mcp tidak akan muncul.
grant usage on schema mcp to authenticator;

alter default privileges in schema mcp grant all on tables to service_role;
alter default privileges in schema mcp grant all on sequences to service_role;
alter default privileges in schema mcp revoke all on tables from anon, authenticated;

create or replace function mcp.cleanup_expired()
returns void
language plpgsql
security definer
set search_path = mcp, public
as $$
begin
  delete from mcp.auth_codes where expires_at < now() - interval '1 hour';
  delete from mcp.tokens
   where (refresh_expires_at is not null and refresh_expires_at < now() - interval '7 days')
      or (revoked_at is not null and revoked_at < now() - interval '30 days');
  delete from mcp.tool_calls where created_at < now() - interval '90 days';
end;
$$;

alter function mcp.cleanup_expired() owner to supabase_admin;

-- KRITIKAL: fungsi SECURITY DEFINER lalai boleh dilaksana oleh PUBLIC.
-- Setelah skema mcp didedahkan kepada PostgREST, sesiapa dengan anon key
-- boleh memanggil /rest/v1/rpc/cleanup_expired dan memadam jejak audit.
revoke all on function mcp.cleanup_expired() from public, anon, authenticated;

commit;
