'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Truck } from 'lucide-react'

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  packed: 'bg-blue-100 text-blue-700',
  shipped: 'bg-green-100 text-green-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-600',
}

const statusLabels: Record<string, string> = {
  draft: 'Чернетка', packed: 'Зібрано', shipped: 'Відвантажено',
  delivered: 'Доставлено', cancelled: 'Скасовано',
}

export default function ShipmentsPage() {
  const [shipments, setShipments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('shipments').select('*, shop:shop_id(name), warehouse:warehouse_id(name)')
      .order('created_at', { ascending: false }).then(r => {
        setShipments(r.data || [])
        setLoading(false)
      })
  }, [])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Відвантаження</h1>
      {loading ? <p className="text-gray-500">Завантаження...</p> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Номер</th>
                <th className="text-left px-4 py-3 font-medium">Магазин</th>
                <th className="text-left px-4 py-3 font-medium">Зі складу</th>
                <th className="text-left px-4 py-3 font-medium">Статус</th>
                <th className="text-right px-4 py-3 font-medium">Відвантажено</th>
                <th className="text-right px-4 py-3 font-medium">Доставлено</th>
                <th className="text-right px-4 py-3 font-medium">Дата</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map(s => (
                <tr key={s.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{s.shipment_number}</td>
                  <td className="px-4 py-3">{s.shop?.name || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{s.warehouse?.name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[s.status] || ''}`}>
                      {statusLabels[s.status] || s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {s.shipped_at ? new Date(s.shipped_at).toLocaleString('uk-UA') : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {s.delivered_at ? new Date(s.delivered_at).toLocaleString('uk-UA') : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {new Date(s.created_at).toLocaleDateString('uk-UA')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shipments.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Truck className="w-12 h-12 mb-2" />
              <p>Відвантажень поки що немає</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
