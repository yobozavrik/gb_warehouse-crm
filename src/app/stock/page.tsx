'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { fetchStockSummary, fetchWarehouses } from '@/lib/api'
import type { StockSummaryItem, Warehouse } from '@/lib/types'
import { ExportButton } from '@/components/ExportButton'
import {
  Package, Search, AlertTriangle, TrendingUp, Layers, Building2,
} from 'lucide-react'

const STATUS_BADGE: Record<StockSummaryItem['stock_status'], { label: string; cls: string }> = {
  critical: { label: 'Мін.', cls: 'bg-red-50 text-red-700 border-red-200' },
  overstock: { label: 'Макс.', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  normal: { label: 'Норма', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
}

const numFmt = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 3 })

function GroupHeader({ name, count }: { name: string; count: number }) {
  return (
    <tr className="bg-gray-50/80 sticky top-[41px] z-[1]">
      <td colSpan={6} className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        <span className="inline-flex items-center gap-2">
          <Layers className="w-3.5 h-3.5" />
          {name}
          <span className="text-gray-400 font-normal normal-case">— {count}</span>
        </span>
      </td>
    </tr>
  )
}

export default function StockPage() {
  const [items, setItems] = useState<StockSummaryItem[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [warehouseId, setWarehouseId] = useState<number | ''>('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | StockSummaryItem['stock_status']>('')
  const [showZero, setShowZero] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchWarehouses().then(w => {
      if (cancelled) return
      setWarehouses(w)
      const first = w.find(x => x.warehouse_type === 'storage' || x.warehouse_type === 'other' || x.id === 1)
      if (first) setWarehouseId(first.id)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const data = await fetchStockSummary(warehouseId === '' ? undefined : warehouseId)
      if (cancelled) return
      setItems(data || [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [warehouseId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(i => {
      if (!showZero && i.quantity <= 0) return false
      if (statusFilter && i.stock_status !== statusFilter) return false
      if (q) {
        const hay = `${i.product_name} ${i.sku || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [items, search, statusFilter, showZero])

  const grouped = useMemo(() => {
    const map = new Map<string, StockSummaryItem[]>()
    for (const it of filtered) {
      const key = it.category_name || 'Без категорії'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(it)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.product_name.localeCompare(b.product_name, 'uk'))
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'uk'))
  }, [filtered])

  const totals = useMemo(() => {
    let positions = 0
    let units = 0
    let critical = 0
    for (const it of filtered) {
      positions += 1
      units += it.quantity || 0
      if (it.stock_status === 'critical') critical += 1
    }
    return { positions, units, critical }
  }, [filtered])

  const selectedWarehouse = warehouses.find(w => w.id === warehouseId)

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Залишки на складі</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {selectedWarehouse
              ? <>Поточний склад: <span className="font-medium text-gray-700">{selectedWarehouse.name}</span></>
              : 'Зведення по всіх складах'}
          </p>
        </div>
        <ExportButton
          data={filtered}
          filename={`залишки_${selectedWarehouse?.name || 'всі_склади'}`}
          columns={[
            { key: 'category_name', label: 'Категорія' },
            { key: 'product_name', label: 'Товар' },
            { key: 'sku', label: 'Артикул' },
            { key: 'warehouse_name', label: 'Склад' },
            { key: 'quantity', label: 'Кількість' },
            { key: 'unit', label: 'Одиниця' },
            { key: 'min_stock', label: 'Мін.' },
            { key: 'max_stock', label: 'Макс.' },
            { key: 'stock_status', label: 'Статус' },
          ]}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={Package} label="Позицій" value={totals.positions} color="bg-blue-500" />
        <Stat icon={TrendingUp} label="Одиниць" value={numFmt.format(totals.units)} color="bg-emerald-500" />
        <Stat icon={AlertTriangle} label="Критичний мінімум" value={totals.critical} color="bg-red-500" />
        <Stat icon={Building2} label="Склад" value={selectedWarehouse?.name || 'усі'} color="bg-purple-500" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Пошук за назвою або артикулом…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          value={warehouseId === '' ? '' : String(warehouseId)}
          onChange={e => setWarehouseId(e.target.value === '' ? '' : Number(e.target.value))}
        >
          <option value="">Всі склади</option>
          {warehouses.map(w => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
        >
          <option value="">Всі статуси</option>
          <option value="critical">Критичний мінімум</option>
          <option value="normal">Норма</option>
          <option value="overstock">Понад максимум</option>
        </select>
        <label className="inline-flex items-center gap-2 text-sm text-gray-600 px-2">
          <input
            type="checkbox"
            checked={showZero}
            onChange={e => setShowZero(e.target.checked)}
            className="rounded border-gray-300"
          />
          Показувати порожні
        </label>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 sticky top-0 z-[2]">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Товар</th>
                <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Артикул</th>
                <th className="text-right px-4 py-2.5 font-medium">Кількість</th>
                <th className="text-right px-4 py-2.5 font-medium hidden md:table-cell">Мін / Макс</th>
                <th className="text-left px-4 py-2.5 font-medium hidden lg:table-cell">Склад</th>
                <th className="px-4 py-2.5 font-medium">Статус</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">Завантаження…</td></tr>
              )}
              {!loading && grouped.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                    <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    Залишків не знайдено за поточними фільтрами
                  </td>
                </tr>
              )}
              {!loading && grouped.map(([cat, rows]) => (
                <Group key={cat} name={cat} rows={rows} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Group({ name, rows }: { name: string; rows: StockSummaryItem[] }) {
  return (
    <>
      <GroupHeader name={name} count={rows.length} />
      {rows.map(it => {
        const badge = STATUS_BADGE[it.stock_status]
        return (
          <tr key={`${it.warehouse_id}-${it.product_id}`} className="border-t hover:bg-gray-50">
            <td className="px-4 py-2 align-top">
              <Link href={`/products/${it.product_id}`} className="text-blue-600 hover:text-blue-800 font-medium">
                {it.product_name}
              </Link>
            </td>
            <td className="px-4 py-2 align-top hidden md:table-cell text-gray-500 font-mono text-xs">
              {it.sku || '—'}
            </td>
            <td className={`px-4 py-2 align-top text-right font-semibold ${
              it.stock_status === 'critical' ? 'text-red-700'
              : it.quantity <= 0 ? 'text-gray-400'
              : 'text-gray-900'
            }`}>
              {numFmt.format(it.quantity)} <span className="text-xs font-normal text-gray-400">{it.unit}</span>
            </td>
            <td className="px-4 py-2 align-top text-right hidden md:table-cell text-gray-500 text-xs">
              {it.min_stock != null ? numFmt.format(it.min_stock) : '—'}
              {' / '}
              {it.max_stock != null ? numFmt.format(it.max_stock) : '—'}
            </td>
            <td className="px-4 py-2 align-top hidden lg:table-cell text-gray-500">{it.warehouse_name}</td>
            <td className="px-4 py-2 align-top text-center">
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${badge.cls}`}>
                {badge.label}
              </span>
            </td>
          </tr>
        )
      })}
    </>
  )
}

function Stat({ icon: Icon, label, value, color }: {
  icon: typeof Package; label: string; value: string | number; color: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="min-w-0">
        <div className="text-lg font-bold text-gray-900 truncate">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>
  )
}
