'use client'

import writeExcelFile from 'write-excel-file/browser'

type ExportValue = string | number | boolean | null | undefined
type ExportRow = Record<string, ExportValue>

export async function exportRowsToExcel(rows: ExportRow[], sheetName: string, fileName: string) {
  if (rows.length === 0) {
    await writeExcelFile([[{ value: 'Tidak ada data', type: String }]], { sheet: sheetName }).toFile(fileName)
    return
  }

  const headers = Object.keys(rows[0])
  const sheetData = [
    headers.map((header) => ({ value: header, type: String, fontWeight: 'bold' as const })),
    ...rows.map((row) => headers.map((header) => {
      const value = row[header]
      if (typeof value === 'number') return { value, type: Number }
      if (typeof value === 'boolean') return { value, type: Boolean }
      return { value: value == null ? '' : String(value), type: String }
    })),
  ]

  await writeExcelFile(sheetData, { sheet: sheetName }).toFile(fileName)
}
