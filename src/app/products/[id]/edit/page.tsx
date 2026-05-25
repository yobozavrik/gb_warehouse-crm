'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { updateProduct, fetchCategoriesTree } from '@/lib/api'

import type { ProductCategory } from '@/lib/types'
import { ArrowLeft, Save } from 'lucide-react'

function safeNum(v: string | undefined): number | undefined {
  if (!v) return undefined
  const n = Number(v)
  return isFinite(n) ? n : undefined
}

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '', sku: '', barcode: '', category_id: '', unit: 'шт',
    purchase_price: '', min_stock: '', max_stock: '', description: ''
  })

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase.from('products').select('*').eq('id', Number(id)).single(),
      fetchCategoriesTree(),
    ]).then(([product, cats]) => {
      const p = product.data
      setForm({
        name: p.name || '',
        sku: p.sku || '',
        barcode: p.barcode || '',
        category_id: p.category_id ? String(p.category_id) : '',
        unit: p.unit || 'шт',
        purchase_price: p.purchase_price ? String(p.purchase_price) : '',
        min_stock: p.min_stock ? String(p.min_stock) : '',
        max_stock: p.max_stock ? String(p.max_stock) : '',
        description: p.description || '',
      })
      setCategories(cats)
    }).finally(() => setLoading(false))
  }, [id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await updateProduct(Number(id), {
        name: form.name,
        sku: form.sku || undefined,
        barcode: form.barcode || undefined,
        category_id: safeNum(form.category_id),
        unit: form.unit,
        purchase_price: safeNum(form.purchase_price),
        min_stock: safeNum(form.min_stock),
        max_stock: safeNum(form.max_stock),
        description: form.description || undefined,
      })
      router.push(`/products/${id}`)
    } finally {
      setSaving(false)
    }
  }

  function Field({ label, value, fieldKey, type = 'text', required }: {
    label: string; value: string; fieldKey: string; type?: string; required?: boolean
  }) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        {type === 'textarea' ? (
          <textarea
            value={value}
            onChange={e => setForm(f => ({ ...f, [fieldKey]: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            rows={3}
          />
        ) : type === 'select' ? (
          <select
            value={value}
            onChange={e => setForm(f => ({ ...f, [fieldKey]: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : (
          <input
            type={type}
            value={value}
            onChange={e => setForm(f => ({ ...f, [fieldKey]: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            required={required}
          />
        )}
      </div>
    )
  }

  if (loading) return <p className="text-gray-500">Завантаження...</p>

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <button onClick={() => router.back()} className="flex items-center gap-1 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4" /> Назад
        </button>
      </div>

      <h1 className="text-2xl font-bold text-gray-900">Редагувати товар</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <Field label="Назва" fieldKey="name" value={form.name} required />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Артикул" fieldKey="sku" value={form.sku} />
          <Field label="Штрихкод" fieldKey="barcode" value={form.barcode} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Категорія</label>
          <select
            value={form.category_id}
            onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Без категорії</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Одиниця виміру" fieldKey="unit" value={form.unit} />
          <Field label="Ціна закупівлі" fieldKey="purchase_price" value={form.purchase_price} type="number" />
          <Field label="Мін. залишок" fieldKey="min_stock" value={form.min_stock} type="number" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Макс. залишок" fieldKey="max_stock" value={form.max_stock} type="number" />
        </div>
        <Field label="Опис" fieldKey="description" value={form.description} type="textarea" />
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          <Save className="w-4 h-4" /> {saving ? 'Збереження...' : 'Зберегти'}
        </button>
      </form>
    </div>
  )
}
