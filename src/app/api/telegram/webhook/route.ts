import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || ''

if (!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Missing required env: TELEGRAM_BOT_TOKEN, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
}

const RATE_LIMIT_MS = 500
const rateLimitMap = new Map<number, number>()
const RATE_LIMIT_CLEANUP_INTERVAL = 60000

setInterval(() => {
  const now = Date.now()
  for (const [key, ts] of rateLimitMap) {
    if (now - ts > RATE_LIMIT_MS * 10) rateLimitMap.delete(key)
  }
}, RATE_LIMIT_CLEANUP_INTERVAL)

function checkRateLimit(userId: number): boolean {
  const now = Date.now()
  const last = rateLimitMap.get(userId)
  if (last && now - last < RATE_LIMIT_MS) return false
  rateLimitMap.set(userId, now)
  return true
}

function getSupabase(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_KEY, { db: { schema: 'household_chemicals' } } as any)
}

function safeText(text: string, maxLen = 4000): string {
  return String(text).substring(0, maxLen)
}

function safeHTML(text: string): string {
  return safeText(text).replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function getCallbackParts(data: string, expected: number): string[] | null {
  const parts = data.split(':')
  return parts.length >= expected ? parts : null
}

function safeInt(val: string | undefined, fallback = 0): number {
  const n = parseInt(val ?? '', 10)
  return isFinite(n) ? n : fallback
}

function safeQuantity(val: string): number | null {
  const n = parseFloat(val.replace(',', '.'))
  if (isNaN(n) || !isFinite(n) || n <= 0 || n > 999999) return null
  return n
}

function safeItems(items: unknown): any[] {
  return Array.isArray(items) ? items : []
}

async function tgSend(chatId: number, text: string, parseMode?: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: safeText(text), ...(parseMode ? { parse_mode: parseMode } : {}) }),
  })
}

async function tgSendMenu(chatId: number, text: string, buttons: { text: string; callback_data: string }[][]) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: safeText(text), parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } }),
  })
}

async function tgEditMenu(chatId: number, messageId: number, text: string, buttons: { text: string; callback_data: string }[][]) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: safeText(text), parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } }),
  })
}

async function tgAnswerCallback(callbackQueryId: string, text?: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, ...(text ? { text: safeText(text) } : {}) }),
  })
}

const DEFAULT_WAREHOUSE_ID = 1

async function showCategories(supabase: SupabaseClient, chatId: number, messageId: number | undefined, prefix: string) {
  const { data: cats } = await supabase.rpc('rpc_categories_tree')
  const categories = (cats as any[]) || []
  const buttons = categories.map(c => [{ text: safeHTML(c.name), callback_data: `${prefix}:cat:${c.id}` }])
  buttons.push([{ text: prefix === 'order' ? '✅ Пiдтвердити' : '❌ Закрити', callback_data: `${prefix}:done` }])
  const text = 'Виберiть категорiю:'
  if (messageId) await tgEditMenu(chatId, messageId, text, buttons)
  else await tgSendMenu(chatId, text, buttons)
}

async function showShopSelection(supabase: SupabaseClient, chatId: number, messageId: number, prefix: string) {
  const { data: shopsRaw } = await supabase.rpc('rpc_shops_with_stats', { p_days: 365 })
  const shops = (shopsRaw as any[]) || []
  if (shops.length === 0) {
    await tgEditMenu(chatId, messageId, 'Немае доступних магазинiв', [[{ text: 'Назад', callback_data: `${prefix}:cancel` }]])
    return
  }
  const buttons = shops.map(s => [{ text: safeHTML(s.name), callback_data: `${prefix}:shop:${s.id}` }])
  buttons.push([{ text: 'Вiдмiна', callback_data: `${prefix}:cancel` }])
  await tgEditMenu(chatId, messageId, 'Оберiть магазин:', buttons)
}

async function showQuantityButtons(supabase: SupabaseClient, chatId: number, messageId: number, productId: number, prefix: string) {
  const { data: prod } = await supabase.from('products').select('name, unit').eq('id', productId).single()
  const presets = [1, 2, 5, 10, 20, 50, 100, 500]
  const rows: { text: string; callback_data: string }[][] = []
  for (let i = 0; i < presets.length; i += 4) {
    rows.push(presets.slice(i, i + 4).map(q => ({ text: `${q}`, callback_data: `${prefix}:qty:${productId}:${q}` })))
  }
  rows.push([{ text: `Своя кiлькiсть`, callback_data: `${prefix}:custom:${productId}` }])
  rows.push([{ text: 'Назад', callback_data: `${prefix}:add` }])
  await tgEditMenu(chatId, messageId, `Товар: ${safeHTML(prod?.name || '?')}\nОдиниця: ${safeHTML(prod?.unit || 'шт')}`, rows)
}

