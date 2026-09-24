export const createLibraryItem = input => {
  const name=String(input.name??'').trim(),category=String(input.category??'').trim()
  if(!name)throw Object.assign(new Error('Informe um nome para o item.'),{field:'name'})
  if(!category)throw Object.assign(new Error('Informe uma categoria para o item.'),{field:'category'})
  return {...input,name,category,description:String(input.description??'').trim(),unit:String(input.unit??'').trim()}
}

export const searchLibraryItems = (items, query) => {
  const term=String(query??'').trim().toLocaleLowerCase('pt-BR')
  return term ? items.filter(item=>`${item.name} ${item.category}`.toLocaleLowerCase('pt-BR').includes(term)) : items
}

export const removeDraftOccurrence = (occurrences, occurrenceId, patientId) => occurrences.filter(occurrence => occurrence.id !== occurrenceId || occurrence.patientId !== patientId)

export const createOccurrence = ({ item, patientId, sessionId, date, values }) => ({
  id: crypto.randomUUID(),
  libraryItemId: item.id,
  itemSnapshot: {
    name: item.name,
    category: item.category,
    description: item.description,
    unit: item.unit || null,
    scale: item.scale == null ? null : structuredClone(item.scale),
    version: item.version,
  },
  patientId,
  sessionId,
  date,
  intensity: values.intensity ?? null,
  frequency: values.frequency ?? null,
  duration: values.duration ?? null,
  context: values.context || '',
  origin: values.origin || 'Observação do psicólogo',
  comment: values.comment || '',
})

export const archiveItem = item => ({ ...item, status: 'Arquivado', archivedAt: new Date().toISOString() })

export const restoreItem = item => item.status === 'Arquivado' ? ({ ...item, status:'Ativo', restoredAt:new Date().toISOString() }) : item

export const editItem = (item, patch) => {
  const fields=['name','category','description','unit']
  if(Object.keys(patch).some(field=>!fields.includes(field)))throw new Error('Campo inválido para edição da biblioteca.')
  const validated=createLibraryItem({...item,...patch})
  if(fields.every(field=>(item[field]??'')===validated[field]))return item
  return {...item,...Object.fromEntries(fields.map(field=>[field,validated[field]])),version:item.version+1,updatedAt:new Date().toISOString()}
}
