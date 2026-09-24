import { MODALITIES, normalizeSessionAttendance } from './modalityModel.js'
import { AGENDA_TIME_ZONE, addCivilDays, assertUsableLocalSlot, civilWeekday, isCivilDate } from './calendarDate.js'
import { expandRecurringSeries } from './calendarModel.js'
const time=t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t)
export const SERIES_ADMIN_NOTE_MAX_LENGTH=240
const normalizeSeriesAdminNote=notes=>{
 if(notes!=null&&typeof notes!=='string')throw new Error('Nota administrativa da agenda inválida.')
 const normalized=(notes||'').trim()
 if(normalized.length>SERIES_ADMIN_NOTE_MAX_LENGTH)throw new Error(`Nota administrativa da agenda deve ter no máximo ${SERIES_ADMIN_NOTE_MAX_LENGTH} caracteres.`)
 return normalized
}
export const updateSeriesAdminNote=(series,notes)=>({...series,notes:normalizeSeriesAdminNote(notes)})
export const createSeries=input=>{
 const notes=normalizeSeriesAdminNote(input.notes)
 const s={...input,notes,weekday:Number(input.weekday),frequency:input.frequency||'Semanal',endDate:input.endDate||null,meetingLink:input.meetingLink||null,timeZone:input.timeZone||AGENDA_TIME_ZONE}
 if(!(typeof s.patientId==='number'&&Number.isFinite(s.patientId)&&s.patientId!==0 || typeof s.patientId==='string'&&s.patientId.trim()!==''))throw new Error('Paciente inválido para a série.')
 if(!Number.isInteger(s.weekday)||s.weekday<0||s.weekday>6)throw new Error('Dia da semana inválido.')
 if(!['Semanal','Quinzenal'].includes(s.frequency))throw new Error('Frequência inválida.')
 if(!time(s.start)||!time(s.end)||s.start>=s.end)throw new Error('Horário inválido.')
 if(!isCivilDate(s.startDate)||s.endDate&&!isCivilDate(s.endDate)||s.endDate&&s.endDate<s.startDate)throw new Error('Intervalo de datas inválido.')
 if(!MODALITIES.includes(s.modality))throw new Error('Modalidade inválida.')
 const attendance=normalizeSessionAttendance(s)
 const firstDate=addCivilDays(s.startDate,(s.weekday-civilWeekday(s.startDate)+7)%7)
 if(s.endDate&&s.endDate<firstDate)throw new Error('Término anterior à primeira ocorrência da série.')
 assertUsableLocalSlot(firstDate,s.start,s.end,s.timeZone)
 return {...s,meetingLink:attendance.meetingLink}
}
export const conflicts=(candidate,existing,horizonDays=364)=>{
 if(candidate.status==='Arquivado'||candidate.status==='Inativo')return false
 const from=candidate.startDate,to=addCivilDays(from,horizonDays)
 const candidateOccurrences=expandRecurringSeries([{...candidate,status:candidate.status||'Ativo'}],from,to)
 const existingOccurrences=expandRecurringSeries(existing.map(series=>({...series,status:series.status||'Ativo'})),from,to)
 return candidateOccurrences.some(left=>existingOccurrences.some(right=>left.date===right.date&&left.start<right.end&&right.start<left.end))
}
