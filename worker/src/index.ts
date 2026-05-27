/**
 * Shop Wise API — Cloudflare Worker
 * Routes documented in worker/README.md.
 */

export interface Env {
  DB: D1Database;
  SHOPWISE_AUTH_TOKEN: string;
  ALLOWED_ORIGINS: string;
}

type Json = Record<string, unknown> | unknown[];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    try {
      return await route(request, env, url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return jsonResp({ ok: false, error: msg }, env, 500);
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────
async function route(req: Request, env: Env, url: URL): Promise<Response> {
  const p = url.pathname;
  const m = req.method;

  if (p === "/" || p === "/api" || p === "/api/health") {
    return jsonResp({ ok: true, service: "shop-wise-api", version: "1.0.0" }, env);
  }

  // ─── Read routes (open) ───
  if (m === "GET" && p === "/api/retailers")        return getRetailers(env);
  if (m === "GET" && p === "/api/aisles")           return getAisles(env, url);
  if (m === "GET" && p === "/api/catalog")          return getCatalog(env, url);
  if (m === "GET" && p === "/api/list")             return getList(env, url);
  if (m === "GET" && p === "/api/products/lookup")  return lookupProduct(env, url);

  // ─── Auth required from here ───
  const authError = checkAuth(req, env);
  if (authError) return authError;

  // List ops
  if (m === "POST" && p === "/api/list/add")              return listAdd(req, env);
  if (m === "POST" && p === "/api/list/check")            return listCheck(req, env);
  if (m === "POST" && p === "/api/list/assign")           return listAssign(req, env);
  if (m === "POST" && p === "/api/list/update")           return listUpdate(req, env);
  if (m === "POST" && p === "/api/list/delete")           return listDelete(req, env);
  if (m === "POST" && p === "/api/list/external-status")  return listExternalStatus(req, env);

  // Pre-Do ingest
  if (m === "POST" && p === "/api/from-pre-do")           return fromPreDo(req, env);

  // Admin CRUD
  const adminMatch = p.match(/^\/api\/admin\/(retailers|products|aisles|locations)$/);
  if (adminMatch) {
    const resource = adminMatch[1];
    if (m === "POST")    return adminCreate(req, env, resource);
    if (m === "PATCH")   return adminUpdate(req, env, resource);
    if (m === "DELETE")  return adminDelete(req, env, resource);
  }

  return jsonResp({ ok: false, error: "Not found", path: p }, env, 404);
}

// ─────────────────────────────────────────────────────────────────────────
// Auth + CORS
// ─────────────────────────────────────────────────────────────────────────
function checkAuth(req: Request, env: Env): Response | null {
  const h = req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  const token = m ? m[1].trim() : "";
  if (!env.SHOPWISE_AUTH_TOKEN) {
    return jsonResp({ ok: false, error: "Server token not configured" }, env, 500);
  }
  if (token !== env.SHOPWISE_AUTH_TOKEN) {
    return jsonResp({ ok: false, error: "Unauthorized" }, env, 401);
  }
  return null;
}

function corsHeaders(env: Env): HeadersInit {
  const allow = env.ALLOWED_ORIGINS && env.ALLOWED_ORIGINS.length > 0 ? env.ALLOWED_ORIGINS : "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResp(body: Json, env: Env, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(env),
    },
  });
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try { return (await req.json()) as Record<string, unknown>; }
  catch { return {}; }
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────
function uuid(): string {
  return crypto.randomUUID();
}
function nowIso(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, "Z");
}

