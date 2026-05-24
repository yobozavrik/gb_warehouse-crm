'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { fetchReceiptDetail } from '@/lib/api'
import { ArrowLeft, Package, Building2, Warehouse, FileSpreadsheet } from 'lucide-react'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatCurrency(n: number | null) {
  if (n == null) return '—'
  return new Intl.NumberFormat('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' ₴'
}

const statusLabels: Record<string, { label: string; color: string }> = {
  draft: { label: 'Чернетка', color: 'bg-gray-100 text-gray-600 border-gray-200' },
  confirmed: { label: 'Підтверджено', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: 'Скасовано', color: 'bg-red-50 text-red-600 border-red-200' },
}

export default function ReceiptDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData] = useState<{ receipt: any; items: any[]; total: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    fetchReceiptDetail(id)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 bg-gray-200 rounded-lg w-1/4" />
      <div className="h-32 bg-gray-100 rounded-xl" />
      <div className="h-64 bg-gray-100 rounded-xl" />
    </div>
  )
  if (error) return <p className="text-red-500">Помилка: {error}</p>
  if (!data || !data.receipt) return <p className="text-gray-500">Накладну не знайдено</p>

  const { receipt, items, total } = data
  const st = statusLabels[receipt.status] || { label: receipt.status, color: 'bg-gray-100 text-gray-600' }

  return (
    <div className="space-y-5">
      <button onClick={() => router.push('/receipts')} className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-brand-600)] transition-colors">
        <ArrowLeft className="w-4 h-4" /> Назад до накладних
      </button>

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">{receipt.receipt_number}</h1>
              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border ${st.color}`}>{st.label}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-sm text-[var(--color-text-secondary)]">
              <div className="flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-[var(--color-text-tertiary)]" />
                <span>{receipt.supplier?.name || '—'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Warehouse className="w-4 h-4 text-[var(--color-text-tertiary)]" />
                <span>{receipt.warehouse?.name || '—'}</span>
              </div>
              <span>{formatDate(receipt.created_at)}</span>
            </div>
            {receipt.notes && (
              <p className="mt-3 text-sm text-[var(--color-text-secondary)] bg-[var(--color-surface-subtle)] rounded-lg p-3 border border-[var(--color-border-light)]">
                {receipt.notes}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-4 sm:gap-6 mt-5 pt-5 border-t border-[var(--color-border-light)]">
          <div className="bg-[var(--color-surface-subtle)] rounded-lg px-4 py-3">
            <span className="text-xs text-[var(--color-text-tertiary)] font-medium uppercase tracking-wide">Позицій</span>
            <div className="text-lg font-bold text-[var(--color-text)] mt-0.5">{items.length}</div>
          </div>
          <div className="bg-[var(--color-surface-subtle)] rounded-lg px-4 py-3">
            <span className="text-xs text-[var(--color-text-tertiary)] font-medium uppercase tracking-wide">Загальна сума</span>
            <div className="text-lg font-bold text-[var(--color-text)] mt-0.5">{formatCurrency(total)}</div>
          </div>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border-light)] flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-[var(--color-brand-500)]" />
          <span className="font-semibold text-sm text-[var(--color-text)]">Позиції накладної</span>
          <span className="ml-auto text-xs text-[var(--color-text-tertiary)]">{items.length} товарів</span>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--color-text-tertiary)]">
            <Package className="w-12 h-12 mb-2 opacity-40" />
            <p>Немає позицій</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--color-surface-subtle)]">
                  <th className="text-left px-5 py-3 font-medium text-[var(--color-text-tertiary)] text-xs uppercase tracking-wide">№</th>
                  <th className="text-left px-5 py-3 font-medium text-[var(--color-text-tertiary)] text-xs uppercase tracking-wide">Товар</th>
                  <th className="text-left px-5 py-3 font-medium text-[var(--color-text-tertiary)] text-xs uppercase tracking-wide">Артикул</th>
                  <th className="text-right px-5 py-3 font-medium text-[var(--color-text-tertiary)] text-xs uppercase tracking-wide">Кількість</th>
                  <th className="text-right px-5 py-3 font-medium text-[var(--color-text-tertiary)] text-xs uppercase tracking-wide">Ціна</th>
                  <th className="text-right px-5 py-3 font-medium text-[var(--color-text-tertiary)] text-xs uppercase tracking-wide">Сума</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.id} className="border-t border-[var(--color-border-light)] hover:bg-[var(--color-surface-subtle)]">
                    <td className="px-5 py-3 text-[var(--color-text-tertiary)]">{i + 1}</td>
                    <td className="px-5 py-3">
                      <span className="font-medium text-[var(--color-text)]">{item.product?.name || '—'}</span>
                    </td>
                    <td className="px-5 py-3 text-[var(--color-text-tertiary)] font-mono text-xs">{item.product?.sku || '—'}</td>
                    <td className="px-5 py-3 text-right font-medium text-[var(--color-text)]">{item.quantity} {item.product?.unit || ''}</td>
                    <td className="px-5 py-3 text-right text-[var(--color-text)]">{formatCurrency(item.price)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-[var(--color-text)]">{formatCurrency(item.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-surface-subtle)]">
                  <td colSpan={3} className="px-5 py-3 text-sm font-medium text-[var(--color-text)]">Всього</td>
                  <td className="px-5 py-3 text-right font-medium text-[var(--color-text)]">{items.reduce((a, i) => a + i.quantity, 0)}</td>
                  <td className="px-5 py-3"></td>
                  <td className="px-5 py-3 text-right font-bold text-[var(--color-text)]">{formatCurrency(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
