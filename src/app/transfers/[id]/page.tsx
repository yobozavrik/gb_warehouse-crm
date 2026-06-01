'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { fetchTransferDetail, confirmTransfer } from '@/lib/api'
import { useDialog } from '@/components/DialogProvider'
import { ArrowLeft, CheckCircle } from 'lucide-react'

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

export default function TransferDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const dialog = useDialog()
  const [transfer, setTransfer] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    fetchTransferDetail(id)
      .then(setTransfer)
      .catch(e => { console.error(e); setError('Не вдалося завантажити переміщення') })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])

  const handleConfirm = async () => {
    if (!(await dialog.confirm('Товари будуть списані з джерела і оприбутковані на отримувачі.', {
      title: 'Провести переміщення?',
      confirmText: 'Провести',
    }))) return
    setSaving(true)
    try {
      await confirmTransfer(id)
      load()
    } catch (e) {
      console.error(e)
      await dialog.alert('Не вдалося провести переміщення.', { tone: 'error' })
    } finally { setSaving(false) }
  }

  if (loading) return <p className="text-gray-500">Завантаження...</p>
  if (error) return <p className="text-red-500">{error}</p>
  if (!transfer) return <p className="text-gray-500">Переміщення не знайдено</p>

  const items: any[] = transfer.transfer_items || []

  return (
    <div className="space-y-6">
      <button onClick={() => router.push('/transfers')}
        className="flex items-center gap-1 text-gray-500 hover:text-gray-700 text-sm">
        <ArrowLeft className="w-4 h-4" /> Назад до переміщень
      </button>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{transfer.transfer_number}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {transfer.from_warehouse?.name} → {transfer.to_warehouse?.name}
            </p>
          </div>
          <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${statusColors[transfer.status] || ''}`}>
            {statusLabels[transfer.status] || transfer.status}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
          <div><span className="text-gray-400">Дата:</span> {new Date(transfer.created_at).toLocaleDateString('uk-UA')}</div>
          <div><span className="text-gray-400">Виконано:</span> {transfer.completed_at ? new Date(transfer.completed_at).toLocaleDateString('uk-UA') : '—'}</div>
          {transfer.notes && <div className="col-span-2"><span className="text-gray-400">Примітка:</span> {transfer.notes}</div>}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h2 className="font-semibold text-gray-900">Товари ({items.length})</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="text-gray-500">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Товар</th>
              <th className="text-left px-4 py-3 font-medium">Артикул</th>
              <th className="text-left px-4 py-3 font-medium">Од.</th>
              <th className="text-right px-4 py-3 font-medium">Кількість</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any) => (
              <tr key={item.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{item.product?.name}</td>
                <td className="px-4 py-3 text-gray-400">{item.product?.sku || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{item.product?.unit || 'шт'}</td>
                <td className="px-4 py-3 text-right font-medium">{item.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && (
          <p className="text-center py-8 text-gray-400 text-sm">Позицій немає</p>
        )}
      </div>

      {transfer.status === 'draft' && (
        <div className="flex justify-end">
          <button
            onClick={handleConfirm}
            disabled={saving || items.length === 0}
            className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            <CheckCircle className="w-5 h-5" /> Провести переміщення
          </button>
        </div>
      )}
    </div>
  )
}
