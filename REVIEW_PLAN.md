# Warehouse-CRM — Code Review Findings & Fix Plan

> **Audience:** an autonomous coding agent executing fixes.
> **Reviewer:** Claude Opus 4.7, 2026-05-26.
> **Scope reviewed:** SQL migrations 001/002/013/014/015/016, `src/lib/{api,supabase,types}.ts`, `src/app/api/telegram/webhook/route.ts`, frontend pages (dashboard, orders, receipts/new, products/[id]), env files, git history.

---

## How to use this document

1. Issues are grouped by severity (CRITICAL → HIGH → MEDIUM → LOW) and prefixed with stable IDs (`S1`, `H3`, etc.).
2. Each issue has: **Location**, **Description**, **Root cause**, **Fix**, **Acceptance criteria**.
3. **Execution order is enforced by the dependency graph at the bottom**, not by ID. Read it before starting.
4. When done, append a line under the issue: `**STATUS:** done — <commit-sha> — <one-line note>`. Don't delete the issue.
5. Don't bundle unrelated fixes into one commit. One issue per commit, message format `fix(<area>): <id> <short>` (e.g. `fix(sql): S2 complete_inventory v_diff type`).
6. **Never apply a SQL migration yourself** — write the file under `supabase/migrations/household/NNN_*.sql`, then ask the human to apply it via Supabase Studio. Mark such issues as `**STATUS:** ready for SQL apply — <file>` until the human confirms.
7. After each commit run `npm run build` from `warehouse-crm/` and report the result. If it fails, fix or revert.
8. If an issue's fix changes behavior the human might want to review (e.g. removing webhook_outbox dispatcher), **stop and ask** before committing.

---

## Progress summary (updated 2026-05-26 — pass 2)

| ID  | Status        | Where                                              |
|-----|---------------|----------------------------------------------------|
| S1  | partial       | current files redacted; **git history rewrite + key rotation still pending — human action** |
| S2  | done          | migration 017                                      |
| S3  | done          | migration 017                                      |
| S4  | done          | migration 017                                      |
| S5  | done          | migration 017                                      |
| S6  | done          | receipts/new filter switched to `warehouse_type IN ('storage','other') OR id===1` |
| S7  | done          | migration 020 — atomic `rpc_create_receipt_with_items`; frontend updated |
| S8  | open          | auth strategy decision — human                     |
| H1  | done          | migration 017 (introduced regression R1) + **fixed in migration 019** |
| H2  | done          | migration 017 + `updated_at` fix in migration 019 (R3) |
| H3  | done          | migration 018 + `route.ts` change                  |
| H4  | done          | `setInterval` wrapped in `globalThis.__rateLimitCleanup` guard |
| H5  | done          | `idfCache` keyed by `length:firstId:lastId`        |
| H6  | done          | `getWarehouseForShop()` in bot; used in both `confirmOrder` and `parseGroupOrder` |
| H7  | done          | `safeHTML` now escapes `&` first                   |
| H8  | done          | migration 018 + `route.ts` change; type widened to NUMERIC in 019 (R4) |
| H9  | done          | dashboard, orders, warehouses, shops use `let cancelled` flag |
| H10 | done          | dashboard uses `Intl.NumberFormat('uk-UA', {style:'decimal'})` + ` ₴` |
| H11 | done          | migration 017                                      |
| H12 | done          | migration 017                                      |
| H13 | done          | migration 021 — `p_warehouse_id` defaults to NULL, falls back to `shops.warehouse_id` |
| H14 | done (orders) | `/orders` has page state + prev/next; other pages use direct queries without RPC pagination |
| H15 | done          | migration 019 (partial unique index)               |
| M1  | done          | mojibake comment in api.ts:393 fixed               |
| M2  | done          | onboarding now guards `!text.startsWith('/')`      |
| M3  | done          | webhook catch writes to `telegram_messages_log` via `telegram_log_message` |
| M4  | open          | webhook_outbox dispatcher — decision required      |
| M5  | done          | `л` exclusion rule removed from `extractQty`       |
| M6  | done          | `expandAbbrevs` uses unicode-aware lookahead       |
| M7  | done          | migration 019                                      |
| M8  | done          | migration 019                                      |
| M9  | open          | `any` types in api.ts                              |
| M10 | done          | migration 019                                      |
| M11 | done          | `Warehouse.type` removed from `types.ts`           |
| M12 | done          | `/status` now uses `text.slice(7).trim()`          |
| L*  | open          | all low-priority items                             |

### New SQL files added in pass 2

```
020_rpc_create_receipt.sql              (S7 + L5)
021_telegram_create_order_warehouse_from_shop.sql   (H13)
```

Apply order: 017 → 018 → 019 → 020 → 021. All idempotent.

### Regressions introduced by migration 017 (now fixed)

- **R1.** `ship_order` lost `shipment_number` (NOT NULL), `shop_id` (NOT NULL), the INSERT into `shipment_items`, and the `quantity_shipped` partial-shipment semantics. Restored in migration 019.
- **R2.** Migration 017 granted `EXECUTE` on `update_stock_balance` and `set_initial_stock` to `anon` and `authenticated`. These are low-level stock writers that should only be reached from other SECURITY DEFINER functions. Anon could rewrite arbitrary balances. Revoked in migration 019; granted only to `service_role`.
- **R3.** `confirm_receipt` UPDATE missed `updated_at = NOW()`. Fixed in migration 019.
- **R4.** `rpc_pending_order_add_item` declared `p_quantity INT` but the column it ultimately drives is `NUMERIC(12,3)`. Widened to `NUMERIC(12,3)` in migration 019 (function signature changed → old version dropped).

### Apply order (Supabase Studio SQL Editor)

Migrations 017 and 018 may already be applied. Migration 019 is **compensating** and idempotent — safe to apply on top.

```
017_fix_inventory_atomic_stock_and_audit.sql      (apply if not yet)
018_fix_atomic_pending_and_edit.sql               (apply if not yet)
019_fix_ship_order_grants_audit_indexes.sql       (apply)
```

After applying 019, run the post-apply verification queries listed at the bottom of the file.

---

## CRITICAL

### S1 — Secrets committed to git

**Location:** `AGENTS.md` (both `D:\Химия замолвення ГБ\AGENTS.md` and `warehouse-crm/AGENTS.md`), tracked in git history (commits `086d437`, `a70edd1`, `976ee40`).

