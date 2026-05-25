# Clean Architecture

## Огляд

Проєкт використовує Clean Architecture з трьома чіткими шарами. Відмінність від класичного підходу — **бізнес-логіка знаходиться в PostgreSQL**, а не в окремому бекенд-сервісі.

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                           │
│  Next.js 16 App Router  │  React 19  │  Tailwind CSS v4         │
│  Sidebar  │  Dashboard  │  Products  │  Suppliers  │  Receipts  │
├─────────────────────────────────────────────────────────────────┤
│                    APPLICATION LAYER                            │
│  api.ts (RPC wrappers)  │  route.ts (Telegram webhook)          │
│  supabase.ts (client)   │  types.ts (interfaces)                │
├─────────────────────────────────────────────────────────────────┤
│                     DOMAIN LAYER                                │
│  PostgreSQL SECURITY DEFINER RPCs  │  Triggers                   │
│  Business Logic  │  Stock management  │  Document flow           │
├─────────────────────────────────────────────────────────────────┤
│                    DATA / INFRASTRUCTURE                         │
│  Supabase (PostgreSQL 15)  │  Poster API  │  Telegram API         │
│  30 tables  │  8 views  │  RLS  │  Audit logging                │
└─────────────────────────────────────────────────────────────────┘
```

## Потік залежностей

```
Presentation → Application → Domain (PostgreSQL RPCs)
     │              │                │
     └──────┬───────┘                │
            │                        │
     Supabase SDK              SECURITY INVOKER (read-only RPCs)
     (household_chemicals       SECURITY DEFINER (write RPCs,
      schema)                   Telegram RPCs)
```

Всі шари залежать від **Domain Layer**, який є центральним і не залежить ні від чого.
Read-only RPCs (статистика, каталог) працюють як `SECURITY INVOKER`, тому на них діють RLS політики анонімного користувача.
Бізнес-логіка (проведення документів, Telegram RPCs) працює як `SECURITY DEFINER` — з правами власника схеми.

---

## Шар 1: Presentation Layer (Next.js)

**Відповідальність**: UI, маршрутизація, візуалізація даних.

### Page Routes

```mermaid
graph TD
    subgraph "Presentation Layer"
        direction LR
        D[Dashboard /]
        P[Products /products]
        PD[Product Detail /products/[id]]
        PE[Product Edit /products/[id]/edit]
        PN[New Product /products/new]
        S[Suppliers /suppliers]
        SD[Supplier Detail /suppliers/[id]]
        R[Receipts /receipts]
        RD[Receipt Detail /receipts/[id]]
        RN[New Receipt /receipts/new]
        O[Orders /orders]
        SH[Shipments /shipments]
        TR[Transfers /transfers]
        WO[Write-offs /write-offs]
        I[Inventory /inventory]
        W[Warehouses /warehouses]
        SP[Shops /shops]
        A[Audit /audit]
    end

    D --> P
    D --> R
    D --> O
    P --> PD
    PD --> PE
    S --> SD
    R --> RD
```

### Компоненти

| Компонент | Файл | Призначення |
|---|---|---|
| `Sidebar` | `components/Sidebar.tsx` | Бокова навігація з колапсом |
| `ExportButton` | `components/ExportButton.tsx` | Експорт в XLSX |

### Стилізація

- Tailwind CSS v4
- CSS custom properties (`--color-*`) для брендування
- Inter font через `next/font/google`
- Responsive дизайн (mobile first)

---

## Шар 2: Application Layer

**Відповідальність**: координація, адаптація даних, інтеграція.

### 2.1 API Wrappers (`lib/api.ts`)

```mermaid
graph LR
    subgraph "Frontend Pages"
        Dashboard
        Products
        Receipts
        Suppliers
    end
    subgraph "api.ts"
        fetchDashboardSummary
        fetchProducts
        fetchReceiptDetail
        fetchSupplierDetail
    end
    subgraph "Supabase RPCs"
        rpc_dashboard_summary
        rpc_product_catalog
        confirm_receipt
        rpc_supplier_detail
    end

    Dashboard --> fetchDashboardSummary
    Products --> fetchProducts
    Receipts --> fetchReceiptDetail
    Suppliers --> fetchSupplierDetail
    fetchDashboardSummary --> rpc_dashboard_summary
    fetchProducts --> rpc_product_catalog
    fetchReceiptDetail --> confirm_receipt
    fetchSupplierDetail --> rpc_supplier_detail
