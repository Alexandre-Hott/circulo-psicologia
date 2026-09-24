import { occurrenceByIdentity } from './calendarModel.js'

export const draftForOccurrence = (baseDraft, occurrence) => {
  if (!['Agendado','Remarcada'].includes(occurrence?.status)) throw new Error('Ocorrência cancelada ou indisponível não inicia sessão.')
  return {
    ...baseDraft,
    patientId:occurrence.patientId,
    date:occurrence.date,
    start:occurrence.start,
    end:occurrence.end,
    modality:occurrence.modality||'Presencial',
    meetingLink:occurrence.modality==='Online'?occurrence.meetingLink||'':'',
    appointmentSnapshot:{ occurrenceId:occurrence.id, seriesId:occurrence.seriesId, originalDate:occurrence.originalDate, effectiveDate:occurrence.date, start:occurrence.start, end:occurrence.end, modality:occurrence.modality||'Presencial', meetingLink:occurrence.modality==='Online'?occurrence.meetingLink||null:null, timeZone:occurrence.timeZone, status:occurrence.status },
  }
}

export const assertCurrentAppointmentDraft = (draft, seriesList) => {
  const origin=draft.appointmentSnapshot
  if(!origin)return draft
  const occurrence=occurrenceByIdentity(seriesList,origin.seriesId,origin.originalDate)
  if(!occurrence||occurrence.patientId!==draft.patientId)throw new Error('A ocorrência de origem não está mais ativa. Não finalize este rascunho como sessão da Agenda.')
  if(origin.occurrenceId!==occurrence.id||origin.effectiveDate!==occurrence.date||origin.start!==occurrence.start||origin.end!==occurrence.end||origin.modality!==(occurrence.modality||'Presencial')||(origin.meetingLink??null)!==(occurrence.meetingLink??null)||origin.timeZone!==occurrence.timeZone||origin.status!==occurrence.status)throw new Error('A ocorrência de origem foi alterada. Inicie uma sessão atualizada pela Agenda antes de finalizar.')
  if(draft.date!==origin.effectiveDate||draft.start!==origin.start||draft.end!==origin.end||(draft.modality||'Presencial')!==origin.modality)throw new Error('Data, horário ou modalidade do rascunho divergem da Agenda. Remarque na Agenda e inicie uma nova sessão; este rascunho foi preservado.')
  return draft
}

export const hasFinalizedSessionForOccurrence = (sessions, occurrence) => sessions.some(session =>
  session.status === 'Finalizada' &&
  session.patientId === occurrence.patientId &&
  session.appointmentSnapshot?.occurrenceId === occurrence.id
)

export const assertNoLinkedRecordsForRestoration=(drafts,sessions,seriesId,originalDate)=>{
 const occurrenceId=`${seriesId}:${originalDate}`
 const linked=record=>record?.appointmentSnapshot&&(record.appointmentSnapshot.occurrenceId===occurrenceId||record.appointmentSnapshot.seriesId===seriesId&&record.appointmentSnapshot.originalDate===originalDate)
 if(Object.values(drafts).some(linked))throw new Error('Há um rascunho salvo vinculado a esta ocorrência. Conclua ou descarte o rascunho antes de restaurar.')
 if(sessions.some(session=>session.status==='Finalizada'&&linked(session)))throw new Error('Há uma sessão finalizada vinculada a esta ocorrência; não é possível restaurá-la.')
 return true
}

export const assertFinalizedOccurrencesUnchanged = (beforeSeries, afterSeries, sessions) => {
  for(const session of sessions){
    if(session.status!=='Finalizada'||!session.appointmentSnapshot)continue
    const {seriesId,originalDate}=session.appointmentSnapshot
    const before=occurrenceByIdentity(beforeSeries,seriesId,originalDate)
    const after=occurrenceByIdentity(afterSeries,seriesId,originalDate)
    const fields=['id','patientId','date','start','end','modality','meetingLink','timeZone','status']
    if(fields.some(field=>before?.[field]!==after?.[field]))throw new Error('Não é possível alterar uma ocorrência com sessão já finalizada. Faça mudanças da série a partir de uma ocorrência futura.')
  }
  return afterSeries
}

export const assertNoLinkedDraftsRemoved = (drafts, seriesId, firstRemovedOriginalDate) => {
  if (Object.values(drafts).some(draft => draft?.appointmentSnapshot?.seriesId === seriesId && draft.appointmentSnapshot.originalDate >= firstRemovedOriginalDate)) {
    throw new Error('Há um rascunho salvo ligado a uma ocorrência que seria removida. Conclua ou descarte esse rascunho antes de encerrar a série.')
  }
  return drafts
}
