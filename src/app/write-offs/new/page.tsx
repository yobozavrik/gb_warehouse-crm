'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createWriteOffWithItems, fetchWarehouses } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type { Warehouse, Product } from '@/lib/types'
import { useDialog } from '@/components/DialogProvider'
import { ArrowLeft, Trash2, Save, Search } from 'lucide-react'
import Link from 'next/link'

function safeNum(v: string): number {
  const n = Number(v)
  return isFinite(n) && n > 0 ? n : 0
}

const REASONS = [
  { value: 'expired', label: 'Прострочення' },
  { value: 'damaged', label: 'Пошкодження' },
  { value: 'lost', label: 'Втрата' },
  { value: 'inventory_correction', label: 'Корекція інвентаризації' },
  { value: 'other', label: 'Інше' },
]

interface WriteOffLine {
  product_id: number
  product_name: string
  unit: string
  quantity: number
  notes: string
}

export default function NewWriteOffPage() {
  const router = useRouter()
  const dialog = useDialog()
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [warehouseId, setWarehouseId] = useState('')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<WriteOffLine[]>([])

  useEffect(() => {
    Promise.all([
      fetchWarehouses(),
      supabase.from('products').select('*').eq('is_active', true).order('name').then(r => r.data || []),
    ]).then(([w, p]) => {
      setWarehouses(w)
      setProducts(p as Product[])
    })
  }, [])

  const addLine = (product: Product) => {
    if (lines.find(l => l.product_id === product.id)) return
    setLines(prev => [...prev, {
      product_id: product.id,
      product_name: product.name,
      unit: product.unit ?? 'шт',
      quantity: 1,
      notes: '',
    }])
    setProductSearch('')
  }

  const removeLine = (idx: number) => setLines(lines.filter((_, i) => i !== idx))

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.sku ?? '').toLowerCase().includes(productSearch.toLowerCase())
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!warehouseId || !reason || lines.length === 0) return
    setSaving(true)
    try {
      const res = await createWriteOffWithItems({
        warehouse_id: Number(warehouseId),
        reason,
        notes: notes || undefined,
        items: lines.map(l => ({
          product_id: l.product_id,
          quantity: l.quantity,
          notes: l.notes || undefined,
        })),
      })
      if (!res.success) {
        await dialog.alert(res.error || 'Не вдалося створити акт списання.', { tone: 'error' })
        return
      }
      router.push(`/write-offs/${res.write_off_id}`)
    } catch (err) {
      console.error(err)
      await dialog.alert(err instanceof Error ? err.message : 'Не вдалося створити акт списання.', { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/write-offs" className="text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Новий акт списання</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Склад *</label>
              <select required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={warehouseId}
                onChange={e => setWarehouseId(e.target.value)}
              >
                <option value="">Оберіть склад</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Причина *</label>
              <select required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={reason}
                onChange={e => setReason(e.target.value)}
              >
                <option value="">Оберіть причину</option>
                {REASONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Примітка до акту</label>
              <input type="text"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Необов'язково"
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Товари для списання</h2>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Пошук товару для додавання..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm"
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
            />
            {productSearch && (
              <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filteredProducts.slice(0, 20).map(p => (
                  <button key={p.id} type="button"
                    className="flex items-center justify-between w-full px-3 py-2 text-sm hover:bg-gray-50"
                    onClick={() => addLine(p)}
                  >
                    <span>{p.name}</span>
                    <span className="text-gray-400 text-xs">{p.sku}</span>
                  </button>
                ))}
                {filteredProducts.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-400">Нічого не знайдено</div>
                )}
              </div>
            )}
          </div>

          {lines.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Товар</th>
                  <th className="text-left px-3 py-2 font-medium">Од.</th>
                  <th className="text-right px-3 py-2 font-medium">Кількість</th>
                  <th className="text-left px-3 py-2 font-medium">Примітка</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="px-3 py-2">{line.product_name}</td>
                    <td className="px-3 py-2 text-gray-500">{line.unit}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number" step="0.001" min="0.001"
                        className="w-24 text-right border border-gray-300 rounded px-2 py-1 text-sm float-right"
                        value={line.quantity}
                        onChange={e => {
                          const updated = [...lines]
                          updated[idx] = { ...updated[idx], quantity: safeNum(e.target.value) || 1 }
                          setLines(updated)
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                        placeholder="Необов'язково"
                        value={line.notes}
                        onChange={e => {
                          const updated = [...lines]
                          updated[idx] = { ...updated[idx], notes: e.target.value }
                          setLines(updated)
                        }}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => removeLine(idx)}
                        className="text-red-500 hover:text-red-700">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-medium text-gray-700">
                  <td className="px-3 py-2">Разом позицій: {lines.length}</td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">
              Додайте товари через пошук вище
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Link href="/write-offs" className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
            Скасувати
          </Link>
          <button
            type="submit"
            disabled={saving || !warehouseId || !reason || lines.length === 0}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {saving ? 'Збереження...' : 'Створити акт списання'}
          </button>
        </div>
      </form>
    </div>
  )
}
