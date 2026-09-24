import { AGENDA_TIME_ZONE, addCivilDays, assertUsableLocalSlot, civilDaysBetween, civilWeekday, currentCivilDate, currentCivilTime, isCivilDate, localSlotStatus } from './calendarDate.js'
const validTime = time => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
export const AGENDA_ADMIN_REASON_MAX_LENGTH=240
const normalizeAgendaReason=(reason,required=false)=>{
 if(reason!=null&&typeof reason!=='string')throw new Error('Motivo administrativo da Agenda inválido.')
 const normalized=(reason||'').trim()
 if(required&&!normalized)throw new Error('Motivo do cancelamento é obrigatório.')
 if(normalized.length>AGENDA_ADMIN_REASON_MAX_LENGTH)throw new Error(`Motivo administrativo da Agenda deve ter no máximo ${AGENDA_ADMIN_REASON_MAX_LENGTH} caracteres.`)
 return normalized
}
const intervalDays = series => series.frequency === 'Quinzenal' ? 14 : 7
export const addDays = addCivilDays

const firstOriginalDate = series => addDays(series.startDate, (Number(series.weekday) - civilWeekday(series.startDate) + 7) % 7)
const beforeStop = (series, originalDate) => !series.stoppedFromOriginalDate || originalDate < series.stoppedFromOriginalDate
const isOriginalSlot = (series, date) => isCivilDate(date) && series.status === 'Ativo' && date >= series.startDate && (!series.endDate || date <= series.endDate) && beforeStop(series,date) && civilWeekday(date) === Number(series.weekday) && civilDaysBetween(firstOriginalDate(series), date) % intervalDays(series) === 0
const activeChange = (series, originalDate) => [...(series.changes || [])].filter(change => change.effectiveDate <= originalDate).sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)).at(-1)

const projectSlot = (series, originalDate) => {
  const change = activeChange(series, originalDate)
  if (!change) return { date: originalDate, start: series.start, end: series.end, status: 'Agendado' }
  const slotsSinceChange = civilDaysBetween(change.effectiveDate, originalDate) / intervalDays(series)
  return { date: addDays(change.date, slotsSinceChange * intervalDays(series)), start: change.start, end: change.end, status: 'Remarcada' }
}

const assertSlot = (series, originalDate) => {
  if (!isOriginalSlot(series, originalDate)) throw new Error('A ocorrência original não existe nesta data.')
}
const assertReplacement = (series, replacement) => {
  if (!isCivilDate(replacement.date) || !validTime(replacement.start) || !validTime(replacement.end) || replacement.start >= replacement.end) throw new Error('Nova data ou horário inválido.')
  assertUsableLocalSlot(replacement.date, replacement.start, replacement.end, series.timeZone || AGENDA_TIME_ZONE)
}
const appendHistory = exception => exception ? [...(exception.history || []), { status: exception.status, replacement: exception.replacement, restoredSlot:exception.restoredSlot, previous: exception.previous, reason: exception.reason, changedAt: exception.changedAt }] : []

const restorationCandidate=(series,originalDate,now)=>{
 if(series?.stoppedFromOriginalDate)throw new Error('Série encerrada não permite restaurar ocorrências.')
 assertSlot(series,originalDate)
 const exception=series.exceptions?.[originalDate]
 if(exception?.status!=='Cancelado')throw new Error('Somente um cancelamento vigente pode ser restaurado.')
 const previous=exception.previous
 if(!previous)throw new Error('Horário anterior da ocorrência indisponível para restauração.')
 assertReplacement(series,previous)
 if(series.endDate&&previous.date>series.endDate)throw new Error('Horário anterior ultrapassa o fim da série.')
 const today=currentCivilDate(series.timeZone||AGENDA_TIME_ZONE,now),time=currentCivilTime(series.timeZone||AGENDA_TIME_ZONE,now)
 if(previous.date<today||previous.date===today&&previous.start<time)throw new Error('Somente uma ocorrência com horário efetivo futuro pode ser restaurada.')
 return previous
}
export const canRestoreOccurrence=(series,originalDate,now=new Date())=>{
 try{restorationCandidate(series,originalDate,now);return true}catch{return false}
}
export const restoreOccurrence=(series,originalDate,{now=new Date(),seriesList=[series]}={})=>{
 const previous=restorationCandidate(series,originalDate,now)
 if(occurrenceConflicts(previous,seriesList))throw new Error('O horário anterior conflita com outra ocorrência da Agenda.')
 const exception=series.exceptions[originalDate]
 const prior=exception.history?.at(-1)
 const restoredStatus=prior?.status==='Remarcado'||previous.status==='Remarcada'?'Remarcada':'Agendado'
 const restoredSlot={date:previous.date,start:previous.start,end:previous.end,status:restoredStatus}
 const restoredPrevious=restoredStatus==='Remarcada'?(prior?.status==='Remarcado'?prior.previous:{date:originalDate,start:series.start,end:series.end}):null
 return {...series,exceptions:{...series.exceptions,[originalDate]:{status:'Restaurado',restoredSlot,previous:restoredPrevious,reason:null,history:appendHistory(exception),changedAt:new Date().toISOString()}}}
}

