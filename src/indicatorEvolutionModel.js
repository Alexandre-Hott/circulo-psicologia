export const indicatorEvolution = (sortedPatientSessions, catalog) => catalog.map(indicator => ({
  id:indicator.id,
  name:indicator.name,
  entries:sortedPatientSessions.map(session => {
    const snapshot=session.indicatorSnapshots?.find(item=>item.id===indicator.id)
    const value=session.indicatorValues?.[indicator.id]
    const scaleLabels=Array.isArray(snapshot?.labels)?[...snapshot.labels]:[]
    const valid=Number.isInteger(value) && value>=0 && value<scaleLabels.length
    return { sessionId:session.id, date:session.date, name:snapshot?.name||indicator.name, version:snapshot?.version??null, value:valid?value:null, scaleLabels, label:valid?scaleLabels[value]:'Sem registro' }
  }),
}))
