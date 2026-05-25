import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getSupabase(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_KEY, { db: { schema: 'household_chemicals' } } as any)
}

async function tgSend(chatId: number, text: string, parseMode?: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, ...(parseMode ? { parse_mode: parseMode } : {}) }),
  })
}

async function tgSendMenu(chatId: number, text: string, buttons: { text: string; callback_data: string }[][]) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } }),
  })
}

async function tgEditMenu(chatId: number, messageId: number, text: string, buttons: { text: string; callback_data: string }[][]) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } }),
  })
}

async function tgAnswerCallback(callbackQueryId: string, text?: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, ...(text ? { text } : {}) }),
  })
}

const DEFAULT_WAREHOUSE_ID = 1

async function showCategories(supabase: SupabaseClient, chatId: number, messageId: number | undefined, prefix: string) {
  const { data: cats } = await supabase.rpc('rpc_categories_tree')
  const categories = (cats as any[]) || []
  const buttons = categories.map(c => [{ text: c.name, callback_data: `${prefix}:cat:${c.id}` }])
  buttons.push([{ text: prefix === 'order' ? '✅ Підтвердити' : '❌ Закрити', callback_data: `${prefix}:done` }])
  const text = '📂 <b>Категорії товарів</b>\n\nОберіть категорію:'
  if (messageId) await tgEditMenu(chatId, messageId, text, buttons)
  else await tgSendMenu(chatId, text, buttons)
}

async function showShopSelection(supabase: SupabaseClient, chatId: number, messageId: number) {
  const { data: shopsRaw } = await supabase.rpc('rpc_shops_with_stats', { p_days: 365 })
  const shops = (shopsRaw as any[]) || []
  if (shops.length === 0) {
    await tgEditMenu(chatId, messageId, '❌ Немає доступних магазинів', [[{ text: '⬅️ Назад', callback_data: 'order:cancel' }]])
    return
  }
  const buttons = shops.map(s => [{ text: `🏪 ${s.name}`, callback_data: `order:shop:${s.id}` }])
  buttons.push([{ text: '❌ Скасувати', callback_data: 'order:cancel' }])
  await tgEditMenu(chatId, messageId, '🛒 <b>Нове замовлення</b>\n\nОберіть магазин:', buttons)
}

async function showQuantityButtons(supabase: SupabaseClient, chatId: number, messageId: number, productId: number, prefix: string) {
  const { data: prod } = await supabase.from('products').select('name, unit').eq('id', productId).single()
  const presets = [1, 2, 5, 10, 20, 50, 100, 500]
  const rows: { text: string; callback_data: string }[][] = []
  for (let i = 0; i < presets.length; i += 4) {
    rows.push(presets.slice(i, i + 4).map(q => ({ text: `${q}`, callback_data: `${prefix}:qty:${productId}:${q}` })))
  }
  rows.push([{ text: `✏️ Своя кількість`, callback_data: `${prefix}:custom:${productId}` }])
  rows.push([{ text: '⬅️ Назад', callback_data: `${prefix}:add` }])
  await tgEditMenu(chatId, messageId,
    `🛒 <b>${prod?.name || 'Товар'}</b>\n\nОберіть кількість (${prod?.unit || 'шт'}):`,
    rows
  )
}

async function addItemToPendingOrder(supabase: SupabaseClient, tgUserId: number, chatId: number, productId: number, quantity: number) {
  const { data: pending } = await supabase
    .from('telegram_pending_orders')
    .select('items')
    .eq('telegram_user_id', tgUserId)
    .eq('chat_id', chatId)
    .single()
  if (!pending) return false
  const items = (pending.items as any[]) || []
  // Check if this product already added, merge quantities
  const existing = items.find(i => i.product_id === productId && i.quantity != null)
  if (existing) {
    existing.quantity = (existing.quantity || 0) + quantity
  } else {
    items.push({ product_id: productId, quantity })
  }
  const { error } = await supabase
    .from('telegram_pending_orders')
    .update({ items, step: 'adding_items' })
    .eq('telegram_user_id', tgUserId)
    .eq('chat_id', chatId)
  return !error
}

