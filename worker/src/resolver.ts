/**
 * Smart resolver agent.
 *
 * Flow (called from addItemToList in src/index.ts):
 *   1. Regex prefix parse to split off any "N item" / "Nx item" quantity.
 *   2. Exact catalog match on the cleaned name (case-insensitive).
 *        → HIGH confidence → use directly, no AI call.
 *   3. Otherwise hand off to the LLM with a compact catalog snapshot:
 *        → action="match" : pre-existing product_id we should use
 *        → action="create": real product the catalog is missing; we auto-create
 *                           with review_status="pending" so a human can confirm
 *        → action="skip"  : ambiguous; caller falls through to the "Other"
 *                           catch-all retailer.
 *   4. On LLM error or absent API key, fall back to the strict resolver's
 *     best guess (which becomes the existing plural/singular path).
 *
 * The resolver does NOT mutate list_items itself; it only enriches the data
 * the caller will use to insert. Auto-create runs here because it's atomic
 * (one row, no downstream coupling).
 */

import { callLlmWithTool, LlmEnv } from "./llm";

export interface ResolverEnv extends LlmEnv {
  DB: D1Database;
  RESOLVER_AI_MODE?: string;   // "on" | "off"
  RESOLVER_MODEL?: string;     // e.g. "deepseek-chat"
}

export interface ResolverResult {
  /** Quantity to apply for this item, if the resolver split one off the name. */
  quantity?: number;
  /** Canonical name for the item — what to write to list_items.name. */
  name: string;
  /** Resolved product, if matched. null if no match. */
  product_id?: string | null;
  /** Resolved retailer slug (e.g. "checkers"); null if no opinion. */
  retailer_id?: string | null;
  /** Resolved aisle (only meaningful when retailer is in-store). */
  aisle_id?: string | null;
  /** Brand / size / tags / notes from product defaults or AI inference. */
  brand?: string | null;
  size?: string | null;
  tags?: string | null;
  notes?: string | null;
  /** Diagnostic source: which path produced this result. */
  source: "strict-exact" | "ai-match" | "ai-create" | "ai-skip" | "ai-error" | "strict-fallback";
  /** True when the resolver created a new product row. */
  createdProduct?: boolean;
}

// ─── 1. Prefix parse ───────────────────────────────────────────────────
const PREFIX_RE = /^(\d+)\s*x?\s+(.+)$/i;

export function parseQuantityPrefix(input: string): { qty?: number; name: string } {
  const trimmed = input.trim();
  const m = trimmed.match(PREFIX_RE);
  if (!m) return { name: trimmed };
  const q = parseInt(m[1], 10);
  const rest = m[2].trim();
  if (q > 0 && q < 1000 && rest.length > 1) return { qty: q, name: rest };
  return { name: trimmed };
}

// ─── 2. Strict exact match ─────────────────────────────────────────────
interface StrictMatch {
  product_id: string;
  canonical_name: string;
  default_brand: string | null;
  default_size: string | null;
  default_quantity: number | null;
  default_notes: string | null;
  default_tags: string | null;
  default_retailer_id: string | null;
  loc_retailer_id: string | null;
  loc_aisle_id: string | null;
}

const STRICT_SQL = `
  SELECT p.id AS product_id, p.name AS canonical_name,
         p.default_brand, p.default_size, p.default_quantity,
         p.default_notes, p.default_tags, p.default_retailer_id,
         l.retailer_id AS loc_retailer_id, l.aisle_id AS loc_aisle_id
  FROM products p
  LEFT JOIN product_locations l ON l.product_id = p.id
  WHERE LOWER(p.name) = LOWER(?)
  ORDER BY l.is_primary DESC, l.retailer_id
  LIMIT 1
`;

async function strictExact(env: ResolverEnv, name: string): Promise<StrictMatch | null> {
  return await env.DB.prepare(STRICT_SQL).bind(name).first<StrictMatch>();
}

// ─── 3. AI resolver ────────────────────────────────────────────────────
interface CatalogSnapshotRow {
  product_id: string;
  name: string;
  default_retailer_id: string | null;
  primary_retailer_id: string | null;
}

async function loadCatalogSnapshot(env: ResolverEnv): Promise<CatalogSnapshotRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT p.id AS product_id, p.name, p.default_retailer_id,
            (SELECT retailer_id FROM product_locations WHERE product_id = p.id AND is_primary = 1 LIMIT 1) AS primary_retailer_id
     FROM products p
     WHERE COALESCE(p.review_status, '') <> 'rejected'
     ORDER BY p.name`
  ).all<CatalogSnapshotRow>();
  return results || [];
}

interface RetailerSnapshotRow {
  id: string;
  name: string;
  kind: string;
}

async function loadRetailerSnapshot(env: ResolverEnv): Promise<RetailerSnapshotRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, name, kind FROM retailers ORDER BY position`
  ).all<RetailerSnapshotRow>();
  return results || [];
}

