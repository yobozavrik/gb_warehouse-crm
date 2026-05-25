'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { fetchSupplierDetail } from '@/lib/api'
import type { SupplierDetail } from '@/lib/types'
import { ArrowLeft, Building2, Phone, Mail, Globe, FileText, CreditCard, ChevronDown, ChevronRight, Package } from 'lucide-react'

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatCurrency(n: number | null) {
  if (n == null) return '—'
  return new Intl.NumberFormat('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' ₴'
}

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [detail, setDetail] = useState<SupplierDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedReceipt, setExpandedReceipt] = useState<string | null>(null)

  useEffect(() => {
    if (!id) { setLoading(false); setError('Невалідний ID'); return }
    fetchSupplierDetail(Number(id))
      .then(setDetail)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 bg-gray-200 rounded-lg w-1/4" />
      <div className="h-32 bg-gray-100 rounded-xl" />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl" />)}
      </div>
      <div className="h-64 bg-gray-100 rounded-xl" />
    </div>
  )
  if (error) return <p className="text-red-500">Помилка: {error}</p>
  if (!detail) return <p className="text-gray-500">Постачальника не знайдено</p>

  const { supplier, receipts, payments, stats } = detail

  return (
    <div className="space-y-5">
      <button onClick={() => router.push('/suppliers')} className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-brand-600)] transition-colors">
        <ArrowLeft className="w-4 h-4" /> Назад до постачальників
      </button>

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">{supplier.name}</h1>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 text-sm text-[var(--color-text-secondary)]">
              {supplier.edrpou && <span>ЄДРПОУ: <strong className="text-[var(--color-text)]">{supplier.edrpou}</strong></span>}
              {supplier.category && <span>Категорія: <strong className="text-[var(--color-text)]">{supplier.category}</strong></span>}
              {supplier.payment_days && <span>Термін оплати: <strong className="text-[var(--color-text)]">{supplier.payment_days} дн.</strong></span>}
              <span>З: <strong className="text-[var(--color-text)]">{formatDate(supplier.created_at)}</strong></span>
            </div>
            <div className="flex flex-wrap gap-3 mt-3">
              {supplier.phone && (
                <a href={`tel:${supplier.phone}`} className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-brand-600)] transition-colors">
                  <Phone className="w-3.5 h-3.5" /> {supplier.phone}
                </a>
              )}
              {supplier.email && (
                <a href={`mailto:${supplier.email}`} className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-brand-600)] transition-colors">
                  <Mail className="w-3.5 h-3.5" /> {supplier.email}
                </a>
              )}
              {supplier.website && (
                <a href={supplier.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-brand-600)] transition-colors">
                  <Globe className="w-3.5 h-3.5" /> Сайт
                </a>
              )}
              {supplier.contact_person && (
                <span className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)]">
                  <Building2 className="w-3.5 h-3.5" /> {supplier.contact_person}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-[var(--color-border-light)]">
          <div className="bg-[var(--color-surface-subtle)] rounded-lg px-4 py-3">
            <span className="text-xs text-[var(--color-text-tertiary)] font-medium uppercase tracking-wide">Накладних</span>
            <div className="text-xl font-bold text-[var(--color-text)] mt-0.5">{stats.total_receipts}</div>
          </div>
          <div className="bg-[var(--color-surface-subtle)] rounded-lg px-4 py-3">
            <span className="text-xs text-[var(--color-text-tertiary)] font-medium uppercase tracking-wide">Сума поставок</span>
            <div className="text-xl font-bold text-[var(--color-text)] mt-0.5">{formatCurrency(stats.total_amount)}</div>
          </div>
          <div className="bg-[var(--color-surface-subtle)] rounded-lg px-4 py-3">
            <span className="text-xs text-[var(--color-text-tertiary)] font-medium uppercase tracking-wide">Оплачено</span>
            <div className="text-xl font-bold text-emerald-600 mt-0.5">{formatCurrency(stats.total_paid)}</div>
          </div>
          <div className="bg-[var(--color-surface-subtle)] rounded-lg px-4 py-3">
            <span className="text-xs text-[var(--color-text-tertiary)] font-medium uppercase tracking-wide">Борг</span>
            <div className={`text-xl font-bold mt-0.5 ${stats.total_debt > 0 ? 'text-red-600' : 'text-gray-400'}`}>{formatCurrency(stats.total_debt)}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-4 text-xs text-[var(--color-text-tertiary)]">
          <span>Перша поставка: <strong className="text-[var(--color-text-secondary)]">{formatDate(stats.first_receipt_date)}</strong></span>
          <span>Остання поставка: <strong className="text-[var(--color-text-secondary)]">{formatDate(stats.last_receipt_date)}</strong></span>
          {stats.payment_count > 0 && (
            <span>Платежів: <strong className="text-[var(--color-text-secondary)]">{stats.payment_count}</strong>, останній: <strong className="text-[var(--color-text-secondary)]">{formatDate(stats.last_payment_date)}</strong></span>
          )}
        </div>
      </div>

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-sm">
        <div className="p-5 sm:p-6 border-b border-[var(--color-border-light)]">
          <div className="flex items-center gap-2 text-base font-semibold text-[var(--color-text)]">
            <FileText className="w-4 h-4 text-[var(--color-brand-500)]" /> Прибуткові накладні
            <span className="text-sm font-normal text-[var(--color-text-tertiary)]">({receipts.length})</span>
          </div>
        </div>

        {receipts.length === 0 ? (
          <div className="p-10 text-center text-sm text-[var(--color-text-tertiary)]">Ще не було поставок</div>
        ) : (
          <div className="divide-y divide-[var(--color-border-light)]">
            {receipts.map(receipt => {
              const isExpanded = expandedReceipt === receipt.id
              return (
                <div key={receipt.id}>
                  <button
                    onClick={() => setExpandedReceipt(isExpanded ? null : receipt.id)}
                    className="w-full flex items-center justify-between px-5 sm:px-6 py-3.5 text-left hover:bg-[var(--color-surface-subtle)] transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isExpanded ? <ChevronDown className="w-4 h-4 shrink-0 text-[var(--color-brand-500)]" /> : <ChevronRight className="w-4 h-4 shrink-0 text-[var(--color-text-tertiary)]" />}
                      <div className="min-w-0">
                        <span className="font-semibold text-[var(--color-text)]">{receipt.receipt_number}</span>
                        <span className="ml-2 text-sm text-[var(--color-text-tertiary)]">{formatDateTime(receipt.confirmed_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-sm text-[var(--color-text-secondary)] hidden sm:inline">{receipt.warehouse_name}</span>
                      <span className="text-sm font-semibold text-[var(--color-text)]">{formatCurrency(receipt.total_amount)}</span>
                      <span className="text-xs text-[var(--color-text-tertiary)] bg-[var(--color-surface-subtle)] px-2 py-0.5 rounded-full">{receipt.items_count} поз.</span>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-5 sm:px-6 pb-4">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-t border-[var(--color-border-light)]">
                            <th className="text-left py-2 pr-4 text-[var(--color-text-tertiary)] font-medium">Товар</th>
                            <th className="text-right py-2 px-4 text-[var(--color-text-tertiary)] font-medium hidden sm:table-cell">Артикул</th>
                            <th className="text-right py-2 px-4 text-[var(--color-text-tertiary)] font-medium">Кількість</th>
                            <th className="text-right py-2 px-4 text-[var(--color-text-tertiary)] font-medium hidden sm:table-cell">Ціна</th>
                            <th className="text-right py-2 pl-4 text-[var(--color-text-tertiary)] font-medium">Сума</th>
                          </tr>
                        </thead>
                        <tbody>
                          {receipt.items.map((item, idx) => (
                            <tr key={idx} className="border-t border-[var(--color-border-light)]">
                              <td className="py-2 pr-4">
                                <div className="font-medium text-[var(--color-text)] truncate max-w-[250px]">{item.product_name}</div>
                              </td>
                              <td className="text-right py-2 px-4 text-[var(--color-text-secondary)] font-mono text-xs hidden sm:table-cell">{item.sku || '—'}</td>
                              <td className="text-right py-2 px-4 text-[var(--color-text)]">{item.quantity}</td>
                              <td className="text-right py-2 px-4 text-[var(--color-text-secondary)] hidden sm:table-cell">{item.price != null ? formatCurrency(item.price) : '—'}</td>
                              <td className="text-right py-2 pl-4 font-semibold text-[var(--color-text)]">{formatCurrency(item.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-[var(--color-border)]">
                            <td className="py-2 pr-4 font-semibold text-[var(--color-text)]">Всього</td>
                            <td className="hidden sm:table-cell" />
                            <td className="text-right py-2 px-4 font-semibold text-[var(--color-text)]">{receipt.items.reduce((sum, i) => sum + i.quantity, 0)}</td>
                            <td className="hidden sm:table-cell" />
                            <td className="text-right py-2 pl-4 font-bold text-[var(--color-text)]">{formatCurrency(receipt.total_amount)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-sm">
        <div className="p-5 sm:p-6 border-b border-[var(--color-border-light)]">
          <div className="flex items-center gap-2 text-base font-semibold text-[var(--color-text)]">
            <CreditCard className="w-4 h-4 text-[var(--color-brand-500)]" /> Оплати постачальнику
            <span className="text-sm font-normal text-[var(--color-text-tertiary)]">({payments.length})</span>
          </div>
        </div>
        {payments.length === 0 ? (
          <div className="p-10 text-center text-sm text-[var(--color-text-tertiary)]">Оплат ще не було</div>
        ) : (
          <div className="divide-y divide-[var(--color-border-light)]">
            {payments.map(p => (
              <div key={p.id} className="px-5 sm:px-6 py-3.5 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-[var(--color-text)]">{formatCurrency(p.amount)}</div>
                  <div className="text-sm text-[var(--color-text-tertiary)]">{formatDateTime(p.payment_date)}</div>
                </div>
                <div className="text-right">
                  {p.payment_method && <div className="text-sm text-[var(--color-text-secondary)]">{p.payment_method}</div>}
                  {p.reference_number && <div className="text-xs text-[var(--color-text-tertiary)]">#{p.reference_number}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
