create or replace function public.ofa_upsert_maintenance_service_memory(
  p_entity_id uuid,
  p_memory_id uuid,
  p_plan_name text,
  p_performed_at timestamptz,
  p_odometer_km bigint,
  p_engine_hours numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  result_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.ofa_entities entity
    where entity.id = p_entity_id
      and entity.metadata ->> 'user_id' = caller_id::text
  ) then
    raise exception 'Entity not found or not owned by caller';
  end if;

  if p_odometer_km is not null and p_odometer_km < 0 then
    raise exception 'Odometer must be nonnegative';
  end if;
  if p_engine_hours is not null and p_engine_hours < 0 then
    raise exception 'Engine hours must be nonnegative';
  end if;

  if p_memory_id is not null then
    if not exists (
      select 1
      from public.ofa_memories memory
      join public.ofa_memory_entities link on link.memory_id = memory.id
      where memory.id = p_memory_id
        and link.entity_id = p_entity_id
        and memory.metadata ->> 'user_id' = caller_id::text
    ) then
      raise exception 'History item not found, not linked, or not owned by caller';
    end if;

    update public.ofa_memories
    set
      occurred_at = p_performed_at,
      odometer_km = p_odometer_km,
      engine_hours = p_engine_hours,
      updated_at = now()
    where id = p_memory_id;

    return p_memory_id;
  end if;

  if p_performed_at is null then
    raise exception 'Performed date is required for a new service history item';
  end if;

  insert into public.ofa_memories (
    occurred_at,
    memory_type,
    title,
    content,
    source,
    importance,
    status,
    odometer_km,
    engine_hours,
    metadata
  ) values (
    p_performed_at,
    'service',
    trim(p_plan_name) || ' utført',
    'Utførelse registrert fra vedlikeholdsplanen.',
    'ofa_app',
    3,
    'active',
    p_odometer_km,
    p_engine_hours,
    jsonb_build_object('user_id', caller_id, 'created_from', 'maintenance_plan')
  )
  returning id into result_id;

  insert into public.ofa_memory_entities (memory_id, entity_id, relation)
  values (result_id, p_entity_id, 'about');

  return result_id;
end;
$$;

revoke all on function public.ofa_upsert_maintenance_service_memory(uuid, uuid, text, timestamptz, bigint, numeric)
  from public, anon;
grant execute on function public.ofa_upsert_maintenance_service_memory(uuid, uuid, text, timestamptz, bigint, numeric)
  to authenticated;

comment on function public.ofa_upsert_maintenance_service_memory(uuid, uuid, text, timestamptz, bigint, numeric) is
  'Creates or updates the owner''s linked service history item; history remains the authoritative source for last-performed readings.';
