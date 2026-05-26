'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Warehouse as WarehouseIcon, Package, ArrowUpDown, Truck, Trash2, TrendingDown, AlertTriangle, DollarSign } from 'lucide-react'

interface WarehouseStats {
  id: number
  name: string
  type: string
  address: string | null
  products_in_stock: number
  critical_items: number
  total_stock_value: number
  receipts_count: number
  shipments_count: number
  transfers_in_count: number
  transfers_out_count: number
  write_offs_count: number
  orders_count: number
  last_receipt_date: string | null
  last_shipment_date: string | null
}

const PERIOD_OPTIONS = [
  { label: '7 дн', value: 7 },
  { label: '14 дн', value: 14 },
  { label: '30 дн', value: 30 },
  { label: '90 дн', value: 90 },
]

const TYPE_LABELS: Record<string, string> = {
  shop: 'Магазин',
  workshop: 'Цех',
  storage: 'Склад',
  other: 'Інше',
  '': '—',
}

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<WarehouseStats[]>([])
  const [days, setDays] = useState(14)
  const [loading, setLoading] = useState(true)

  const load = async (d: number) => {
    setLoading(true)
    const { data, error } = await supabase.rpc('rpc_warehouses_with_stats', { p_days: d })
    if (!error) setWarehouses(data || [])
    else console.error(error)
    setLoading(false)
  }

  useEffect(() => { load(days) }, [days])

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('uk-UA', { style: 'decimal', maximumFractionDigits: 0 }).format(v) + ' ₴'

  const daysAgo = (d: string | null) => {
    if (!d) return '—'
    const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
    if (diff === 0) return 'сьогодні'
    if (diff === 1) return 'вчора'
    return `${diff} дн тому`
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Склади та цехи</h1>
        <div className="flex items-center gap-1 bg-white rounded-lg border p-0.5">
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                days === opt.value ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse space-y-3">
              <div className="h-5 bg-gray-200 rounded w-1/2" />
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="grid grid-cols-2 gap-2">
                {[...Array(4)].map((_, j) => <div key={j} className="h-8 bg-gray-100 rounded" />)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {warehouses.map(wh => (
            <div key={wh.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
              {/* Header */}
              <div className="px-5 pt-5 pb-3 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      wh.warehouse_type === 'storage' ? 'bg-purple-100' : 'bg-blue-100'
                    }`}>
                      <WarehouseIcon className={`w-4 h-4 ${
                        wh.warehouse_type === 'storage' ? 'text-purple-600' : 'text-blue-600'
                      }`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{wh.name}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {TYPE_LABELS[wh.warehouse_type ?? ''] || wh.warehouse_type}
                        {wh.address && ` — ${wh.address}`}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats grid */}
              <div className="px-5 py-3 grid grid-cols-2 gap-y-3 gap-x-4">
                <Stat icon={<Package className="w-3.5 h-3.5" />} label="Товарів" value={wh.products_in_stock} color="blue" />
                <Stat icon={<AlertTriangle className="w-3.5 h-3.5" />} label="Критичні" value={wh.critical_items} color="red" />
                <Stat icon={<DollarSign className="w-3.5 h-3.5" />} label="Сума залишку" value={formatCurrency(wh.total_stock_value)} color="green" />
                <Stat icon={<TrendingDown className="w-3.5 h-3.5" />} label="Замовлень" value={wh.orders_count} color="orange" />
              </div>

              {/* Movement stats */}
              <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  Рух за {days} дн
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <MoveStat icon={<Package className="w-3 h-3" />} label="Приход" value={wh.receipts_count} date={wh.last_receipt_date} formatter={daysAgo} />
                  <MoveStat icon={<Truck className="w-3 h-3" />} label="Відвантаж" value={wh.shipments_count} date={wh.last_shipment_date} formatter={daysAgo} />
                  <MoveStat icon={<ArrowUpDown className="w-3 h-3" />} label="Перем. вход" value={wh.transfers_in_count} />
                  <MoveStat icon={<ArrowUpDown className="w-3 h-3 rotate-180" />} label="Перем. вихід" value={wh.transfers_out_count} />
                  <MoveStat icon={<Trash2 className="w-3 h-3" />} label="Списань" value={wh.write_offs_count} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && warehouses.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <WarehouseIcon className="w-16 h-16 mb-4" />
          <p className="text-lg">Складів не знайдено</p>
        </div>
      )}
    </div>
  )
}

function Stat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  const colors: Record<string, string> = {
    blue: 'text-blue-600 bg-blue-50',
    red: 'text-red-600 bg-red-50',
    green: 'text-green-600 bg-green-50',
    orange: 'text-orange-600 bg-orange-50',
  }
  return (
    <div className="flex items-center gap-2">
      <div className={`p-1.5 rounded-md ${colors[color] || colors.blue}`}>{icon}</div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-semibold text-gray-900">{value}</p>
      </div>
    </div>
  )
}

function MoveStat({ icon, label, value, date, formatter }: {
  icon: React.ReactNode; label: string; value: number; date?: string | null; formatter?: (d: string) => string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-gray-400">{icon}</span>
      <span className="text-xs text-gray-600">{label}</span>
      <span className="text-xs font-semibold text-gray-900 ml-auto">{value}</span>
      {date && formatter && (
        <span className="text-[10px] text-gray-400 ml-1">{formatter(date)}</span>
      )}
    </div>
  )
}
