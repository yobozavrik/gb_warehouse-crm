# Telegram Bot — Детальний аудит

**Проект:** Warehouse CRM (хімія, замовлення ГБ)  
**Файл:** `src/app/api/telegram/webhook/route.ts` (1160 рядків)  
**Дата:** 27.05.2026  
**Автор:** Hermes (CEO-оркестратор)

---

## Зміст

1. [Архітектура огляд](#1-архітектура-огляд)
2. [Сценарії та flow](#2-сценарії-та-flow)
3. [Безпека](#3-безпека)
4. [БД інтеграція](#4-бд-інтеграція)
5. [Проблеми та ризики](#5-проблеми-та-ризики)
6. [Помилки (bugs)](#6-помилки-bugs)
7. [Рекомендації](#7-рекомендації)
8. [Підсумок](#8-підсумок)

---

## 1. Архітектура огляд

### Структура
```
src/app/api/telegram/webhook/route.ts
  ├── POST (основной handler)
  ├── Вспомогательные функции (tgSend, tgSendMenu, tgEditMenu, tgAnswerCallback)
  ├── Каталог/замовлення (showCategories, showShopSelection, showQuantityButtons)
  ├── Онбординг (startOnboarding, confirm/cancel)
  ├── Обработка callback-запросов (onboard:*, order:*, shopset:*, cat:*)
  ├── Обработка текстовых сообщений (команды, onboard, custom qty, group parsing)
  └── Парсинг групових заявок (parseGroupOrder, handleEditedOrderMessage)
```

**DB таблицы (schema `household_chemicals`):**
- `telegram_users` — привязка пользователей Telegram
- `telegram_pending_orders` — черновики заявок
- `telegram_messages_log` — лог всех сообщений
- `telegram_chats` — зарегистрированные чаты/группы (не используется в коде)
- `orders` / `order_items` — готовые заявки

**RPC функции (PostgreSQL):**
- `telegram_get_or_create_user(BIGINT, TEXT, TEXT, TEXT)` → JSONB
- `telegram_log_message(INT, BIGINT, INT, TEXT, ...)` → UUID
- `telegram_create_order(INT, INT, INT, JSONB, TEXT, TEXT)` → JSONB
- `telegram_check_order_status(TEXT)` → JSONB
- `telegram_get_catalog_text(INT, INT, TEXT)` → TEXT
- `rpc_pending_order_add_item(INT, BIGINT, INT, INT)` → JSONB
- `rpc_telegram_replace_order_items(UUID, JSONB)` → JSONB

### Зависимости
- **Supabase** (self-hosted) — база данных
- **Poster API** — источник данных о товарах/складах (через БД)
- **Telegram Bot API** — отправка/получение сообщений

---

## 2. Сценарії та flow

### 2.1 Онбординг (реєстрація)
```
/start (або первое сообщение без профиля)
  → startOnboarding()
  → запись pending_orders (step='onboarding_name')
  → "Крок 1/3: Введіть ПІБ"
      ↓ (текст)
  → step='onboarding_shop'
  → показ списка магазинов
      ↓ (callback onboard:shop:N)
  → step='onboarding_phone'
  → "Крок 3/3: Введіть телефон"
      ↓ (текст с телефоном)
  → step='onboarding_confirm'
  → показ данных + кнопки Підтвердити/Редагувати
      ↓ (callback onboard:confirm)
  → UPDATE telegram_users + DELETE pending → готово
```

### 2.2 Замовлення через особисті повідомлення
```
/order
  → если shop_id есть: создается pending_orders + показ категорий
  → если shop_id нет: выбор магазина → категории
      ↓ (callback order:cat:N)
  → список товаров в категории
      ↓ (callback order:prod:N)
  → выбор количества (preset 1,2,5,10,20,50,100,500 или своя кількість)
      ↓ (callback order:qty:N:M или ручной ввод)
  → товар добавлен, показ summary (order:add / order:confirm / order:cancel)
      ↓ (callback order:confirm)
  → telegram_create_order() + DELETE pending
  → "Створено! Номер: ORD-2026-xxxxxx"
```

### 2.3 Замовлення через груповий чат
```
Текст в группе:
┌─────────────────┐
│ Садова           │  ← первая строка → определение магазина
│ Мініпальчик 2    │  ← парсинг товаров (IDF + prefix matching)
│ СЕРВЕТКИ 5       │
│ Дякую            │  ← игнорируется
└─────────────────┘
→ telegram_create_order()
→ ответ в чат
```

**Редагування:** Если сообщение в группе отредактировано, `handleEditedOrderMessage()` заменяет все позиции в заявке (через `rpc_telegram_replace_order_items`).

### 2.4 Команды
- `/start` — онбординг или приветствие
- `/help` — список команд
- `/order` — новое замовлення
- `/catalog` — каталог (inline клавиатура)
- `/status <номер>` — статус заявки
- `/myshop` — выбор магазина
- `/whoami` — профиль
- `/setup` — перезаполнить профиль
- `/cancel` — отменить текущее замовлення

---

## 3. Безпека

### 3.1 Webhook secret token ✅
- Проверяется заголовок `x-telegram-bot-api-secret-token`
- Если `WEBHOOK_SECRET` не задан — проверка пропускается (graceful degradation)

### 3.2 Rate limiting ⚠️
- 500ms между сообщениями от одного пользователя
- **Проблема:** in-memory Map, сбрасывается при перезапуске сервера
- Cleanup через setInterval каждые 60 секунд — не сработает в serverless среде

### 3.3 Input sanitization ✅
- `safeText()` — обрезка длины
- `safeHTML()` — экранирование HTML-символов
- `safeInt()` — parseInt с fallback
- `safeQuantity()` — валидация числа (0..999999)
- `safeItems()` — проверка на Array

### 3.4 RLS политики
- Telegram таблицы: FORCE ROW LEVEL SECURITY
- service_role — полный доступ
- authenticated — SELECT для всех, INSERT только admin/warehouse_operator
- **Проблема:** вебхук использует service_role key — bypasses RLS

### 3.5 SECURITY DEFINER vs INVOKER
- Write/Telegram RPCs: `SECURITY DEFINER` (правильно, нужен полный доступ)
- Read-only RPCs: `SECURITY INVOKER` (исправлено в миграции #016)

---

## 4. БД інтеграція

### 4.1 Структура telegram_users (миграция #002 + #013 + #016)
| Колонка | Тип | Описание |
|---------|-----|----------|
| id | SERIAL | PK |
| user_id | BIGINT UNIQUE | Telegram user_id |
| username | TEXT | |
| first_name | TEXT | |
| last_name | TEXT | |
| display_name | TEXT | Добавлено #013 |
| phone | TEXT | Добавлено #013 |
| shop_id | INT → shops(id) | Добавлено #013, ON DELETE SET NULL (#016) |
| household_user_id | UUID → users(id) | |
| is_active | BOOLEAN | |
| last_interaction_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

### 4.2 telegram_pending_orders
| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | PK |
| telegram_user_id | INT → telegram_users(id) | |
| chat_id | BIGINT | |
| step | TEXT | CHECK constraint |
| shop_id | INT → shops(id) | |
| items | JSONB | Массив товаров |
| message_id | INT | |
| created_at / updated_at | TIMESTAMPTZ | |

**CHECK (step) включает:** start, selecting_shop, adding_items, confirming, onboarding_name, onboarding_shop, onboarding_phone  
**⚠️ НЕ включает:** onboarding_confirm

### 4.3 telegram_messages_log
- Лог всех сообщений через RPC `telegram_log_message()`
- Индексы: (chat_id, created_at DESC), (telegram_user_id)

### 4.4 Используемые RPC

| RPC | Параметры | Возврат | Security |
|-----|-----------|---------|----------|
| `telegram_get_or_create_user` | user_id, username, first_name, last_name | JSONB | DEFINER |
| `telegram_log_message` | telegram_user_id, chat_id, message_id, message_type, ... | UUID | DEFINER |
| `telegram_create_order` | telegram_user_id, shop_id, warehouse_id, items, notes, msg_id | JSONB | DEFINER |
| `telegram_check_order_status` | order_number | JSONB | DEFINER |
| `telegram_get_catalog_text` | category_id, warehouse_id, search | TEXT | DEFINER |
| `rpc_pending_order_add_item` | telegram_user_id, chat_id, product_id, quantity | JSONB | DEFINER |
| `rpc_telegram_replace_order_items` | order_id, items | JSONB | DEFINER |
| `rpc_product_catalog` | category_id, search, warehouse_id, page, page_size | JSONB | INVOKER |
| `rpc_categories_tree` | — | JSONB | INVOKER |
| `rpc_shops_with_stats` | p_days | JSONB | INVOKER |

---

## 5. Проблеми та ризики

### 🔴 CRITICAL

#### C-TG1: CHECK constraint не содержит step 'onboarding_confirm'
**Файл:** `route.ts:547` + `migrations/013_telegram_user_shop_mapping.sql:20-23`

При вводе телефона step устанавливается в `'onboarding_confirm'`, но CHECK constraint в БД разрешает только:
`'start', 'selecting_shop', 'adding_items', 'confirming', 'onboarding_name', 'onboarding_shop', 'onboarding_phone'`

**Последствие:** UPDATE на `telegram_pending_orders` выбрасывает SQL ERROR → онбординг ломается на шаге подтверждения. Пользователь видит "Повідомлення отримано" вместо подтверждения.

**Как проявляется:** После ввода телефона и нажатия "Підтвердити" — ошибка. Пользователь не может завершить регистрацию.

**Фикс:** Добавить `'onboarding_confirm'` в CHECK constraint:
```sql
ALTER TABLE household_chemicals.telegram_pending_orders
  DROP CONSTRAINT IF EXISTS telegram_pending_orders_step_check;
ALTER TABLE household_chemicals.telegram_pending_orders
  ADD CONSTRAINT telegram_pending_orders_step_check
  CHECK (step IN (... 'onboarding_confirm'));
```

#### C-TG2: Webhook URL не установлен
Telegram не может доставить ни одного обновления. 25+ pending updates. Бот полностью нерабочий без ngrok/Vercel/tunnel.

---

### 🟠 HIGH

#### H-TG1: Rate limiter не подходит для продакшена
- In-memory `Map<number, number>` сбрасывается при каждом перезапуске (HMR в dev, холодный старт)
- Нет IP-based лимита (только user_id), атакующий может менять ID
- Cleanup через `setInterval` на `globalThis` — не сработает в serverless (Vercel/Edge)
- Rate limit превышает возможности для бота с очередью сообщений (500ms → 2 сообщения/сек — мало для быстрой навигации)

**Рекомендация:** Перейти на Supabase-based rate limiter или встроить в БД.

#### H-TG2: Все tgSend/tgSendMenu/tgEditMenu вызываются без await и без проверки ответа
Все функции Telegram API имеют `catch { /* ignore */ }`. Если Telegram вернет ошибку (rate limit, блокировка пользователя), бот этого не узнает.

**Риск:** Пользователь может быть заблокирован/удалил бота, бот продолжает "нажимать кнопки" без обратной связи.

#### H-TG3: Нет проверки ответа от supabase.rpc() в большинстве мест
- `telegram_get_or_create_user` — проверка есть только для `userErr || !tgUser`
- `showCategories` — ошибка RPC игнорируется
- `showShopSelection` — ошибка RPC игнорируется
- `addItemToPendingOrder` — проверка есть, но только `if (!error)`
- `confirmOrder` — после `telegram_create_order` проверка есть

**Рекомендуется:** Логировать ошибки и отвечать пользователю при сбоях БД.

#### H-TG4: Custom quantity flow — read-modify-write без блокировки
```typescript
const items = safeItems(pending?.items)
// ... modify items in memory ...
await supabase.from('telegram_pending_orders').update({ items, ... })
```

Между чтением и записью другой запрос может изменить `items`. Это race condition.
(Для preset quantity есть `rpc_pending_order_add_item` — атомарный)

#### H-TG5: IDF cache — синглтон на весь процесс
```typescript
let idfCache: { wordsList, prefixCount, key } | null = null
```
Кеш строится при первом парсинге группового сообщения и инвалидируется только при изменении количества/границ продуктов. Если в БД изменился товар, кеш не обновится до перезапуска сервера.

#### H-TG6: Нет проверки на дубликат /setup в групповом чате
`/setup` в группе отвечает "только в личных сообщениях", но сам UPDATE на `telegram_users` (line 691) выполняется ДО проверки chatId (line 684). UPDATE сбрасывает `display_name = null, phone = null, shop_id = null`.

**Порядок кода:** 
1. Line 683: проверка `text === '/setup'` → выполняется
2. Line 684: `if (chatId < 0)` — проверка chatId
3. Line 691: UPDATE `telegram_users` — ЭТО ВЫПОЛНЯЕТСЯ ТОЛЬКО ЕСЛИ chatId > 0 (в блоке else)

Actually, перепроверю:
```
if (text === '/setup') {
  if (chatId < 0) {
    await tgSend(chatId, '...только в особистих...')
    return NextResponse.json({ ok: true })
  }
  await supabase.from('telegram_pending_orders').delete()...
  await supabase.from('telegram_users').update({ display_name: null, ... })
  await startOnboarding(...)
```
Проверка корректная — для чата < 0 возвращается раньше. Риска нет, но UX плохой: в группе отправляется сообщение, а профиль НЕ сбрасывается. ✅ **Оценка: false alarm.**

---

### 🟡 MEDIUM

#### M-TG1: Нет пагинации в списке товаров
`rpc_product_catalog` вызывается с `p_page_size: 50`. Если в категории >50 товаров, пользователь видит только первые 50. Нет кнопки "Далі".

#### M-TG2: `/catalog` (cat:*) отправляет через tgSend с разбивкой по 4000 символов
Если каталог большой, пользователь получает несколько сообщений подряд. Было бы удобнее показывать через inline клавиатуру с кнопкой "Далі".

#### M-TG3: Нет проверки на дубликат заявки по message_id
В групповом чате есть проверка `orders` на `telegram_message_id`. Но в личных сообщениях нет — если пользователь дважды нажмет "Підтвердити", создадутся две одинаковые заявки.
**Ранее зафиксировано в PLAN.md как H5 — предположительно исправлено:** нет, это не было исправлено.

#### M-TG4: handleEditedOrderMessage загружает ВСЕ продукты при каждом редактировании
При каждом редактировании сообщения в группе загружаются все активные продукты (может быть 2000+ записей). Для тяжелого ассортимента это ~5-10 МБ данных каждый раз.

#### M-TG5: Нет обработки edited_message в личных сообщениях
Обработка `edited_message` работает только для `chatId < 0` (группы). Если пользователь отредактировал сообщение в личном чате — игнорируется.

#### M-TG6: Нет команды /list або /orders для просмотра своих заявок
Пользователь может проверить статус только по номеру заявки. Нет списка "мои заявки" за сегодня/неделю.

#### M-TG7: Onboarding — отсутствует кнопка "Назад" на шаге выбора магазина
Шаг 2/3 (выбор магазина) — только кнопки магазинов. Если пользователь ошибся на шаге 1 (имя), нет кнопки "Назад" — только `/setup` заново.

#### M-TG8: Нет обработки ошибок при INSERT в telegram_pending_orders при дубликате (chat_id, telegram_user_id)
UNIQUE constraint (telegram_user_id, chat_id) может вызвать ошибку при `upsert`, если два одинаковых запроса пришли одновременно. Нет `RETURNING ON CONFLICT DO NOTHING`.

#### M-TG9: telegram_get_catalog_text не используется в коде
RPC существует в БД, но в route.ts нигде не вызывается — `/catalog` использует `showCategories` с `rpc_categories_tree` и `rpc_product_catalog`.

---

### 🔵 LOW

#### L-TG1: Жестко закодированный DEFAULT_WAREHOUSE_ID = 1
Хотя миграция #021 исправила `telegram_create_order` (derive warehouse from shop), в `showQuantityButtons` и `order:cat:` продолжает использоваться `DEFAULT_WAREHOUSE_ID` для `rpc_product_catalog`. Если склад #1 не содержит товаров определенной категории — пользователь увидит "Немає товарів".

#### L-TG2: Отсутствует команда /delete для удаления существующих заявок
Пользователь может отменить только черновик (/cancel), но не готовую заявку.

#### L-TG3: Нет поддержки media (фото, документы)
Бот игнорирует photo, document, sticker, voice.

#### L-TG4: stop_words хардкодом в route.ts
Слова для фильтрации при парсинге груповых сообщений зашиты в код (line 786-792). При добавлении новых стоп-слов нужно перекомпилировать приложение.

#### L-TG5: Избыточный код: переменная `userName` определена, но может быть неиспользована
Строки 286-288: `userName`, `firstName`, `lastName` передаются везде, но Telegram username может быть `null`.

#### L-TG6: Сообщение об ошибке при неизвестной команде — на украинском, хотя онбординг на украинском
Это intentional per project spec (UI language: Ukrainian). ✅ **OK**

---

## 6. Помилки (bugs)

### Bug #1: DB CHECK constraint не содержит step='onboarding_confirm'
**Серьезность:** CRITICAL  
**Файл:** `route.ts:547` + `migrations/013_telegram_user_shop_mapping.sql:20-23`  
**Описание:** См. C-TG1 выше.  
**Воспроизведение:** /setup → ввести имя → выбрать магазин → ввести телефон → нажать "Підтвердити" → ошибка БД.  
**Статус:** ❌ Не исправлено

### Bug #2: При custom quantity кнопка "Назад" ведет к выбору категорий, а не к товару
**Серьезность:** MEDIUM  
**Файл:** `route.ts:462-464`  
**Описание:** При вводе своей кількості пользователь видит кнопку "Назад" с callback `order:add`, который возвращает к категориям, а не к списку товаров.  
**Статус:** ❌ Не исправлено

### Bug #3: tgUserData может содержать display_name и shop_id, но обработчик не проверяет обновление
**Серьезность:** LOW  
**Файл:** `route.ts:596-617`  
**Описание:** Автоонбординг для новых пользователей (нет display_name) и тех, у кого нет shop_id. Но код использует `tgUserData` из первого запроса — если в этой же сессии profile обновился через другой механизм, `tgUserData` устарел.  
**Статус:** ❌ Не исправлено

### Bug #4: В callback `order:shop:` при выборе магазина не показывается ошибка при неудачном upsert
**Серьезность:** MEDIUM  
**Файл:** `route.ts:405-411`  
**Описание:** `upsert` может вернуть ошибку (дубликат, FK violation), но ответ не проверяется. Пользователь видит категории, а pending order не создан.  
**Статус:** ❌ Не исправлено

---

## 7. Рекомендації

### Приоритет 1: До запуска
- [ ] **Исправить CHECK constraint** — добавить 'onboarding_confirm'
- [ ] **Настроить webhook** — ngrok или Vercel
- [ ] **Заполнить parent_shop_id** для цехов 25-38

### Приоритет 2: Безопасность и надежность
- [ ] Переписать rate limiter на Supabase (таблица или Redis)
- [ ] Добавить обработку ошибок на все supabase.rpc() вызовы
- [ ] Заменить read-modify-write в custom quantity на атомарный RPC
- [ ] Добавить дедупликацию подтверждения заявки в личных сообщениях

### Приоритет 3: UX
- [ ] Пагинация для списка товаров (больше 50)
- [ ] Кнопка "Назад" на каждом шаге онбординга
- [ ] Команда /myorders для списка своих заявок
- [ ] Показать статус заявки в ответ на подтверждение
- [ ] Кеш IDF инвалидировать по таймеру или после изменений

### Приоритет 4: Производительность
- [ ] Ограничить загрузку всех продуктов в handleEditedOrderMessage
- [ ] Оптимизировать запросы к каталогу (pagination, warehouse_id)
- [ ] Убрать мертвый код (telegram_get_catalog_text не используется)

---

## 8. Підсумок

### Статистика

| Категория | CRITICAL | HIGH | MEDIUM | LOW |
|-----------|----------|------|--------|-----|
| Найдено | 2 | 5 | 9 | 6 |
| Исправлено | 0 | 0 | 0 | 0 |

### Готовность бота к продакшену: 🟡 **Низкая**

**Основные блокеры:**
1. Webhook URL не установлен — бот не получает обновления
2. CHECK constraint не содержит 'onboarding_confirm' — онбординг сломается на последнем шаге
3. Rate limiter не подходит для продакшена
4. Race condition в custom quantity
5. Нет дедупликации подтверждения заявки

**Архитектурно код написан грамотно:**
- Санитизация входных данных ✅
- Webhook secret token ✅
- Атомарные RPC для основных операций ✅
- Асинхронная обработка с разбивкой по сценариям ✅
- IDF-based парсинг груповых сообщений ✅
- Обработка редактирования сообщений ✅

**Основная проблема:** бот писался итеративно, и некоторые изменения в коде не были синхронизированы с миграциями БД (CHECK constraint). Также код не проходил полное тестирование онбординга — критический баг остался незамеченным.

---

*Документ создан: 27.05.2026 Hermes (CEO-оркестратор)*
