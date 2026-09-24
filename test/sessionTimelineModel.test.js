import test from 'node:test'
import assert from 'node:assert/strict'
import { behaviorHistoryForSession, sessionDetailsForPatient, sessionsForPatient, templateHistoryForSession } from '../src/sessionTimelineModel.js'
import { formatCivilSessionDate } from '../src/calendarDate.js'

test('patient timeline sorts by civil session date, then creation time and stable ID', () => {
  const sessions=[
    {id:'old',patientId:1,date:'2026-09-12',createdAt:'2026-09-22T11:00:00Z'},
    {id:'other',patientId:2,date:'2026-09-30'},
    {id:'tie-b',patientId:1,date:'2026-09-21',createdAt:'2026-09-22T12:00:00Z'},
    {id:'new',patientId:1,date:'2026-09-22',createdAt:'2026-09-20T12:00:00Z'},
    {id:'tie-a',patientId:1,date:'2026-09-21',createdAt:'2026-09-22T12:00:00Z'},
    {id:'invalid',patientId:1,date:'2026-02-30'},
  ]
  assert.deepEqual(sessionsForPatient(sessions,1).map(item=>item.id),['new','tie-a','tie-b','old','invalid'])
  assert.deepEqual(sessions.map(item=>item.id),['old','other','tie-b','new','tie-a','invalid'])
  assert.equal(formatCivilSessionDate('2026-02-30'),'Data inválida')
})

test('behavior history uses saved snapshots, excludes private data, and isolates patients', () => {
  const catalogItem={name:'Nome atual do catálogo',category:'Nova categoria',version:2}
  const session={patientId:1,status:'Finalizada',privateNote:'Não mostrar',behaviorOccurrences:[
    {id:'kept',patientId:1,itemSnapshot:{name:'Nome histórico',category:'Interação',version:1},intensity:0,frequency:'',duration:null,context:'Contexto sintético',privateNote:'Nunca mostrar'},
    {id:'other',patientId:2,itemSnapshot:{name:'Outro paciente',category:'Interação',version:1}},
  ]}
  assert.deepEqual(behaviorHistoryForSession(session,1),[{id:'kept',name:'Nome histórico',category:'Interação',version:1,intensity:0,frequency:'',duration:null,context:'Contexto sintético'}])
  assert.deepEqual(behaviorHistoryForSession(session,2),[])
  assert.equal(behaviorHistoryForSession({...session,status:'Rascunho'},1).length,0)
  catalogItem.name='Renomeado de novo'
  assert.equal(behaviorHistoryForSession(session,1)[0].name,'Nome histórico')
})

test('template history exposes only answered snapshot fields for the owning patient', () => {
  const session={patientId:1,status:'Finalizada',privateNote:'Privado',templateSnapshot:{name:'Avaliação inicial',version:1,fields:[{id:'demanda',label:'Demanda'},{id:'foco',label:'Foco'}]},templateFields:{demanda:'Resposta sintética',foco:'',privateNote:'Privado'}}
  assert.deepEqual(templateHistoryForSession(session,1),{name:'Avaliação inicial',version:1,fields:[{id:'demanda',label:'Demanda',value:'Resposta sintética'}]})
  assert.equal(templateHistoryForSession(session,2),null)
})

test('session details allow only filled non-private fields and snapshot indicator notes', () => {
  const session={patientId:1,status:'Finalizada',date:'2026-09-22',arrived:'Linha 1\nLinha 2',companion:' ',activities:'Atividade sintética',attention:'Atenção sintética',privateNote:'Segredo',summary:'Já exibido',indicatorNotes:{reg:'Nota de regulação',com:' '},indicatorSnapshots:[{id:'reg',name:'Regulação original',version:2}]}
  assert.deepEqual(sessionDetailsForPatient(session,1),{
    fields:[{key:'arrived',label:'Como o paciente chegou?',value:'Linha 1\nLinha 2'},{key:'activities',label:'Atividades realizadas',value:'Atividade sintética'},{key:'attention',label:'Pontos de atenção',value:'Atenção sintética'}],
    indicatorNotes:[{id:'reg',name:'Regulação original',version:2,value:'Nota de regulação'}],
  })
  assert.equal(sessionDetailsForPatient(session,2),null)
  assert.equal(sessionDetailsForPatient({...session,status:'Rascunho'},1),null)
  assert.equal(sessionDetailsForPatient({patientId:1,status:'Finalizada',privateNote:'Segredo'},1),null)
})
