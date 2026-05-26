# Складський облік — Галя Балувана (Warehouse CRM)

CRM для управління складом побутової хімії, витратних матеріалів та упаковки з Telegram-ботом і даними з Poster API.

## Архітектура

| Компонент | Технологія |
|---|---|
| Frontend | Next.js 16 (App Router, TypeScript, Tailwind CSS v4) |
| Backend | PostgreSQL 15 (всі RPC, тригери, бізнес-логіка) |
| База даних | Supabase (self-hosted) |
| Схема | `household_chemicals` (окрема, не `public`) |
| Чати | Telegram Bot API (webhook) |
| Джерело даних | Poster API (товари, залишки, постачання) |

## Документація

| Розділ | Опис |
|---|---|
| [Changes (017–025)](CHANGES.md) | **Поточний стан**: міграції 017–025, auth-gate, `DialogProvider`, Mermaid-діаграми оновленого потоку |
| [Clean Architecture](clean-architecture.md) | Шари, модулі, потік залежностей, діаграми |
| [Database ERD](database-erd.md) | Mermaid-діаграми всіх таблиць, зв'язків, views |
| [OpenAPI / Swagger](openapi.yaml) | Повна специфікація всіх RPC та API routes |
| [API guide](API.md) | Приклади curl + Supabase SDK |
| [Architecture (C4)](ARCHITECTURE.md) | C4 діаграми, domain model |
| [Review Plan](../REVIEW_PLAN.md) | Статус усіх code-review findings (S1–L10) |
| [Security Rotation](../SECURITY_ROTATION.md) | Покроковий чекліст ротації ключів + git filter-repo (S1) |

## Міграції (1–25)

