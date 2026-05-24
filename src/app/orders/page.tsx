'use client'

import { useEffect, useState } from 'react'
import { fetchOrders, shipOrder } from '@/lib/api'
import { ShoppingCart, Truck } from 'lucide-react'

const statusLabels: Record<string, string> = {
  draft: 'Черновик', submitted: 'Ожидает', confirmed: 'Подтверждён',
  partially_shipped: 'Частично отгружен', shipped: 'Отгружен', cancelled: 'Отменён',
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  submitted: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-blue-100 text-blue-700',
  partially_shipped: 'bg-purple-100 text-purple-700',
  shipped: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')

  const load = () => {
    setLoading(true)
    fetchOrders({ status: statusFilter || undefined }).then(r => setOrders(r.items)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [statusFilter])

  const handleShip = async (id: string) => {
    if (!confirm('Отгрузить заявку? Товары будут списаны со склада.')) return
    try {
      await shipOrder(id)
      load()
    } catch (e) {
      console.error(e)
      alert('Ошибка при отгрузке')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Заявки магазинов</h1>
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">Все статусы</option>
          <option value="submitted">Ожидают</option>
          <option value="confirmed">Подтверждённые</option>
          <option value="shipped">Отгруженные</option>
          <option value="cancelled">Отменённые</option>
        </select>
      </div>

      {loading ? <p className="text-gray-500">Загрузка...</p> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Номер</th>
                <th className="text-left px-4 py-3 font-medium">Магазин</th>
                <th className="text-left px-4 py-3 font-medium">Статус</th>
                <th className="text-left px-4 py-3 font-medium">Источник</th>
                <th className="text-right px-4 py-3 font-medium">Позиций</th>
                <th className="text-right px-4 py-3 font-medium">Запрошено</th>
                <th className="text-right px-4 py-3 font-medium">Отгружено</th>
                <th className="text-right px-4 py-3 font-medium">Дата</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{o.order_number}</td>
                  <td className="px-4 py-3">{o.shop_name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[o.status] || ''}`}>
                      {statusLabels[o.status] || o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{o.source}</td>
                  <td className="px-4 py-3 text-right">{o.items_count}</td>
                  <td className="px-4 py-3 text-right">{o.total_requested}</td>
                  <td className="px-4 py-3 text-right">{o.total_shipped || 0}</td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {o.created_at ? new Date(o.created_at).toLocaleDateString('ru') : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {(o.status === 'submitted' || o.status === 'confirmed') && (
                      <button onClick={() => handleShip(o.id)}
                        className="flex items-center gap-1 text-green-600 hover:text-green-800 text-xs font-medium"
                      >
                        <Truck className="w-4 h-4" /> Отгрузить
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <ShoppingCart className="w-12 h-12 mb-2" />
              <p>Заявок нет</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
