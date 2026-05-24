'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchCategoriesWithProducts } from '@/lib/api'
import type { CategoryGroup } from '@/lib/types'
import { Plus, Search, Package, ChevronDown, ChevronRight, Store } from 'lucide-react'

function formatPrice(n: number | null) {
  if (n == null) return null
  return new Intl.NumberFormat('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' ₴'
}

export default function ProductsPage() {
  const [data, setData] = useState<CategoryGroup[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  useEffect(() => {
    fetchCategoriesWithProducts({ search: search || undefined })
      .then(d => setData(d.categories))
      .finally(() => setLoading(false))
  }, [search])

  useEffect(() => {
    if (data.length > 0 && expanded.size === 0) {
      setExpanded(new Set(data.map(c => c.id)))
    }
  }, [data, expanded.size])

  const toggle = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">Довідник товарів</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
            {data.reduce((acc, c) => acc + c.product_count, 0)} товарів у {data.length} категоріях
          </p>
        </div>
        <Link href="/products/new"
          className="inline-flex items-center gap-2 bg-[var(--color-brand-600)] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--color-brand-700)] transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> Додати товар
        </Link>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" />
        <input
          type="text" placeholder="Пошук товару за назвою або артикулом..."
          className="w-full pl-10 pr-4 py-2.5 border border-[var(--color-border)] rounded-xl text-sm bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-200)] focus:border-[var(--color-brand-400)] transition-shadow"
          value={search} onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden animate-pulse">
              <div className="h-12 bg-gray-100" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-4">
                {[...Array(4)].map((_, j) => (
                  <div key={j} className="h-28 bg-gray-50 rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {data.map(cat => (
            <div key={cat.id} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden shadow-sm">
              <button
                onClick={() => toggle(cat.id)}
                className="w-full flex items-center gap-2 px-4 sm:px-5 py-3.5 hover:bg-[var(--color-surface-subtle)] text-left transition-colors"
              >
                {expanded.has(cat.id)
                  ? <ChevronDown className="w-4 h-4 text-[var(--color-text-tertiary)] shrink-0" />
                  : <ChevronRight className="w-4 h-4 text-[var(--color-text-tertiary)] shrink-0" />
                }
                <span className="font-semibold text-[var(--color-text)]">{cat.name}</span>
                <span className="ml-auto text-xs font-medium text-[var(--color-text-tertiary)] bg-[var(--color-surface-subtle)] px-2.5 py-1 rounded-full border border-[var(--color-border-light)]">
                  {cat.product_count} товарів
                </span>
              </button>
              {expanded.has(cat.id) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-4 sm:p-5 border-t border-[var(--color-border-light)]">
                  {cat.products.map(p => {
                    const isLowStock = p.min_stock != null && p.total_stock <= p.min_stock
                    const isOutOfStock = p.total_stock <= 0
                    const stockBadge = isOutOfStock ? 'bg-red-50 text-red-700 border-red-200'
                      : isLowStock ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'

                    return (
                      <Link
                        key={p.id}
                        href={`/products/${p.id}`}
                        className="group block border border-[var(--color-border)] rounded-xl p-4 hover:border-[var(--color-brand-300)] hover:shadow-md transition-all"
                      >
                        <div className="text-sm font-semibold text-[var(--color-text)] group-hover:text-[var(--color-brand-600)] transition-colors line-clamp-2 mb-0.5">
                          {p.name}
                        </div>
                        {p.sku && (
                          <div className="text-xs text-[var(--color-text-tertiary)] mb-2.5 font-mono">{p.sku}</div>
                        )}

                        <div className="flex items-center gap-2 mb-3">
                          <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${stockBadge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isOutOfStock ? 'bg-red-500' : isLowStock ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                            {isOutOfStock ? 'Немає' : `${p.total_stock} ${p.unit}`}
                          </span>
                          {p.supplier && (
                            <span className="text-[11px] text-[var(--color-text-tertiary)] truncate flex items-center gap-1">
                              <Store className="w-3 h-3 shrink-0" />
                              {p.supplier.name}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border-light)]">
                          {p.purchase_price ? (
                            <span className="text-sm font-semibold text-[var(--color-text)]">{formatPrice(p.purchase_price)}</span>
                          ) : (
                            <span className="text-xs text-[var(--color-text-tertiary)]">—</span>
                          )}
                          <span className="text-xs text-[var(--color-text-tertiary)]">{p.unit}</span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
          {data.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-tertiary)]">
              <Package className="w-16 h-16 mb-3 opacity-40" />
              <p className="text-lg font-medium">Товари не знайдені</p>
              <p className="text-sm mt-1">Спробуйте змінити пошуковий запит</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
