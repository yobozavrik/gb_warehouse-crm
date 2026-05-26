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
| [Clean Architecture](clean-architecture.md) | Шари, модулі, потік залежностей, діаграми |
| [Database ERD](database-erd.md) | Mermaid-діаграми всіх таблиць, зв'язків, views |
| [OpenAPI / Swagger](openapi.yaml) | Повна специфікація всіх RPC та API routes |

## Міграції (1–16)

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

## Структура проєкту

```
warehouse-crm/
├── src/
│   ├── app/
│   │   ├── api/telegram/webhook/route.ts   # Telegram Bot (POST)
│   │   ├── audit/page.tsx                   # Журнал аудиту
│   │   ├── inventory/page.tsx               # Інвентаризація
│   │   ├── orders/page.tsx                  # Заявки магазинів
│   │   ├── products/
│   │   │   ├── [id]/page.tsx                # Деталі товару
│   │   │   ├── [id]/edit/page.tsx           # Редагування товару
│   │   │   ├── new/page.tsx                 # Новий товар
│   │   │   └── page.tsx                     # Каталог товарів
│   │   ├── receipts/
│   │   │   ├── [id]/page.tsx                # Деталі накладної
│   │   │   ├── new/page.tsx                 # Нова накладна
│   │   │   └── page.tsx                     # Список накладних
│   │   ├── shipments/page.tsx               # Відвантаження
│   │   ├── shops/page.tsx                   # Магазини
│   │   ├── suppliers/
│   │   │   ├── [id]/page.tsx                # Деталі постачальника
│   │   │   └── page.tsx                     # Список постачальників
│   │   ├── transfers/page.tsx               # Переміщення
│   │   ├── warehouses/page.tsx              # Склади
│   │   ├── write-offs/page.tsx              # Списання
│   │   ├── globals.css                      # Tailwind CSS v4 + тема
│   │   ├── layout.tsx                       # Root layout з Sidebar
│   │   └── page.tsx                         # Дашборд
│   ├── components/
│   │   ├── ExportButton.tsx                 # XLSX експорт
│   │   └── Sidebar.tsx                      # Бокова навігація
│   └── lib/
│       ├── api.ts                           # Всі Supabase RPC/table обгортки
│       ├── supabase.ts                      # Lazy singleton Supabase клієнт
│       └── types.ts                         # TypeScript інтерфейси
├── 0*.sql                                   # Міграції (git-копія)
├── docs/                                    # Документація
├── AGENTS.md                                # Контекст проєкту
└── PLAN.md                                  # План фіксів код-рев'ю
```

## Ключові рішення

- **Бізнес-логіка в БД**: всі RPC, тригери, функції — в PostgreSQL
- **Немає окремого бекенду**: Next.js → Supabase SDK → RPCs напряму
- **Read-only RPCs**: `SECURITY INVOKER` (RLS застосовується), write RPCs — `SECURITY DEFINER`
- **Безпека**: Telegram webhook → `service_role` (RLS bypass), захищений `secret_token`, rate limiting (500ms/user)
- **Аудит**: тотальне логування всіх INSERT/UPDATE/DELETE через тригери
- **Схема**: `household_chemicals` — вимагає `ALTER ROLE authenticator SET pgrst.db_schemas TO 'public, household_chemicals'`
- **Webhook secret token**: `<redacted>`
- **Потрійне дублювання міграцій**: `warehouse-crm/` (git) + `supabase/migrations/household/` (Supabase Studio) + `supabase/migrations/` (альтернативний шлях)