```

| Функція | Тип | Опис |
|---|---|---|
| `fetchDashboardSummary()` | RPC (SECURITY INVOKER) | Статистика + критичні товари + рухи |
| `fetchProducts()` | RPC | Каталог з пагінацією |
| `fetchProductDetail()` | RPC | Деталі товару (залишки, ціни, накладні) |
| `fetchCategoriesTree()` | RPC | Ієрархічні категорії |
| `fetchCategoriesWithProducts()` | RPC | Категорії з товарами |
| `fetchSuppliersWithStats()` | RPC | Постачальники зі статистикою |
| `fetchSupplierDetail()` | RPC | Деталі постачальника |
| `fetchSupplierPayments()` | Direct | Платежі постачальнику |
| `fetchCategoriesWithSuppliers()` | RPC | Категорії з постачальниками |
| `fetchOrders()` | RPC | Заявки з фільтрацією |
| `fetchOrderDetail()` | RPC | Деталі заявки |
| `fetchStockMovements()` | RPC | Журнал рухів |
| `fetchReceipts()` | Direct | Накладні |
| `fetchReceiptDetail()` | Direct | Деталі накладної |
| `createProduct()` | Direct | Створення товару |
| `updateProduct()` | Direct | Оновлення товару |
| `confirmReceipt()` | RPC | Проведення накладної |
| `shipOrder()` | RPC | Відвантаження за заявкою |
| `confirmTransfer()` | RPC | Проведення переміщення |
| `confirmWriteOff()` | RPC | Проведення списання |
| `completeInventory()` | RPC | Завершення інвентаризації |
| `createSupplierPayment()` | Direct | Додати платіж |

### 2.2 Telegram Webhook (`route.ts`)

Єдина публічна API route — обробник Telegram Bot.

**Ендпоінт**: `POST /api/telegram/webhook`

**Потік обробки**:

```mermaid
sequenceDiagram
    participant TG as Telegram
    participant WH as Webhook (route.ts)
    participant SR as Supabase (service_role)
    participant BD as PostgreSQL

    TG->>WH: POST update (message/callback)
    Note over WH: Перевірка secret_token
    Note over WH: Rate limiting (500ms/user)
    Note over WH: Логування в telegram_messages_log

    alt /start, /help
        WH->>TG: Вітальне повідомлення
    else /setup
        WH->>TG: Запуск онбордінгу
        Note over TG: Ім'я → Магазин → Телефон
        WH->>SR: telegram_get_or_create_user
    else /order
        WH->>SR: rpc_product_catalog
        WH->>TG: Оберіть товари
        Note over TG: Категорії → Товари → Кількість → Підтвердження
        WH->>SR: telegram_create_order
        WH->>TG: Заявка створена
    else /catalog
        WH->>SR: telegram_get_catalog_text
        WH->>TG: Каталог
    else /status
        WH->>SR: telegram_check_order_status
        WH->>TG: Статус заявки
    end
```

### 2.3 Supabase Client (`lib/supabase.ts`)

```mermaid
classDiagram
    class SupabaseClient {
        <<singleton>>
        +getSupabase(): SupabaseClient
        +getServiceSupabase(): SupabaseClient
    }
    class Proxy {
        <<proxy>>
        +get(target, prop): method
    }
    SupabaseClient --> Proxy : lazy singleton
    Proxy --> SupabaseClient : delegates to getSupabase()
```

- **`getSupabase()`** — анонімний клієнт для фронтенду (SELECT + `SECURITY INVOKER` RPCs)
- **`getServiceSupabase()`** — service_role клієнт для Telegram webhook (RLS bypass, викликає `SECURITY DEFINER` Telegram RPCs)
- **Прокидає `TELEGRAM_WEBHOOK_SECRET`** — перевіряє `X-Telegram-Bot-Api-Secret-Token` з env
- **Proxy** — дозволяє використовувати `supabase.rpc()` без явного виклику `getSupabase()`
- Схема за замовчуванням: `household_chemicals`
- Rate limiting: 500ms між повідомленнями від одного користувача

---

## Шар 3: Domain Layer (PostgreSQL)

**Відповідальність**: бізнес-логіка, валідація, цілісність даних.

### Діаграма компонентів

```mermaid
graph TD
    subgraph "Domain Layer — PostgreSQL"
        direction TB
        
        subgraph "Business RPCs"
            BR1[confirm_receipt]
            BR2[ship_order]
            BR3[confirm_transfer]
            BR4[confirm_write_off]
            BR5[complete_inventory]
            BR6[set_initial_stock]
        end
        
        subgraph "Stock Engine"
            SE[update_stock_balance]
            SB[(stock_balances)]
            SM[(stock_movements)]
        end
        
        subgraph "Query RPCs (SECURITY INVOKER)"
            QR1[rpc_dashboard_summary]
            QR2[rpc_product_catalog]
            QR3[rpc_product_detail]
            QR4[rpc_supplier_detail]
            QR5[rpc_orders_list]
            QR6[rpc_stock_movements_list]
            QR7[rpc_shops_with_stats]
            QR8[rpc_warehouses_with_stats]
            QR9[rpc_categories_with_suppliers]
        end
        
        subgraph "Telegram RPCs (SECURITY DEFINER)"
            TR1[telegram_get_or_create_user]
            TR2[telegram_create_order]
            TR3[telegram_check_order_status]
            TR4[telegram_get_catalog_text]
        end
        
        subgraph "Triggers"
            TG1[audit_trigger_func → audit_log]
            TG2[audit_status_change → audit_log]
            TG3[trigger_order_webhook → webhook_outbox]
            TG4[trigger_set_updated_at]
        end

        BR1 --> SE
        BR2 --> SE
        BR3 --> SE
        BR4 --> SE
        BR5 --> SE
        BR6 --> SE
        SE --> SB
        SE --> SM
        TR2 --> BR5
    end
