# Архітектура проєкту

**Проєкт:** Складський облік — Галя Балувана  
**Призначення:** Управління запасами побутової хімії, витратних матеріалів, упаковки та супутніх товарів мережі закладів "Галя Балувана" (Чернівці, 24+ магазини)  
**Стек:** Next.js 16 + Supabase (self-hosted) + PostgreSQL + Telegram Bot

---

## 1. Clean Architecture (4 рівні)

```mermaid
C4Context
  title System Context — Складський облік

  Person(operator, "Оператор складу", "Співробітник, який веде облік")
  Person(shopManager, "Управляючий магазином", "Замовляє товари через CRM або Telegram")
  Person(admin, "Адміністратор", "Керує довідниками та користувачами")

  System(crm, "Warehouse CRM", "Next.js 16 веб-застосунок")
  System(supabase, "Supabase", "Self-hosted: PostgreSQL + PostgREST + Auth")
  System(telegram, "Telegram Bot", "Приймає замовлення від магазинів")
  System_Ext(poster, "Poster POS", "Зовнішня POS-система (довідники)")

  Rel(operator, crm, "Керує складом", "HTTPS")
  Rel(shopManager, crm, "Переглядає/замовляє", "HTTPS")
  Rel(shopManager, telegram, "Замовляє", "Telegram API")
  Rel(crm, supabase, "Читає/пише дані", "PostgREST")
  Rel(telegram, supabase, "Читає/пише дані", "PostgREST")
  Rel(crm, poster, "Синхронізує довідники", "REST API")
```

```mermaid
C4Container
  title Container Diagram — Warehouse CRM

  Person(operator, "Оператор", "Співробітник")

  System_Boundary(crm_web, "Next.js 16 Frontend") {
    Container(dashboard, "Dashboard", "React", "Статистика, критичні залишки")
    Container(shops, "Магазини", "React", "Картки зі статистикою")
    Container(warehouses, "Склади", "React", "Картки зі статистикою")
    Container(products, "Товари", "React", "Каталог + форма")
    Container(receipts, "Накладні", "React", "Прибуткові документи")
    Container(orders, "Заявки", "React", "Замовлення магазинів")
    Container(api, "API Layer", "TypeScript", "lib/api.ts — виклики RPC/таблиць")
    Container(supabaseClient, "Supabase Client", "TypeScript", "lib/supabase.ts — клієнт")
  }

  System_Boundary(supabase_backend, "Self-hosted Supabase") {
    ContainerDb(db, "PostgreSQL", "household_chemicals схема")
    Container(rpc, "PostgREST API", "REST", "Автоматичний REST API для таблиць + RPC")
    Container(auth, "Supabase Auth", "JWT", "Аутентифікація")
  }

  System_Ext(telegram, "Telegram Bot", "Прийом замовлень")

  Rel(operator, dashboard, "Переглядає")
  Rel(operator, shops, "Переглядає")
  Rel(operator, receipts, "Створює/підтверджує")
  Rel(operator, orders, "Обробляє")
  Rel(dashboard, api, "Викликає")
  Rel(shops, api, "Викликає")
  Rel(api, rpc, "RPC/табличні запити")
  Rel(api, supabaseClient, "Використовує")
  Rel(supabaseClient, rpc, "HTTPS + JWT")
  Rel(rpc, db, "SQL")
  Rel(telegram, rpc, "Telegram API")
```

