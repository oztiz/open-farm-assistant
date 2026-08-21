create table public.ofa_maintenance_plans (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.ofa_entities(id) on delete cascade,
  name text not null,
  last_service_memory_id uuid references public.ofa_memories(id) on delete set null,
  interval_km integer check (interval_km > 0),
  interval_hours integer check (interval_hours > 0),
  interval_days integer check (interval_days > 0),
  warning_km integer not null default 1000 check (warning_km >= 0),
  warning_hours integer not null default 20 check (warning_hours >= 0),
  warning_days integer not null default 30 check (warning_days >= 0),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ofa_maintenance_plans_has_interval check (
    interval_km is not null or interval_hours is not null or interval_days is not null
  ),
  constraint ofa_maintenance_plans_entity_name_key unique (entity_id, name)
);

comment on table public.ofa_maintenance_plans is
  'Recurring maintenance rules. Completed work remains in ofa_memories and is referenced by last_service_memory_id.';

create index ofa_maintenance_plans_entity_id_idx
  on public.ofa_maintenance_plans (entity_id)
  where active;

create index ofa_maintenance_plans_last_service_memory_id_idx
  on public.ofa_maintenance_plans (last_service_memory_id)
  where last_service_memory_id is not null;

alter table public.ofa_maintenance_plans enable row level security;

create policy ofa_maintenance_plans_owner_select
  on public.ofa_maintenance_plans
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.ofa_entities entity
      where entity.id = ofa_maintenance_plans.entity_id
        and entity.metadata ->> 'user_id' = (select auth.uid())::text
    )
  );

revoke all on table public.ofa_maintenance_plans from public, anon;
grant select on table public.ofa_maintenance_plans to authenticated;

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
  readings.current_odometer_km,
  readings.current_engine_hours,
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
      (readings.current_odometer_km is not null and service.last_odometer_km is not null
        and plan.interval_km is not null
        and readings.current_odometer_km >= service.last_odometer_km + plan.interval_km)
      or
      (readings.current_engine_hours is not null and service.last_engine_hours is not null
        and plan.interval_hours is not null
        and readings.current_engine_hours >= service.last_engine_hours + plan.interval_hours)
      or
      (service.last_performed_at is not null and plan.interval_days is not null
        and current_date >= service.last_performed_at::date + plan.interval_days)
      then 'overdue'
    when
      (readings.current_odometer_km is not null and service.last_odometer_km is not null
        and plan.interval_km is not null
        and readings.current_odometer_km >= service.last_odometer_km + plan.interval_km - plan.warning_km)
      or
      (readings.current_engine_hours is not null and service.last_engine_hours is not null
        and plan.interval_hours is not null
        and readings.current_engine_hours >= service.last_engine_hours + plan.interval_hours - plan.warning_hours)
      or
      (service.last_performed_at is not null and plan.interval_days is not null
        and current_date >= service.last_performed_at::date + plan.interval_days - plan.warning_days)
      then 'due_soon'
    else 'ok'
  end as maintenance_status,
  plan.metadata
from public.ofa_maintenance_plans plan
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
    case
      when memory.metadata ->> 'odometer_km' ~ '^\d+$'
        then (memory.metadata ->> 'odometer_km')::integer
    end as last_odometer_km,
    case
      when memory.metadata ->> 'engine_hours' ~ '^\d+(\.\d+)?$'
        then (memory.metadata ->> 'engine_hours')::numeric
    end as last_engine_hours
  from public.ofa_memories memory
  where memory.id = plan.last_service_memory_id
) service on true
left join lateral (
  select
    max(
      case
        when memory.metadata ->> 'odometer_km' ~ '^\d+$'
          then (memory.metadata ->> 'odometer_km')::integer
      end
    ) as current_odometer_km,
    max(
      case
        when memory.metadata ->> 'engine_hours' ~ '^\d+(\.\d+)?$'
          then (memory.metadata ->> 'engine_hours')::numeric
      end
    ) as current_engine_hours
  from public.ofa_memory_entities link
  join public.ofa_memories memory on memory.id = link.memory_id
  where link.entity_id = plan.entity_id
) readings on true
where plan.active;

comment on view public.ofa_maintenance_dashboard_items is
  'RLS-aware maintenance read model derived from plans and existing OFA history.';

revoke all on table public.ofa_maintenance_dashboard_items from public, anon;
grant select on table public.ofa_maintenance_dashboard_items to authenticated;

insert into public.ofa_maintenance_plans (
  entity_id,
  name,
  last_service_memory_id,
  interval_km,
  interval_days,
  warning_km,
  warning_days,
  metadata
)
select
  entity.id,
  'Motorolje og oljefilter',
  memory.id,
  10000,
  365,
  1000,
  30,
  jsonb_build_object('source', 'Navara serviceplan')
from public.ofa_entities entity
join public.ofa_memory_entities link on link.entity_id = entity.id
join public.ofa_memories memory on memory.id = link.memory_id
where entity.metadata ->> 'alias' = 'Navara'
  and memory.title = 'Motorservice – olje og oljefilter byttet'
on conflict (entity_id, name) do update
set
  last_service_memory_id = excluded.last_service_memory_id,
  interval_km = excluded.interval_km,
  interval_days = excluded.interval_days,
  warning_km = excluded.warning_km,
  warning_days = excluded.warning_days,
  updated_at = now();
