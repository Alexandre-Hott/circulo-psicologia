import test from 'node:test'
import assert from 'node:assert/strict'
import { AGENDA_ADMIN_REASON_MAX_LENGTH, assertNoIntroducedConflicts, calendarHistory, cancelOccurrence, canRestoreOccurrence, expandRecurringSeries, findMaterializedConflicts, occurrenceByIdentity, occurrenceConflicts, occursOn, rescheduleOccurrence, rescheduleSeries, restoreOccurrence, stopSeriesFromOccurrence } from '../src/calendarModel.js'

const series = { id:'s1', weekday:1, startDate:'2026-09-01', endDate:'', status:'Ativo', exceptions:{} }

test('weekly recurrence derives an occurrence without independent copies', () => {
  assert.equal(occursOn(series, '2026-09-21'), true)
  assert.equal(occursOn(series, '2026-09-22'), false)
})
test('cancellation requires a reason and remains an occurrence exception', () => {
  assert.throws(() => cancelOccurrence(series, '2026-09-21', ''), /obrigatório/)
  assert.equal(cancelOccurrence(series, '2026-09-21', 'Paciente indisposto').exceptions['2026-09-21'].status, 'Cancelado')
})
test('rescheduling is optional and preserves the original series', () => {
  const changed = rescheduleOccurrence(series, '2026-09-21', { date:'2026-09-22', start:'10:00', end:'10:50' })
  assert.equal(changed.weekday, 1)
  assert.equal(changed.exceptions['2026-09-21'].replacement.start, '10:00')
})
test('individual move may land on the inclusive end date but cannot disappear beyond it',()=>{
 const bounded={...series,patientId:1,start:'09:00',end:'09:50',modality:'Presencial',endDate:'2026-09-23'}
 const original=structuredClone(bounded)
 assert.throws(()=>rescheduleOccurrence(bounded,'2026-09-21',{date:'2026-09-24',start:'10:00',end:'10:50'}),/ultrapassa o fim da série/)
 assert.deepEqual(bounded,original)
 assert.equal(occurrenceByIdentity([bounded],'s1','2026-09-21').date,'2026-09-21')
 assert.deepEqual(calendarHistory([bounded]),[])
 const moved=rescheduleOccurrence(bounded,'2026-09-21',{date:'2026-09-23',start:'10:00',end:'10:50'})
 assert.equal(occurrenceByIdentity([moved],'s1','2026-09-21').date,'2026-09-23')
 assert.equal(expandRecurringSeries([moved],'2026-09-23','2026-09-23').length,1)
 assert.equal(moved.endDate,'2026-09-23')
 assert.throws(()=>rescheduleOccurrence(moved,'2026-09-21',{date:'2026-09-24',start:'10:00',end:'10:50'}),/ultrapassa o fim da série/)
 assert.equal(occurrenceByIdentity([moved],'s1','2026-09-21').date,'2026-09-23')
 const open=rescheduleOccurrence({...bounded,endDate:''},'2026-09-21',{date:'2026-09-24',start:'10:00',end:'10:50'})
 assert.equal(occurrenceByIdentity([open],'s1','2026-09-21').date,'2026-09-24')
})

test('stopping a weekly series cuts original identities without hiding an earlier moved occurrence', () => {
  const base={...series,patientId:1,start:'14:30',end:'15:20',frequency:'Semanal',modality:'Presencial'}
  const moved=rescheduleOccurrence(base,'2026-09-21',{date:'2026-10-06',start:'11:00',end:'11:50'})
  const stopped=stopSeriesFromOccurrence(moved,'2026-09-28','Fim sintético',new Date('2026-09-22T12:00:00Z'))
  assert.equal(stopped.stoppedFromOriginalDate,'2026-09-28')
  assert.equal(occurrenceByIdentity([stopped],'s1','2026-09-28'),null)
  assert.equal(occurrenceByIdentity([stopped],'s1','2026-09-21').date,'2026-10-06')
  assert.deepEqual(expandRecurringSeries([stopped],'2026-10-01','2026-10-31').map(item=>item.date),['2026-10-06'])
  assert.equal(calendarHistory([stopped]).some(item=>item.action==='Série encerrada'&&item.reason==='Fim sintético'),true)
  assert.equal(moved.stoppedFromOriginalDate,undefined)
})

