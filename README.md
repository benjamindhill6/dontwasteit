# Don't Waste It!

Invite-only web app where food pantries share surplus food. React + TypeScript (Vite, installable PWA) on Supabase, hosted on Cloudflare Pages. See the Phase 1 spec for the full product.

## What's built (build steps 1-3)

- Invite-only accounts, platform admin console, organizations with geocoded addresses and distance settings
- Surplus posts: 5-step flow, up to 3 compressed photos, pickup and/or delivery windows, source
- Swipe-through offers with distance rules and the Philabundance/SHARE 2-hour window
- Claims: whole/partial, propose and confirm a time, release, complete, one-tap Text
- All permissions live in Postgres (RLS + security-definer functions) in `supabase/migrations`

Not yet: push alerts, needs posts, serving schedules and calendar, admin reports, post editing (cancel works), photo purge function (queue is filled by `photo_purge_queue`).

## One-time setup (production only, no local database)

1. **Supabase**: create a project. Auth > Providers > Email: turn **off** "Allow new users to sign up". Auth > URL Configuration: set Site URL to the deployed address.
2. **Database**: `npx supabase login`, `npx supabase link --project-ref <ref>`, `npx supabase db push` (applies `supabase/migrations`).
3. **Edge functions**: `npx supabase functions deploy save-organization manage-person`.
4. **Cloudflare Pages**: connect this GitHub repo. Build command `npm run build`, output `dist`. Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Supabase > Project Settings > API).
5. **First admin**: in Supabase Auth > Users, invite benjamindhill6@gmail.com. A database trigger makes that account the platform admin automatically. Then add the first pantry in the app's Admin tab and invite ridleyparkfoodpantry@gmail.com as its contact.

Deploys: every push to `main` redeploys the site. Migrations and functions are applied with the Supabase CLI above.

## Develop

```
cp .env.example .env   # fill in the production project's URL and anon key
npm install
npm run dev
```
