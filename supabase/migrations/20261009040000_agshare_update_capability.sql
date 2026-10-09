-- Apply only when the owner has approved update access for the existing AgShare client.
-- Preserve the active hook's identity, grants, OFA behavior and isolated database role.
do $migration$
declare
  definition text := pg_get_functiondef('public.ofa_mcp_custom_access_token_hook(jsonb)'::regprocedure);
  original text := 'claims:=jsonb_set(claims,''{agshare_access}'',''"read"''::jsonb);';
  replacement text := 'claims:=jsonb_set(claims,''{agshare_access}'',''"update"''::jsonb);';
begin
  if position('945c5637-9117-4c18-91e7-0e23a710ecb9' in definition)=0
     or position('"agshare_mcp"' in definition)=0
     or position('issued+900' in definition)=0 then
    raise exception 'AgShare hook changed; review before expanding permissions';
  end if;
  if position(replacement in definition)>0 then return; end if;
  if position(original in definition)=0
     or length(definition)-length(replace(definition,original,'')) <> length(original) then
    raise exception 'Expected exactly one AgShare read capability assignment';
  end if;
  execute replace(definition,original,replacement);
end $migration$;
