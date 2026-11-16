-- Scheduled jobs (pg_cron). Free-plan projects pause after a week of low activity,
-- so a daily job doubles as the keep-alive.
create extension if not exists pg_cron;

select cron.schedule('expire-posts', '*/15 * * * *', $$ select public.expire_posts() $$);
select cron.schedule('keep-alive', '0 9 * * *', $$ select count(*) from public.organizations $$);