async function addItemToPendingOrder(supabase: SupabaseClient, tgUserId: number, chatId: number, productId: number, quantity: number) {
  const { data: pending } = await supabase
    .from('telegram_pending_orders')
    .select('items')
    .eq('telegram_user_id', tgUserId)
    .eq('chat_id', chatId)
    .single()
  if (!pending) return false
  const items = safeItems(pending.items)
  const existing = items.find((i: any) => i.product_id === productId && i.quantity != null)
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
  const items = safeItems(pending.items)
  const shopName = (pending as any).shops?.name || 'Невiдомий'
  const productIds = items.map((i: any) => i.product_id).filter(Boolean)
  const { data: prods } = await supabase.from('products').select('id, name, unit').in('id', productIds)
  const prodMap = new Map((prods || []).map(p => [p.id, p]))

  let text = `Ваше замовлення\n\nМагазин: ${safeHTML(shopName)}\n\nТовари:\n`
  let totalItems = 0
  for (const item of items) {
    const p = prodMap.get(item.product_id)
    text += `${safeHTML(p?.name || `ID:${item.product_id}`)} - ${item.quantity} ${safeHTML(p?.unit || 'шт')}\n`
    totalItems += item.quantity
  }
  text += `\nВсього позицiй: ${items.length}\nВсього одиниць: ${totalItems}`

  const buttons = [
    [{ text: 'Додати ще товар', callback_data: 'order:add' }],
    [{ text: 'Пiдтвердити', callback_data: 'order:confirm' }],
    [{ text: 'Скасувати', callback_data: 'order:cancel' }],
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
    await tgEditMenu(chatId, messageId, 'Замовлення не знайдено', [])
    return
  }
  const items = safeItems(pending.items)
  if (items.length === 0) {
    await tgEditMenu(chatId, messageId, 'Додайте хоча б один товар', [[{ text: 'Додати товар', callback_data: 'order:add' }]])
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
    await tgEditMenu(chatId, messageId, `Помилка: ${safeHTML(res?.error || error?.message || 'невiдома')}`, [])
    return
  }

  await supabase.from('telegram_pending_orders').delete().eq('id', pending.id)
  await tgEditMenu(chatId, messageId,
    `Створено!\n\nНомер: ${safeHTML(res.order_number)}\nПозицiй: ${res.items_created}\n\n/status ${safeHTML(res.order_number)}`,
    []
  )
}

async function cancelOrder(supabase: SupabaseClient, chatId: number, messageId: number, tgUserId: number) {
  await supabase.from('telegram_pending_orders').delete().eq('telegram_user_id', tgUserId).eq('chat_id', chatId)
  await tgEditMenu(chatId, messageId, 'Скасовано.', [])
}

async function startOnboarding(supabase: SupabaseClient, chatId: number, tgUserId: number) {
  await supabase.from('telegram_pending_orders').upsert({
    telegram_user_id: tgUserId, chat_id: chatId, step: 'onboarding_name', items: [],
  }, { onConflict: 'telegram_user_id, chat_id', ignoreDuplicates: false })
  await tgSend(chatId,
    'Ласкаво просимо!\n\n'
    + 'Для роботи потрiбно заповнити профiль.\n\n'
    + 'Крок 1 з 3: Введiть ваше прiзвище та iм`я.\n'
    + 'Наприклад: Петренко Олена'
  )
}

