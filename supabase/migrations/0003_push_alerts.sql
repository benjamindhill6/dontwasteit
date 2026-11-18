-- Push alerts (build step 4).
--
-- How it works:
--   1. Database events (new post, claim, time proposed/accepted/declined, release, cancel) and the
--      provider-window timer write one row per person into `alerts`. All filter, distance and
--      provider-window logic lives here, next to the permission rules it mirrors.
--   2. Inserting alerts pings the `send-alerts` edge function (pg_net), which delivers each alert to
--      every push subscription that person has. A one-minute job retries anything left unsent.
--   `alerts` is channel-neutral, so a native app can later add its own sender for the same rows.
--
-- Filters:
--   organizations.notif_rules  pantry base rules (any pantry contact edits them)
--   people.notif_prefs         personal limits on top (each person edits their own)
-- Both use the same JSON shape, and the effective filter is the overlap of the two:
--   { "enabled": bool,                 -- false = no new-offer alerts (default true)
--     "categories": ["produce", ...],  -- absent = all categories
--     "days": [0..6],                  -- 0 = Sunday; absent = every day (Eastern time)
--     "handoff": "any"|"delivery"|"pickup",
--     "start_hour": 0..23, "end_hour": 1..24 }  -- alerts only from start to end (Eastern time)
-- Always-on alerts (your post was claimed, time proposed/accepted/declined, a post you claimed was
-- cancelled or edited, a claim was released) ignore every filter.

create extension if not exists pg_net;

alter table organizations add column notif_rules jsonb not null default '{}'::jsonb;

-- When the Philabundance/SHARE window ended and the rest of the network was alerted.
alter table posts add column window_alerts_at timestamptz;
-- Posts already past (or with no) provider window must not alert again when this ships.
update posts set window_alerts_at = now() where source <> 'none';

-- ---------------------------------------------------------------- tables

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  kind text not null default 'web' check (kind in ('web')),   -- room for 'apns' / 'fcm' later
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
create index on push_subscriptions (person_id);

create table alerts (
  id bigint generated always as identity primary key,
  person_id uuid not null references people (id) on delete cascade,
  kind text not null,             -- new_offer, claimed, time_proposed, time_accepted, ...
  title text not null,
  body text not null,
  url text not null default '/',
  post_id uuid,
  claim_id uuid,
  created_at timestamptz not null default now(),
  picked_at timestamptz,          -- the sender took it
  sent_at timestamptz,            -- finished (delivered, or nothing to deliver to)
  delivered int not null default 0,
  attempts int not null default 0,
  error text
);
create index alerts_unsent on alerts (created_at) where sent_at is null;
create index on alerts (person_id, created_at);

alter table push_subscriptions enable row level security;
alter table alerts enable row level security;
create policy push_subs_own on push_subscriptions for select to authenticated using (person_id = auth.uid());
create policy alerts_own on alerts for select to authenticated using (person_id = auth.uid());
-- No write policies: writes go through the functions below or the service-role edge function.

-- ---------------------------------------------------------------- filter helpers

-- Read a JSON array of strings, or null when the key is missing (= no restriction).
create function rule_list(r jsonb, k text) returns text[] language sql immutable as $$
  select case when jsonb_typeof(r -> k) = 'array'
    then array(select jsonb_array_elements_text(r -> k)) end
$$;

-- Does one layer of rules (pantry or person) allow an alert right now? Categories are checked
-- separately, as an overlap of both layers, in offer_alert_allowed.
create function rule_allows(r jsonb, p_pickup boolean, p_delivery boolean, p_dow int, p_hour int)
returns boolean language sql immutable as $$
  select coalesce((r ->> 'enabled')::boolean, true)
    and (rule_list(r, 'days') is null or p_dow::text = any(rule_list(r, 'days')))
    and case coalesce(r ->> 'handoff', 'any')
          when 'delivery' then p_delivery
          when 'pickup' then p_pickup
          else true end
    and case
          when r ->> 'start_hour' is null or r ->> 'end_hour' is null then true
          when (r ->> 'start_hour')::int < (r ->> 'end_hour')::int
            then p_hour >= (r ->> 'start_hour')::int and p_hour < (r ->> 'end_hour')::int
          when (r ->> 'start_hour')::int > (r ->> 'end_hour')::int   -- overnight, e.g. 20 to 6
            then p_hour >= (r ->> 'start_hour')::int or p_hour < (r ->> 'end_hour')::int
          else true end
