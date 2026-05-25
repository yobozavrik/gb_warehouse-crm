'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { fetchCategoriesWithSuppliers, fetchSuppliersWithStats } from '@/lib/api'
import type { CategoryWithSuppliers, SupplierWithStats } from '@/lib/types'
import {
  Building2, Package, DollarSign, CalendarDays, Phone, Mail,
  MapPin, Globe, FileText, User, Search, Store,
  TrendingUp, Clock, CreditCard,
  ArrowDownRight, ShoppingBag,
} from 'lucide-react'

export default function SuppliersPage() {
  const [categories, setCategories] = useState<CategoryWithSuppliers[]>([])
  const [supplierDetails, setSupplierDetails] = useState<Map<number, SupplierWithStats>>(new Map())
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetchCategoriesWithSuppliers().catch(() => []),
      fetchSuppliersWithStats().catch(() => []),
    ]).then(([cats, sups]) => {
      setCategories(cats)
      const map = new Map<number, SupplierWithStats>()
      sups.forEach(s => map.set(s.id, s))
      setSupplierDetails(map)
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('uk-UA', { style: 'decimal', maximumFractionDigits: 0 }).format(v) + ' грн'

  const formatDate = (d: string | null) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const filteredCategories = useMemo(() => {
    if (!search) return categories
    return categories
      .map(cat => ({
        ...cat,
        suppliers: cat.suppliers.filter(s =>
          s.name.toLowerCase().includes(search.toLowerCase())
        )
      }))
      .filter(cat => cat.suppliers.length > 0)
  }, [categories, search])

  const allSuppliers = useMemo(() => {
    const set = new Set<number>()
    filteredCategories.forEach(c => c.suppliers.forEach(s => set.add(s.id)))
    return set.size
  }, [filteredCategories])

  const totalReceipts = filteredCategories.reduce((a, c) => a + c.suppliers.reduce((s, sup) => s + sup.total_receipts, 0), 0)
  const totalAmount = filteredCategories.reduce((a, c) => a + c.suppliers.reduce((s, sup) => s + sup.total_amount, 0), 0)

  const renderSupplierCard = (sup: CategoryWithSuppliers['suppliers'][0]) => {
    const detail = supplierDetails.get(sup.id)
    return (
      <Link key={sup.id} href={`/suppliers/${sup.id}`} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden hover:shadow-md hover:border-[var(--color-brand-200)] transition-all block">
        <div className="px-4 pt-4 pb-2 border-b border-[var(--color-border-light)]">
          <div className="flex items-start gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 border border-emerald-200">
              <Store className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-sm text-[var(--color-text)] truncate">{sup.name}</h3>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                <span>{sup.total_receipts} поставок</span>
                <span>{formatCurrency(sup.total_amount)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 py-2 space-y-1 text-xs">
          {detail?.contact_person && (
            <div className="flex items-center gap-1.5 text-[var(--color-text-secondary)]">
              <User className="w-3 h-3 shrink-0 text-[var(--color-text-tertiary)]" />
              <span className="truncate">{detail.contact_person}</span>
            </div>
          )}
          {detail?.phone && (
            <a href={`tel:${detail.phone}`} className="flex items-center gap-1.5 text-[var(--color-brand-600)] hover:underline">
              <Phone className="w-3 h-3 shrink-0" />
              <span>{detail.phone}</span>
            </a>
          )}
        </div>

        <div className="px-4 py-2 grid grid-cols-2 gap-2 border-t border-[var(--color-border-light)]">
          <MiniStat label="Сплачено" value={formatCurrency(detail?.total_paid ?? 0)} color="emerald" />
          <MiniStat label="Борг" value={formatCurrency(detail?.total_debt ?? 0)} color={(detail?.total_debt ?? 0) > 0 ? 'red' : 'green'} />
          <div className="col-span-2">
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: (detail?.payment_percent ?? 0) + '%', background: (detail?.payment_percent ?? 0) >= 90 ? '#10b981' : (detail?.payment_percent ?? 0) >= 50 ? '#f59e0b' : '#f87171' }} />
            </div>
          </div>
        </div>

        <div className="px-4 py-1.5 bg-[var(--color-surface-subtle)] border-t border-[var(--color-border-light)] flex items-center justify-between text-[11px] text-[var(--color-text-tertiary)]">
          <div className="flex items-center gap-1">
            <CalendarDays className="w-2.5 h-2.5" />
            <span>{detail?.first_receipt_date ? formatDate(detail.first_receipt_date) : '—'}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            <span>{detail?.last_receipt_date ? formatDate(detail.last_receipt_date) : '—'}</span>
          </div>
        </div>
      </Link>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">Довідник постачальників</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
          {allSuppliers} постачальників у {filteredCategories.length} категоріях
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 shadow-sm">
          <p className="text-xs text-[var(--color-text-tertiary)] font-medium uppercase tracking-wide">Категорії</p>
          <p className="text-xl font-bold text-[var(--color-text)] mt-0.5">{filteredCategories.length}</p>
        </div>
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 shadow-sm">
          <p className="text-xs text-[var(--color-text-tertiary)] font-medium uppercase tracking-wide">Постачальники</p>
          <p className="text-xl font-bold text-[var(--color-text)] mt-0.5">{allSuppliers}</p>
        </div>
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 shadow-sm">
          <p className="text-xs text-[var(--color-text-tertiary)] font-medium uppercase tracking-wide">Поставки</p>
          <p className="text-xl font-bold text-[var(--color-text)] mt-0.5">{totalReceipts}</p>
        </div>
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 shadow-sm">
          <p className="text-xs text-[var(--color-text-tertiary)] font-medium uppercase tracking-wide">На суму</p>
          <p className="text-xl font-bold text-[var(--color-text)] mt-0.5">{formatCurrency(totalAmount)}</p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" />
        <input type="text" placeholder="Пошук постачальника за назвою..." className="w-full pl-10 pr-4 py-2.5 border border-[var(--color-border)] rounded-xl text-sm bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-200)] focus:border-[var(--color-brand-400)] transition-shadow" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="space-y-6">
          {[0, 1, 2].map(ci => (
            <div key={ci} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
              <div className="px-5 py-4 border-b">
                <div className="h-6 bg-gray-200 rounded w-48 animate-pulse" />
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {[0, 1, 2].map(i => (
                  <div key={i} className="animate-pulse space-y-2"><div className="h-4 bg-gray-200 rounded w-3/4" /><div className="h-3 bg-gray-100 rounded w-1/2" /></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-tertiary)]">
          <Building2 className="w-16 h-16 mb-3 opacity-40" />
          <p className="text-lg font-medium">Нічого не знайдено</p>
          <p className="text-sm mt-1">Спробуйте змінити пошуковий запит</p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredCategories.map(cat => (
            <div key={cat.category_id} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
              <div className="px-5 py-3 border-b border-[var(--color-border-light)] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center border border-brand-200">
                    <ShoppingBag className="w-4 h-4 text-[var(--color-brand-600)]" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-[var(--color-text)]">{cat.category_name}</h2>
                    <p className="text-xs text-[var(--color-text-tertiary)]">
                      {cat.supplier_count} постачальників · {cat.suppliers.reduce((a, s) => a + s.total_receipts, 0)} поставок · {formatCurrency(cat.suppliers.reduce((a, s) => a + s.total_amount, 0))}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-medium text-[var(--color-text-tertiary)] bg-[var(--color-surface-subtle)] px-2.5 py-1 rounded-full border border-[var(--color-border-light)]">{cat.supplier_count}</span>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {cat.suppliers.map(renderSupplierCard)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, value, color: _color }: { label: string; value: string; color: string }) {
  const colors: Record<string, string> = { emerald: 'text-emerald-600', red: 'text-red-600', green: 'text-green-600', blue: 'text-blue-600' }
  return (
    <div>
      <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wide">{label}</p>
      <p className={'text-xs font-semibold ' + (colors[_color] || 'text-[var(--color-text)]')}>{value}</p>
    </div>
  )
}
