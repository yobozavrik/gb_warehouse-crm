'use client'

import { Download } from 'lucide-react'
import * as XLSX from 'xlsx'

interface ExportColumn {
  key: string
  label: string
}

export function ExportButton({ data, filename, columns }: {
  data: any[]
  filename: string
  columns: ExportColumn[]
}) {
  const handleExport = () => {
    const rows = data.map(item => {
      const row: Record<string, any> = {}
      columns.forEach(col => {
        row[col.label] = item[col.key] ?? ''
      })
      return row
    })

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')

    const colWidths = columns.map(col => ({
      wch: Math.max(col.label.length, 15)
    }))
    ws['!cols'] = colWidths

    XLSX.writeFile(wb, `${filename}.xlsx`)
  }

  return (
    <button
      onClick={handleExport}
      className="flex items-center gap-2 border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
    >
      <Download className="w-4 h-4" />
      Експорт
    </button>
  )
}