```mermaid
C4Component
  title Component Diagram — Серверна частина (PostgreSQL)

  ContainerDb(db, "PostgreSQL", "household_chemicals")

  System_Boundary(tables, "Таблиці (27)") {
    Component(refs, "Довідники", "categories, products, suppliers, warehouses, shops, users")
    Component(docs, "Документи", "receipts, orders, shipments, transfers, write_offs, inventories")
    Component(items, "Рядки документів", "receipt_items, order_items, shipment_items, transfer_items, write_off_items, inventory_items")
    Component(stock, "Складські залишки", "stock_balances, stock_movements")
    Component(audit, "Аудит", "audit_log")
    Component(telegram_tables, "Telegram", "telegram_chats/users/pending_orders/messages_log")
    Component(api_tables, "API", "api_integration_log, webhook_outbox, sync_status, document_sequences")
  }

  System_Boundary(functions, "Функції (28+)") {
    Component(rpc_business, "Бізнес-логіка", "confirm_receipt, ship_order, confirm_transfer, confirm_write_off, complete_inventory")
    Component(rpc_core, "Ядро", "update_stock_balance, log_action, get_user_role, next_document_number")
    Component(rpc_stats, "Статистика (SECURITY INVOKER)", "rpc_shops_with_stats, rpc_warehouses_with_stats, rpc_suppliers_with_stats, rpc_supplier_detail, rpc_categories_with_suppliers")
    Component(rpc_dashboard, "Дашборд (SECURITY INVOKER)", "rpc_dashboard_summary, rpc_orders_list, rpc_stock_movements_list")
    Component(rpc_catalog, "Каталог (SECURITY INVOKER)", "rpc_product_catalog, rpc_categories_tree, rpc_order_detail, rpc_warehouse_directory")
    Component(rpc_telegram, "Telegram", "telegram_get_or_create_user, telegram_create_order, telegram_get_catalog_text")
  }

  System_Boundary(triggers, "Тригери") {
    Component(trg_audit, "Аудит", "На всі таблиці: INSERT/UPDATE/DELETE")
    Component(trg_status, "Статуси", "На зміну статусу документів")
    Component(trg_webhook, "Webhook", "На зміну статусу замовлень")
  }

  System_Boundary(views, "Представлення (8)") {
    Component(v_dashboard, "v_dashboard_stats", "Статистика по складах (fixed #016)")
    Component(v_stock, "v_stock_summary", "Залишки з категоріями")
    Component(v_critical, "v_critical_stock", "Критичні залишки")
    Component(v_orders, "v_orders_with_details", "Замовлення з позиціями")
    Component(v_movements, "v_stock_movements_full", "Рухи товарів")
    Component(v_catalog, "v_product_catalog", "Каталог із залишками")
    Component(v_supplier, "v_supplier_stats", "Статистика постачальників (fixed #016)")
    Component(v_wh_dir, "v_warehouse_directory", "Довідник складів з типом")
  }

  Rel(tables, functions, "Використовує")
  Rel(triggers, functions, "Викликає")
  Rel(functions, tables, "Читає/пише")
  Rel(views, tables, "Будується на")
```

---

## 2. Domain Model (Clean Architecture)

```mermaid
classDiagram
  class ProductCategory {
    +Int id PK
    +String name
    +Int parent_id FK
    +String description
    +Int sort_order
  }

  class Product {
    +Int id PK
    +String name
    +String sku
    +String barcode
    +Int category_id FK
    +String unit
    +Decimal purchase_price
    +Decimal min_stock
    +Decimal max_stock
    +Boolean is_active
  }

  class Supplier {
    +Int id PK
    +String name
    +String edrpou
    +String category
    +Int payment_days
    +Boolean is_active
  }

  class Warehouse {
    +Int id PK
    +String name
    +String type
    +Int poster_storage_id
  }

  class Shop {
    +Int id PK
    +String name
    +Int warehouse_id FK
    +Int poster_spot_id
  }

  class User {
    +UUID id PK
    +String full_name
    +String role
    +Int warehouse_id FK
    +String telegram_chat_id
  }

  class StockBalance {
    +Int product_id FK
    +Int warehouse_id FK
    +Decimal quantity
  }

  class StockMovement {
    +UUID id PK
    +Int product_id FK
    +Int warehouse_id FK
    +Decimal quantity_change
    +String movement_type
    +String reference_type
    +UUID reference_id
  }

  class Receipt {
    +UUID id PK
    +String receipt_number
    +Int supplier_id FK
    +Int warehouse_id FK
    +String status
  }

  class Order {
    +UUID id PK
    +String order_number
    +Int shop_id FK
    +Int warehouse_id FK
    +String status
    +String source
  }

  class Shipment {
    +UUID id PK
    +String shipment_number
    +UUID order_id FK
    +Int warehouse_id FK
    +Int shop_id FK
    +String status
  }

  class Transfer {
    +UUID id PK
    +String transfer_number
    +Int from_warehouse_id FK
    +Int to_warehouse_id FK
    +String status
  }

  class WriteOff {
    +UUID id PK
    +String write_off_number
    +Int warehouse_id FK
    +String reason
    +String status
  }

  class Inventory {
    +UUID id PK
    +String inventory_number
    +Int warehouse_id FK
    +String status
  }

  ProductCategory "1" --> "*" Product : includes
  Supplier "1" --> "*" Receipt : supplies
  Warehouse "1" --> "*" StockBalance : contains
  Product "1" --> "*" StockBalance : has
  Warehouse "1" --> "*" Shop : assigned to
  Shop "1" --> "*" Order : requests
  Order "1" --> "*" Shipment : fulfills
  Warehouse "1" --> "*" Receipt : receives
  Warehouse "1" --> "*" Transfer : source/target
  Warehouse "1" --> "*" WriteOff : write-offs
  Warehouse "1" --> "*" Inventory : counted
  StockMovement --> Product : tracks
  StockMovement --> Warehouse : tracks
```

