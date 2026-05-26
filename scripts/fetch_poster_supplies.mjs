import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN = process.env.POSTER_TOKEN || '';
if (!TOKEN) throw new Error('POSTER_TOKEN not set (run with `node --env-file=.env scripts/fetch_poster_supplies.mjs`)');
const WAREHOUSE_POSTER_STORAGE_ID = 37;
const CONCURRENCY = 3;

const SUPPLIER_NAMES = {
  "1": "ПП \"Гравітон\"",
  "27": "ТОВ",
  "61": "ФОП Войцещук",
  "66": "ФОП Юрків",
  "92": "ТОВ \"Сова\"",
  "93": "ФОП Лазор О.М.",
  "95": "ФОП Візнюк Р.В.",
  "96": "ПП \"Укрпапірпостач\"",
  "97": "ФОП Свищо Я.М.",
  "99": "ФОП Кушнір О.В.",
  "100": "ФОП Вербіцький В.В.",
  "101": "ФОП Д'ячук Вікторія",
  "102": "ПП Вигодівський",
  "103": "ФОП Ткач Л.М.",
  "105": "ФОП Чміль-Продан Оксана",
  "106": "ФОП Дутка Р.І.",
  "107": "Амальгама-Люкс",
  "109": "ФОП Стефанко Степан Степанович",
  "111": "ФОП Ковбаснюк Василь",
  "112": "ФОП Лазор Д.Д.",
  "113": "ФОП Паламар",
  "114": "ФОП Гаджук-Сологуб",
  "115": "ФОП Мельник С.Д.",
  "116": "Бліц-Пак",
  "117": "Аніс-Трейд Тернопіль",
  "118": "Міропак",
  "119": "Трейд Сервіс Груп",
  "120": "Копійка плюс ТМ",
  "122": "ФОП Сідлецький В.В.",
  "123": "ФОП Мисько В.В. (Viola-pakc)",
  "124": "ФОП Чорней А.П.",
  "125": "ФОП Карпюк О.В.",
  "126": "Трієр-Пак",
  "128": "Філіпчук Наталія",
  "129": "ТОВ \"Десант Україна\"",
  "130": "ФОП Довганюк О.Я.",
  "134": "COMFY TRADE",
  "136": "ПП Косован",
  "137": "UD-PACK",
  "138": "ПП Комора",
  "141": "ФОП Бойко Степан Миколайович",
  "145": "ФОП Сорочан В.В.",
  "148": "ФОП Візнюк Н.Я.",
  "152": "Еко Трейд Компані",
  "154": "ФОП Сорочан Олег Васильович",
  "156": "ФОП Еко-Пак Груп",
  "157": "Сігма Плюс Плюс ТОВ (lora.ua)",
  "160": "ФОП Савчук Віктор Анатолійович",
  "161": "ФОП Горбенко Ніна",
  "163": "ФОП Кушнірук Олексій (Фокстрот)",
  "164": "ФОП Візнюк Т.Й. (Е-СОТА)",
  "167": "ФОП Бойко Михайло Степанович",
  "169": "ФОП Григораш Дмитро Анатолійович (Епіцентр)",
  "170": "ФОП Анатолій Миколайович (Анталія і К)",
  "172": "ФОП Довгань Станіслав Вікторович (fci.biz.ua)",
  "173": "ФОП Стрільчук І.В. (Gipercenter)",
  "174": "ФОП Гринчак В.В.",
  "176": "ФОП Мороз Л.І.",
  "182": "AL-GROUP",
  "188": "ТОВ \"Нова Пошта Україна\"",
  "192": "ФОП Світов Павло Олексійович",
  "193": "ФОП Слободянюк Володимир Володимирович",
  "199": "ФОП Деркач В.М.",
  "200": "ФОП Гринчак А.М.",
  "201": "ТОВ \"Будімпульс-К\"",
  "207": "ФОП Палагнюк Р.В. (FCI)",
  "208": "Мандзюк В.Р.",
  "210": "ФОП Яремко Р.Я."
};

