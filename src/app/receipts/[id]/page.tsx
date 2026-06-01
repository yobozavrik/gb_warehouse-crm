'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  fetchReceiptDetail, confirmReceipt,
  cancelReceipt, updateReceiptItem, deleteReceiptItem, addReceiptItem,
} from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type { ReceiptDetailResponse, Product } from '@/lib/types'
import { useDialog } from '@/components/DialogProvider'
import { ArrowLeft, Package, Building2, Warehouse, FileSpreadsheet, Check, Trash2, Plus, X, Search } from 'lucide-react'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatCurrency(n: number | null) {
  if (n == null) return '—'
  return new Intl.NumberFormat('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' ₴'
}

function safeNum(v: string): number {
  const n = Number(v)
  return isFinite(n) ? n : 0
}

const statusLabels: Record<string, { label: string; color: string }> = {
  draft:     { label: 'Чернетка',    color: 'bg-gray-100 text-gray-600 border-gray-200' },
  confirmed: { label: 'Підтверджено', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: 'Скасовано',   color: 'bg-red-50 text-red-600 border-red-200' },
}

export default function ReceiptDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const dialog = useDialog()

  const [data, setData] = useState<ReceiptDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editQty, setEditQty] = useState('')
  const [editPrice, setEditPrice] = useState('')

  // Add item panel
  const [showAdd, setShowAdd] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [addProductId, setAddProductId] = useState<number | null>(null)
  const [addProductName, setAddProductName] = useState('')
  const [addQty, setAddQty] = useState('1')
  const [addPrice, setAddPrice] = useState('')

  const load = () => {
    setLoading(true)
    fetchReceiptDetail(id)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { if (id) load() }, [id])

  const isDraft = data?.receipt?.status === 'draft'

  // ── Confirm ──────────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!(await dialog.confirm('Товари будуть зараховані на склад.', {
      title: 'Провести накладну?', confirmText: 'Провести',
    }))) return
    setSaving(true)
    try {
      await confirmReceipt(id)
      load()
    } catch (e: any) {
      await dialog.alert(e.message || 'Помилка проведення.', { tone: 'error' })
    } finally { setSaving(false) }
  }

  // ── Cancel ────────────────────────────────────────────────────────────────
  const handleCancel = async () => {
    if (!(await dialog.confirm('Накладна буде скасована. Цю дію не можна відмінити.', {
      title: 'Скасувати накладну?', confirmText: 'Скасувати', tone: 'error',
    }))) return
    setSaving(true)
    try {
      const res = await cancelReceipt(id)
      if (!res.success) { await dialog.alert(res.error || 'Помилка скасування.', { tone: 'error' }); return }
      load()
    } catch (e: any) {
      await dialog.alert(e.message || 'Помилка скасування.', { tone: 'error' })
    } finally { setSaving(false) }
  }

  // ── Edit item ─────────────────────────────────────────────────────────────
  const startEdit = (item: any) => {
    setEditingId(item.id)
    setEditQty(String(item.quantity))
    setEditPrice(item.price != null ? String(item.price) : '')
  }

  const saveEdit = async (itemId: string) => {
    const qty = safeNum(editQty)
    if (qty <= 0) return
    setSaving(true)
    try {
      const res = await updateReceiptItem(itemId, qty, editPrice ? safeNum(editPrice) : undefined)
      if (!res.success) { await dialog.alert(res.error || 'Помилка збереження.', { tone: 'error' }); return }
      setEditingId(null)
      load()
    } catch (e: any) {
      await dialog.alert(e.message || 'Помилка збереження.', { tone: 'error' })
    } finally { setSaving(false) }
  }

  // ── Delete item ───────────────────────────────────────────────────────────
  const handleDelete = async (itemId: string) => {
    if (!(await dialog.confirm('Позицію буде видалено з накладної.', {
      title: 'Видалити позицію?', confirmText: 'Видалити', tone: 'error',
    }))) return
    setSaving(true)
    try {
      const res = await deleteReceiptItem(itemId)
      if (!res.success) { await dialog.alert(res.error || 'Помилка видалення.', { tone: 'error' }); return }
      load()
    } catch (e: any) {
      await dialog.alert(e.message || 'Помилка видалення.', { tone: 'error' })
    } finally { setSaving(false) }
  }

  // ── Add item panel ────────────────────────────────────────────────────────
  const openAdd = async () => {
    setShowAdd(true)
    if (products.length === 0) {
      const { data: p } = await supabase.from('products').select('*').eq('is_active', true).order('name')
      setProducts((p || []) as Product[])
    }
  }

  const selectAddProduct = (p: Product) => {
    setAddProductId(p.id)
    setAddProductName(p.name)
    setAddPrice(p.purchase_price != null ? String(p.purchase_price) : '')
    setProductSearch('')
  }

  const handleAdd = async () => {
    if (!addProductId || safeNum(addQty) <= 0) return
    setSaving(true)
    try {
      const res = await addReceiptItem(id, addProductId, safeNum(addQty), addPrice ? safeNum(addPrice) : undefined)
      if (!res.success) { await dialog.alert(res.error || 'Помилка додавання.', { tone: 'error' }); return }
      setShowAdd(false)
      setAddProductId(null)
      setAddProductName('')
      setAddQty('1')
      setAddPrice('')
      setProductSearch('')
      load()
    } catch (e: any) {
      await dialog.alert(e.message || 'Помилка додавання.', { tone: 'error' })
    } finally { setSaving(false) }
  }

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.sku ?? '').toLowerCase().includes(productSearch.toLowerCase())
  )

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 bg-gray-200 rounded-lg w-1/4" />
      <div className="h-32 bg-gray-100 rounded-xl" />
      <div className="h-64 bg-gray-100 rounded-xl" />
    </div>
  )
  if (error) return <p className="text-red-500">Помилка: {error}</p>
  if (!data || !data.receipt) return <p className="text-gray-500">Накладну не знайдено</p>

  const { receipt, items, total } = data
  const st = statusLabels[receipt.status] || { label: receipt.status, color: 'bg-gray-100 text-gray-600' }

  return (
    <div className="space-y-5">
      <button onClick={() => router.push('/receipts')}
        className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-brand-600)] transition-colors">
        <ArrowLeft className="w-4 h-4" /> Назад до накладних
      </button>

      {/* Header card */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">{receipt.receipt_number}</h1>
              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border ${st.color}`}>{st.label}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-sm text-[var(--color-text-secondary)]">
              <div className="flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-[var(--color-text-tertiary)]" />
                <span>{receipt.supplier?.name || '—'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Warehouse className="w-4 h-4 text-[var(--color-text-tertiary)]" />
                <span>{receipt.warehouse?.name || '—'}</span>
              </div>
              <span>{formatDate(receipt.created_at)}</span>
            </div>
            {receipt.notes && (
              <p className="mt-3 text-sm text-[var(--color-text-secondary)] bg-[var(--color-surface-subtle)] rounded-lg p-3 border border-[var(--color-border-light)]">
                {receipt.notes}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-4 sm:gap-6 mt-5 pt-5 border-t border-[var(--color-border-light)]">
          <div className="bg-[var(--color-surface-subtle)] rounded-lg px-4 py-3">
            <span className="text-xs text-[var(--color-text-tertiary)] font-medium uppercase tracking-wide">Позицій</span>
            <div className="text-lg font-bold text-[var(--color-text)] mt-0.5">{items.length}</div>
          </div>
          <div className="bg-[var(--color-surface-subtle)] rounded-lg px-4 py-3">
            <span className="text-xs text-[var(--color-text-tertiary)] font-medium uppercase tracking-wide">Загальна сума</span>
            <div className="text-lg font-bold text-[var(--color-text)] mt-0.5">{formatCurrency(total)}</div>
          </div>
        </div>

        {/* Action buttons — only for draft */}
        {isDraft && (
          <div className="flex flex-wrap gap-3 mt-5 pt-5 border-t border-[var(--color-border-light)]">
            <button
              onClick={handleConfirm}
              disabled={saving || items.length === 0}
              className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              <Check className="w-4 h-4" /> Провести накладну
            </button>
            <button
              onClick={handleCancel}
              disabled={saving}
              className="flex items-center gap-2 border border-red-300 text-red-600 px-5 py-2 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50"
            >
              <X className="w-4 h-4" /> Скасувати
            </button>
          </div>
        )}
      </div>

      {/* Items table */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border-light)] flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-[var(--color-brand-500)]" />
          <span className="font-semibold text-sm text-[var(--color-text)]">Позиції накладної</span>
          <span className="ml-auto text-xs text-[var(--color-text-tertiary)]">{items.length} товарів</span>
          {isDraft && (
            <button
              onClick={openAdd}
              className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium ml-2"
            >
              <Plus className="w-4 h-4" /> Додати товар
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--color-text-tertiary)]">
            <Package className="w-12 h-12 mb-2 opacity-40" />
            <p>Немає позицій</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--color-surface-subtle)]">
                  <th className="text-left px-5 py-3 font-medium text-[var(--color-text-tertiary)] text-xs uppercase tracking-wide">№</th>
                  <th className="text-left px-5 py-3 font-medium text-[var(--color-text-tertiary)] text-xs uppercase tracking-wide">Товар</th>
                  <th className="text-left px-5 py-3 font-medium text-[var(--color-text-tertiary)] text-xs uppercase tracking-wide">Артикул</th>
                  <th className="text-right px-5 py-3 font-medium text-[var(--color-text-tertiary)] text-xs uppercase tracking-wide">Кількість</th>
                  <th className="text-right px-5 py-3 font-medium text-[var(--color-text-tertiary)] text-xs uppercase tracking-wide">Ціна</th>
                  <th className="text-right px-5 py-3 font-medium text-[var(--color-text-tertiary)] text-xs uppercase tracking-wide">Сума</th>
                  {isDraft && <th className="px-5 py-3"></th>}
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.id} className="border-t border-[var(--color-border-light)] hover:bg-[var(--color-surface-subtle)]">
                    <td className="px-5 py-3 text-[var(--color-text-tertiary)]">{i + 1}</td>
                    <td className="px-5 py-3 font-medium text-[var(--color-text)]">{item.product?.name || '—'}</td>
                    <td className="px-5 py-3 text-[var(--color-text-tertiary)] font-mono text-xs">{item.product?.sku || '—'}</td>

                    {/* Quantity cell */}
                    <td className="px-5 py-3 text-right">
                      {editingId === item.id ? (
                        <input
                          type="number" step="0.001" min="0.001"
                          value={editQty}
                          onChange={e => setEditQty(e.target.value)}
                          className="w-24 border border-gray-300 rounded px-2 py-1 text-right text-sm"
                          autoFocus
                        />
                      ) : (
                        <span className="font-medium">{item.quantity} {item.product?.unit || ''}</span>
                      )}
                    </td>

                    {/* Price cell */}
                    <td className="px-5 py-3 text-right">
                      {editingId === item.id ? (
                        <input
                          type="number" step="0.01" min="0"
                          value={editPrice}
                          onChange={e => setEditPrice(e.target.value)}
                          className="w-28 border border-gray-300 rounded px-2 py-1 text-right text-sm"
                          placeholder="Ціна"
                        />
                      ) : (
                        formatCurrency(item.price)
                      )}
                    </td>

                    <td className="px-5 py-3 text-right font-semibold text-[var(--color-text)]">
                      {editingId === item.id
                        ? formatCurrency(safeNum(editQty) * safeNum(editPrice))
                        : formatCurrency(item.total)
                      }
                    </td>

                    {isDraft && (
                      <td className="px-5 py-3 text-right">
                        {editingId === item.id ? (
                          <span className="flex items-center justify-end gap-1">
                            <button onClick={() => saveEdit(item.id)} disabled={saving}
                              className="text-green-600 hover:text-green-800" title="Зберегти">
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={() => setEditingId(null)}
                              className="text-gray-400 hover:text-gray-600" title="Скасувати">
                              <X className="w-4 h-4" />
                            </button>
                          </span>
                        ) : (
                          <span className="flex items-center justify-end gap-1">
                            <button onClick={() => startEdit(item)}
                              className="text-blue-500 hover:text-blue-700 text-xs font-medium">
                              Змінити
                            </button>
                            <button onClick={() => handleDelete(item.id)} disabled={saving}
                              className="text-red-400 hover:text-red-600">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-surface-subtle)]">
                  <td colSpan={3} className="px-5 py-3 text-sm font-medium text-[var(--color-text)]">Всього</td>
                  <td className="px-5 py-3 text-right font-medium text-[var(--color-text)]">
                    {items.reduce((a, i) => a + i.quantity, 0)}
                  </td>
                  <td className="px-5 py-3"></td>
                  <td className="px-5 py-3 text-right font-bold text-[var(--color-text)]">{formatCurrency(total)}</td>
                  {isDraft && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Add item panel */}
      {showAdd && isDraft && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h3 className="font-semibold text-gray-900">Додати товар до накладної</h3>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Пошук товару..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm"
              value={productSearch}
              onChange={e => { setProductSearch(e.target.value); setAddProductId(null); setAddProductName('') }}
            />
            {productSearch && !addProductId && (
              <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filteredProducts.slice(0, 20).map(p => (
                  <button key={p.id} type="button"
                    className="flex items-center justify-between w-full px-3 py-2 text-sm hover:bg-gray-50"
                    onClick={() => selectAddProduct(p)}
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

          {addProductId && (
            <p className="text-sm font-medium text-gray-700">✓ {addProductName}</p>
          )}

          <div className="flex items-center gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Кількість</label>
              <input type="number" step="0.001" min="0.001"
                className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={addQty}
                onChange={e => setAddQty(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Ціна за од.</label>
              <input type="number" step="0.01" min="0"
                className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="0.00"
                value={addPrice}
                onChange={e => setAddPrice(e.target.value)}
              />
            </div>
            <div className="flex items-end gap-2 pb-0.5">
              <button
                onClick={handleAdd}
                disabled={saving || !addProductId || safeNum(addQty) <= 0}
                className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" /> Додати
              </button>
              <button
                onClick={() => { setShowAdd(false); setAddProductId(null); setAddProductName(''); setProductSearch('') }}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                Закрити
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
