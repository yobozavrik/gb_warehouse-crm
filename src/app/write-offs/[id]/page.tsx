'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { fetchWriteOffDetail, confirmWriteOff } from '@/lib/api'
import { useDialog } from '@/components/DialogProvider'
import { ArrowLeft, CheckCircle } from 'lucide-react'

const reasonLabels: Record<string, string> = {
  expired: 'Прострочення', damaged: 'Пошкодження', lost: 'Втрата',
  inventory_correction: 'Корекція інвентаризації', other: 'Інше',
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  confirmed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
}

const statusLabels: Record<string, string> = {
  draft: 'Чернетка', confirmed: 'Підтверджено', cancelled: 'Скасовано',
}

export default function WriteOffDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const dialog = useDialog()
  const [writeOff, setWriteOff] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    fetchWriteOffDetail(id)
      .then(setWriteOff)
      .catch(e => { console.error(e); setError('Не вдалося завантажити акт списання') })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])

  const handleConfirm = async () => {
    if (!(await dialog.confirm('Залишки будуть зменшені згідно акту списання.', {
      title: 'Підтвердити списання?',
      confirmText: 'Підтвердити',
    }))) return
    setSaving(true)
    try {
      await confirmWriteOff(id)
      load()
    } catch (e) {
      console.error(e)
      await dialog.alert('Не вдалося підтвердити списання.', { tone: 'error' })
    } finally { setSaving(false) }
  }

  if (loading) return <p className="text-gray-500">Завантаження...</p>
  if (error) return <p className="text-red-500">{error}</p>
  if (!writeOff) return <p className="text-gray-500">Акт не знайдено</p>

  const items: any[] = writeOff.write_off_items || []

  return (
    <div className="space-y-6">
      <button onClick={() => router.push('/write-offs')}
        className="flex items-center gap-1 text-gray-500 hover:text-gray-700 text-sm">
        <ArrowLeft className="w-4 h-4" /> Назад до списань
      </button>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{writeOff.write_off_number}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {writeOff.warehouse?.name} · {reasonLabels[writeOff.reason] || writeOff.reason}
            </p>
          </div>
          <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${statusColors[writeOff.status] || ''}`}>
            {statusLabels[writeOff.status] || writeOff.status}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
          <div><span className="text-gray-400">Дата:</span> {new Date(writeOff.created_at).toLocaleDateString('uk-UA')}</div>
          <div><span className="text-gray-400">Підтверджено:</span> {writeOff.confirmed_at ? new Date(writeOff.confirmed_at).toLocaleDateString('uk-UA') : '—'}</div>
          {writeOff.notes && <div className="col-span-2"><span className="text-gray-400">Примітка:</span> {writeOff.notes}</div>}
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
              <th className="text-left px-4 py-3 font-medium">Примітка</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any) => (
              <tr key={item.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{item.product?.name}</td>
                <td className="px-4 py-3 text-gray-400">{item.product?.sku || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{item.product?.unit || 'шт'}</td>
                <td className="px-4 py-3 text-right font-medium">{item.quantity}</td>
                <td className="px-4 py-3 text-gray-500">{item.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && (
          <p className="text-center py-8 text-gray-400 text-sm">Позицій немає</p>
        )}
      </div>

      {writeOff.status === 'draft' && (
        <div className="flex justify-end">
          <button
            onClick={handleConfirm}
            disabled={saving || items.length === 0}
            className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            <CheckCircle className="w-5 h-5" /> Підтвердити списання
          </button>
        </div>
      )}
    </div>
  )
}