export const cancelOccurrence = (series, originalDate, reason) => {
  const normalizedReason=normalizeAgendaReason(reason,true)
  assertSlot(series, originalDate)
  const priorException = series.exceptions?.[originalDate]
  const previous = priorException?.status === 'Remarcado' ? priorException.replacement : priorException?.status==='Restaurado'?priorException.restoredSlot:projectSlot(series, originalDate)
  return { ...series, exceptions: { ...series.exceptions, [originalDate]: { status: 'Cancelado', reason: normalizedReason, previous, history: appendHistory(priorException), changedAt: new Date().toISOString() } } }
}

export const rescheduleOccurrence = (series, originalDate, replacement) => {
  const reason=normalizeAgendaReason(replacement.reason)
  assertSlot(series, originalDate)
  assertReplacement(series, replacement)
  if (series.endDate && replacement.date > series.endDate) throw new Error('Nova data ultrapassa o fim da série.')
  const priorException = series.exceptions?.[originalDate]
  if (priorException?.status === 'Cancelado') throw new Error('Ocorrência cancelada não pode ser remarcada.')
  if (occurrenceConflicts(replacement, [series], `${series.id}:${originalDate}`)) throw new Error('Conflito de horário com outra ocorrência da série.')
  const previous = priorException?.status === 'Remarcado' ? priorException.replacement : priorException?.status==='Restaurado'?priorException.restoredSlot:projectSlot(series, originalDate)
  return { ...series, exceptions: { ...series.exceptions, [originalDate]: { status: 'Remarcado', replacement: { date: replacement.date, start: replacement.start, end: replacement.end }, previous, reason: reason || null, history: appendHistory(priorException), changedAt: new Date().toISOString() } } }
}

export const rescheduleSeries = (series, originalDate, replacement) => {
  const reason=normalizeAgendaReason(replacement.reason)
  assertSlot(series, originalDate)
  assertReplacement(series, replacement)
  if (replacement.date < originalDate) throw new Error('Nova data antecede o início da mudança da série.')
  if (series.endDate && replacement.date > series.endDate) throw new Error('Nova data ultrapassa o fim da série.')
  const changes = [...(series.changes || [])]
  changes.push({ effectiveDate: originalDate, date: replacement.date, start: replacement.start, end: replacement.end, reason: reason || null, changedAt: new Date().toISOString() })
  return { ...series, changes: changes.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)) }
}

export const stopSeriesFromOccurrence = (series, originalDate, reason = '', now = new Date()) => {
  const normalizedReason=normalizeAgendaReason(reason)
  assertSlot(series, originalDate)
  const occurrence=occurrenceByIdentity([series],series.id,originalDate)
  const today=currentCivilDate(series.timeZone || AGENDA_TIME_ZONE,now),time=currentCivilTime(series.timeZone || AGENDA_TIME_ZONE,now)
  if(originalDate<today||occurrence.date<today||occurrence.date===today&&occurrence.start<time)throw new Error('Escolha uma ocorrência cuja data original e horário efetivo ainda sejam futuros.')
  return {
    ...series,
    stoppedFromOriginalDate:originalDate,
    stopHistory:[...(series.stopHistory || []),{originalDate,reason:normalizedReason,changedAt:new Date().toISOString()}],
  }
}

const occurrenceForSlot = (series, originalDate) => {
  // Precedência por ocorrência: cancelamento > exceção individual > mudança da série > regra original.
  const exception = series.exceptions?.[originalDate]
  if (exception?.status === 'Cancelado') return null
  const scheduled = projectSlot(series, originalDate)
  const current = exception?.status === 'Remarcado' ? { ...exception.replacement, status: 'Remarcada' } : exception?.status==='Restaurado'?exception.restoredSlot:scheduled
  const previous = exception?.status === 'Remarcado'||exception?.status==='Restaurado'?exception.previous:scheduled.status === 'Remarcada' ? { date: originalDate, start: series.start, end: series.end } : null
  const timeZone = series.timeZone || AGENDA_TIME_ZONE
  return { id: `${series.id}:${originalDate}`, seriesId: series.id, patientId: series.patientId, date: current.date, originalDate, previousDate: previous?.date, start: current.start, end: current.end, originalStart: previous?.start, originalEnd: previous?.end, modality: series.modality, meetingLink:series.modality==='Online'?series.meetingLink||null:null, status: current.status, frequency: series.frequency || 'Semanal', timeZone, clockStatus: validTime(current.start) && validTime(current.end) ? localSlotStatus(current.date, current.start, current.end, timeZone) : 'não informado' }
}

