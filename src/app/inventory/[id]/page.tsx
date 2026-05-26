'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  fetchInventoryDetail, setInventoryActual, addInventoryProduct,
  inventoryResort, completeInventory, cancelInventory,
} from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { useDialog } from '@/components/DialogProvider'
import type { InventoryDetail, InventoryItem, Product } from '@/lib/types'
import {
  ArrowLeft, CheckCircle2, XCircle, Plus, ArrowRightLeft, Search, X, Save, ClipboardCheck,
} from 'lucide-react'

type StatusFilter = 'all' | 'diff' | 'surplus' | 'shortage'

const STATUS_LABEL: Record<InventoryDetail['inventory']['status'], { label: string; cls: string }> = {
  draft:       { label: 'Чернетка',  cls: 'bg-gray-100 text-gray-600' },
  in_progress: { label: 'В процесі', cls: 'bg-amber-100 text-amber-700' },
  completed:   { label: 'Завершено', cls: 'bg-emerald-100 text-emerald-700' },
  cancelled:   { label: 'Скасовано', cls: 'bg-red-100 text-red-600' },
}

const fmt = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 3 })

export default function InventoryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const dialog = useDialog()

  const [data, setData] = useState<InventoryDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [dirty, setDirty] = useState<Map<string, number>>(new Map())
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [showAdd, setShowAdd] = useState(false)
  const [showResort, setShowResort] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await fetchInventoryDetail(id)
      setData(d)
      setDirty(new Map())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { if (id) void load() /* eslint-disable-next-line */ }, [id])

  const inv = data?.inventory
  const items = data?.items || []
  const stats = data?.stats
  const isOpen = inv?.status === 'in_progress'

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(it => {
      if (statusFilter === 'diff' && it.difference === 0) return false
      if (statusFilter === 'surplus' && it.difference <= 0) return false
      if (statusFilter === 'shortage' && it.difference >= 0) return false
      if (q) {
        const hay = `${it.product_name} ${it.sku || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [items, search, statusFilter])

  const grouped = useMemo(() => {
    const map = new Map<string, InventoryItem[]>()
    for (const it of filtered) {
      const key = it.category_name || 'Без категорії'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(it)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'uk'))
  }, [filtered])

  const onActualChange = (itemId: string, value: string) => {
    const n = Number(value.replace(',', '.'))
    setDirty(prev => {
      const m = new Map(prev)
      if (isFinite(n) && n >= 0) m.set(itemId, n)
      else m.delete(itemId)
      return m
    })
  }

  const saveRow = async (item: InventoryItem) => {
    const newVal = dirty.get(item.id)
    if (newVal === undefined) return
    setSaving(prev => new Set(prev).add(item.id))
    try {
      await setInventoryActual(item.id, newVal)
      setData(prev => prev ? {
        ...prev,
        items: prev.items.map(i => i.id === item.id ? { ...i, actual_quantity: newVal, difference: newVal - i.expected_quantity } : i),
        stats: recomputeStats(prev.items.map(i => i.id === item.id ? { ...i, actual_quantity: newVal, difference: newVal - i.expected_quantity } : i)),
      } : prev)
      setDirty(prev => { const m = new Map(prev); m.delete(item.id); return m })
    } catch (err) {
      await dialog.alert(err instanceof Error ? err.message : 'Помилка', { tone: 'error' })
    } finally {
      setSaving(prev => { const s = new Set(prev); s.delete(item.id); return s })
    }
  }

  const onComplete = async () => {
    if (!inv) return
    if (dirty.size > 0) {
      await dialog.alert(`Є ${dirty.size} незбережених змін. Спершу збережіть їх.`, { tone: 'warning' })
      return
    }
    const diffCount = stats?.with_diff || 0
    if (!(await dialog.confirm(
      `Буде застосовано ${diffCount} коригувань залишків. Дію не можна скасувати.`,
      { title: 'Завершити інвентаризацію?', confirmText: 'Завершити' },
    ))) return
    try {
      await completeInventory(inv.id)
      router.replace('/inventory')
    } catch (err) {
      await dialog.alert(err instanceof Error ? err.message : 'Помилка', { tone: 'error' })
    }
  }

  const onCancel = async () => {
    if (!inv) return
    if (!(await dialog.confirm(
      'Усі введені дані будуть втрачені, залишки на складі не зміняться.',
      { title: 'Скасувати інвентаризацію?', confirmText: 'Скасувати', tone: 'error' },
    ))) return
    try {
      await cancelInventory(inv.id)
      router.replace('/inventory')
    } catch (err) {
      await dialog.alert(err instanceof Error ? err.message : 'Помилка', { tone: 'error' })
    }
  }

  if (loading) return <div className="text-gray-500">Завантаження…</div>
  if (error)   return <div className="text-red-500">Помилка: {error}</div>
  if (!data || !inv) return <div className="text-gray-500">Не знайдено</div>

  const stCls = STATUS_LABEL[inv.status]

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/inventory" className="text-gray-500 hover:text-gray-700">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">{inv.inventory_number}</h1>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${stCls.cls}`}>{stCls.label}</span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Склад: <span className="text-gray-700">{inv.warehouse_name}</span>
            {inv.notes && <> · <span className="italic">{inv.notes}</span></>}
          </p>
        </div>
        {isOpen && (
          <div className="flex items-center gap-2">
            <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1.5 text-sm px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              <Plus className="w-4 h-4" /> Додати товар
            </button>
            <button onClick={() => setShowResort(true)} className="inline-flex items-center gap-1.5 text-sm px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              <ArrowRightLeft className="w-4 h-4" /> Пересорт
            </button>
            <button onClick={onCancel} className="inline-flex items-center gap-1.5 text-sm px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg">
              <XCircle className="w-4 h-4" /> Скасувати
            </button>
            <button onClick={onComplete} className="inline-flex items-center gap-1.5 text-sm px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
              <ClipboardCheck className="w-4 h-4" /> Завершити
            </button>
          </div>
        )}
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Позицій" value={stats?.total_positions ?? 0} color="bg-blue-500" />
        <Stat label="З розбіжностями" value={stats?.with_diff ?? 0} color="bg-amber-500" />
        <Stat label="Надлишок (од.)" value={`+${fmt.format(stats?.surplus_units ?? 0)}`} color="bg-emerald-500" />
        <Stat label="Недостача (од.)" value={`-${fmt.format(stats?.shortage_units ?? 0)}`} color="bg-red-500" />
      </div>

      {/* filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Пошук за назвою або артикулом…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as StatusFilter)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="all">Усі позиції</option>
          <option value="diff">Тільки з розбіжностями</option>
          <option value="surplus">Тільки надлишок</option>
          <option value="shortage">Тільки недостача</option>
        </select>
      </div>

      {/* items table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 sticky top-0 z-[2]">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Товар</th>
                <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Артикул</th>
                <th className="text-right px-4 py-2.5 font-medium">Очікувано</th>
                <th className="text-right px-4 py-2.5 font-medium">Фактично</th>
                <th className="text-right px-4 py-2.5 font-medium">Різниця</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {grouped.length === 0 && (
                <tr><td colSpan={6} className="text-center text-gray-400 py-10">Нічого не знайдено</td></tr>
              )}
              {grouped.map(([cat, rows]) => (
                <Group key={cat} name={cat} rows={rows} isOpen={!!isOpen} dirty={dirty} saving={saving} onChange={onActualChange} onSave={saveRow} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && inv && (
        <AddProductModal inventoryId={inv.id} warehouseId={inv.warehouse_id} existing={items} onClose={() => setShowAdd(false)} onAdded={load} />
      )}
      {showResort && inv && (
        <ResortModal inventoryId={inv.id} items={items} onClose={() => setShowResort(false)} onDone={load} />
      )}
    </div>
  )
}

function recomputeStats(items: InventoryItem[]) {
  const r = { total_positions: items.length, with_diff: 0, surplus_count: 0, shortage_count: 0, surplus_units: 0, shortage_units: 0 }
  for (const i of items) {
    if (i.difference !== 0) r.with_diff++
    if (i.difference > 0) { r.surplus_count++; r.surplus_units += i.difference }
    if (i.difference < 0) { r.shortage_count++; r.shortage_units += -i.difference }
  }
  return r
}

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 flex items-center gap-3">
      <div className={`w-2 h-10 rounded-full ${color}`} />
      <div>
        <div className="text-lg font-bold text-gray-900">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>
  )
}

function Group({ name, rows, isOpen, dirty, saving, onChange, onSave }: {
  name: string
  rows: InventoryItem[]
  isOpen: boolean
  dirty: Map<string, number>
  saving: Set<string>
  onChange: (id: string, v: string) => void
  onSave: (item: InventoryItem) => void
}) {
  return (
    <>
      <tr className="bg-gray-50/80">
        <td colSpan={6} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">{name}</td>
      </tr>
      {rows.map(it => {
        const pending = dirty.get(it.id)
        const isSaving = saving.has(it.id)
        const display = pending ?? it.actual_quantity
        return (
          <tr key={it.id} className="border-t hover:bg-gray-50">
            <td className="px-4 py-2 align-top">
              <Link href={`/products/${it.product_id}`} className="text-blue-600 hover:text-blue-800 font-medium">{it.product_name}</Link>
              {it.notes && <div className="text-[11px] text-gray-500 mt-0.5 italic">{it.notes}</div>}
            </td>
            <td className="px-4 py-2 align-top hidden md:table-cell text-gray-500 font-mono text-xs">{it.sku || '—'}</td>
            <td className="px-4 py-2 align-top text-right text-gray-700">
              {fmt.format(it.expected_quantity)} <span className="text-xs text-gray-400">{it.unit}</span>
            </td>
            <td className="px-4 py-2 align-top text-right">
              {isOpen ? (
                <input
                  type="number"
                  step="0.001"
                  min={0}
                  value={display}
                  onChange={e => onChange(it.id, e.target.value)}
                  className={`w-24 text-right border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${pending !== undefined ? 'border-amber-400 bg-amber-50' : 'border-gray-300'}`}
                />
              ) : (
                <span className="text-gray-700">{fmt.format(it.actual_quantity)}</span>
              )}
            </td>
            <td className={`px-4 py-2 align-top text-right font-semibold ${
              it.difference > 0 ? 'text-emerald-700' : it.difference < 0 ? 'text-red-700' : 'text-gray-400'
            }`}>
              {it.difference > 0 ? '+' : ''}{fmt.format(it.difference)}
            </td>
            <td className="px-4 py-2 align-top text-right">
              {isOpen && pending !== undefined && (
                <button
                  onClick={() => onSave(it)}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  <Save className="w-3 h-3" /> {isSaving ? '…' : 'OK'}
                </button>
              )}
            </td>
          </tr>
        )
      })}
    </>
  )
}

function AddProductModal({ inventoryId, warehouseId, existing, onClose, onAdded }: {
  inventoryId: string
  warehouseId: number
  existing: InventoryItem[]
  onClose: () => void
  onAdded: () => void
}) {
  void warehouseId
  const dialog = useDialog()
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Product | null>(null)
  const [actual, setActual] = useState('')
  const [saving, setSaving] = useState(false)
  const existingIds = useMemo(() => new Set(existing.map(i => i.product_id)), [existing])

  useEffect(() => {
    supabase.from('products').select('id, name, sku, unit').eq('is_active', true).order('name').then(r => {
      setProducts((r.data || []) as Product[])
    })
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return [] as Product[]
    return products
      .filter(p => !existingIds.has(p.id))
      .filter(p => p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
      .slice(0, 20)
  }, [products, search, existingIds])

  const onSubmit = async () => {
    if (!selected) return
    const n = Number(actual.replace(',', '.'))
    if (!isFinite(n) || n < 0) { void dialog.alert('Введіть коректну кількість', { tone: 'warning' }); return }
    setSaving(true)
    try {
      await addInventoryProduct(inventoryId, selected.id, n)
      onAdded()
      onClose()
    } catch (err) {
      await dialog.alert(err instanceof Error ? err.message : 'Помилка', { tone: 'error' })
    } finally { setSaving(false) }
  }

  return (
    <Modal title="Додати товар до інвентаризації" onClose={onClose}>
      {!selected ? (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Пошук за назвою або артикулом…"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div className="mt-2 max-h-60 overflow-y-auto border border-gray-100 rounded-lg divide-y">
            {filtered.length === 0 && search && (
              <div className="px-3 py-3 text-sm text-gray-400">Нічого не знайдено</div>
            )}
            {filtered.map(p => (
              <button key={p.id}
                onClick={() => setSelected(p)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
              >
                <span>{p.name}</span>
                <span className="text-gray-400 text-xs font-mono">{p.sku || '—'}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="font-medium text-gray-900">{selected.name}</div>
            <div className="text-xs text-gray-500 font-mono">{selected.sku || '—'} · {selected.unit}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Фактично виявлено</label>
            <input
              autoFocus
              type="number"
              step="0.001"
              min={0}
              value={actual}
              onChange={e => setActual(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="0"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setSelected(null)} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">Назад</button>
            <button onClick={onSubmit} disabled={saving || !actual} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50">
              {saving ? 'Зберігаємо…' : 'Додати'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function ResortModal({ inventoryId, items, onClose, onDone }: {
  inventoryId: string
  items: InventoryItem[]
  onClose: () => void
  onDone: () => void
}) {
  const dialog = useDialog()
  const [fromId, setFromId] = useState<number | null>(null)
  const [toId, setToId] = useState<number | null>(null)
  const [qty, setQty] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const sorted = useMemo(() => [...items].sort((a, b) => a.product_name.localeCompare(b.product_name, 'uk')), [items])

  const onSubmit = async () => {
    if (!fromId || !toId || fromId === toId) {
      void dialog.alert('Оберіть два різні товари', { tone: 'warning' }); return
    }
    const n = Number(qty.replace(',', '.'))
    if (!isFinite(n) || n <= 0) {
      void dialog.alert('Кількість має бути > 0', { tone: 'warning' }); return
    }
    setSaving(true)
    try {
      await inventoryResort({
        inventory_id: inventoryId,
        from_product_id: fromId,
        to_product_id: toId,
        quantity: n,
        notes: notes.trim() || undefined,
      })
      onDone()
      onClose()
    } catch (err) {
      await dialog.alert(err instanceof Error ? err.message : 'Помилка', { tone: 'error' })
    } finally { setSaving(false) }
  }

  return (
    <Modal title="Пересорт між товарами" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          Перенести кількість з одного товару (стане менше) на інший (стане більше). Зафіксується одним записом у нотатці обох позицій.
        </p>
        <div className="grid grid-cols-1 gap-2">
          <Picker label="З товару (зменшити)" value={fromId} onChange={setFromId} options={sorted} />
          <Picker label="На товар (збільшити)" value={toId} onChange={setToId} options={sorted} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Кількість</label>
            <input type="number" step="0.001" min={0.001} value={qty} onChange={e => setQty(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="0" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Коментар (необов&apos;язково)</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Напр.: переплутали в полицях…" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">Скасувати</button>
          <button onClick={onSubmit} disabled={saving} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50">
            {saving ? 'Зберігаємо…' : 'Виконати пересорт'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function Picker({ label, value, onChange, options }: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  options: InventoryItem[]
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
      >
        <option value="">— оберіть —</option>
        {options.map(o => (
          <option key={o.product_id} value={o.product_id}>
            {o.product_name} (фактично {fmt.format(o.actual_quantity)})
          </option>
        ))}
      </select>
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

// suppress unused import warning when build runs
void CheckCircle2