interface AiResolverOutput {
  action: "match" | "create" | "skip";
  product_id?: string;            // for match
  name?: string;                   // for create
  quantity?: number;
  retailer_id?: string | null;
  aisle_id?: string | null;
  brand?: string | null;
  size?: string | null;
  tags?: string | null;
  notes?: string | null;
  rationale?: string;
}

async function aiResolve(
  env: ResolverEnv,
  rawInput: string,
  parsedQty: number | undefined
): Promise<AiResolverOutput | null> {
  if (env.RESOLVER_AI_MODE !== "on") return null;

  const model = env.RESOLVER_MODEL || "deepseek-chat";
  const catalog = await loadCatalogSnapshot(env);
  const retailers = await loadRetailerSnapshot(env);

  const catalogText = catalog
    .map(c => `  ${c.product_id}: "${c.name}"${c.default_retailer_id ? ` [default:${c.default_retailer_id}]` : c.primary_retailer_id ? ` [primary:${c.primary_retailer_id}]` : ""}`)
    .join("\n");
  const retailerText = retailers
    .map(r => `  ${r.id} (${r.kind}): ${r.name}`)
    .join("\n");

  const system =
    "You resolve dictated shopping items against a curated catalog.\n\n" +
    "Given a user's raw input, return ONE of three actions:\n" +
    "  • match  — the item maps to an EXISTING product in the catalog below. Return its product_id.\n" +
    "  • create — the item is clearly a real, common product but the catalog is missing it. " +
                "Return a sensible canonical name (Title Case, singular form, e.g. \"Soy Milk\" not \"6 Soy Milks\") " +
                "and your best guess of which retailer typically sells it from the retailer list below.\n" +
    "  • skip   — the input is too ambiguous to be sure. The system will route it to a catch-all 'Other'.\n\n" +
    "Rules:\n" +
    "  • Always strip leading quantity prefixes from the name (\"6 Soy Milks\" → name=\"Soy Milk\", quantity=6).\n" +
    "  • Singular form for canonical names — \"Eggs\" stays plural where conventional, otherwise drop the trailing s.\n" +
    "  • For an in-store retailer, you can suggest an aisle_id ONLY if you're confident; otherwise leave it blank.\n" +
    "  • Be conservative with create: only when you'd bet money this is a real product.\n\n" +
    "Catalog (product_id: name):\n" + catalogText + "\n\n" +
    "Retailers (id: name):\n" + retailerText;

  const userText = `Input: ${JSON.stringify(rawInput)}` +
    (parsedQty ? `\nA prefix-parser already extracted quantity=${parsedQty}.` : "");

  const schema = {
    type: "object",
    properties: {
      action:      { type: "string", enum: ["match", "create", "skip"] },
      product_id:  { type: "string", description: "Required when action=match. Must be one of the catalog ids." },
      name:        { type: "string", description: "Required when action=create. Canonical name, Title Case." },
      quantity:    { type: "number", description: "Integer ≥ 1. Default 1 if user didn't say." },
      retailer_id: { type: "string", description: "Retailer slug from the list (e.g. 'checkers')." },
      aisle_id:    { type: "string", description: "Aisle slug for the resolved retailer, if confident. Optional." },
      brand:       { type: "string" },
      size:        { type: "string", description: "e.g. \"1kg\", \"4 pack\"" },
      tags:        { type: "string", description: "Comma-separated. e.g. \"sixty60\"" },
      notes:       { type: "string" },
      rationale:   { type: "string", description: "One sentence on why this action." }
    },
    required: ["action"]
  };

  try {
    return await callLlmWithTool<AiResolverOutput>(env, {
      model,
      system,
      userText,
      toolName: "resolve_item",
      toolDescription: "Decide how to route an arriving shopping item.",
      toolSchema: schema,
      maxTokens: 400
    });
  } catch (e) {
    console.warn("resolver: LLM error", e);
    return null;
  }
}

// ─── 4. Top-level resolver entry point ─────────────────────────────────
function smartTitleCase(s: string): string {
  if (!s) return s;
  const t = s.trim();
  if (!t) return t;
  const allLower = t === t.toLowerCase();
  const allUpper = t === t.toUpperCase();
  if (!allLower && !allUpper) return t;
  return t.toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, (_m, sep, ch) => sep + ch.toUpperCase());
}

/**
 * Resolve an arriving item to {name, product_id, retailer_id, ...}. Returns
 * source="strict-exact" or "strict-fallback" when AI mode is off.
 */
