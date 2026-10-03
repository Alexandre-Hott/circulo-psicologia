import { isCivilDate } from './calendarDate.js'

const fold = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const pad = value => String(value).padStart(2, '0')
const units = { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19 }
const tens = { vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90 }
const months = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

function number(value) {
  if (/^\d{1,4}$/.test(value)) return Number(value)
  if (Object.hasOwn(units, value)) return units[value]
  if (Object.hasOwn(tens, value)) return tens[value]
  const match = /^(vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa) e (um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove)$/.exec(value)
  return match ? tens[match[1]] + units[match[2]] : null
}

// Normalize only typed date/time controls. Never rewrite names or free text.
// No inferred year, relative dates, approximate time or ambiguous AM/PM.
export function normalizeVoiceFieldValue(type, value) {
  if (!['date', 'time'].includes(type) || value === '') return value
  const text = fold(value)
  if (type === 'date') {
    let date = text
    const numeric = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text)
    const spoken = /^(.+?) de ([a-z]+) de (.+)$/.exec(text)
    if (numeric) date = `${numeric[3]}-${pad(numeric[2])}-${pad(numeric[1])}`
    else if (spoken) {
      const day = spoken[1] === 'primeiro' ? 1 : number(spoken[1])
      const month = months.indexOf(spoken[2]) + 1
      const spokenYear = /^dois mil(?: e (.+))?$/.exec(spoken[3])
      const suffix = spokenYear ? (spokenYear[1] ? number(spokenYear[1]) : 0) : null
      const year = spokenYear ? (suffix === null || suffix > 99 ? null : 2000 + suffix) : (/^\d{4}$/.test(spoken[3]) ? Number(spoken[3]) : null)
      if (day === null || !month || year === null) return null
      date = `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`
    }
    return isCivilDate(date) ? date : null
  }
  if (/^\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(text)) {
    const [hour, minute, second = 0] = text.split(':').map(Number)
    return hour <= 23 && minute <= 59 && second < 60 ? text : null
  }
  if (text === 'meio-dia' || text === 'meio dia') return '12:00'
  if (text === 'meia-noite' || text === 'meia noite') return '00:00'
  const match = /^(?:as )?(.+?)(?: da (manha|tarde|noite))?$/.exec(text)
  if (!match) return null
  // A cardinal like "vinte e tres" is an hour; "quinze e trinta" is HH:MM.
  const explicit = /^(.+?) horas? e (.+?)(?: minutos?)?$/.exec(match[1])
  let hour = explicit ? number(explicit[1]) : number(match[1].replace(/ horas?$/, ''))
  let minute = explicit ? (explicit[2] === 'meia' ? 30 : number(explicit[2])) : 0
  if (!explicit && hour === null) {
    const parts = match[1].replace(/ minutos?$/, '').split(' e ')
    const candidates = []
    for (let index = 1; index < parts.length; index++) {
      const h = number(parts.slice(0, index).join(' e '))
      const remainder = parts.slice(index).join(' e ')
      const m = remainder === 'meia' ? 30 : number(remainder)
      if (h !== null && h <= 23 && m !== null && m <= 59) candidates.push({ hour: h, minute: m })
    }
    if (candidates.length !== 1) return null
    ;({ hour, minute } = candidates[0])
  }
  if (hour === null || minute === null || hour > 23 || minute > 59) return null
  if (match[2]) {
    if (hour < 1 || hour > 12) return null
    if (match[2] === 'manha') hour = hour === 12 ? 0 : hour
    else if (match[2] === 'tarde') hour = hour === 12 ? 12 : hour + 12
    else {
      // "três da noite" does not identify an unambiguous civil hour.
      if (hour < 6) return null
      hour = hour === 12 ? 0 : hour + 12
    }
  } else if (hour >= 1 && hour <= 12) return null
  return `${pad(hour)}:${pad(minute)}`
}
