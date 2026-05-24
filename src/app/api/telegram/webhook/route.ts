import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getSupabase(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_KEY, { db: { schema: 'household_chemicals' } } as any)
}

async function tgSend(chatId: number, text: string, parseMode?: string) {
  const body: Record<string, unknown> = { chat_id: chatId, text }
  if (parseMode) body.parse_mode = parseMode
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function tgSendMenu(chatId: number, text: string, buttons: { text: string; callback_data: string }[][]) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons },
    }),
  })
}

export async function POST(req: NextRequest) {
  const start = Date.now()
  const supabase = getSupabase()

  try {
    const update = await req.json()
    const msg = update.message || update.callback_query?.message
    const data = update.callback_query?.data

    if (!msg) return NextResponse.json({ ok: true })

    const chatId = msg.chat.id
    const userId = msg.from?.id
    const userName = msg.from?.username || null
    const firstName = msg.from?.first_name || null
    const lastName = msg.from?.last_name || null
    const messageId = msg.message_id
    const text = data || msg.text || ''
    const isCallback = !!update.callback_query

    // 1. Register/get user
    const { data: tgUser, error: userErr } = await supabase.rpc('telegram_get_or_create_user', {
      p_user_id: userId,
      p_username: userName,
      p_first_name: firstName,
      p_last_name: lastName,
    })
    if (userErr || !tgUser) {
      console.error('telegram_get_or_create_user error:', userErr)
      return NextResponse.json({ ok: true })
    }
    const tgUserId = tgUser.id

    const messageType = isCallback ? 'callback_query'
      : text.startsWith('/') ? 'command' : 'text'

    // 2. Log message
    await supabase.rpc('telegram_log_message', {
      p_telegram_user_id: tgUserId,
      p_chat_id: chatId,
      p_message_id: messageId,
      p_message_type: messageType,
      p_text_content: text,
      p_processing_time_ms: Date.now() - start,
    })

    // 3. Process commands
    if (text === '/start') {
      await tgSend(chatId,
        '👋 <b>Вітаю в системі складського обліку!</b>\n\n'
        + 'Я — бот для замовлення товарів зі складу.\n\n'
        + 'Доступні команди:\n'
        + '/catalog — переглянути каталог товарів\n'
        + '/order — зробити замовлення\n'
        + '/status — перевірити статус замовлення\n'
        + '/help — довідка',
        'HTML'
      )
    } else if (text === '/help') {
      await tgSend(chatId,
        '<b>Довідка</b>\n\n'
        + '/catalog — показати каталог товарів\n'
        + '/order <номер> — створити замовлення (в розробці)\n'
        + '/status <номер_заявки> — перевірити статус\n'
        + '/start — вітальне повідомлення\n\n'
        + '<i>Надсилайте звичайні повідомлення — вони логуються в системі</i>',
        'HTML'
      )
    } else if (text === '/catalog') {
      const { data: catalogText } = await supabase.rpc('telegram_get_catalog_text', {
        p_warehouse_id: 1,
      })
      const reply = (catalogText as string) || 'Каталог порожній'
      // Telegram limit is 4096 chars per message
      for (let i = 0; i < reply.length; i += 4000) {
        await tgSend(chatId, reply.substring(i, i + 4000))
      }
    } else if (text.startsWith('/status ')) {
      const orderNumber = text.replace('/status ', '').trim()
      const { data: statusData } = await supabase.rpc('telegram_check_order_status', {
        p_order_number: orderNumber,
      })
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
    } else {
      // Any unrecognized text just gets acknowledged
      await tgSend(chatId,
        `✅ Повідомлення отримано та залоговано.\n`
        + `Напишіть /help щоб побачити доступні команди.`
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Webhook error:', err)
    return NextResponse.json({ ok: true })
  }
}
