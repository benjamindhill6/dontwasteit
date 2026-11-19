-- More than one pickup (or delivery) window per post.
--
-- A post can now offer several windows for each handoff, e.g. pickup Thu 9-11am and Fri 2-4pm.
--   * pickup_windows / delivery_windows hold the list: [{"start": ts, "end": ts}, ...], sorted by
--     start, never overlapping. One window is still the normal case.
--   * pickup_start / pickup_end (and the delivery pair) stay as the overall span: the first
--     window's start and the last window's end. Everything that asks "has this post's last window
--     ended?" (post_options, post_windows_ended, the feed, alerts, relisting) keeps working off
--     those columns unchanged, so a post stays on offer until its LAST window ends.
--   * A proposed time has to fall inside one of the windows, not just inside the overall span.
--   * Clients may send either one {"start","end"} object (older app versions) or an array.

alter table posts add column pickup_windows jsonb, add column delivery_windows jsonb;

-- Existing posts get their one window as a list of one.
update posts set pickup_windows = jsonb_build_array(jsonb_build_object('start', pickup_start, 'end', pickup_end))
  where pickup_offered;
update posts set delivery_windows = jsonb_build_array(jsonb_build_object('start', delivery_start, 'end', delivery_end))
  where delivery_offered;

alter table posts
  add constraint posts_pickup_windows_check check (
    not pickup_offered or (jsonb_typeof(pickup_windows) = 'array' and jsonb_array_length(pickup_windows) > 0)),
  add constraint posts_delivery_windows_check check (
    not delivery_offered or (jsonb_typeof(delivery_windows) = 'array' and jsonb_array_length(delivery_windows) > 0));

-- ---------------------------------------------------------------- helpers

-- Clean up the windows a client sent for one handoff. Accepts a single {"start","end"} object or
-- an array of them. Returns them sorted by start, or null when none were sent (absent, JSON null
-- or an empty list). p_label is 'pickup' or 'delivery', for the error messages.
create function parse_windows(p jsonb, p_label text) returns jsonb language plpgsql stable as $$
declare
  v_list jsonb;
  v_prev timestamptz;
  w record;
  v_out jsonb := '[]'::jsonb;
begin
  if p is null or jsonb_typeof(p) = 'null' then return null; end if;
  v_list := case jsonb_typeof(p) when 'array' then p when 'object' then jsonb_build_array(p) end;
  if v_list is null then raise exception 'Bad % window', p_label; end if;
  if jsonb_array_length(v_list) = 0 then return null; end if;
  if jsonb_array_length(v_list) > 10 then raise exception 'At most 10 % windows', p_label; end if;

  for w in
    select (x ->> 'start')::timestamptz as s, (x ->> 'end')::timestamptz as e
    from jsonb_array_elements(v_list) x order by 1
  loop
    if w.s is null or w.e is null or w.e <= w.s then raise exception '% end must be after the start', initcap(p_label); end if;
    if w.e <= now() then raise exception 'Pick a window that has not already passed'; end if;
    if v_prev is not null and w.s < v_prev then raise exception '% windows can''t overlap', initcap(p_label); end if;
    v_prev := w.e;
    v_out := v_out || jsonb_build_array(jsonb_build_object('start', w.s, 'end', w.e));
  end loop;
  return v_out;
end $$;