export async function POST(req: NextRequest) {
  if (WEBHOOK_SECRET) {
    const token = req.headers.get('x-telegram-bot-api-secret-token')
    if (token !== WEBHOOK_SECRET) {
      console.error('Webhook secret token mismatch')
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }
  }

  const start = Date.now()
  const supabase = getSupabase()
  try {
    const update = await req.json()
    const cbQuery = update.callback_query
    const editedMsg = update.edited_message
    const msg = update.message || cbQuery?.message
    const data = cbQuery?.data || ''
    if (!msg && !editedMsg) return NextResponse.json({ ok: true })

    // Обробка редагованих повідомлень
    if (editedMsg && !cbQuery) {
      const eChatId = editedMsg.chat.id
      const eUserId = editedMsg.from?.id
      if (!checkRateLimit(eUserId)) return NextResponse.json({ ok: true })

      const { data: eTgUser } = await supabase.rpc('telegram_get_or_create_user', {
        p_user_id: eUserId, p_username: editedMsg.from?.username || null,
        p_first_name: editedMsg.from?.first_name || null, p_last_name: editedMsg.from?.last_name || null,
      })
      if (!eTgUser) return NextResponse.json({ ok: true })

      const eText = editedMsg.text || editedMsg.caption || ''
      if (eText && eChatId < 0) {
        await handleEditedOrderMessage(supabase, eTgUser.id, editedMsg.message_id, eChatId, eText)
      }
      return NextResponse.json({ ok: true })
    }

    const chatId = msg.chat.id
    const messageId = msg.message_id
    const userId = msg.from?.id
    const userName = msg.from?.username || null
    const firstName = msg.from?.first_name || null
    const lastName = msg.from?.last_name || null
    const text = data || msg.text || msg.caption || ''
    const isCallback = !!cbQuery

    if (!checkRateLimit(userId)) {
      await tgAnswerCallback(cbQuery?.id, 'Зачекайте перед наступною дiєю')
      return NextResponse.json({ ok: true })
    }

    const { data: tgUser, error: userErr } = await supabase.rpc('telegram_get_or_create_user', {
      p_user_id: userId, p_username: userName, p_first_name: firstName, p_last_name: lastName,
    })
    if (userErr || !tgUser) {
      console.error('telegram_get_or_create_user error:', userErr)
      return NextResponse.json({ ok: true })
    }
    const tgUserId = tgUser.id
    const tgUserData = tgUser as any
    const messageType = isCallback ? 'callback_query' : text.startsWith('/') ? 'command' : 'text'

    await supabase.rpc('telegram_log_message', {
      p_telegram_user_id: tgUserId, p_chat_id: chatId, p_message_id: messageId,
      p_message_type: messageType, p_text_content: text, p_processing_time_ms: Date.now() - start,
    })

    // ---- CALLBACK QUERIES ----
    if (isCallback && data) {
      if (data === 'onboard:skip_phone') {
        await supabase.from('telegram_pending_orders').delete().eq('telegram_user_id', tgUserId).eq('chat_id', chatId)
        await tgEditMenu(chatId, messageId, 'Реєстрацiя завершена! Тепер /order для замовлення.', [])
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
      if (data === 'order:back' || data.startsWith('order:back:')) {
        await showCategories(supabase, chatId, messageId, 'order')
        return NextResponse.json({ ok: true })
      }
      if (data === 'order:done') {
        await showOrderSummary(supabase, chatId, messageId, tgUserId)
        return NextResponse.json({ ok: true })
      }

      const parts = getCallbackParts(data, 2)
      if (!parts) return NextResponse.json({ ok: true })

      const prefix = parts[0]
      const action = parts[1]

      if (prefix === 'onboard' && action === 'shop') {
        const shopId = safeInt(parts[2])
        await supabase.from('telegram_users').update({ shop_id: shopId }).eq('id', tgUserId)
        await supabase.from('telegram_pending_orders').update({ step: 'onboarding_phone', shop_id: shopId }).eq('telegram_user_id', tgUserId).eq('chat_id', chatId)
        const { data: shop } = await supabase.from('shops').select('name').eq('id', shopId).single()
        await tgEditMenu(chatId, messageId,
          `Магазин: ${safeHTML(shop?.name || '?')}\n\n`
          + 'Крок 3 з 3: Введiть ваш номер телефону (необов`язково).\n'
          + 'Або натиснiть Пропустити.',
          [[{ text: 'Пропустити', callback_data: 'onboard:skip_phone' }]]
        )
        return NextResponse.json({ ok: true })
      }

      if (data.startsWith('order:shop:')) {
        const shopId = safeInt(parts[2])
        await supabase.from('telegram_pending_orders').upsert({
          telegram_user_id: tgUserId, chat_id: chatId, step: 'selecting_shop',
          shop_id: shopId, items: [],
        }, { onConflict: 'telegram_user_id, chat_id', ignoreDuplicates: false })
        await showCategories(supabase, chatId, messageId, 'order')
        return NextResponse.json({ ok: true })
      }
      if (data.startsWith('order:cat:')) {
        const catId = safeInt(parts[2])
        const { data: cats } = await supabase.rpc('rpc_categories_tree')
        const cat = ((cats as any[]) || []).find((c: any) => c.id === catId)
        const { data: catData } = await supabase.rpc('rpc_product_catalog', {
          p_category_id: catId, p_warehouse_id: DEFAULT_WAREHOUSE_ID, p_page: 1, p_page_size: 50,
        })
        const info = catData as any || {}
        const products = info.products || info.items || []
        if (products.length === 0) {
          await tgAnswerCallback(cbQuery.id, 'Немае товарiв у цiй категорii')
          await showCategories(supabase, chatId, messageId, 'order')
          return NextResponse.json({ ok: true })
        }
        const buttons = products.map((p: any) => [{
          text: `${safeHTML(p.name)} - ${p.total_stock ?? 0} ${safeHTML(p.unit || '')}`,
          callback_data: `order:prod:${p.id}`,
        }])
        buttons.push([{ text: 'Назад', callback_data: 'order:back' }])
        await tgEditMenu(chatId, messageId, `Категорiя: ${safeHTML(cat?.name || '?')}`, buttons)
        return NextResponse.json({ ok: true })
      }
      if (data.startsWith('order:prod:')) {
        const prodId = safeInt(parts[2])
        await showQuantityButtons(supabase, chatId, messageId, prodId, 'order')
        return NextResponse.json({ ok: true })
      }
      if (data.startsWith('order:qty:')) {
        await addItemToPendingOrder(supabase, tgUserId, chatId, safeInt(parts[2]), safeInt(parts[3]))
        await showOrderSummary(supabase, chatId, messageId, tgUserId)
        return NextResponse.json({ ok: true })
      }
      if (data.startsWith('order:custom:')) {
        const prodId = safeInt(parts[2])
        const { data: pending } = await supabase
          .from('telegram_pending_orders')
          .select('items')
          .eq('telegram_user_id', tgUserId)
          .eq('chat_id', chatId)
          .single()
        const items = safeItems(pending?.items)
        const existingItem = items.find((i: any) => i.product_id === prodId)
        if (existingItem) {
          existingItem._custom = true
        } else {
          items.push({ product_id: prodId, _custom: true })
        }
        await supabase.from('telegram_pending_orders').update({ items, step: 'adding_items' })
          .eq('telegram_user_id', tgUserId).eq('chat_id', chatId)
        const { data: prod } = await supabase.from('products').select('name, unit').eq('id', prodId).single()
        await tgEditMenu(chatId, messageId,
          `${safeHTML(prod?.name || 'Товар')}\n\nНадрукуйте кiлькiсть.\nНаприклад: 15`,
          [[{ text: 'Назад', callback_data: 'order:add' }]]
        )
        return NextResponse.json({ ok: true })
      }

      if (data.startsWith('shopset:')) {
        const shopId = safeInt(parts[1])
        await supabase.from('telegram_users').update({ shop_id: shopId }).eq('id', tgUserId)
        const { data: shop } = await supabase.from('shops').select('name').eq('id', shopId).single()
        await tgEditMenu(chatId, messageId, `Ваш магазин: ${safeHTML(shop?.name || '?')}\n\nТепер /order одразу для нього.`, [])
        return NextResponse.json({ ok: true })
      }

      if (data.startsWith('cat:')) {
        const catId = safeInt(parts[1])
        const { data: catData } = await supabase.rpc('rpc_product_catalog', {
          p_category_id: catId, p_warehouse_id: DEFAULT_WAREHOUSE_ID, p_page: 1, p_page_size: 50,
        })
        const info = catData as any || {}
        const products = info.products || info.items || []
        let reply = ''
        if (products.length === 0) {
          reply = 'Немае товарiв'
        } else {
          for (const p of products) {
            const stock = p.total_stock ?? 0
            const emoji = stock <= 0 ? 'X' : p.min_stock != null && stock <= p.min_stock ? '!' : 'V'
            reply += `${emoji} ${p.name}\n`
            reply += `   Артикул: ${p.sku || '-'} | Залишок: ${stock} ${p.unit || 'шт'}`
            if (p.purchase_price) reply += ` | Цiна: ${p.purchase_price} грн`
            reply += '\n\n'
          }
        }
        reply += '/order для замовлення'
        for (let i = 0; i < reply.length; i += 4000) {
          await tgSend(chatId, reply.substring(i, i + 4000))
        }
        return NextResponse.json({ ok: true })
      }

      return NextResponse.json({ ok: true })
    }

    // ---- TEXT MESSAGES ----
    if (!isCallback) {
      const { data: pending } = await supabase
        .from('telegram_pending_orders')
        .select('*')
        .eq('telegram_user_id', tgUserId)
        .eq('chat_id', chatId)
        .maybeSingle()

      // Onboarding: user enters name
      if (pending?.step === 'onboarding_name' && text.length > 0) {
        const displayName = safeText(text, 200)
        await tgSend(chatId, 'Iм`я збережено: ' + displayName)
        await supabase.from('telegram_users').update({ display_name: displayName }).eq('id', tgUserId)
        await supabase.from('telegram_pending_orders').update({ step: 'onboarding_shop' }).eq('id', pending.id)
        const { data: shopsRaw } = await supabase.rpc('rpc_shops_with_stats', { p_days: 365 })
        const shops = (shopsRaw as any[]) || []
        const buttons = shops.map(s => [{ text: safeHTML(s.name), callback_data: `onboard:shop:${s.id}` }])
        await tgSendMenu(chatId, 'Оберiть ваш магазин або цех:', buttons)
        return NextResponse.json({ ok: true })
      }

      // Onboarding: user enters phone
      if (pending?.step === 'onboarding_phone' && text.length > 0) {
        const phone = safeText(text, 30)
        if (!/^[\d\s\-\+\(\)\.]{6,30}$/.test(phone)) {
          await tgSend(chatId, 'Введiть коректний номер телефону (тiльки цифри, +, -, пробiли)')
          return NextResponse.json({ ok: true })
        }
        await supabase.from('telegram_users').update({ phone }).eq('id', tgUserId)
        await supabase.from('telegram_pending_orders').delete().eq('id', pending.id)
        await tgSend(chatId, 'Реєстрацiя завершена! Тепер /order для замовлення.')
        return NextResponse.json({ ok: true })
      }

      // Custom quantity for order
      if (pending && !['onboarding_name', 'onboarding_phone'].includes(pending.step)) {
        const items = safeItems(pending.items)
        const customItem = items.find((i: any) => i._custom)
        if (customItem && text.length > 0) {
          const quantity = safeQuantity(text)
          if (quantity === null) {
            await tgSend(chatId, 'Введiть додатне число вiд 1 до 999999. Приклад: 10')
            return NextResponse.json({ ok: true })
          }
          const newItems = items.filter((i: any) => !i._custom)
          newItems.push({ product_id: customItem.product_id, quantity })
          await supabase.from('telegram_pending_orders').update({ items: newItems }).eq('id', pending.id)
          const { data: prod } = await supabase.from('products').select('name').eq('id', customItem.product_id).single()
          await tgSend(chatId, `${safeHTML(prod?.name || 'Товар')} додано: ${quantity} шт.`)
          await showOrderSummary(supabase, chatId, messageId, tgUserId)
          return NextResponse.json({ ok: true })
        }
      }

      // Груповий чат — парсинг заявок
      if (chatId < 0 && text.length > 0 && !text.startsWith('/') && tgUserData.shop_id && !pending) {
        const parsed = await parseGroupOrder(supabase, text, tgUserId, tgUserData.shop_id, chatId, messageId)
        if (parsed) {
          await tgSend(chatId, parsed.reply)
          return NextResponse.json({ ok: true })
        }
      }

      // Auto-onboarding for new users
      if (!tgUserData.display_name && !text.startsWith('/')) {
        await startOnboarding(supabase, chatId, tgUserId)
        return NextResponse.json({ ok: true })
      }
      if (tgUserData.display_name && !tgUserData.shop_id && !text.startsWith('/')) {
        await supabase.from('telegram_pending_orders').upsert({
          telegram_user_id: tgUserId, chat_id: chatId, step: 'onboarding_shop', items: [],
        }, { onConflict: 'telegram_user_id, chat_id', ignoreDuplicates: false })
        const { data: shopsRaw } = await supabase.rpc('rpc_shops_with_stats', { p_days: 365 })
        const shops = (shopsRaw as any[]) || []
        const buttons = shops.map(s => [{ text: safeHTML(s.name), callback_data: `onboard:shop:${s.id}` }])
        await tgSendMenu(chatId, 'Оберiть ваш магазин або цех:', buttons)
        return NextResponse.json({ ok: true })
      }

      // Commands
      if (text === '/start') {
        if (!tgUserData.display_name || !tgUserData.shop_id) {
          await supabase.from('telegram_pending_orders').delete().eq('telegram_user_id', tgUserId).eq('chat_id', chatId)
          await startOnboarding(supabase, chatId, tgUserId)
        } else {
          await tgSend(chatId,
            'Бот для замовлення товарiв зi складу.\n\n'
            + '/order - зробити замовлення\n'
            + '/catalog - каталог\n'
            + '/status - статус заявки\n'
            + '/myshop - мiй магазин\n'
            + '/whoami - моi данi\n'
            + '/setup - перезаповнити профiль\n'
            + '/cancel - скасувати'
          )
        }
        return NextResponse.json({ ok: true })
      }
      if (text === '/help') {
        await tgSend(chatId,
          '/catalog - каталог\n'
          + '/order - замовлення\n'
          + '/status <номер> - статус\n'
          + '/myshop - магазин\n'
          + '/whoami - профiль\n'
          + '/setup - заповнити профiль\n'
          + '/cancel - скасувати'
        )
        return NextResponse.json({ ok: true })
      }
      if (text === '/catalog') {
        await showCategories(supabase, chatId, undefined, 'cat')
        return NextResponse.json({ ok: true })
      }
      if (text === '/order') {
        if (tgUserData.shop_id) {
          await supabase.from('telegram_pending_orders').upsert({
            telegram_user_id: tgUserId, chat_id: chatId, step: 'selecting_shop',
            shop_id: tgUserData.shop_id, items: [],
          }, { onConflict: 'telegram_user_id, chat_id', ignoreDuplicates: false })
          await showCategories(supabase, chatId, messageId, 'order')
        } else {
          await showShopSelection(supabase, chatId, messageId, 'order')
        }
        return NextResponse.json({ ok: true })
      }
      if (text === '/cancel') {
        const { data: p } = await supabase.from('telegram_pending_orders')
          .select('id').eq('telegram_user_id', tgUserId).eq('chat_id', chatId).maybeSingle()
        if (p) {
          await supabase.from('telegram_pending_orders').delete().eq('id', p.id)
          await tgSend(chatId, 'Скасовано.')
        } else {
          await tgSend(chatId, 'Немае активного замовлення.')
        }
        return NextResponse.json({ ok: true })
      }
      if (text === '/setup') {
        await supabase.from('telegram_pending_orders').delete().eq('telegram_user_id', tgUserId).eq('chat_id', chatId)
        await supabase.from('telegram_users').update({ display_name: null, phone: null, shop_id: null }).eq('id', tgUserId)
        await startOnboarding(supabase, chatId, tgUserId)
        return NextResponse.json({ ok: true })
      }
      if (text === '/myshop') {
        const { data: shopsRaw } = await supabase.rpc('rpc_shops_with_stats', { p_days: 365 })
        const shops = (shopsRaw as any[]) || []
        const currentShopId = tgUserData.shop_id
        const { data: curShop } = currentShopId
          ? await supabase.from('shops').select('name').eq('id', currentShopId).single()
          : { data: null }
        let msg = 'Налаштування магазину\n\n'
        if (curShop) msg += `Поточний: ${safeHTML(curShop.name)}\n\n`
        else msg += 'Не встановлено.\n\n'
        msg += 'Оберiть ваш магазин:'
        const buttons = shops.map(s => [{
          text: `${currentShopId === s.id ? 'V ' : ''}${safeHTML(s.name)}`,
          callback_data: `shopset:${s.id}`,
        }])
        await tgSendMenu(chatId, msg, buttons)
        return NextResponse.json({ ok: true })
      }
      if (text === '/whoami') {
        const shopName = tgUserData.shop_id
          ? (await supabase.from('shops').select('name').eq('id', tgUserData.shop_id).single()).data?.name
          : 'не встановлено'
        await tgSend(chatId,
          `Вашi данi:\n\n`
          + `ID Telegram: ${userId}\n`
          + `ID в системi: ${tgUserId}\n`
          + `Iм'я: ${tgUserData.display_name || 'не заповнено'}\n`
          + `Магазин: ${shopName}\n`
          + `Телефон: ${safeHTML(tgUserData.phone || '-')}\n\n`
          + `/myshop - змiнити магазин\n`
          + `/setup - заповнити профiль`
        )
        return NextResponse.json({ ok: true })
      }
      if (text.startsWith('/status ')) {
        const orderNumber = safeText(text.replace('/status ', '').trim(), 50)
        if (!/^[A-Za-z0-9-]+$/.test(orderNumber)) {
          await tgSend(chatId, 'Некоректний номер заявки')
          return NextResponse.json({ ok: true })
        }
        const { data: statusData } = await supabase.rpc('telegram_check_order_status', { p_order_number: orderNumber })
        const info = statusData as Record<string, unknown>
        if (info && info.found) {
          await tgSend(chatId,
            `Заявка ${info.order_number}\n`
            + `Статус: ${info.status}\n`
            + `Магазин: ${info.shop_name}\n`
            + `Позицiй: ${info.items_count}\n`
            + `Замовлено: ${info.total_requested}\n`
            + `Створено: ${info.created_at}`
          )
        } else {
          await tgSend(chatId, `Заявку ${orderNumber} не знайдено`)
        }
        return NextResponse.json({ ok: true })
      }
      if (text.startsWith('/')) {
        await tgSend(chatId, 'Невiдома команда. /help')
        return NextResponse.json({ ok: true })
      }

      await tgSend(chatId, 'Повiдомлення отримано. /help')
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Webhook error:', err)
    return NextResponse.json({ ok: true })
  }
}

// ============================================================================
// GROUP CHAT ORDER PARSING — improved with prefix matching, IDF scoring, abbrev
// ============================================================================

const STOP_WORDS = new Set(['на', 'для', 'по', 'при', 'з', 'до', 'у', 'в', 'та', 'за', 'від', 'із',
  'під', 'над', 'про', 'без', 'через', 'після', 'перед', 'й', 'а', 'і', 'але', 'ні', 'чи'])
const ABBREV_MAP: Record<string, string> = {
  'ст': 'стор', 'шт': 'штук', 'уп': 'упак', 'ящ': 'ящик',
  'пач': 'пачк', 'кг': 'кілог', 'мл': 'мілілітр',
  'грн': 'гривн',
}
const ALLOWED_SINGLE = new Set(['s', 'm', 'l', 'x'])

function expandAbbrevs(text: string): string {
  let result = text.toLowerCase()
  for (const [short, full] of Object.entries(ABBREV_MAP)) {
    result = result.replace(new RegExp(`\\b${short}\\b`, 'g'), full)
  }
  return result
}

function getSigWords(text: string): string[] {
  const expanded = expandAbbrevs(text)
  const words = [...expanded.matchAll(/[а-яіїєґa-z]+/g)].map(m => m[0])
  const digitLetter = [...expanded.matchAll(/\d+[а-яіїєґa-z]/g)].map(m => m[0])
  const numbers = [...expanded.matchAll(/\b(\d+)\b/g)].map(m => m[1])
  const result: string[] = []
  for (const w of words) {
    if (ALLOWED_SINGLE.has(w)) {
      result.push(w)
    } else if (w.length >= 3 && !STOP_WORDS.has(w)) {
      result.push(w)
    }
  }
  result.push(...digitLetter)
  result.push(...numbers)
  return result
}

function stemsMatch(sWord: string, pWord: string): boolean {
  if (sWord === pWord) return true
  // Substring check (handles compound words: "пальчик" in "мініпальчик")
  if (sWord.length >= 3 && pWord.length >= 3) {
    if (sWord.includes(pWord) || pWord.includes(sWord)) return true
  }
  // Prefix matching for words >=5 chars
  if (sWord.length <= 4 || pWord.length <= 4) return false
  const maxLen = Math.min(sWord.length, pWord.length)
  for (let i = maxLen; i > 3; i--) {
    if (sWord.slice(0, i) === pWord.slice(0, i)) return true
  }
  return false
}

function wordPrefix(word: string): string {
  if (/^\d+$/.test(word) || /^\d+[а-яіїєґa-z]$/.test(word)) return word
  return word.slice(0, 5)
}

// Cache IDF data per session
let idfCache: { wordsList: Set<string>[]; prefixCount: Record<string, number> } | null = null

function buildIdfCache(products: any[]): { wordsList: Set<string>[]; prefixCount: Record<string, number> } {
  if (idfCache) return idfCache
  const prefixCount: Record<string, number> = {}
  const wordsList: Set<string>[] = []
  for (const p of products) {
    const name = (p.name || '').toLowerCase()
    const sig = getSigWords(name)
    const wordSet = new Set(sig)
    wordsList.push(wordSet)
    const seen = new Set<string>()
    for (const w of wordSet) {
      const pref = wordPrefix(w)
      if (!seen.has(pref)) {
        prefixCount[pref] = (prefixCount[pref] || 0) + 1
        seen.add(pref)
      }
    }
  }
  for (const pref of Object.keys(prefixCount)) {
    if (/^\d+$/.test(pref)) {
      prefixCount[pref] = Math.max(prefixCount[pref], 5)
    }
  }
  idfCache = { wordsList, prefixCount }
  return idfCache
}

function extractQty(line: string): number | null {
  const lower = line.toLowerCase()
  const parts = lower.split(/[\s,;]+/)

  // Last number with unit
  for (let i = parts.length - 1; i >= 0; i--) {
    const m = parts[i].match(/^(\d+[\.,]?\d*)\s*(шт|уп|ящ|кг|л|мл|пач|грн)?$/)
    if (m) {
      const unit = m[2] || ''
      if (unit === 'л' && !m[1].includes('.') && m[1].length <= 2) continue
      return parseFloat(m[1].replace(',', '.'))
    }
  }

  // Number at start: "4 уп рукавичок"
  const startMatch = lower.match(/^(\d+[\.,]?\d*)\s+(шт|уп|ящ|кг|л|мл|пач|грн)?\s+/)
  if (startMatch) return parseFloat(startMatch[1].replace(',', '.'))

  // Number at end: "Грасаторе 1"
  const endMatch = lower.match(/(\d+[\.,]?\d*)\s*$/)
  if (endMatch) {
    const before = lower.slice(0, endMatch.index).trim()
    if (!['на', 'по', 'для'].some(w => before.endsWith(w))) {
      return parseFloat(endMatch[1].replace(',', '.'))
    }
  }

  return null
}

function removeQtyFromText(line: string, qty: number | null): string {
  if (qty === null) return line.trim()
  let text = line.toLowerCase()
  const qtyStr = Number.isInteger(qty) ? String(qty) : String(qty)
  text = text.replace(new RegExp(`\\b${qtyStr}\\s*(шт|уп|ящ|кг|л|мл|пач|грн)?`), '')
  text = text.replace(new RegExp(`(шт|уп|ящ|кг|л|мл|пач|грн)?\\s*${qtyStr}`), '')
  return text.replace(/[-\s,;:.()]+/g, ' ').trim()
}

function matchProduct(searchText: string, products: any[], wordsList: Set<string>[], prefixCount: Record<string, number>): any | null {
  const sigWords = getSigWords(searchText)
  if (!sigWords.length) return null

  const N = products.length
  let best: any = null
  let bestScore = -1

  for (let idx = 0; idx < products.length; idx++) {
    const p = products[idx]
    const name = (p.name || '').trim()
    if (!name) continue
    const prodWords = wordsList[idx]

    const common: string[] = []
    const unmatched: string[] = []
    let totalPrefixLen = 0

    for (const sw of sigWords) {
      let matched = false
      let bestPlen = 0
      for (const pw of prodWords) {
        if (stemsMatch(sw, pw)) {
          matched = true
          const maxLen = Math.min(sw.length, pw.length)
          for (let plen = maxLen; plen > 4; plen--) {
            if (sw.slice(0, plen) === pw.slice(0, plen)) {
              bestPlen = Math.max(bestPlen, plen)
              break
            }
          }
        }
      }
      if (matched) {
        common.push(sw)
        totalPrefixLen += bestPlen
      } else {
        unmatched.push(sw)
      }
    }

    if (!common.length) continue

    // IDF-weighted score
    let score = 0
    for (const sw of common) {
      const pref = wordPrefix(sw)
      const df = prefixCount[pref] || 1
      const idf = Math.sqrt(N / df)
      score += 10 * idf
    }

    // Penalty for unmatched words (proportional to length)
    for (const uw of unmatched) {
      score -= Math.min(uw.length * 2, 15)
    }

    // Substring bonus
    const searchLower = searchText.toLowerCase().trim()
    const nameLower = name.toLowerCase()
    if (searchLower.includes(nameLower) || nameLower.includes(searchLower)) {
      score += 30
    }

    // All matched bonus
    if (!unmatched.length) score += 20

    // Longer prefix match bonus
    score += totalPrefixLen * 0.5

    if (score > bestScore) {
      bestScore = score
      best = p
    }
  }

  if (best) return best

  // Fuzzy fallback: try removing first letter
  const searchLower = searchText.toLowerCase().trim()
  for (const p of products) {
    const name = (p.name || '').toLowerCase().trim()
    if (!name) continue
    const searchTrim = searchLower.length > 3 ? searchLower.slice(1) : ''
    const nameTrim = name.length > 3 ? name.slice(1) : ''
    if ((searchTrim && searchTrim === name) || (nameTrim && nameTrim === searchLower)) return p
    if ((searchTrim && searchTrim === nameTrim) || (searchLower === nameTrim)) return p
    if (searchTrim && name.includes(searchTrim)) return p
  }

  return null
}

async function parseGroupOrder(
  supabase: SupabaseClient, text: string, tgUserId: number,
  shopId: number, chatId: number, messageId: number
): Promise<{ reply: string } | null> {
  // Fetch all active products
  const { data: products } = await supabase
    .from('products')
    .select('id, name, sku, unit')
    .eq('is_active', true)
  if (!products || !products.length) return null

  const { wordsList, prefixCount } = buildIdfCache(products)

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const items: { product_id: number; quantity: number }[] = []
  const matched: { prod: any; qty: number }[] = []

  for (const line of lines) {
    // Skip greetings/thanks
    if (/^(На |Дякую|Добрий|дякую)/i.test(line)) continue

    // Remove location prefix
    let clean = line.replace(/^(Садова|Герцена|Компас|Героїв цех|Шкільна)[\s:,.!\-]*/i, '').trim()
    clean = clean.replace(/\.$/, '').trim()
    if (!clean) continue

    const qty = extractQty(clean) || 1
    const searchText = qty ? removeQtyFromText(clean, qty) : clean
    const finalSearch = searchText || removeQtyFromText(clean, null)

    const product = matchProduct(finalSearch, products, wordsList, prefixCount)
    if (!product) continue
    if (qty <= 0 || qty > 999999) continue

    items.push({ product_id: product.id, quantity: Math.round(qty) })
    matched.push({ prod: product, qty: Math.round(qty) })
  }

  if (!items.length) return null

  // Create order via RPC
  const { data: result } = await supabase.rpc('telegram_create_order', {
    p_telegram_user_id: tgUserId,
    p_shop_id: shopId,
    p_warehouse_id: 1,
    p_items: JSON.stringify(items),
    p_notes: text.substring(0, 500),
    p_telegram_message_id: String(messageId),
  })
  const res = result as any
  if (!res?.success) return null

  const replyLines = matched.map(m => `${m.qty} ${m.prod.unit || 'шт'} ${m.prod.name}`)
  return {
    reply: `✅ Заявка ${res.order_number} створена\n\n${replyLines.join('\n')}\n\n/status ${res.order_number}`,
  }
}

async function handleEditedOrderMessage(
  supabase: SupabaseClient, tgUserId: number, editedMessageId: number, chatId: number, newText: string
): Promise<void> {
  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_number, status')
    .eq('telegram_message_id', String(editedMessageId))
    .eq('source', 'telegram')

  if (!orders || !orders.length) return
  const order = orders[0]
  if (order.status === 'shipped' || order.status === 'cancelled') return

  // Delete old items
  await supabase.from('order_items').delete().eq('order_id', order.id)

  // Fetch products and re-parse
  const { data: products } = await supabase
    .from('products')
    .select('id, name, sku, unit')
    .eq('is_active', true)
  if (!products || !products.length) return

  const { wordsList, prefixCount } = buildIdfCache(products)
  const lines = newText.split('\n').map(l => l.trim()).filter(Boolean)

  for (const line of lines) {
    if (/^(На |Дякую|Добрий|дякую)/i.test(line)) continue
    let clean = line.replace(/^(Садова|Герцена|Компас|Героїв цех|Шкільна)[\s:,.!\-]*/i, '').trim()
    clean = clean.replace(/\.$/, '').trim()
    if (!clean) continue

    const qty = extractQty(clean) || 1
    const searchText = qty ? removeQtyFromText(clean, qty) : clean
    const finalSearch = searchText || removeQtyFromText(clean, null)

    const product = matchProduct(finalSearch, products, wordsList, prefixCount)
    if (!product) continue
    if (qty <= 0 || qty > 999999) continue

    await supabase.from('order_items').insert({
      order_id: order.id,
      product_id: product.id,
      quantity_requested: Math.round(qty),
    })
  }
}
