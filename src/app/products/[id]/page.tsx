'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { fetchProductDetail } from '@/lib/api'
import type { ProductDetail } from '@/lib/types'
import { ArrowLeft, Package, Building2, TrendingUp, History, Store } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatCurrency(n: number | null) {
  if (n == null) return '—'
  return new Intl.NumberFormat('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' ₴'
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [detail, setDetail] = useState<ProductDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    fetchProductDetail(Number(id))
      .then(setDetail)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 bg-gray-200 rounded-lg w-1/4" />
      <div className="h-32 bg-gray-100 rounded-xl" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {[...Array(3)].map((_, i) => <div key={i} className="h-40 bg-gray-100 rounded-xl" />)}
      </div>
      <div className="h-64 bg-gray-100 rounded-xl" />
    </div>
  )
  if (error) return <p className="text-red-500">Помилка: {error}</p>
  if (!detail || !detail.product) return <p className="text-gray-500">Товар не знайдено</p>

  const { product, stock, receipts, price_history } = detail
  const supplier = detail.supplier
  const stockLevel = stock.length > 0 ? stock[0].quantity : 0
  const isLowStock = product.min_stock != null && stockLevel <= product.min_stock
  const isOutOfStock = stockLevel <= 0

  return (
    <div className="space-y-5">
      <button onClick={() => router.push('/products')} className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-brand-600)] transition-colors">
        <ArrowLeft className="w-4 h-4" /> Назад до товарів
      </button>

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text)] break-words">{product.name}</h1>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 text-sm text-[var(--color-text-secondary)]">
              {product.sku && <span>Артикул: <strong className="text-[var(--color-text)] font-mono">{product.sku}</strong></span>}
              {product.barcode && <span>Штрихкод: <strong className="text-[var(--color-text)] font-mono">{product.barcode}</strong></span>}
              {product.category_name && <span>Категорія: <strong className="text-[var(--color-text)]">{product.category_name}</strong></span>}
              <span>Одиниця: <strong className="text-[var(--color-text)]">{product.unit}</strong></span>
            </div>
            {product.description && (
              <p className="mt-3 text-sm text-[var(--color-text-secondary)] leading-relaxed">{product.description}</p>
            )}
          </div>
          <Link
            href={`/products/${id}/edit`}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-[var(--color-brand-600)] bg-[var(--color-brand-50)] rounded-lg hover:bg-[var(--color-brand-100)] transition-colors shrink-0"
          >
            Редагувати
          </Link>
        </div>

        <div className="flex flex-wrap gap-4 sm:gap-6 mt-5 pt-5 border-t border-[var(--color-border-light)]">
          <div className="bg-[var(--color-surface-subtle)] rounded-lg px-4 py-3 min-w-[120px]">
            <span className="text-xs text-[var(--color-text-tertiary)] font-medium uppercase tracking-wide">Ціна закупівлі</span>
            <div className="text-lg font-bold text-[var(--color-text)] mt-0.5">{formatCurrency(product.purchase_price)}</div>
          </div>
          <div className="bg-[var(--color-surface-subtle)] rounded-lg px-4 py-3 min-w-[120px]">
            <span className="text-xs text-[var(--color-text-tertiary)] font-medium uppercase tracking-wide">Мін. залишок</span>
            <div className="text-lg font-bold text-[var(--color-text)] mt-0.5">{product.min_stock ?? '—'} {product.unit}</div>
          </div>
          <div className="bg-[var(--color-surface-subtle)] rounded-lg px-4 py-3 min-w-[120px]">
            <span className="text-xs text-[var(--color-text-tertiary)] font-medium uppercase tracking-wide">Макс. залишок</span>
            <div className="text-lg font-bold text-[var(--color-text)] mt-0.5">{product.max_stock ?? '—'} {product.unit}</div>
          </div>
          <div className="bg-[var(--color-surface-subtle)] rounded-lg px-4 py-3 min-w-[120px]">
            <span className="text-xs text-[var(--color-text-tertiary)] font-medium uppercase tracking-wide">Поточний</span>
            <div className={`text-lg font-bold mt-0.5 ${
              isOutOfStock ? 'text-red-600' : isLowStock ? 'text-amber-600' : 'text-emerald-600'
            }`}>
              {stockLevel} {product.unit}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)] mb-4">
            <Package className="w-4 h-4 text-[var(--color-brand-500)]" /> Залишки по складах
          </div>
          {stock.length === 0 ? (
            <p className="text-sm text-[var(--color-text-tertiary)] text-center py-4">Немає залишків</p>
          ) : (
            <div className="space-y-2">
              {stock.map(s => {
                const sLow = product.min_stock != null && s.quantity <= product.min_stock
                const sOut = s.quantity <= 0
                return (
                  <div key={s.warehouse_id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--color-surface-subtle)]">
                    <span className="text-sm text-[var(--color-text-secondary)]">{s.warehouse_name}</span>
                    <span className={`text-sm font-semibold ${
                      sOut ? 'text-red-600' : sLow ? 'text-amber-600' : 'text-emerald-600'
                    }`}>
                      {s.quantity} {product.unit}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)] mb-4">
            <Building2 className="w-4 h-4 text-[var(--color-brand-500)]" /> Постачальник
          </div>
          {supplier ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-[var(--color-text-tertiary)] shrink-0" />
                <span className="font-semibold text-[var(--color-text)]">{supplier.name}</span>
              </div>
              {supplier.contact_person && (
                <div className="text-sm text-[var(--color-text-secondary)] ml-6">{supplier.contact_person}</div>
              )}
              {supplier.phone && (
                <a href={`tel:${supplier.phone}`} className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-brand-600)] ml-6">
                  {supplier.phone}
                </a>
              )}
              {supplier.email && (
                <a href={`mailto:${supplier.email}`} className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-brand-600)] ml-6">
                  {supplier.email}
                </a>
              )}
              {supplier.edrpou && (
                <div className="text-xs text-[var(--color-text-tertiary)] ml-6">ЄДРПОУ: {supplier.edrpou}</div>
              )}
              {supplier.category && (
                <span className="inline-flex items-center ml-6 mt-1 px-2 py-0.5 text-xs font-medium bg-[var(--color-brand-50)] text-[var(--color-brand-700)] rounded-full">
                  {supplier.category === 'manufacturer' ? 'Виробник'
                    : supplier.category === 'distributor' ? 'Дистриб\'ютор'
                    : supplier.category === 'importer' ? 'Імпортер'
                    : supplier.category}
                </span>
              )}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-text-tertiary)] text-center py-4">Не вказано</p>
          )}
        </div>

        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)] mb-4">
            <History className="w-4 h-4 text-[var(--color-brand-500)]" /> Останні 5 надходжень
          </div>
          {receipts.length === 0 ? (
            <p className="text-sm text-[var(--color-text-tertiary)] text-center py-4">Немає надходжень</p>
          ) : (
            <div className="space-y-3">
              {receipts.map(r => (
                <div key={r.receipt_id} className="pb-3 border-b border-[var(--color-border-light)] last:border-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[var(--color-text)]">{r.receipt_number}</span>
                    <span className="text-xs text-[var(--color-text-tertiary)]">{formatDate(r.receipt_date)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-xs text-[var(--color-text-secondary)]">{r.supplier_name || '—'}</span>
                    <span className="text-xs font-medium text-[var(--color-text)]">{r.quantity} × {formatCurrency(r.price)}</span>
                  </div>
                  <div className="text-xs text-[var(--color-text-tertiary)] text-right mt-0.5">{r.warehouse_name}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {price_history.length >= 2 && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 sm:p-6 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)] mb-5">
            <TrendingUp className="w-4 h-4 text-[var(--color-brand-500)]" /> Динаміка зміни ціни
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart
              data={price_history.map(p => ({ ...p, price: Number(p.price), _date: formatDate(p.date) }))}
              margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
              <XAxis
                dataKey="_date"
                tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
                axisLine={{ stroke: 'var(--color-border)' }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={v => `${v} ₴`}
                tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
                axisLine={{ stroke: 'var(--color-border)' }}
                tickLine={false}
                width={70}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--color-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                formatter={(value: any) => [formatCurrency(value), 'Ціна']}
                labelFormatter={(label: any) => `Дата: ${label}`}
              />
              <Line
                type="monotone"
                dataKey="price"
                stroke="var(--color-brand-500)"
                strokeWidth={2}
                dot={{ r: 4, fill: 'var(--color-brand-500)', strokeWidth: 2, stroke: 'var(--color-surface)' }}
                activeDot={{ r: 6, fill: 'var(--color-brand-600)', strokeWidth: 2, stroke: 'var(--color-surface)' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
