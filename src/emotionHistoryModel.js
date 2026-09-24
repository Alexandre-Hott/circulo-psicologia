const NO_ANSWER_VALUES = new Set(['Não sei','Não quero responder'])

export const emotionHistoryForSession = (session, patientId) => {
  if (session.patientId !== patientId || session.status !== 'Finalizada') return null
  const emotions=(session.childEmotions || [])
    .filter(item => item?.name)
    .map(item => ({name:item.name,icon:item.icon || '',intensity:item.intensity}))
  if (emotions.length) return {kind:'selected',emotions}
  if (NO_ANSWER_VALUES.has(session.noAnswer)) return {kind:'noAnswer',value:session.noAnswer}
  return {kind:'none'}
}
