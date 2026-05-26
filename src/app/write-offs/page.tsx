'use client'

import { useEffect, useState } from 'react'
import { confirmWriteOff } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { useDialog } from '@/components/DialogProvider'
import { ClipboardX, CheckCircle } from 'lucide-react'

const reasonLabels: Record<string, string> = {
  expired: 'Прострочення', damaged: 'Пошкодження', lost: 'Втрата',
  inventory_correction: 'Корекція', other: 'Інше',
}

export default function WriteOffsPage() {
  const dialog = useDialog()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    supabase.from('write_offs').select('*, warehouse:warehouse_id(name)')
      .order('created_at', { ascending: false }).then(r => {
        setItems(r.data || [])
        setLoading(false)
      })
  }

  useEffect(() => { load() }, [])

  const handleConfirm = async (id: string) => {
    if (!(await dialog.confirm('Залишки будуть зменшені згідно акту списання.', {
      title: 'Підтвердити списання?',
      confirmText: 'Підтвердити',
    }))) return
    try {
      await confirmWriteOff(id)
      load()
    } catch (e) {
      console.error(e)
      await dialog.alert('Не вдалося підтвердити списання.', { tone: 'error' })
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Списання</h1>
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
                <tr key={w.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{w.write_off_number}</td>
                  <td className="px-4 py-3">{w.warehouse?.name}</td>
                  <td className="px-4 py-3">{reasonLabels[w.reason] || w.reason}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      w.status === 'confirmed' ? 'bg-green-100 text-green-700' : 
                      w.status === 'cancelled' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'
                    }`}>{w.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {new Date(w.created_at).toLocaleString('uk-UA')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {w.status === 'draft' && (
                      <button onClick={() => handleConfirm(w.id)}
                        className="text-green-600 hover:text-green-800">
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
