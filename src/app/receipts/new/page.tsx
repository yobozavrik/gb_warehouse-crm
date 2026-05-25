'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createReceipt, fetchWarehouses, fetchSuppliers } from '@/lib/api'

function safeNum(v: string): number {
  const n = Number(v)
  return isFinite(n) ? n : 0
}
import { supabase } from '@/lib/supabase'
import type { Warehouse, Supplier, Product } from '@/lib/types'
import { ArrowLeft, Plus, Trash2, Save, Search } from 'lucide-react'
import Link from 'next/link'

interface ReceiptLine {
  product_id: number
  product_name: string
  quantity: number
  price: number
}

export default function NewReceiptPage() {
  const router = useRouter()
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    receipt_number: '',
    supplier_id: '',
    warehouse_id: '',
    notes: '',
  })
  const [lines, setLines] = useState<ReceiptLine[]>([])

  useEffect(() => {
    Promise.all([
      fetchWarehouses(),
      fetchSuppliers(),
      supabase.from('products').select('*').eq('is_active', true).order('name').then(r => r.data || []),
    ]).then(([w, s, p]) => {
      setWarehouses(w)
      setSuppliers(s)
      setProducts(p as Product[])
    })
  }, [])

  const addLine = (product: Product) => {
    if (lines.find(l => l.product_id === product.id)) return
    setLines([...lines, {
      product_id: product.id,
      product_name: product.name,
      quantity: 1,
      price: product.purchase_price || 0,
    }])
  }

  const removeLine = (idx: number) => setLines(lines.filter((_, i) => i !== idx))

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.warehouse_id || lines.length === 0) return
    setSaving(true)
    try {
      const { data: seq } = await supabase.rpc('next_document_number', { p_prefix: 'RCPT' })
      const receipt = await createReceipt({
        receipt_number: form.receipt_number || seq,
        supplier_id: form.supplier_id ? Number(form.supplier_id) : undefined,
        warehouse_id: Number(form.warehouse_id),
        notes: form.notes || undefined,
      })

      for (const line of lines) {
        await supabase.from('receipt_items').insert([{
          receipt_id: receipt.id,
          product_id: line.product_id,
          quantity: line.quantity,
          price: line.price,
        }])
      }

      router.push('/receipts')
    } catch (e) {
      console.error(e)
      alert('Ошибка при создании накладной')
    }
    setSaving(false)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/receipts" className="text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Новая приходная накладная</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Номер накладной</label>
              <input type="text"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Авто" value={form.receipt_number}
                onChange={e => setForm({ ...form, receipt_number: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Склад *</label>
              <select required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.warehouse_id} onChange={e => setForm({ ...form, warehouse_id: e.target.value })}
              >
                <option value="">Выберите склад</option>
                {warehouses.filter(w => w.type === 'central').map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Поставщик</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}
              >
                <option value="">Не выбран</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Примечание</label>
              <input type="text"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Товары в накладной</h2>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Поиск товара..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm"
              value={productSearch} onChange={e => setProductSearch(e.target.value)}
            />
            {productSearch && (
              <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filteredProducts.slice(0, 20).map(p => (
                  <button key={p.id} type="button"
                    className="flex items-center justify-between w-full px-3 py-2 text-sm hover:bg-gray-50"
                    onClick={() => { addLine(p); setProductSearch('') }}
                  >
                    <span>{p.name}</span>
                    <span className="text-gray-400 text-xs">{p.sku}</span>
                  </button>
                ))}
                {filteredProducts.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-400">Ничего не найдено</div>
                )}
              </div>
            )}
          </div>

          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Товар</th>
                <th className="text-right px-3 py-2 font-medium">Количество</th>
                <th className="text-right px-3 py-2 font-medium">Цена</th>
                <th className="text-right px-3 py-2 font-medium">Сумма</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr key={idx} className="border-t">
                  <td className="px-3 py-2">{line.product_name}</td>
                  <td className="px-3 py-2">
                    <input type="number" step="0.001" min="0.001"
                      className="w-24 text-right border border-gray-300 rounded px-2 py-1 text-sm"
                      value={line.quantity}
                      onChange={e => {
                        const newLines = [...lines]
                        newLines[idx].quantity = safeNum(e.target.value)
                        setLines(newLines)
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" step="0.01" min="0"
                      className="w-24 text-right border border-gray-300 rounded px-2 py-1 text-sm"
                      value={line.price}
                      onChange={e => {
                        const newLines = [...lines]
                        newLines[idx].price = safeNum(e.target.value)
                        setLines(newLines)
                      }}
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {(line.quantity * line.price).toFixed(2)} ₴
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => removeLine(idx)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-medium">
                <td className="px-3 py-2">Итого</td>
                <td className="px-3 py-2 text-right">
                  {lines.reduce((s, l) => s + l.quantity, 0)}
                </td>
                <td></td>
                <td className="px-3 py-2 text-right">
                  {lines.reduce((s, l) => s + l.quantity * l.price, 0).toFixed(2)} ₴
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>

          {lines.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">
              Добавьте товары в накладную через поиск выше
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Link href="/receipts"
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
          >Отмена</Link>
          <button type="submit" disabled={saving || !form.warehouse_id || lines.length === 0}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {saving ? 'Сохранение...' : 'Создать накладную'}
          </button>
        </div>
      </form>
    </div>
  )
}
