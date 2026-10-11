type QueryResult<T> = { data: T[] | null; error: { message: string } | null }

// A fresh query for each page avoids carrying a previous range into the next one.
// Continue until empty, including when the server caps a page below 500 rows.
export async function loadAllPayrollRows<T>(page: (from: number, to: number) => PromiseLike<QueryResult<T>>): Promise<QueryResult<T>> {
  const rows: T[] = []
  for (let offset = 0; ;) {
    const result = await page(offset, offset + 499)
    if (result.error) return { data: null, error: result.error }
    if (!result.data?.length) return { data: rows, error: null }
    rows.push(...result.data)
    offset += result.data.length
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
