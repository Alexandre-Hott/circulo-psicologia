import test from 'node:test'
import assert from 'node:assert/strict'
import { finalizeSessionDraft } from '../src/sessionFinalizationModel.js'

test('finalization preserves patient ownership and private note without changing the draft', () => {
  const draft={date:'2026-09-22',summary:'Resumo fictício',privateNote:'Nota privada fictícia'}
  const finalized=finalizeSessionDraft(draft,2,'session-1','2026-09-22T12:00:00.000Z')
  assert.deepEqual({...finalized,indicatorSnapshots:undefined},{...draft,modality:'Presencial',meetingLink:null,attendanceSnapshot:{modality:'Presencial',meetingLink:null},patientId:2,id:'session-1',createdAt:'2026-09-22T12:00:00.000Z',indicatorSnapshots:undefined,status:'Finalizada'})
  assert.equal(finalized.indicatorSnapshots[0].name,'Regulação emocional')
  assert.equal(draft.patientId,undefined)
})

test('finalization rejects a draft owned by another patient before assigning the selected identity', () => {
  const draft={patientId:1,date:'2026-09-22',summary:'Resumo sintético de outro paciente'}
  assert.throws(()=>finalizeSessionDraft(draft,2,'wrong-owner'),/paciente/)
  assert.equal(draft.patientId,1)
})

test('invalid date fails before a finalized record can be created', () => {
  assert.throws(()=>finalizeSessionDraft({date:''},2,'session-2'),/data válida/)
  assert.throws(()=>finalizeSessionDraft({date:'2026-02-30'},2,'session-2'),/data válida/)
})

test('optional predicted times may be partial but cannot end before or at the start', () => {
  const base={date:'2026-09-22',start:'15:00',end:'14:00'}
  assert.throws(()=>finalizeSessionDraft(base,1,'invalid-time'),/fim previsto deve ser posterior/)
  assert.throws(()=>finalizeSessionDraft({...base,end:'15:00'},1,'equal-time'),/fim previsto deve ser posterior/)
  assert.equal(finalizeSessionDraft({...base,end:'15:50'},1,'valid-time').end,'15:50')
  assert.equal(finalizeSessionDraft({...base,end:''},1,'partial-time').start,'15:00')
  assert.equal(finalizeSessionDraft({...base,start:''},1,'other-partial-time').end,'14:00')
})

test('finalization rejects contradictory or invalid attendance references and snapshots a valid online link', () => {
  assert.throws(()=>finalizeSessionDraft({date:'2026-09-22',modality:'Presencial',meetingLink:'https://example.test'},1),/online/)
  assert.throws(()=>finalizeSessionDraft({date:'2026-09-22',modality:'Online',meetingLink:'javascript:alert(1)'},1),/HTTP ou HTTPS/)
  assert.throws(()=>finalizeSessionDraft({date:'2026-09-22',modality:'Online',meetingLink:'not a url'},1),/HTTP ou HTTPS/)
  const session=finalizeSessionDraft({date:'2026-09-22',modality:'Online',meetingLink:'  https://example.test/room  '},1,'online-1')
  assert.deepEqual(session.attendanceSnapshot,{modality:'Online',meetingLink:'https://example.test/room'})
  assert.equal(session.meetingLink,'https://example.test/room')
})

test('finalization rejects a behavior occurrence whose patient or date diverges from the session', () => {
  const base={date:'2026-09-22',behaviorOccurrences:[{id:'o1',patientId:1,date:'2026-09-22'}]}
  assert.equal(finalizeSessionDraft(base,1,'valid').behaviorOccurrences[0].id,'o1')
  assert.throws(()=>finalizeSessionDraft({...base,behaviorOccurrences:[{id:'o1',patientId:1,date:'2026-09-21'}]},1),/data diferente/)
  assert.throws(()=>finalizeSessionDraft({...base,behaviorOccurrences:[{id:'o1',patientId:2,date:'2026-09-22'}]},1),/paciente ou data/)
})
