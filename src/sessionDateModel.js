export const changeStandaloneDraftDate = (draft, patientId, date) => {
  if(draft.appointmentSnapshot)return draft
  return {
    ...draft,
    date,
    behaviorOccurrences:(draft.behaviorOccurrences || []).map(occurrence =>
      occurrence.patientId===patientId && occurrence.sessionId==='rascunho'
        ? {...occurrence,date}
        : occurrence
    ),
  }
}

export const assertDraftOccurrenceDates = (draft, patientId) => {
  if((draft.behaviorOccurrences || []).some(occurrence => occurrence.patientId!==patientId || occurrence.date!==draft.date)){
    throw new Error('Há comportamento aplicado com paciente ou data diferente da sessão. Revise o rascunho antes de finalizar.')
  }
  return draft
}
