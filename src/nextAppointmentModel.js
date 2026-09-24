import { AGENDA_TIME_ZONE, addCivilDays, currentCivilDate, currentCivilTime, formatCivilSessionDate } from './calendarDate.js'
import { expandRecurringSeries } from './calendarModel.js'
import { hasFinalizedSessionForOccurrence } from './appointmentSessionModel.js'

export const nextAppointmentForPatient = (series, patientId, now = new Date(), horizonDays = 364, sessions = []) => {
  const today=currentCivilDate(AGENDA_TIME_ZONE,now),time=currentCivilTime(AGENDA_TIME_ZONE,now)
  const horizon=addCivilDays(today,horizonDays)
  return expandRecurringSeries(series.filter(item=>item.patientId===patientId),today,horizon).find(item=>(item.date>today || item.start>=time) && (item.clockStatus==='válido'||item.clockStatus==='não informado') && !hasFinalizedSessionForOccurrence(sessions,item)) || null
}

export const nextAppointmentLabel = occurrence => occurrence ? `${formatCivilSessionDate(occurrence.date)} · ${occurrence.start}` : '—'
