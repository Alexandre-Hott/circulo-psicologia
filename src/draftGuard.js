const textFields = ['start','end','arrived','companion','observed','behavior','context','activities','strategies','summary','attention','nextSteps','privateNote','meetingLink']

export const hasDraftContent = (draft, initialDate) => Boolean(
  textFields.some(key => String(draft[key] || '').trim()) ||
  (draft.childEmotions || []).length ||
  draft.noAnswer ||
  (draft.behaviorOccurrences || []).length ||
  Object.keys(draft.indicatorValues || {}).length ||
  Object.values(draft.indicatorNotes || {}).some(value => String(value || '').trim()) ||
  draft.templateSnapshot ||
  (draft.modality && draft.modality !== 'Presencial') ||
  (draft.date && draft.date !== initialDate) ||
  (draft.duration && draft.duration !== '50')
)

export const shouldGuardDraftExit = (draft, savedDraft, initialDate) =>
  hasDraftContent(draft, initialDate) || Boolean(savedDraft && JSON.stringify(draft) !== JSON.stringify(savedDraft))
