export const summarizeDemoState = ({ patients, series, sessions, library, drafts }) => ({
  patients: patients.length,
  series: series.length,
  exceptions: series.reduce((total, item) => total + Object.keys(item.exceptions || {}).length, 0),
  seriesChanges: series.reduce((total, item) => total + (item.changes || []).length, 0),
  sessions: sessions.length,
  libraryItems: library.length,
  drafts: Object.keys(drafts).length,
})

export const emptyDemoState = () => ({ patients:[], series:[], sessions:[], library:[], drafts:{} })
