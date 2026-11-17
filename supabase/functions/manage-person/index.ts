// Invite or deactivate a contact. Admins manage anyone; a pantry/business contact manages their own org's contacts.
import { getCaller, handle, json } from "../_shared/auth.ts";

Deno.serve(handle(async (req) => {
  const caller = await getCaller(req);
  if (caller instanceof Response) return caller;
  const b = await req.json();
  const { admin } = caller;

  const allowedOrg = (orgId: string) => caller.is_platform_admin || caller.org_id === orgId;

  if (b.action === "invite") {
    if (!b.org_id || !allowedOrg(b.org_id)) return json({ error: "Not allowed" }, 403);
    const email = String(b.email ?? "").trim().toLowerCase();
    if (!email || !b.name || !String(b.name).trim()) return json({ error: "Name and email are required" }, 400);

    const { data: inv, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: b.redirect_to ?? undefined,
    });
    if (error || !inv.user) return json({ error: error?.message ?? "Could not send invite" }, 400);

    const { error: pe } = await admin.from("people").upsert({
      id: inv.user.id, org_id: b.org_id, email, name: String(b.name).trim(), phone: b.phone ?? null, active: true,
    });
    if (pe) return json({ error: pe.message }, 400);
    return json({ ok: true });
  }

  // Platform admin creates the account directly, with a password they hand over. No email is sent.
  if (b.action === "create") {
    if (!caller.is_platform_admin) return json({ error: "Only platform admins can create accounts" }, 403);
    if (!b.org_id) return json({ error: "Choose an organization" }, 400);
    const email = String(b.email ?? "").trim().toLowerCase();
    const password = String(b.password ?? "");
    if (!email || !b.name || !String(b.name).trim()) return json({ error: "Name and email are required" }, 400);
    if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);

    const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !created.user) return json({ error: error?.message ?? "Could not create account" }, 400);

    const { error: pe } = await admin.from("people").upsert({
      id: created.user.id, org_id: b.org_id, email, name: String(b.name).trim(), phone: b.phone ?? null, active: true,
    });
    if (pe) {
      await admin.auth.admin.deleteUser(created.user.id); // don't leave a login with no profile
      return json({ error: pe.message }, 400);
    }
    return json({ ok: true });
  }

  if (b.action === "deactivate" || b.action === "reactivate") {
    const { data: target } = await admin.from("people").select("id, org_id, is_platform_admin").eq("id", b.person_id).single();
    if (!target || !target.org_id || !allowedOrg(target.org_id)) return json({ error: "Not allowed" }, 403);
    if (target.id === caller.id) return json({ error: "You can't deactivate yourself" }, 400);
    const on = b.action === "reactivate";
    // Banning removes the login and stops sessions; notifications check people.active.
    const { error } = await admin.auth.admin.updateUserById(target.id, { ban_duration: on ? "none" : "876000h" });
    if (error) return json({ error: error.message }, 400);
    await admin.from("people").update({ active: on }).eq("id", target.id);
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
}));
