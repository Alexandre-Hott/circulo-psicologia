import { isCivilDate } from './calendarDate.js'
import { normalizeVoiceFieldValue } from './voiceFieldValue.js'

const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const pad = value => String(value).padStart(2, '0')
const weekdays = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado']
const spokenHours = { uma: 1, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20 }

const patientQuery = normalized => {
  const marker = /\b(?:pra|para)\s+/.exec(normalized)
  if (!marker) return ''
  const after = normalized.slice(marker.index + marker[0].length)
  return after.split(/[,.;]|\s+(?=(?:toda?|semanal|domingo|segunda|terca|quarta|quinta|sexta|sabado|as|dia|em|na|no)\b|\d{1,2}[/-]\d{1,2}\b|\d{1,2}(?::\d{2}|h)\b)/)[0].trim()
}

const parseDate = (normalized, referenceDate) => {
  const match = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?\b/.exec(normalized)
  if (!match) return { date: null, rest: normalized }
  const year = match[3] || referenceDate.slice(0, 4)
  const date = year + '-' + pad(match[2]) + '-' + pad(match[1])
  return { date: isCivilDate(date) ? date : null, invalid: !isCivilDate(date), rest: normalized.replace(match[0], ' ') }
}

const parseTime = normalized => {
  const marked = /\bas\s+(.+)$/u.exec(normalized)
  const numericStart = /\b\d{1,2}(?::\d+h?|h(?:\d+)?|(?=\s+(?:horas?\b|da\s+(?:manha|tarde|noite)\b)))/u.exec(normalized)
  const spokenPattern = new RegExp('\\b(?:' + Object.keys(spokenHours).join('|') + ')(?:\\s+e\\s+(?:uma|um|duas|dois|tres))?\\s+(?:horas?\\b|da\\s+(?:manha|tarde|noite)\\b)', 'u')
  const unmarked = numericStart || spokenPattern.exec(normalized)
  if (!marked && !unmarked) return null
  const phrase = (marked ? marked[1] : normalized.slice(unmarked.index)).trim().replace(/[.!?]+$/u, '')
  let value = phrase.replace(/^(\d{1,2})\s*(?:h|horas?)(?=\s|$)/u, '$1 horas')
    .replace(/^(\d{1,2})h([0-5]\d)$/u, '$1:$2')
    .replace(/^(\d{1,2}):([0-5]\d)\s*(?:h|horas?)?(?:\s+da\s+(manha|tarde|noite))?$/u,
      (_, hour, minute, period) => period ? `${hour} horas e ${minute} minutos da ${period}` : `${pad(hour)}:${minute}`)
  // Preserve the local parser's explicitly qualified early-night hours.
  const night = /^(\d{1,2}|[a-z]+)(?: horas?)?(?: e .+)? da noite$/u.exec(value)
  const nightHour = night && (/^\d+$/u.test(night[1]) ? Number(night[1]) : spokenHours[night[1]])
  if (nightHour >= 1 && nightHour < 6) value = value.replace(/ da noite$/u, ' da manha')
  const start = normalizeVoiceFieldValue('time', value)
  if (start === null) {
    const bareHour = value.replace(/(?: horas?)?(?: e meia)?$/u, '')
    const hour = /^\d{1,2}$/u.test(bareHour) ? Number(bareHour) : spokenHours[bareHour]
    return hour >= 1 && hour <= 12 ? { ambiguous: true } : { invalid: true }
  }
  if (!/^\d{2}:\d{2}$/u.test(start)) return { invalid: true }
  const [hour, minute] = start.split(':').map(Number)
  const endMinutes = hour * 60 + minute + 50
  if (endMinutes >= 24 * 60) return { invalid: true }
  return { start, end: pad(Math.floor(endMinutes / 60)) + ':' + pad(endMinutes % 60) }
}

export function parseVoiceAgendaCommand({ text, patients = [], referenceDate } = {}) {
  const transcript = String(text || '').trim()
  const normalized = fold(transcript)
  if (!isCivilDate(referenceDate)) return { intent: 'error', error: 'Data de referência inválida.', transcript }
  const verb = /\b(?:agendar|agende|marcar|marque|marca|criar|crie|cria|adicionar|adicione|adiciona)\b/.exec(normalized)
  if (!verb) return { intent: 'unknown', transcript }
  if (/\b(?:nao|nunca)\b/.test(normalized)) return { intent: 'error', error: 'Comando negado; nenhum campo foi alterado.', transcript }
  if (/\b(?:todo\s+dia|diari[oa])\b/.test(normalized)) return { intent: 'unknown', transcript }
  if (/\bquinzenal\b/.test(normalized)) return { intent: 'error', error: 'Recorrência quinzenal não é interpretada por comando. Preencha a série manualmente.', transcript }
  if (/\b(?:entre|ou|aproximadamente)\b|\bpor\s+volta\b|\bmais\s+ou\s+menos\b|\bdas\s+(?:\d{1,2}|[a-z]+\s+horas?)\b|\bas\s+\d{1,2}(?::\d{2})?\s+e\s+(?:as\s+)?\d{1,2}\b|\b\d{1,2}(?::\d{2}|h(?:\d{2})?)\s+e\s+\d{1,2}(?::\d{2}|h(?:\d{2})?)\b/.test(normalized)) return { intent: 'error', error: 'Horário aproximado, alternativo ou em intervalo não é suportado. Informe um início exato.', transcript }

  const recurring = /\bsemanal\b|\btoda\s+semana\b|\btod[ao]\s+(?:domingo|segunda|terca|quarta|quinta|sexta|sabado)\b/.test(normalized)
  const appointmentType = recurring ? 'Recorrente' : 'Avulsa'
  if ([...normalized.matchAll(/\b(?:domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira)?\b/g)].length > 1) return { intent: 'error', error: 'Informe apenas um dia da semana.', transcript }
  const weekdayMatch = /\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira)?\b/.exec(normalized)
  const weekday = weekdayMatch ? weekdays.indexOf(weekdayMatch[1]) : undefined
  const parsedDate = parseDate(normalized, referenceDate)
  if (parsedDate.invalid) return { intent: 'error', error: 'Data do compromisso inválida.', transcript }
  if (recurring && parsedDate.date) return { intent: 'error', error: 'Não combine data avulsa com recorrência semanal.', transcript }
  const time = parseTime(parsedDate.rest)
  if (time?.invalid) return { intent: 'error', error: 'Horário inválido ou término após meia-noite.', transcript }
  const validTime = time && !time.ambiguous

  const query = patientQuery(normalized)
  const matches = query ? patients.filter(item => fold(item.name) === query) : []
  const ambiguousPatients = matches.length > 1 ? matches.map(item => ({ id: item.id, name: item.name })) : []
  const missing = []
  if (matches.length !== 1) missing.push('patient')
  if (recurring && weekday == null) missing.push('weekday')
  if (!recurring && !parsedDate.date) missing.push('date')
  if (!validTime) missing.push('time')
  return {
    intent: 'create',
    ...(matches.length === 1 ? { patientId: matches[0].id } : {}),
    appointmentType,
    ...(recurring && weekday != null ? { weekday } : {}),
    ...(validTime ? { start: time.start, end: time.end } : {}),
    ...(time?.ambiguous ? { timeAmbiguous: true } : {}),
    startDate: parsedDate.date || referenceDate,
    modality: 'Presencial',
    missing,
    ambiguousPatients,
    transcript,
  }
}
