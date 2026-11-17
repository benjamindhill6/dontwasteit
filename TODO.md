# To-do

- [ ] **Harden `create_surplus_post` against JSON `null`.** In `supabase/migrations/0001_core_schema.sql`, `p_payload -> 'pickup'` / `'delivery'` returns a JSON `null` (not SQL `NULL`) when a client sends `null`, so the function treats the handoff as offered and the post fails `posts_check` constraints. The web form now omits the field instead (`src/pages/NewPost.tsx`), but the function should use `nullif(p_payload -> 'pickup', 'null'::jsonb)` (same for `delivery`) in a new migration (e.g. `0003_...sql`) and then be applied to the database.
