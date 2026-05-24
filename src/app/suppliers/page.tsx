'use client'

import { useEffect, useState, useMemo } from 'react'
import { fetchSuppliersWithStats } from '@/lib/api'
import type { SupplierWithStats } from '@/lib/types'
import {
  Building2, Package, DollarSign, CalendarDays, Phone, Mail,
  MapPin, Globe, FileText, User, Factory,
  TrendingUp, Clock, Search, Store, CreditCard,
  ArrowDownRight, Truck, Globe2, PackageOpen,
} from 'lucide-react'

const CATEGORY_LABELS: Record<string, string> = {
  manufacturer: 'Виробник',
  distributor: 'Дистриб\'ютор',
  importer: 'Імпортер',
  other: 'Інше',
}

const CATEGORY_ICONS: Record<string, typeof Factory> = {
  manufacturer: Factory,
  distributor: Truck,
  importer: Globe2,
  other: PackageOpen,
}

const CATEGORY_COLORS: Record<string, string> = {
  manufacturer: 'blue',
  distributor: 'purple',
  importer: 'orange',
  other: 'gray',
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<SupplierWithStats[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSuppliersWithStats()
      .then(setSuppliers)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('uk-UA', { style: 'decimal', maximumFractionDigits: 0 }).format(v) + ' грн'

  const formatDate = (d: string | null) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const filtered = suppliers.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase())
    || (s.contact_person && s.contact_person.toLowerCase().includes(search.toLowerCase()))
    || (s.edrpou && s.edrpou.includes(search))
  )

  const categories = useMemo(() => {
    const groups: { key: string; label: string; suppliers: SupplierWithStats[] }[] = []
    const catOrder = ['manufacturer', 'distributor', 'importer', 'other', '__uncategorized__']
    for (const key of catOrder) {
      let s: SupplierWithStats[]
      if (key === '__uncategorized__') {
        s = filtered.filter(x => !x.category)
      } else {
        s = filtered.filter(x => x.category === key)
      }
      if (s.length > 0) {
        groups.push({
          key,
          label: key === '__uncategorized__' ? 'Без категорії' : CATEGORY_LABELS[key] || key,
          suppliers: s,
        })
      }
    }
    return groups
  }, [filtered])

  const totalAmount = filtered.reduce((acc, s) => acc + s.total_amount, 0)
  const totalReceipts = filtered.reduce((acc, s) => acc + s.total_receipts, 0)
  const activeLast30 = filtered.filter(s => s.receipts_30d > 0).length
  const totalDebt = filtered.reduce((acc, s) => acc + (s.total_debt ?? 0), 0)
  const totalPaid = filtered.reduce((acc, s) => acc + (s.total_paid ?? 0), 0)
  const totalPayPercent = totalAmount > 0 ? Math.round((totalPaid / totalAmount) * 100) : 0

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">Довідник постачальників</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">{filtered.length} постачальників</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 shadow-sm">
          <p className="text-xs text-[var(--color-text-tertiary)] font-medium uppercase tracking-wide">Всього</p>
          <p className="text-xl font-bold text-[var(--color-text)] mt-0.5">{filtered.length}</p>
        </div>
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 shadow-sm">
          <p className="text-xs text-[var(--color-text-tertiary)] font-medium uppercase tracking-wide">Поставки</p>
          <p className="text-xl font-bold text-[var(--color-text)] mt-0.5">{totalReceipts}</p>
        </div>
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 shadow-sm">
          <p className="text-xs text-[var(--color-text-tertiary)] font-medium uppercase tracking-wide">На суму</p>
          <p className="text-xl font-bold text-[var(--color-text)] mt-0.5">{formatCurrency(totalAmount)}</p>
        </div>
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 shadow-sm">
          <p className="text-xs text-[var(--color-text-tertiary)] font-medium uppercase tracking-wide">Активні (30д)</p>
          <p className="text-xl font-bold text-[var(--color-text)] mt-0.5">{activeLast30}</p>
        </div>
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 shadow-sm">
          <p className="text-xs text-[var(--color-text-tertiary)] font-medium uppercase tracking-wide">Оплачено</p>
          <p className="text-xl font-bold text-emerald-600 mt-0.5">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 shadow-sm">
          <p className="text-xs text-[var(--color-text-tertiary)] font-medium uppercase tracking-wide">Заборгованість</p>
          <p className="text-xl font-bold text-amber-600 mt-0.5">{formatCurrency(totalDebt)}</p>
        </div>
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 shadow-sm col-span-2">
          <p className="text-xs text-[var(--color-text-tertiary)] font-medium uppercase tracking-wide">Взаєморозрахунки</p>
          <div className="flex items-center gap-3 mt-1.5">
            <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${totalPayPercent}%`, background: totalPayPercent > 50 ? 'var(--color-emerald-500)' : totalPayPercent > 25 ? 'var(--color-amber-400)' : 'var(--color-red-400)' }}
              />
            </div>
            <span className="text-sm font-semibold text-[var(--color-text)]">{totalPayPercent}%</span>
          </div>
          <p className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">
            {formatCurrency(totalPaid)} оплачено з {formatCurrency(totalAmount)}
          </p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" />
        <input
          type="text" placeholder="Пошук за назвою, контактною особою або ЄДРПОУ..."
          className="w-full pl-10 pr-4 py-2.5 border border-[var(--color-border)] rounded-xl text-sm bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-200)] focus:border-[var(--color-brand-400)] transition-shadow"
          value={search} onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="space-y-6">
          {[...Array(3)].map((_, ci) => (
            <div key={ci} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--color-border-light)]">
                <div className="h-6 bg-gray-200 rounded w-48 animate-pulse" />
              </div>
              <div className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="animate-pulse space-y-3">
                    <div className="h-5 bg-gray-200 rounded w-3/4" />
                    <div className="h-4 bg-gray-200 rounded w-1/2" />
                    <div className="grid grid-cols-2 gap-2">
                      {[...Array(4)].map((_, j) => <div key={j} className="h-8 bg-gray-100 rounded" />)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-tertiary)]">
          <Building2 className="w-16 h-16 mb-3 opacity-40" />
          <p className="text-lg font-medium">Постачальників не знайдено</p>
          <p className="text-sm mt-1">Спробуйте змінити пошуковий запит</p>
        </div>
      ) : (
        <div className="space-y-6">
          {categories.map(group => {
            const catSuppliers = group.suppliers
            const catAmount = catSuppliers.reduce((a, s) => a + s.total_amount, 0)
            const catReceipts = catSuppliers.reduce((a, s) => a + s.total_receipts, 0)
            const catIcon = group.key !== '__uncategorized__' ? CATEGORY_ICONS[group.key] : Store

            return (
              <div key={group.key} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
                <div className="px-5 py-3 border-b border-[var(--color-border-light)] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center border border-brand-200">
                      <Building2 className="w-4 h-4 text-[var(--color-brand-600)]" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-[var(--color-text)]">{group.label}</h2>
                      <p className="text-xs text-[var(--color-text-tertiary)]">
                        {catSuppliers.length} постачальників · {catReceipts} поставок · {formatCurrency(catAmount)}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-[var(--color-text-tertiary)] bg-[var(--color-surface-subtle)] px-2.5 py-1 rounded-full border border-[var(--color-border-light)]">
                    {catSuppliers.length}
                  </span>
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {catSuppliers.map(sup => (
                <div key={sup.id} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden hover:shadow-md transition-all">
              <div className="px-5 pt-5 pb-3 border-b border-[var(--color-border-light)]">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0 border border-emerald-200">
                      <Store className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-[var(--color-text)] truncate">{sup.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        {sup.category && (
                          <span className="text-[11px] font-medium bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] px-1.5 py-0.5 rounded border border-[var(--color-border-light)]">
                            {CATEGORY_LABELS[sup.category] || sup.category}
                          </span>
                        )}
                        {sup.edrpou && (
                          <span className="text-[11px] text-[var(--color-text-tertiary)] font-mono">ЄДРПОУ {sup.edrpou}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {(sup.payment_days ?? 0) > 0 && (
                    <span className="text-xs text-[var(--color-text-tertiary)] bg-[var(--color-surface-subtle)] px-2 py-1 rounded-full border border-[var(--color-border-light)] shrink-0 ml-2">
                      {sup.payment_days} дн
                    </span>
                  )}
                </div>
              </div>

              <div className="px-5 py-3 space-y-1.5">
                {sup.contact_person && (
                  <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                    <User className="w-3.5 h-3.5 text-[var(--color-text-tertiary)] shrink-0" />
                    <span>{sup.contact_person}</span>
                  </div>
                )}
                {sup.phone && (
                  <a href={`tel:${sup.phone}`} className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-brand-600)] transition-colors">
                    <Phone className="w-3.5 h-3.5 text-[var(--color-text-tertiary)] shrink-0" />
                    <span>{sup.phone}</span>
                  </a>
                )}
                {sup.email && (
                  <a href={`mailto:${sup.email}`} className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-brand-600)] transition-colors">
                    <Mail className="w-3.5 h-3.5 text-[var(--color-text-tertiary)] shrink-0" />
                    <span className="truncate">{sup.email}</span>
                  </a>
                )}
                {sup.address && (
                  <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                    <MapPin className="w-3.5 h-3.5 text-[var(--color-text-tertiary)] shrink-0" />
                    <span className="truncate">{sup.address}</span>
                  </div>
                )}
                {sup.website && (
                  <a href={sup.website.startsWith('http') ? sup.website : `https://${sup.website}`}
                     target="_blank" rel="noopener noreferrer"
                     className="flex items-center gap-2 text-sm text-[var(--color-brand-600)] hover:underline">
                    <Globe className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{sup.website}</span>
                  </a>
                )}
              </div>

              <div className="px-5 py-3 grid grid-cols-2 gap-y-3 gap-x-4 border-t border-[var(--color-border-light)]">
                <Stat icon={<Package className="w-3.5 h-3.5" />} label="Поставок" value={sup.total_receipts} color="blue" />
                <Stat icon={<Package className="w-3.5 h-3.5" />} label="Товарів" value={sup.total_products_supplied} color="purple" />
                <Stat icon={<DollarSign className="w-3.5 h-3.5" />} label="На суму" value={formatCurrency(sup.total_amount)} color="green" />
                <Stat icon={<TrendingUp className="w-3.5 h-3.5" />} label="За 30 дн" value={sup.receipts_30d} color="orange" />
              </div>

              <div className="px-5 py-3 grid grid-cols-2 gap-y-3 gap-x-4 border-t border-[var(--color-border-light)]">
                <Stat
                  icon={<CreditCard className="w-3.5 h-3.5" />}
                  label="Оплачено"
                  value={formatCurrency(sup.total_paid ?? 0)}
                  color="emerald"
                />
                <Stat
                  icon={<ArrowDownRight className="w-3.5 h-3.5" />}
                  label="Заборгованість"
                  value={formatCurrency(sup.total_debt ?? 0)}
                  color={(sup.total_debt ?? 0) > 0 ? 'red' : 'emerald'}
                />
                <div className="col-span-2">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-[var(--color-text-tertiary)]">Взаєморозрахунки</span>
                    <span className="font-semibold text-[var(--color-text)]">{sup.payment_percent ?? 0}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${sup.payment_percent ?? 0}%`,
                        background: (sup.payment_percent ?? 0) >= 90 ? 'var(--color-emerald-500, #10b981)'
                          : (sup.payment_percent ?? 0) >= 50 ? 'var(--color-amber-400, #f59e0b)'
                          : 'var(--color-red-400, #f87171)'
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-[var(--color-text-tertiary)] mt-0.5">
                    <span>Оплат: {sup.payment_count ?? 0}</span>
                    <span>{sup.last_payment_date ? `Останній платіж: ${formatDate(sup.last_payment_date)}` : 'Немає оплат'}</span>
                  </div>
                </div>
              </div>

              <div className="px-5 py-2.5 bg-[var(--color-surface-subtle)] border-t border-[var(--color-border-light)] flex items-center justify-between text-xs text-[var(--color-text-tertiary)]">
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="w-3 h-3" />
                  <span>Перша: {formatDate(sup.first_receipt_date)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  <span>Остання: {formatDate(sup.last_receipt_date)}</span>
                </div>
              </div>

              {sup.notes && (
                <div className="px-5 py-2.5 border-t border-[var(--color-border-light)] flex items-start gap-2 text-xs text-[var(--color-text-secondary)]">
                  <FileText className="w-3 h-3 mt-0.5 shrink-0 text-[var(--color-text-tertiary)]" />
                  <span className="line-clamp-2">{sup.notes}</span>
                </div>
              )}
            </div>
          ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Stat({ icon, label, value, color: _color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  const colors: Record<string, string> = {
    blue: 'text-blue-600 bg-blue-50 border-blue-200',
    purple: 'text-purple-600 bg-purple-50 border-purple-200',
    red: 'text-red-600 bg-red-50 border-red-200',
    green: 'text-green-600 bg-green-50 border-green-200',
    orange: 'text-orange-600 bg-orange-50 border-orange-200',
    emerald: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  }
  const c = colors[_color] || colors.blue
  return (
    <div className="flex items-center gap-2">
      <div className={`p-1.5 rounded-lg ${c} border`}>{icon}</div>
      <div>
        <p className="text-xs text-[var(--color-text-tertiary)]">{label}</p>
        <p className="text-sm font-semibold text-[var(--color-text)]">{value}</p>
      </div>
    </div>
  )
}
