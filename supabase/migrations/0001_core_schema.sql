-- Don't Waste It! Phase 1 core schema: organizations, people, posts, claims.
-- Permissions are enforced here (RLS + security-definer functions), not in the UI.

create type org_type as enum ('pantry', 'business');
create type post_type as enum ('surplus', 'need');
create type post_source as enum ('none', 'philabundance', 'share');
create type post_status as enum ('live', 'cancelled', 'expired', 'closed');
create type claim_status as enum ('awaiting_time', 'time_proposed', 'scheduled', 'completed', 'released');
create type handoff_method as enum ('pickup', 'delivery');
create type food_category as enum ('produce', 'dairy', 'meat', 'frozen', 'shelf_stable', 'bread', 'non_food', 'other');

-- ---------------------------------------------------------------- tables

create table organizations (
  id uuid primary key default gen_random_uuid(),
  type org_type not null,
  name text not null,
  street text not null,
  city text not null,
  state text not null,
  zip text not null,
  lat double precision,
  lng double precision,
  delivery_miles numeric,           -- how far this org will drive to deliver
  pickup_miles numeric,             -- how far this pantry will drive to pick up
  is_philabundance boolean not null default false,
  is_share boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (type = 'business' or (delivery_miles is not null and pickup_miles is not null))
);

create table people (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid references organizations (id),   -- null only for platform admins
  email text not null,
  name text not null,
  phone text,
  is_platform_admin boolean not null default false,
  active boolean not null default true,
  notif_prefs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on people (org_id);

create table posts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id),
  created_by uuid not null references people (id),
  type post_type not null default 'surplus',
  source post_source not null default 'none',
  status post_status not null default 'live',
  require_all boolean not null default false,   -- claimers must take everything
  pickup_offered boolean not null default false,
  pickup_start timestamptz,
  pickup_end timestamptz,
  delivery_offered boolean not null default false,
  delivery_start timestamptz,
  delivery_end timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  check (type = 'need' or pickup_offered or delivery_offered),
  check (not pickup_offered or (pickup_start is not null and pickup_end > pickup_start)),
  check (not delivery_offered or (delivery_start is not null and delivery_end > delivery_start))
);
create index on posts (status, expires_at);
create index on posts (org_id);

create table line_items (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts (id) on delete cascade,
  position int not null default 0,
  name text not null,
  category food_category not null,
  quantity numeric not null check (quantity > 0),
  unit text not null,
  best_by date
);
create index on line_items (post_id);

create table post_photos (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts (id) on delete cascade,
  position int not null default 0,
  path text not null
);
create index on post_photos (post_id);

create table photo_purge_queue (
  path text primary key,
  queued_at timestamptz not null default now()
);

create table claims (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts (id),
  claimer_org_id uuid not null references organizations (id),
  claimed_by uuid not null references people (id),
  method handoff_method not null,
  proposed_time timestamptz,
  status claim_status not null default 'time_proposed',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by uuid references people (id),
  released_at timestamptz
);
create index on claims (post_id);
create index on claims (claimer_org_id);

create table claim_items (
  claim_id uuid not null references claims (id) on delete cascade,
  line_item_id uuid not null references line_items (id),
  quantity numeric not null check (quantity > 0),
  primary key (claim_id, line_item_id)
);

create table activity_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_org_id uuid,
  action text not null,
  post_id uuid,
  claim_id uuid,
  details jsonb not null default '{}'::jsonb
);
create index on activity_log (at);

-- ---------------------------------------------------------------- helpers

create function miles_between(a_lat double precision, a_lng double precision, b_lat double precision, b_lng double precision)
returns double precision language sql immutable as $$
  select 3958.8 * 2 * asin(sqrt(least(1,
    power(sin(radians(b_lat - a_lat) / 2), 2) +
    cos(radians(a_lat)) * cos(radians(b_lat)) * power(sin(radians(b_lng - a_lng) / 2), 2))))
$$;

create function is_platform_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_platform_admin from people where id = auth.uid() and active), false)
$$;

create function my_org_id() returns uuid language sql stable security definer set search_path = public as $$
  select p.org_id from people p join organizations o on o.id = p.org_id
  where p.id = auth.uid() and p.active and o.active
$$;

create function my_org_type() returns org_type language sql stable security definer set search_path = public as $$
  select o.type from organizations o where o.id = my_org_id()
