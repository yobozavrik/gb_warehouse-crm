-- Migration #13: Add shop_id to telegram_users for direct user-to-shop mapping
-- Allows skipping shop selection during Telegram order flow

ALTER TABLE household_chemicals.telegram_users
  ADD COLUMN IF NOT EXISTS shop_id INT REFERENCES household_chemicals.shops(id);

CREATE INDEX IF NOT EXISTS idx_telegram_users_shop ON household_chemicals.telegram_users(shop_id);

COMMENT ON COLUMN household_chemicals.telegram_users.shop_id IS 'Привязка пользователя Telegram к магазину. Если установлен - при заказе минуется шаг выбора магазина.';
