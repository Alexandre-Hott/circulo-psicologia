export const AGENDA_TIME_ZONE = 'America/Sao_Paulo'
const DAY_MS = 86_400_000
const DAY_NAMES = ['dom.','seg.','ter.','qua.','qui.','sex.','sáb.']
const MONTH_NAMES = ['jan.','fev.','mar.','abr.','mai.','jun.','jul.','ago.','set.','out.','nov.','dez.']
const pad = value => String(value).padStart(2, '0')

export const parseCivilDate = value => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '')
  if (!match) return null
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  if (year < 1 || month < 1 || month > 12) return null
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31,leap ? 29 : 28,31,30,31,30,31,31,30,31,30,31][month - 1]
  return day >= 1 && day <= daysInMonth ? { year, month, day } : null
}
export const isCivilDate = value => Boolean(parseCivilDate(value))

export const civilDayNumber = value => {
  const civil = parseCivilDate(value)
  if (!civil) throw new Error('Data civil inválida.')
  let { year } = civil
  const { month, day } = civil
  year -= month <= 2 ? 1 : 0
  const era = Math.floor(year / 400)
  const yearOfEra = year - era * 400
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1
  const yearOfEraDay = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear
  return era * 146097 + yearOfEraDay - 719468
}

const civilFromDayNumber = number => {
  const shifted = number + 719468
  const era = Math.floor(shifted / 146097)
  const dayOfEra = shifted - era * 146097
  const yearOfEra = Math.floor((dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365)
  let year = yearOfEra + era * 400
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100))
  const monthPrime = Math.floor((5 * dayOfYear + 2) / 153)
  const day = dayOfYear - Math.floor((153 * monthPrime + 2) / 5) + 1
  const month = monthPrime + (monthPrime < 10 ? 3 : -9)
  year += month <= 2 ? 1 : 0
  return `${String(year).padStart(4,'0')}-${pad(month)}-${pad(day)}`
}

export const addCivilDays = (date, days) => civilFromDayNumber(civilDayNumber(date) + days)
export const civilDaysBetween = (start, end) => civilDayNumber(end) - civilDayNumber(start)
export const civilWeekday = date => ((civilDayNumber(date) + 4) % 7 + 7) % 7
export const civilMonthEnd = date => {
  const { year, month } = parseCivilDate(date) || {}
  if (!year) throw new Error('Data civil inválida.')
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`
  return addCivilDays(next, -1)
}
export const formatCivilDayLabel = date => `${DAY_NAMES[civilWeekday(date)]}, ${pad(parseCivilDate(date).day)}`
export const formatCivilShortDate = date => { const { day, month } = parseCivilDate(date); return `${pad(day)}/${pad(month)}` }
export const formatCivilSessionDate = date => { const civil = parseCivilDate(date); return civil ? `${pad(civil.day)} de ${MONTH_NAMES[civil.month - 1]}` : 'Data inválida' }
export const currentCivilDate = (timeZone = AGENDA_TIME_ZONE, now = new Date()) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type,part.value]))
  return `${parts.year.padStart(4,'0')}-${parts.month}-${parts.day}`
}
export const currentCivilTime = (timeZone = AGENDA_TIME_ZONE, now = new Date()) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type,part.value]))
  return `${parts.hour}:${parts.minute}`
}

const clockCache = new Map()
const partsAt = (formatter, instant) => Object.fromEntries(formatter.formatToParts(new Date(instant)).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]))
const clockMatches = (parts, civil, hour, minute) => parts.year === civil.year && parts.month === civil.month && parts.day === civil.day && parts.hour === hour && parts.minute === minute

export const classifyLocalTime = (date, time, timeZone = AGENDA_TIME_ZONE) => {
  const civil = parseCivilDate(date)
  if (!civil || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) throw new Error('Data ou horário local inválido.')
  const key = `${timeZone}|${date}|${time}`
  if (clockCache.has(key)) return clockCache.get(key)
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' })
  const [hour, minute] = time.split(':').map(Number)
  const anchor = new Date(0)
  anchor.setUTCFullYear(civil.year, civil.month - 1, civil.day)
  anchor.setUTCHours(hour, minute, 0, 0)
  const anchorMs = anchor.getTime()
  const offsets = new Set()
  for (const days of [-2,-1,0,1,2]) {
    const probeMs = anchorMs + days * DAY_MS
    const parts = partsAt(formatter, probeMs)
    const localMinutes = civilDayNumber(`${String(parts.year).padStart(4,'0')}-${pad(parts.month)}-${pad(parts.day)}`) * 1440 + parts.hour * 60 + parts.minute
    offsets.add(localMinutes - Math.floor(probeMs / 60000))
  }
  const matches = [...offsets].map(offset => anchorMs - offset * 60000).filter(instant => clockMatches(partsAt(formatter, instant), civil, hour, minute)).sort((a,b)=>a-b)
  const result = { status: matches.length === 0 ? 'inexistente' : matches.length > 1 ? 'ambíguo' : 'válido', timeZone, matches: matches.map(instant => new Date(instant).toISOString()) }
  clockCache.set(key, result)
  return result
}

export const localSlotStatus = (date, start, end, timeZone = AGENDA_TIME_ZONE) => {
  const first = classifyLocalTime(date, start, timeZone).status
  const last = classifyLocalTime(date, end, timeZone).status
  return first === 'inexistente' || last === 'inexistente' ? 'inexistente' : first === 'ambíguo' || last === 'ambíguo' ? 'ambíguo' : 'válido'
}
export const assertUsableLocalSlot = (date, start, end, timeZone = AGENDA_TIME_ZONE) => {
  const status = localSlotStatus(date, start, end, timeZone)
  if (status !== 'válido') throw new Error(`Horário local ${status} em ${date} (${timeZone}). Escolha outro horário.`)
}
