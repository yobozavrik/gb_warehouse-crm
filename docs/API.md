# API Documentation

**Base URL:** `https://supabase.dmytrotovstytskyi.online/rest/v1`  
**Schema:** `household_chemicals` (via `Accept-Profile: household_chemicals` header)  
**Auth:** Bearer JWT (anon key or service_role key)  
**Format:** JSON

---

## 1. Authentication

All requests require two headers:
- `apikey: <your-api-key>`
- `Authorization: Bearer <your-jwt>`

| Role | JWT `role` | Доступ |
|------|-----------|--------|
| `anon` | `anon` | SELECT на всі таблиці (через RLS policy `anon_read_all`) + `SECURITY INVOKER` RPCs (read-only статистика, каталог) |
| `authenticated` | `authenticated` | SELECT + INSERT/UPDATE (з перевіркою ролі) |
| `service_role` | `service_role` | Повний доступ (RLS bypass) + `SECURITY DEFINER` RPCs (business logic, Telegram) |

**Зміна в міграції #016:** Read-only RPCs (статистика, каталог, довідники) переведено з `SECURITY DEFINER` на `SECURITY INVOKER`. Це означає, що анонімний користувач може їх викликати, але права доступу обмежені RLS політиками анонімного користувача (SELECT only).

---

## 2. Дані через REST API (Табличний доступ)

Supabase PostgREST автоматично надає RESTful CRUD до всіх таблиць.  
Prefix: `/rest/v1/<table_name>` з заголовком `Accept-Profile: household_chemicals`.

### 2.1 Список довідників

| Table | Description | Key Links |
|-------|-------------|-----------|
| `product_categories` | Ієрархічні категорії товарів | parent_id -> self |
| `products` | Номенклатура товарів | category_id -> categories |
| `suppliers` | Постачальники | receipts via supplier_id |
| `warehouses` | Склади та цехи | poster_storage_id (Poster) |
| `shops` | Магазини | warehouse_id -> warehouses, poster_spot_id (Poster) |
| `users` | Користувачі системи | auth_user_id -> auth.users |

### 2.2 Список документів

| Table | Status Workflow |
|-------|-----------------|
| `receipts` | draft -> confirmed -> cancelled |
| `orders` | draft -> submitted -> confirmed -> partially_shipped -> shipped -> cancelled |
| `shipments` | draft -> packed -> shipped -> delivered -> cancelled |
| `transfers` | draft -> confirmed -> completed -> cancelled |
| `write_offs` | draft -> confirmed -> cancelled |
| `inventories` | draft -> in_progress -> completed -> cancelled |

### 2.3 Список рядків документів

| Table | Parent |
|-------|--------|
| `receipt_items` | receipt_id -> receipts |
| `order_items` | order_id -> orders |
| `shipment_items` | shipment_id -> shipments |
| `transfer_items` | transfer_id -> transfers |
| `write_off_items` | write_off_id -> write_offs |
| `inventory_items` | inventory_id -> inventories |

### 2.4 Складські залишки та аудит

| Table | Description |
|-------|-------------|
| `stock_balances` | Поточні залишки (product_id + warehouse_id UNIQUE) |
| `stock_movements` | Журнал рухів (immutable audit trail) |
| `audit_log` | Логування всіх дій користувачів |

### 2.5 Telegram та інтеграція

| Table | Description |
|-------|-------------|
| `telegram_chats` | Чати Telegram, прив'язані до складів |
| `telegram_users` | Користувачі Telegram |
| `telegram_pending_orders` | Незавершені замовлення через Telegram |
| `telegram_messages_log` | Лог повідомлень Telegram |
| `api_integration_log` | Лог API викликів (вхідні/вихідні) |
| `webhook_outbox` | Черга вебхуків для зовнішніх систем |
| `sync_status` | Статус синхронізації з зовнішніми системами |
| `document_sequences` | Автонумерація документів |

---

## 3. RPC (Remote Procedure Calls)

RPC викликаються через `POST /rest/v1/rpc/<function_name>`  
(або через `supabase.rpc('function_name', {params})` на фронтенді)

### 3.1 Core Business Logic

#### `confirm_receipt(p_receipt_id UUID, p_user_id UUID)`

Оприбутковує накладну. Додає товари до stock_balances, створює stock_movements.

**Параметри:**
| Поле | Тип | Опис |
|------|-----|------|
| `p_receipt_id` | UUID | ID накладної |
| `p_user_id` | UUID | ID користувача |

