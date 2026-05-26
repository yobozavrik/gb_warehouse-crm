'use client'

import { useEffect, useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createInventory, fetchWarehouses } from '@/lib/api'
import { useDialog } from '@/components/DialogProvider'
import type { Warehouse } from '@/lib/types'
import { ArrowLeft, ClipboardList, Save } from 'lucide-react'

export default function NewInventoryPage() {
  const router = useRouter()
  const dialog = useDialog()
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [warehouseId, setWarehouseId] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchWarehouses().then(w => {
      if (cancelled) return
      setWarehouses(w)
      const first = w.find(x => x.warehouse_type === 'storage' || x.warehouse_type === 'other' || x.id === 1)
      if (first) setWarehouseId(String(first.id))
    })
    return () => { cancelled = true }
  }, [])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!warehouseId) return
    setSaving(true)
    try {
      const res = await createInventory({
        warehouse_id: Number(warehouseId),
        notes: notes.trim() || undefined,
      })
      router.replace(`/inventory/${res.inventory_id}`)
    } catch (err) {
      console.error(err)
      await dialog.alert(err instanceof Error ? err.message : 'Не вдалося створити інвентаризацію', { tone: 'error' })
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/inventory" className="text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Нова інвентаризація</h1>
      </div>

      <form onSubmit={onSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Склад *</label>
          <select
            required
            value={warehouseId}
            onChange={e => setWarehouseId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Оберіть склад…</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            При створенні в інвентаризацію автоматично потраплять усі товари, які зараз обліковуються на цьому складі.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Примітка</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Напр.: щомісячна, переоблік перед звітом…"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Link href="/inventory" className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900">
            Скасувати
          </Link>
          <button
            type="submit"
            disabled={!warehouseId || saving}
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? <ClipboardList className="w-4 h-4 animate-pulse" /> : <Save className="w-4 h-4" />}
            {saving ? 'Створюємо…' : 'Створити'}
          </button>
        </div>
      </form>
    </div>
  )
}
