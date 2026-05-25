# План виправлення код-рев'ю

## Phase 1 — Critical (Frontend)

| # | Issue | Файл | Фікс |
|---|-------|------|------|
| C1 | `key` як пропс → edit form не працює | `products/[id]/edit/page.tsx` | Перейменувати `key` → `fieldKey` у Field компоненті |
| C2 | Mojibake `'С€С‚'` замість `'шт'` | `lib/api.ts` line 42 | Замінити на `'шт'` |
| C4 | Custom quantity: губляться попередні товари | `api/telegram/webhook/route.ts` | Фікс filter: брати всі items, не лише \_custom |

## Phase 2 — Critical + High (SQL — Migration #016)

| # | Issue | Файл (оригінал) | Фікс |
|---|-------|-----------------|------|
| C5-C8 | Cartesian multiplication в views/RPCs | 001, 002, 003, 004 | Рефакторинг: LATERAL subqueries замість множинних LEFT JOIN |
| C9 | NOT IN NULL trap | 008 | Замінити NOT IN → NOT EXISTS |
| C10 | v_supplier_stats без статус-фільтру | 005 | Додати `r.status = 'confirmed'` |
| H12 | GRANT ALL TO anon на supplier_payments | 010 (виправлено #015) | Готово |
| H13 | Dual-type: видалити старий `type` CHECK | 014 | Зняти CHECK з `warehouses.type`, deprecated колонку |
| H14 | rpc_order_detail не додано в re-grant | 015 | Додати `rpc_order_detail(UUID)` |
| H15 | telegram_get_or_create_user → JSONB | 002 | Обгорнути в `jsonb_build_object` |
| H16 | Fragmented categories | 001, 006 | Об'єднати назви категорій в українські |
| M7 | SECURITY DEFINER → SECURITY INVOKER | Всі | Змінити на SECURITY INVOKER для read-only RPC |
| M9 | CASCADE → RESTRICT на supplier_payments | 010 | Виправити ON DELETE |
| M11 | rpc_dashboard_summary returns NULL | 002 | Додати `COALESCE(v_result, ...)` |
| M12 | GREATEST(debt, 0) ховає переплати | 012 | Прибрати GREATEST |
| M13 | Подвійне сканування receipts | 012 | Оптимізувати в один CTE |
| M15 | Negative initial stock → inventory_correction | 006 | Змінити movement_type |

## Phase 3 — High (Ukrainian Compliance + Performance)

| # | Сторінка | Фікс |
|---|----------|------|
| H1 | `products/new/page.tsx` | Весь UI → українська |
| H2 | `receipts/new/page.tsx` | Весь UI → українська + batch insert |
| H3 | `orders/page.tsx` | Весь UI → українська, locale `'uk-UA'` |
| H4 | `shipments/page.tsx` | Весь UI → українська |
| H5 | `transfers/page.tsx` | Весь UI → українська |
| H6 | `write-offs/page.tsx` | Весь UI → українська |
| H7 | `inventory/page.tsx` | Весь UI → українська |
| H8 | `audit/page.tsx` | Весь UI → українська |
| H11 | `receipts/page.tsx` | `ml-13` → `ml-12` або `ml-14` |

## Phase 4 — Medium + Low

| # | Issue | Фікс |
|---|-------|------|
| M1 | Rate limiter не працює в serverless | Додати IP-based + user-based limit |
| M2 | Немає try/catch на tgSend | Додати per-call error handling |
| M3 | Dead imports в new/page.tsx | Видалити |
| M4 | Infinite loading на invalid ID | Додати `setLoading(false)` в else гілку |
| M5 | Stale Warehouse.type | Оновити union type |
| M6 | any замість типів | Замінити на конкретні типи |
| M8 | FK без ON DELETE SET NULL | Додати в міграцію |
| M10 | Немає валідації p_page | Додати `GREATEST` |
| M14 | Hardcoded poster_storage_id | Зробити параметром |
| L1-L12 | Різні low issues | Всі виправити |

## Процес

1. Фіксимо всі Critical frontend
2. Фіксимо всі Critical SQL → Migration #016
3. Фіксимо все Ukrainian compliance
4. Фіксимо Performance
5. Фіксимо Medium + Low
6. Запускаємо review sub-agent → оцінка ≥ 9
7. Якщо < 9 → дофікшуємо зауваження → повторюємо крок 6
