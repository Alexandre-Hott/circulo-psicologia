import test from 'node:test'
import assert from 'node:assert/strict'
import { archiveItem, createLibraryItem, createOccurrence, editItem, removeDraftOccurrence, restoreItem, searchLibraryItems } from '../src/libraryModel.js'

const item = { id:'participacao', name:'Participação', category:'Interação', description:'Envolvimento.', version:1, status:'Ativo' }

test('occurrence preserves the applied catalog snapshot', () => {
  const occurrence = createOccurrence({ item, patientId:'p1', sessionId:'s1', date:'2026-09-22', values:{ intensity:2 } })
  const revised = editItem(item, { name:'Participação em grupo' })
  assert.equal(occurrence.itemSnapshot.name, 'Participação')
  assert.equal(occurrence.itemSnapshot.version, 1)
  assert.equal(revised.version, 2)
})

test('occurrence scale snapshot does not share the catalog array', () => {
  const source={...item,scale:['Não observado','Observado']}
  const occurrence=createOccurrence({item:source,patientId:'p1',sessionId:'s1',date:'2026-09-22',values:{}})
  source.scale[0]='Escala posterior'
  assert.deepEqual(occurrence.itemSnapshot.scale,['Não observado','Observado'])
  occurrence.itemSnapshot.scale[1]='Resposta antiga'
  assert.deepEqual(source.scale,['Escala posterior','Observado'])
})

test('archiving a catalog item does not modify a prior occurrence', () => {
  const occurrence = createOccurrence({ item, patientId:'p1', sessionId:'s1', date:'2026-09-22', values:{} })
  assert.equal(archiveItem(item).status, 'Arquivado')
  assert.equal(occurrence.itemSnapshot.name, 'Participação')
})

test('restoring an archived item preserves identity and historical occurrence snapshot', () => {
  const occurrence=createOccurrence({item,patientId:'p1',sessionId:'s1',date:'2026-09-22',values:{}})
  const archived=archiveItem(item)
  const restored=restoreItem(archived)
  assert.equal(restored.id,item.id)
  assert.equal(restored.version,item.version)
  assert.equal(restored.name,item.name)
  assert.equal(restored.archivedAt,archived.archivedAt)
  assert.equal(restored.status,'Ativo')
  assert.equal(restoreItem(item),item)
  assert.deepEqual(occurrence.itemSnapshot,{name:'Participação',category:'Interação',description:'Envolvimento.',unit:null,scale:null,version:1})
})

test('renaming trims whitespace and rejects an empty catalog name', () => {
  assert.equal(editItem(item,{name:'  Participação nova  '}).name,'Participação nova')
  assert.throws(()=>editItem(item,{name:'   '}),/Informe um nome/)
  assert.equal(item.name,'Participação')
})

test('editing existing catalog fields creates a new version without changing identity or old occurrence',()=>{
  const old=createOccurrence({item,patientId:'p1',sessionId:'s1',date:'2026-09-22',values:{}})
  const revised=editItem(item,{name:'  Participação em grupo  ',category:'  Cooperação  ',description:'  Nova descrição  ',unit:'  vezes  '})
  assert.deepEqual([revised.id,revised.name,revised.category,revised.description,revised.unit,revised.version,revised.status],['participacao','Participação em grupo','Cooperação','Nova descrição','vezes',2,'Ativo'])
  assert.deepEqual([old.itemSnapshot.name,old.itemSnapshot.category,old.itemSnapshot.description,old.itemSnapshot.unit,old.itemSnapshot.version],['Participação','Interação','Envolvimento.',null,1])
  assert.deepEqual([item.name,item.category,item.version],['Participação','Interação',1])
  const next=createOccurrence({item:revised,patientId:'p1',sessionId:'s2',date:'2026-09-23',values:{}})
  assert.deepEqual([next.itemSnapshot.category,next.itemSnapshot.unit,next.itemSnapshot.version],['Cooperação','vezes',2])
  assert.equal(editItem(revised,{name:revised.name,category:revised.category,description:revised.description,unit:revised.unit}),revised)
  assert.throws(()=>editItem(item,{category:'   '}),/categoria/)
  assert.throws(()=>editItem(item,{id:'outro'}),/Campo inválido/)
})

test('occurrence keeps local intensity, frequency and context without mutating catalog item', () => {
  const occurrence = createOccurrence({ item, patientId:'p1', sessionId:'s1', date:'2026-09-22', values:{ intensity:3, frequency:'2 vezes', context:'Durante atividade', comment:'Com apoio' } })
  assert.equal(occurrence.intensity, 3)
  assert.equal(occurrence.frequency, '2 vezes')
  assert.equal(occurrence.context, 'Durante atividade')
  assert.equal(item.description, 'Envolvimento.')
})

test('new library item requires meaningful name and category and trims all text fields', () => {
  assert.throws(()=>createLibraryItem({name:'   ',category:'Interação'}),/nome/)
  assert.throws(()=>createLibraryItem({name:'Teste',category:'   '}),/categoria/)
  assert.deepEqual(createLibraryItem({name:'  Novo item  ',category:'  Interação  ',description:'  Descrição  ',unit:'  vezes  '}),{name:'Novo item',category:'Interação',description:'Descrição',unit:'vezes'})
})

test('catalog search trims the query, matches name or category, and leaves items untouched', () => {
  const items=[item,{id:'calma',name:'Calma',category:'Regulação',status:'Arquivado'}]
  assert.deepEqual(searchLibraryItems(items,'  participação  '),[item])
  assert.deepEqual(searchLibraryItems(items,'REGULAÇÃO'),[items[1]])
  assert.deepEqual(searchLibraryItems(items,' sem resultado '),[])
  assert.equal(searchLibraryItems(items,'  '),items)
  assert.equal(items[1].status,'Arquivado')
})

test('removing a draft occurrence is isolated by id and patient without mutating snapshots', () => {
  const luna={id:'o1',patientId:1,itemSnapshot:{name:'Participação'}}
  const theo={id:'o1',patientId:2,itemSnapshot:{name:'Participação'}}
  const other={id:'o2',patientId:1,itemSnapshot:{name:'Comunicação'}}
  const original=[luna,theo,other]
  const next=removeDraftOccurrence(original,'o1',1)
  assert.deepEqual(next,[theo,other])
  assert.deepEqual(original,[luna,theo,other])
  assert.equal(luna.itemSnapshot.name,'Participação')
})
