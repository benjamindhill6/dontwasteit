import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

// Allow whatever headers the browser's preflight asks for (supabase-js adds several of its own).
export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const preflight = (req: Request) =>
  new Response(null, {
    status: 204,
    headers: {
      ...cors,
      "Access-Control-Allow-Headers": req.headers.get("Access-Control-Request-Headers") ?? "*",
    },
  });

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

export type Caller = {
  admin: SupabaseClient; // service role, bypasses RLS
  id: string;
  org_id: string | null;
  is_platform_admin: boolean;
  org_type: "pantry" | "business" | null;
};

/** Verifies the caller's JWT and loads their person row. Returns a Response on failure. */
export async function getCaller(req: Request): Promise<Caller | Response> {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: u } = await admin.auth.getUser(token);
  if (!u.user) return json({ error: "Not signed in" }, 401);
  const { data: p } = await admin.from("people").select("id, org_id, is_platform_admin, active").eq("id", u.user.id).single();
  if (!p || !p.active) return json({ error: "Not allowed" }, 403);
  let org_type: Caller["org_type"] = null;
  if (p.org_id) {
    const { data: o } = await admin.from("organizations").select("type").eq("id", p.org_id).single();
    org_type = o?.type ?? null;
  }
  return { admin, id: p.id, org_id: p.org_id, is_platform_admin: p.is_platform_admin, org_type };
}