```

### Бізнес-правила

| Правило | Реалізація |
|---|---|
| Оприбуткування → +stock | `confirm_receipt()` → `update_stock_balance()` |
| Списання → -stock | `confirm_write_off()` → `update_stock_balance()` |
| Переміщення → -source, +target | `confirm_transfer()` → 2× `update_stock_balance()` |
| Заявка → shipment → -stock | `ship_order()` → створює shipment → `update_stock_balance()` |
| Інвентаризація → +/-stock | `complete_inventory()` → `update_stock_balance(diff)` |
| Кількість > 0 | CHECK `(quantity > 0)` на всіх item tables |
| Статусний lifecycle | CHECK з переліком допустимих статусів |
| Кожна зміна → audit_log | Тригери на 19 таблицях |
| Зміна статусу → webhook | Тригер `trigger_order_webhook` |

---

## Шар 4: Data / Infrastructure Layer

**Відповідальність**: зберігання, зовнішні інтеграції.

### 4.1 Database

```mermaid
graph LR
    subgraph "PostgreSQL (Supabase)"
        subgraph "Schema: household_chemicals"
            direction TB
            REF[Reference Data<br/>categories, products,<br/>suppliers, warehouses, shops]
            DOC[Documents<br/>receipts, orders,<br/>shipments, transfers, write-offs]
            STK[Stock<br/>stock_balances,<br/>stock_movements]
            AUD[Audit<br/>audit_log]
            TEL[Telegram<br/>telegram_* tables]
            INT[Integration<br/>api_integration_log,<br/>webhook_outbox, sync_status]
        end
    end
    
    subgraph "External"
        POSTER[Poster API]
        TELEGRAM[Telegram Bot API]
    end

    POSTER --> INT : синхронізація
    TELEGRAM --> TEL : webhook
    TEL --> DOC : telegram_create_order
```

### 4.2 Інтеграції

| Система | Напрям | Протокол | Дані |
|---|---|---|---|
| Poster API | Import | REST (token auth) | Товари, залишки, постачання, склади, магазини |
| Telegram Bot API | Bidirectional | Webhook (POST) | Замовлення, каталог, онбординг |

### 4.3 Security Model

```mermaid
graph TD
    subgraph "Access Levels"
        ANON[anon / authenticator]
        AUTH[authenticated]
        SRV[service_role]
    end

    subgraph "What they can do"
        ANON -->|SELECT only + SECURITY INVOKER RPCs| TABLES[(All Tables)]
        ANON -->|Execute read-only RPCs| SAFE[Read-only RPCs<br/>(SECURITY INVOKER)]
        AUTH -->|SELECT| TABLES
        AUTH -->|INSERT/UPDATE| TABLES_WRITE[(Tables - with role check)]
        SRV -->|ALL| ALL[(Everything)]
        SRV -->|Telegram RPCs + Business RPCs| TELR[Telegram + Business functions<br/>(SECURITY DEFINER)]
    end

    subgraph "Role checks"
        TABLES_WRITE -->|get_user_role| ADMIN[admin]
        TABLES_WRITE -->|get_user_role| OP[warehouse_operator]
        TABLES_WRITE -->|get_user_role| SM[shop_manager (orders only)]
    end

    subgraph "Rate limiting"
        RL[500ms between messages<br/>per Telegram user_id]
    end
    SAFE --> RL
```

---

## Потік даних: від UI до БД і назад

```mermaid
sequenceDiagram
    participant UI as React Page
    participant API as api.ts
    participant S as Supabase SDK
    participant RPC as PostgreSQL RPC
    participant DB as Tables

    UI->>API: виклик функції
    API->>S: supabase.rpc('rpc_name', params)
    S->>RPC: запит через REST/GraphQL
    Note over RPC: SECURITY INVOKER (read-only)<br/>SECURITY DEFINER (write)
    RPC->>DB: SELECT / INSERT / UPDATE
    DB-->>RPC: результат
    RPC-->>S: JSONB
    S-->>API: { data, error }
    API-->>UI: типізований об'єкт
    UI->>UI: рендер
```

---

## Структура міграцій

```
warehouse-crm/                          supabase/migrations/household/
├── 001_full_warehouse_schema.sql  ──►  ├── 001_full_warehouse_schema.sql
├── 002_telegram_bot_and_api_layer.sql  ├── 002_telegram_bot_and_api_layer.sql
├── ...                                 ├── ...
├── 015_fix_security_grants.sql         ├── 015_fix_security_grants.sql
└── 016_fix_cartesian_grants_and_...    └── 016_fix_cartesian_grants_and_...
```

Кожна міграція існує в обох директоріях (для git та для Supabase Studio).
Міграція #007 (SUPERSEDED #009) не застосовується.
