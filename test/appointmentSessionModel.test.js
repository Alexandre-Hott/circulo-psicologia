import test from 'node:test'
import assert from 'node:assert/strict'
import { assertCurrentAppointmentDraft, assertFinalizedOccurrencesUnchanged, assertNoLinkedDraftsRemoved, assertNoLinkedRecordsForRestoration, draftForOccurrence, hasFinalizedSessionForOccurrence } from '../src/appointmentSessionModel.js'
import { cancelOccurrence, occurrenceByIdentity, rescheduleOccurrence, rescheduleSeries, stopSeriesFromOccurrence } from '../src/calendarModel.js'

test('active and rescheduled occurrences prefill patient, effective local date and time', () => {
  const base={date:'2026-09-22',start:'',end:'',summary:''}
  const occurrence={id:'s1:2026-09-22',seriesId:'s1',patientId:2,originalDate:'2026-09-22',date:'2026-09-23',start:'10:00',end:'10:50',timeZone:'America/Sao_Paulo',modality:'Online',status:'Remarcada'}
  const draft=draftForOccurrence(base,occurrence)
  assert.deepEqual([draft.patientId,draft.date,draft.start,draft.end,draft.modality],[2,'2026-09-23','10:00','10:50','Online'])
  assert.deepEqual([draft.appointmentSnapshot.originalDate,draft.appointmentSnapshot.effectiveDate],['2026-09-22','2026-09-23'])
  assert.deepEqual([draft.appointmentSnapshot.modality,draft.appointmentSnapshot.status],['Online','Remarcada'])
  assert.deepEqual(base,{date:'2026-09-22',start:'',end:'',summary:''})
})

test('appointment origin stays a snapshot after later series changes', () => {
  const occurrence={id:'s1:2026-09-22',seriesId:'s1',patientId:1,originalDate:'2026-09-22',date:'2026-09-23',start:'10:00',end:'10:50',status:'Remarcada',modality:'Presencial',timeZone:'America/Sao_Paulo'}
  const draft=draftForOccurrence({},occurrence)
  occurrence.date='2026-09-30';occurrence.start='11:00';occurrence.status='Agendado'
  assert.deepEqual([draft.appointmentSnapshot.effectiveDate,draft.appointmentSnapshot.start,draft.appointmentSnapshot.status],['2026-09-23','10:00','Remarcada'])
})

test('online appointment reference is copied into the draft and origin, never into a presencial draft',()=>{
  const online={id:'s1:2026-09-28',seriesId:'s1',patientId:1,originalDate:'2026-09-28',date:'2026-09-28',start:'09:00',end:'09:50',status:'Agendado',modality:'Online',meetingLink:'https://example.test/room',timeZone:'America/Sao_Paulo'}
  const draft=draftForOccurrence({},online)
  assert.equal(draft.meetingLink,'https://example.test/room')
  assert.equal(draft.appointmentSnapshot.meetingLink,'https://example.test/room')
  online.meetingLink='https://example.test/changed'
  assert.equal(draft.appointmentSnapshot.meetingLink,'https://example.test/room')
  const presencial=draftForOccurrence({}, {...online,modality:'Presencial'})
  assert.equal(presencial.meetingLink,'')
  assert.equal(presencial.appointmentSnapshot.meetingLink,null)
})

test('canceled occurrence cannot create a draft', () => {
  assert.throws(()=>draftForOccurrence({}, {status:'Cancelado'}),/cancelada/)
})

test('restoration blocks saved drafts and finalized sessions linked to the same occurrence identity',()=>{
 const linked={appointmentSnapshot:{occurrenceId:'s1:2026-09-21',seriesId:'s1',originalDate:'2026-09-21'}}
 const unrelated={appointmentSnapshot:{occurrenceId:'s1:2026-09-28',seriesId:'s1',originalDate:'2026-09-28'}}
 assert.throws(()=>assertNoLinkedRecordsForRestoration({one:linked},[],'s1','2026-09-21'),/rascunho salvo/)
 assert.throws(()=>assertNoLinkedRecordsForRestoration({},[{...linked,status:'Finalizada'}],'s1','2026-09-21'),/sessão finalizada/)
 assert.equal(assertNoLinkedRecordsForRestoration({one:unrelated},[{...unrelated,status:'Finalizada'}],'s1','2026-09-21'),true)
})

test('only a finalized session for this patient and occurrence blocks another agenda start', () => {
  const occurrence={id:'s1:2026-09-21',patientId:1}
  assert.equal(hasFinalizedSessionForOccurrence([{status:'Rascunho',patientId:1,appointmentSnapshot:{occurrenceId:occurrence.id}}],occurrence),false)
  assert.equal(hasFinalizedSessionForOccurrence([{status:'Finalizada',patientId:2,appointmentSnapshot:{occurrenceId:occurrence.id}}],occurrence),false)
  assert.equal(hasFinalizedSessionForOccurrence([{status:'Finalizada',patientId:1,appointmentSnapshot:{occurrenceId:'s1:2026-09-28'}}],occurrence),false)
  assert.equal(hasFinalizedSessionForOccurrence([{status:'Finalizada',patientId:1,appointmentSnapshot:{occurrenceId:occurrence.id}}],occurrence),true)
})