| # | Файл | Опис |
|---|---|---|
| 001 | `001_full_warehouse_schema.sql` | Основна схема — 20 таблиць, 8 views, 7 бізнес-функцій, RLS, тригери аудиту, сіди |
| 002 | `002_telegram_bot_and_api_layer.sql` | Telegram bot (4 таблиці), API integration (4 таблиці), 5 RPC дашборда, 5 Telegram RPC, webhook outbox |
| 003 | `003_sync_poster_references.sql` | `poster_storage_id` на warehouses; 38 складів, 24 магазини з Poster |
| 004 | `004_warehouse_shop_stats_rpc.sql` | `rpc_warehouses_with_stats`, `rpc_shops_with_stats` |
| 005 | `005_suppliers_enhance.sql` | edrpou, payment_days, category, website; `v_supplier_stats`, `rpc_suppliers_with_stats` |
| 006 | `006_import_poster_storage_37.sql` | 160 товарів + початкові залишки з Poster |
| 007 | `007_SUPERSEDED_product_detail_rpc.sql` | **(SUPERSEDED #009 — не застосовувати)** |
| 008 | `008_import_poster_supplies.sql` | 68 постачальників, 719 накладних, 1786 рядків |
| 009 | `009_product_detail_and_catalog_rpc.sql` | `rpc_product_detail`, `rpc_categories_with_products` |
| 010 | `010_supplier_payments.sql` | `supplier_payments` таблиця, оновлений `rpc_suppliers_with_stats` |
| 011 | `011_categories_with_suppliers_rpc.sql` | `rpc_categories_with_suppliers` |
| 012 | `012_supplier_detail_rpc.sql` | `rpc_supplier_detail` — JSONB з накладними, товарами, платежами |
| 013 | `013_telegram_user_shop_mapping.sql` | `display_name`, `phone`, `shop_id` на `telegram_users`; onboarding steps |
| 014 | `014_warehouse_shop_directory.sql` | `warehouse_type` enum, `parent_shop_id`, `v_warehouse_directory`, `rpc_warehouse_directory` |
| 015 | `015_fix_security_grants.sql` | Безпека: REVOKE ALL від anon, GRANT SELECT only, Telegram RPC → service_role only |
| 016 | `016_fix_cartesian_grants_and_integrity.sql` | Cartesian multiplication fix (LATERAL), `SECURITY INVOKER`, FK constraints, JSONB return types, p_page validation |
| 017 | `017_fix_inventory_atomic_stock_and_audit.sql` | Code-review batch: `complete_inventory` RECORD fix, `telegram_get_catalog_text` nested-agg fix, UNIQUE on `telegram_pending_orders`, atomic `update_stock_balance`, `confirm_receipt` lock, drop duplicate status triggers, `set_initial_stock` semantics, `<=` consistency |
| 018 | `018_fix_atomic_pending_and_edit.sql` | `rpc_pending_order_add_item` (atomic JSONB array merge), `rpc_telegram_replace_order_items` (atomic DELETE+INSERT) |
| 019 | `019_fix_ship_order_grants_audit_indexes.sql` | Compensating fix to 017: `ship_order` full restore (number, shop_id, shipment_items, partial-ship), REVOKE EXECUTE on low-level stock writers from anon, `confirm_receipt.updated_at`, NUMERIC pending qty, audit DELETE, `pg_trgm` indexes, partial unique on `orders.telegram_message_id` |
| 020 | `020_rpc_create_receipt.sql` | `rpc_create_receipt_with_items` — atomic receipt header + items in one transaction, allocates number server-side |
| 021 | `021_telegram_create_order_warehouse_from_shop.sql` | `telegram_create_order` no longer defaults `p_warehouse_id` to 1 — falls back to `shops.warehouse_id` |
| 022 | `022_ukrainian_notes.sql` | `confirm_transfer` / `confirm_write_off` notes translated RU→UA, plus `FOR UPDATE` + status guard |
| 023 | `023_webhook_outbox_retention.sql` | `cleanup_webhook_outbox(p_days)` + optional `pg_cron` daily job |
| 024 | `024_next_document_number_year_safe.sql` | Year + counter atomic via INSERT…RETURNING (closes midnight race) |
| 025 | `025_confirm_rpcs_return_jsonb.sql` | `confirm_receipt` / `confirm_transfer` / `confirm_write_off` / `complete_inventory` now return JSONB so frontend can do local row updates without refetch |

## Структура проєкту

```
warehouse-crm/
├── src/
│   ├── middleware.ts                        # Shared-password gate (S8)
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/login/route.ts          # POST = login, DELETE = logout
│   │   │   └── telegram/webhook/route.ts    # Telegram Bot (POST)
│   │   ├── login/page.tsx                   # Сторінка входу
│   │   ├── audit/page.tsx                   # Журнал аудиту
│   │   ├── inventory/page.tsx               # Інвентаризація
│   │   ├── orders/                          # Заявки магазинів
│   │   │   ├── [id]/page.tsx                # Деталі заявки + редагування позицій
│   │   │   └── page.tsx                     # Список з пагінацією
│   │   ├── products/{[id]/,new/,page.tsx}   # Товари
│   │   ├── receipts/{[id]/,new/,page.tsx}   # Накладні
│   │   ├── shipments/page.tsx               # Відвантаження
│   │   ├── shops/page.tsx                   # Магазини
│   │   ├── suppliers/{[id]/,page.tsx}       # Постачальники
│   │   ├── transfers/page.tsx               # Переміщення
│   │   ├── warehouses/page.tsx              # Склади
│   │   ├── write-offs/page.tsx              # Списання
│   │   ├── globals.css                      # Tailwind CSS v4 + тема
│   │   ├── layout.tsx                       # Root layout + DialogProvider
│   │   └── page.tsx                         # Дашборд
│   ├── components/
│   │   ├── DialogProvider.tsx               # useDialog() — confirm/alert
│   │   ├── ExportButton.tsx                 # XLSX експорт
│   │   └── Sidebar.tsx                      # Бокова навігація + Logout
│   └── lib/
│       ├── api.ts                           # Всі Supabase RPC/table обгортки
│       ├── supabase.ts                      # Lazy singleton (throws якщо .env пустий)
│       └── types.ts                         # TypeScript інтерфейси
├── supabase/migrations/household/0NN_*.sql  # Міграції (Supabase Studio apply)
├── docs/                                    # Документація (цей файл, ERD, OpenAPI, Architecture)
├── AGENTS.md                                # Контекст проєкту (без секретів)
├── PLAN.md                                  # План фіксів першого код-рев'ю
├── REVIEW_PLAN.md                           # Поточний статус усіх findings (S1–L10)
└── SECURITY_ROTATION.md                     # Чекліст ротації ключів + filter-repo (S1)
```

## Ключові рішення

- **Бізнес-логіка в БД**: всі RPC, тригери, функції — в PostgreSQL.
- **Немає окремого бекенду**: Next.js → Supabase SDK → RPCs напряму.
- **Read-only RPCs**: `SECURITY INVOKER` (RLS застосовується). Write RPCs — `SECURITY DEFINER`. Low-level writers (`update_stock_balance`, `set_initial_stock`) — тільки `service_role` (мігр. 019).
- **Атомарність**: `update_stock_balance` через `ON CONFLICT DO UPDATE SET quantity = sb.quantity + EXCLUDED.quantity` (мігр. 017); `confirm_*`/`ship_order` беруть `FOR UPDATE` lock; `rpc_create_receipt_with_items` (мігр. 020) робить header+items в одній транзакції.
- **Telegram webhook**: `service_role` (RLS bypass) + перевірка `X-Telegram-Bot-Api-Secret-Token`, rate limit 500ms/user, dedup за `orders.telegram_message_id` (мігр. 019 partial unique).
- **Operator login (S8)**: shared password + cookie `op_session` (middleware). Вимикається порожніми env vars.
- **Аудит**: тригери на 19 таблицях логують INSERT/UPDATE/DELETE в `audit_log`. DELETE починає записуватися з мігр. 019 (fix). Дублі status-тригерів видалені там же.
- **Схема**: `household_chemicals` — вимагає `ALTER ROLE authenticator SET pgrst.db_schemas TO 'public, household_chemicals'`.
- **Документи / номери**: `next_document_number(prefix)` атомарно бере year+counter через `INSERT…RETURNING` (мігр. 024 — закриває півночну race).
- **Pошук товарів**: `pg_trgm` + GIN на `products.name` і `products.sku` (мігр. 019).
- **Дублювання міграцій**: `warehouse-crm/supabase/migrations/household/` (Supabase Studio apply) — основне місце. Друга копія в репо корені `D:\Химия замолвення ГБ\supabase\migrations\household\` — для зовнішніх скриптів. Тримати синхронно.
