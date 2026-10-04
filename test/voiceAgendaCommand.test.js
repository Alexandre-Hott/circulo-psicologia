import test from 'node:test'
import assert from 'node:assert/strict'
import { parseVoiceAgendaCommand } from '../src/voiceAgendaCommand.js'

const referenceDate = '2026-09-30'
const patients = [
  { id: 'p1', name: 'Ana María Souza' },
  { id: 'p2', name: 'João Silva' },
  { id: 'p3', name: 'João Silva' },
  { id: 'p4', name: 'Ana' },
]
const parse = text => parseVoiceAgendaCommand({ text, patients, referenceDate })

test('weekly command resolves full accent-insensitive name, weekday and 50-minute slot', () => {
  assert.deepEqual(parse('Agendar semanal para ANA MARIA SOUZA na quinta às 15'), {
    intent: 'create', patientId: 'p1', appointmentType: 'Recorrente', weekday: 4,
    start: '15:00', end: '15:50', startDate: referenceDate, modality: 'Presencial',
    missing: [], ambiguousPatients: [], transcript: 'Agendar semanal para ANA MARIA SOUZA na quinta às 15',
  })
  assert.equal(parse('Marque toda quinta-feira pra Ana María Souza 15h').weekday, 4)
})

test('local weekly command consumes quinze horas e quarenta e cinco completely', () => {
  const result = parse('Marcar semanal para Ana quinta às quinze horas e quarenta e cinco')
  assert.equal(result.intent, 'create')
  assert.equal(result.patientId, 'p4')
  assert.equal(result.start, '15:45')
  assert.equal(result.end, '16:35')
  assert.deepEqual(result.missing, [])
})

test('local scheduling preserves complete minutes, duration and midnight boundary', () => {
  for (const qualifier of ['semanal para Ana quinta', 'para Ana dia 05/10/2026']) {
    for (const [time, start, end] of [
      ['quinze e quarenta e cinco', '15:45', '16:35'],
      ['quinze horas e quarenta e cinco minutos', '15:45', '16:35'],
      ['três e meia da tarde', '15:30', '16:20'],
      ['vinte e uma horas e trinta minutos', '21:30', '22:20'],
      ['21h30', '21:30', '22:20'], ['23:09', '23:09', '23:59'],
    ]) {
      const text = `Marcar ${qualifier} às ${time}`
      const result = parse(text)
      assert.equal(result.intent, 'create', text)
      assert.equal(result.patientId, 'p4', text)
      assert.equal(result.start, start, text)
      assert.equal(result.end, end, text)
      assert.deepEqual(result.missing, [], text)
    }
    for (const time of [
      '23h10', '23:10', 'vinte e três horas e dez minutos', '23:30', '24:00', '15:99',
      'quinze e sessenta', 'quinze horas e quarenta e cinco bananas', 'quinze horas extras',
      'quinze e quarenta e cinco na outra sala', 'quinze horas e quarenta e cinco ou dezesseis',
      'quinze horas e quarenta e cinco e abrir agenda', 'quinze horas e quarenta e cinco e às dezesseis',
    ]) {
      const text = `Marcar ${qualifier} às ${time}`
      const result = parse(text)
      assert.equal(result.intent, 'error', text)
      assert.equal(result.start, undefined, text)
    }
  }
})

for (const qualifier of ['semanal para Ana quinta', 'para Ana dia 05/10/2026']) {
  for (const marker of ['às ', '']) {
  for (const [time, start, end] of [
    ['15:45 horas', '15:45', '16:35'], ['15:45h', '15:45', '16:35'],
    ['3:45h da tarde', '15:45', '16:35'], ['3h da tarde', '15:00', '15:50'],
    ['3 da tarde', '15:00', '15:50'], ['12 da noite', '00:00', '00:50'],
    ['9 da manhã', '09:00', '09:50'], ['3 da noite', '03:00', '03:50'],
    ['15h', '15:00', '15:50'], ['15:45', '15:45', '16:35'],
    ['quinze horas', '15:00', '15:50'], ['três da tarde', '15:00', '15:50'],
    ['quinze horas e quarenta e cinco minutos', '15:45', '16:35'],
    ['vinte e uma horas e trinta minutos', '21:30', '22:20'],
  ]) {
    test(`local legacy whole format: ${qualifier} ${marker}${time}`, () => {
      const result = parse(`Marcar ${qualifier} ${marker}${time}`)
      assert.equal(result.intent, 'create')
      assert.equal(result.start, start)
      assert.equal(result.end, end)
      assert.equal(result.patientId, 'p4')
      assert.deepEqual(result.missing, [])
      for (const extra of [' bananas', ' texto extra', ' ou 16h', ' e abrir agenda']) {
        const invalid = parse(`Marcar ${qualifier} ${marker}${time}${extra}`)
        assert.equal(invalid.intent, 'error', time + extra)
        assert.equal(invalid.start, undefined, time + extra)
      }
    })
  }
  }
}