test('stopping a fortnightly series removes the selected and later occurrences without deactivating its past', () => {
  const base={...series,start:'10:00',end:'10:50',frequency:'Quinzenal',modality:'Presencial'}
  const stopped=stopSeriesFromOccurrence(base,'2026-10-05','',new Date('2026-09-22T12:00:00Z'))
  assert.deepEqual(expandRecurringSeries([stopped],'2026-09-21','2026-10-31').map(item=>item.date),['2026-09-21'])
  assert.equal(stopped.status,'Ativo')
  assert.throws(()=>stopSeriesFromOccurrence(base,'2026-09-21','',new Date('2026-09-22T12:00:00Z')),/futuros/)
})

test('stopping retains an earlier cancellation and its history', () => {
  const base={...series,patientId:1,start:'10:00',end:'10:50',frequency:'Semanal',modality:'Presencial'}
  const canceled=cancelOccurrence(base,'2026-09-21','Ausência sintética')
  const stopped=stopSeriesFromOccurrence(canceled,'2026-09-28','',new Date('2026-09-22T12:00:00Z'))
  assert.equal(stopped.exceptions['2026-09-21'].status,'Cancelado')
  assert.equal(calendarHistory([stopped]).some(item=>item.action==='Ocorrência cancelada'&&item.reason==='Ausência sintética'),true)
  assert.deepEqual(expandRecurringSeries([stopped],'2026-09-21','2026-10-31'),[])
})

const appointment = { ...series, patientId:1, start:'14:30', end:'15:20', modality:'Presencial', frequency:'Semanal' }

test('new agenda reasons are trimmed and limited without rewriting legacy reasons',()=>{
 const short='  Ajuste administrativo  '
 const canceled=cancelOccurrence(appointment,'2026-09-21',short)
 assert.equal(canceled.exceptions['2026-09-21'].reason,'Ajuste administrativo')
 const individual=rescheduleOccurrence(appointment,'2026-09-21',{date:'2026-09-22',start:'10:00',end:'10:50',reason:short})
 assert.equal(individual.exceptions['2026-09-21'].reason,'Ajuste administrativo')
 const recurring=rescheduleSeries(appointment,'2026-09-21',{date:'2026-09-22',start:'10:00',end:'10:50',reason:short})
 assert.equal(recurring.changes[0].reason,'Ajuste administrativo')
 const stopped=stopSeriesFromOccurrence(appointment,'2026-09-21',short,new Date('2026-09-20T12:00:00Z'))
 assert.equal(stopped.stopHistory[0].reason,'Ajuste administrativo')
 const long='x'.repeat(AGENDA_ADMIN_REASON_MAX_LENGTH+1)
 assert.throws(()=>cancelOccurrence(appointment,'2026-09-21',long),/no máximo 240/)
 assert.throws(()=>rescheduleOccurrence(appointment,'2026-09-21',{date:'2026-09-22',start:'10:00',end:'10:50',reason:long}),/no máximo 240/)
 assert.throws(()=>rescheduleSeries(appointment,'2026-09-21',{date:'2026-09-22',start:'10:00',end:'10:50',reason:long}),/no máximo 240/)
 assert.throws(()=>stopSeriesFromOccurrence(appointment,'2026-09-21',long,new Date('2026-09-20T12:00:00Z')),/no máximo 240/)
 const legacyReason='legado '.repeat(50)
 const legacy={...appointment,exceptions:{'2026-09-14':{status:'Cancelado',reason:legacyReason,previous:{date:'2026-09-14',start:'14:30',end:'15:20'}}}}
 const updated=rescheduleOccurrence(legacy,'2026-09-21',{date:'2026-09-22',start:'10:00',end:'10:50',reason:'Novo'})
 assert.equal(calendarHistory([updated]).find(event=>event.originalDate==='2026-09-14').reason,legacyReason)
 assert.equal(legacy.exceptions['2026-09-14'].reason,legacyReason)
})

