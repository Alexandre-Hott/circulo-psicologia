import test from 'node:test'
import assert from 'node:assert/strict'
import { latestIndicatorSummary } from '../src/indicatorSummaryModel.js'
import { sessionsForPatient } from '../src/sessionTimelineModel.js'

test('profile indicators use only the latest patient session and its scale snapshot', () => {
  const catalog=[{id:'reg',name:'Nome atual',labels:['Atual 0','Atual 1']},{id:'com',name:'Comunicação atual',labels:['Atual 0','Atual 1']}]
  const older={id:'older',patientId:1,date:'2026-09-14',indicatorValues:{reg:0,com:1},indicatorSnapshots:[{id:'reg',name:'Nome antigo',labels:['Antigo 0','Antigo 1']},{id:'com',name:'Comunicação antiga',labels:['Antigo 0','Antigo 1']}]}
  const newer={id:'newer',patientId:1,date:'2026-09-21',indicatorValues:{reg:1},indicatorSnapshots:[{id:'reg',name:'Nome da sessão',labels:['Escala 0','Escala 1']},{id:'com',name:'Comunicação da sessão',labels:['Escala 0','Escala 1']}]}
  const other={id:'other',patientId:2,date:'2026-09-30',indicatorValues:{reg:0},indicatorSnapshots:[{id:'reg',name:'Outro paciente',labels:['Outro 0','Outro 1']}]}
  const summary=latestIndicatorSummary(sessionsForPatient([older,other,newer],1),catalog)
  assert.deepEqual(summary.map(row=>[row.name,row.label]),[['Nome da sessão','Escala 1'],['Comunicação da sessão','Sem registro']])
  assert.equal(older.indicatorValues.reg,0)
  assert.equal(older.indicatorSnapshots[0].labels[0],'Antigo 0')
  assert.equal(newer.indicatorValues.reg,1)
})

test('missing or unusable snapshot never invents a scale classification', () => {
  const catalog=[{id:'reg',name:'Regulação',labels:['A','B']}]
  assert.equal(latestIndicatorSummary([],catalog)[0].label,'Sem registro')
  assert.equal(latestIndicatorSummary([{indicatorValues:{reg:1}}],catalog)[0].label,'Sem registro')
  assert.equal(latestIndicatorSummary([{indicatorValues:{reg:3},indicatorSnapshots:[{id:'reg',name:'Regulação',labels:['A','B']}]}],catalog)[0].label,'Sem registro')
})
