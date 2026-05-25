-- ============================================================================
-- Миграция #6: Импорт товаров из Poster (склад витратних матеріалів)
-- ============================================================================

-- Add poster_ingredient_id to products
ALTER TABLE household_chemicals.products ADD COLUMN IF NOT EXISTS poster_ingredient_id INT UNIQUE;

-- Ensure name is unique for ON CONFLICT
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.conname = 'uq_product_categories_name'
      AND n.nspname = 'household_chemicals'
  ) THEN
    ALTER TABLE household_chemicals.product_categories ADD CONSTRAINT uq_product_categories_name UNIQUE (name);
  END IF;
END $$;

-- Create categories for these products
INSERT INTO household_chemicals.product_categories (name, parent_id, sort_order) VALUES
  ('Упаковка', NULL, 1),
  ('Мийні та дезінфікуючі засоби', NULL, 2),
  ('Господарські товари', NULL, 3),
  ('Одноразовий посуд', NULL, 4),
  ('Канцелярія', NULL, 5),
  ('Засоби гігієни', NULL, 6),
  ('Кухонний інвентар', NULL, 7),
  ('Інше', NULL, 99)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- INSERT products
-- ============================================================================
INSERT INTO household_chemicals.products (name, sku, unit, purchase_price, category_id, poster_ingredient_id) VALUES
  ('Dr.Dez 1 л', 'POSTER-2145', 'шт', 180, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Мийні та дезінфікуючі засоби'), 2145),  ('Аеросепт 1000мл з дозуючим тригером', 'POSTER-2300', 'шт', 225, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Мийні та дезінфікуючі засоби'), 2300),  ('Аеросепт 5000мл', 'POSTER-2299', 'шт', 860, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Мийні та дезінфікуючі засоби'), 2299),  ('Білизна (вибілювач) 1л', 'POSTER-1615', 'шт', 12.33, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Мийні та дезінфікуючі засоби'), 1615),  ('Білизна 5л (поштучно)', 'POSTER-1616', 'шт', 60.63, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Мийні та дезінфікуючі засоби'), 1616),  ('Білизна айс для холодильників 750 мл', 'POSTER-1788', 'шт', 167.82, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Мийні та дезінфікуючі засоби'), 1788),  ('Білизна антижир 5 л', 'POSTER-1787', 'л', 132.44, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Мийні та дезінфікуючі засоби'), 1787),  ('Білизна кухня універсал 1 л', 'POSTER-1789', 'шт', 84.91, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Мийні та дезінфікуючі засоби'), 1789),  ('Білизна медкомфорт нейтралізація запахів 250 мл', 'POSTER-1786', 'шт', 60, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Мийні та дезінфікуючі засоби'), 1786),  ('Батарейка мініпальчик ААА', 'POSTER-1815', 'шт', 5.53, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Інше'), 1815),  ('Батарейка пальчік АА', 'POSTER-1825', 'шт', 5.69, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Інше'), 1825),  ('Бахіли (поштучно)', 'POSTER-1614', 'шт', 0.35, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Господарські товари'), 1614),  ('Відро з віджимом', 'POSTER-2219', 'шт', 114.24, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Господарські товари'), 2219),  ('Віник в''язаний ', 'POSTER-1617', 'шт', 70, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Господарські товари'), 1617),  ('Гель для унітазів 1л', 'POSTER-1706', 'шт', 82.88, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Мийні та дезінфікуючі засоби'), 1706),  ('Губка для посуду (упаковкою)', 'POSTER-1618', 'шт', 19.16, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Господарські товари'), 1618),  ('Губка для посуду PRO', 'POSTER-2173', 'шт', 26, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Господарські товари'), 2173),  ('Гумки для купюр 50 гр', 'POSTER-1845', 'шт', 14.98, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Канцелярія'), 1845),  ('Датер Trodaт 48313', 'POSTER-2195', 'шт', 420, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Інше'), 2195),  ('Детектор валют', 'POSTER-2192', 'шт', 559.43, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Інше'), 2192),  ('Дозатор лігтьовий для атисептику', 'POSTER-2172', 'шт', 167.45, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Інше'), 2172),  ('Дротяк (поштучно)', 'POSTER-1619', 'шт', 8, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1619),  ('Екран для піци 25 см', 'POSTER-2216', 'шт', 135, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Кухонний інвентар'), 2216),  ('Етикетка прозора 58х40 рулон 1000 шт', 'POSTER-2191', 'шт', 251.22, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 2191),  ('Зіп пакети 1500*2000 (уп/100шт) (поштучно)', 'POSTER-1661', 'шт', 0.7, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1661),  ('Зіп пакети 2500*2000 (уп/100шт) (поштучно)', 'POSTER-1632', 'шт', 1.03, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1632),  ('Засіб антижир PRO 5л. (поштучно)', 'POSTER-1620', 'шт', 445.91, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Мийні та дезінфікуючі засоби'), 1620),  ('Засіб дезінфікуючий "АХД 2000" 1л', 'POSTER-1621', 'шт', 226.99, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Мийні та дезінфікуючі засоби'), 1621),  ('Засіб дезінфікуючий "АХД 2000" 5л', 'POSTER-1622', 'шт', 857, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Мийні та дезінфікуючі засоби'), 1622),  ('Засіб дезінфікуючий "Госпісепт" таблетки 1кг', 'POSTER-1623', 'шт', 281.45, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Мийні та дезінфікуючі засоби'), 1623),  ('Засіб дезінфікуючий Аеродизин 5л (поштучно)', 'POSTER-1624', 'шт', 918.63, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Мийні та дезінфікуючі засоби'), 1624),  ('Засіб дезінфікуючий Аеродизин з дозуючим тригером 1л. (поштучно)', 'POSTER-1625', 'шт', 224.13, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Мийні та дезінфікуючі засоби'), 1625),  ('Засіб для знищення неприємних запахів "Білизна Медкомфорт" 750мл (поштучно)', 'POSTER-1629', 'шт', 125, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Мийні та дезінфікуючі засоби'), 1629),  ('Засіб для міття скла 500 мл', 'POSTER-1824', 'шт', 45.76, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Інше'), 1824),  ('Засіб для миття підлоги 5л (поштучно)', 'POSTER-1626', 'шт', 110, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Мийні та дезінфікуючі засоби'), 1626),  ('Засіб для миття посуду 5л (поштучно)', 'POSTER-1627', 'шт', 119.7, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Мийні та дезінфікуючі засоби'), 1627),  ('Засіб для скла ( по літрах)', 'POSTER-1630', 'л', 22.76, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Інше'), 1630),  ('Засіб для чищення труб Крот', 'POSTER-2047', 'шт', 55, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Мийні та дезінфікуючі засоби'), 2047),  ('Зошит 24 стор', 'POSTER-2287', 'шт', 12.75, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Канцелярія'), 2287),  ('Зошит 60 стор', 'POSTER-1930', 'шт', 31.82, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Канцелярія'), 1930),  ('Зошит А4 96 стор', 'POSTER-1931', 'шт', 112.91, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Канцелярія'), 1931),  ('кій дерево', 'POSTER-2221', 'шт', 19.5, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Кухонний інвентар'), 2221),  ('Кій хромовий ', 'POSTER-2220', 'шт', 51.24, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Кухонний інвентар'), 2220),  ('Калькулятор ', 'POSTER-1840', 'шт', 96.56, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Канцелярія'), 1840),  ('Касова стрічка 57*60', 'POSTER-1814', 'шт', 27.68, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1814),  ('Касова стрічка 57/30', 'POSTER-1942', 'шт', 15.57, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1942),  ('Кастрюля Arian Gastro 28 л', 'POSTER-2226', 'шт', 2832.24, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Інше'), 2226),  ('Кисневий відбілювач 1 кг', 'POSTER-2236', 'шт', 107.8, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Інше'), 2236),  ('Клей-олівець', 'POSTER-2268', 'шт', 6.4, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Канцелярія'), 2268),  ('Конверт С6', 'POSTER-1968', 'шт', 0.7, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Канцелярія'), 1968),  ('Контейнер 2500 для картопельки', 'POSTER-1980', 'шт', 2.72, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1980),  ('Контейнер алюм. R77G (скумбрії)', 'POSTER-1829', 'шт', 9.95, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1829),  ('Контейнер алюм. SP24L (паштети)', 'POSTER-1922', 'шт', 1.98, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1922),  ('Контейнер алюм. SP62L (кекс)', 'POSTER-1834', 'шт', 3.75, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1834),  ('Контейнер алюм. SP64L (лазаньї)', 'POSTER-1831', 'шт', 4.67, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1831),  ('Контейнер для десертів п/п 250 мл', 'POSTER-2302', 'шт', 7.49, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 2302),  ('Контейнер п/п  для морозива 360 мл', 'POSTER-2301', 'шт', 8.54, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 2301),  ('Контейнер пластиковий 17 л', 'POSTER-1918', 'шт', 200.94, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1918),  ('Контейнер пластиковий 23 л', 'POSTER-2218', 'шт', 226.74, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 2218),  ('Корзина 23 л', 'POSTER-2018', 'шт', 158, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Інше'), 2018),  ('Корзини для хліба з лози', 'POSTER-2156', 'шт', 190, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Інше'), 2156),  ('Коробка для піци', 'POSTER-427', 'шт', 6.68, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 427),  ('Корректор ручка', 'POSTER-2286', 'шт', 16, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Канцелярія'), 2286),  ('Кульок на піцу 28х30 (на піцу) 20 мкм', 'POSTER-1694', 'шт', 0.93, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1694),  ('Купюрниця', 'POSTER-2193', 'шт', 224, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Інше'), 2193),  ('Лінійка', 'POSTER-2265', 'шт', 13.4, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Канцелярія'), 2265),  ('Ліпучка для мух', 'POSTER-2235', 'шт', 4.5, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Господарські товари'), 2235),  ('Леза змінні 9мм, 10шт', 'POSTER-2023', 'шт', 14.3, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Канцелярія'), 2023),  ('Ложечка для морозива', 'POSTER-1970', 'шт', 0.44, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Кухонний інвентар'), 1970),  ('Лопатка дерево', 'POSTER-2225', 'шт', 40, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Кухонний інвентар'), 2225),  ('Майка 22*43 ЕСО нова (уп/160шт) (упаковками)', 'POSTER-1760', 'шт', 38, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1760),  ('Маркер', 'POSTER-1908', 'шт', 14, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Канцелярія'), 1908),  ('Мило господарське', 'POSTER-1634', 'шт', 9, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Мийні та дезінфікуючі засоби'), 1634),  ('Мило Джус запаска', 'POSTER-1812', 'шт', 29.54, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Мийні та дезінфікуючі засоби'), 1812),  ('Набір приборів (в асортименті)', 'POSTER-2244', 'шт', 2.09, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Інше'), 2244),  ('Насадка на швабру', 'POSTER-1665', 'шт', 82, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Господарські товари'), 1665),  ('Насадка на швабру мікрофібра', 'POSTER-1666', 'шт', 87.32, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Господарські товари'), 1666),  ('Ножиці', 'POSTER-2013', 'шт', 12, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Кухонний інвентар'), 2013),  ('Олівець', 'POSTER-2002', 'шт', 4.5, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Канцелярія'), 2002),  ('Освіжувач повітря', 'POSTER-1660', 'шт', 34.75, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Мийні та дезінфікуючі засоби'), 1660),  ('Піддон М3-20 Білий (уп/300шт) (поштучно)', 'POSTER-1642', 'шт', 1.01, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1642),  ('Піддон М3-20 Чорний (уп/300шт) (поштучно)', 'POSTER-1643', 'шт', 1.04, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1643),  ('Піддон М4-20 (глазуровані сирочки)', 'POSTER-2184', 'шт', 0.81, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 2184),  ('Піддон М6-20 (люля-кебаб)', 'POSTER-1784', 'шт', 1.57, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1784),  ('Піднос', 'POSTER-2222', 'шт', 85, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Кухонний інвентар'), 2222),  ('Пістолет для цінників', 'POSTER-2293', 'шт', 343, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Канцелярія'), 2293),  ('Пакет 30х18 для кексів 25 мкр', 'POSTER-2065', 'шт', 0.46, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 2065),  ('ПАКЕТ ВЕЛИКИЙ', 'POSTER-953', 'шт', 2.24, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 953),  ('Пакет вишиванка', 'POSTER-187', 'шт', 1.01, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 187),  ('Пакет для вакуумування 220х300 50 мкм', 'POSTER-2190', 'шт', 1.52, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 2190),  ('Пакет для пиріжків 10х15 25 мк', 'POSTER-2057', 'шт', 0.24, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 2057),  ('Пакет для сміття  35л (по рулонах)', 'POSTER-1638', 'шт', 19.91, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1638),  ('Пакет для сміття 120л (по рулонах)', 'POSTER-1637', 'шт', 41.33, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1637),  ('Пакет для сміття 60л (по рулонах)', 'POSTER-1639', 'шт', 22.44, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1639),  ('Пакет для хліба 14х43', 'POSTER-1951', 'шт', 0.22, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1951),  ('Пакет на піцу 35х33 25 мк', 'POSTER-2056', 'шт', 0.88, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 2056),  ('Пакет паперовий для багетів', 'POSTER-1924', 'шт', 0.63, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1924),  ('Пакет паперовий для хліба', 'POSTER-1923', 'шт', 0.66, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1923),  ('Пакет поліпропіленовий 30х18 (кекси)', 'POSTER-1925', 'шт', 0.54, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1925),  ('Пакети для вакумування 180/300 60мкм', 'POSTER-1909', 'шт', 1.2, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1909),  ('Пакети для вакуумування 220/300 80 мкм', 'POSTER-1835', 'шт', 2, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1835),  ('Пакети для вакуумування 25х35 ', 'POSTER-1662', 'шт', 1.93, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1662),  ('Папір для нотатків', 'POSTER-1900', 'шт', 28.42, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Канцелярія'), 1900),  ('Папір офісний А4', 'POSTER-1820', 'шт', 167.51, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Канцелярія'), 1820),  ('Папір пергаментний білий (на Бульвар)', 'POSTER-1640', 'шт', 201.79, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1640),  ('Папір пергаментний коричневий (на Піцерію)', 'POSTER-1641', 'шт', 172.21, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1641),  ('Папка швидкозшивач', 'POSTER-1993', 'шт', 12, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Канцелярія'), 1993),  ('Пергамент 300/50 для хліба', 'POSTER-1819', 'шт', 76.53, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1819),  ('Пергамент просиліконений (пач 500 шт) 1шт', 'POSTER-1991', 'шт', 880, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1991),  ('Плівка  ПВХ 450*1000 (поштучно)', 'POSTER-1644', 'шт', 350.6, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1644),  ('Порошок для прання (по кг)', 'POSTER-1645', 'кг', 41.2, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Мийні та дезінфікуючі засоби'), 1645),  ('Пульверизатор', 'POSTER-1895', 'шт', 49.4, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Інше'), 1895),  ('Рукавички вінілові для моті', 'POSTER-1952', 'шт', 94, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Господарські товари'), 1952),  ('Рукавички нітрилові  S (уп/100шт) (упаковками)', 'POSTER-1646', 'шт', 108.7, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Господарські товари'), 1646),  ('Рукавички нітрилові  М (уп/100шт) (упаковками)', 'POSTER-1647', 'шт', 111.2, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Господарські товари'), 1647),  ('Рукавички нітрилові L (уп.100 шт) ', 'POSTER-1935', 'шт', 103.27, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Господарські товари'), 1935),  ('Рукавички п\е для хліба пачка 100 шт на картоні', 'POSTER-1907', 'шт', 9, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Господарські товари'), 1907),  ('Ручка синя', 'POSTER-1842', 'шт', 3.83, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Канцелярія'), 1842),  ('Ручка червона', 'POSTER-1844', 'шт', 4.77, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Канцелярія'), 1844),  ('Ручка чорна', 'POSTER-1843', 'шт', 3.46, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Канцелярія'), 1843),  ('Рушник паперовий "Кохавинка" Велетень 1 рулон (по штучно)', 'POSTER-1648', 'шт', 186.79, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Господарські товари'), 1648),  ('Салатник  крафт 1,3л (печінковий торт)', 'POSTER-2292', 'шт', 9.52, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 2292),  ('Салатник крафт круглий 1500 мл (печінковий торт)', 'POSTER-2245', 'шт', 9.75, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 2245),  ('Салатниця 750 мл', 'POSTER-2093', 'шт', 4.9, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 2093),  ('Салатниця кругла 550 мл Studiopack', 'POSTER-2102', 'шт', 4.4, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 2102),  ('Салатниця кругла 750 мл Studiopack', 'POSTER-2101', 'шт', 6.23, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 2101),  ('Салатниця овальна 650мл Studiopack', 'POSTER-2103', 'шт', 5.69, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 2103),  ('Свинина', 'POSTER-56', 'кг', 135.02, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Інше'), 56),  ('Сграсаторе', 'POSTER-1649', 'шт', 107.16, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Мийні та дезінфікуючі засоби'), 1649),  ('Серветка Віскозна  (уп/10шт) (упаковками)', 'POSTER-1696', 'шт', 36.17, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Господарські товари'), 1696),  ('Серветка Віскозна "Про-Сервіс"а7 (уп/7шт) (упаковками)', 'POSTER-1650', 'шт', 36.25, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Господарські товари'), 1650),  ('Серветка мікрофібра (поштучно)', 'POSTER-1651', 'шт', 56.81, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Господарські товари'), 1651),  ('Сито для борошна', 'POSTER-2223', 'шт', 177.15, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Кухонний інвентар'), 2223),  ('Сито перфороване', 'POSTER-2224', 'шт', 130, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Кухонний інвентар'), 2224),  ('Скоби для степлера', 'POSTER-2267', 'шт', 7.38, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Канцелярія'), 2267),  ('Сковорода млинна 26 см', 'POSTER-2069', 'шт', 650, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Кухонний інвентар'), 2069),  ('Скотч великий', 'POSTER-2000', 'шт', 46.81, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 2000),  ('Скотч двосторонній', 'POSTER-1896', 'шт', 15.5, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1896),  ('Скотч малий', 'POSTER-2001', 'шт', 12, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 2001),  ('Совок з віником', 'POSTER-1828', 'шт', 185, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Господарські товари'), 1828),  ('Стікери для етикет-пістолета ', 'POSTER-2067', 'шт', 213.22, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Канцелярія'), 2067),  ('Стілець розкладний', 'POSTER-1941', 'шт', 231.14, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Інше'), 1941),  ('Стакан для морозива 320 мл', 'POSTER-2030', 'шт', 4.55, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 2030),  ('Стакан для морозива 350 мл', 'POSTER-1836', 'шт', 4.29, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1836),  ('Стаканчик для морозива 250 мл', 'POSTER-1953', 'шт', 4.08, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1953),  ('Степлер', 'POSTER-2266', 'шт', 56.06, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Канцелярія'), 2266),  ('Супниця PP D-144  (крем-суп)', 'POSTER-1830', 'шт', 4.11, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1830),  ('Супниця на солянку 500мл', 'POSTER-1940', 'шт', 4.02, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 1940),  ('Табличка Відчинено-Зачинено', 'POSTER-2237', 'шт', 49, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Канцелярія'), 2237),  ('Термоетикетка 58*40', 'POSTER-2064', 'шт', 54.69, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 2064),  ('Термопакет з ручкою', 'POSTER-266', 'шт', 32.54, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 266),  ('Термосумка', 'POSTER-2045', 'шт', 578.95, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Інше'), 2045),  ('Туалетний папір "Кохавинка" (поштучно)', 'POSTER-1653', 'шт', 6.48, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Господарські товари'), 1653),  ('Файли А4', 'POSTER-1969', 'шт', 67.19, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Канцелярія'), 1969),  ('Фартух одноразовий (уп/100шт) (упаковками)', 'POSTER-1654', 'шт', 1.46, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Господарські товари'), 1654),  ('Фольга 50 м 45 см ширина', 'POSTER-2196', 'шт', 174, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Упаковка'), 2196),  ('Цінник 35х25, 6 м', 'POSTER-1846', 'шт', 13.77, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Канцелярія'), 1846),  ('Шапочка одноразова для волосся (поштучно)', 'POSTER-1655', 'шт', 0.77, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Господарські товари'), 1655),  ('Шпажки уп.100 шт', 'POSTER-1932', 'шт', 58.57, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Кухонний інвентар'), 1932),  ('Щітка для муки', 'POSTER-1975', 'шт', 200, (SELECT id FROM household_chemicals.product_categories WHERE name = 'Кухонний інвентар'), 1975);