test('local unsupported meia-noite e meia is not introduced by the adapter', () => {
  const result = parse('Marcar para Ana dia 05/10/2026 meia-noite e meia')
  assert.equal(result.start, undefined)
  assert.deepEqual(result.missing, ['time'])
})

test('one-off command accepts civil date and numeric time variants', () => {
  const slash = parse('Marcar para Ana dia 05/10/2026 às 15:30')
  assert.equal(slash.appointmentType, 'Avulsa')
  assert.equal(slash.patientId, 'p4')
  assert.equal(slash.startDate, '2026-10-05')
  assert.equal(slash.start, '15:30')
  assert.equal(slash.end, '16:20')
  assert.deepEqual(slash.missing, [])
  const dash = parse('Agende pra Ana em 05-10-2026 15h')
  assert.equal(dash.startDate, '2026-10-05')
  assert.equal(dash.start, '15:00')
})

test('supported spoken hours stay explicit and bounded', () => {
  assert.equal(parse('Marcar pra Ana dia 05/10/2026 quinze horas').start, '15:00')
  assert.equal(parse('Marcar pra Ana dia 05/10/2026 três da tarde').start, '15:00')
  assert.equal(parse('Marcar pra Ana dia 05/10/2026 às 3 da tarde').start, '15:00')
  assert.equal(parse('Marcar pra Ana dia 05/10/2026 às 9 da noite').start, '21:00')
  assert.equal(parse('Marcar pra Ana dia 05/10/2026 às 3 da noite').start, '03:00')
  assert.equal(parse('Marcar pra Ana dia 05/10/2026 às 13').start, '13:00')
  assert.deepEqual(parse('Marcar pra Ana dia 05/10/2026 às 3').missing, ['time'])
  assert.equal(parse('Marcar pra Ana dia 05/10/2026 às 3').timeAmbiguous, true)
  assert.deepEqual(parse('Marcar pra Ana dia 05/10/2026 3h').missing, ['time'])
  assert.equal(parse('Marcar pra Ana dia 05/10/2026 às 15:99').intent, 'error')
  assert.equal(parse('Marcar pra Ana dia 05/10/2026 às 15:123').intent, 'error')
  assert.equal(parse('Marcar pra Ana dia 05/10/2026 às 23:30').intent, 'error')
})

test('ambiguous exact names return candidates and never guess a substring', () => {
  const ambiguous = parse('Marcar semanal para Joao Silva na quinta 15h')
  assert.equal(ambiguous.patientId, undefined)
  assert.deepEqual(ambiguous.ambiguousPatients, [{ id: 'p2', name: 'João Silva' }, { id: 'p3', name: 'João Silva' }])
  assert.deepEqual(ambiguous.missing, ['patient'])
  const partial = parse('Marcar semanal para Maria na quinta 15h')
  assert.equal(partial.patientId, undefined)
  assert.deepEqual(partial.ambiguousPatients, [])
  assert.deepEqual(partial.missing, ['patient'])
})

test('incomplete commands expose fields to confirm, not an action to save', () => {
  assert.deepEqual(parse('adiciona uma sessão aí semanal pra Ana').missing, ['weekday', 'time'])
  assert.deepEqual(parse('Agendar semanal pra Ana').missing, ['weekday', 'time'])
  assert.deepEqual(parse('Marcar pra Ana').missing, ['date', 'time'])
  assert.equal(parse('Marcar pra Ana').startDate, referenceDate)
  assert.equal(parse('Repetir todo dia para Ana às 15').intent, 'unknown')
  assert.equal(parse('Marcar todo dia para Ana às 15').intent, 'unknown')
  assert.equal(parse('Marcar toda quinta e sexta pra Ana às 15').intent, 'error')
  assert.equal(parse('Abrir agenda').intent, 'unknown')
})

test('invalid dates and incompatible weekly/date instructions fail closed', () => {
  assert.equal(parse('Marcar pra Ana dia 31/02/2026 às 15').intent, 'error')
  assert.equal(parse('Marcar semanal pra Ana quinta dia 05/10/2026 às 15').intent, 'error')
  assert.equal(parseVoiceAgendaCommand({ text: 'Marcar para Ana às 15', patients, referenceDate: '2026-02-30' }).intent, 'error')
  for (const phrase of ['Não marcar pra Ana dia 05/10/2026 às 15', 'marcar pra Ana dia 05/10/2026 às 15 não', 'marcar pra Ana nunca dia 05/10/2026 às 15', 'marcar quinzenal pra Ana quinta às 15', 'marcar pra Ana dia 05/10/2026 às 15 ou 16', 'marcar pra Ana dia 05/10/2026 entre 15 e 16', 'marcar pra Ana dia 05/10/2026 por volta das 15', 'marcar pra Ana dia 05/10/2026 das 15 às 16', 'marcar pra Ana dia 05/10/2026 às 15 e às 16', 'marcar pra Ana dia 05/10/2026 15h e 16h']) {
    assert.equal(parse(phrase).intent, 'error', phrase)
  }
})