**Виклик:**
```js
supabase.rpc('confirm_receipt', { p_receipt_id: 'uuid', p_user_id: 'uuid' })
```

---

#### `ship_order(p_order_id UUID, p_user_id UUID)` -> UUID

Створює відвантаження з замовлення. Зменшує залишки.

**Параметри:**
| Поле | Тип | Опис |
|------|-----|------|
| `p_order_id` | UUID | ID замовлення |
| `p_user_id` | UUID | ID користувача |

**Повертає:** UUID створеної відвантаження (shipment_id)

---

#### `confirm_transfer(p_transfer_id UUID, p_user_id UUID)`

Проводить переміщення: зменшує на відправнику, збільшує на отримувачі.

---

#### `confirm_write_off(p_write_off_id UUID, p_user_id UUID)`

Списує товари зі складу.

---

#### `complete_inventory(p_inventory_id UUID, p_user_id UUID)`

Завершує інвентаризацію. Коригує залишки.

---

#### `next_document_number(p_prefix TEXT)` -> TEXT

**Параметри:**
| Поле | Тип | Опис |
|------|-----|------|
| `p_prefix` | TEXT | Префікс (напр. 'ORD', 'RCP', 'TRN') |

**Повертає:** Номер документа (напр. `ORD-2026-000001`)

---

### 3.2 Dashboard & Statistics

#### `rpc_dashboard_summary(p_warehouse_id INT DEFAULT NULL)` -> JSONB

**Опис:** Повна статистика для дашборду.

**Параметри:**
| Поле | Тип | Опис |
|------|-----|------|
| `p_warehouse_id` | INT | ID складу або NULL (всі) |

**Повертає (JSONB):**
```json
{
  "stats": {
    "products_in_stock": 156,
    "products_out_of_stock": 23,
    "critical_items": 12,
    "stock_value": 452300.00,
    "pending_orders": 5,
    "shipments_today": 3,
    "active_warehouses": 38,
    "draft_receipts": 2
  },
  "critical_items": [{ "product_id": 1, "product_name": "..." }],
  "pending_orders": [{ "id": "uuid", "order_number": "ORD-...", "shop_name": "...", "items_count": 3 }],
  "recent_movements": [{ "id": "uuid", "product_name": "...", "warehouse_name": "...", "movement_type": "...", "quantity_change": 10, "created_at": "..." }]
}
```

**Виклик:**
```js
const { data, error } = await supabase.rpc('rpc_dashboard_summary', { p_warehouse_id: null })
```

---

#### `rpc_shops_with_stats(p_days INT DEFAULT 30)` -> JSONB

**Опис:** Статистика по магазинах за період.

**Повертає** (таблиця):

| Поле | Тип | Опис |
|------|-----|------|
| `id` | INT | ID магазину |
| `name` | TEXT | Назва |
| `poster_spot_id` | INT | ID в Poster |
| `warehouse_id` | INT | ID прив'язаного складу |
| `warehouse_name` | TEXT | Назва складу |
| `products_in_stock` | BIGINT | Товарів в наявності |
| `critical_items` | BIGINT | Критичний мінімум |
| `total_stock_value` | NUMERIC | Вартість залишку |
| `receipts_count` | BIGINT | Приходів за період |
| `shipments_count` | BIGINT | Відвантажень за період |
| `transfers_in_count` | BIGINT | Переміщень (вхід) |
| `transfers_out_count` | BIGINT | Переміщень (вихід) |
| `write_offs_count` | BIGINT | Списань за період |
| `orders_count` | BIGINT | Замовлень за період |
| `last_receipt_date` | TIMESTAMPTZ | Останній прихід |
| `last_shipment_date` | TIMESTAMPTZ | Останнє відвантаження |

**Виклик:**
```js
const { data, error } = await supabase.rpc('rpc_shops_with_stats', { p_days: 14 })
```

---

#### `rpc_warehouses_with_stats(p_days INT DEFAULT 30)` -> JSONB

**Опис:** Статистика по складах та цехах.

Додаткові поля: `type` (shop/workshop/storage/other), `address`

---

#### `rpc_suppliers_with_stats()` -> TABLE

**Опис:** Статистика по постачальниках.

**Повертає** (таблиця):

