import { isCivilDate } from './calendarDate.js'
import { INDICATORS, snapshotIndicators } from './indicatorCatalog.js'
import { normalizeSessionAttendance } from './modalityModel.js'
import { assertDraftOccurrenceDates } from './sessionDateModel.js'

export const finalizeSessionDraft = (draft, patientId, id = crypto.randomUUID(), createdAt = new Date().toISOString()) => {
  if (!patientId || !isCivilDate(draft.date)) throw new Error('Informe uma data válida antes de finalizar a sessão.')
  if (draft.patientId != null && draft.patientId !== patientId) throw new Error('O rascunho pertence a outro paciente. Revise o perfil antes de finalizar.')
  if (draft.start && draft.end && draft.start >= draft.end) throw new Error('O fim previsto deve ser posterior ao início previsto. Volte ao início e corrija os horários.')
  assertDraftOccurrenceDates(draft,patientId)
  const attendance=normalizeSessionAttendance(draft)
  return { ...draft, ...attendance, attendanceSnapshot:{...attendance}, patientId, id, createdAt, indicatorSnapshots:snapshotIndicators(INDICATORS), status:'Finalizada' }
}
