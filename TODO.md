# To-do

- [x] **Harden `create_surplus_post` against JSON `null`.** Done in `0007_multiple_windows.sql`: `parse_windows()` treats a JSON `null` (or an empty list) as not offered.

- [ ] **Post editing:** when it ships, call `enqueue_post_edited(post_id)` so claimers get the always-on alert (function is in `0003_push_alerts.sql`).
