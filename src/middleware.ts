import { NextRequest, NextResponse } from 'next/server'

const COOKIE_NAME = 'op_session'

const PUBLIC_PATHS = [
  '/login',
  '/api/telegram/webhook',
  '/_next',
  '/favicon.ico',
]

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p))
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (isPublic(pathname)) return NextResponse.next()

  const cookie = req.cookies.get(COOKIE_NAME)?.value
  const expected = process.env.OPERATOR_SESSION_TOKEN
  if (!expected) {
    return NextResponse.next()
  }

  if (cookie === expected) return NextResponse.next()

  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.searchParams.set('next', pathname + (req.nextUrl.search || ''))
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