-- ============================================================================
-- Set initial stock for all products
-- ============================================================================
WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2145),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 30,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2300),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 10,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2299),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 2,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1615),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 125,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1616),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 70,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1788),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 22,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1787),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 1,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1789),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 6,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1786),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 9,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1815),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 228,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1825),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 224,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1614),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 800,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2219),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 15,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1617),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 40,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1706),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 122,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1618),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 704,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2173),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 10,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1845),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 84,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2195),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 10,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2192),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 23,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2172),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 4,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1619),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 3860,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2216),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 50,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2191),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 9,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1661),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 127863,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1632),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := -312539.4704001,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1620),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 23,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1621),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 10,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1622),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 2,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1623),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 31,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1624),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 8,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1625),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 46,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1629),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 5,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1824),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 142,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1626),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 299,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1627),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 278,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1630),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 105,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2047),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 9,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2287),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 44,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1930),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 94,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1931),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 30,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2221),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 20,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2220),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 1,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1840),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 52,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1814),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 3696,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1942),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 3350,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2226),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 1,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2236),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 25,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2268),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 10,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1968),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 8000,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1980),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 2000,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1829),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := -1265.484,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1922),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 10600,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1834),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := -4610.18,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1831),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 4842.342,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2302),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 100,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2301),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 1200,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1918),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 5,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2218),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 5,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2018),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 2,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2156),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 30,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 427),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 1039,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2286),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 10,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1694),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := -25037.9529891,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2193),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 10,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2265),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 10,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2235),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 100,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2023),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 20,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1970),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := -6584,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2225),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 4,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1760),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 314,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1908),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 94,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1634),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 51,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1812),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 135,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2244),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 577,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1665),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 9,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1666),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 77,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2013),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 5,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2002),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 5,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1660),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 117,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1642),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := -384912.3462,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1643),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := -10847.1170541,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2184),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 1800,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1784),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 18736.984,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2222),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 10,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2293),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 1,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2065),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 1807,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 953),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 17565,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 187),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 216776,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2190),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 9000,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2057),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 130000,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1638),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 670,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1637),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 2239,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1639),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 2334,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1951),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 82000,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2056),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 7400,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1924),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := -54768,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1923),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := -221206,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1925),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 6974.23,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1909),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := -5446.2421564,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1835),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := -38802.106,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1662),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 6200,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1900),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 70,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1820),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 209,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1640),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 55,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1641),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 99,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1993),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 20,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1819),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 19,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1991),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 15,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1644),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 1839,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1645),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 224,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1895),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 32,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1952),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 10,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1646),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 1941,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1647),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 1072,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1935),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 65,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1907),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 600,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1842),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 297,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1844),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 110,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1843),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 138,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1648),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 1026,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2292),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 600,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2245),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 1900,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2093),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 3200,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2102),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 1000,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2101),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := -4086,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2103),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 3321,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 56),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := -2938.0523,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1649),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 177,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1696),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 703,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1650),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 100,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1651),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 152,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2223),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 9,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2224),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 5,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2267),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 31,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2069),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 27,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2000),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 106,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1896),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 10,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2001),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 30,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1828),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 8,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2067),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 18,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1941),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 19,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2030),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 8971,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1836),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 7266,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1953),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 2679,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2266),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 11,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1830),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := -1495,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1940),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 2866,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2237),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 20,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2064),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 13,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 266),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 3489,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2045),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 92,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1653),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 3126,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1969),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 93,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1654),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 35300,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 2196),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 10,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1846),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 431,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1655),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 14600,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1932),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 6,
  p_user_id := NULL
);

WITH wh AS (SELECT id FROM household_chemicals.warehouses WHERE name = 'Склад витратних матеріалів' LIMIT 1)
SELECT household_chemicals.set_initial_stock(
  p_product_id := (SELECT id FROM household_chemicals.products WHERE poster_ingredient_id = 1975),
  p_warehouse_id := (SELECT id FROM wh),
  p_quantity := 2,
  p_user_id := NULL
);