// ─────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────
async function getRetailers(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT id, name, color, kind, online_url_template, position, is_default
     FROM retailers ORDER BY position, name`
  ).all();
  return jsonResp({ ok: true, retailers: results }, env);
}

async function getAisles(env: Env, url: URL): Promise<Response> {
  const retailer = url.searchParams.get("retailer");
  let q = `SELECT id, retailer_id, name, sub, position, kind, side, map_x, map_y, map_w, map_h FROM aisles`;
  const binds: unknown[] = [];
  if (retailer) { q += ` WHERE retailer_id = ?`; binds.push(retailer); }
  q += ` ORDER BY retailer_id, position`;
  const { results } = await env.DB.prepare(q).bind(...binds).all();
  return jsonResp({ ok: true, aisles: results }, env);
}

async function getCatalog(env: Env, url: URL): Promise<Response> {
  const retailer = url.searchParams.get("retailer");
  let q = `
    SELECT p.id AS product_id, p.name, p.brand, p.notes,
           l.retailer_id, l.aisle_id, l.indicative_price, l.is_primary
    FROM products p
    LEFT JOIN product_locations l ON l.product_id = p.id
  `;
  const binds: unknown[] = [];
  if (retailer) { q += ` WHERE l.retailer_id = ?`; binds.push(retailer); }
  q += ` ORDER BY p.name`;
  const { results } = await env.DB.prepare(q).bind(...binds).all();
  return jsonResp({ ok: true, catalog: results }, env);
}

async function getList(env: Env, url: URL): Promise<Response> {
  const sourceActionId = url.searchParams.get("source_action_id");
  const fulfilmentMode = url.searchParams.get("fulfilment_mode");
  let q = `
    SELECT li.id, li.name, li.product_id, li.retailer_id, li.aisle_id,
           li.checked, li.fulfilment_mode, li.online_order_link, li.external_status,
           li.source, li.source_action_id, li.source_inbox_id,
           li.created_at, li.updated_at,
           r.name AS retailer_name, r.kind AS retailer_kind, r.color AS retailer_color,
           r.online_url_template,
           a.name AS aisle_name, a.sub AS aisle_sub, a.position AS aisle_position
    FROM list_items li
    LEFT JOIN retailers r ON r.id = li.retailer_id
    LEFT JOIN aisles a ON a.id = li.aisle_id
    WHERE 1=1
  `;
  const binds: unknown[] = [];
  if (sourceActionId) { q += ` AND li.source_action_id = ?`; binds.push(sourceActionId); }
  if (fulfilmentMode) { q += ` AND li.fulfilment_mode = ?`; binds.push(fulfilmentMode); }
  q += ` ORDER BY li.created_at`;
  const { results } = await env.DB.prepare(q).bind(...binds).all();
  return jsonResp({ ok: true, items: results }, env);
}

async function lookupProduct(env: Env, url: URL): Promise<Response> {
  const name = (url.searchParams.get("name") || "").trim();
  if (!name) return jsonResp({ ok: false, error: "name required" }, env, 400);

  // Exact case-insensitive match first
  let row = await env.DB.prepare(
    `SELECT p.id AS product_id, p.name,
            l.retailer_id, l.aisle_id, l.indicative_price
     FROM products p
     LEFT JOIN product_locations l ON l.product_id = p.id
     WHERE LOWER(p.name) = LOWER(?)
     ORDER BY l.is_primary DESC, l.retailer_id
     LIMIT 1`
  ).bind(name).first();

  if (!row) {
    row = await env.DB.prepare(
      `SELECT p.id AS product_id, p.name,
              l.retailer_id, l.aisle_id, l.indicative_price
       FROM products p
       LEFT JOIN product_locations l ON l.product_id = p.id
       WHERE LOWER(p.name) LIKE LOWER(?) || '%'
       ORDER BY l.is_primary DESC, p.name
       LIMIT 1`
    ).bind(name).first();
  }

  if (!row) return jsonResp({ ok: false, found: false }, env, 404);
  return jsonResp({ ok: true, found: true, ...row }, env);
}

// ─────────────────────────────────────────────────────────────────────────
// List ops
// ─────────────────────────────────────────────────────────────────────────
async function listAdd(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  const name = (body.name as string || "").trim();
  if (!name) return jsonResp({ ok: false, error: "name required" }, env, 400);

  // Try to resolve product + default retailer location.
  const lookup = await env.DB.prepare(
    `SELECT p.id AS product_id, l.retailer_id, l.aisle_id
     FROM products p
     LEFT JOIN product_locations l ON l.product_id = p.id
     WHERE LOWER(p.name) = LOWER(?)
     ORDER BY l.is_primary DESC, l.retailer_id
     LIMIT 1`
  ).bind(name).first<{ product_id: string; retailer_id: string | null; aisle_id: string | null }>();

  const id = uuid();
  const now = nowIso();
  const retailerId = (body.retailerId as string) ?? lookup?.retailer_id ?? null;
  const aisleId    = (body.aisleId    as string) ?? lookup?.aisle_id    ?? null;
  const productId  = lookup?.product_id ?? null;
  const fulfil     = (body.fulfilmentMode as string) ?? "in_store";
  const orderLink  = (body.onlineOrderLink as string) ?? null;

  await env.DB.prepare(
    `INSERT INTO list_items
       (id, name, product_id, retailer_id, aisle_id, fulfilment_mode, online_order_link,
        source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)`
  ).bind(id, lookup ? (await getProductName(env, productId!)) : name,
         productId, retailerId, aisleId, fulfil, orderLink, now, now).run();

  return jsonResp({ ok: true, id }, env, 201);
}

async function getProductName(env: Env, productId: string): Promise<string> {
  const row = await env.DB.prepare(`SELECT name FROM products WHERE id = ?`).bind(productId).first<{ name: string }>();
  return row?.name ?? "";
}

async function listCheck(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  const id = body.id as string;
  const checked = body.checked ? 1 : 0;
  if (!id) return jsonResp({ ok: false, error: "id required" }, env, 400);
  await env.DB.prepare(
    `UPDATE list_items SET checked = ?, updated_at = ? WHERE id = ?`
  ).bind(checked, nowIso(), id).run();
  return jsonResp({ ok: true }, env);
}

async function listAssign(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  const id = body.id as string;
  if (!id) return jsonResp({ ok: false, error: "id required" }, env, 400);
  const retailerId = (body.retailerId as string) ?? null;
  const aisleId    = (body.aisleId as string) ?? null;
  await env.DB.prepare(
    `UPDATE list_items SET retailer_id = ?, aisle_id = ?, updated_at = ? WHERE id = ?`
  ).bind(retailerId, aisleId, nowIso(), id).run();
  return jsonResp({ ok: true }, env);
}

async function listUpdate(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  const id = body.id as string;
  if (!id) return jsonResp({ ok: false, error: "id required" }, env, 400);

  // Whitelist fields
  const allowed = ["name", "checked", "retailer_id", "aisle_id", "fulfilment_mode", "online_order_link", "external_status"];
  const sets: string[] = [];
  const binds: unknown[] = [];
  for (const k of allowed) {
    if (k in body) {
      sets.push(`${k} = ?`);
      let v = body[k];
      if (k === "checked") v = v ? 1 : 0;
      binds.push(v);
    }
  }
  if (!sets.length) return jsonResp({ ok: false, error: "no fields to update" }, env, 400);
  sets.push(`updated_at = ?`);
  binds.push(nowIso(), id);
  await env.DB.prepare(`UPDATE list_items SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
  return jsonResp({ ok: true }, env);
}

