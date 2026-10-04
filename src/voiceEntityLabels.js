// Number only exact duplicate names; an option is a choice, never a new identity.
export function entityOptionSuffix(item, list) {
  const matches = list.filter(other => other.name === item.name)
  return matches.length > 1 ? ` · opção ${matches.findIndex(other => other.id === item.id) + 1}` : ''
}
