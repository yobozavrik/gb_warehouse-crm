'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { fetchOrderDetail, updateOrderItem, addOrderItem, removeOrderItem, confirmOrder } from '@/lib/api'
import { fetchProducts } from '@/lib/api'
import { useDialog } from '@/components/DialogProvider'
import { ArrowLeft, Check, Plus, Printer, Trash2, Truck } from 'lucide-react'

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

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const dialog = useDialog()
  const [order, setOrder] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editQty, setEditQty] = useState('')
  const [showAddItem, setShowAddItem] = useState(false)
  const [products, setProducts] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [newProductId, setNewProductId] = useState<number | null>(null)
  const [newQty, setNewQty] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    setError('')
    fetchOrderDetail(id).then(r => setOrder(r)).catch(e => {
      console.error(e)
      setError('Не вдалося завантажити заявку')
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])

  const canEdit = order && !['shipped', 'cancelled'].includes(order.order?.status)
  const canPrint = order && ['confirmed', 'partially_shipped', 'shipped'].includes(order.order?.status)

  const handleUpdateQty = async (itemId: string) => {
    const qty = parseFloat(editQty)
    if (!qty || qty <= 0) return
    setSaving(true)
    try {
      const res = await updateOrderItem(itemId, qty)
      if (!res.success) { await dialog.alert(res.error || 'Не вдалося оновити позицію.', { tone: 'error' }); return }
      setEditingId(null)
      load()
    } catch {
      await dialog.alert('Не вдалося оновити позицію.', { tone: 'error' })
    } finally { setSaving(false) }
  }

  const handleRemoveItem = async (itemId: string) => {
    if (!(await dialog.confirm('Позиція буде видалена із заявки.', {
      title: 'Видалити позицію?',
      confirmText: 'Видалити',
      tone: 'error',
    }))) return
    setSaving(true)
    try {
      const res = await removeOrderItem(itemId)
      if (!res.success) { await dialog.alert(res.error || 'Не вдалося видалити позицію.', { tone: 'error' }); return }
      load()
    } catch {
      await dialog.alert('Не вдалося видалити позицію.', { tone: 'error' })
    } finally { setSaving(false) }
  }

  const handleAddItem = async () => {
    if (!newProductId || !newQty) return
    const qty = parseFloat(newQty)
    if (!qty || qty <= 0) return
    setSaving(true)
    try {
      const res = await addOrderItem(id, newProductId, qty)
      if (!res.success) { await dialog.alert(res.error || 'Не вдалося додати товар.', { tone: 'error' }); return }
      setShowAddItem(false)
      setNewProductId(null)
      setNewQty('')
      setSearchTerm('')
      load()
    } catch {
      await dialog.alert('Не вдалося додати товар.', { tone: 'error' })
    } finally { setSaving(false) }
  }

  const handleConfirm = async () => {
    if (!(await dialog.confirm('Товари будуть списані зі складу та переміщені на склад магазину.', {
      title: 'Провести заявку?',
      confirmText: 'Провести',
    }))) return
    setSaving(true)
    try {
      const res = await confirmOrder(id)
      if (!res.success) { await dialog.alert(res.error || 'Не вдалося провести заявку.', { tone: 'error' }); return }
      load()
    } catch {
      await dialog.alert('Не вдалося провести заявку.', { tone: 'error' })
    } finally { setSaving(false) }
  }

  const openAddItem = async () => {
    setShowAddItem(true)
    const result = await fetchProducts({ pageSize: 200 })
    setProducts(result?.items || [])
  }

  const filteredProducts = products.filter(p =>
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) return <p className="text-gray-500">Завантаження...</p>
  if (error) return <p className="text-red-500">{error}</p>
  if (!order?.order) return <p className="text-gray-500">Заявку не знайдено</p>

  const o = order.order
  const items = order.items || []
  const shipments = order.shipments || []

  return (
    <div className="space-y-6">
      <button onClick={() => router.push('/orders')} className="print:hidden flex items-center gap-1 text-gray-500 hover:text-gray-700 text-sm">
        <ArrowLeft className="w-4 h-4" /> Назад до заявок
      </button>

      {/* Print-only document header */}
      <div className="hidden print:block text-center pb-2 border-b border-gray-300">
        <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Галя Балувана — Складський облік</p>
        <h1 className="text-xl font-bold text-gray-900">Заявка {o.order_number}</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 print:hidden">{o.order_number}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {o.shop_name} &middot; {o.warehouse_name}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${statusColors[o.status] || ''}`}>
              {statusLabels[o.status] || o.status}
            </span>
            {canPrint && (
              <button
                onClick={() => window.print()}
                className="print:hidden flex items-center gap-1 text-gray-500 hover:text-gray-700 text-sm border border-gray-300 px-3 py-1.5 rounded-lg"
              >
                <Printer className="w-4 h-4" /> Друкувати
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 text-sm text-gray-600 mt-2">
          <div><span className="text-gray-400">Джерело:</span> {o.source}</div>
          <div><span className="text-gray-400">Створив:</span> {o.created_by_name || '—'}</div>
          <div><span className="text-gray-400">Дата:</span> {o.created_at ? new Date(o.created_at).toLocaleDateString('uk-UA') : '—'}</div>
          {o.notes && <div className="col-span-3"><span className="text-gray-400">Примітки:</span> {o.notes}</div>}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <h2 className="font-semibold text-gray-900">Позиції ({items.length})</h2>
          {canEdit && (
            <button onClick={openAddItem} className="print:hidden flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium">
              <Plus className="w-4 h-4" /> Додати товар
            </button>
          )}
        </div>

        <table className="w-full text-sm">
          <thead className="text-gray-500">
            <tr>
              <th className="hidden print:table-cell px-4 py-3 font-medium text-center w-8">№</th>
              <th className="text-left px-4 py-3 font-medium">Товар</th>
              <th className="text-left px-4 py-3 font-medium">Од.</th>
              <th className="text-right px-4 py-3 font-medium">Запитувалось</th>
              <th className="text-right px-4 py-3 font-medium">Відвантажено</th>
              {canEdit && <th className="px-4 py-3 print:hidden"></th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, idx: number) => (
              <tr key={item.id} className="border-t hover:bg-gray-50">
                <td className="hidden print:table-cell px-4 py-3 text-center text-gray-400">{idx + 1}</td>
                <td className="px-4 py-3 font-medium">{item.product_name}</td>
                <td className="px-4 py-3 text-gray-500">{item.unit || 'шт'}</td>
                <td className="px-4 py-3 text-right">
                  {editingId === item.id ? (
                    <span className="flex items-center justify-end gap-1">
                      <input type="number" value={editQty} onChange={e => setEditQty(e.target.value)}
                        className="w-20 border border-gray-300 rounded px-2 py-1 text-right text-sm" min="0.001" step="any" />
                      <button onClick={() => handleUpdateQty(item.id)} disabled={saving}
                        className="text-green-600 hover:text-green-800"><Check className="w-4 h-4" /></button>
                      <button onClick={() => setEditingId(null)}
                        className="text-gray-400 hover:text-gray-600"><Trash2 className="w-3 h-3" /></button>
                    </span>
                  ) : (
                    <span>{item.quantity_requested}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-gray-500">{item.quantity_shipped || 0}</td>
                {canEdit && (
                  <td className="px-4 py-3 text-right print:hidden">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => { setEditingId(item.id); setEditQty(String(item.quantity_requested)) }}
                        className="text-blue-500 hover:text-blue-700 text-xs">Змінити</button>
                      <button onClick={() => handleRemoveItem(item.id)} disabled={saving}
                        className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAddItem && (
        <div className="print:hidden bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <h3 className="font-semibold text-gray-900">Додати товар</h3>
          <input type="text" placeholder="Пошук товару..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          {searchTerm && (
            <div className="max-h-40 overflow-y-auto border rounded-lg">
              {filteredProducts.slice(0, 20).map(p => (
                <div key={p.id} className={`px-3 py-2 cursor-pointer text-sm hover:bg-blue-50 ${newProductId === p.id ? 'bg-blue-100 font-medium' : ''}`}
                  onClick={() => { setNewProductId(p.id); setSearchTerm(p.name) }}>
                  {p.name} {p.sku ? `(${p.sku})` : ''}
                </div>
              ))}
              {filteredProducts.length === 0 && <p className="px-3 py-2 text-gray-400 text-sm">Нічого не знайдено</p>}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input type="number" placeholder="Кількість" value={newQty} onChange={e => setNewQty(e.target.value)}
              className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm" min="0.001" step="any" />
            <button onClick={handleAddItem} disabled={saving || !newProductId || !newQty}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
              Додати
            </button>
            <button onClick={() => setShowAddItem(false)} className="text-gray-500 text-sm px-3 py-2">Скасувати</button>
          </div>
        </div>
      )}

      {shipments.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="font-semibold text-gray-900 mb-3">Відвантаження</h2>
          <div className="space-y-2">
            {shipments.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                <span className="font-medium">{s.shipment_number}</span>
                <span className="text-gray-500">{s.status}</span>
                <span className="text-gray-400">{s.shipped_at ? new Date(s.shipped_at).toLocaleDateString('uk-UA') : '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Print-only signature footer */}
      <div className="hidden print:block mt-10 pt-6 border-t border-gray-300 text-sm text-gray-700">
        <div className="flex justify-between gap-12">
          <div>
            Видав: <span className="inline-block border-b border-gray-500 w-44">&nbsp;</span>
          </div>
          <div>
            Прийняв: <span className="inline-block border-b border-gray-500 w-44">&nbsp;</span>
          </div>
          <div>
            Дата: <span className="inline-block border-b border-gray-500 w-32">&nbsp;</span>
          </div>
        </div>
      </div>

      {canEdit && (
        <div className="print:hidden flex justify-end">
          <button onClick={handleConfirm} disabled={saving || items.length === 0}
            className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50">
            <Truck className="w-5 h-5" /> Провести заявку
          </button>
        </div>
      )}
    </div>
  )
}