async function listDelete(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  const id = body.id as string;
  if (!id) return jsonResp({ ok: false, error: "id required" }, env, 400);
  await env.DB.prepare(`DELETE FROM list_items WHERE id = ?`).bind(id).run();
  return jsonResp({ ok: true }, env);
}

async function listExternalStatus(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  const sourceActionId = body.source_action_id as string;
  const status = body.status as string;
  const itemName = body.item_name as string | undefined;
  if (!sourceActionId || !status) {
    return jsonResp({ ok: false, error: "source_action_id and status required" }, env, 400);
  }
  const isComplete = ["delivered", "completed", "bought"].includes(status);
  let q = `UPDATE list_items SET external_status = ?, ${isComplete ? "checked = 1, " : ""} updated_at = ? WHERE source_action_id = ?`;
  const binds: unknown[] = [status, nowIso(), sourceActionId];
  if (itemName) { q += ` AND LOWER(name) = LOWER(?)`; binds.push(itemName); }
  const result = await env.DB.prepare(q).bind(...binds).run();
  return jsonResp({ ok: true, updated: result.meta?.changes ?? 0 }, env);
}

// ─────────────────────────────────────────────────────────────────────────
// Pre-Do ingest
// ─────────────────────────────────────────────────────────────────────────
async function fromPreDo(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  const inboxId  = body.inboxId  as string;
  const actionId = body.actionId as string;
  const title    = (body.title as string) || "";
  const fulfilmentMode = ((body.fulfilmentMode as string) || "in_store") === "online" ? "online" : "in_store";
  const onlineOrderLink = (body.onlineOrderLink as string) || null;
  const overrideRetailer = (body.retailerId as string) || null;

  let items: string[];
  if (Array.isArray(body.items) && body.items.length > 0) {
    items = (body.items as unknown[]).map(x => String(x)).filter(Boolean);
  } else if (title) {
    items = [title];
  } else {
    return jsonResp({ ok: false, error: "no items in payload" }, env, 400);
  }

  const insertedIds: string[] = [];
  const now = nowIso();

  for (const rawName of items) {
    const trimmed = rawName.trim();
    if (!trimmed) continue;

    let productId: string | null = null;
    let canonicalName = trimmed;
    let retailerId: string | null = overrideRetailer;
    let aisleId: string | null = null;

    const lookup = await env.DB.prepare(
      `SELECT p.id AS product_id, p.name,
              l.retailer_id, l.aisle_id, l.is_primary
       FROM products p
       LEFT JOIN product_locations l ON l.product_id = p.id
       WHERE LOWER(p.name) = LOWER(?)
       ORDER BY l.is_primary DESC, l.retailer_id
       LIMIT 1`
    ).bind(trimmed).first<{ product_id: string; name: string; retailer_id: string | null; aisle_id: string | null }>();

    if (lookup) {
      productId = lookup.product_id;
      canonicalName = lookup.name;
      // If caller didn't override the retailer, use the matched primary
      if (!retailerId) retailerId = lookup.retailer_id;
      // Only use aisle if same retailer (otherwise look up aisle for that retailer)
      if (retailerId === lookup.retailer_id) aisleId = lookup.aisle_id;
    }

    // If retailerId is set but aisle not yet (e.g. overridden retailer or online mode), try to find one
    if (retailerId && !aisleId && fulfilmentMode === "in_store" && productId) {
      const loc = await env.DB.prepare(
        `SELECT aisle_id FROM product_locations WHERE product_id = ? AND retailer_id = ?`
      ).bind(productId, retailerId).first<{ aisle_id: string | null }>();
      if (loc?.aisle_id) aisleId = loc.aisle_id;
    }

    // Online mode: no aisle
    if (fulfilmentMode === "online") aisleId = null;

    // If still no retailer, fall back to "other"
    if (!retailerId) retailerId = "other";

    const id = uuid();
    await env.DB.prepare(
      `INSERT INTO list_items
         (id, name, product_id, retailer_id, aisle_id, fulfilment_mode, online_order_link,
          source, source_action_id, source_inbox_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pre-do', ?, ?, ?, ?)`
    ).bind(id, canonicalName, productId, retailerId, aisleId, fulfilmentMode,
           onlineOrderLink, actionId, inboxId, now, now).run();
    insertedIds.push(id);
  }

  return jsonResp({ ok: true, inserted: insertedIds.length, ids: insertedIds }, env, 201);
}

