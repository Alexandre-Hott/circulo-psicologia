import test from 'node:test'
import assert from 'node:assert/strict'
import { cancelOccurrence, rescheduleOccurrence } from '../src/calendarModel.js'
import { currentCivilDate, currentCivilTime } from '../src/calendarDate.js'
import { nextAppointmentForPatient, nextAppointmentLabel } from '../src/nextAppointmentModel.js'

const monday = { id:'monday', patientId:1, weekday:1, startDate:'2026-09-01', endDate:'', start:'14:30', end:'15:20', frequency:'Semanal', status:'Ativo', exceptions:{} }
const tuesday = { ...monday, id:'tuesday', patientId:2, weekday:2, start:'09:00', end:'09:50' }
const now = new Date('2026-09-21T16:00:00Z') // 13:00 in São Paulo

test('uses São Paulo civil date and time, independent of the machine time zone', () => {
  assert.equal(currentCivilDate(undefined,now),'2026-09-21')
  assert.equal(currentCivilTime(undefined,now),'13:00')
  assert.equal(nextAppointmentLabel(nextAppointmentForPatient([monday],1,now)), '21 de set. · 14:30')
  assert.equal(nextAppointmentForPatient([monday],1,new Date('2026-09-21T18:00:00Z')).date,'2026-09-28')
})

test('uses the effective date and time of a rescheduled occurrence', () => {
  const moved=rescheduleOccurrence(monday,'2026-09-21',{date:'2026-09-22',start:'10:00',end:'10:50'})
  const next=nextAppointmentForPatient([moved],1,now)
  assert.deepEqual([next.date,next.start,next.status],['2026-09-22','10:00','Remarcada'])
})

test('skips a canceled occurrence and selects the next active one', () => {
  const canceled=cancelOccurrence(monday,'2026-09-21','Cancelamento sintético')
  assert.equal(nextAppointmentForPatient([canceled],1,now).date,'2026-09-28')
})

test('shows no appointment for absent, inactive, or exhausted series', () => {
  assert.equal(nextAppointmentForPatient([],1,now),null)
  assert.equal(nextAppointmentForPatient([{...monday,status:'Inativo'}],1,now),null)
  assert.equal(nextAppointmentForPatient([{...monday,endDate:'2026-09-14'}],1,now),null)
  assert.equal(nextAppointmentLabel(null),'—')
})

test('patient isolation excludes earlier appointments belonging to another patient', () => {
  assert.equal(nextAppointmentForPatient([tuesday,monday],1,now).patientId,1)
  assert.equal(nextAppointmentForPatient([tuesday,monday],2,now).date,'2026-09-22')
  assert.equal(nextAppointmentForPatient([tuesday,monday],3,now),null)
})

test('finished occurrence is skipped without hiding another patient or an unfinished draft', () => {
  const occurrence=nextAppointmentForPatient([monday],1,now)
  const finalized={status:'Finalizada',patientId:1,appointmentSnapshot:{occurrenceId:occurrence.id}}
  assert.equal(nextAppointmentForPatient([monday],1,now,364,[finalized]).date,'2026-09-28')
  assert.equal(nextAppointmentForPatient([monday],1,now,364,[{...finalized,status:'Rascunho'}]).date,'2026-09-21')
  assert.equal(nextAppointmentForPatient([monday],1,now,364,[{...finalized,patientId:2}]).date,'2026-09-21')
})
