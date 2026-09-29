const civilDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(0)
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCFullYear(year, month - 1, day)
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? { year, month, day } : null
}

const daysInMonth = (year, month) => {
  const date = new Date(0)
  date.setUTCFullYear(year, month, 0)
  return date.getUTCDate()
}

export const inSupportedRange = (from, to) => {
  const first = civilDate(from)
  const last = civilDate(to)
  if (!first || !last || from > to) return false
  const limitYear = first.year + 5
  const limitDay = Math.min(first.day, daysInMonth(limitYear, first.month))
  const limit = `${String(limitYear).padStart(4, '0')}-${String(first.month).padStart(2, '0')}-${String(limitDay).padStart(2, '0')}`
  return to <= limit
}