-- The windows offered for one handoff (null when that handoff isn't offered).
create function post_windows(p_post posts, p_method handoff_method) returns jsonb language sql immutable as $$
  select case p_method
    when 'pickup' then case when p_post.pickup_offered then coalesce(p_post.pickup_windows,
      jsonb_build_array(jsonb_build_object('start', p_post.pickup_start, 'end', p_post.pickup_end))) end
    else case when p_post.delivery_offered then coalesce(p_post.delivery_windows,
      jsonb_build_array(jsonb_build_object('start', p_post.delivery_start, 'end', p_post.delivery_end))) end
  end
$$;

-- Only the windows that haven't ended yet (what other pantries are shown).
create function open_windows(p_windows jsonb) returns jsonb language sql stable as $$
  select case when p_windows is null then null else coalesce((
    select jsonb_agg(w order by (w ->> 'start')::timestamptz)
    from jsonb_array_elements(p_windows) w where (w ->> 'end')::timestamptz > now()), '[]'::jsonb) end
$$;

-- A proposed time must fall inside one of the windows for that handoff.
create or replace function in_window(p_post posts, p_method handoff_method, p_time timestamptz) returns boolean
language sql stable as $$
  select coalesce((
    select bool_or(p_time between (w ->> 'start')::timestamptz and (w ->> 'end')::timestamptz)
    from jsonb_array_elements(post_windows(p_post, p_method)) w), false)
$$;

-- ---------------------------------------------------------------- posting

create or replace function create_surplus_post(p_payload jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org organizations;
  v_post uuid;
  v_item jsonb;
  v_i int := 0;
  v_pickup jsonb := parse_windows(p_payload -> 'pickup', 'pickup');
  v_delivery jsonb := parse_windows(p_payload -> 'delivery', 'delivery');
  v_source post_source := coalesce(p_payload ->> 'source', 'none')::post_source;
  v_photos jsonb := coalesce(p_payload -> 'photos', '[]');
begin
  select * into v_org from organizations where id = my_org_id();
  if v_org.id is null then raise exception 'Not allowed'; end if;
  if jsonb_array_length(coalesce(p_payload -> 'items', '[]')) = 0 then raise exception 'Add at least one item'; end if;
  if v_pickup is null and v_delivery is null then raise exception 'Offer pickup, delivery, or both'; end if;
  if v_delivery is not null and v_org.delivery_miles is null then raise exception 'Set your delivery distance first'; end if;
  if v_source = 'philabundance' and not v_org.is_philabundance then raise exception 'Not a Philabundance client'; end if;
  if v_source = 'share' and not v_org.is_share then raise exception 'Not a SHARE client'; end if;
  if jsonb_array_length(v_photos) > 3 then raise exception 'At most 3 photos'; end if;

  insert into posts (org_id, created_by, type, source, require_all,
                     pickup_offered, pickup_start, pickup_end, pickup_windows,
                     delivery_offered, delivery_start, delivery_end, delivery_windows)
  values (v_org.id, auth.uid(), 'surplus', v_source, coalesce((p_payload ->> 'require_all')::boolean, false),
          v_pickup is not null, (v_pickup -> 0 ->> 'start')::timestamptz, (v_pickup -> -1 ->> 'end')::timestamptz, v_pickup,
          v_delivery is not null, (v_delivery -> 0 ->> 'start')::timestamptz, (v_delivery -> -1 ->> 'end')::timestamptz, v_delivery)
  returning id into v_post;

  for v_item in select * from jsonb_array_elements(p_payload -> 'items') loop
    insert into line_items (post_id, position, name, category, quantity, unit, best_by)
    values (v_post, v_i, trim(v_item ->> 'name'), (v_item ->> 'category')::food_category,
            (v_item ->> 'quantity')::numeric, trim(v_item ->> 'unit'), nullif(v_item ->> 'best_by', '')::date);
    v_i := v_i + 1;
  end loop;

  v_i := 0;
  for v_item in select * from jsonb_array_elements(v_photos) loop
    if (v_item #>> '{}') not like v_org.id::text || '/%' then raise exception 'Bad photo path'; end if;
    insert into post_photos (post_id, position, path) values (v_post, v_i, v_item #>> '{}');
    v_i := v_i + 1;
  end loop;

  perform log_activity('post_created', v_post, null);
  return v_post;
end $$;

-- Open new claim windows on a post whose windows have all ended.
-- p_payload: { "pickup": [{"start","end"}, ...] | {"start","end"} | absent, "delivery": same }
create or replace function relist_post(p_post uuid, p_payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org organizations;
  p posts;
  v_pickup jsonb := parse_windows(p_payload -> 'pickup', 'pickup');
  v_delivery jsonb := parse_windows(p_payload -> 'delivery', 'delivery');
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

  update posts set
    pickup_offered = v_pickup is not null, pickup_windows = v_pickup,
    pickup_start = (v_pickup -> 0 ->> 'start')::timestamptz, pickup_end = (v_pickup -> -1 ->> 'end')::timestamptz,
    delivery_offered = v_delivery is not null, delivery_windows = v_delivery,
    delivery_start = (v_delivery -> 0 ->> 'start')::timestamptz, delivery_end = (v_delivery -> -1 ->> 'end')::timestamptz,
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

-- ---------------------------------------------------------------- feed (adds the window lists)

create or replace function browse_feed() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(card order by listed_at desc), '[]'::jsonb) from (
    select coalesce(p.relisted_at, p.created_at) as listed_at, jsonb_build_object(
      'id', p.id, 'source', p.source, 'created_at', p.created_at, 'expires_at', p.expires_at,
      'require_all', p.require_all,
      'pickup_offered', p.pickup_offered, 'pickup_start', p.pickup_start, 'pickup_end', p.pickup_end,
      'delivery_offered', p.delivery_offered, 'delivery_start', p.delivery_start, 'delivery_end', p.delivery_end,
      'pickup_windows', open_windows(post_windows(p, 'pickup')),
      'delivery_windows', open_windows(post_windows(p, 'delivery')),
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

-- ---------------------------------------------------------------- lock down function execution

revoke execute on function parse_windows(jsonb, text), post_windows(posts, handoff_method), open_windows(jsonb)
  from public, anon;
grant execute on function parse_windows(jsonb, text), post_windows(posts, handoff_method), open_windows(jsonb)
  to authenticated, service_role;
