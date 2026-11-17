// Delivers queued alerts (the `alerts` table) as standard web push.
//
// Called by the database (pg_net) whenever alerts are queued, and every minute as a retry, with the
// x-alerts-secret header. Also answers {action: "public_key"} for the app, so the VAPID public key
// lives only in this function's secrets.
//
// Deploy with --no-verify-jwt (the database calls it with the shared secret, not a user token).
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...), ALERTS_SECRET.
//
// A native app later: add its tokens to push_subscriptions with another `kind` and a branch below.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";
import { handle, json } from "../_shared/auth.ts";

type Alert = { id: number; person_id: string; kind: string; title: string; body: string; url: string; post_id: string | null };
type Sub = { id: string; person_id: string; kind: string; endpoint: string; p256dh: string; auth: string };

const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const privateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

Deno.serve(handle(async (req) => {
  const b = await req.json().catch(() => ({}));
  if (b.action === "public_key") {
    if (!publicKey) return json({ error: "Alerts are not set up on the server yet" }, 503);
    return json({ public_key: publicKey });
  }

  const secret = Deno.env.get("ALERTS_SECRET");
  if (!secret || req.headers.get("x-alerts-secret") !== secret) return json({ error: "Not allowed" }, 403);
  if (!publicKey || !privateKey) return json({ error: "VAPID keys missing" }, 500);
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let sent = 0, batches = 0;

  // Drain in batches; stop after a few so one call never runs long.
  while (batches < 5) {
    const { data, error } = await admin.rpc("take_alerts", { p_limit: 100 });
    if (error) return json({ error: error.message }, 500);
    const alerts = (data ?? []) as Alert[];
    if (!alerts.length) break;
    batches++;

    const people = [...new Set(alerts.map((a) => a.person_id))];
    const { data: subRows } = await admin.from("push_subscriptions").select("*").in("person_id", people);
    // Deactivated people and organizations get nothing.
    const { data: live } = await admin.from("people").select("id, organizations(active)").in("id", people).eq("active", true);
    const allowed = new Set(
      ((live ?? []) as unknown as { id: string; organizations: { active: boolean } | null }[])
        .filter((p) => p.organizations == null || p.organizations.active)
        .map((p) => p.id),
    );
    const subs = ((subRows ?? []) as Sub[]).filter((s) => allowed.has(s.person_id));
    const dead = new Set<string>();
    const ok = new Set<string>();

    await Promise.all(alerts.map(async (a) => {
      const mine = subs.filter((s) => s.person_id === a.person_id && !dead.has(s.id));
      let delivered = 0;
      let lastError: string | null = null;
      let retry = false;
      await Promise.all(mine.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ title: a.title, body: a.body, url: a.url, tag: a.post_id ? `post-${a.post_id}` : `alert-${a.id}`, kind: a.kind }),
            { TTL: 60 * 60 * 12, urgency: a.kind === "new_offer" ? "normal" : "high" },
          );
          delivered++;
          ok.add(s.id);
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) dead.add(s.id); // phone unsubscribed or app removed
          else if (code === 429 || (code ?? 500) >= 500) retry = true;
          lastError = `${code ?? ""} ${(e as Error).message}`.trim().slice(0, 300);
        }
      }));
      sent += delivered;
      const done = !(retry && delivered === 0);
      await admin.from("alerts").update(
        // Not done: left picked, so take_alerts offers it again after 2 minutes.
        done ? { sent_at: new Date().toISOString(), delivered, error: lastError } : { error: lastError },
      ).eq("id", a.id);
    }));

    if (dead.size) await admin.from("push_subscriptions").delete().in("id", [...dead]);
    if (ok.size) await admin.from("push_subscriptions").update({ last_ok_at: new Date().toISOString() }).in("id", [...ok]);
  }
  return json({ ok: true, sent });
}));