// ─────────────────────────────────────────────────────────────────────────
// Admin CRUD
// ─────────────────────────────────────────────────────────────────────────
const ADMIN_SCHEMA: Record<string, { table: string; fields: string[]; defaultIdPrefix?: string }> = {
  retailers: {
    table: "retailers",
    fields: ["id", "name", "color", "kind", "online_url_template", "position", "is_default"],
  },
  products: {
    table: "products",
    fields: ["id", "name", "brand", "notes"],
    defaultIdPrefix: "prod-",
  },
  aisles: {
    table: "aisles",
    fields: ["id", "retailer_id", "name", "sub", "position", "kind", "side", "map_x", "map_y", "map_w", "map_h"],
  },
  locations: {
    table: "product_locations",
    fields: ["id", "product_id", "retailer_id", "aisle_id", "indicative_price", "is_primary"],
    defaultIdPrefix: "loc-",
  },
};

async function adminCreate(req: Request, env: Env, resource: string): Promise<Response> {
  const def = ADMIN_SCHEMA[resource];
  if (!def) return jsonResp({ ok: false, error: "Unknown resource" }, env, 400);
  const body = await readJson(req);

  if (!body.id) body.id = def.defaultIdPrefix ? `${def.defaultIdPrefix}${uuid()}` : uuid();

  const cols: string[] = [];
  const placeholders: string[] = [];
  const binds: unknown[] = [];
  for (const f of def.fields) {
    if (f in body) {
      cols.push(f);
      placeholders.push("?");
      binds.push(body[f]);
    }
  }
  if (cols.includes("updated_at") === false && resource !== "aisles") {
    cols.push("updated_at");
    placeholders.push("?");
    binds.push(nowIso());
  }

  await env.DB.prepare(
    `INSERT INTO ${def.table} (${cols.join(", ")}) VALUES (${placeholders.join(", ")})`
  ).bind(...binds).run();
  return jsonResp({ ok: true, id: body.id }, env, 201);
}

async function adminUpdate(req: Request, env: Env, resource: string): Promise<Response> {
  const def = ADMIN_SCHEMA[resource];
  if (!def) return jsonResp({ ok: false, error: "Unknown resource" }, env, 400);
  const body = await readJson(req);
  const id = body.id as string;
  if (!id) return jsonResp({ ok: false, error: "id required" }, env, 400);

  const sets: string[] = [];
  const binds: unknown[] = [];
  for (const f of def.fields) {
    if (f === "id") continue;
    if (f in body) { sets.push(`${f} = ?`); binds.push(body[f]); }
  }
  if (resource !== "aisles") { sets.push(`updated_at = ?`); binds.push(nowIso()); }
  if (!sets.length) return jsonResp({ ok: false, error: "no fields to update" }, env, 400);

  binds.push(id);
  await env.DB.prepare(`UPDATE ${def.table} SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
  return jsonResp({ ok: true }, env);
}

async function adminDelete(req: Request, env: Env, resource: string): Promise<Response> {
  const def = ADMIN_SCHEMA[resource];
  if (!def) return jsonResp({ ok: false, error: "Unknown resource" }, env, 400);
  const body = await readJson(req);
  const id = body.id as string;
  if (!id) return jsonResp({ ok: false, error: "id required" }, env, 400);
  await env.DB.prepare(`DELETE FROM ${def.table} WHERE id = ?`).bind(id).run();
  return jsonResp({ ok: true }, env);
}