export const occurrenceByIdentity = (seriesList, seriesId, originalDate) => {
  const series=seriesList.find(item=>item.id===seriesId)
  if(!series||!isOriginalSlot(series,originalDate))return null
  const occurrence=occurrenceForSlot(series,originalDate)
  return occurrence&&(!series.endDate||occurrence.date<=series.endDate)?occurrence:null
}

export const expandRecurringSeries = (seriesList, fromDate, toDate) => {
  if (!isCivilDate(fromDate) || !isCivilDate(toDate) || fromDate > toDate) throw new Error('Intervalo inválido.')
  const occurrences = []
  for (const series of seriesList) {
    if (series.status !== 'Ativo') continue
    for (let originalDate = firstOriginalDate(series); originalDate <= toDate && (!series.endDate || originalDate <= series.endDate) && beforeStop(series,originalDate); originalDate = addDays(originalDate, intervalDays(series))) {
      const occurrence = occurrenceForSlot(series, originalDate)
      if (occurrence && occurrence.date >= fromDate && occurrence.date <= toDate && (!series.endDate || occurrence.date <= series.endDate)) occurrences.push(occurrence)
    }
    for (const originalDate of Object.keys(series.exceptions || {})) {
      if (originalDate <= toDate || !isOriginalSlot(series, originalDate)) continue
      const occurrence = occurrenceForSlot(series, originalDate)
      if (occurrence && occurrence.date >= fromDate && occurrence.date <= toDate && (!series.endDate || occurrence.date <= series.endDate)) occurrences.push(occurrence)
    }
  }
  return occurrences.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.id.localeCompare(b.id))
}

export const occursOn = (series, date) => expandRecurringSeries([series], date, date).length > 0
export const occurrenceConflicts = (candidate, seriesList, excludeId) => expandRecurringSeries(seriesList, candidate.date, candidate.date).some(item => item.id !== excludeId && item.start < candidate.end && candidate.start < item.end)

export const findMaterializedConflicts = (seriesList, fromDate, toDate) => {
  const occurrences = expandRecurringSeries(seriesList, fromDate, toDate)
  const conflicts = []
  for (let left = 0; left < occurrences.length; left++) {
    for (let right = left + 1; right < occurrences.length && occurrences[right].date === occurrences[left].date && occurrences[right].start < occurrences[left].end; right++) {
      if (occurrences[left].id !== occurrences[right].id && occurrences[left].start < occurrences[right].end) conflicts.push({ date: occurrences[left].date, first: occurrences[left], second: occurrences[right] })
    }
  }
  return conflicts
}

const conflictKey = conflict => [conflict.date, conflict.first.id, conflict.first.start, conflict.first.end, conflict.second.id, conflict.second.start, conflict.second.end].join('|')
export const assertNoIntroducedConflicts = (beforeSeries, afterSeries, fromDate, toDate) => {
  const existing = new Set(findMaterializedConflicts(beforeSeries, fromDate, toDate).map(conflictKey))
  const introduced = findMaterializedConflicts(afterSeries, fromDate, toDate).find(conflict => !existing.has(conflictKey(conflict)))
  if (introduced) throw new Error(`Conflito de horário em ${introduced.date}: ${introduced.first.start}–${introduced.first.end} e ${introduced.second.start}–${introduced.second.end}.`)
  return afterSeries
}

export const calendarHistory = seriesList => seriesList.flatMap(series => [
  ...(series.stopHistory || []).map((stop,index) => ({id:`${series.id}:stop:${index}`,patientId:series.patientId,action:'Série encerrada',originalDate:stop.originalDate,effectiveDate:null,reason:stop.reason,changedAt:stop.changedAt})),
  ...(series.changes || []).map((change, index) => ({ id: `${series.id}:series:${index}`, patientId: series.patientId, action: 'Série remarcada', originalDate: change.effectiveDate, effectiveDate: change.date, start: change.start, end: change.end, reason: change.reason, changedAt: change.changedAt })),
  ...Object.entries(series.exceptions || {}).flatMap(([originalDate, exception]) => [...(exception.history || []), exception].map((record, index) => ({ id: `${series.id}:${originalDate}:${index}`, seriesId:series.id, isCurrent:index===(exception.history||[]).length, patientId: series.patientId, action: record.status === 'Cancelado' ? 'Ocorrência cancelada' : record.status==='Restaurado'?'Ocorrência restaurada':'Ocorrência remarcada', originalDate, effectiveDate: record.status === 'Cancelado' ? record.previous?.date || originalDate : record.status==='Restaurado'?record.restoredSlot?.date:record.replacement?.date, start: record.status === 'Cancelado' ? record.previous?.start : record.status==='Restaurado'?record.restoredSlot?.start:record.replacement?.start, end: record.status === 'Cancelado' ? record.previous?.end : record.status==='Restaurado'?record.restoredSlot?.end:record.replacement?.end, reason: record.reason, changedAt: record.changedAt }))),
]).sort((a, b) => (b.changedAt || '').localeCompare(a.changedAt || '') || b.id.localeCompare(a.id,undefined,{numeric:true}))
