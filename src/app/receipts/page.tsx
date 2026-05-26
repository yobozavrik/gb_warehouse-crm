'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { fetchReceipts, confirmReceipt } from '@/lib/api'
import type { ReceiptListItem } from '@/lib/types'
import { useDialog } from '@/components/DialogProvider'
import { Plus, CheckCircle, Package, Search } from 'lucide-react'

const statusLabels: Record<string, { label: string; color: string }> = {
  draft: { label: 'Чернетка', color: 'bg-gray-100 text-gray-600 border-gray-200' },
  confirmed: { label: 'Підтверджено', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: 'Скасовано', color: 'bg-red-50 text-red-600 border-red-200' },
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' ₴'
}

export default function ReceiptsPage() {
  const router = useRouter()
  const dialog = useDialog()
  const [receipts, setReceipts] = useState<ReceiptListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const load = () => {
    setLoading(true)
    fetchReceipts().then(setReceipts).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleConfirm = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!(await dialog.confirm('Товари будуть оприбутковані на складі.', {
      title: 'Підтвердити прихід?',
      confirmText: 'Підтвердити',
    }))) return
    setConfirming(id)
    try {
      await confirmReceipt(id)
      load()
    } catch (err) {
      console.error(err)
      await dialog.alert('Не вдалося підтвердити прихід.', { tone: 'error' })
    }
    setConfirming(null)
  }

  const filtered = receipts.filter(r =>
    !search || r.receipt_number.toLowerCase().includes(search.toLowerCase())
    || (r.supplier?.name && r.supplier.name.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">Прибуткові накладні</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">{filtered.length} накладних</p>
        </div>
        <Link href="/receipts/new"
          className="inline-flex items-center gap-2 bg-[var(--color-brand-600)] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--color-brand-700)] transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> Нова накладна
        </Link>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" />
        <input
          type="text" placeholder="Пошук за номером або постачальником..."
          className="w-full pl-10 pr-4 py-2.5 border border-[var(--color-border)] rounded-xl text-sm bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-200)] focus:border-[var(--color-brand-400)] transition-shadow"
          value={search} onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-tertiary)]">
          <Package className="w-16 h-16 mb-3 opacity-40" />
          <p className="text-lg font-medium">Накладних не знайдено</p>
          <p className="text-sm mt-1">Спробуйте змінити пошук або створіть нову накладну</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => {
            const st = statusLabels[r.status] || { label: r.status, color: 'bg-gray-100 text-gray-600' }
            const itemCount = r.receipt_items?.[0]?.count || 0

            return (
              <div
                key={r.id}
                onClick={() => router.push(`/receipts/${r.id}`)}
                className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 sm:p-5 hover:shadow-md hover:border-[var(--color-brand-300)] transition-all cursor-pointer"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 border border-blue-200">
                      <Package className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[var(--color-text)]">{r.receipt_number}</span>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${st.color}`}>{st.label}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-sm text-[var(--color-text-secondary)]">
                        <span>{r.supplier?.name || '—'}</span>
                        <span className="text-[var(--color-text-tertiary)]">•</span>
                        <span>{r.warehouse?.name || '—'}</span>
                        {itemCount > 0 && (
                          <>
                            <span className="text-[var(--color-text-tertiary)]">•</span>
                            <span>{itemCount} поз.</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-12 sm:ml-0">
                    <div className="text-right">
                      <div className="text-sm font-semibold text-[var(--color-text)]">{formatDate(r.created_at)}</div>
                    </div>
                    {r.status === 'draft' && (
                      <button
                        onClick={(e) => handleConfirm(e, r.id)}
                        disabled={confirming === r.id}
                        className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Підтвердити"
                      >
                        <CheckCircle className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
