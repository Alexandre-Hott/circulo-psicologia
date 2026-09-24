import test from 'node:test'
import assert from 'node:assert/strict'
import { assertDraftOccurrenceDates, changeStandaloneDraftDate } from '../src/sessionDateModel.js'

test('changing standalone draft date updates only this patient draft occurrences without mutating snapshots', () => {
  const own={id:'own',patientId:1,sessionId:'rascunho',date:'2026-09-21',itemSnapshot:{name:'Participação'}}
  const other={id:'other',patientId:2,sessionId:'rascunho',date:'2026-09-21',itemSnapshot:{name:'Comunicação'}}
  const finalized={id:'past',patientId:1,sessionId:'completed',date:'2026-09-21',itemSnapshot:{name:'Participação'}}
  const draft={date:'2026-09-21',behaviorOccurrences:[own,other,finalized]}
  const changed=changeStandaloneDraftDate(draft,1,'2026-09-22')
  assert.equal(changed.date,'2026-09-22')
  assert.deepEqual(changed.behaviorOccurrences.map(item=>item.date),['2026-09-22','2026-09-21','2026-09-21'])
  assert.equal(changed.behaviorOccurrences[0].id,own.id)
  assert.equal(changed.behaviorOccurrences[0].itemSnapshot,own.itemSnapshot)
  assert.equal(draft.date,'2026-09-21')
  assert.equal(own.date,'2026-09-21')
  assert.equal(changeStandaloneDraftDate({...draft,appointmentSnapshot:{originalDate:'2026-09-21'}},1,'2026-09-22').date,'2026-09-21')
})

test('finalization guard rejects occurrence ownership or date divergence', () => {
  const good={date:'2026-09-22',behaviorOccurrences:[{patientId:1,date:'2026-09-22'}]}
  assert.equal(assertDraftOccurrenceDates(good,1),good)
  assert.throws(()=>assertDraftOccurrenceDates({...good,behaviorOccurrences:[{patientId:1,date:'2026-09-21'}]},1),/data diferente/)
  assert.throws(()=>assertDraftOccurrenceDates({...good,behaviorOccurrences:[{patientId:2,date:'2026-09-22'}]},1),/paciente ou data/)
})