---

## 3. ERD (Схема бази даних)

```mermaid
erDiagram
  product_categories ||--o{ products : category
  suppliers ||--o{ receipts : supplier
  warehouses ||--o{ shops : warehouse_link
  warehouses ||--o{ stock_balances : warehouse
  products ||--o{ stock_balances : product
  warehouses ||--o{ receipts : target
  receipts ||--o{ receipt_items : items
  products ||--o{ receipt_items : product
  shops ||--o{ orders : shop
  warehouses ||--o{ orders : warehouse
  orders ||--o{ order_items : items
  products ||--o{ order_items : product
  orders ||--o{ shipments : order_ref
  warehouses ||--o{ shipments : warehouse
  shops ||--o{ shipments : shop
  shipments ||--o{ shipment_items : items
  products ||--o{ shipment_items : product
  warehouses ||--o{ transfers : from_wh
  warehouses ||--o{ transfers : to_wh
  transfers ||--o{ transfer_items : items
  products ||--o{ transfer_items : product
  warehouses ||--o{ write_offs : warehouse
  write_offs ||--o{ write_off_items : items
  products ||--o{ write_off_items : product
  warehouses ||--o{ inventories : warehouse
  inventories ||--o{ inventory_items : items
  products ||--o{ inventory_items : product
  warehouses ||--o{ stock_movements : warehouse
  products ||--o{ stock_movements : product

  product_categories {
    int id PK
    text name
    int parent_id FK
    text description
    int sort_order
    boolean is_active
  }

  suppliers {
    int id PK
    text name
    text contact_person
    text phone
    text email
    text edrpou
    int payment_days
    text category
    boolean is_active
  }

  warehouses {
    int id PK
    text name
    text type
    int poster_storage_id UK
    text address
    boolean is_active
  }

  shops {
    int id PK
    text name UK
    int warehouse_id FK
    int poster_spot_id
    text address
    boolean is_active
  }

  products {
    int id PK
    text name
    text sku UK
    text barcode
    int category_id FK
    text unit
    numeric purchase_price
    numeric min_stock
    numeric max_stock
    boolean is_active
  }

  stock_balances {
    int id PK
    int product_id FK
    int warehouse_id FK
    numeric quantity
    UK product_id_warehouse_id
  }

  stock_movements {
    uuid id PK
    int product_id FK
    int warehouse_id FK
    numeric quantity_change
    numeric quantity_before
    numeric quantity_after
    text movement_type
    text reference_type
    uuid reference_id
  }

  receipts {
    uuid id PK
    text receipt_number
    int supplier_id FK
    int warehouse_id FK
    text status
    text notes
    uuid created_by FK
  }

  receipt_items {
    uuid id PK
    uuid receipt_id FK
    int product_id FK
    numeric quantity
    numeric price
    numeric total
  }

  orders {
    uuid id PK
    text order_number
    int shop_id FK
    int warehouse_id FK
    text status
    text source
    text notes
  }

  order_items {
    uuid id PK
    uuid order_id FK
    int product_id FK
    numeric quantity_requested
    numeric quantity_shipped
  }

  shipments {
    uuid id PK
    text shipment_number
    uuid order_id FK
    int warehouse_id FK
    int shop_id FK
    text status
  }

  shipment_items {
    uuid id PK
    uuid shipment_id FK
    uuid order_item_id FK
    int product_id FK
    numeric quantity
  }

  transfers {
    uuid id PK
    text transfer_number
    int from_warehouse_id FK
    int to_warehouse_id FK
    text status
  }

  transfer_items {
    uuid id PK
    uuid transfer_id FK
    int product_id FK
    numeric quantity
  }

  write_offs {
    uuid id PK
    text write_off_number
    int warehouse_id FK
    text reason
    text status
  }

  write_off_items {
    uuid id PK
    uuid write_off_id FK
    int product_id FK
    numeric quantity
    numeric price
  }

  inventories {
    uuid id PK
    text inventory_number
    int warehouse_id FK
    text status
  }

  inventory_items {
    uuid id PK
    uuid inventory_id FK
    int product_id FK
    numeric expected_quantity
    numeric actual_quantity
    numeric difference
  }

  audit_log {
    uuid id PK
    uuid user_id FK
    text user_name
    text action
    text entity_type
    text entity_id
    jsonb changes
    text summary
  }

  telegram_chats {
    int id PK
    bigint chat_id UK
    text title
    text type
    int warehouse_id FK
  }

  telegram_users {
    int id PK
    bigint user_id UK
    text username
    uuid household_user_id FK
  }

  telegram_pending_orders {
    uuid id PK
    int telegram_user_id FK
    bigint chat_id
    text step
    int shop_id FK
    jsonb items
  }

  document_sequences {
    int id PK
    text prefix
    int last_number
    int year
    UK prefix_year
  }
```

