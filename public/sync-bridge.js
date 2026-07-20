// sync-bridge.js — glue between shop.dooo's classic app script and @dooo/core.
// Loaded as <script type="module">. Exposes window.ShopSync.
//
// Stage 3 for shop.dooo (which had NO offline support): two additions, both
// additive so the online path is unchanged.
//   1. Offline READ — a snapshot of {retailers, catalog, items} is saved to
//      IndexedDB after each successful load; if a load fails (offline), the app
//      hydrates from it so it opens with your last list + catalog.
//   2. Durable MUTATIONS — a list op (add/check/delete) that fails offline is
//      queued in an outbox and replayed on reconnect / Background Sync, so a
//      tick or delete made underground is never lost.
//
// The engine's outbox is used as a generic OPERATION log here (not upsert-by-
// state): each queued record is { id, op:{ path, body } } and the transport
// replays it through the app's own global api(). Server-side idempotency keeps
// replays safe.

import {
  SyncEngine, openDB, decodeJwtClaims,
  createSessionStore, consumeMagicLinkLanding, mountSignIn, renewIfStale,
} from "./vendor/dooo-core/index.js";

const g = window;
const DOOO_API = "https://dooo-api.apps-8ec.workers.dev"; // /auth/* live on dooo-api, not the shop worker

// ── Stage 4: standalone session (magic link) → set config.token = JWT, then
// boot. In-shell copies already got their token from the dash bridge. ──
if (g.__shopStandalone) {
  let authIdb = null;
  try { authIdb = await openDB("shopdooo-auth"); } catch { /* private mode → legacy path */ }
  if (authIdb) {
    const store = createSessionStore(authIdb);
    let session = await consumeMagicLinkLanding(DOOO_API, store);
    if (!session) session = await store.load();

    // Standalone, not signed in → require magic-link sign-in. Legacy paste-tokens
    // are retired: a stale token (e.g. the old shop-dooo-api SHOPWISE_AUTH_TOKEN)
    // must NOT skip sign-in — dooo-api would reject it and every request 401s.
    // Strip it so config.token can't ride a dead credential, then sign in.
    if (!session) {
      try {
        const c = JSON.parse(localStorage.getItem("shopwise.config.v1") || "{}");
        if (c && c.token) { delete c.token; localStorage.setItem("shopwise.config.v1", JSON.stringify(c)); }
      } catch {}
      await mountSignIn({ apiBase: DOOO_API, redirect: location.origin + "/", sessionStore: store, appName: "shop dooo" });
      location.reload();
    } else {
      g.__applyShopSession(session);
      renewIfStale(DOOO_API, session).then((s) => s && s.jwt !== session.jwt && store.save(s)).catch(() => {});
      g.__shopBoot();
    }
  } else {
    g.__shopBoot(); // no IDB → legacy/paste-token path
  }
}

// Scope the engine's local store per household (best-effort from the current
// token; server-side scoping is the real isolation boundary).
const scope = (() => {
  try { return decodeJwtClaims((g.__shopConfig && g.__shopConfig().token) || "")?.hh || null; } catch { return null; }
})();

const engine = new SyncEngine({
  name: "shopdooo",
  scope,
  pollMs: 0,
  transport: {
    pull: async () => [],
    push: async (records) => {
      // Replay in queue order. A NETWORK error aborts (keep the whole batch for
      // the next retry). A server/client error (4xx/5xx) is non-retryable, so we
      // drop that op — otherwise one bad op (e.g. deleting an already-deleted id)
      // would poison the queue and block every later mutation forever.
      for (const r of records) {
        try {
          await g.api(r.op.path, { method: "POST", body: r.op.body });
        } catch (err) {
          const offline =
            navigator.onLine === false ||
            /Failed to fetch|NetworkError|Load failed|network request failed/i.test((err && err.message) || "");
          if (offline) throw err; // abort → outbox retained → retry later
          console.warn("[ShopSync] dropping un-replayable op", r.op.path, err && err.message);
        }
      }
      return { ok: true };
    },
  },
});

const ready = engine
  .init()
  .then(() => true)
  .catch((e) => {
    console.warn("[ShopSync] IndexedDB unavailable — offline features disabled:", e && e.message);
    return false;
  });

// Offline snapshot (last-good server state) --------------------------------------
async function saveSnapshot(snap) {
  if (!(await ready)) return;
  try { await engine.idb.metaSet("snapshot", { ...snap, savedAt: new Date().toISOString() }); } catch {}
}
async function loadSnapshot() {
  if (!(await ready)) return null;
  try { return await engine.idb.metaGet("snapshot", null); } catch { return null; }
}

// Durable mutation queue ---------------------------------------------------------
async function queueOp(path, body) {
  if (!(await ready)) return false;
  await engine.upsertLocal({ id: crypto.randomUUID(), op: { path, body } });
  await engine.requestBackgroundSync();
  return true;
}

async function drain() {
  if (!(await ready)) return;
  if ((await engine.outbox.size()) === 0) return;
  try {
    await engine.push();
    if (g.onShopDrained) g.onShopDrained();
  } catch {
    /* still offline — leave queued */
  }
}

addEventListener("online", () => drain());
if (navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e && e.data && e.data.type === "dooo-sync") drain();
  });
}

g.ShopSync = { engine, ready, saveSnapshot, loadSnapshot, queueOp, drain };