$$;

-- Effective filter = pantry rules AND personal rules. Categories must overlap across all three:
-- what is still unclaimed on the post, what the pantry wants, and what the person wants.
create function offer_alert_allowed(org_rules jsonb, my_prefs jsonb, p_cats text[],
                                    p_pickup boolean, p_delivery boolean, p_at timestamptz)
returns boolean language sql stable as $$
  with t as (select p_at at time zone 'America/New_York' as l)
  select rule_allows(org_rules, p_pickup, p_delivery, extract(dow from l)::int, extract(hour from l)::int)
     and rule_allows(my_prefs, p_pickup, p_delivery, extract(dow from l)::int, extract(hour from l)::int)
     and exists (
       select 1 from unnest(p_cats) c
       where (rule_list(org_rules, 'categories') is null or c = any(rule_list(org_rules, 'categories')))
         and (rule_list(my_prefs, 'categories') is null or c = any(rule_list(my_prefs, 'categories'))))
  from t
$$;

create function fmt_when(t timestamptz) returns text language sql stable as $$
  select to_char(t at time zone 'America/New_York', 'Dy Mon FMDD, FMHH12:MI AM')
$$;

create function cat_label(c text) returns text language sql immutable as $$
  select case c when 'shelf_stable' then 'Shelf-stable' when 'non_food' then 'Non-food'
                else initcap(c) end
$$;

-- "Yogurt, Bread, Apples +2 more" from what is still unclaimed.
create function post_summary(p_post uuid) returns text language sql stable security definer set search_path = public as $$
  with r as (select li.name, li.position from line_items li where li.post_id = p_post and line_remaining(li.id) > 0)
  select coalesce(string_agg(name, ', ' order by position) filter (where rn <= 3), '')
         || case when count(*) > 3 then ' +' || (count(*) - 3) || ' more' else '' end
  from (select name, position, row_number() over (order by position) rn from r) x
$$;