async function showOrderSummary(supabase: SupabaseClient, chatId: number, messageId: number, tgUserId: number) {
  const { data: pending } = await supabase
    .from('telegram_pending_orders')
    .select('*, shops:shop_id(name), telegram_users:telegram_user_id(id)')
    .eq('telegram_user_id', tgUserId)
    .eq('chat_id', chatId)
    .single()
  if (!pending) return
  const items = (pending.items as any[]) || []
  const shopName = (pending as any).shops?.name || 'Невідомий'

  // Fetch product names
  const productIds = items.map((i: any) => i.product_id).filter(Boolean)
  const { data: prods } = await supabase.from('products').select('id, name, unit').in('id', productIds)
  const prodMap = new Map((prods || []).map(p => [p.id, p]))

  let text = `🛒 <b>Ваше замовлення</b>\n\n🏪 Магазин: ${shopName}\n\n<b>Товари:</b>\n`
  let totalItems = 0
  for (const item of items) {
    const p = prodMap.get(item.product_id)
    text += `• ${p?.name || `ID:${item.product_id}`} — <b>${item.quantity}</b> ${p?.unit || 'шт'}\n`
    totalItems += item.quantity
  }
  text += `\nВсього позицій: <b>${items.length}</b>\nВсього одиниць: <b>${totalItems}</b>`

  const buttons = [
    [{ text: '➕ Додати ще товар', callback_data: 'order:add' }],
    [{ text: '✅ Підтвердити замовлення', callback_data: 'order:confirm' }],
    [{ text: '❌ Скасувати', callback_data: 'order:cancel' }],
  ]
  await tgEditMenu(chatId, messageId, text, buttons)
}

async function confirmOrder(supabase: SupabaseClient, chatId: number, messageId: number, tgUserId: number) {
  const { data: pending } = await supabase
    .from('telegram_pending_orders')
    .select('*')
    .eq('telegram_user_id', tgUserId)
    .eq('chat_id', chatId)
    .single()
  if (!pending) {
    await tgEditMenu(chatId, messageId, '❌ Замовлення не знайдено', [])
    return
  }
  const items = (pending.items as any[]) || []
  if (items.length === 0) {
    await tgEditMenu(chatId, messageId, '❌ Додайте хоча б один товар', [[{ text: '➕ Додати товар', callback_data: 'order:add' }]])
    return
  }

  const { data: result, error } = await supabase.rpc('telegram_create_order', {
    p_telegram_user_id: tgUserId,
    p_shop_id: pending.shop_id,
    p_warehouse_id: DEFAULT_WAREHOUSE_ID,
    p_items: JSON.stringify(items.map(i => ({ product_id: i.product_id, quantity: i.quantity }))),
    p_notes: null,
    p_telegram_message_id: null,
  })
  const res = result as any

  if (error || !res?.success) {
    await tgEditMenu(chatId, messageId, `❌ Помилка створення замовлення: ${res?.error || error?.message || 'невідома'}`, [])
    return
  }

  // Clear pending order
  await supabase.from('telegram_pending_orders').delete().eq('id', pending.id)

  await tgEditMenu(chatId, messageId,
    `✅ <b>Замовлення створено!</b>\n\n`
    + `Номер: <b>${res.order_number}</b>\n`
    + `Створено позицій: <b>${res.items_created}</b>\n\n`
    + `Статус замовлення можна перевірити командою:\n`
    + `<code>/status ${res.order_number}</code>`,
    []
  )
}

async function cancelOrder(supabase: SupabaseClient, chatId: number, messageId: number, tgUserId: number) {
  await supabase
    .from('telegram_pending_orders')
    .delete()
    .eq('telegram_user_id', tgUserId)
    .eq('chat_id', chatId)
  await tgEditMenu(chatId, messageId, '❌ Замовлення скасовано.', [])
}

