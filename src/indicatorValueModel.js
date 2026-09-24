export const clearIndicatorValue = (values, indicatorId) => {
  const next={...values}
  delete next[indicatorId]
  return next
}