$$;

create function is_active_person() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from people where id = auth.uid() and active)
$$;

create function line_remaining(p_line uuid) returns numeric language sql stable security definer set search_path = public as $$
  select li.quantity - coalesce((
    select sum(ci.quantity) from claim_items ci join claims c on c.id = ci.claim_id
    where ci.line_item_id = li.id and c.status <> 'released'), 0)
  from line_items li where li.id = p_line
$$;

-- Which handoff options does viewer org v have on post p, by the distance rule?
create function post_options(p_post uuid, p_viewer uuid)
returns table (pickup boolean, delivery boolean) language sql stable security definer set search_path = public as $$
  select
    p.pickup_offered and v.pickup_miles is not null and poster.lat is not null and v.lat is not null
      and miles_between(poster.lat, poster.lng, v.lat, v.lng) <= v.pickup_miles,
    p.delivery_offered and poster.delivery_miles is not null and poster.lat is not null and v.lat is not null
      and miles_between(poster.lat, poster.lng, v.lat, v.lng) <= poster.delivery_miles
  from posts p
  join organizations poster on poster.id = p.org_id
  join organizations v on v.id = p_viewer
  where p.id = p_post
$$;

create function can_view_post(p_post uuid) returns boolean language sql stable security definer set search_path = public as $$
  select is_platform_admin() or exists (
    select 1
    from posts p
    join organizations v on v.id = my_org_id()
    where p.id = p_post and (
      p.org_id = v.id
      or exists (select 1 from claims c where c.post_id = p.id and c.claimer_org_id = v.id)
      or (
        p.status = 'live' and p.expires_at > now() and v.type = 'pantry'
        and (
          p.source = 'none'
          or p.created_at + interval '2 hours' <= now()
          or (p.source = 'philabundance' and v.is_philabundance)
          or (p.source = 'share' and v.is_share)
        )
        and (p.type = 'need' or exists (
          select 1 from post_options(p.id, v.id) o where o.pickup or o.delivery))
      )
    )
  )
$$;

