alter function public.ofa_upsert_maintenance_service_memory(uuid, uuid, text, timestamptz, bigint, numeric)
  security invoker;

drop policy if exists ofa_memories_owner_insert on public.ofa_memories;
create policy ofa_memories_owner_insert
  on public.ofa_memories
  for insert
  to authenticated
  with check (metadata ->> 'user_id' = (select auth.uid())::text);

drop policy if exists ofa_memory_entities_owner_insert on public.ofa_memory_entities;
create policy ofa_memory_entities_owner_insert
  on public.ofa_memory_entities
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.ofa_memories memory
      where memory.id = ofa_memory_entities.memory_id
        and memory.metadata ->> 'user_id' = (select auth.uid())::text
    )
    and exists (
      select 1
      from public.ofa_entities entity
      where entity.id = ofa_memory_entities.entity_id
        and entity.metadata ->> 'user_id' = (select auth.uid())::text
    )
  );

revoke insert on table public.ofa_memories from anon, authenticated;
grant insert (
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
) on table public.ofa_memories to authenticated;

grant update (occurred_at, odometer_km, engine_hours)
  on table public.ofa_memories to authenticated;

revoke insert on table public.ofa_memory_entities from anon, authenticated;
grant insert (memory_id, entity_id, relation)
  on table public.ofa_memory_entities to authenticated;
