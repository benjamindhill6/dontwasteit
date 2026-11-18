-- "How you get food" is now a pantry setting only. Personal alert prefs no longer carry a
-- handoff choice, so clear any old value and ignore it if a stale client sends one.

update people set notif_prefs = notif_prefs - 'handoff' where notif_prefs ? 'handoff';

create or replace function offer_alert_allowed(org_rules jsonb, my_prefs jsonb, p_cats text[],
                                               p_pickup boolean, p_delivery boolean, p_at timestamptz)
returns boolean language sql stable as $$
  with t as (select p_at at time zone 'America/New_York' as l)
  select rule_allows(org_rules, p_pickup, p_delivery, extract(dow from l)::int, extract(hour from l)::int)
     and rule_allows(coalesce(my_prefs, '{}'::jsonb) - 'handoff', p_pickup, p_delivery, extract(dow from l)::int, extract(hour from l)::int)
     and exists (
       select 1 from unnest(p_cats) c
       where (rule_list(org_rules, 'categories') is null or c = any(rule_list(org_rules, 'categories')))
         and (rule_list(my_prefs, 'categories') is null or c = any(rule_list(my_prefs, 'categories'))))
  from t
$$;
