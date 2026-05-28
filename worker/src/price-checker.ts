/**
 * Price-checking agent (scaffold).
 *
 * Triggered by a Cloudflare Workers cron (configured in wrangler.toml). When
 * PRICE_CHECK_MODE != "on" it logs and returns immediately. When on, scans
 * product_locations rows whose indicative_price_updated_at is older than
 * PRICE_REFRESH_DAYS (or null) and asks the LLM for an updated indicative
 * price for each.
 *
 * Phase 1 (this commit): plumbing only. The LLM is asked to estimate prices
 * from product knowledge — no live retailer scraping yet. Estimates are
 * marked indicative_price_updated_at = now so we know when they were last
 * refreshed.
 *
 * Phase 2 (later): replace the estimator with a real retailer fetcher
 * (PnP / Checkers / Woolworths scraping or APIs).
 */

import { callLlmWithTool, LlmEnv } from "./llm";

export interface PriceCheckEnv extends LlmEnv {
  DB: D1Database;
  PRICE_CHECK_MODE?: string;
  PRICE_REFRESH_DAYS?: string;
  RESOLVER_MODEL?: string;  // reuse the same model
}

interface PendingRow {
  loc_id: string;
  product_id: string;
  product_name: string;
  retailer_id: string;
  retailer_name: string;
  retailer_kind: string;
  current_price: number | null;
  updated_at: string | null;
}

const MAX_PER_RUN = 25; // cap so a cron tick can't blow the request budget

export async function checkPrices(env: PriceCheckEnv): Promise<{ scanned: number; updated: number; skipped: number; errors: number; }> {
  const result = { scanned: 0, updated: 0, skipped: 0, errors: 0 };

  if ((env.PRICE_CHECK_MODE || "off").toLowerCase() !== "on") {
    console.log("price-check: PRICE_CHECK_MODE=off — skipping");
    return result;
  }
  const refreshDays = parseInt(env.PRICE_REFRESH_DAYS || "30", 10) || 30;
  const cutoff = new Date(Date.now() - refreshDays * 86400_000).toISOString().replace(/\.\d+Z$/, "Z");

  const { results } = await env.DB.prepare(
    `SELECT l.id AS loc_id, l.product_id, p.name AS product_name,
            l.retailer_id, r.name AS retailer_name, r.kind AS retailer_kind,
            l.indicative_price AS current_price,
            l.indicative_price_updated_at AS updated_at
     FROM product_locations l
     JOIN products  p ON p.id = l.product_id
     JOIN retailers r ON r.id = l.retailer_id
     WHERE COALESCE(p.review_status,'') = ''
       AND (l.indicative_price_updated_at IS NULL OR l.indicative_price_updated_at < ?)
     ORDER BY l.indicative_price_updated_at IS NULL DESC, l.indicative_price_updated_at ASC
     LIMIT ?`
  ).bind(cutoff, MAX_PER_RUN).all<PendingRow>();

  const rows = (results || []) as PendingRow[];
  result.scanned = rows.length;
  if (!rows.length) return result;

  const model = env.RESOLVER_MODEL || "deepseek-chat";
  for (const row of rows) {
    try {
      const guess = await estimatePrice(env, model, row);
      if (guess == null || guess.price == null) { result.skipped++; continue; }
      const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
      await env.DB.prepare(
        `UPDATE product_locations
         SET indicative_price = ?, indicative_price_updated_at = ?, updated_at = ?
         WHERE id = ?`
      ).bind(guess.price, now, now, row.loc_id).run();
      result.updated++;
    } catch (e) {
      console.warn("price-check: error on", row.loc_id, e);
      result.errors++;
    }
  }
  return result;
}

interface PriceEstimate {
  price: number | null;
  rationale?: string;
}

async function estimatePrice(env: PriceCheckEnv, model: string, row: PendingRow): Promise<PriceEstimate | null> {
  const system =
    "You estimate indicative South African retail prices in Rand (ZAR) for a " +
    "single product at a specific retailer. Be conservative — when you don't " +
    "know, return price=null. Do not invent numbers for unfamiliar products.\n\n" +
    "Return a single estimate or null. Pricing context: prices are everyday " +
    "shelf prices, not promotional. Round to the nearest Rand for items < R100, " +
    "to the nearest R5 above that.";

  const userText =
    `Product:  ${row.product_name}\n` +
    `Retailer: ${row.retailer_name} (${row.retailer_kind})\n` +
    `Previous indicative price: ${row.current_price == null ? "n/a" : "R" + row.current_price}\n` +
    `Last priced: ${row.updated_at || "never"}\n` +
    `Estimate the current indicative shelf price in Rand, or null if unsure.`;

  const schema = {
    type: "object",
    properties: {
      price:     { type: ["number", "null"], description: "Rand. Null if unsure." },
      rationale: { type: "string" }
    },
    required: ["price"]
  };

  return await callLlmWithTool<PriceEstimate>(env, {
    model,
    system,
    userText,
    toolName: "estimate_price",
    toolDescription: "Return an indicative shelf price for the product/retailer.",
    toolSchema: schema,
    maxTokens: 150
  });
}
