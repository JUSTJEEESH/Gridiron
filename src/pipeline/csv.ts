/**
 * Minimal RFC-4180 CSV parser — quoted fields, escaped quotes, CRLF.
 * nflverse ships plain CSVs; a dependency is not warranted for this.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
        } else {
          inQuotes = false
          i++
        }
      } else {
        field += c
        i++
      }
    } else if (c === '"') {
      inQuotes = true
      i++
    } else if (c === ',') {
      row.push(field)
      field = ''
      i++
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
    } else {
      field += c
      i++
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** Parse a CSV with a header row into records keyed by column name. */
export function parseCsvRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text)
  if (rows.length === 0) return []
  const header = rows[0]
  const out: Record<string, string>[] = []
  for (let r = 1; r < rows.length; r++) {
    // Skip blank trailing lines
    if (rows[r].length === 1 && rows[r][0] === '') continue
    const rec: Record<string, string> = {}
    for (let c = 0; c < header.length; c++) rec[header[c]] = rows[r][c] ?? ''
    out.push(rec)
  }
  return out
}

/** Numeric field: '', 'NA', or garbage becomes 0. */
export function num(v: string | undefined): number {
  if (v === undefined || v === '' || v === 'NA') return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
