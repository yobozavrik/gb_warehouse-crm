'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Shield } from 'lucide-react'

export default function AuditPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [entityFilter, setEntityFilter] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      let q = supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(200)
      if (entityFilter) q = q.eq('entity_type', entityFilter)
      const { data } = await q
      if (!cancelled) { setLogs(data || []); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [entityFilter])

  const actionColors: Record<string, string> = {
    create: 'text-green-600', update: 'text-blue-600',
    delete: 'text-red-600', confirm: 'text-emerald-600',
    cancel: 'text-orange-600',
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Аудит</h1>
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          value={entityFilter} onChange={e => setEntityFilter(e.target.value)}
        >
          <option value="">Всі сутності</option>
          <option value="products">Товари</option>
          <option value="receipts">Накладні</option>
          <option value="orders">Заявки</option>
          <option value="shipments">Відвантаження</option>
          <option value="transfers">Переміщення</option>
          <option value="write_offs">Списання</option>
          <option value="inventories">Інвентаризації</option>
          <option value="stock_balances">Залишки</option>
          <option value="users">Користувачі</option>
        </select>
      </div>

      {loading ? <p className="text-gray-500">Завантаження...</p> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Час</th>
                  <th className="text-left px-4 py-3 font-medium">Дія</th>
                  <th className="text-left px-4 py-3 font-medium">Сутність</th>
                  <th className="text-left px-4 py-3 font-medium">ID</th>
                  <th className="text-left px-4 py-3 font-medium">Користувач</th>
                  <th className="text-left px-4 py-3 font-medium">Зміни</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-2 whitespace-nowrap text-gray-500">
                      {new Date(l.created_at).toLocaleString('uk-UA')}
                    </td>
                    <td className={`px-4 py-2 font-medium ${actionColors[l.action] || ''}`}>
                      {l.action}
                    </td>
                    <td className="px-4 py-2">{l.entity_type}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs font-mono">
                      {l.entity_id?.length > 20 ? l.entity_id.substring(0, 20) + '...' : l.entity_id}
                    </td>
                    <td className="px-4 py-2 text-gray-500">{l.user_name || '—'}</td>
                    <td className="px-4 py-2">
                      {l.changes ? (
                        <pre className="text-xs text-gray-600 max-w-xs overflow-hidden">
                          {JSON.stringify(l.changes).substring(0, 100)}
                        </pre>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {logs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Shield className="w-12 h-12 mb-2" /><p>Записів аудиту немає</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
