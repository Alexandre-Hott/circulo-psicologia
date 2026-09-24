export const latestIndicatorSummary = (sortedPatientSessions, catalog) => {
  const latest=sortedPatientSessions[0]
  return catalog.map(indicator => {
    const snapshot=latest?.indicatorSnapshots?.find(item=>item.id===indicator.id)
    const value=latest?.indicatorValues?.[indicator.id]
    const valid=Number.isInteger(value) && value>=0 && value<(snapshot?.labels?.length||0)
    return { id:indicator.id, name:snapshot?.name||indicator.name, label:valid?snapshot.labels[value]:'Sem registro', date:latest?.date||null }
  })
}
