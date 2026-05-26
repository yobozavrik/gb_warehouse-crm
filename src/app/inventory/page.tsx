'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ClipboardList, Plus, ChevronRight } from 'lucide-react'

interface InventoryRow {
  id: string
  inventory_number: string
  status: 'draft' | 'in_progress' | 'completed' | 'cancelled'
  notes: string | null
  created_at: string
  completed_at: string | null
  warehouse: { name: string } | null
}

export default function InventoryPage() {
  const router = useRouter()
  const [items, setItems] = useState<InventoryRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const r = await supabase.from('inventories')
        .select('id, inventory_number, status, notes, created_at, completed_at, warehouse:warehouse_id(name)')
        .order('created_at', { ascending: false })
      if (cancelled) return
      setItems((r.data || []) as unknown as InventoryRow[])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    in_progress: 'bg-amber-100 text-amber-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-600',
  }

  const statusLabels: Record<string, string> = {
    draft: 'Чернетка', in_progress: 'В процесі',
    completed: 'Завершено', cancelled: 'Скасовано',
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Інвентаризація</h1>
        <Link href="/inventory/new"
          className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> Нова інвентаризація
        </Link>
      </div>

      {loading ? <p className="text-gray-500">Завантаження...</p> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Номер</th>
                <th className="text-left px-4 py-3 font-medium">Склад</th>
                <th className="text-left px-4 py-3 font-medium">Статус</th>
                <th className="text-right px-4 py-3 font-medium">Створена</th>
                <th className="text-right px-4 py-3 font-medium">Завершена</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(i => (
                <tr key={i.id}
                  onClick={() => router.push(`/inventory/${i.id}`)}
                  className="border-t hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium text-blue-600">{i.inventory_number}</td>
                  <td className="px-4 py-3">{i.warehouse?.name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[i.status]}`}>
                      {statusLabels[i.status] || i.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">{new Date(i.created_at).toLocaleString('uk-UA')}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{i.completed_at ? new Date(i.completed_at).toLocaleString('uk-UA') : '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-400">
                    <ChevronRight className="w-4 h-4 inline" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <ClipboardList className="w-12 h-12 mb-2" />
              <p>Інвентаризацій поки що немає</p>
              <Link href="/inventory/new" className="text-blue-600 hover:underline text-sm mt-2">Створити першу</Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