export async function resolveItem(env: ResolverEnv, rawInput: string): Promise<ResolverResult> {
  // 1) Prefix parse
  const { qty, name: parsedName } = parseQuantityPrefix(rawInput);
  const cleanedName = smartTitleCase(parsedName);

  // 2) Strict exact (case-insensitive on raw cleaned name)
  const exact = await strictExact(env, cleanedName);
  if (exact) {
    return {
      quantity: qty,
      name: exact.canonical_name,
      product_id: exact.product_id,
      retailer_id: exact.default_retailer_id || exact.loc_retailer_id || null,
      aisle_id: exact.loc_aisle_id,
      brand: exact.default_brand,
      size: exact.default_size,
      tags: exact.default_tags,
      notes: exact.default_notes,
      source: "strict-exact"
    };
  }

  // 3) AI handoff (skipped when mode is off)
  const ai = await aiResolve(env, rawInput, qty);

  if (!ai) {
    // AI off or errored — fall back to plural/singular strict pass so we
    // still benefit from light fuzzy without an LLM call.
    const fallback =
      (cleanedName.length > 3 && cleanedName.toLowerCase().endsWith("s")
        ? await strictExact(env, cleanedName.slice(0, -1))
        : null) ||
      (!cleanedName.toLowerCase().endsWith("s")
        ? await strictExact(env, cleanedName + "s")
        : null);
    if (fallback) {
      return {
        quantity: qty,
        name: fallback.canonical_name,
        product_id: fallback.product_id,
        retailer_id: fallback.default_retailer_id || fallback.loc_retailer_id || null,
        aisle_id: fallback.loc_aisle_id,
        brand: fallback.default_brand,
        size: fallback.default_size,
        tags: fallback.default_tags,
        notes: fallback.default_notes,
        source: "strict-fallback"
      };
    }
    return { name: cleanedName, quantity: qty, source: "strict-fallback" };
  }

  // 4a) AI: match → look up the suggested product and use its defaults
  if (ai.action === "match" && ai.product_id) {
    const matched = await env.DB.prepare(STRICT_SQL.replace("LOWER(p.name) = LOWER(?)", "p.id = ?"))
      .bind(ai.product_id).first<StrictMatch>();
    if (matched) {
      return {
        quantity: ai.quantity ?? qty,
        name: matched.canonical_name,
        product_id: matched.product_id,
        retailer_id: ai.retailer_id ?? matched.default_retailer_id ?? matched.loc_retailer_id ?? null,
        aisle_id: ai.aisle_id ?? matched.loc_aisle_id ?? null,
        brand: ai.brand ?? matched.default_brand,
        size: ai.size ?? matched.default_size,
        tags: ai.tags ?? matched.default_tags,
        notes: ai.notes ?? matched.default_notes,
        source: "ai-match"
      };
    }
    // Fall through to skip if the LLM picked a stale id
  }

  // 4b) AI: create → spawn a new product with review_status="pending"
  if (ai.action === "create" && ai.name) {
    const canonical = smartTitleCase(ai.name);
    // Belt-and-braces: re-check the catalog for an exact match — the LLM may
    // hallucinate a "create" when the product already exists.
    const dup = await strictExact(env, canonical);
    if (dup) {
      return {
        quantity: ai.quantity ?? qty,
        name: dup.canonical_name,
        product_id: dup.product_id,
        retailer_id: ai.retailer_id ?? dup.default_retailer_id ?? dup.loc_retailer_id ?? null,
        aisle_id: ai.aisle_id ?? dup.loc_aisle_id ?? null,
        brand: ai.brand ?? dup.default_brand,
        size: ai.size ?? dup.default_size,
        tags: ai.tags ?? dup.default_tags,
        notes: ai.notes ?? dup.default_notes,
        source: "ai-match"
      };
    }

    const newId = "prod-" + crypto.randomUUID();
    const nowIso = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    await env.DB.prepare(
      `INSERT INTO products
         (id, name, default_brand, default_size, default_tags, default_notes,
          default_retailer_id, created_by, review_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ai', 'pending', ?, ?)`
    ).bind(newId, canonical,
           ai.brand ?? null, ai.size ?? null, ai.tags ?? null, ai.notes ?? null,
           ai.retailer_id ?? null, nowIso, nowIso).run();

    // If the LLM proposed a retailer + aisle, also seed a product_location.
    if (ai.retailer_id) {
      try {
        await env.DB.prepare(
          `INSERT INTO product_locations
             (id, product_id, retailer_id, aisle_id, is_primary, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, ?)`
        ).bind("loc-" + crypto.randomUUID(), newId, ai.retailer_id, ai.aisle_id ?? null, nowIso, nowIso).run();
      } catch (e) {
        console.warn("resolver: failed to seed product_location", e);
      }
    }

    return {
      quantity: ai.quantity ?? qty,
      name: canonical,
      product_id: newId,
      retailer_id: ai.retailer_id ?? null,
      aisle_id: ai.aisle_id ?? null,
      brand: ai.brand ?? null,
      size: ai.size ?? null,
      tags: ai.tags ?? null,
      notes: ai.notes ?? null,
      source: "ai-create",
      createdProduct: true
    };
  }

  // 4c) AI: skip → caller falls to Other
  return {
    quantity: ai.quantity ?? qty,
    name: cleanedName,
    source: "ai-skip"
  };
}
