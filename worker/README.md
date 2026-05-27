# Shop Wise — Worker API

Cloudflare Worker + D1 backend for the Shop Wise PWA.

## One-time setup

1. **Install deps**
   ```bash
   cd worker
   npm install
   ```

2. **Login to Cloudflare** (opens a browser; free account is fine)
   ```bash
   npx wrangler login
   ```

3. **Create the D1 database**
   ```bash
   npm run db:create
   ```
   Copy the printed `database_id` into `wrangler.toml` (replace `REPLACE_WITH_D1_DATABASE_ID`).

4. **Apply schema and seed (local)**
   ```bash
   npm run db:reset:local
   ```

5. **Generate an auth token** — any random string, save it somewhere safe.
   ```bash
   # local dev: put it in worker/.dev.vars
   cp .dev.vars.example .dev.vars
   # then edit .dev.vars and replace the token

   # production: store as a Worker secret
   npm run secret:token
   ```

6. **Run locally**
   ```bash
   npm run dev
   ```
   Worker is now on http://localhost:8787. Test: `curl http://localhost:8787/api/health`.

7. **Deploy to Cloudflare**
   ```bash
   npm run deploy
   # then push the same schema/seed to the remote D1:
   npm run db:schema
   npm run db:seed
   ```

## Environment

| Var | Where | Purpose |
|---|---|---|
| `SHOPWISE_AUTH_TOKEN` | `.dev.vars` locally, `wrangler secret put` in prod | Bearer token for all writes + Pre-Do integration |
| `ALLOWED_ORIGINS` | `wrangler.toml` `[vars]` | Optional CORS origin allowlist; empty = `*` |

## Routes

All write routes require `Authorization: Bearer $SHOPWISE_AUTH_TOKEN`. See `src/index.ts` for the canonical list. Reads are open.

```
GET    /api/health
GET    /api/retailers
GET    /api/catalog?retailer=<id>
GET    /api/aisles?retailer=<id>
GET    /api/list
GET    /api/products/lookup?name=<text>
POST   /api/list/add
POST   /api/list/check
POST   /api/list/assign
POST   /api/list/update
POST   /api/list/delete
POST   /api/list/external-status
POST   /api/from-pre-do
POST   /api/admin/retailers      PATCH/DELETE
POST   /api/admin/products       PATCH/DELETE
POST   /api/admin/aisles         PATCH/DELETE
POST   /api/admin/locations      PATCH/DELETE
```
