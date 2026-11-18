-- When a post's claim windows end with food still unclaimed.
--
-- A "claim window" is a post's pickup window or delivery window. Rules:
--   * Other pantries only see (and are only alerted to) a post while at least one window they can
--     use is still open. A pantry that can only pick up stops seeing the post when pickup ends,
--     even if the delivery window is still open for others.
--   * Once every window on a post has ended and something is still unclaimed, the post stays in
--     the posting pantry's Activity until they either open a new claim window (relist_post) or
--     close it out (close_post). Nothing changes for pantries that already hold a claim.
--   * Relisting puts the post back in Offers, alerts pantries the same way a new post does
--     (provider posts are no longer held back, their 2 hours ran from the first posting), and
--     restarts the 7-day expiry.

alter table posts add column relisted_at timestamptz;   -- latest new claim window, for feed order

-- ---------------------------------------------------------------- helpers

-- Distance rule, plus the window for that handoff must not have ended yet.
-- Used by can_view_post, browse_feed, claim_post and the new-offer alerts.
create or replace function post_options(p_post uuid, p_viewer uuid)
returns table (pickup boolean, delivery boolean) language sql stable security definer set search_path = public as $$
  select
    p.pickup_offered and p.pickup_end > now()
      and v.pickup_miles is not null and poster.lat is not null and v.lat is not null
      and miles_between(poster.lat, poster.lng, v.lat, v.lng) <= v.pickup_miles,
    p.delivery_offered and p.delivery_end > now()
      and poster.delivery_miles is not null and poster.lat is not null and v.lat is not null
      and miles_between(poster.lat, poster.lng, v.lat, v.lng) <= poster.delivery_miles
  from posts p
  join organizations poster on poster.id = p.org_id
  join organizations v on v.id = p_viewer
  where p.id = p_post
$$;

-- True when no offered window is still open.
create function post_windows_ended(p posts) returns boolean language sql stable as $$
  select not coalesce((p.pickup_offered and p.pickup_end > now())
                   or (p.delivery_offered and p.delivery_end > now()), false)
$$;

-- ---------------------------------------------------------------- feed (relisted posts sort as new)

create or replace function browse_feed() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(card order by listed_at desc), '[]'::jsonb) from (
    select coalesce(p.relisted_at, p.created_at) as listed_at, jsonb_build_object(
      'id', p.id, 'source', p.source, 'created_at', p.created_at, 'expires_at', p.expires_at,
      'require_all', p.require_all,
      'pickup_offered', p.pickup_offered, 'pickup_start', p.pickup_start, 'pickup_end', p.pickup_end,
      'delivery_offered', p.delivery_offered, 'delivery_start', p.delivery_start, 'delivery_end', p.delivery_end,
      'org', jsonb_build_object('id', o.id, 'name', o.name, 'city', o.city, 'type', o.type),
      'distance_miles', round(miles_between(o.lat, o.lng, v.lat, v.lng)::numeric, 1),
      'options', (select to_jsonb(x) from post_options(p.id, v.id) x),
      'items', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', li.id, 'name', li.name, 'category', li.category, 'quantity', li.quantity,
          'unit', li.unit, 'best_by', li.best_by, 'remaining', line_remaining(li.id)) order by li.position), '[]'::jsonb)
        from line_items li where li.post_id = p.id),
      'photos', (select coalesce(jsonb_agg(ph.path order by ph.position), '[]'::jsonb)
        from post_photos ph where ph.post_id = p.id)
    ) as card
    from posts p
    join organizations o on o.id = p.org_id
    join organizations v on v.id = my_org_id()
    where v.type = 'pantry' and p.org_id <> v.id and p.type = 'surplus'
      and p.status = 'live' and p.expires_at > now() and can_view_post(p.id)
      -- Pantries holding a claim can see the post through their claim; only offer it to them
      -- here while a window they can use is still open.
      and exists (select 1 from post_options(p.id, v.id) o where o.pickup or o.delivery)
      and exists (select 1 from line_items li where li.post_id = p.id and line_remaining(li.id) > 0)
  ) s