create function log_activity(p_action text, p_post uuid, p_claim uuid, p_details jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into activity_log (actor_id, actor_org_id, action, post_id, claim_id, details)
  values (auth.uid(), my_org_id(), p_action, p_post, p_claim, p_details)
$$;

-- ---------------------------------------------------------------- RLS

alter table organizations enable row level security;
alter table people enable row level security;
alter table posts enable row level security;
alter table line_items enable row level security;
alter table post_photos enable row level security;
alter table photo_purge_queue enable row level security;
alter table claims enable row level security;
alter table claim_items enable row level security;
alter table activity_log enable row level security;

-- Directory: every approved user sees every organization and contact (spec: contact details always visible).
create policy org_read on organizations for select to authenticated using (is_active_person());
create policy people_read on people for select to authenticated using (is_active_person());

create policy posts_read on posts for select to authenticated using (can_view_post(id));
create policy items_read on line_items for select to authenticated using (can_view_post(post_id));
create policy photos_read on post_photos for select to authenticated using (can_view_post(post_id));

create policy claims_read on claims for select to authenticated using (
  is_platform_admin()
  or claimer_org_id = my_org_id()
  or post_id in (select id from posts where org_id = my_org_id())
);
create policy claim_items_read on claim_items for select to authenticated using (
  claim_id in (select id from claims)   -- inherits claims policy
);
create policy log_admin_read on activity_log for select to authenticated using (is_platform_admin());
-- No insert/update/delete policies: all writes go through the functions below or the service-role edge functions.

-- ---------------------------------------------------------------- bootstrap platform admin

create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if lower(new.email) = 'benjamindhill6@gmail.com' then
    insert into people (id, email, name, is_platform_admin)
    values (new.id, new.email, 'Ben Hill', true)
    on conflict (id) do nothing;
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- ---------------------------------------------------------------- profile

create function update_my_profile(p_name text, p_phone text, p_prefs jsonb)
returns void language sql security definer set search_path = public as $$
  update people set name = p_name, phone = p_phone, notif_prefs = coalesce(p_prefs, notif_prefs)
  where id = auth.uid() and active
$$;

-- ---------------------------------------------------------------- posting

create function create_surplus_post(p_payload jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org organizations;
  v_post uuid;
  v_item jsonb;
  v_i int := 0;
  v_pickup jsonb := p_payload -> 'pickup';
  v_delivery jsonb := p_payload -> 'delivery';
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
                     pickup_offered, pickup_start, pickup_end, delivery_offered, delivery_start, delivery_end)
  values (v_org.id, auth.uid(), 'surplus', v_source, coalesce((p_payload ->> 'require_all')::boolean, false),
          v_pickup is not null, (v_pickup ->> 'start')::timestamptz, (v_pickup ->> 'end')::timestamptz,
          v_delivery is not null, (v_delivery ->> 'start')::timestamptz, (v_delivery ->> 'end')::timestamptz)
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

create function cancel_post(p_post uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from posts where id = p_post and org_id = my_org_id() and status = 'live') then
    raise exception 'Not allowed';
  end if;
  update claims set status = 'released', released_at = now()
    where post_id = p_post and status not in ('completed', 'released');
  update posts set status = 'cancelled' where id = p_post;
  insert into photo_purge_queue (path) select path from post_photos where post_id = p_post on conflict do nothing;
  delete from post_photos where post_id = p_post;
  perform log_activity('post_cancelled', p_post, null);
end $$;

-- ---------------------------------------------------------------- claims

create function in_window(p_post posts, p_method handoff_method, p_time timestamptz) returns boolean
language sql immutable as $$
  select case p_method
    when 'pickup' then p_post.pickup_offered and p_time between p_post.pickup_start and p_post.pickup_end
    else p_post.delivery_offered and p_time between p_post.delivery_start and p_post.delivery_end
  end
$$;

create function claim_post(p_post uuid, p_items jsonb, p_method handoff_method, p_time timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := my_org_id();
  v_post posts;
  v_opt record;
  v_claim uuid;
  v_it jsonb;
  v_line line_items;
  v_qty numeric;
  v_rem numeric;
  v_count int := 0;
begin
  if v_org is null or my_org_type() <> 'pantry' then raise exception 'Only pantries can claim'; end if;
  select * into v_post from posts where id = p_post for update;   -- serializes concurrent claims: first wins
  if v_post.id is null or v_post.org_id = v_org then raise exception 'Not allowed'; end if;
  if v_post.status <> 'live' or v_post.expires_at <= now() then raise exception 'This post is no longer available'; end if;
  if not can_view_post(p_post) then raise exception 'Not allowed'; end if;

  select * into v_opt from post_options(p_post, v_org);
  if p_method = 'pickup' and not v_opt.pickup then raise exception 'Pickup is not available for you'; end if;
  if p_method = 'delivery' and not v_opt.delivery then raise exception 'Delivery is not available for you'; end if;
  if not in_window(v_post, p_method, p_time) then raise exception 'Pick a time inside the offered window'; end if;

  insert into claims (post_id, claimer_org_id, claimed_by, method, proposed_time)
  values (p_post, v_org, auth.uid(), p_method, p_time) returning id into v_claim;

  for v_it in select * from jsonb_array_elements(p_items) loop
    select * into v_line from line_items where id = (v_it ->> 'line_item_id')::uuid and post_id = p_post;
    if v_line.id is null then raise exception 'Unknown item'; end if;
    v_qty := (v_it ->> 'quantity')::numeric;
    v_rem := line_remaining(v_line.id);
    if v_qty is null or v_qty <= 0 or v_qty > v_rem then raise exception 'Not enough left of %', v_line.name; end if;
    -- A line is taken whole unless the post allows splitting and the line quantity is above 1.
    if (v_post.require_all or v_line.quantity <= 1) and v_qty <> v_line.quantity then
      raise exception '% must be taken whole', v_line.name;
    end if;
    insert into claim_items (claim_id, line_item_id, quantity) values (v_claim, v_line.id, v_qty);
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then raise exception 'Choose something to claim'; end if;
  if v_post.require_all and v_count <> (select count(*) from line_items where post_id = p_post) then
    raise exception 'This post must be taken together';
  end if;

  perform log_activity('claimed', p_post, v_claim);
  return v_claim;
end $$;

create function claim_for_actor(p_claim uuid) returns claims language sql stable security definer set search_path = public as $$
  select c.* from claims c join posts p on p.id = c.post_id
  where c.id = p_claim and (c.claimer_org_id = my_org_id() or p.org_id = my_org_id())
$$;

create function propose_time(p_claim uuid, p_time timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare c claims; p posts;
begin
  select * into c from claim_for_actor(p_claim);
  if c.id is null or c.claimer_org_id <> my_org_id() then raise exception 'Not allowed'; end if;
  if c.status not in ('awaiting_time', 'time_proposed') then raise exception 'Time is already set'; end if;
  select * into p from posts where id = c.post_id;
  if not in_window(p, c.method, p_time) then raise exception 'Pick a time inside the offered window'; end if;
  update claims set proposed_time = p_time, status = 'time_proposed' where id = c.id;
  perform log_activity('time_proposed', c.post_id, c.id);
end $$;

create function respond_to_time(p_claim uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c claims; p posts;
begin
  select * into c from claim_for_actor(p_claim);
  select * into p from posts where id = c.post_id;
  if c.id is null or p.org_id <> my_org_id() then raise exception 'Not allowed'; end if;
  if c.status <> 'time_proposed' then raise exception 'No time to respond to'; end if;
  if p_accept then
    update claims set status = 'scheduled' where id = c.id;
    perform log_activity('time_accepted', c.post_id, c.id);
  else
    update claims set status = 'awaiting_time', proposed_time = null where id = c.id;
    perform log_activity('time_declined', c.post_id, c.id);
  end if;
end $$;

create function release_claim(p_claim uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c claims;
begin
  select * into c from claim_for_actor(p_claim);
  if c.id is null then raise exception 'Not allowed'; end if;
  if c.status in ('completed', 'released') then raise exception 'Claim is already closed'; end if;
  update claims set status = 'released', released_at = now() where id = c.id;
  perform log_activity('claim_released', c.post_id, c.id);
end $$;

create function refresh_post_closed(p_post uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from claims where post_id = p_post and status not in ('completed', 'released')) then return; end if;
  if not exists (select 1 from claims where post_id = p_post and status = 'completed') then return; end if;
  if exists (select 1 from posts where id = p_post and status in ('live', 'expired')
             and (expires_at <= now() or not exists (
               select 1 from line_items li where li.post_id = p_post and line_remaining(li.id) > 0))) then
    update posts set status = 'closed' where id = p_post;
    insert into photo_purge_queue (path) select path from post_photos where post_id = p_post on conflict do nothing;
    delete from post_photos where post_id = p_post;
  end if;
end $$;

create function complete_claim(p_claim uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c claims;
begin
  select * into c from claim_for_actor(p_claim);
  if c.id is null then raise exception 'Not allowed'; end if;
  if c.status in ('completed', 'released') then raise exception 'Claim is already closed'; end if;
  update claims set status = 'completed', completed_at = now(), completed_by = auth.uid() where id = c.id;
  perform log_activity('claim_completed', c.post_id, c.id);
  perform refresh_post_closed(c.post_id);
end $$;

-- ---------------------------------------------------------------- feed

create function browse_feed() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(card order by created_at desc), '[]'::jsonb) from (
    select p.created_at, jsonb_build_object(
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
      and exists (select 1 from line_items li where li.post_id = p.id and line_remaining(li.id) > 0)
  ) s
$$;

-- ---------------------------------------------------------------- expiry (called by a scheduled job)

create function expire_posts() returns void language plpgsql security definer set search_path = public as $$
begin
  -- Photos go at expiry even if a claim is still open.
  insert into photo_purge_queue (path)
    select ph.path from post_photos ph join posts p on p.id = ph.post_id
    where p.status = 'live' and p.expires_at <= now() on conflict do nothing;
  delete from post_photos where post_id in (select id from posts where status = 'live' and expires_at <= now());
  update posts set status = 'expired'
    where status = 'live' and expires_at <= now()
      and not exists (select 1 from claims c where c.post_id = posts.id and c.status not in ('completed', 'released'));
end $$;

-- ---------------------------------------------------------------- storage for photos

insert into storage.buckets (id, name, public) values ('post-photos', 'post-photos', true)
on conflict (id) do nothing;

create policy photo_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'post-photos' and (storage.foldername(name))[1] = my_org_id()::text);

-- ---------------------------------------------------------------- lock down function execution

do $$
declare f record;
begin
  for f in select oid::regprocedure as sig from pg_proc where pronamespace = 'public'::regnamespace loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;
