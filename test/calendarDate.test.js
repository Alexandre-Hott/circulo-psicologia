import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { AGENDA_TIME_ZONE, addCivilDays, civilDaysBetween, civilMonthEnd, civilWeekday, classifyLocalTime, currentCivilDate, formatCivilDayLabel, formatCivilSessionDate } from '../src/calendarDate.js'
import { createSeries } from '../src/recurringSeriesModel.js'
import { expandRecurringSeries, rescheduleOccurrence } from '../src/calendarModel.js'

test('civil calendar arithmetic keeps days and weekdays across leap years and DST', () => {
  assert.equal(AGENDA_TIME_ZONE, 'America/Sao_Paulo')
  assert.equal(addCivilDays('2024-02-28', 1), '2024-02-29')
  assert.equal(addCivilDays('2024-02-29', 1), '2024-03-01')
  assert.equal(addCivilDays('2026-03-08', -1), '2026-03-07')
  assert.equal(addCivilDays('2018-11-03', 1), '2018-11-04')
  assert.equal(civilDaysBetween('2026-03-01', '2026-04-01'), 31)
  assert.equal(civilMonthEnd('2024-02-11'), '2024-02-29')
  assert.equal(civilWeekday('2026-03-08'), 0)
  assert.equal(formatCivilDayLabel('2026-03-08'), 'dom., 08')
  assert.equal(formatCivilSessionDate('2026-03-08'), '08 de mar.')
  assert.equal(currentCivilDate('America/Sao_Paulo',new Date('2026-09-23T02:30:00Z')), '2026-09-22')
})

test('IANA local times identify gaps and folds without silently shifting the civil slot', () => {
  assert.equal(classifyLocalTime('2026-03-08', '02:30', 'America/New_York').status, 'inexistente')
  assert.equal(classifyLocalTime('2026-11-01', '01:30', 'America/New_York').status, 'ambíguo')
  assert.equal(classifyLocalTime('2026-11-01', '01:30', 'America/New_York').matches.length, 2)
  assert.equal(classifyLocalTime('2026-03-08', '03:30', 'America/New_York').status, 'válido')
  assert.equal(classifyLocalTime('2018-11-04', '00:30', 'America/Sao_Paulo').status, 'inexistente')
  assert.equal(classifyLocalTime('2018-02-17', '23:30', 'America/Sao_Paulo').status, 'ambíguo')
  assert.equal(classifyLocalTime('2018-02-17', '23:30', 'America/Sao_Paulo').matches.length, 2)
})

test('fortnightly leap-day end remains inclusive and a moved last occurrence appears once', () => {
  const series=createSeries({id:'leap',patientId:1,weekday:4,startDate:'2024-02-15',endDate:'2024-02-29',start:'10:00',end:'10:50',frequency:'Quinzenal',modality:'Presencial',status:'Ativo',timeZone:AGENDA_TIME_ZONE,exceptions:{}})
  assert.deepEqual(expandRecurringSeries([series],'2024-02-01','2024-03-31').map(item=>[item.id,item.date]),[['leap:2024-02-15','2024-02-15'],['leap:2024-02-29','2024-02-29']])
  const moved=rescheduleOccurrence(series,'2024-02-29',{date:'2024-02-28',start:'11:00',end:'11:50'})
  const month=expandRecurringSeries([moved],'2024-02-01','2024-02-29')
  const week=expandRecurringSeries([moved],'2024-02-25','2024-03-02')
  const day=expandRecurringSeries([moved],'2024-02-28','2024-02-28')
  assert.deepEqual(day,week)
  assert.deepEqual(day,month.filter(item=>item.date==='2024-02-28'))
  assert.deepEqual([day[0].id,day[0].date,day[0].originalDate,day[0].clockStatus],['leap:2024-02-29','2024-02-28','2024-02-29','válido'])
  assert.equal(month.filter(item=>item.id==='leap:2024-02-29').length,1)
})

