-- REVIEW TEMPLATE ONLY. Not a migration; not executed.
-- Replace the three placeholders with the TEST OAuth client, owner and MCP resource.
-- Compose with any existing access-token hook before enabling this one.
-- Do not grant agshare_mcp to authenticator, anon or authenticated.
-- Audit PUBLIC privileges and verify Data API, RPC and Storage fail for this token.
create role agshare_mcp nologin noinherit;
create or replace function public.agshare_mcp_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security invoker
set search_path = ''
as $$
declare
  claims jsonb := event -> 'claims';
  issued bigint;
begin
  if event ->> 'client_id' = '<TEST_OAUTH_CLIENT_ID>' then
    if claims ->> 'sub' is distinct from '<TEST_OWNER_UUID>' then
      raise exception 'AgShare owner required';
    end if;
    issued := (claims ->> 'iat')::bigint;
    if issued is null then raise exception 'Missing issued-at claim'; end if;
    claims := jsonb_set(claims, '{aud}', to_jsonb('<TEST_HTTPS_MCP_RESOURCE>'::text));
    claims := jsonb_set(claims, '{role}', '"agshare_mcp"'::jsonb);
    claims := jsonb_set(claims, '{agshare_access}', '"read"'::jsonb);
    claims := jsonb_set(claims, '{exp}', to_jsonb(least((claims ->> 'exp')::bigint, issued + 900)));
    event := jsonb_set(event, '{claims}', claims);
  end if;
  return event;
end;
$$;
revoke all on function public.agshare_mcp_access_token_hook(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.agshare_mcp_access_token_hook(jsonb) to supabase_auth_admin;
