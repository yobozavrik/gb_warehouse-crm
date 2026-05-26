import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'

const COOKIE_NAME = 'op_session'
const ONE_YEAR_SEC = 60 * 60 * 24 * 365

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  try {
    return timingSafeEqual(bufA, bufB)
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const expectedPassword = process.env.OPERATOR_PASSWORD
  const sessionToken = process.env.OPERATOR_SESSION_TOKEN

  if (!expectedPassword || !sessionToken) {
    return NextResponse.json(
      { error: 'Auth not configured (missing OPERATOR_PASSWORD or OPERATOR_SESSION_TOKEN)' },
      { status: 500 },
    )
  }

  let body: { password?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  const candidate = typeof body.password === 'string' ? body.password : ''
  if (!candidate || !constantTimeEqual(candidate, expectedPassword)) {
    // Small delay to slow down brute force from a single client. Crude but real.
    await new Promise(r => setTimeout(r, 400))
    return NextResponse.json({ error: 'Невірний пароль' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set({
    name: COOKIE_NAME,
    value: sessionToken,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ONE_YEAR_SEC,
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set({
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
  return res
}

// Silence the "createHmac unused" warning if anyone adds bcrypt later.
void createHmac