test('one rescheduled occurrence appears only at its new date and keeps original time as history', () => {
  const changed = rescheduleOccurrence(appointment, '2026-09-21', { date:'2026-09-23', start:'11:00', end:'11:50' })
  assert.deepEqual(expandRecurringSeries([changed], '2026-09-21', '2026-09-21'), [])
  const moved = expandRecurringSeries([changed], '2026-09-23', '2026-09-23')
  assert.equal(moved.length, 1)
  assert.deepEqual([moved[0].date, moved[0].originalDate, moved[0].start, moved[0].originalStart, moved[0].status], ['2026-09-23','2026-09-21','11:00','14:30','Remarcada'])
  assert.equal(occurrenceConflicts({date:'2026-09-23',start:'11:30',end:'12:00'},[changed]), true)
})

test('rescheduling a weekly series from one occurrence changes future dates without rewriting the past', () => {
  const changed = rescheduleSeries(appointment, '2026-09-21', { date:'2026-09-23', start:'10:00', end:'10:50' })
  assert.equal(expandRecurringSeries([changed], '2026-09-14', '2026-09-14')[0].status, 'Agendado')
  assert.deepEqual(expandRecurringSeries([changed], '2026-09-21', '2026-09-21'), [])
  const moved = expandRecurringSeries([changed], '2026-09-23', '2026-09-30')
  assert.deepEqual(moved.map(item => [item.date,item.originalDate,item.start,item.status]), [
    ['2026-09-23','2026-09-21','10:00','Remarcada'],
    ['2026-09-30','2026-09-28','10:00','Remarcada'],
  ])
})

test('fortnightly series keeps its two-week interval after rescheduling', () => {
  const fortnightly = { ...appointment, frequency:'Quinzenal' }
  assert.deepEqual(expandRecurringSeries([fortnightly], '2026-09-21', '2026-10-05').map(item => item.date), ['2026-09-21','2026-10-05'])
  const changed = rescheduleSeries(fortnightly, '2026-09-21', { date:'2026-09-22', start:'10:00', end:'10:50' })
  assert.deepEqual(expandRecurringSeries([changed], '2026-09-21', '2026-10-06').map(item => item.date), ['2026-09-22','2026-10-06'])
})

test('a moved series occurrence can be moved again while preserving its stable origin', () => {
  const changed = rescheduleSeries(appointment, '2026-09-21', { date:'2026-09-22', start:'10:00', end:'10:50' })
  const twice = rescheduleOccurrence(changed, '2026-09-21', { date:'2026-09-24', start:'11:00', end:'11:50' })
  assert.deepEqual(expandRecurringSeries([twice], '2026-09-22', '2026-09-22'), [])
  const moved = expandRecurringSeries([twice], '2026-09-24', '2026-09-24')[0]
  assert.deepEqual([moved.id,moved.date,moved.originalDate,moved.previousDate,moved.originalStart], ['s1:2026-09-21','2026-09-24','2026-09-21','2026-09-22','10:00'])
})

