'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createProduct, fetchCategoriesTree, fetchWarehouses, fetchStockBalances, fetchFromTable } from '@/lib/api'
import type { ProductCategory } from '@/lib/types'

function safeNum(v: string | undefined): number | undefined {
  if (!v) return undefined
  const n = Number(v)
  return isFinite(n) ? n : undefined
}
import { ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'

export default function NewProductPage() {
  const router = useRouter()
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    name: '', sku: '', barcode: '', category_id: '',
    unit: 'шт', purchase_price: '', min_stock: '', max_stock: '', description: '',
  })

  useEffect(() => {
    fetchCategoriesTree().then(setCategories)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await createProduct({
        name: form.name,
        sku: form.sku || undefined,
        barcode: form.barcode || undefined,
        category_id: safeNum(form.category_id),
        unit: form.unit,
        purchase_price: safeNum(form.purchase_price),
        min_stock: safeNum(form.min_stock),
        max_stock: form.max_stock ? Number(form.max_stock) : undefined,
        description: form.description || undefined,
      })
      router.push('/products')
    } catch (e) {
      console.error(e)
      alert('Ошибка при создании товара')
    }
    setSaving(false)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/products" className="text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Новый товар</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Название *</label>
            <input type="text" required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Артикул</label>
            <input type="text"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Штрихкод</label>
            <input type="text"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Категория</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}
            >
              <option value="">Без категории</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Единица измерения</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}
            >
              <option value="шт">шт</option>
              <option value="кг">кг</option>
              <option value="л">л</option>
              <option value="уп">уп</option>
              <option value="м">м</option>
              <option value="рул">рул</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Закупочная цена</label>
            <input type="number" step="0.01" min="0"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={form.purchase_price} onChange={e => setForm({ ...form, purchase_price: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Мин. остаток</label>
            <input type="number" step="0.001" min="0"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={form.min_stock} onChange={e => setForm({ ...form, min_stock: e.target.value })}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
            <textarea rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Link href="/products"
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
          >Отмена</Link>
          <button type="submit" disabled={saving || !form.name.trim()}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  )
}
