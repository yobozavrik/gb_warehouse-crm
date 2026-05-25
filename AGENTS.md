# Warehouse CRM для хімії (замовлення ГБ)

## Goal
- Build a full warehouse management CRM for household chemicals with Telegram-bot ordering, operator dashboard, справочники (products, suppliers), and накладные (receipts) — all data from Poster API

## Constraints & Preferences
- Supabase self-hosted at `https://supabase.dmytrotovstytskyi.online`
- All business logic in PostgreSQL (triggers, functions, RPCs)
- Frontend: Next.js 16 (App Router, TypeScript, Tailwind CSS)
- No separate backend – Supabase SDK + RPCs directly
- User runs migrations manually via Supabase Studio SQL Editor
- All pages use dynamic routes with sidebar navigation
- UI language: Ukrainian
- Chart library: recharts installed
- Poster API token: `526379:9669514747b2a48f329dac43b6997c42`
- Telegram bot token: `8927414072:AAEH1WSyXia2TqWsnYXwSY0UsT_6aKtxMXE`
- Webhook secret token: `63cf9308835af505ed26ade2cb0cf6dd741924d0f7227beb93a6a252e221795c`

## Progress
### Done
- Migrations #001–#016 applied (all 16 in Supabase Studio)
- All 38 Poster storages imported to `warehouses` (poster_storage_ids 2–57, full match)
- Security audit completed — 4 critical, 4 high, multiple medium/low issues found and fixed
- Security fixes applied and committed: `src/lib/supabase.ts` (no hardcoded key), `.env` (TELEGRAM_WEBHOOK_SECRET), webhook `route.ts` (rate limiting, secret token, sanitization)
- Read-only RPCs changed from `SECURITY DEFINER` to `SECURITY INVOKER` (migration #016)
- **Migration #016 applied** — Cartesian multiplication fix (LATERAL subqueries), FK constraints (RESTRICT/SET NULL), JSONB return types, p_page validation, SECURITY INVOKER grants
- **Full project documentation created** in `docs/`:
  - `docs/index.md` — overview, structure, migrations table, key decisions
  - `docs/clean-architecture.md` — 4-layer architecture with Mermaid diagrams (components, sequence, security model, lifecycle)
  - `docs/database-erd.md` — ERD for all 30+ tables, relationships, 8 views, FK constraints, state diagrams
  - `docs/openapi.yaml` — OpenAPI 3.0 spec for all 35+ RPCs + Telegram webhook + direct table endpoints
  - `docs/API.md` — API documentation with authentication, table access, all RPCs, curl examples
  - `docs/ARCHITECTURE.md` — C4 diagrams, domain model, ERD, business processes, migration timeline
- **Detailed code review completed** — 10 critical, 20 high, 15 medium, 12 low issues found
- **PLAN.md created** with all fixes prioritized in phases
- **Iterative fix loop** — 2 passes, final score **9/10**
- **All CRITICAL bugs fixed**:
  - C1: edit form `key` → `fieldKey` prop (form now updates state)
  - C2: mojibake `'С€С‚'` → `'шт'` in api.ts unit fallback
  - C4: custom quantity flow preserves existing items (was dropping them)
  - C5–C10: Cartesian multiplication in 4 views/RPCs + NULL traps + FK constraints
- **All HIGH issues fixed**:
  - H1–H9: 8 pages rewritten from Russian to Ukrainian (orders, shipments, transfers, write-offs, inventory, audit, products/new, receipts/new)
  - H10: receipts/new now uses batch INSERT instead of N+1 per line
  - H11: `ml-13` → `ml-12` invalid Tailwind class
  - H12–H16: SQL grants, old CHECK constraint dropped, `r.order_detail` granted to anon
- **All MEDIUM + LOW issues fixed**:
  - M3: dead imports removed from products/new
  - M4: infinite loading on invalid product ID fixed
  - M5: `Warehouse.type` union updated in types.ts
  - M6: receipts page typed with `Receipt` interface
  - L4: `safeNum()` moved after imports in edit page
  - L6: dead `@custom-variant dark` removed from globals.css
  - L11: consistent `style: 'decimal' + ' ₴'` format in warehouses/shops
  - Plus 8 more UX/cosmetic fixes from re-review (stockLevel sum, unused totalAmount, TYPE_LABELS, audit error handling, etc.)
- All changes built and verified (`npm run build`)
- All changes committed

### Blocked
- **Telegram webhook URL not set** — was incorrectly set to `operator-v2-2.vercel.app`, then deleted; project is in local development (port 3001), needs public URL or tunnel to receive Telegram updates. **Must configure with `secret_token`**:
  ```bash
  curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook?url=<URL>/api/telegram/webhook -F "secret_token=63cf9308835af505ed26ade2cb0cf6dd741924d0f7227beb93a6a252e221795c"
  ```
- **14 цехів/складів (id 25–38) без `parent_shop_id`** — потрібно заповнити вручну UPDATE-ами
- **Тестування Telegram бота** — /setup → заповнити профіль → /order

## Key Decisions
- Custom schema `household_chemicals` — not in default PostgREST search path; requires `ALTER ROLE authenticator SET pgrst.db_schemas TO 'public, household_chemicals'`
- **Read-only RPCs** use `SECURITY INVOKER` (RLS applies), write/Telegram RPCs use `SECURITY DEFINER`
- All multi-table aggregate views rewritten with `LATERAL` subqueries (migration #016) to avoid Cartesian multiplication
- Lazy singleton for Supabase client: `getSupabase()` + Proxy
- `getServiceSupabase()` throws if env var missing (no hardcoded fallback)
- Webhook handler: single `route.ts` file with all bot logic inline, rate limiting (500ms/user), input sanitization helpers (`safeHTML`, `safeInt`, `safeQuantity`, `safeNum`, `safeItems`)
- UI design uses CSS custom properties (`--color-*`) for consistent brand theming
- Stock badges: 3-tier color scheme — green (normal), amber (at/below min_stock), red (out of stock)
- Suppliers grouped by **product categories** based on delivered products
- `Intl.NumberFormat` must use `style: 'decimal'` + manual currency suffix to avoid hydration mismatch
- Migration #007 superseded by #009 — DO NOT apply (renamed to `007_SUPERSEDED_product_detail_rpc.sql`)
- Migration files exist in `supabase/migrations/` (основне місце для Supabase Studio)

## Next Steps
1. **Заповнити `parent_shop_id`** для цехів 25-38 (UPDATE запитом)
2. **Налаштувати Telegram webhook** — публічний URL (ngrok, Vercel, або tunnel) + `secret_token` при `setWebhook`
3. **Протестувати Telegram бота** — /setup → заповнити профіль → /order
4. **Далі**: списання, переміщення між складами, сторінка замовлень, адмінка редагування прив'язок

## Critical Context
- Supabase anon key: `eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc2MzI0OTcwMCwiZXhwIjo0OTE4OTIzMzAwLCJyb2xlIjoiYW5vbiJ9.PJ-feVraUpYtvUWqDYrNGafyNRRqCSCM35tAVQCrztw`
- Service role key: `eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc2MzI0OTcwMCwiZXhwIjo0OTE4OTIzMzAwLCJyb2xlIjoic2VydmljZV9yb2xlIn0.QC9C9-CxocHb-jM-lHmXHEjEZV2hCOaSwgfxKLjKoEQ`
- Poster API token: `526379:9669514747b2a48f329dac43b6997c42`
- Telegram bot token: `8927414072:AAEH1WSyXia2TqWsnYXwSY0UsT_6aKtxMXE`
- Webhook secret token: `63cf9308835af505ed26ade2cb0cf6dd741924d0f7227beb93a6a252e221795c`
- `household_chemicals` schema must be added to PostgREST `db_schemas` for `Accept-Profile` header to work
- Dev server runs on port 3001 (port 3000 busy)
- WEBHOOK NOT SET — Telegram has 25+ pending updates queued from previous wrong webhook
- All Poster supply data for product 205 (Касова стрічка 57*60) comes from supplier 164 in Poster → "ФОП Візнюк Т.Й. (Е-СОТА)"; user says this is incorrect (data issue in Poster source)
- 38 warehouses split: 24 shops (type=shop), 6 цехів (type=workshop), 7 складов (type=storage), 1 замовник (type=other)
- Code review score: 9/10 after 2 iterations (57 issues fixed total)

## Relevant Files
- `PLAN.md` — full fix plan with phases and priorities
- `docs/` — full documentation (index, clean architecture, ERD, API, OpenAPI, architecture)
- `016_fix_cartesian_grants_and_integrity.sql` — applied migration
- `warehouse-crm/.env`: All environment variables
- `warehouse-crm/src/lib/api.ts` — mojibake fixed: `'С€С‚'` → `'шт'`
- `warehouse-crm/src/lib/types.ts` — `Warehouse.type` union expanded (+warehouse_type, parent_shop_id, poster_storage_id)
- `warehouse-crm/src/app/api/telegram/webhook/route.ts` — interactive order flow, catalog, onboarding, security
- `warehouse-crm/src/app/products/[id]/edit/page.tsx` — `key` → `fieldKey` prop, `safeNum()` after imports
- `warehouse-crm/src/app/products/[id]/page.tsx` — `isFinite` guard, `stockLevel` sums across warehouses
- `warehouse-crm/src/app/suppliers/[id]/page.tsx` — invalid ID handling, `rel="noopener noreferrer"`
- `warehouse-crm/src/app/receipts/new/page.tsx` — Ukrainian + batch INSERT (no N+1)
- `warehouse-crm/src/app/receipts/page.tsx` — typed with `Receipt`, no dead `totalAmount`
- `warehouse-crm/src/app/warehouses/page.tsx` — `TYPE_LABELS` with shop/workshop/storage/other
- `warehouse-crm/src/app/audit/page.tsx` — async/await with cleanup + error handling
- `warehouse-crm/src/app/globals.css` — dead `@custom-variant dark` removed
- `warehouse-crm/scripts/fetch_poster_supplies.mjs`: Script to fetch Poster supplies and generate migration SQL