test('new series and explicit moves reject nonexistent or ambiguous local times', () => {
  const base = { id:'dst', patientId:1, weekday:0, startDate:'2026-03-01', start:'02:30', end:'03:20', modality:'Presencial', status:'Ativo', timeZone:'America/New_York', exceptions:{} }
  assert.throws(() => createSeries({...base,startDate:'2026-03-08'}), /inexistente/)
  assert.throws(() => createSeries({...base,startDate:'2026-11-01',start:'01:30',end:'02:20'}), /ambíguo/)
  assert.throws(() => rescheduleOccurrence(base,'2026-03-01',{date:'2026-03-08',start:'02:30',end:'03:20'}), /inexistente/)
  assert.throws(() => rescheduleOccurrence(base,'2026-03-01',{date:'2026-11-01',start:'01:30',end:'02:20'}), /ambíguo/)
  const valid = createSeries({...base,start:'03:30',end:'04:20'})
  assert.equal(valid.timeZone, 'America/New_York')
})

test('future recurrence exposes a DST gap for review and month/week/day see the same slot', () => {
  const series = createSeries({id:'dst',patientId:1,weekday:0,startDate:'2026-03-01',start:'02:30',end:'03:20',modality:'Presencial',status:'Ativo',timeZone:'America/New_York',exceptions:{}})
  const month = expandRecurringSeries([series],'2026-03-01','2026-03-31')
  const week = expandRecurringSeries([series],'2026-03-08','2026-03-14')
  const day = expandRecurringSeries([series],'2026-03-08','2026-03-08')
  assert.deepEqual(week, day)
  assert.deepEqual(day, month.filter(item => item.date === '2026-03-08'))
  assert.deepEqual([day[0].date,day[0].originalDate,day[0].start,day[0].clockStatus], ['2026-03-08','2026-03-08','02:30','inexistente'])
})

test('host time zone does not change civil projections or conflict detection', () => {
  const moduleUrl = new URL('../src/calendarModel.js', import.meta.url).href
  const code = `import {expandRecurringSeries,findMaterializedConflicts,rescheduleOccurrence} from ${JSON.stringify(moduleUrl)};
    const first={id:'first',patientId:1,weekday:0,startDate:'2026-03-01',start:'02:30',end:'03:20',status:'Ativo',frequency:'Semanal',timeZone:'America/New_York',exceptions:{}};
    const second={...first,id:'second',patientId:2,start:'03:00',end:'03:50'};
    const moved=rescheduleOccurrence(first,'2026-03-15',{date:'2026-03-16',start:'03:00',end:'03:50'});
    const series=[moved,second];
    process.stdout.write(JSON.stringify({month:expandRecurringSeries(series,'2026-03-01','2026-03-31').map(x=>[x.id,x.date,x.originalDate,x.start,x.clockStatus]),week:expandRecurringSeries(series,'2026-03-08','2026-03-14').map(x=>x.id),day:expandRecurringSeries(series,'2026-03-08','2026-03-08').map(x=>x.id),conflicts:findMaterializedConflicts(series,'2026-03-01','2026-03-31').map(x=>[x.date,x.first.id,x.second.id])}));`
  const outputs = ['UTC','America/Los_Angeles','Pacific/Auckland'].map(zone => {
    const result = spawnSync(process.execPath,['--input-type=module','-e',code],{env:{...process.env,TZ:zone},encoding:'utf8'})
    assert.equal(result.status,0,`${zone}: ${result.stderr}`)
    return JSON.parse(result.stdout)
  })
  assert.deepEqual(outputs[0],outputs[1])
  assert.deepEqual(outputs[1],outputs[2])
  assert.ok(outputs[0].month.some(item => item[1] === '2026-03-08' && item[4] === 'inexistente'))
  assert.deepEqual(outputs[0].week,outputs[0].day)
  assert.ok(outputs[0].conflicts.length > 0)
})