**Description:** The file contains, in plaintext: `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `POSTER_TOKEN`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The service role key bypasses RLS — if the repo was ever pushed to a public host or shared, the database is compromised.

**Root cause:** Progress notes were stored alongside code without scrubbing credentials.

**Fix:**
1. **STOP — ask the human first.** Confirm whether the repo was ever pushed to a remote (GitHub, GitLab, internal Git server). The answer changes the urgency, not the action.
2. Have the human rotate all 4 secrets:
   - Supabase: regenerate `service_role` and `anon` keys in Supabase Studio → Settings → API.
   - Telegram bot: `/revoke` via @BotFather, get a new token.
   - Telegram webhook secret: generate a new random hex string, re-register the webhook with `setWebhook`.
   - Poster API: rotate token in Poster admin.
3. Update `warehouse-crm/.env` and `D:\Химия замолвення ГБ\.env` with the new values. **Do not commit either file** (already in `.gitignore`).
4. In `AGENTS.md` (both copies) and `PLAN.md`: replace every secret with `<redacted — see .env>`. Commit the redacted version.
5. Tell the human to run `git filter-repo --replace-text` (or BFG) on the old key strings, then force-push if the repo has a remote. **Do not run filter-repo yourself** — destructive history rewrite is the human's call.

**Acceptance:** `grep -r 'eyJ0eXAi\|AAEH1WSyXia\|526379:96695\|63cf9308835af505' .` from repo root returns nothing. Old keys no longer authenticate against Supabase/Telegram/Poster (the human verifies).

---

### S2 — `complete_inventory` is broken (wrong variable type)

**Location:** `supabase/migrations/household/001_full_warehouse_schema.sql`, lines 768–797.

**Description:** Variable `v_diff` is declared `NUMERIC(12, 3)`, but the `FOR v_diff IN SELECT ii.product_id, (ii.actual_quantity - ii.expected_quantity) AS diff` loop yields a two-column row. The body then references `v_diff.product_id` and passes `v_diff` (the whole record, not `v_diff.diff`) to `update_stock_balance` as the quantity argument. Runtime error: `cannot cast type record to numeric` (or assignment fails before that). Inventory completion never works.

**Root cause:** Mismatched variable type for a multi-column FOR loop.

**Fix:** New migration `017_fix_complete_inventory.sql`:

```sql
CREATE OR REPLACE FUNCTION household_chemicals.complete_inventory(p_inventory_id UUID, p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inventory RECORD;
    v_row RECORD;
BEGIN
    SELECT * INTO v_inventory FROM household_chemicals.inventories WHERE id = p_inventory_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Inventory not found'; END IF;
    IF v_inventory.status != 'in_progress' THEN RAISE EXCEPTION 'Invalid inventory status: %', v_inventory.status; END IF;

    FOR v_row IN
        SELECT ii.product_id, (ii.actual_quantity - ii.expected_quantity) AS diff
        FROM household_chemicals.inventory_items ii
        WHERE ii.inventory_id = p_inventory_id AND ii.actual_quantity <> ii.expected_quantity
    LOOP
        PERFORM household_chemicals.update_stock_balance(
            v_row.product_id, v_inventory.warehouse_id, v_row.diff,
            'inventory_correction', 'inventory', p_inventory_id,
            'Коригування за інвентаризацією', p_user_id
        );
    END LOOP;

    UPDATE household_chemicals.inventories
    SET status = 'completed', completed_by = p_user_id, completed_at = NOW()
    WHERE id = p_inventory_id;
END;
$$;
```

**Acceptance:** Migration applied. Manual test: create an inventory in `in_progress` status with at least one row where `actual_quantity != expected_quantity`, call `complete_inventory(<id>, NULL)`, verify status changed to `completed` and a `stock_movements` row exists with `movement_type = 'inventory_correction'` and correct delta.

---

### S3 — `telegram_get_catalog_text` has nested aggregates

**Location:** `supabase/migrations/household/002_telegram_bot_and_api_layer.sql`, lines 753–794.

**Description:** Outer `STRING_AGG` contains an inner `STRING_AGG` over the same CTE — PostgreSQL rejects this with `aggregate function calls cannot be nested`. The function is not currently called by the webhook handler, so it's latent, but it's dead-on-arrival if anyone invokes it.

**Root cause:** Logic needs two passes — group items by category, then aggregate categories — but was written as a single nested SELECT.

**Fix:** New migration `018_fix_telegram_catalog_text.sql`:

```sql
CREATE OR REPLACE FUNCTION household_chemicals.telegram_get_catalog_text(
    p_category_id INT DEFAULT NULL,
    p_warehouse_id INT DEFAULT 1,
    p_search TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_result TEXT;
BEGIN
    WITH cat AS (
        SELECT
            pc.name AS category_name,
            p.name AS product_name,
            p.unit,
            COALESCE(sb.quantity, 0) AS stock,
            p.min_stock
        FROM household_chemicals.products p
        LEFT JOIN household_chemicals.product_categories pc ON pc.id = p.category_id
        LEFT JOIN household_chemicals.stock_balances sb
          ON sb.product_id = p.id AND sb.warehouse_id = p_warehouse_id
        WHERE p.is_active = true
          AND (p_category_id IS NULL OR p.category_id = p_category_id)
          AND (p_search IS NULL OR p.name ILIKE '%' || p_search || '%')
    ),
    by_cat AS (
        SELECT
            category_name,
            STRING_AGG(
                '  • ' || product_name || ' — ' || stock || ' ' || unit ||
                CASE WHEN min_stock IS NOT NULL AND stock <= min_stock THEN ' ⚠️' ELSE '' END,
                E'\n' ORDER BY product_name
            ) AS lines
        FROM cat
        GROUP BY category_name
    )
    SELECT STRING_AGG(category_name || E':\n' || lines, E'\n\n' ORDER BY category_name)
    INTO v_result
    FROM by_cat;

    RETURN COALESCE(v_result, 'Каталог порожній');
END;
$$;
```

**Acceptance:** Migration applied. `SELECT household_chemicals.telegram_get_catalog_text(NULL, 1, NULL)` returns a non-empty string without error.

---

### S4 — Bot UPSERT fails: no UNIQUE constraint on `telegram_pending_orders`

**Location:**
- Schema: `supabase/migrations/household/002_telegram_bot_and_api_layer.sql:40-55` (table definition; only two separate non-unique indexes exist).
- Usage: `warehouse-crm/src/app/api/telegram/webhook/route.ts` — `upsert({...}, { onConflict: 'telegram_user_id, chat_id' })` at lines ~227, ~357, ~529, ~576.

**Description:** PostgREST translates `onConflict: 'telegram_user_id, chat_id'` into `ON CONFLICT (telegram_user_id, chat_id) DO UPDATE` — which requires a UNIQUE index on those columns. None exists. Every `/start`, `/order`, and onboarding action throws `there is no unique or exclusion constraint matching the ON CONFLICT specification`. New users cannot use the bot at all.

**Root cause:** The constraint was assumed but never created.

**Fix:** New migration `019_telegram_pending_orders_unique.sql`:

```sql
-- Remove duplicates first (keep the most recent row per user+chat)
DELETE FROM household_chemicals.telegram_pending_orders a
USING household_chemicals.telegram_pending_orders b
WHERE a.telegram_user_id = b.telegram_user_id
  AND a.chat_id = b.chat_id
  AND a.created_at < b.created_at;

ALTER TABLE household_chemicals.telegram_pending_orders
  ADD CONSTRAINT uq_telegram_pending_user_chat
  UNIQUE (telegram_user_id, chat_id);
```

**Acceptance:** Migration applied. From a test Telegram account: `/start` works, `/order` advances through the FSM without error. Logs show no PostgREST 409/400 from upsert calls.

---

### S5 — Lost-update race in `update_stock_balance`

**Location:** `supabase/migrations/household/001_full_warehouse_schema.sql:571-615`.

**Description:** Function does `SELECT quantity INTO v_current`, computes `v_new := v_current + p_quantity_change`, then `INSERT ... ON CONFLICT DO UPDATE SET quantity = v_new`. Two concurrent transactions reading the same `v_current` and writing back lose one of the changes (classic lost update). Symptoms: stock balances slowly drift from `stock_movements` sum.

**Root cause:** Read-modify-write outside a row lock.

**Fix:** New migration `020_atomic_stock_balance.sql`. Use an atomic increment with `RETURNING` to capture the prior value:

```sql
CREATE OR REPLACE FUNCTION household_chemicals.update_stock_balance(
    p_product_id INT,
    p_warehouse_id INT,
    p_quantity_change NUMERIC,
    p_movement_type TEXT,
    p_reference_type TEXT DEFAULT NULL,
    p_reference_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
) RETURNS NUMERIC(12, 3)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_before NUMERIC(12, 3);
    v_after  NUMERIC(12, 3);
BEGIN
    -- Atomic upsert with delta. EXCLUDED.quantity holds the change for new rows.
    INSERT INTO household_chemicals.stock_balances AS sb
        (product_id, warehouse_id, quantity, updated_at)
    VALUES (p_product_id, p_warehouse_id, COALESCE(p_quantity_change, 0), NOW())
    ON CONFLICT (product_id, warehouse_id)
    DO UPDATE SET
        quantity = sb.quantity + COALESCE(p_quantity_change, 0),
        updated_at = NOW()
    RETURNING
        (sb.quantity - COALESCE(p_quantity_change, 0)),  -- before
        sb.quantity                                       -- after
    INTO v_before, v_after;

    -- For newly inserted rows the trigger semantics make v_before := 0
    IF v_before IS NULL THEN v_before := 0; END IF;

    INSERT INTO household_chemicals.stock_movements (
        product_id, warehouse_id, quantity_change,
        quantity_before, quantity_after,
        movement_type, reference_type, reference_id, notes, created_by
    ) VALUES (
        p_product_id, p_warehouse_id, p_quantity_change,
        v_before, v_after,
        p_movement_type, p_reference_type, p_reference_id, p_notes, p_created_by
    );

    RETURN v_after;
END;
$$;
```

> Note on `RETURNING` semantics: on INSERT (no conflict), `sb.quantity` is the inserted value and there's no "before"; the `v_before := 0` fallback covers it. On UPDATE, `sb.quantity` is the post-update value and `sb.quantity - p_quantity_change` is the prior. Confirm with `EXPLAIN` and a manual concurrent test.

**Acceptance:** Migration applied. Concurrent test (psql in two sessions, both calling `update_stock_balance(same_product, same_warehouse, +1, ...)` 100 times): final `stock_balances.quantity` equals `200`, not less. Also verify `stock_movements` count = 200.

---

### S6 — Receipts/new warehouse selector empty (deprecated `type` column)

**Location:** `warehouse-crm/src/app/receipts/new/page.tsx:124` — `warehouses.filter(w => w.type === 'central')`.

**Description:** The old `warehouses.type` column is deprecated (its CHECK was dropped in migration #016). Imported Poster warehouses have `type = NULL` and `warehouse_type IN ('shop', 'workshop', 'storage', 'other')`. The current filter shows at most the hardcoded id=1 row. Operators cannot create receipts for any Poster-origin warehouse.

**Root cause:** Frontend filter wasn't updated when the schema migrated.

**Fix:** Change the filter to use `warehouse_type`. Receipts are normally created for storage-class locations (central warehouse, shops acting as storage). Use:

```tsx
{warehouses
  .filter(w => w.warehouse_type === 'storage' || w.warehouse_type === 'other' || w.id === 1)
  .map(w => (
    <option key={w.id} value={w.id}>{w.name}</option>
  ))}
```

> Confirm the intended set with the human before committing — they may want shops too. The `|| w.id === 1` fallback handles the legacy central warehouse that has `warehouse_type` set to 'other' or NULL.

**Acceptance:** `npm run build` passes. Open `/receipts/new`, the warehouse dropdown shows ≥ 8 options (not just one). Create a draft receipt against a non-central warehouse, confirm it persists.

---

### S7 — `next_document_number` not granted to `anon`

**Location:**
- Definition: `supabase/migrations/household/002_telegram_bot_and_api_layer.sql:147-164` — `SECURITY DEFINER`.
- Grants: `015_fix_security_grants.sql:14` — `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA household_chemicals FROM anon`, and `next_document_number` is **not** in the re-grant list.
- Usage: `warehouse-crm/src/app/receipts/new/page.tsx:72` — called via the anon-key client.

**Description:** Frontend calls `supabase.rpc('next_document_number', ...)` while authenticated as `anon`. After migration #015 the anon role lost EXECUTE on this function. Receipt creation fails with `permission denied for function next_document_number`.

**Root cause:** Re-grant list was incomplete.

**Fix:** Two options, pick one. **Recommended:** stop calling the sequence from the client at all — generate the number inside `createReceipt` server-side via a new RPC `rpc_create_receipt(p_supplier_id, p_warehouse_id, p_notes)` that allocates the number atomically.

If that's too invasive for one fix, the **minimal patch** is migration `021_grant_next_document_number.sql`:

```sql
GRANT EXECUTE ON FUNCTION household_chemicals.next_document_number(TEXT) TO anon, authenticated;
```

> Even with the grant, `anon` writing to `document_sequences` only works because the function is `SECURITY DEFINER` and runs as owner. That's already the case — verify after applying.

**Acceptance:** Migration applied (or RPC created). Create a receipt without filling `receipt_number` — autogenerated `RCPT-2026-000001` (or next available) appears.

---

### S8 — No operator authentication, `p_user_id` is always NULL

**Location:**
- All mutations in `warehouse-crm/src/lib/api.ts` pass `p_user_id: null`: `confirmReceipt:278`, `shipOrder:314`, `updateOrderItem:322`, `addOrderItem:331`, `removeOrderItem:341`, `confirmOrder:349`, `confirmTransfer:361`, `confirmWriteOff:369`, `completeInventory:377`.
- Schema expects `created_by`/`confirmed_by` on `receipts`, `orders`, `transfers`, `write_offs`, `inventories` — all left NULL.
- RLS policies in `001:1023-1057` only grant write to `authenticated` with role in (`admin`, `warehouse_operator`, `shop_manager`). Since the frontend uses the anon key, these writes either go through a permissive RLS hole or RLS is not actually being enforced for anon DML.

**Description:** There is no login at all. The frontend authenticates with the public `anon` key, every audit row is anonymous, and any holder of the anon key can write to tables directly (since the bot writes work, the RLS gate is effectively bypassed for anon — either by a missing policy or by service-role being used somewhere unexpected).

**Root cause:** Authentication was deferred and never added.

**Fix:** This is bigger than one commit — **do not auto-implement**. Open a follow-up with the human:

1. Decide on the auth strategy:
   - **a.** Supabase Auth with magic-link login → real `authenticated` JWT → existing RLS works.
   - **b.** Lightweight: a fixed list of operators in `household_chemicals.users`, login via shared password, store a server-side session, route writes through a `/api/op/*` Next.js handler that uses service-role and stamps `created_by` from the session.
   - **c.** Status quo + audit columns explicitly NULL — accept that there is no accountability.
2. Whatever the choice, the immediate sub-task an agent can do **now**:
   - Verify RLS state: run `SELECT tablename, rowsecurity, forcerowsecurity FROM pg_tables WHERE schemaname = 'household_chemicals';` and report. If RLS is OFF on tables that the policies were supposed to cover, that's the bypass.
   - Audit: which tables actually allow `anon` INSERT/UPDATE/DELETE today? Run `SELECT * FROM pg_policies WHERE schemaname = 'household_chemicals'` and document.

**Acceptance:** A report file `docs/auth-audit-2026-05.md` listing per-table RLS status and effective `anon` permissions. No code change yet — strategy decision is the human's.

---

## HIGH

### H1 — `ship_order` doesn't check order status

**Location:** `supabase/migrations/household/001_full_warehouse_schema.sql:653-701`.

**Description:** Function ships any order regardless of `status`. Calling it twice on the same order creates two shipments and double-deducts stock. Same for orders already `cancelled`.

**Fix:** Add guard at the top:

```sql
IF v_order.status NOT IN ('submitted', 'confirmed', 'partially_shipped') THEN
    RAISE EXCEPTION 'Cannot ship order in status: %', v_order.status;
END IF;
```

Also wrap the order lookup with `FOR UPDATE` to prevent concurrent ships:

```sql
SELECT * INTO v_order FROM household_chemicals.orders WHERE id = p_order_id FOR UPDATE;
```

Bundle in migration `017` (or whichever number you've reached).

**Acceptance:** Calling `ship_order` on a `shipped` order raises. Single-row stock movement is created exactly once per order.

---

### H2 — `confirm_receipt` race condition

**Location:** `supabase/migrations/household/001_full_warehouse_schema.sql:618-650`.

**Description:** Status check (line 627) and UPDATE (line 646) are not in a single locked transaction. Two parallel calls both pass the check, both post stock, both flip the status — double receipt.

**Fix:** Replace the existence check with a locking SELECT and short-circuit if the status changed:

```sql
DECLARE
    v_status TEXT;
BEGIN
    SELECT status INTO v_status
    FROM household_chemicals.receipts
    WHERE id = p_receipt_id
    FOR UPDATE;

    IF v_status IS NULL THEN RAISE EXCEPTION 'Receipt not found'; END IF;
    IF v_status != 'draft' THEN RAISE EXCEPTION 'Receipt already %', v_status; END IF;
    -- ...rest unchanged
END;
```

**Acceptance:** Two parallel `confirm_receipt(<same_id>)` calls — one succeeds, one raises. Stock posted once.

---

### H3 — `handleEditedOrderMessage` deletes items then N+1 inserts, no transaction, no user feedback

**Location:** `warehouse-crm/src/app/api/telegram/webhook/route.ts:954-1000`.

**Description:** Function deletes all `order_items` for the order, then inserts new rows one at a time. If any insert fails, the order is left with partial items (or empty). User editing the message in the group never sees a confirmation that the order was re-parsed.

**Fix:**
1. Wrap in a Supabase RPC (`rpc_telegram_replace_order_items(p_order_id, p_items JSONB)`) that runs in a single transaction — DELETE + bulk INSERT from `jsonb_to_recordset`.
2. After successful re-parse, send a message to the chat: `Заявку оновлено: ...`.
3. If `matchProduct` returns nothing for any line, include those in the reply as `Не розпізнано: <line>`.

**Acceptance:** Edit an order message in a test group → bot edits items in DB atomically and replies with the updated list.

---

### H4 — `setInterval` at module top-level leaks in serverless

**Location:** `warehouse-crm/src/app/api/telegram/webhook/route.ts:17-22`.

**Description:** A 60-second interval is registered when the module is first imported. In Vercel/Edge serverless this either prevents the lambda from going idle (raising cost) or registers a new timer on every cold start (with no way to clear the old one). Locally it's harmless but pollutes the dev-server lifecycle.

**Fix:** Either drop the cleanup entirely (the `Map` is small and per-lambda anyway), or guard it behind a `globalThis` flag so it registers once per process:

```ts
declare global { var __rateLimitCleanup: NodeJS.Timeout | undefined }
if (!globalThis.__rateLimitCleanup) {
  globalThis.__rateLimitCleanup = setInterval(() => { ... }, RATE_LIMIT_CLEANUP_INTERVAL)
}
```

Better: use a TTL-aware data structure or `lru-cache`. Best long-term: move rate limiting to Upstash Redis (see project's existing `.env.example` for `UPSTASH_REDIS_REST_URL`).

**Acceptance:** Module can be imported multiple times in a test (`require.cache` cleared) without accumulating timers. `npm run build` passes.

---

### H5 — `idfCache` module-level cache never invalidates

**Location:** `warehouse-crm/src/app/api/telegram/webhook/route.ts:735-762`.

**Description:** Group-chat product matcher caches IDF stats over the products list. The cache is set once per lambda lifetime — adding new products doesn't refresh it, and warm lambdas serve stale data indefinitely.

**Fix:** Add a TTL or version key. Simplest:

```ts
let idfCache: { wordsList: Set<string>[]; prefixCount: Record<string, number>; key: string } | null = null

function buildIdfCache(products: any[]) {
  const key = `${products.length}:${products[0]?.id}:${products[products.length-1]?.id}`
  if (idfCache && idfCache.key === key) return idfCache
  // ... rebuild
  idfCache = { wordsList, prefixCount, key }
  return idfCache
}
```

**Acceptance:** Add a product via the admin UI; the next group-chat order message includes it in the candidate set without restarting the dev server.

---

### H6 — Hardcoded `DEFAULT_WAREHOUSE_ID = 1` ignores shop→warehouse mapping

**Location:** `warehouse-crm/src/app/api/telegram/webhook/route.ts:92`, used in `confirmOrder:202` and `parseGroupOrder:940`.

**Description:** Every Telegram order is created against warehouse id=1 regardless of which shop the user belongs to. Shops are bound to specific warehouses via `shops.warehouse_id`; the bot ignores this.

**Fix:** Look up `warehouse_id` from `shops` at order-creation time:

```ts
const { data: shop } = await supabase.from('shops').select('warehouse_id').eq('id', pending.shop_id).single()
if (!shop?.warehouse_id) {
  await tgEditMenu(chatId, messageId, 'Магазин не прив`язаний до складу. Зверніться до адміністратора.', [])
  return
}
const warehouseId = shop.warehouse_id
// ... pass to telegram_create_order
```

Same fix in `parseGroupOrder`.

**Acceptance:** Create test orders from two different shops (each bound to a different warehouse). Each order ends up in the right `warehouse_id` in `orders` table.

---

### H7 — `safeHTML` doesn't escape `&`

**Location:** `warehouse-crm/src/app/api/telegram/webhook/route.ts:40-42`.

**Description:** Only `<` and `>` are escaped. Telegram HTML mode requires `&` to be escaped first (to `&amp;`). A product/shop name with `&` causes the send to fail with `Bad Request: can't parse entities`.

**Fix:**

```ts
function safeHTML(text: string): string {
  return safeText(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
```

Order matters: `&` first, otherwise you double-escape.

**Acceptance:** Create a product named `R&D test` and confirm it shows up correctly in `/catalog` output without parse errors in webhook logs.

---

### H8 — `addItemToPendingOrder` read-modify-write race

**Location:** `warehouse-crm/src/app/api/telegram/webhook/route.ts:128-148`.

**Description:** SELECT `items`, mutate the JS array, UPDATE. Rapid taps on quantity buttons (Telegram allows queueing callback_query events) cause concurrent webhook invocations that both read the same `items`, each adds its own item, and one update wins.

**Fix:** Server-side via RPC `rpc_pending_order_add_item(p_telegram_user_id, p_chat_id, p_product_id, p_quantity)` that does an atomic JSONB append within a single statement:

```sql
UPDATE household_chemicals.telegram_pending_orders
SET items = items || jsonb_build_array(jsonb_build_object(
      'product_id', p_product_id, 'quantity', p_quantity
    )),
    step = 'adding_items'
WHERE telegram_user_id = p_telegram_user_id AND chat_id = p_chat_id
RETURNING items;
```

(Merging duplicates by product_id can be done with a `WITH` and a recompute.)

**Acceptance:** Rapidly tap "10" five times in `/order`. The `items` array contains all 5 entries (or a single entry with qty=50 if dedup is implemented) — none lost.

---

### H9 — Frontend list/filter race conditions (no AbortController)

**Location:**
- `warehouse-crm/src/app/page.tsx:34-49` (dashboard, `selectedWarehouse` change).
- `warehouse-crm/src/app/orders/page.tsx:28-33` (status filter).
- Likely repeated in `inventory`, `transfers`, `write-offs`, `shipments` — verify each.

**Description:** Fetch is fired on dependency change with no abort. Late responses overwrite newer ones.

**Fix:** Wrap fetch in `useEffect` with `AbortController`:

```tsx
useEffect(() => {
  const ac = new AbortController()
  setLoading(true)
  fetchOrders({ status: statusFilter || undefined, signal: ac.signal })
    .then(r => { if (!ac.signal.aborted) setOrders(r.items) })
    .finally(() => { if (!ac.signal.aborted) setLoading(false) })
  return () => ac.abort()
}, [statusFilter])
```

`api.ts` helpers need to accept and forward the `signal` to `supabase-js` (`.abortSignal(signal)` if available, or wrap the fetch).

**Acceptance:** Rapidly switch warehouse filter back and forth — the displayed data always matches the most recently selected filter. No flicker.

---

### H10 — Dashboard `stock_value.toLocaleString()` hydration mismatch

**Location:** `warehouse-crm/src/app/page.tsx:96`.

**Description:** `Number.prototype.toLocaleString()` with no argument uses the runtime default locale. SSR runs in Node (often `en-US`); client uses the browser locale. Output differs → React hydration warning, and the displayed value flickers.

**Fix:** Use the same convention as `products/[id]/page.tsx:17`:

```tsx
const fmt = new Intl.NumberFormat('uk-UA', { style: 'decimal', minimumFractionDigits: 0, maximumFractionDigits: 0 })
// ...
<StatCard ... value={`${fmt.format(s.stock_value)} ₴`} />
```

Audit other pages for the same anti-pattern (`grep -rn 'toLocaleString()' src/app`).

**Acceptance:** No hydration warnings in browser console on `/`. Currency renders identically on SSR and after hydration.

---

### H11 — Duplicate audit triggers on status changes

**Location:** `supabase/migrations/household/001_full_warehouse_schema.sql:526-563`.

**Description:** Loop installs two triggers per table: `trg_audit_<tbl>` (catches all changes including status) and `trg_audit_status_<tbl>` (catches status specifically). Both fire on an UPDATE of `status` → two rows in `audit_log` for one event. On `orders`, a third row goes to `webhook_outbox` via `trg_order_webhook`.

**Fix:** Choose one strategy:
- Remove `trg_audit_status_*` triggers (the generic one already records the change).
- Or keep the status-specific trigger and make the generic one skip `status` updates.

Cleaner option (drop the redundant trigger) — migration:

```sql
DO $$
DECLARE tbl TEXT;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY[
        'receipts', 'orders', 'shipments', 'transfers', 'write_offs', 'inventories'
    ])
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_status_%I ON household_chemicals.%I;', tbl, tbl);
    END LOOP;
END $$;
```

**Acceptance:** Change `orders.status` from `submitted` to `confirmed`. `audit_log` has exactly one row for that change (not two).

---

### H12 — `set_initial_stock` adds instead of sets

**Location:** `supabase/migrations/household/001_full_warehouse_schema.sql:800-816`.

**Description:** Function passes `p_quantity` as the delta to `update_stock_balance`. Calling it twice with 100 yields 200, not 100. The name lies.

**Fix:** Either rename to `add_initial_stock` or change behavior:

```sql
-- Compute delta from current, then apply
DECLARE v_current NUMERIC(12,3);
BEGIN
    SELECT COALESCE(quantity, 0) INTO v_current
    FROM household_chemicals.stock_balances
    WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id
    FOR UPDATE;
    PERFORM household_chemicals.update_stock_balance(
        p_product_id, p_warehouse_id, p_quantity - COALESCE(v_current, 0),
        'initial', NULL, NULL, 'Початковий залишок (set)', p_user_id
    );
END;
```

> Check if anything calls this function before changing semantics. `grep -rn 'set_initial_stock' .`

**Acceptance:** Call `set_initial_stock(1, 1, 100)` twice — final `stock_balances.quantity = 100`. `stock_movements` has two rows: first +100, second 0 (or one row if guarded against no-op).

---

### H13 — Same hardcoded warehouse default in `telegram_create_order`

**Location:** `supabase/migrations/household/002_telegram_bot_and_api_layer.sql:623` — `p_warehouse_id INT DEFAULT 1`.

**Description:** Same class of bug as H6 but on the SQL side. If a caller forgets the arg, it silently defaults to warehouse 1.

**Fix:** Make the parameter required (`NOT NULL`), or look up from `shop_id`:

```sql
-- Inside telegram_create_order, after fetching shop:
IF p_warehouse_id IS NULL THEN
    SELECT warehouse_id INTO p_warehouse_id
    FROM household_chemicals.shops WHERE id = p_shop_id;
END IF;
IF p_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Cannot determine warehouse for shop %', p_shop_id;
END IF;
```

**Acceptance:** Calling the RPC without `p_warehouse_id` derives the right one from the shop. Drop the `DEFAULT 1`.

---

### H14 — Orders page ignores pagination

**Location:** `warehouse-crm/src/app/orders/page.tsx:28-33`.

**Description:** `fetchOrders` returns `{ items, total, page, page_size, total_pages }`. UI only renders `r.items`, default page size 50. Past-50 orders are invisible.

**Fix:** Add pagination controls (page state, prev/next buttons, show `total_pages`):

```tsx
const [page, setPage] = useState(1)
const [meta, setMeta] = useState({ total: 0, total_pages: 1 })
const load = () => {
  fetchOrders({ status: statusFilter || undefined, page }).then(r => {
    setOrders(r.items)
    setMeta({ total: r.total, total_pages: r.total_pages })
  })
}
useEffect(() => { load() }, [statusFilter, page])
// ...
<div>Сторінка {page} з {meta.total_pages} ({meta.total} заявок)</div>
<button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page <= 1}>Попередня</button>
<button onClick={() => setPage(p => Math.min(meta.total_pages, p+1))} disabled={page >= meta.total_pages}>Наступна</button>
```

Audit other list pages (`/products`, `/audit`, `/inventory`, `/transfers`, etc.) for the same omission and fix uniformly.

**Acceptance:** Create ≥ 51 test orders, verify "Наступна" reveals them. Filter by status; pagination resets to 1.

---

### H15 — `parseGroupOrder` doesn't dedupe by `telegram_message_id`

**Location:** `warehouse-crm/src/app/api/telegram/webhook/route.ts:896-952`.

**Description:** Telegram retries the webhook if it doesn't get a 200 fast enough. Each retry re-parses the same message and creates a fresh order. No upsert key.

**Fix:** Before creating, check whether an order with the same `telegram_message_id` already exists in this `chat_id`. If yes, treat as "already processed" and return its existing summary.

```ts
const { data: existing } = await supabase
  .from('orders')
  .select('id, order_number')
  .eq('telegram_message_id', String(messageId))
  .eq('source', 'telegram')
  .maybeSingle()
if (existing) {
  return { reply: `Заявка ${existing.order_number} вже створена за цим повідомленням.` }
}
```

Stronger guarantee: add a partial unique index:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_telegram_msg
  ON household_chemicals.orders (telegram_message_id)
  WHERE telegram_message_id IS NOT NULL AND source = 'telegram';
```

(In migration `019` or a new one.)

**Acceptance:** Send the same group-chat message twice (or simulate webhook retry with curl) — only one order is created.

---

## MEDIUM

### M1 — Mojibake comment in api.ts

**Location:** `warehouse-crm/src/lib/api.ts:385`. Comment reads `// GENERIC TABLE ACCESS (РґР»СЏ Р°СѓРґРёС‚Р° Рё РїСЂРѕСЃС‚С‹С… СЃРїСЂР°РІРѕС‡РЅРёРєРѕРІ)`.

**Fix:** Replace with `// GENERIC TABLE ACCESS (для аудиту та простих довідників)` or just delete — comment adds no value.

**Acceptance:** No mojibake found via `grep -P '[\xC0-\xFF]{4,}' src/lib/api.ts`.

---

### M2 — Onboarding captures slash-commands as input

**Location:** `warehouse-crm/src/app/api/telegram/webhook/route.ts:469-492`.

**Description:** Branches for `onboarding_name` and `onboarding_phone` run before the slash-command dispatcher. Typing `/cancel` during onboarding sets `display_name = "/cancel"`.

**Fix:** Guard the onboarding branches:

```ts
if (pending?.step === 'onboarding_name' && text.length > 0 && !text.startsWith('/')) { ... }
if (pending?.step === 'onboarding_phone' && text.length > 0 && !text.startsWith('/')) { ... }
```

And allow `/cancel`/`/start` during onboarding to abort it cleanly.

**Acceptance:** Start onboarding, send `/cancel` — pending is deleted, `display_name` unchanged.

---

### M3 — Webhook swallows all errors silently

**Location:** `warehouse-crm/src/app/api/telegram/webhook/route.ts:669-672`.

**Description:** `catch (err) { console.error(...); return 200 }` is correct (don't make Telegram retry) but the only observability is `console.error`. In production these logs are likely lost.

**Fix:** Add structured logging — at minimum, write to `household_chemicals.telegram_messages_log` with `error` field populated. The `telegram_log_message` RPC already accepts `p_error`. Wrap each branch (or the whole handler) so that exceptions go to the log table.

**Acceptance:** Force an error (e.g. malformed update JSON in a test) — a row appears in `telegram_messages_log` with `error` set.

---

### M4 — `webhook_outbox` has no dispatcher

**Location:** `supabase/migrations/household/002_telegram_bot_and_api_layer.sql:104-120`, trigger at `884-888`.

**Description:** Trigger writes events when `orders.status` changes, but nothing reads from `webhook_outbox` to deliver them. Rows accumulate. `target_url` is `NULL` in the trigger, so even a dispatcher would have nowhere to send them.

**Fix:** **Ask the human first** — is this feature intended? If not, drop the trigger and the table (or just the trigger). If yes, build a dispatcher (a cron Edge Function or a Next.js route).

For now (without removing it), at least limit growth: add a retention cleanup migration:

```sql
DELETE FROM household_chemicals.webhook_outbox
WHERE status = 'pending' AND created_at < NOW() - INTERVAL '30 days';
```

Schedule via `pg_cron` if available.

**Acceptance:** Decision documented in `docs/decisions/webhook-outbox.md`. If dropped — trigger and table gone. If kept — retention rule active.

---

### M5 — `extractQty` ambiguity with 'л' unit

**Location:** `warehouse-crm/src/app/api/telegram/webhook/route.ts:764-792`.

**Description:** The `if (unit === 'л' && !m[1].includes('.') && m[1].length <= 2) continue;` rule silently rejects quantities like `1л`, `5л` — turning them into qty=1 by fallback. Real chat messages will commonly use them.

**Fix:** Remove the rule entirely (it was an attempt to disambiguate shop name "Л" from liters but is too aggressive). Or use a positive list: only treat as quantity if the number directly precedes the unit (`5л`, not "Л 5"). Add unit tests for the parser before rewriting.

**Acceptance:** A test message `Грасаторе 1л` parses to qty=1, unit recognized as liters (or kept generic). Existing test fixtures still pass.

---

### M6 — Cyrillic `\b` regex in `expandAbbrevs`

**Location:** `warehouse-crm/src/app/api/telegram/webhook/route.ts:688-694`.

**Description:** JavaScript `\b` is ASCII-only; it doesn't recognize Cyrillic letter boundaries. `expandAbbrevs("5шт")` doesn't match `\bшт\b` because the preceding char is a digit (ASCII word char) and the following is end-of-string — actually it does match here, but `5штук` would not. Inconsistent behavior across inputs.

**Fix:** Use a Unicode-aware boundary via lookahead/lookbehind on non-letters:

```ts
result = result.replace(new RegExp(`(^|[^а-яіїєґa-z])${short}(?=$|[^а-яіїєґa-z])`, 'gu'), `$1${full}`)
```

**Acceptance:** `expandAbbrevs("5шт")` → `"5штук"`. `expandAbbrevs("штука")` → `"штука"` (no replacement, not on a word boundary).

---

### M7 — `<=` vs `<` inconsistency in dashboard summary

**Location:** `supabase/migrations/household/016_fix_cartesian_grants_and_integrity.sql`. Stats CTE (line 72-73) uses `<= p.min_stock`; critical CTE (line 109) uses `< p.min_stock`.

**Description:** The count and the list of "critical" items disagree by one row whenever `quantity = min_stock`.

**Fix:** Pick one. Convention elsewhere in the code (`v_stock_summary.stock_status`, frontend stock badges) uses `<=`. Update line 109 to `sb.quantity <= p.min_stock`.

**Acceptance:** Counts match the list for any warehouse.

---

### M8 — DELETE rows never logged to audit

**Location:** `supabase/migrations/household/001_full_warehouse_schema.sql:438-491`.

**Description:** In the `TG_OP = 'DELETE'` branch, the function builds `v_action`, `v_entity_id`, `v_changes`, then `RETURN OLD;` — **before** the `INSERT INTO audit_log` at line 482. Deletes are never recorded.

**Fix:** Restructure so the INSERT happens before the RETURN, or move the INSERT inside each branch. Simplest:

```sql
-- After building v_action/v_changes/v_entity_id but before RETURN
INSERT INTO household_chemicals.audit_log (
    action, entity_type, entity_id, changes
) VALUES (
    v_action, TG_TABLE_NAME, v_entity_id,
    CASE WHEN v_changes = '{}'::jsonb THEN NULL ELSE v_changes END
);

RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
```

(Remove the early `RETURN OLD;` in the DELETE branch.)

**Acceptance:** Delete a test product — a row appears in `audit_log` with `action='delete'`.

---

### M9 — `any` types throughout the API layer

**Location:** `warehouse-crm/src/lib/api.ts` — `fetchReceipts:231` returns `any[]`, `fetchReceiptDetail:240` returns objects of `any`, `fetchOrders:286`/`fetchOrderDetail:304` return `any`, `confirmTransfer/WriteOff/Inventory` return `any`, `fetchStockSummary/CriticalStock/Movements` return `any[]`.

**Description:** Loses type safety in pages that consume these. Hides regressions.

**Fix:** Add proper types in `types.ts` for `ReceiptDetail`, `OrderDetail`, `StockSummary`, `MovementWithLabels`. Update `api.ts` signatures. Likely uncovers latent bugs in pages — fix them or comment why coercion is needed.

**Acceptance:** No `: any` in `api.ts` exports. `npm run build` passes.

---

### M10 — No trigram index for product search

**Location:** `supabase/migrations/household/002_telegram_bot_and_api_layer.sql:411-414` and similar in #016. `rpc_product_catalog` uses `name ILIKE '%' || p_search || '%'`.

**Description:** Substring ILIKE forces a sequential scan on `products`. Tolerable at <1k rows; degrades fast as catalog grows.

**Fix:** Install `pg_trgm` and add a GIN index:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON household_chemicals.products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_sku_trgm
  ON household_chemicals.products USING gin (sku gin_trgm_ops);
```

Postgres planner picks GIN automatically for `ILIKE '%foo%'`. No RPC changes needed.

**Acceptance:** `EXPLAIN ANALYZE` of a `name ILIKE '%test%'` query shows `Bitmap Index Scan` instead of `Seq Scan`.

---

### M11 — `Warehouse.type` legacy field still in type definition

**Location:** `warehouse-crm/src/lib/types.ts:98-100`.

**Description:** Both `type: string` and `warehouse_type: 'shop' | 'workshop' | 'storage' | 'other' | null` exist. The `type` column is deprecated since migration #014. UI in `receipts/new` (see S6) still filters on it.

**Fix:** Remove `type` from `Warehouse` interface. Grep for `\.type` uses on Warehouse objects across `src/`, replace with `warehouse_type`.

```bash
grep -rn 'w\.type\|warehouse\.type' src/
```

Fix each call site. Confirm `npm run build` passes.

**Acceptance:** `Warehouse.type` removed. No TS errors. UI behaves correctly with the new field.

---

### M12 — Fragile `/status` parsing

**Location:** `warehouse-crm/src/app/api/telegram/webhook/route.ts:637-641`.

**Description:** `text.replace('/status ', '')` only handles one space. `/status  ORD-2026-000123` (two spaces) breaks the regex check.

**Fix:**

```ts
if (text.startsWith('/status')) {
  const orderNumber = safeText(text.slice(7).trim(), 50)
  if (!orderNumber) {
    await tgSend(chatId, 'Вкажіть номер заявки: /status ORD-2026-000001')
    return NextResponse.json({ ok: true })
  }
  // rest unchanged
}
```

**Acceptance:** `/status<TAB>ORD-...` and `/status  ORD-...` both work.

---

## LOW

### L1 — Native `confirm()` / `alert()` for destructive actions

`warehouse-crm/src/app/orders/page.tsx:36,42`. Replace with a styled modal. Optional UX polish.

### L2 — Unused `Eye` import in orders page

`warehouse-crm/src/app/orders/page.tsx:6`. Delete.

### L3 — `fetchOrders.shipOrder` refetches the whole list

`warehouse-crm/src/app/orders/page.tsx:35-44`. After `shipOrder`, update only the changed row via local state to avoid the round-trip.

### L4 — `audit_status_change` skips intermediate statuses

`supabase/migrations/household/001_full_warehouse_schema.sql:494-524`. Status transitions like `submitted` → `partially_shipped` log as plain `'update'`, not as a distinct action. Either add cases or remove the trigger after H11 is resolved (the generic trigger covers it).

### L5 — Receipt/items not in a transaction

`warehouse-crm/src/app/receipts/new/page.tsx:73-87`. If items INSERT fails, the receipt remains orphan. Fix: wrap in an RPC `rpc_create_receipt_with_items(p_receipt JSONB, p_items JSONB[])`.

### L6 — `.env.example` is from a different project

`warehouse-crm/.env.example`. Mentions Graviton, Florida, Konditerka, GLM-OCR, etc. Rewrite to match the actual set: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `POSTER_TOKEN`, `POSTER_ACCOUNT`.

### L7 — `next_document_number` year-boundary collision

`supabase/migrations/household/002_telegram_bot_and_api_layer.sql:147-164`. At midnight on Jan 1, two parallel calls could see different years. Negligible in practice; would need a year-aware lock to fully fix. Park.

### L8 — Hardcoded Russian strings in stock_movements notes

`001_full_warehouse_schema.sql:641, 720, 729, 756, 789`. The UI is Ukrainian but movement notes are in Russian ("Приход по накладной", etc.). Translate to Ukrainian or move to enum + i18n on the UI side.

### L9 — `confirmReceipt` returns void, frontend can't show "+N items posted"

`warehouse-crm/src/lib/api.ts:275-281`. Consider returning the count of `stock_movements` rows created.

### L10 — `tgSend` has no per-call try/catch

`warehouse-crm/src/app/api/telegram/webhook/route.ts:64-69`. If Telegram returns 429 (rate limit) or a 5xx, the bot logic crashes mid-flow. Wrap and log.

---

## Dependency graph (execution order)

Items higher in the list must be done first (or in parallel where independent).

```
S1 (rotate secrets, scrub history) ──┐
                                      ├─► everything else (after secrets are safe)
S8 (auth audit report) ───────────────┘   ← decision dependency only, doesn't block code fixes

SQL batch (apply together as migration 017+):
  S2 complete_inventory ──┐
  S3 catalog text         │
  S4 unique constraint    ├─► one combined migration is fine
  S5 atomic stock balance │   (or split if reviewer prefers smaller)
  H1 ship_order guard     │
  H2 confirm_receipt lock │
  H11 dedupe triggers     │
  H12 set_initial_stock   │
  M7 <= consistency       │
  M8 delete audit         │
  M10 trgm indexes ───────┘

S7 next_document_number grant ─► unblocks receipts/new flow

Frontend (after SQL batch is applied):
  S6 receipts/new filter ──► test receipt creation
  H6, H13 warehouse from shop
  H10 hydration fix
  M11 remove Warehouse.type
  H14 orders pagination ──► repeat for other list pages
  M9 typing

Bot (after S4 + SQL batch):
  H7 safeHTML &
  M2 onboarding slash-commands
  H3 atomic edited-message replace ──► needs new RPC, do after SQL batch
  H8 atomic pending-order add ──────► same
  H15 dedupe by message_id ─────────► needs index from SQL batch
  H4 setInterval guard
  H5 idfCache invalidation
  M3 error logging
  M5, M6, M12 parser tweaks
  L8 translate notes

Decision-required (do not auto-implement):
  S8 auth strategy
  M4 webhook_outbox future
```

---

## Out-of-scope notes

- **No tests exist** in the repo. After fixing parser bugs (M5/M6) and stock logic (S5/H1/H2), add at least:
  - Unit tests for `extractQty`, `matchProduct`, `safeHTML`.
  - Integration test for `update_stock_balance` concurrency (psql with two transactions).
  - E2E test for the order FSM (Telegram webhook fixtures).
- **`docs/` folder** has architecture diagrams that will be out of date after the SQL batch — refresh `database-erd.md`, `API.md`, `openapi.yaml`.
- **Migration numbering**: there are already entries up to 016. New migrations should start at 017 and increment. Two parallel agents working on different fixes must coordinate on numbers — use file-creation atomically.
- **Don't touch** `007_SUPERSEDED_product_detail_rpc.sql` — it's intentionally not applied.
