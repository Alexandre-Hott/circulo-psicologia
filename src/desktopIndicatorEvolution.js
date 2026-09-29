// Compare records only when identity, version and saved labels are identical.
// No score, trend, interpretation or private draft content enters this view.
export const groupIndicatorHistory = sessions => {
  const groups = new Map()
  for (const session of sessions) {
    for (const snapshot of session.indicators || []) {
      const key = JSON.stringify([snapshot.id, snapshot.version, snapshot.labels])
      if (!groups.has(key)) groups.set(key, {
        key, id: snapshot.id, name: snapshot.name, definition: snapshot.definition,
        version: snapshot.version, labels: [...snapshot.labels], records: [],
      })
      groups.get(key).records.push({
        sessionId: session.id, date: session.sessionDate,
        value: snapshot.value,
        label: snapshot.value == null ? 'Sem registro' : snapshot.labels[snapshot.value],
        note: snapshot.note || null,
      })
    }
  }
  return [...groups.values()].map(group => ({
    ...group,
    records: group.records.sort((a, b) => a.date.localeCompare(b.date) || String(a.sessionId).localeCompare(String(b.sessionId))),
  }))
}