-- Items in a claim: "Yogurt (12 cases), Bread (4 bags)".
create function claim_summary(p_claim uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce(string_agg(li.name || ' (' || trim(to_char(ci.quantity, 'FM999999990.##'), '.') || ' ' || li.unit || ')', ', ' order by li.position), '')
  from claim_items ci join line_items li on li.id = ci.line_item_id where ci.claim_id = p_claim
$$;

-- ---------------------------------------------------------------- new-offer alerts

-- Alert pantries to a live surplus post, filtered.
--   p_phase 'new'         at posting: everyone who can see it now (provider posts: clients only)
--   p_phase 'window_open' provider window ended: the pantries that were held back
--   p_phase 'released'    a claim was released: everyone who can see it, except p_skip_org
-- Never alerts the poster, or a pantry with an open claim on the post. Only remaining (unclaimed)
-- items count, and the distance rule must give the pantry pickup or delivery.
create function enqueue_offer_alerts(p_post uuid, p_phase text, p_skip_org uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  p posts;
  v_poster organizations;
  v_cats text[];
  v_summary text;
  v_n int;
begin
  select * into p from posts where id = p_post;
  if p.id is null or p.type <> 'surplus' or p.status <> 'live' or p.expires_at <= now() then return 0; end if;
  select * into v_poster from organizations where id = p.org_id;

  select array_agg(distinct li.category::text) into v_cats
  from line_items li where li.post_id = p.id and line_remaining(li.id) > 0;
  if v_cats is null then return 0; end if;   -- nothing left to offer
  v_summary := post_summary(p.id);

  insert into alerts (person_id, kind, title, body, url, post_id)
  select per.id, 'new_offer',
    case p.source when 'philabundance' then 'Philabundance food from ' when 'share' then 'SHARE food from ' else 'New food from ' end
      || v_poster.name,
    v_summary || ' · '
      || case when o.pickup and o.delivery then 'Pickup or delivery'
              when o.delivery then 'Delivery to you' else 'Pickup' end
      || coalesce(' · ' || round(miles_between(v_poster.lat, v_poster.lng, v.lat, v.lng)::numeric, 1) || ' mi', ''),
    '/offers?post=' || p.id || '&from=alert',
    p.id
  from organizations v
  cross join lateral post_options(p.id, v.id) o
  join people per on per.org_id = v.id and per.active
  where v.type = 'pantry' and v.active and v.id <> p.org_id
    and v.id is distinct from p_skip_org
    and (o.pickup or o.delivery)
    and case p_phase
          when 'window_open' then
            not ((p.source = 'philabundance' and v.is_philabundance) or (p.source = 'share' and v.is_share))
          else
            p.source = 'none' or p.created_at + interval '2 hours' <= now()
            or (p.source = 'philabundance' and v.is_philabundance) or (p.source = 'share' and v.is_share)
        end
    and not exists (select 1 from claims c where c.post_id = p.id and c.claimer_org_id = v.id
                    and c.status not in ('completed', 'released'))
    and offer_alert_allowed(v.notif_rules, per.notif_prefs, v_cats, o.pickup, o.delivery, now());
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Every minute: provider posts whose 2-hour window just ended go out to everyone else.
create function open_provider_windows() returns int language plpgsql security definer set search_path = public as $$
declare r record; v_n int := 0;
begin
  for r in
    update posts set window_alerts_at = now()
    where source <> 'none' and window_alerts_at is null and created_at + interval '2 hours' <= now()
    returning id
  loop
    v_n := v_n + enqueue_offer_alerts(r.id, 'window_open');
  end loop;
  return v_n;
end $$;

-- ---------------------------------------------------------------- always-on alerts

-- Alert every active person in one organization, no filters.
create function enqueue_org_alert(p_org uuid, p_kind text, p_title text, p_body text, p_url text,
                                  p_post uuid, p_claim uuid)
returns void language sql security definer set search_path = public as $$
  insert into alerts (person_id, kind, title, body, url, post_id, claim_id)
  select per.id, p_kind, p_title, coalesce(p_body, ''), p_url, p_post, p_claim
  from people per join organizations o on o.id = per.org_id
  where per.org_id = p_org and per.active and o.active
$$;

-- For when post editing ships: tell every pantry with an open claim that the post changed.
create function enqueue_post_edited(p_post uuid) returns void language plpgsql security definer set search_path = public as $$
declare p posts; v_poster text; c record;
begin
  select * into p from posts where id = p_post;
  select name into v_poster from organizations where id = p.org_id;
  for c in select * from claims where post_id = p_post and status not in ('completed', 'released') loop
    perform enqueue_org_alert(c.claimer_org_id, 'post_edited', v_poster || ' changed a post you claimed',
      'Check the details before your ' || c.method || '.', '/activity?from=alert', p_post, c.id);
  end loop;
end $$;

-- Turns each activity_log row into alerts. Runs inside the same transaction as the action.
create function alerts_for_activity() returns trigger language plpgsql security definer set search_path = public as $$
declare
  c claims;
  p posts;
  v_poster organizations;
  v_claimer organizations;
  v_released_by_claimer boolean;
begin
  if new.post_id is not null then
    select * into p from posts where id = new.post_id;
    select * into v_poster from organizations where id = p.org_id;
  end if;
  if new.claim_id is not null then
    select * into c from claims where id = new.claim_id;
    select * into v_claimer from organizations where id = c.claimer_org_id;
  end if;

  case new.action
  when 'post_created' then
    -- Provider posts go to that provider's clients now and to everyone else when the window ends.
    perform enqueue_offer_alerts(p.id, 'new');

  when 'claimed' then
    perform enqueue_org_alert(p.org_id, 'claimed', v_claimer.name || ' claimed your food',
      claim_summary(c.id) || ' · ' || initcap(c.method::text) || ' ' || coalesce(fmt_when(c.proposed_time), '')
        || '. Accept or decline the time.',
      '/activity?from=alert', p.id, c.id);

  when 'time_proposed' then
    perform enqueue_org_alert(p.org_id, 'time_proposed', v_claimer.name || ' proposed a time',
      initcap(c.method::text) || ' ' || coalesce(fmt_when(c.proposed_time), '') || '. Accept or decline it.',
      '/activity?from=alert', p.id, c.id);

  when 'time_accepted' then
    perform enqueue_org_alert(c.claimer_org_id, 'time_accepted', v_poster.name || ' accepted your time',
      initcap(c.method::text) || ' ' || coalesce(fmt_when(c.proposed_time), '') || ' · ' || claim_summary(c.id),
      '/activity?from=alert', p.id, c.id);

  when 'time_declined' then
    perform enqueue_org_alert(c.claimer_org_id, 'time_declined', v_poster.name || ' declined your time',
      'Pick a new time for ' || claim_summary(c.id) || '.',
      '/activity?from=alert', p.id, c.id);

  when 'claim_released' then
    v_released_by_claimer := new.actor_org_id is not distinct from c.claimer_org_id;
    if v_released_by_claimer then
      perform enqueue_org_alert(p.org_id, 'claim_released', v_claimer.name || ' released their claim',
        claim_summary(c.id) || ' is open again.', '/activity?from=alert', p.id, c.id);
    else
      perform enqueue_org_alert(c.claimer_org_id, 'claim_released', v_poster.name || ' released your claim',
        claim_summary(c.id) || ' is no longer yours.', '/activity?from=alert', p.id, c.id);
    end if;
    -- The food is open again: alert the other pantries (filtered). Provider posts still inside
    -- their window stay with that provider's clients.
    perform enqueue_offer_alerts(p.id, 'released', c.claimer_org_id);

  when 'post_cancelled' then
    -- cancel_post released the open claims a moment ago in this same transaction (same now()).
    for c in select * from claims where post_id = p.id and status = 'released' and released_at = now() loop
      perform enqueue_org_alert(c.claimer_org_id, 'post_cancelled', v_poster.name || ' cancelled a post you claimed',
        claim_summary(c.id) || ' is no longer available.', '/activity?from=alert', p.id, c.id);
    end loop;

  else null;
  end case;
  return null;
exception when others then
  -- An alert problem must never block a post, claim or release.
  raise warning 'alerts_for_activity(%): %', new.action, sqlerrm;
  return null;
end $$;

create trigger activity_alerts after insert on activity_log for each row execute function alerts_for_activity();

-- ---------------------------------------------------------------- delivery

-- Ping the send-alerts edge function. Needs two Vault secrets (see README):
--   project_url    e.g. https://<ref>.supabase.co
--   alerts_secret  same value as the function's ALERTS_SECRET
-- Without them alerts just wait in the table.
create function kick_alert_sender() returns void language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'alerts_secret';
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/send-alerts',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-alerts-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000);
exception when others then
  raise warning 'kick_alert_sender: %', sqlerrm;
end $$;

create function alerts_inserted() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform kick_alert_sender();
  return null;
end $$;
create trigger alerts_kick after insert on alerts for each statement execute function alerts_inserted();

-- The sender takes a batch. Rows picked more than 2 minutes ago without finishing are retried,
-- up to 5 attempts; rows older than a day are dropped as stale.
create function take_alerts(p_limit int default 100) returns setof alerts
language plpgsql security definer set search_path = public as $$
begin
  update alerts set sent_at = now(), error = coalesce(error, 'gave up')
    where sent_at is null and (attempts >= 5 or created_at < now() - interval '1 day');
  return query
    update alerts a set picked_at = now(), attempts = a.attempts + 1
    where a.id in (
      select id from alerts
      where sent_at is null and (picked_at is null or picked_at < now() - interval '2 minutes')
      order by created_at limit p_limit
      for update skip locked)
    returning a.*;
end $$;

-- Every minute: alert the network when provider windows end, then retry anything unsent.
create function alerts_tick() returns void language plpgsql security definer set search_path = public as $$
begin
  perform open_provider_windows();
  if exists (select 1 from alerts where sent_at is null) then perform kick_alert_sender(); end if;
end $$;

select cron.schedule('alerts-tick', '* * * * *', $$ select public.alerts_tick() $$);

-- ---------------------------------------------------------------- app-facing functions

create function save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_active_person() then raise exception 'Not allowed'; end if;
  if p_endpoint !~ '^https://' then raise exception 'Bad subscription'; end if;
  -- A phone that changes hands moves to the new person.
  insert into push_subscriptions (person_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set person_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
end $$;

create function delete_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint and person_id = auth.uid()
$$;

create function send_test_alert() returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_active_person() then raise exception 'Not allowed'; end if;
  insert into alerts (person_id, kind, title, body, url)
  values (auth.uid(), 'test', 'Alerts are working', 'This is a test alert from Don''t Waste It!', '/profile/alerts?from=alert');
end $$;

create function clean_rules(r jsonb) returns jsonb language plpgsql immutable as $$
declare
  o jsonb := '{}'::jsonb;
  v_cats text[] := array['produce','dairy','meat','frozen','shelf_stable','bread','non_food','other'];
begin
  r := coalesce(r, '{}'::jsonb);
  if jsonb_typeof(r -> 'enabled') = 'boolean' then o := o || jsonb_build_object('enabled', r -> 'enabled'); end if;
  if jsonb_typeof(r -> 'categories') = 'array' then
    o := o || jsonb_build_object('categories', (select coalesce(jsonb_agg(distinct x), '[]') from jsonb_array_elements_text(r -> 'categories') x where x = any(v_cats)));
  end if;
  if jsonb_typeof(r -> 'days') = 'array' then
    o := o || jsonb_build_object('days', (select coalesce(jsonb_agg(distinct x::int), '[]') from jsonb_array_elements_text(r -> 'days') x where x ~ '^[0-6]$'));
  end if;
  if r ->> 'handoff' in ('any', 'delivery', 'pickup') then o := o || jsonb_build_object('handoff', r ->> 'handoff'); end if;
  if (r ->> 'start_hour') ~ '^\d+$' and (r ->> 'end_hour') ~ '^\d+$'
     and (r ->> 'start_hour')::int between 0 and 23 and (r ->> 'end_hour')::int between 1 and 24 then
    o := o || jsonb_build_object('start_hour', (r ->> 'start_hour')::int, 'end_hour', (r ->> 'end_hour')::int);
  end if;
  return o;
end $$;

-- Pantry base rules: any contact of that pantry, or a platform admin.
create function update_org_notif_rules(p_org uuid, p_rules jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_platform_admin() or (p_org = my_org_id() and my_org_type() = 'pantry')) then
    raise exception 'Not allowed';
  end if;
  update organizations set notif_rules = clean_rules(p_rules) where id = p_org;
end $$;

-- Personal limits. Stored as given; they can only ever narrow, because both layers must pass.
create function update_my_notif_prefs(p_prefs jsonb) returns void
language sql security definer set search_path = public as $$
  update people set notif_prefs = clean_rules(p_prefs) where id = auth.uid() and active
$$;

-- ---------------------------------------------------------------- lock down function execution

do $$
declare f record;
begin
  for f in select oid::regprocedure as sig from pg_proc where pronamespace = 'public'::regnamespace loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;

-- Internal machinery: the app never calls these directly.
revoke execute on function enqueue_offer_alerts(uuid, text, uuid), open_provider_windows(),
  enqueue_org_alert(uuid, text, text, text, text, uuid, uuid), enqueue_post_edited(uuid),
  kick_alert_sender(), take_alerts(int), alerts_tick()
  from authenticated;
