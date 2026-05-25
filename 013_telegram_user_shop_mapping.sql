-- Migration #13: Telegram users - shop_id, display_name, phone; extend onboarding steps

-- 1. Додати поля до telegram_users
ALTER TABLE household_chemicals.telegram_users
  ADD COLUMN IF NOT EXISTS shop_id INT REFERENCES household_chemicals.shops(id),
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE INDEX IF NOT EXISTS idx_telegram_users_shop ON household_chemicals.telegram_users(shop_id);

COMMENT ON COLUMN household_chemicals.telegram_users.shop_id IS 'Прив''язка користувача Telegram до магазину. Якщо встановлено - при замовленнi пропускається крок вибору магазину.';
COMMENT ON COLUMN household_chemicals.telegram_users.display_name IS 'Відображуване ім''я (вводиться при реєстрації через /setup)';
COMMENT ON COLUMN household_chemicals.telegram_users.phone IS 'Номер телефону (вводиться при реєстрації через /setup)';

-- 2. Розширити CHECK constraint на telegram_pending_orders.step для onboarding steps
ALTER TABLE household_chemicals.telegram_pending_orders
  DROP CONSTRAINT IF EXISTS telegram_pending_orders_step_check;

ALTER TABLE household_chemicals.telegram_pending_orders
  ADD CONSTRAINT telegram_pending_orders_step_check
  CHECK (step IN (
    'start', 'selecting_shop', 'adding_items', 'confirming',
    'onboarding_name', 'onboarding_shop', 'onboarding_phone'
  ));
