import { isCivilDate } from './calendarDate.js'

export const sessionsForPatient = (sessions, patientId) => sessions
  .filter(session => session.patientId === patientId)
  .sort((left,right) => {
    const leftValid=isCivilDate(left.date),rightValid=isCivilDate(right.date)
    if(leftValid!==rightValid)return leftValid?-1:1
    if(leftValid&&left.date!==right.date)return right.date.localeCompare(left.date)
    const byCreation=String(right.createdAt||'').localeCompare(String(left.createdAt||''))
    return byCreation || String(left.id).localeCompare(String(right.id))
  })

export const behaviorHistoryForSession = (session, patientId) => {
  if (session.patientId !== patientId || session.status !== 'Finalizada') return []
  return (session.behaviorOccurrences || [])
    .filter(occurrence => occurrence.patientId === patientId && occurrence.itemSnapshot?.name)
    .map(occurrence => ({
      id: occurrence.id,
      name: occurrence.itemSnapshot.name,
      category: occurrence.itemSnapshot.category || '',
      version: occurrence.itemSnapshot.version,
      ...(occurrence.date ? {date:occurrence.date} : {}),
      intensity: occurrence.intensity,
      frequency: occurrence.frequency,
      duration: occurrence.duration,
      context: occurrence.context,
    }))
}

export const templateHistoryForSession = (session, patientId) => {
  if (session.patientId !== patientId || session.status !== 'Finalizada' || !session.templateSnapshot) return null
  return {
    name:session.templateSnapshot.name,
    version:session.templateSnapshot.version,
    fields:(session.templateSnapshot.fields || [])
      .filter(field => String(session.templateFields?.[field.id] || '').trim())
      .map(field => ({id:field.id,label:field.label,value:session.templateFields[field.id]})),
  }
}

const detailFields = [
  ['arrived','Como o paciente chegou?'],
  ['companion','Responsável ou acompanhante'],
  ['observed','Emoções observadas'],
  ['behavior','Outros comportamentos relevantes'],
  ['context','Contexto e frequência'],
  ['activities','Atividades realizadas'],
  ['strategies','Estratégias utilizadas e resposta'],
  ['attention','Pontos de atenção'],
  ['nextSteps','Próximos passos'],
]

export const sessionDetailsForPatient = (session, patientId) => {
  if (session.patientId !== patientId || session.status !== 'Finalizada') return null
  const fields=detailFields
    .filter(([key]) => String(session[key] ?? '').trim())
    .map(([key,label]) => ({key,label,value:String(session[key])}))
  const indicatorNotes=Object.entries(session.indicatorNotes || {})
    .filter(([,value]) => String(value ?? '').trim())
    .map(([id,value]) => {
      const snapshot=session.indicatorSnapshots?.find(item=>item.id===id)
      return {id,name:snapshot?.name || `Indicador ${id}`,version:snapshot?.version ?? null,value:String(value)}
    })
  return fields.length || indicatorNotes.length ? {fields,indicatorNotes} : null
}