test('three individual exceptions keep priority across a series change between them', () => {
  let combined = rescheduleOccurrence(appointment, '2026-09-14', {date:'2026-09-16',start:'09:00',end:'09:50'})
  combined = rescheduleOccurrence(combined, '2026-09-28', {date:'2026-09-30',start:'09:30',end:'10:20'})
  combined = rescheduleOccurrence(combined, '2026-10-12', {date:'2026-10-14',start:'11:00',end:'11:50'})
  combined = rescheduleSeries(combined, '2026-09-21', {date:'2026-09-22',start:'10:00',end:'10:50'})
  combined = cancelOccurrence(combined, '2026-10-19', 'Ausência informada')
  const all = expandRecurringSeries([combined], '2026-09-14', '2026-10-27')
  assert.deepEqual(all.map(item => [item.date,item.originalDate,item.start]), [
    ['2026-09-16','2026-09-14','09:00'],
    ['2026-09-22','2026-09-21','10:00'],
    ['2026-09-30','2026-09-28','09:30'],
    ['2026-10-06','2026-10-05','10:00'],
    ['2026-10-14','2026-10-12','11:00'],
    ['2026-10-27','2026-10-26','10:00'],
  ])
  assert.equal(combined.status, 'Ativo')
  assert.equal(combined.exceptions['2026-10-19'].reason, 'Ausência informada')
  assert.equal(occurrenceConflicts({date:'2026-09-30',start:'10:00',end:'10:30'},[combined]),true)
  assert.equal(occurrenceConflicts({date:'2026-10-20',start:'10:00',end:'10:30'},[combined]),false)
  const september = expandRecurringSeries([combined], '2026-09-01', '2026-09-30')
  assert.deepEqual(september.filter(item=>item.date>='2026-09-14').map(item=>item.id),all.filter(item=>item.date<='2026-09-30').map(item=>item.id))
  const week = expandRecurringSeries([combined], '2026-09-20', '2026-09-26')
  assert.deepEqual(week,all.filter(item=>item.date>='2026-09-20'&&item.date<='2026-09-26'))
  for(const item of all){
    assert.deepEqual(expandRecurringSeries([combined],item.date,item.date).filter(dayItem=>dayItem.id===item.id),[item])
  }
})

test('cancellation overrides an individual move and keeps its prior history', () => {
  const moved = rescheduleOccurrence(appointment, '2026-09-21', {date:'2026-09-23',start:'09:00',end:'09:50'})
  const canceled = cancelOccurrence(moved, '2026-09-21', 'Profissional indisponível')
  assert.deepEqual(expandRecurringSeries([canceled], '2026-09-21', '2026-09-23'), [])
  assert.equal(canceled.exceptions['2026-09-21'].history[0].status, 'Remarcado')
  assert.equal(canceled.exceptions['2026-09-21'].previous.date, '2026-09-23')
  assert.throws(()=>rescheduleOccurrence(canceled,'2026-09-21',{date:'2026-09-24',start:'09:00',end:'09:50'}),/cancelada/)
  assert.equal(expandRecurringSeries([canceled], '2026-09-28', '2026-09-28').length,1)
})

test('restoring a canceled regular occurrence keeps its identity and cancellation history',()=>{
 const canceled=cancelOccurrence(appointment,'2026-09-21','Ausência informada')
 const restored=restoreOccurrence(canceled,'2026-09-21',{now:new Date('2026-09-20T12:00:00Z')})
 const occurrence=occurrenceByIdentity([restored],'s1','2026-09-21')
 assert.equal(occurrence.id,'s1:2026-09-21')
 assert.deepEqual([occurrence.date,occurrence.start,occurrence.end,occurrence.status],['2026-09-21','14:30','15:20','Agendado'])
 assert.deepEqual(calendarHistory([restored]).map(event=>event.action).sort(),['Ocorrência cancelada','Ocorrência restaurada'])
 assert.equal(calendarHistory([restored]).find(event=>event.action==='Ocorrência cancelada').reason,'Ausência informada')
 assert.equal(calendarHistory([restored]).find(event=>event.action==='Ocorrência cancelada').isCurrent,false)
 assert.equal(calendarHistory([restored]).find(event=>event.action==='Ocorrência restaurada').isCurrent,true)
 assert.equal(canceled.exceptions['2026-09-21'].status,'Cancelado')
})

