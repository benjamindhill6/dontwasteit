-- A declined time alert now opens the "Propose a time" sheet for that claim.
-- Only the time_declined branch changed (its url and body). Safe to apply before or after the
-- frontend ships: older app versions just open Activity for the new url.

create or replace function alerts_for_activity() returns trigger language plpgsql security definer set search_path = public as $$
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
      'Tap to pick a new time for ' || claim_summary(c.id) || '.',
      '/activity?propose=' || c.id, p.id, c.id);

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
