'use client'

import { useState, FormEvent, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Boxes, Lock } from 'lucide-react'

function LoginForm() {
  const router = useRouter()
  const search = useSearchParams()
  const nextPath = search.get('next') || '/'
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Невірний пароль')
        setSubmitting(false)
        return
      }
      router.replace(nextPath)
      router.refresh()
    } catch (err) {
      console.error(err)
      setError('Помилка з’єднання')
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-1">
          <Boxes className="w-6 h-6 text-blue-600" />
          <span className="font-semibold text-gray-900">Складський облік</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mt-3">Вхід</h1>
        <p className="text-sm text-gray-500 mt-1">Введіть спільний пароль операторів.</p>

        <form onSubmit={onSubmit} className="mt-5 space-y-3">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="password"
              autoFocus
              autoComplete="current-password"
              className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Пароль"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !password}
            className="w-full bg-blue-600 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Перевіряємо…' : 'Увійти'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
