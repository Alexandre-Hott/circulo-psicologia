import test from 'node:test'
import assert from 'node:assert/strict'
import { indicatorEvolution } from '../src/indicatorEvolutionModel.js'
import { sessionsForPatient } from '../src/sessionTimelineModel.js'

test('evolution lists each patient session with its historical scale and missing values', () => {
  const catalog=[{id:'reg',name:'Nome atual',labels:['Atual 0','Atual 1']}]
  const sessions=[
    {id:'old',patientId:1,date:'2026-09-14',indicatorValues:{reg:0},indicatorSnapshots:[{id:'reg',name:'Nome antigo',version:1,labels:['Antigo 0','Antigo 1']}]},
    {id:'other',patientId:2,date:'2026-09-22',indicatorValues:{reg:1},indicatorSnapshots:[{id:'reg',name:'Outro nome',labels:['Outro 0','Outro 1']}]},
    {id:'new',patientId:1,date:'2026-09-21',indicatorValues:{},indicatorSnapshots:[{id:'reg',name:'Nome novo',version:2,labels:['Novo 0','Novo 1']}]},
  ]
  const [section]=indicatorEvolution(sessionsForPatient(sessions,1),catalog)
  assert.deepEqual(section.entries.map(entry=>[entry.date,entry.name,entry.version,entry.label]),[['2026-09-21','Nome novo',2,'Sem registro'],['2026-09-14','Nome antigo',1,'Antigo 0']])
  assert.deepEqual(section.entries.map(entry=>[entry.value,entry.scaleLabels]),[[null,['Novo 0','Novo 1']],[0,['Antigo 0','Antigo 1']]])
  assert.notEqual(section.entries[1].scaleLabels,sessions[0].indicatorSnapshots[0].labels)
  assert.equal(sessions[0].indicatorValues.reg,0)
  assert.deepEqual(indicatorEvolution([],catalog)[0].entries,[])
})

test('chart positions omit missing or out-of-scale values without borrowing current labels',()=>{
  const catalog=[{id:'reg',name:'Atual',labels:['Atual 0','Atual 1','Atual 2','Atual 3']}]
  const sessions=[
    {id:'zero',date:'2026-09-01',indicatorValues:{reg:0},indicatorSnapshots:[{id:'reg',name:'Antigo',version:1,labels:['A','B']}]},
    {id:'missing',date:'2026-09-02',indicatorValues:{},indicatorSnapshots:[{id:'reg',name:'Antigo',version:1,labels:['A','B']}]},
    {id:'invalid',date:'2026-09-03',indicatorValues:{reg:3},indicatorSnapshots:[{id:'reg',name:'Antigo',version:1,labels:['A','B']}]},
  ]
  const entries=indicatorEvolution(sessions,catalog)[0].entries
  assert.deepEqual(entries.map(entry=>entry.value),[0,null,null])
  assert.deepEqual(entries.map(entry=>entry.label),['A','Sem registro','Sem registro'])
  assert.ok(entries.every(entry=>entry.scaleLabels.length===2))
})
