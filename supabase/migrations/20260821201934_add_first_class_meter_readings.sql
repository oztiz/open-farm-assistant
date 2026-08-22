alter table public.ofa_entities
  add column current_odometer_km bigint,
  add column current_engine_hours numeric(10, 1),
  add column meter_reading_at timestamptz,
  add constraint ofa_entities_current_odometer_nonnegative
    check (current_odometer_km is null or current_odometer_km >= 0),
  add constraint ofa_entities_current_engine_hours_nonnegative
    check (current_engine_hours is null or current_engine_hours >= 0);

alter table public.ofa_memories
  add column odometer_km bigint,
  add column engine_hours numeric(10, 1),
  add constraint ofa_memories_odometer_nonnegative
    check (odometer_km is null or odometer_km >= 0),
  add constraint ofa_memories_engine_hours_nonnegative
    check (engine_hours is null or engine_hours >= 0);

update public.ofa_memories
set
  odometer_km = case
    when metadata ->> 'odometer_km' ~ '^\d+$'
      then (metadata ->> 'odometer_km')::bigint
  end,
  engine_hours = case
    when metadata ->> 'engine_hours' ~ '^\d+(\.\d+)?$'
      then (metadata ->> 'engine_hours')::numeric(10, 1)
  end
where
  (odometer_km is null and metadata ->> 'odometer_km' ~ '^\d+$')
  or (engine_hours is null and metadata ->> 'engine_hours' ~ '^\d+(\.\d+)?$');

with readings as (
  select
    link.entity_id,
    max(memory.odometer_km) as odometer_km,
    max(memory.engine_hours) as engine_hours,
    max(coalesce(memory.occurred_at, memory.recorded_at)) filter (
      where memory.odometer_km is not null or memory.engine_hours is not null
    ) as reading_at
  from public.ofa_memory_entities link
  join public.ofa_memories memory on memory.id = link.memory_id
  group by link.entity_id
)
update public.ofa_entities entity
set
  current_odometer_km = readings.odometer_km,
  current_engine_hours = readings.engine_hours,
  meter_reading_at = readings.reading_at
from readings
where entity.entity_type in ('vehicle', 'machine')
  and readings.entity_id = entity.id
  and (readings.odometer_km is not null or readings.engine_hours is not null);

drop policy if exists ofa_entities_owner_update_meters on public.ofa_entities;
create policy ofa_entities_owner_update_meters
  on public.ofa_entities
  for update
  to authenticated
  using (metadata ->> 'user_id' = (select auth.uid())::text)
  with check (metadata ->> 'user_id' = (select auth.uid())::text);

drop policy if exists ofa_memories_owner_update_meters on public.ofa_memories;
create policy ofa_memories_owner_update_meters
  on public.ofa_memories
  for update
  to authenticated
  using (metadata ->> 'user_id' = (select auth.uid())::text)
  with check (metadata ->> 'user_id' = (select auth.uid())::text);

revoke update on table public.ofa_entities from anon, authenticated;
grant update (current_odometer_km, current_engine_hours, meter_reading_at)
  on table public.ofa_entities to authenticated;

revoke update on table public.ofa_memories from anon, authenticated;
grant update (odometer_km, engine_hours)
  on table public.ofa_memories to authenticated;

drop view public.ofa_maintenance_dashboard_items;

create view public.ofa_maintenance_dashboard_items
with (security_invoker = true)
as
select
  plan.id,
  plan.entity_id,
  plan.name,
  plan.last_service_memory_id,
  service.last_performed_at,
  service.last_odometer_km,
  service.last_engine_hours,
  plan.interval_km,
  plan.interval_hours,
  plan.interval_days,
  entity.current_odometer_km,
  entity.current_engine_hours,
  case
    when service.last_odometer_km is not null and plan.interval_km is not null
      then service.last_odometer_km + plan.interval_km
  end as next_due_km,
  case
    when service.last_engine_hours is not null and plan.interval_hours is not null
      then service.last_engine_hours + plan.interval_hours
  end as next_due_hours,
  case
    when service.last_performed_at is not null and plan.interval_days is not null
      then service.last_performed_at::date + plan.interval_days
  end as next_due_date,
  case
    when
      (entity.current_odometer_km is not null and service.last_odometer_km is not null
        and plan.interval_km is not null
        and entity.current_odometer_km >= service.last_odometer_km + plan.interval_km)
      or
      (entity.current_engine_hours is not null and service.last_engine_hours is not null
        and plan.interval_hours is not null
        and entity.current_engine_hours >= service.last_engine_hours + plan.interval_hours)
      or
      (service.last_performed_at is not null and plan.interval_days is not null
        and current_date >= service.last_performed_at::date + plan.interval_days)
      then 'overdue'
    when
      (entity.current_odometer_km is not null and service.last_odometer_km is not null
        and plan.interval_km is not null
        and entity.current_odometer_km >= service.last_odometer_km + plan.interval_km - plan.warning_km)
      or
      (entity.current_engine_hours is not null and service.last_engine_hours is not null
        and plan.interval_hours is not null
        and entity.current_engine_hours >= service.last_engine_hours + plan.interval_hours - plan.warning_hours)
      or
      (service.last_performed_at is not null and plan.interval_days is not null
        and current_date >= service.last_performed_at::date + plan.interval_days - plan.warning_days)
      then 'due_soon'
    else 'ok'
  end as maintenance_status,
  plan.metadata,
  case
    when service.last_odometer_km is not null and plan.interval_km is not null
      and entity.current_odometer_km is not null
      then service.last_odometer_km + plan.interval_km - entity.current_odometer_km
  end as remaining_km,
  case
    when service.last_engine_hours is not null and plan.interval_hours is not null
      and entity.current_engine_hours is not null
      then service.last_engine_hours + plan.interval_hours - entity.current_engine_hours
  end as remaining_hours,
  case
    when service.last_performed_at is not null and plan.interval_days is not null
      then service.last_performed_at::date + plan.interval_days - current_date
  end as remaining_days
from public.ofa_maintenance_plans plan
join public.ofa_entities entity on entity.id = plan.entity_id
left join lateral (
  select
    coalesce(
      memory.occurred_at,
      case
        when memory.metadata ->> 'reported_at' ~ '^\d{4}-\d{2}-\d{2}$'
          then (memory.metadata ->> 'reported_at')::date::timestamptz
      end,
      memory.recorded_at
    ) as last_performed_at,
    coalesce(
      memory.odometer_km,
      case
        when memory.metadata ->> 'odometer_km' ~ '^\d+$'
          then (memory.metadata ->> 'odometer_km')::bigint
      end
    ) as last_odometer_km,
    coalesce(
      memory.engine_hours,
      case
        when memory.metadata ->> 'engine_hours' ~ '^\d+(\.\d+)?$'
          then (memory.metadata ->> 'engine_hours')::numeric(10, 1)
      end
    ) as last_engine_hours
  from public.ofa_memories memory
  where memory.id = plan.last_service_memory_id
) service on true
where plan.active;

comment on view public.ofa_maintenance_dashboard_items is
  'RLS-aware maintenance read model using first-class current and historical meter readings.';

revoke all on table public.ofa_maintenance_dashboard_items from public, anon;
grant select on table public.ofa_maintenance_dashboard_items to authenticated;