| Поле | Тип | Опис |
|------|-----|------|
| `id` | INT | ID |
| `name` | TEXT | Назва |
| `contact_person` | TEXT | Контактна особа |
| `phone` | TEXT | Телефон |
| `email` | TEXT | Email |
| `address` | TEXT | Адреса |
| `edrpou` | TEXT | ЄДРПОУ |
| `payment_days` | INT | Відстрочка платежу |
| `category` | TEXT | Категорія |
| `website` | TEXT | Вебсайт |
| `is_active` | BOOLEAN | Активний |
| `total_receipts` | BIGINT | Всього поставок |
| `total_products_supplied` | BIGINT | Всього товарів |
| `total_amount` | NUMERIC | На загальну суму |
| `receipts_30d` | BIGINT | Поставок за 30 днів |
| `last_receipt_date` | TIMESTAMPTZ | Остання поставка |
| `first_receipt_date` | TIMESTAMPTZ | Перша поставка |

---

#### `rpc_orders_list(...)` -> JSONB

**Параметри:** status, warehouse_id, shop_id, source, date_from, date_to, page, page_size

**Повертає** paginated JSONB.

---

#### `rpc_stock_movements_list(...)` -> JSONB

**Параметри:** product_id, warehouse_id, movement_type, date_from, date_to, page, page_size

---

#### `rpc_product_catalog(...)` -> JSONB

**Параметри:** category_id, search, warehouse_id, page, page_size

**Повертає:** Каталог товарів із залишками по складах (JSONB).

---

#### `rpc_categories_tree()` -> JSONB

**Повертає:** Рекурсивне дерево категорій.

---

#### `rpc_order_detail(p_order_id UUID)` -> JSONB

**Повертає:** Деталі замовлення з позиціями та відвантаженнями.

---

### 3.3 Telegram Bot Functions

#### `telegram_get_or_create_user(p_user_id BIGINT, p_username TEXT, p_first_name TEXT, p_last_name TEXT)` -> JSONB

**Опис:** Створює або оновлює користувача Telegram. Повертає JSONB (було table row, змінено в #016).

---

#### `telegram_create_order(p_telegram_user_id, p_shop_id, p_warehouse_id, p_items JSONB, p_notes, p_telegram_message_id)` -> JSONB

**Опис:** Створює замовлення з Telegram.

**Параметри:**
| Поле | Тип | Опис |
|------|-----|------|
| `p_items` | JSONB | `[{"product_id":1, "quantity":5}, ...]` |

---

#### `telegram_get_catalog_text(p_category_id, p_warehouse_id, p_search)` -> TEXT

**Опис:** Повертає каталог як відформатований текст для Telegram.

---

#### `telegram_check_order_status(p_order_number TEXT)` -> JSONB

**Опис:** Перевіряє статус замовлення за номером.

---

### 3.4 Webhook & API Logging

#### `webhook_enqueue(p_event_type, p_payload, p_target_url, p_target_system)` -> UUID

**Опис:** Додає подію до черги вебхуків.

---

#### `api_log(direction, method, endpoint, request_body, response_status, response_body, source, duration_ms, error_message, created_by)` -> UUID

**Опис:** Логує API виклик.

---

## 4. Використання на фронтенді

### 4.1 Клієнт

```typescript
import { supabase } from '@/lib/supabase'

// Табличний запит
const { data } = await supabase.from('products').select('*').order('name')

// Табличний запит з фільтрацією
const { data } = await supabase
  .from('receipts')
  .select('*, supplier:supplier_id(name), warehouse:warehouse_id(name)')
  .eq('status', 'draft')
  .order('created_at', { ascending: false })

// RPC виклик
const { data, error } = await supabase.rpc('rpc_shops_with_stats', { p_days: 14 })
```

### 4.2 API Layer (lib/api.ts)

```typescript
import { supabase } from './supabase'

// Приклад: отримання дашборду
export async function fetchDashboardSummary(warehouseId?: number) {
  const { data, error } = await supabase.rpc('rpc_dashboard_summary', {
    p_warehouse_id: warehouseId || null,
  })
  if (error) throw error
  return data as DashboardSummary
}
```

---

## 5. Приклади curl

```bash
# Отримати всі магазини
curl -X GET "https://supabase.dmytrotovstytskyi.online/rest/v1/shops?select=id,name,poster_spot_id&order=name.asc" \
  -H "apikey: <anon_key>" \
  -H "Authorization: Bearer <anon_key>" \
  -H "Accept-Profile: household_chemicals"

# Викликати RPC статистики магазинів
curl -X POST "https://supabase.dmytrotovstytskyi.online/rest/v1/rpc/rpc_shops_with_stats" \
  -H "apikey: <anon_key>" \
  -H "Authorization: Bearer <anon_key>" \
  -H "Accept-Profile: household_chemicals" \
  -H "Content-Type: application/json" \
  -d '{"p_days": 14}'
```
