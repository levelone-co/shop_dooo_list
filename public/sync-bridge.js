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

import { SyncEngine } from "./vendor/dooo-core/index.js";

const g = window;

const engine = new SyncEngine({
  name: "shopdooo",
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
