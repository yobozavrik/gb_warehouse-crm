'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { confirmTransfer } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { useDialog } from '@/components/DialogProvider'
import { MoveRight, CheckCircle, Plus } from 'lucide-react'

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  confirmed: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
}

const statusLabels: Record<string, string> = {
  draft: 'Чернетка', confirmed: 'Підтверджено',
  completed: 'Виконано', cancelled: 'Скасовано',
}

export default function TransfersPage() {
  const router = useRouter()
  const dialog = useDialog()
  const [transfers, setTransfers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    supabase
      .from('transfers')
      .select('*, from_warehouse:from_warehouse_id(name), to_warehouse:to_warehouse_id(name)')
      .order('created_at', { ascending: false })
      .then(r => {
        setTransfers(r.data || [])
        setLoading(false)
      })
  }

  useEffect(() => { load() }, [])

  const handleConfirm = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!(await dialog.confirm('Товари будуть списані з джерела і оприбутковані на отримувачі.', {
      title: 'Провести переміщення?',
      confirmText: 'Провести',
    }))) return
    try {
      const res = await confirmTransfer(id)
      setTransfers(prev => prev.map(t =>
        t.id === id ? { ...t, status: res.status, completed_at: res.completed_at } : t
      ))
    } catch (e) {
      console.error(e)
      await dialog.alert('Не вдалося провести переміщення.', { tone: 'error' })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Переміщення</h1>
        <button
          onClick={() => router.push('/transfers/new')}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> Нове переміщення
        </button>
      </div>

      {loading ? <p className="text-gray-500">Завантаження...</p> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Номер</th>
                <th className="text-left px-4 py-3 font-medium">Звідки</th>
                <th className="text-left px-4 py-3 font-medium">Куди</th>
                <th className="text-left px-4 py-3 font-medium">Статус</th>
                <th className="text-right px-4 py-3 font-medium">Дата</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {transfers.map(t => (
                <tr
                  key={t.id}
                  className="border-t hover:bg-gray-50 cursor-pointer"
                  onClick={() => router.push(`/transfers/${t.id}`)}
                >
                  <td className="px-4 py-3 font-medium text-blue-600">{t.transfer_number}</td>
                  <td className="px-4 py-3">{t.from_warehouse?.name}</td>
                  <td className="px-4 py-3">{t.to_warehouse?.name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[t.status] || ''}`}>
                      {statusLabels[t.status] || t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {new Date(t.created_at).toLocaleDateString('uk-UA')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {t.status === 'draft' && (
                      <button
                        onClick={(e) => handleConfirm(t.id, e)}
                        className="text-green-600 hover:text-green-800"
                        title="Провести"
                      >
                        <CheckCircle className="w-5 h-5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {transfers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <MoveRight className="w-12 h-12 mb-2" />
              <p>Переміщень поки що немає</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
