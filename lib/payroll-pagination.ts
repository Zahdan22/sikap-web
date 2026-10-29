type QueryResult<T> = { data: T[] | null; error: { message: string } | null; count?: number | null }

const PAYROLL_PAGE_SIZE = 500

// A fresh query for each page avoids carrying a previous range into the next one.
// Some projects cap an API response below the requested page size. When the
// query supplies a total count we can finish exactly at the last row; otherwise
// keep fetching until an empty page so payroll data can never be truncated.
export async function loadAllPayrollRows<T>(page: (from: number, to: number) => PromiseLike<QueryResult<T>>): Promise<QueryResult<T>> {
  const rows: T[] = []
  let total: number | null | undefined
  for (let offset = 0; ;) {
    const result = await page(offset, offset + PAYROLL_PAGE_SIZE - 1)
    if (result.error) return { data: null, error: result.error }
    if (total === undefined && typeof result.count === 'number') total = result.count
    const pageRows = result.data || []
    if (!pageRows.length) return { data: rows, error: null }
    rows.push(...pageRows)
    if (total !== undefined && total !== null && rows.length >= total) return { data: rows, error: null }
    offset += pageRows.length
  }
}

// Keep .in() URLs short, and paginate even within an ID batch.
export async function loadPayrollRowsForIds<T, Id>(ids: Id[], page: (ids: Id[], from: number, to: number) => PromiseLike<QueryResult<T>>): Promise<QueryResult<T>> {
  const rows: T[] = []
  for (let index = 0; index < ids.length; index += 100) {
    const result = await loadAllPayrollRows((from, to) => page(ids.slice(index, index + 100), from, to))
    if (result.error) return { data: null, error: result.error }
    rows.push(...result.data || [])
  }
  return { data: rows, error: null }
}