$$;

-- ---------------------------------------------------------------- poster actions

-- Open a new claim window on a post whose windows have all ended.
-- p_payload: { "pickup": {"start","end"} | absent, "delivery": {"start","end"} | absent }
create function relist_post(p_post uuid, p_payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org organizations;
  p posts;
  v_pickup jsonb := nullif(p_payload -> 'pickup', 'null'::jsonb);
  v_delivery jsonb := nullif(p_payload -> 'delivery', 'null'::jsonb);
  v_ps timestamptz := (v_pickup ->> 'start')::timestamptz;
  v_pe timestamptz := (v_pickup ->> 'end')::timestamptz;
  v_ds timestamptz := (v_delivery ->> 'start')::timestamptz;
  v_de timestamptz := (v_delivery ->> 'end')::timestamptz;
begin
  select * into v_org from organizations where id = my_org_id();
  select * into p from posts where id = p_post for update;
  if v_org.id is null or p.id is null or p.org_id <> v_org.id then raise exception 'Not allowed'; end if;
  if p.status <> 'live' or p.type <> 'surplus' or p.expires_at <= now() then raise exception 'This post is already closed'; end if;
  if not post_windows_ended(p) then raise exception 'This post still has an open claim window'; end if;
  if not exists (select 1 from line_items li where li.post_id = p.id and line_remaining(li.id) > 0) then
    raise exception 'Everything on this post is already claimed';
  end if;
  if v_pickup is null and v_delivery is null then raise exception 'Offer pickup, delivery, or both'; end if;
  if v_delivery is not null and v_org.delivery_miles is null then raise exception 'Set your delivery distance first'; end if;
  if v_pickup is not null and (v_ps is null or v_pe is null or v_pe <= v_ps) then raise exception 'Pickup end must be after the start'; end if;
  if v_delivery is not null and (v_ds is null or v_de is null or v_de <= v_ds) then raise exception 'Delivery end must be after the start'; end if;
  if (v_pickup is not null and v_pe <= now()) or (v_delivery is not null and v_de <= now()) then
    raise exception 'Pick a window that has not already passed';
  end if;

  update posts set
    pickup_offered = v_pickup is not null, pickup_start = v_ps, pickup_end = v_pe,
    delivery_offered = v_delivery is not null, delivery_start = v_ds, delivery_end = v_de,
    relisted_at = now(),
    expires_at = greatest(expires_at, now() + interval '7 days')
  where id = p.id;

  perform log_activity('post_relisted', p.id, null,
    jsonb_strip_nulls(jsonb_build_object('pickup', v_pickup, 'delivery', v_delivery)));

  -- Same alerts as a new post. An alert problem must never block the relist.
  begin
    perform enqueue_offer_alerts(p.id, 'new');
  exception when others then
    raise warning 'relist_post alerts: %', sqlerrm;
  end;
end $$;

-- Close out a post: whatever is unclaimed stops being offered. Claims already made are left
-- alone, so those pantries can still finish their pickup or delivery.
create function close_post(p_post uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from posts where id = p_post and org_id = my_org_id() and status = 'live') then
    raise exception 'Not allowed';
  end if;
  update posts set status = 'closed' where id = p_post;
  insert into photo_purge_queue (path) select path from post_photos where post_id = p_post on conflict do nothing;
  delete from post_photos where post_id = p_post;
  perform log_activity('post_closed', p_post, null);
end $$;

-- ---------------------------------------------------------------- lock down function execution

revoke execute on function post_windows_ended(posts), relist_post(uuid, jsonb), close_post(uuid) from public, anon;
grant execute on function post_windows_ended(posts), relist_post(uuid, jsonb), close_post(uuid) to authenticated, service_role;