---

## 4. Бізнес-процеси

```mermaid
flowchart TD
    %% Прихід товару
    A["Постачальник привозить товар"] --> B["Створення накладної receipt"]
    B --> C{"Підтвердження"}
    C -->|"Підтвердити"| D["confirm_receipt()"]
    D --> E["Створення stock_movements"]
    E --> F["Оновлення stock_balances"]
    C -->|"Скасувати"| G["Накладна скасована"]

    %% Замовлення магазину
    H["Магазин формує заявку"] --> I["Створення order"]
    I --> J{"Підтвердження складом"}
    J -->|"Підтвердити"| K["Створення shipment"]
    K --> L["ship_order()"]
    L --> M["Зменшення stock_balances"]
    M --> N["Створення stock_movements"]

    %% Переміщення
    O["Потреба перемістити товар"] --> P["Створення transfer"]
    P --> Q{"Підтвердження"}
    Q -->|"Підтвердити"| R["confirm_transfer()"]
    R --> S["Відправник: зменшення залишку"]
    R --> T["Отримувач: збільшення залишку"]

    %% Списання
    U["Товар зіпсований/прострочений"] --> V["Створення write_off"]
    V --> W{"Підтвердження"}
    W -->|"Підтвердити"| X["confirm_write_off()"]
    X --> Y["Зменшення stock_balances"]

    %% Інвентаризація
    Z["Планова інвентаризація"] --> AA["Створення inventory"]
    AA --> AB["Заповнення фактичних залишків"]
    AB --> AC{"Завершення"}
    AC -->|"Завершити"| AD["complete_inventory()"]
    AD --> AE["Коригування stock_balances"]
    AD --> AF["Створення inventory_correction рухів"]
```

---

## 5. Схема потоку даних (API Layer)

```mermaid
flowchart LR
    subgraph Frontend[Next.js Frontend]
        Pages["Pages (React)"] --> APILayer["lib/api.ts"]
        APILayer --> SupabaseClient["lib/supabase.ts"]
    end

    subgraph Supabase[Self-hosted Supabase]
        PG["PostgREST API"] --> RPCs["RPC Functions"]
        PG --> Tables["Tables REST"]
        RPCs --> DB[("PostgreSQL\nhousehold_chemicals")]
        Tables --> DB
    end

    subgraph External[Зовнішні системи]
        Poster["Poster POS"] -->|"Синхронізація довідників"| PG
        Telegram["Telegram Bot"] -->|"Замовлення"| PG
    end

    SupabaseClient -->|"HTTPS + JWT anon"| PG
```

---

## 6. Структура міграцій

```mermaid
timeline
    title Міграції бази даних
     2026-05-22 : Migration #1 : 001_schema : 27 таблиць, 8 views, 28 функцій, RLS, тригери
     2026-05-22 : Migration #2 : 002_telegram_bot : Telegram 4 таблиці, API лог, dashboard RPCs
     2026-05-22 : Migration #3 : 003_poster_refs : 38 складів, 24 магазини, poster_storage_id
     2026-05-22 : Migration #4 : 004_stats_rpc : RPC статистики складів/магазинів
     2026-05-22 : Migration #5 : 005_suppliers : edrpou, payment_days, v_supplier_stats
     2026-05-22 : Migration #6 : 006_poster_products : 160 товарів + залишки з Poster
     2026-05-22 : Migration #7 : 007_product_detail (SUPERSEDED)
     2026-05-22 : Migration #8 : 008_poster_supplies : 68 постачальників, 719 накладних
     2026-05-22 : Migration #9 : 009_product_detail_fix : rpc_product_detail, categories
     2026-05-22 : Migration #10 : 010_payments : supplier_payments, total_paid/debt
     2026-05-22 : Migration #11 : 011_cat_suppliers : rpc_categories_with_suppliers
     2026-05-22 : Migration #12 : 012_supplier_detail : rpc_supplier_detail JSONB
     2026-05-22 : Migration #13 : 013_telegram_onboard : display_name, phone, shop_id, onboarding
     2026-05-22 : Migration #14 : 014_warehouse_dir : warehouse_type, parent_shop_id, directory RPC
     2026-05-22 : Migration #15 : 015_security_grants : REVOKE ALL anon, GRANT SELECT, Telegram RPC security
     2026-05-25 : Migration #16 : 016_fix_cartesian : LATERAL subqueries, SECURITY INVOKER, FK fixes, p_page validation
```
