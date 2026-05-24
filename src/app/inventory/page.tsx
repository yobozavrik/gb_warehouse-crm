'use client'

import { useEffect, useState } from 'react'
import { completeInventory } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { ClipboardList, CheckCircle } from 'lucide-react'

export default function InventoryPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    supabase.from('inventories').select('*, warehouse:warehouse_id(name)')
      .order('created_at', { ascending: false }).then(r => {
        setItems(r.data || [])
        setLoading(false)
      })
  }

  useEffect(() => { load() }, [])

  const handleComplete = async (id: string) => {
    if (!confirm('Завершить инвентаризацию? Остатки будут скорректированы.')) return
    try {
      await completeInventory(id)
      load()
    } catch (e) {
      console.error(e)
      alert('Ошибка')
    }
  }

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    in_progress: 'bg-amber-100 text-amber-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-600',
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Инвентаризация</h1>
      {loading ? <p className="text-gray-500">Загрузка...</p> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Номер</th>
                <th className="text-left px-4 py-3 font-medium">Склад</th>
                <th className="text-left px-4 py-3 font-medium">Статус</th>
                <th className="text-right px-4 py-3 font-medium">Создана</th>
                <th className="text-right px-4 py-3 font-medium">Завершена</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(i => (
                <tr key={i.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{i.inventory_number}</td>
                  <td className="px-4 py-3">{i.warehouse?.name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[i.status]}`}>{i.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">{new Date(i.created_at).toLocaleString('ru')}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{i.completed_at ? new Date(i.completed_at).toLocaleString('ru') : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {i.status === 'in_progress' && (
                      <button onClick={() => handleComplete(i.id)} className="text-green-600 hover:text-green-800">
                        <CheckCircle className="w-5 h-5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <ClipboardList className="w-12 h-12 mb-2" />
              <p>Инвентаризаций пока нет</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
