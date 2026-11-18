-- User Agreement and Privacy Policy acceptance.
--
-- Every person must agree to the current version of both documents before using the app. Each
-- acceptance is one row, stamped with the server's time. When a document's version changes in the
-- app (src/legal/documents.ts), nobody has a row for the new version yet, so everyone is asked again.

create table agreements (
  person_id uuid not null references people (id) on delete cascade,
  document text not null check (document in ('terms', 'privacy')),
  version text not null,
  accepted_at timestamptz not null default now(),
  user_agent text,
  primary key (person_id, document, version)
);

alter table agreements enable row level security;
create policy agreements_own on agreements for select to authenticated
  using (person_id = auth.uid() or is_platform_admin());
-- No write policies: acceptance goes through the function below, so the time is always the server's.

create function accept_agreements(p_terms_version text, p_privacy_version text, p_user_agent text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from people where id = auth.uid() and active) then
    raise exception 'Not allowed';
  end if;
  if coalesce(trim(p_terms_version), '') = '' or coalesce(trim(p_privacy_version), '') = '' then
    raise exception 'Missing document version';
  end if;
  insert into agreements (person_id, document, version, user_agent) values
    (auth.uid(), 'terms', p_terms_version, left(p_user_agent, 500)),
    (auth.uid(), 'privacy', p_privacy_version, left(p_user_agent, 500))
  on conflict (person_id, document, version) do nothing;
end $$;

revoke execute on function accept_agreements(text, text, text) from public, anon;
grant execute on function accept_agreements(text, text, text) to authenticated, service_role;