test('restoring a canceled individual move recovers the exact moved slot and earlier events',()=>{
 const moved=rescheduleOccurrence(appointment,'2026-09-21',{date:'2026-09-23',start:'09:00',end:'09:50',reason:'Mudança anterior'})
 const canceled=cancelOccurrence(moved,'2026-09-21','Cancelamento posterior')
 const restored=restoreOccurrence(canceled,'2026-09-21',{now:new Date('2026-09-22T12:00:00Z')})
 const occurrence=occurrenceByIdentity([restored],'s1','2026-09-21')
 assert.deepEqual([occurrence.id,occurrence.date,occurrence.start,occurrence.end,occurrence.status],['s1:2026-09-21','2026-09-23','09:00','09:50','Remarcada'])
 assert.deepEqual(calendarHistory([restored]).map(event=>event.action).sort(),['Ocorrência cancelada','Ocorrência remarcada','Ocorrência restaurada'])
 assert.deepEqual(calendarHistory([restored]).map(event=>event.reason).filter(Boolean).sort(),['Cancelamento posterior','Mudança anterior'])
 const canceledAgain=cancelOccurrence(restored,'2026-09-21','Novo cancelamento')
 assert.deepEqual(canceledAgain.exceptions['2026-09-21'].previous,{date:'2026-09-23',start:'09:00',end:'09:50',status:'Remarcada'})
 const seriesChanged=rescheduleSeries(restored,'2026-09-21',{date:'2026-09-24',start:'11:00',end:'11:50'})
 assert.deepEqual([occurrenceByIdentity([seriesChanged],'s1','2026-09-21').date,occurrenceByIdentity([seriesChanged],'s1','2026-09-21').start],['2026-09-23','09:00'])
})

test('restoration rejects stale, past, stopped, or conflicting slots before mutation',()=>{
 const canceled=cancelOccurrence(appointment,'2026-09-21','Ausência')
 const future=new Date('2026-09-20T12:00:00Z')
 assert.equal(canRestoreOccurrence(canceled,'2026-09-21',future),true)
 assert.throws(()=>restoreOccurrence(appointment,'2026-09-21',{now:future}),/cancelamento vigente/)
 assert.throws(()=>restoreOccurrence(canceled,'2026-09-21',{now:new Date('2026-09-22T12:00:00Z')}),/futuro/)
 const stopped={...canceled,stoppedFromOriginalDate:'2026-09-21'}
 assert.equal(canRestoreOccurrence(stopped,'2026-09-21',future),false)
 assert.throws(()=>restoreOccurrence(stopped,'2026-09-21',{now:future}),/Série encerrada/)
 const stoppedAfter={...canceled,stoppedFromOriginalDate:'2026-09-28'}
 assert.equal(canRestoreOccurrence(stoppedAfter,'2026-09-21',future),false)
 assert.throws(()=>restoreOccurrence(stoppedAfter,'2026-09-21',{now:future}),/Série encerrada/)
 const ended={...canceled,endDate:'2026-09-20'}
 assert.equal(canRestoreOccurrence(ended,'2026-09-21',future),false)
 const other={...appointment,id:'other',patientId:2,start:'14:40',end:'15:30'}
 assert.throws(()=>restoreOccurrence(canceled,'2026-09-21',{now:future,seriesList:[canceled,other]}),/conflita/)
 assert.equal(canceled.exceptions['2026-09-21'].status,'Cancelado')
})

test('individual move cannot overlap another occurrence from the same series', () => {
  assert.throws(()=>rescheduleOccurrence(appointment,'2026-09-21',{date:'2026-09-28',start:'14:40',end:'15:10'}),/Conflito/)
})