test('agenda draft cannot finalize after its source occurrence is canceled or moved', () => {
  const series={id:'s1',patientId:1,weekday:1,startDate:'2026-09-01',endDate:'',start:'14:30',end:'15:20',frequency:'Semanal',status:'Ativo',exceptions:{}}
  const occurrence=occurrenceByIdentity([series],'s1','2026-09-21')
  const draft=draftForOccurrence({},occurrence)
  assert.equal(assertCurrentAppointmentDraft(draft,[series]),draft)
  assert.throws(()=>assertCurrentAppointmentDraft(draft,[cancelOccurrence(series,'2026-09-21','Cancelamento sintético')]),/não está mais ativa/)
  assert.throws(()=>assertCurrentAppointmentDraft(draft,[rescheduleOccurrence(series,'2026-09-21',{date:'2026-09-22',start:'10:00',end:'10:50'})]),/foi alterada/)
  for(const patch of [{date:'2026-09-22'},{start:'11:00'},{end:'11:50'},{modality:'Online'}]){
    assert.throws(()=>assertCurrentAppointmentDraft({...draft,...patch},[series]),/divergem da Agenda/)
  }
  assert.equal(draft.date,'2026-09-21')
  assert.equal(assertCurrentAppointmentDraft({},[]).appointmentSnapshot,undefined)
})

test('linked draft rejects an altered agenda reference but can keep an explicit session reference',()=>{
  const series={id:'s-online',patientId:1,weekday:1,startDate:'2026-09-01',endDate:'',start:'09:00',end:'09:50',frequency:'Semanal',modality:'Online',meetingLink:'https://example.test/room',status:'Ativo',exceptions:{}}
  const occurrence=occurrenceByIdentity([series],'s-online','2026-09-28')
  const draft=draftForOccurrence({},occurrence)
  assert.equal(assertCurrentAppointmentDraft(draft,[series]),draft)
  assert.throws(()=>assertCurrentAppointmentDraft(draft,[{...series,meetingLink:'https://example.test/changed'}]),/foi alterada/)
  const explicitSessionLink={...draft,meetingLink:'https://example.test/session'}
  assert.equal(assertCurrentAppointmentDraft(explicitSessionLink,[series]),explicitSessionLink)
  const completed={status:'Finalizada',patientId:1,appointmentSnapshot:draft.appointmentSnapshot}
  assert.throws(()=>assertFinalizedOccurrencesUnchanged([series],[{...series,meetingLink:'https://example.test/changed'}],[completed]),/sessão já finalizada/)
})

test('series changes cannot retroactively move a completed occurrence, but future-only changes remain possible', () => {
  const series={id:'s1',patientId:1,weekday:1,startDate:'2026-09-01',endDate:'',start:'14:30',end:'15:20',frequency:'Semanal',status:'Ativo',exceptions:{}}
  const completed=draftForOccurrence({},occurrenceByIdentity([series],'s1','2026-09-28'))
  const sessions=[{status:'Finalizada',patientId:1,appointmentSnapshot:completed.appointmentSnapshot}]
  const retroactive=rescheduleSeries(series,'2026-09-21',{date:'2026-09-22',start:'14:30',end:'15:20'})
  assert.throws(()=>assertFinalizedOccurrencesUnchanged([series],[retroactive],sessions),/sessão já finalizada/)
  assert.throws(()=>assertFinalizedOccurrencesUnchanged([series],[cancelOccurrence(series,'2026-09-28','Cancelamento sintético')],sessions),/sessão já finalizada/)
  const futureOnly=rescheduleSeries(series,'2026-10-05',{date:'2026-10-06',start:'14:30',end:'15:20'})
  assert.equal(assertFinalizedOccurrencesUnchanged([series],[futureOnly],sessions)[0],futureOnly)
  assert.equal(assertFinalizedOccurrencesUnchanged([series],[retroactive],[{status:'Finalizada',patientId:1}])[0],retroactive)
})

test('series stop must not remove finalized sessions or saved drafts linked to future occurrences', () => {
  const base={id:'s1',patientId:1,weekday:1,startDate:'2026-09-01',endDate:'',start:'14:30',end:'15:20',frequency:'Semanal',status:'Ativo',exceptions:{}}
  const stopped=stopSeriesFromOccurrence(base,'2026-09-28','',new Date('2026-09-22T12:00:00Z'))
  const future=draftForOccurrence({},occurrenceByIdentity([base],'s1','2026-10-05'))
  const past=draftForOccurrence({},occurrenceByIdentity([base],'s1','2026-09-21'))
  assert.throws(()=>assertFinalizedOccurrencesUnchanged([base],[stopped],[{status:'Finalizada',patientId:1,appointmentSnapshot:future.appointmentSnapshot}]),/sessão já finalizada/)
  assert.equal(assertFinalizedOccurrencesUnchanged([base],[stopped],[{status:'Finalizada',patientId:1,appointmentSnapshot:past.appointmentSnapshot}])[0],stopped)
  assert.throws(()=>assertNoLinkedDraftsRemoved({one:future},'s1','2026-09-28'),/rascunho salvo/)
  assert.equal(assertNoLinkedDraftsRemoved({one:past},'s1','2026-09-28').one,past)
})
