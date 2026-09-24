import test from 'node:test';import assert from 'node:assert/strict';import {createSeries,conflicts,SERIES_ADMIN_NOTE_MAX_LENGTH,updateSeriesAdminNote} from '../src/recurringSeriesModel.js'
import {calendarHistory,expandRecurringSeries} from '../src/calendarModel.js'
import {draftForOccurrence} from '../src/appointmentSessionModel.js'
const base={patientId:1,weekday:1,start:'09:00',end:'09:50',startDate:'2026-09-01',modality:'Online'}
test('series accepts existing numeric or new string patient IDs and rejects orphan identities',()=>{
 assert.equal(createSeries(base).patientId,1)
 const uuid='c116d68d-b0e5-4d95-80d6-a951042bf5ea'
 assert.equal(createSeries({...base,patientId:uuid}).patientId,uuid)
 assert.equal(createSeries({...base,patientId:'legacy-id'}).patientId,'legacy-id')
 for(const patientId of [undefined,null,0,NaN,Infinity,-Infinity,'','  ',{},[]])assert.throws(()=>createSeries({...base,patientId}),/Paciente inválido/)
})
test('series normalizes optional values and accepts valid online link',()=>{const s=createSeries({...base,meetingLink:'  https://example.test/room  '});assert.equal(s.frequency,'Semanal');assert.equal(s.meetingLink,'https://example.test/room')})
test('administrative series note is optional, limited, and does not propagate to occurrences',()=>{
 assert.equal(createSeries(base).notes,'')
 const note='Confirmação por telefone'
 const series=createSeries({...base,id:'admin-note',status:'Ativo',notes:`  ${note}  `})
 assert.equal(series.notes,note)
 const occurrence=expandRecurringSeries([series],'2026-09-07','2026-09-07')[0]
 assert.equal(occurrence.notes,undefined)
 const draft=draftForOccurrence({},occurrence)
 assert.equal(draft.notes,undefined)
 assert.equal(draft.appointmentSnapshot.notes,undefined)
 assert.equal(calendarHistory([series]).length,0)
 assert.throws(()=>createSeries({...base,notes:'x'.repeat(SERIES_ADMIN_NOTE_MAX_LENGTH+1)}),/no máximo 240/)
 assert.throws(()=>createSeries({...base,notes:{text:note}}),/Nota administrativa da agenda inválida/)
})
test('editing or clearing an administrative note changes only that series field',()=>{
 const series=createSeries({...base,id:'note-series',status:'Ativo',notes:'Original',exceptions:{'2026-09-07':{status:'Cancelado',reason:'Agenda'}}})
 const snapshot=structuredClone(series)
 const edited=updateSeriesAdminNote(series,'  Atualizada  ')
 assert.equal(edited.notes,'Atualizada')
 assert.deepEqual({...edited,notes:series.notes},series)
 assert.equal(edited.exceptions,series.exceptions)
 assert.deepEqual(series,snapshot)
 const cleared=updateSeriesAdminNote(edited,'')
 assert.equal(cleared.notes,'')
 assert.deepEqual({...cleared,notes:series.notes},series)
 assert.throws(()=>updateSeriesAdminNote(series,'x'.repeat(SERIES_ADMIN_NOTE_MAX_LENGTH+1)),/no máximo 240/)
 assert.throws(()=>updateSeriesAdminNote(series,{}),/Nota administrativa da agenda inválida/)
})
test('series rejects invalid schedule interval and inappropriate link',()=>{assert.throws(()=>createSeries({...base,start:'10:00',end:'09:00'}),/Horário/);assert.throws(()=>createSeries({...base,modality:'Presencial',meetingLink:'https://x'}),/online/)})
test('series rejects unsafe protocols and malformed external references',()=>{
 for(const meetingLink of ['ftp://example.test/room','javascript:alert(1)','not-a-url'])assert.throws(()=>createSeries({...base,meetingLink}),/HTTP ou HTTPS/)
 assert.equal(createSeries({...base,meetingLink:'   '}).meetingLink,null)
})
test('optional end date includes its eligible occurrence and excludes later recurrences',()=>{
 const bounded=createSeries({...base,id:'bounded',status:'Ativo',endDate:'2026-09-14'})
 assert.deepEqual(expandRecurringSeries([bounded],'2026-09-01','2026-09-30').map(occurrence=>occurrence.date),['2026-09-07','2026-09-14'])
 const open=createSeries({...base,id:'open',status:'Ativo'})
 assert.equal(open.endDate,null)
 assert.deepEqual(expandRecurringSeries([open],'2026-09-01','2026-09-21').map(occurrence=>occurrence.date),['2026-09-07','2026-09-14','2026-09-21'])
 const fortnight=createSeries({...base,id:'fortnight',frequency:'Quinzenal',status:'Ativo',endDate:'2026-09-14'})
 assert.deepEqual(expandRecurringSeries([fortnight],'2026-09-01','2026-09-30').map(occurrence=>occurrence.date),['2026-09-07'])
 assert.throws(()=>createSeries({...base,endDate:'2026-08-31'}),/Intervalo de datas/)
 assert.throws(()=>createSeries({...base,endDate:'2026-09-06'}),/primeira ocorrência/)
})
test('overlapping active series conflict on same weekday',()=>{const a=createSeries(base),b=createSeries({...base,start:'09:30',end:'10:20'});assert.equal(conflicts(b,[a]),true);assert.equal(conflicts(createSeries({...base,start:'10:00',end:'10:30'}),[a]),false)})
test('equal weekday and time do not conflict when active date ranges are disjoint',()=>{
 const september=createSeries({...base,endDate:'2026-09-30'})
 const october=createSeries({...base,startDate:'2026-10-01'})
 assert.equal(conflicts(october,[september]),false)
})
test('fortnightly series on alternating weeks do not conflict',()=>{
 const first=createSeries({...base,frequency:'Quinzenal'})
 const alternating=createSeries({...base,startDate:'2026-09-08',frequency:'Quinzenal'})
 assert.equal(conflicts(alternating,[first]),false)
})
test('conflict uses effective occurrence after exceptions instead of raw weekday',()=>{
 const first=createSeries({...base,id:'first',status:'Ativo',endDate:'2026-09-07'})
 const canceled={...first,exceptions:{'2026-09-07':{status:'Cancelado',reason:'Teste'}}}
 const second=createSeries({...base,id:'second',startDate:'2026-09-07',endDate:'2026-09-07',status:'Ativo'})
 assert.equal(conflicts(second,[first]),true)
 assert.equal(conflicts(second,[canceled]),false)
})
