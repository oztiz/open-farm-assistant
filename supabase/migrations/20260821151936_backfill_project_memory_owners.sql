do $$
declare
  target_memory_id uuid;
  derived_owner_id text;
  existing_owner_id text;
  linked_entity_count integer;
  ownerless_entity_count integer;
  distinct_owner_count integer;
begin
  foreach target_memory_id in array array[
    '78757725-b94a-4ddb-88ea-57bad07042e8'::uuid,
    'f2c3a463-c1f1-4c06-8625-c8fd8ad3e6e7'::uuid,
    '20e89342-1c66-46f9-b70d-1f22fc22beb9'::uuid,
    '6cdd21c9-7642-4165-ad76-f6663306a7f4'::uuid,
    'b44d0c91-64d4-4fe2-91a4-fed4c8f66f5d'::uuid,
    'a40cdde6-e606-4d82-b423-6d0a9ed49c13'::uuid
  ]
  loop
    if not exists (select 1 from public.ofa_memories where id = target_memory_id) then
      raise exception 'Target memory % does not exist', target_memory_id;
    end if;

    select
      count(entity.id),
      count(*) filter (where entity.metadata ->> 'user_id' is null),
      count(distinct entity.metadata ->> 'user_id'),
      min(entity.metadata ->> 'user_id')
    into linked_entity_count, ownerless_entity_count, distinct_owner_count, derived_owner_id
    from public.ofa_memory_entities link
    join public.ofa_entities entity on entity.id = link.entity_id
    where link.memory_id = target_memory_id;

    if linked_entity_count = 0 or ownerless_entity_count > 0 or distinct_owner_count <> 1 then
      raise exception
        'Cannot derive one owner for memory % (links %, ownerless %, distinct owners %)',
        target_memory_id, linked_entity_count, ownerless_entity_count, distinct_owner_count;
    end if;

    select metadata ->> 'user_id'
    into existing_owner_id
    from public.ofa_memories
    where id = target_memory_id;

    if existing_owner_id is not null and existing_owner_id <> derived_owner_id then
      raise exception
        'Memory % already has owner %, but linked entities resolve to %',
        target_memory_id, existing_owner_id, derived_owner_id;
    end if;

    update public.ofa_memories
    set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{user_id}', to_jsonb(derived_owner_id), true)
    where id = target_memory_id
      and metadata ->> 'user_id' is null;
  end loop;
end
$$;