test('materialized conflict validation uses active dates after moves and cancellation', () => {
  const monday = { ...appointment, start:'09:00', end:'09:50' }
  const tuesday = { ...appointment, id:'s2', weekday:2, patientId:2, start:'09:00', end:'09:50', endDate:'2026-09-22' }
  const moved = rescheduleOccurrence(monday,'2026-09-21',{date:'2026-09-22',start:'09:20',end:'10:00'})
  assert.throws(()=>assertNoIntroducedConflicts([monday,tuesday],[moved,tuesday],'2026-09-21','2026-09-22'),/Conflito/)
  assert.equal(occurrenceConflicts({date:'2026-09-21',start:'09:20',end:'09:40'},[moved]),false)
  const canceled = cancelOccurrence(tuesday,'2026-09-22','Teste sintético')
  assert.deepEqual(findMaterializedConflicts([moved,canceled],'2026-09-21','2026-09-22'),[])
  assert.doesNotThrow(()=>assertNoIntroducedConflicts([monday,canceled],[moved,canceled],'2026-09-21','2026-09-22'))
  assert.equal(occurrenceConflicts({date:'2026-09-22',start:'09:30',end:'09:40'},[canceled]),false)
})

test('series change is rejected when it overlaps a prior individual exception', () => {
  const individual = rescheduleOccurrence(appointment,'2026-09-14',{date:'2026-09-22',start:'10:00',end:'10:50'})
  const changed = rescheduleSeries(individual,'2026-09-21',{date:'2026-09-22',start:'10:00',end:'10:50'})
  assert.equal(findMaterializedConflicts([changed],'2026-09-14','2026-09-30').length,1)
  assert.throws(()=>assertNoIntroducedConflicts([individual],[changed],'2026-09-14','2026-09-30'),/Conflito/)
})

test('unchanged pre-existing conflict is not misreported as a new conflict', () => {
  const duplicate = {...appointment,id:'s2',patientId:2}
  const unrelated = {...appointment,id:'s3',patientId:3,weekday:3,start:'09:00',end:'09:50'}
  assert.equal(findMaterializedConflicts([appointment,duplicate],'2026-09-21','2026-09-21').length,1)
  assert.doesNotThrow(()=>assertNoIntroducedConflicts([appointment,duplicate],[appointment,duplicate,unrelated],'2026-09-21','2026-09-21'))
})

test('history distinguishes original and effective dates, action and reason', () => {
  const moved = rescheduleOccurrence(appointment,'2026-09-21',{date:'2026-09-23',start:'10:00',end:'10:50',reason:'Ajuste sintético'})
  const canceled = cancelOccurrence(moved,'2026-09-21','Sem atendimento sintético')
  const events = calendarHistory([canceled])
  assert.deepEqual(events.map(event=>[event.action,event.originalDate,event.effectiveDate,event.reason]).sort(),[
    ['Ocorrência cancelada','2026-09-21','2026-09-23','Sem atendimento sintético'],
    ['Ocorrência remarcada','2026-09-21','2026-09-23','Ajuste sintético'],
  ].sort())
})

test('revising a series at the same original date keeps both administrative events and applies the latest slot', () => {
  const first=rescheduleSeries(appointment,'2026-09-21',{date:'2026-09-22',start:'10:00',end:'10:50',reason:'Primeiro motivo'})
  const second=rescheduleSeries(first,'2026-09-21',{date:'2026-09-23',start:'11:00',end:'11:50',reason:'Segundo motivo'})
  assert.equal(second.changes.length,2)
  assert.deepEqual(second.changes.map(change=>change.reason),['Primeiro motivo','Segundo motivo'])
  const active=occurrenceByIdentity([second],second.id,'2026-09-21')
  assert.deepEqual([active.date,active.start,active.end],['2026-09-23','11:00','11:50'])
  assert.deepEqual(calendarHistory([second]).filter(event=>event.action==='Série remarcada').map(event=>event.reason).sort(),['Primeiro motivo','Segundo motivo'])
  const sameMillisecond={...second,changes:second.changes.map(change=>({...change,changedAt:'2026-09-21T00:00:00.000Z'}))}
  assert.deepEqual(calendarHistory([sameMillisecond]).filter(event=>event.action==='Série remarcada').map(event=>event.reason),['Segundo motivo','Primeiro motivo'])
})
