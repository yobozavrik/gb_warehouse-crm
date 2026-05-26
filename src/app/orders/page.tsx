'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchOrders, shipOrder } from '@/lib/api'
import type { OrderListItem } from '@/lib/types'
import { ShoppingCart, Truck, ChevronLeft, ChevronRight } from 'lucide-react'

const statusLabels: Record<string, string> = {
  draft: 'Чернетка', submitted: 'Очікує', confirmed: 'Підтверджено',
  partially_shipped: 'Частково відвантажено', shipped: 'Відвантажено', cancelled: 'Скасовано',
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
  const router = useRouter()
  const [orders, setOrders] = useState<OrderListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const pageSize = 20

  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchOrders({ status: statusFilter || undefined, page, pageSize })
      .then(r => {
        if (cancelled) return
        setOrders(r.items)
        setTotalPages(r.total_pages)
        setPage(r.page)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [page, statusFilter, reloadToken])

  const handleShip = async (id: string) => {
    if (!confirm('Відвантажити заявку? Товари будуть списані зі складу.')) return
    try {
      await shipOrder(id)
      setReloadToken(t => t + 1)
    } catch (e) {
      console.error(e)
      alert('Помилка при відвантаженні')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Заявки магазинів</h1>
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
        >
          <option value="">Всі статуси</option>
          <option value="submitted">Очікують</option>
          <option value="confirmed">Підтверджені</option>
          <option value="shipped">Відвантажені</option>
          <option value="cancelled">Скасовані</option>
        </select>
      </div>

      {loading ? <p className="text-gray-500">Завантаження...</p> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Номер</th>
                <th className="text-left px-4 py-3 font-medium">Магазин</th>
                <th className="text-left px-4 py-3 font-medium">Статус</th>
                <th className="text-left px-4 py-3 font-medium">Джерело</th>
                <th className="text-right px-4 py-3 font-medium">Позицій</th>
                <th className="text-right px-4 py-3 font-medium">Запитувалось</th>
                <th className="text-right px-4 py-3 font-medium">Відвантажено</th>
                <th className="text-right px-4 py-3 font-medium">Дата</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">
                    <button onClick={() => router.push(`/orders/${o.id}`)} className="text-blue-600 hover:text-blue-800">
                      {o.order_number}
                    </button>
                  </td>
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
                    {o.created_at ? new Date(o.created_at).toLocaleDateString('uk-UA') : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {(o.status === 'submitted' || o.status === 'confirmed') && (
                      <button onClick={() => handleShip(o.id)}
                        className="flex items-center gap-1 text-green-600 hover:text-green-800 text-xs font-medium"
                      >
                        <Truck className="w-4 h-4" /> Відвантажити
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <div className="text-sm text-gray-500">Сторінка {page} з {totalPages}</div>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                ><ChevronLeft className="w-4 h-4" /> Назад</button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >Далі <ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
          {orders.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <ShoppingCart className="w-12 h-12 mb-2" />
              <p>Заявок немає</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
