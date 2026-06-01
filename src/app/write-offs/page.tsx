'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { confirmWriteOff } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { useDialog } from '@/components/DialogProvider'
import { ClipboardX, CheckCircle, Plus } from 'lucide-react'

const reasonLabels: Record<string, string> = {
  expired: 'Прострочення', damaged: 'Пошкодження', lost: 'Втрата',
  inventory_correction: 'Корекція', other: 'Інше',
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  confirmed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
}

const statusLabels: Record<string, string> = {
  draft: 'Чернетка', confirmed: 'Підтверджено', cancelled: 'Скасовано',
}

export default function WriteOffsPage() {
  const router = useRouter()
  const dialog = useDialog()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    supabase
      .from('write_offs')
      .select('*, warehouse:warehouse_id(name)')
      .order('created_at', { ascending: false })
      .then(r => {
        setItems(r.data || [])
        setLoading(false)
      })
  }

  useEffect(() => { load() }, [])

  const handleConfirm = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!(await dialog.confirm('Залишки будуть зменшені згідно акту списання.', {
      title: 'Підтвердити списання?',
      confirmText: 'Підтвердити',
    }))) return
    try {
      const res = await confirmWriteOff(id)
      setItems(prev => prev.map(w =>
        w.id === id ? { ...w, status: res.status, confirmed_at: res.confirmed_at } : w
      ))
    } catch (e) {
      console.error(e)
      await dialog.alert('Не вдалося підтвердити списання.', { tone: 'error' })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Списання</h1>
        <button
          onClick={() => router.push('/write-offs/new')}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> Новий акт списання
        </button>
      </div>

      {loading ? <p className="text-gray-500">Завантаження...</p> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Номер</th>
                <th className="text-left px-4 py-3 font-medium">Склад</th>
                <th className="text-left px-4 py-3 font-medium">Причина</th>
                <th className="text-left px-4 py-3 font-medium">Статус</th>
                <th className="text-right px-4 py-3 font-medium">Дата</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(w => (
                <tr
                  key={w.id}
                  className="border-t hover:bg-gray-50 cursor-pointer"
                  onClick={() => router.push(`/write-offs/${w.id}`)}
                >
                  <td className="px-4 py-3 font-medium text-blue-600">{w.write_off_number}</td>
                  <td className="px-4 py-3">{w.warehouse?.name}</td>
                  <td className="px-4 py-3">{reasonLabels[w.reason] || w.reason}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[w.status] || 'bg-gray-100 text-gray-600'}`}>
                      {statusLabels[w.status] || w.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {new Date(w.created_at).toLocaleDateString('uk-UA')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {w.status === 'draft' && (
                      <button
                        onClick={(e) => handleConfirm(w.id, e)}
                        className="text-green-600 hover:text-green-800"
                        title="Підтвердити"
                      >
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
              <ClipboardX className="w-12 h-12 mb-2" />
              <p>Списань поки що немає</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
