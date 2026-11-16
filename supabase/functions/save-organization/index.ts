// Create or update an organization. Geocodes the address once on save (OpenStreetMap Nominatim, free).
// Platform admins can do everything; a pantry contact can edit only their own pantry's profile.
import { getCaller, json, preflight } from "../_shared/auth.ts";

async function geocode(street: string, city: string, state: string, zip: string) {
  const q = new URLSearchParams({ street, city, state, postalcode: zip, country: "us", format: "json", limit: "1" });
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${q}`, {
    headers: { "User-Agent": "dont-waste-it-pantry-network/1.0" },
  });
  const rows = await r.json();
  if (!rows.length) return null;
  return { lat: parseFloat(rows[0].lat), lng: parseFloat(rows[0].lon) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  const caller = await getCaller(req);
  if (caller instanceof Response) return caller;

  const b = await req.json();
  const isNew = !b.id;
  if (isNew && !caller.is_platform_admin) return json({ error: "Only admins can add organizations" }, 403);
  if (!isNew && !caller.is_platform_admin) {
    if (caller.org_id !== b.id || caller.org_type !== "pantry") return json({ error: "Not allowed" }, 403);
  }

  for (const k of ["name", "street", "city", "state", "zip"]) {
    if (!b[k] || !String(b[k]).trim()) return json({ error: `${k} is required` }, 400);
  }
  const type = b.type ?? "pantry";
  const delivery = b.delivery_miles === "" || b.delivery_miles == null ? null : Number(b.delivery_miles);
  const pickup = b.pickup_miles === "" || b.pickup_miles == null ? null : Number(b.pickup_miles);
  if (type === "pantry" && (delivery == null || pickup == null || delivery < 0 || pickup < 0)) {
    return json({ error: "Delivery and pickup distances are required for pantries" }, 400);
  }

  const geo = await geocode(b.street, b.city, b.state, b.zip);
  if (!geo) return json({ error: "We couldn't find that address. Check the street, city, state and ZIP." }, 422);

  const row: Record<string, unknown> = {
    name: b.name.trim(), street: b.street.trim(), city: b.city.trim(), state: b.state.trim(), zip: b.zip.trim(),
    lat: geo.lat, lng: geo.lng, delivery_miles: delivery, pickup_miles: pickup,
  };
  if (type === "pantry") {
    row.is_philabundance = !!b.is_philabundance;
    row.is_share = !!b.is_share;
  }
  if (caller.is_platform_admin) {
    row.type = type;
    if (b.active !== undefined) row.active = !!b.active;
  }

  const q = isNew
    ? caller.admin.from("organizations").insert(row).select().single()
    : caller.admin.from("organizations").update(row).eq("id", b.id).select().single();
  const { data, error } = await q;
  if (error) return json({ error: error.message }, 400);
  return json({ organization: data });
});