function escapeSql(str) {
  return str.replace(/'/g, "''");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJSON(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
  return resp.json();
}

async function fetchSupplyIngredients(supplyId, retries = 3) {
  const url = `https://joinposter.com/api/storage.getSupplyIngredients?token=${TOKEN}&supply_id=${supplyId}&format=json`;
  for (let i = 0; i < retries; i++) {
    try {
      const data = await fetchJSON(url);
      return data.response || [];
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(2000 * (i + 1));
    }
  }
}

async function main() {
  const suppliesPath = resolve(__dirname, '..', 'supplies_all.json');
  if (!existsSync(suppliesPath)) {
    console.error('Error: supplies_all.json not found. Fetch it first.');
    process.exit(1);
  }

  const rawText = readFileSync(suppliesPath, 'utf-8').replace(/^\uFEFF/, '');
  const rawSupplies = JSON.parse(rawText);
  const allSupplies = rawSupplies.response || rawSupplies;
  const supplies = allSupplies.filter(s =>
    String(s.storage_id) === String(WAREHOUSE_POSTER_STORAGE_ID) && s.delete === "0"
  );
  supplies.sort((a, b) => a.supply_id - b.supply_id);

  console.log(`Supplies for storage ${WAREHOUSE_POSTER_STORAGE_ID}: ${supplies.length}`);

  const supplierMap = new Map();
  for (const s of supplies) {
    const sid = s.supplier_id;
    if (!supplierMap.has(sid)) {
      supplierMap.set(sid, { poster_supplier_id: parseInt(sid), name: SUPPLIER_NAMES[sid] || s.supplier_name });
    }
  }
  console.log(`Unique suppliers: ${supplierMap.size}`);

  // Fetch/cache ingredients for all supplies
  const suppliesDir = resolve(__dirname, '..', 'supplies_data');
  if (!existsSync(suppliesDir)) mkdirSync(suppliesDir, { recursive: true });

  let completed = 0;
  let totalItems = 0;
  const failedSupplies = [];

  for (let i = 0; i < supplies.length; i += CONCURRENCY) {
    const batch = supplies.slice(i, i + CONCURRENCY);
    const batchPromises = batch.map(async (supply) => {
      const sid = supply.supply_id;
      const f = resolve(suppliesDir, `${sid}.json`);
      let ingredients;
      if (existsSync(f)) {
        ingredients = JSON.parse(readFileSync(f, 'utf-8'));
      } else {
        ingredients = await fetchSupplyIngredients(sid);
        writeFileSync(f, JSON.stringify(ingredients, null, 0));
      }
      return { supply, ingredients };
    });

    const results = await Promise.allSettled(batchPromises);
    for (const result of results) {
      if (result.status === 'fulfilled') {
        totalItems += result.value.ingredients.length;
        completed++;
        if (completed % 100 === 0 || completed <= 3) {
          console.log(`  ${completed}/${supplies.length} supplies, ${totalItems} items`);
        }
      } else {
        console.error(`  Failed: ${result.reason.message}`);
        failedSupplies.push(result.reason.message);
      }
    }
  }

  console.log(`\nFetched ${completed}/${supplies.length} supplies, ${totalItems} items`);
  if (failedSupplies.length > 0) console.log(`Failed: ${failedSupplies.length}`);

  // === Generate SQL Migration using JSONB inline data ===
  console.log('\nGenerating SQL...');

  const lines = [];
  lines.push('-- ============================================================================');
  lines.push('-- Миграция #8: Импорт истории поступлений из Poster (склад 37)');
  lines.push('-- Сгенерировано автоматически');
  lines.push('-- ============================================================================');
  lines.push('');
  lines.push('-- 1. Поля для связи с Poster');
  lines.push('ALTER TABLE household_chemicals.suppliers ADD COLUMN IF NOT EXISTS poster_supplier_id INT UNIQUE;');
  lines.push('ALTER TABLE household_chemicals.receipts ADD COLUMN IF NOT EXISTS poster_supply_id INT UNIQUE;');
  lines.push('');

  // Build JSONB data
  const suppliersJson = JSON.stringify([...supplierMap.values()]);
  const suppliesData = [];
  const itemsData = [];

  for (const supply of supplies) {
    const f = resolve(suppliesDir, `${supply.supply_id}.json`);
    if (!existsSync(f)) continue;
    const ingredients = JSON.parse(readFileSync(f, 'utf-8'));
    if (!ingredients || ingredients.length === 0) continue;

    suppliesData.push({
      poster_supply_id: parseInt(supply.supply_id),
      poster_supplier_id: parseInt(supply.supplier_id),
      date: supply.date.replace(' ', 'T')
    });

    for (const ing of ingredients) {
      itemsData.push({
        poster_supply_id: parseInt(supply.supply_id),
        poster_ingredient_id: parseInt(ing.ingredient_id),
        quantity: parseFloat(ing.supply_ingredient_num),
        sum: parseFloat(ing.supply_ingredient_sum)
      });
    }
  }

  lines.push('-- 2. Импорт');
  lines.push('DO $$');
  lines.push('DECLARE');
  lines.push('  v_warehouse_id INT;');
  lines.push('  v_supply RECORD;');
  lines.push('  v_item RECORD;');
  lines.push('  v_receipt_id UUID;');
  lines.push('  v_product RECORD;');
  lines.push('  v_supplier RECORD;');
  lines.push('  v_count INT := 0;');
  lines.push('  v_item_count INT := 0;');
  lines.push('BEGIN');
  lines.push('  SELECT id INTO v_warehouse_id FROM household_chemicals.warehouses WHERE poster_storage_id = 37;');
  lines.push('  IF v_warehouse_id IS NULL THEN');
  lines.push('    RAISE EXCEPTION \'Warehouse with poster_storage_id=37 not found\';');
  lines.push('  END IF;');
  lines.push('');

  // Insert suppliers
  lines.push('  -- Поставщики');
  const supJson = JSON.stringify([...supplierMap.values()]);
  lines.push(`  INSERT INTO household_chemicals.suppliers (name, poster_supplier_id)`);
  lines.push(`  SELECT name, poster_supplier_id`);
  lines.push(`  FROM jsonb_to_recordset('${escapeSql(supJson)}'::jsonb) AS x(poster_supplier_id INT, name TEXT)`);
  lines.push(`  ON CONFLICT (poster_supplier_id) DO NOTHING;`);
  lines.push('');
  lines.push('  RAISE NOTICE \'Suppliers inserted\';');
  lines.push('');

  // Create temp table for supply mapping
  lines.push('  -- Временная таблица для маппинга');
  lines.push('  CREATE TEMP TABLE IF NOT EXISTS tmp_supply_map (');
  lines.push('    poster_supply_id INT PRIMARY KEY,');
  lines.push('    receipt_id UUID');
  lines.push('  ) ON COMMIT DELETE ROWS;');
  lines.push('  DELETE FROM tmp_supply_map;');
  lines.push('');

  // Insert receipts in batch
  const suppliesJson = JSON.stringify(suppliesData);
  lines.push('  -- Приходные накладные');
  lines.push('  INSERT INTO household_chemicals.receipts (id, receipt_number, supplier_id, warehouse_id, status, confirmed_at, created_at, poster_supply_id)');
  lines.push('  SELECT');
  lines.push('    gen_random_uuid(),');
  lines.push('    \'PS-\' || x.poster_supply_id,');
  lines.push('    s.id,');
  lines.push('    v_warehouse_id,');
  lines.push('    \'confirmed\',');
  lines.push('    x.date::timestamptz,');
  lines.push('    x.date::timestamptz,');
  lines.push('    x.poster_supply_id');
  lines.push(`  FROM jsonb_to_recordset('${escapeSql(suppliesJson)}'::jsonb) AS x(poster_supply_id INT, poster_supplier_id INT, date TEXT)`);
  lines.push('  JOIN household_chemicals.suppliers s ON s.poster_supplier_id = x.poster_supplier_id');
  lines.push('  ON CONFLICT (poster_supply_id) DO UPDATE SET poster_supply_id = EXCLUDED.poster_supply_id;');
  lines.push('');
  lines.push('  -- Сохраняем маппинг');
  lines.push('  INSERT INTO tmp_supply_map (poster_supply_id, receipt_id)');
  lines.push('  SELECT r.poster_supply_id, r.id FROM household_chemicals.receipts r WHERE r.poster_supply_id IS NOT NULL');
  lines.push('  ON CONFLICT (poster_supply_id) DO NOTHING;');
  lines.push('');
  lines.push('  RAISE NOTICE \'Receipts inserted\';');
  lines.push('');

  // Insert receipt items in batch
  const itemsJson = JSON.stringify(itemsData);
  lines.push('  -- Строки приходных накладных');
  lines.push('  -- (Poster суммы в копейках => /100 = гривны; цена = сумма / количество / 100)');
  lines.push('  INSERT INTO household_chemicals.receipt_items (receipt_id, product_id, quantity, price)');
  lines.push('  SELECT');
  lines.push('    m.receipt_id,');
  lines.push('    p.id,');
  lines.push('    x.quantity,');
  lines.push('    (CASE WHEN x.quantity > 0 THEN (x.sum / x.quantity / 100.0) ELSE 0 END)');
  lines.push(`  FROM jsonb_to_recordset('${escapeSql(itemsJson)}'::jsonb) AS x(poster_supply_id INT, poster_ingredient_id INT, quantity NUMERIC, sum NUMERIC)`);
  lines.push('  JOIN tmp_supply_map m ON m.poster_supply_id = x.poster_supply_id');
  lines.push('  JOIN household_chemicals.products p ON p.poster_ingredient_id = x.poster_ingredient_id');
  lines.push('  ON CONFLICT DO NOTHING;');
  lines.push('');
  lines.push('  RAISE NOTICE \'Receipt items inserted\';');
  lines.push('');

  // Update stock balances
  lines.push('  -- Обновление остатков');
  lines.push('  FOR v_item IN');
  lines.push('    SELECT ri.receipt_id, ri.product_id, ri.quantity, r.warehouse_id');
  lines.push('    FROM household_chemicals.receipt_items ri');
  lines.push('    JOIN household_chemicals.receipts r ON r.id = ri.receipt_id');
  lines.push('    WHERE r.poster_supply_id IS NOT NULL');
  lines.push('      AND r.id NOT IN (SELECT DISTINCT reference_id FROM household_chemicals.stock_movements WHERE reference_type = \'receipt\')');
  lines.push('  LOOP');
  lines.push('    PERFORM household_chemicals.update_stock_balance(');
  lines.push('      v_item.product_id, v_item.warehouse_id, v_item.quantity,');
  lines.push('      \'receipt\', \'receipt\', v_item.receipt_id,');
  lines.push('      \'Імпорт з Poster: історія постачання\', NULL');
  lines.push('    );');
  lines.push('    v_item_count := v_item_count + 1;');
  lines.push('  END LOOP;');
  lines.push('');
  lines.push('  DROP TABLE IF EXISTS tmp_supply_map;');
  lines.push('');
  lines.push(`  RAISE NOTICE 'Done: % receipts, % items processed', ${suppliesData.length}, v_item_count;`);
  lines.push('END;');
  lines.push('$$;');
  lines.push('');

  lines.push(`-- Всего накладных: ${suppliesData.length}`);
  lines.push(`-- Всего строк: ${itemsData.length}`);
  lines.push('-- ============================================================================');

  const sql = lines.join('\n');

  const outPath = resolve(__dirname, '..', '..', 'supabase', 'migrations', 'household', '20260524_import_poster_supplies.sql');
  writeFileSync(outPath, sql, 'utf-8');
  
  console.log(`\nSQL written: ${outPath}`);
  console.log(`Suppliers: ${supplierMap.size}`);
  console.log(`Supplies (receipts): ${suppliesData.length}`);
  console.log(`Receipt items: ${itemsData.length}`);
  console.log(`SQL size: ${(sql.length / 1024).toFixed(0)} KB`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