export async function POST(req: NextRequest) {
  const start = Date.now()
  const supabase = getSupabase()
  try {
    const update = await req.json()
    const cbQuery = update.callback_query
    const msg = update.message || cbQuery?.message
    const data = cbQuery?.data || ''
    if (!msg) return NextResponse.json({ ok: true })

    const chatId = msg.chat.id
    const messageId = msg.message_id
    const userId = msg.from?.id
    const userName = msg.from?.username || null
    const firstName = msg.from?.first_name || null
    const lastName = msg.from?.last_name || null
    const text = data || msg.text || ''
    const isCallback = !!cbQuery

    const { data: tgUser, error: userErr } = await supabase.rpc('telegram_get_or_create_user', {
      p_user_id: userId, p_username: userName, p_first_name: firstName, p_last_name: lastName,
    })
    if (userErr || !tgUser) {
      console.error('telegram_get_or_create_user error:', userErr)
      return NextResponse.json({ ok: true })
    }
    const tgUserId = tgUser.id
    const messageType = isCallback ? 'callback_query' : text.startsWith('/') ? 'command' : 'text'

    await supabase.rpc('telegram_log_message', {
      p_telegram_user_id: tgUserId, p_chat_id: chatId, p_message_id: messageId,
      p_message_type: messageType, p_text_content: text, p_processing_time_ms: Date.now() - start,
    })

    // ---- HANDLE CALLBACK QUERIES ----
    if (isCallback && data) {
      if (data === 'close') {
        await tgEditMenu(chatId, messageId, '✅ Готово.', [])
        return NextResponse.json({ ok: true })
      }
      if (data === 'order:cancel') {
        await cancelOrder(supabase, chatId, messageId, tgUserId)
        return NextResponse.json({ ok: true })
      }
      if (data === 'order:confirm') {
        await confirmOrder(supabase, chatId, messageId, tgUserId)
        return NextResponse.json({ ok: true })
      }
      if (data === 'order:add') {
        await showCategories(supabase, chatId, messageId, 'order')
        return NextResponse.json({ ok: true })
      }
      if (data.startsWith('order:shop:')) {
        const shopId = parseInt(data.split(':')[2])
        await supabase.from('telegram_pending_orders').upsert({
          telegram_user_id: tgUserId, chat_id: chatId, step: 'selecting_shop',
          shop_id: shopId, items: [],
        }, { onConflict: 'telegram_user_id, chat_id', ignoreDuplicates: false })
        await showCategories(supabase, chatId, messageId, 'order')
        return NextResponse.json({ ok: true })
      }
      if (data.startsWith('shopset:')) {
        const shopId = parseInt(data.split(':')[1])
        await supabase.from('telegram_users').update({ shop_id: shopId }).eq('id', tgUserId)
        const { data: shop } = await supabase.from('shops').select('name').eq('id', shopId).single()
        await tgEditMenu(chatId, messageId, `✅ Ваш магазин: <b>${shop?.name || '?'}</b>\n\nТепер /order одразу створює замовлення для цього магазину.`, [])
        return NextResponse.json({ ok: true })
      }
      if (data.startsWith('order:cat:')) {
        const catId = parseInt(data.split(':')[2])
        const { data: cats } = await supabase.rpc('rpc_categories_tree')
        const cat = ((cats as any[]) || []).find(c => c.id === catId)
        const { data: catData } = await supabase.rpc('rpc_product_catalog', {
          p_category_id: catId, p_warehouse_id: DEFAULT_WAREHOUSE_ID, p_page: 1, p_page_size: 50,
        })
        const info = catData as any || {}
        const products = info.products || info.items || []
        if (products.length === 0) {
          await tgAnswerCallback(cbQuery.id, 'У цій категорії немає товарів')
          await showCategories(supabase, chatId, messageId, 'order')
          return NextResponse.json({ ok: true })
        }
        const buttons = products.map((p: any) => [{
          text: `${p.name} — ${p.total_stock ?? 0} ${p.unit || 'шт'}`,
          callback_data: `order:prod:${p.id}`,
        }])
        buttons.push([{ text: '⬅️ Назад', callback_data: 'order:back' }])
        await tgEditMenu(chatId, messageId, `📂 <b>${cat?.name || 'Категорія'}</b>\n\nОберіть товар:`, buttons)
        return NextResponse.json({ ok: true })
      }
      if (data.startsWith('order:prod:')) {
        const prodId = parseInt(data.split(':')[2])
        await showQuantityButtons(supabase, chatId, messageId, prodId, 'order')
        return NextResponse.json({ ok: true })
      }
      if (data.startsWith('order:qty:')) {
        const parts = data.split(':')
        await addItemToPendingOrder(supabase, tgUserId, chatId, parseInt(parts[2]), parseInt(parts[3]))
        await showOrderSummary(supabase, chatId, messageId, tgUserId)
        return NextResponse.json({ ok: true })
      }
      if (data.startsWith('order:custom:')) {
        const prodId = parseInt(data.split(':')[2])
        // Save a temporary marker in items array
        const { data: pending } = await supabase
          .from('telegram_pending_orders')
          .select('items')
          .eq('telegram_user_id', tgUserId)
          .eq('chat_id', chatId)
          .single()
        const items = (pending?.items as any[]) || []
        // Remove any existing custom marker
        const filtered = items.filter((i: any) => i._custom)
        filtered.push({ product_id: prodId, _custom: true })
        await supabase.from('telegram_pending_orders').update({ items: filtered, step: 'adding_items' })
          .eq('telegram_user_id', tgUserId).eq('chat_id', chatId)

        const { data: prod } = await supabase.from('products').select('name, unit').eq('id', prodId).single()
        await tgEditMenu(chatId, messageId,
          `✏️ <b>${prod?.name || 'Товар'}</b>\n\n`
          + `<i>Надрукуйте кількість у відповідь на це повідомлення.</i>\n`
          + `Наприклад: <code>15</code>`,
          [[{ text: '⬅️ Назад', callback_data: 'order:add' }]]
        )
        return NextResponse.json({ ok: true })
      }
      if (data === 'order:back' || data.startsWith('order:back:')) {
        await showCategories(supabase, chatId, messageId, 'order')
        return NextResponse.json({ ok: true })
      }
      if (data === 'order:done') {
        await showOrderSummary(supabase, chatId, messageId, tgUserId)
        return NextResponse.json({ ok: true })
      }

      // Catalog callbacks
      if (data.startsWith('cat:')) {
        const catId = parseInt(data.split(':')[1])
        const { data: catData } = await supabase.rpc('rpc_product_catalog', {
          p_category_id: catId, p_warehouse_id: DEFAULT_WAREHOUSE_ID, p_page: 1, p_page_size: 50,
        })
        const info = catData as any || {}
        const products = info.products || info.items || []

        let text = `📂 <b>Товари в категорії</b>\n\n`
        if (products.length === 0) {
          text += 'Немає товарів'
        } else {
          for (const p of products) {
            const stock = p.total_stock ?? 0
            const emoji = stock <= 0 ? '🔴' : p.min_stock != null && stock <= p.min_stock ? '🟠' : '🟢'
            text += `${emoji} <b>${p.name}</b>\n`
            text += `   Артикул: ${p.sku || '—'} | Залишок: ${stock} ${p.unit || 'шт'}`
            if (p.purchase_price) text += ` | Ціна: ${p.purchase_price} грн`
            text += '\n\n'
          }
        }
        text += `<i>Натисніть /order щоб зробити замовлення</i>`
        // Telegram limit 4096
        for (let i = 0; i < text.length; i += 4000) {
          await tgSend(chatId, text.substring(i, i + 4000))
        }
        return NextResponse.json({ ok: true })
      }

      return NextResponse.json({ ok: true })
    }

    // ---- HANDLE TEXT MESSAGES (including as custom quantity) ----
    if (!isCallback) {
      // Check if user has a pending order with a custom quantity marker
      const { data: pending } = await supabase
        .from('telegram_pending_orders')
        .select('*')
        .eq('telegram_user_id', tgUserId)
        .eq('chat_id', chatId)
        .maybeSingle()

      if (pending) {
        const items = (pending.items as any[]) || []
        const customItem = items.find((i: any) => i._custom)
        if (customItem && text.length > 0) {
          // This is a custom quantity input
          const quantity = parseFloat(text.replace(',', '.'))
          if (isNaN(quantity) || quantity <= 0) {
            await tgSend(chatId, '❌ Будь ласка, введіть додатнє число. Приклад: <code>10</code>', 'HTML')
            return NextResponse.json({ ok: true })
          }
          // Remove the custom marker item and add real item
          const newItems = items.filter((i: any) => !i._custom)
          newItems.push({ product_id: customItem.product_id, quantity })
          await supabase.from('telegram_pending_orders').update({ items: newItems }).eq('id', pending.id)

          const { data: prod } = await supabase.from('products').select('name') .eq('id', customItem.product_id).single()
          await tgSend(chatId, `✅ <b>${prod?.name || 'Товар'}</b> додано: ${quantity} шт.`, 'HTML')
          return NextResponse.json({ ok: true })
        }
      }

      // Handle commands
      if (text === '/start') {
        await tgSend(chatId,
          '👋 <b>Вітаю в системі складського обліку!</b>\n\n'
          + 'Я — бот для замовлення товарів зі складу.\n\n'
          + 'Доступні команди:\n'
          + '/catalog — переглянути каталог товарів\n'
          + '/order — зробити замовлення\n'
          + '/status — перевірити статус замовлення\n'
          + '/myshop — вказати ваш магазин\n'
          + '/whoami — мої дані\n'
          + '/cancel — скасувати поточне замовлення\n'
          + '/help — довідка',
          'HTML'
        )
        return NextResponse.json({ ok: true })
      }
      if (text === '/help') {
        await tgSend(chatId,
          '<b>Довідка</b>\n\n'
          + '/catalog — переглянути каталог товарів (вибір категорії)\n'
          + '/order — створити замовлення\n'
          + '/status <номер_заявки> — перевірити статус\n'
          + '/myshop — вказати ваш магазин\n'
          + '/whoami — мої дані\n'
          + '/cancel — скасувати поточне замовлення\n'
          + '/start — вітальне повідомлення\n\n'
          + '<i>Під час замовлення просто вводьте кількість товару</i>',
          'HTML'
        )
        return NextResponse.json({ ok: true })
      }
      if (text === '/catalog') {
        await showCategories(supabase, chatId, undefined, 'cat')
        return NextResponse.json({ ok: true })
      }
      if (text === '/order') {
        if ((tgUser as any).shop_id) {
          await supabase.from('telegram_pending_orders').upsert({
            telegram_user_id: tgUserId, chat_id: chatId, step: 'selecting_shop',
            shop_id: (tgUser as any).shop_id, items: [],
          }, { onConflict: 'telegram_user_id, chat_id', ignoreDuplicates: false })
          await showCategories(supabase, chatId, messageId, 'order')
        } else {
          await showShopSelection(supabase, chatId, messageId)
        }
        return NextResponse.json({ ok: true })
      }
      if (text === '/cancel') {
        const { data: p } = await supabase.from('telegram_pending_orders')
          .select('id').eq('telegram_user_id', tgUserId).eq('chat_id', chatId).maybeSingle()
        if (p) {
          await supabase.from('telegram_pending_orders').delete().eq('id', p.id)
          await tgSend(chatId, '❌ Поточне замовлення скасовано.')
        } else {
          await tgSend(chatId, 'Немає активного замовлення.')
        }
        return NextResponse.json({ ok: true })
      }
      if (text === '/myshop') {
        const { data: shopsRaw } = await supabase.rpc('rpc_shops_with_stats', { p_days: 365 })
        const shops = (shopsRaw as any[]) || []
        const currentShopId = (tgUser as any).shop_id
        const { data: curShop } = currentShopId
          ? await supabase.from('shops').select('name').eq('id', currentShopId).single()
          : { data: null }

        let msg = '🏪 <b>Налаштування магазину</b>\n\n'
        if (curShop) msg += `Ваш поточний магазин: <b>${curShop.name}</b>\n\n`
        else msg += 'У вас не встановлено магазин.\n\n'
        msg += 'Оберіть ваш магазин:'

        const buttons = shops.map(s => [{
          text: `${currentShopId === s.id ? '✅ ' : ''}${s.name}`,
          callback_data: `shopset:${s.id}`,
        }])
        await tgSendMenu(chatId, msg, buttons)
        return NextResponse.json({ ok: true })
      }
      if (text === '/whoami') {
        const shopName = (tgUser as any).shop_id
          ? (await supabase.from('shops').select('name').eq('id', (tgUser as any).shop_id).single()).data?.name
          : 'не встановлено'
        await tgSend(chatId,
          `<b>Ваші дані:</b>\n\n`
          + `ID в Telegram: <code>${userId}</code>\n`
          + `ID в системі: <code>${tgUserId}</code>\n`
          + `Ім\'я: ${firstName || ''} ${lastName || ''}\n`
          + `Логін: @${userName || '—'}\n`
          + `Магазин: <b>${shopName}</b>\n\n`
          + `/myshop — змінити магазин`,
          'HTML'
        )
        return NextResponse.json({ ok: true })
      }
      if (text.startsWith('/status ')) {
        const orderNumber = text.replace('/status ', '').trim()
        const { data: statusData } = await supabase.rpc('telegram_check_order_status', { p_order_number: orderNumber })
        const info = statusData as Record<string, unknown>
        if (info && info.found) {
          await tgSend(chatId,
            `📦 <b>Заявка ${info.order_number}</b>\n`
            + `Статус: ${info.status}\n`
            + `Магазин: ${info.shop_name}\n`
            + `Склад: ${info.warehouse_name}\n`
            + `Позицій: ${info.items_count}\n`
            + `Замовлено: ${info.total_requested} шт\n`
            + `Відвантажено: ${info.total_shipped} шт\n`
            + `Створено: ${info.created_at}`,
            'HTML'
          )
        } else {
          await tgSend(chatId, `❌ Заявку ${orderNumber} не знайдено`)
        }
        return NextResponse.json({ ok: true })
      }
      if (text.startsWith('/')) {
        await tgSend(chatId, `❌ Невідома команда. Напишіть /help`)
        return NextResponse.json({ ok: true })
      }

      await tgSend(chatId, `✅ Повідомлення отримано.\nНапишіть /help щоб побачити доступні команди.`)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Webhook error:', err)
    return NextResponse.json({ ok: true })
  }
}