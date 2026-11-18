# Don't Waste It!

Invite-only web app where food pantries share surplus food. React + TypeScript (Vite, installable PWA) on Supabase, hosted on Cloudflare Pages. See the Phase 1 spec for the full product.

Live site: https://dontwasteit.pages.dev/

## What's built (build steps 1-4)

- Invite-only accounts, platform admin console, organizations with geocoded addresses and distance settings
- Surplus posts: 5-step flow, up to 3 compressed photos, pickup and/or delivery windows, source
- Swipe-through offers with distance rules and the Philabundance/SHARE 2-hour window
- Claims: whole/partial, propose and confirm a time, release, complete, one-tap Text
- Push alerts: web push with pantry rules plus personal limits (overlap of both), distance rule, provider window release, always-on claim alerts. Profile > Alerts.
- User Agreement and Privacy Policy: everyone agrees on first use (checkbox), and again whenever a document's `version` changes in `src/legal/documents.ts`. Acceptances are stored per person, per document version, with a server timestamp in `agreements`. Both documents are under Profile.
- All permissions live in Postgres (RLS + security-definer functions) in `supabase/migrations`

Not yet: needs posts, serving schedules and calendar, admin reports, post editing (cancel works), photo purge function (queue is filled by `photo_purge_queue`).

## One-time setup (production only, no local database)

1. **Supabase**: create a project. Auth > Providers > Email: turn **off** "Allow new users to sign up". Auth > URL Configuration: set Site URL to the deployed address.
2. **Database**: `npx supabase login`, `npx supabase link --project-ref <ref>`, `npx supabase db push` (applies `supabase/migrations`).
3. **Edge functions**: `npx supabase functions deploy save-organization manage-person` and `npx supabase functions deploy send-alerts --no-verify-jwt`.
3a. **Push alerts** (once):
   - `npx web-push generate-vapid-keys` and pick a long random string for ALERTS_SECRET.
   - `npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com ALERTS_SECRET=...`
   - In the Supabase SQL editor: `select vault.create_secret('https://<ref>.supabase.co', 'project_url'); select vault.create_secret('<same ALERTS_SECRET>', 'alerts_secret');`
   - Without these, alerts queue up in the `alerts` table and nothing is sent.
4. **Cloudflare Pages**: connect this GitHub repo. Build command `npm run build`, output `dist`. Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Supabase > Project Settings > API).
5. **First admin**: in Supabase Auth > Users, invite benjamindhill6@gmail.com. A database trigger makes that account the platform admin automatically. Then add the first pantry in the app's Admin tab and invite ridleyparkfoodpantry@gmail.com as its contact.

Deploys: every push to `main` redeploys the site. Installed copies pick up a new deploy on their own: the app checks for a new version when it opens, when it comes back to the foreground, and every 30 minutes. If nobody has touched the app yet it reloads by itself, otherwise it shows an "Update available" banner. See `src/lib/appUpdate.ts` and `public/_headers`. Migrations and functions are applied with the Supabase CLI above.

## Develop

```
cp .env.example .env   # fill in the production project's URL and anon key
npm install
npm run dev
```
