# Warehouse CRM — Household Chemicals

A full-featured warehouse management CRM for household chemicals, consumables, and packaging. Built for the "Halya Baluvana" chain (24+ shops in Chernivtsi, Ukraine).

## Stack

| Component | Technology |
|---|---|
| Frontend | Next.js 16 (App Router, TypeScript, Tailwind CSS v4) |
| Backend | PostgreSQL 15 (all business logic in RPCs, triggers, functions) |
| Database | Supabase (self-hosted) |
| Schema | `household_chemicals` (custom, not `public`) |
| Chat | Telegram Bot API (webhook) |
| Data Source | Poster API (products, stock, supplies) |

## Architecture

- **Clean Architecture**: Presentation (Next.js) → Application (api.ts, webhook) → Domain (PostgreSQL RPCs) → Data (Supabase, Poster, Telegram)
- **No separate backend**: Next.js → Supabase SDK → RPCs directly
- **Read-only RPCs**: `SECURITY INVOKER` (RLS applies), write/Telegram RPCs: `SECURITY DEFINER`
- **Full audit trail**: triggers on all 30+ tables log every INSERT/UPDATE/DELETE

## Features

- **Dashboard**: warehouse stats, critical stock alerts, pending orders, recent movements
- **Products**: catalog with category grouping, stock per warehouse, price history chart
- **Suppliers**: grouped by product categories, delivery statistics, payment tracking
- **Receipts**: create/confirm goods receipt notes with batch item entry
- **Orders**: Telegram-based ordering from shops, operator confirmation/shipment
- **Warehouses**: 38 locations (24 shops, 6 workshops, 7 storages, 1 customer)
- **Telegram Bot**: interactive order flow (categories → products → quantity → confirm), catalog, onboarding, order status
- **Audit**: full change history with user attribution

## Documentation

| Document | Description |
|---|---|
| [docs/index.md](docs/index.md) | Project overview, migration table, structure |
| [docs/clean-architecture.md](docs/clean-architecture.md) | 4-layer architecture with Mermaid diagrams |
| [docs/database-erd.md](docs/database-erd.md) | ERD for all 30+ tables with relationships |
| [docs/API.md](docs/API.md) | Full API reference with examples |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | C4 diagrams, domain model, business processes |
| [docs/openapi.yaml](docs/openapi.yaml) | OpenAPI 3.0 specification |

## Database

16 migrations applied. All schema in `household_chemicals` namespace.
- 30+ tables, 8 views, 35+ RPC functions
- Business logic: `confirm_receipt`, `ship_order`, `confirm_transfer`, `confirm_write_off`, `complete_inventory`
- Stock engine: `update_stock_balance` updates `stock_balances` + logs `stock_movements`
- Telegram: `telegram_create_order`, `telegram_get_or_create_user`, `telegram_get_catalog_text`

## Local Development

```bash
pnpm install
pnpm dev    # runs on port 3001
```

Supabase self-hosted at `https://supabase.dmytrotovstytskyi.online`
Migrations applied via Supabase Studio SQL Editor from `supabase/migrations/`

## Telegram Bot

Commands: `/start`, `/order`, `/catalog`, `/status`, `/cancel`, `/setup`, `/myshop`, `/whoami`
Webhook requires a public URL with `secret_token` authentication.
