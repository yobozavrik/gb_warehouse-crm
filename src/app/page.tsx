'use client'

import { useEffect, useState } from 'react'
import { fetchDashboardSummary, fetchWarehouses } from '@/lib/api'
import type { DashboardSummary, Warehouse } from '@/lib/types'
import { ExportButton } from '@/components/ExportButton'
import {
  Package, AlertTriangle, TrendingDown, ShoppingCart,
  Truck, FileSpreadsheet, Building2,
} from 'lucide-react'

function StatCard({ icon: Icon, label, value, color }: {
  icon: any; label: string; value: string | number; color: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-sm text-gray-500">{label}</div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null)
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [selectedWarehouse, setSelectedWarehouse] = useState<number | undefined>()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchDashboardSummary(selectedWarehouse),
      fetchWarehouses(),
    ])
      .then(([dashboard, wh]) => {
        if (cancelled) return
        setData(dashboard)
        setWarehouses(wh)
      })
      .catch(e => { if (!cancelled) console.error(e) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selectedWarehouse])

  if (loading) return <div className="text-gray-500">Завантаження...</div>
  if (!data) return <div className="text-red-500">Помилка завантаження</div>

  const fmt = (n: number) => new Intl.NumberFormat('uk-UA', { style: 'decimal', maximumFractionDigits: 0 }).format(n) + ' ₴'
  const s = data.stats
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Дашборд складу</h1>
        <div className="flex items-center gap-3">
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={selectedWarehouse ?? ''}
            onChange={e => setSelectedWarehouse(e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value="">Всі склади</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <ExportButton
            data={data?.critical_items || []}
            filename="залишки_критичний_мінімум"
            columns={[
              { key: 'product_name', label: 'Товар' },
              { key: 'warehouse_name', label: 'Склад' },
              { key: 'quantity', label: 'Залишок' },
              { key: 'min_stock', label: 'Мінімум' },
              { key: 'deficit', label: 'Дефіцит' },
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Package} label="Товарів на складі" value={s.products_in_stock} color="bg-blue-500" />
        <StatCard icon={AlertTriangle} label="Критичний мінімум" value={s.critical_items} color="bg-red-500" />
        <StatCard icon={ShoppingCart} label="Заявок очікують" value={s.pending_orders} color="bg-amber-500" />
        <StatCard icon={Truck} label="Відвантажень сьогодні" value={s.shipments_today} color="bg-green-500" />
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <StatCard icon={TrendingDown} label="Товарів немає в наявності" value={s.products_out_of_stock} color="bg-gray-500" />
        <StatCard icon={Building2} label="Активних складів" value={s.active_warehouses} color="bg-purple-500" />
        <StatCard icon={FileSpreadsheet} label="Чернеток накладних" value={s.draft_receipts} color="bg-cyan-500" />
        <StatCard icon={Package} label="Вартість запасів" value={fmt(s.stock_value)} color="bg-emerald-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="font-semibold text-gray-900 mb-3">Критичний мінімум</h2>
          {data.critical_items.length === 0 ? (
            <p className="text-sm text-gray-500">Немає товарів з критичним залишком</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {data.critical_items.slice(0, 10).map(item => (
                <div key={`${item.product_id}-${item.warehouse_id}`}
                  className="flex items-center justify-between text-sm p-2 bg-red-50 rounded-lg"
                >
                  <div>
                    <div className="font-medium">{item.product_name}</div>
                    <div className="text-gray-500">{item.warehouse_name}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-red-600">{item.quantity} / {item.min_stock}</div>
                    <div className="text-xs text-red-500">не вистачає {item.deficit}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="font-semibold text-gray-900 mb-3">Очікуючі заявки</h2>
          {data.pending_orders.length === 0 ? (
            <p className="text-sm text-gray-500">Немає очікуючих заявок</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {data.pending_orders.map(order => (
                <div key={order.id}
                  className="flex items-center justify-between text-sm p-2 bg-amber-50 rounded-lg"
                >
                  <div>
                    <div className="font-medium">{order.order_number}</div>
                    <div className="text-gray-500">{order.shop_name}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{order.items_count} позицій</div>
                    <div className="text-xs text-gray-500">{order.total_requested} шт</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900 mb-3">Останні рухи</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2 font-medium">Товар</th>
                <th className="pb-2 font-medium">Склад</th>
                <th className="pb-2 font-medium">Тип</th>
                <th className="pb-2 font-medium text-right">Зміна</th>
                <th className="pb-2 font-medium text-right">Коли</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_movements.map(m => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="py-2">{m.product_name}</td>
                  <td className="py-2 text-gray-500">{m.warehouse_name}</td>
                  <td className="py-2">{m.movement_type}</td>
                  <td className={`py-2 text-right font-medium ${
                    m.quantity_change > 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {m.quantity_change > 0 ? '+' : ''}{m.quantity_change}
                  </td>
                  <td className="py-2 text-right text-gray-500">
                    {new Date(m.created_at).toLocaleString('uk-UA')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
