alter table public.ofa_maintenance_plans
  add column description text;

create policy ofa_maintenance_plans_owner_insert
  on public.ofa_maintenance_plans
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.ofa_entities entity
      where entity.id = ofa_maintenance_plans.entity_id
        and entity.metadata ->> 'user_id' = (select auth.uid())::text
    )
    and (
      last_service_memory_id is null
      or exists (
        select 1
        from public.ofa_memory_entities link
        where link.entity_id = ofa_maintenance_plans.entity_id
          and link.memory_id = ofa_maintenance_plans.last_service_memory_id
      )
    )
  );

create policy ofa_maintenance_plans_owner_update
  on public.ofa_maintenance_plans
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.ofa_entities entity
      where entity.id = ofa_maintenance_plans.entity_id
        and entity.metadata ->> 'user_id' = (select auth.uid())::text
    )
  )
  with check (
    exists (
      select 1
      from public.ofa_entities entity
      where entity.id = ofa_maintenance_plans.entity_id
        and entity.metadata ->> 'user_id' = (select auth.uid())::text
    )
    and (
      last_service_memory_id is null
      or exists (
        select 1
        from public.ofa_memory_entities link
        where link.entity_id = ofa_maintenance_plans.entity_id
          and link.memory_id = ofa_maintenance_plans.last_service_memory_id
      )
    )
  );

revoke all on table public.ofa_maintenance_plans from public, anon, authenticated;
grant select, insert, update on table public.ofa_maintenance_plans to authenticated;
