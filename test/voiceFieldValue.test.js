import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeVoiceFieldValue as normalize } from '../src/voiceFieldValue.js'

test('datas faladas completas e numéricas mantêm datas civis válidas', () => {
  for (const [input, output] of [['dez de outubro de 2026', '2026-10-10'], ['primeiro de março de dois mil e vinte e seis', '2026-03-01'], ['vinte e nove de fevereiro de dois mil e vinte e quatro', '2024-02-29'], ['31/12/2026', '2026-12-31'], ['2026-10-03', '2026-10-03']]) assert.equal(normalize('date', input), output, input)
  for (const input of ['amanhã', 'dez de outubro', '31 de fevereiro de 2026', 'vinte e nove de fevereiro de 2026', '2026-13-01', 'dois de março de dois mil e banana', '10/10/26']) assert.equal(normalize('date', input), null, input)
})

test('horários falados exigem precisão e não adivinham manhã ou tarde', () => {
  for (const [input, output] of [['três da tarde', '15:00'], ['duas e meia da tarde', '14:30'], ['quinze horas', '15:00'], ['vinte e três horas', '23:00'], ['quinze e trinta', '15:30'], ['nove e quarenta e cinco da manhã', '09:45'], ['meio-dia', '12:00'], ['meia-noite', '00:00'], ['18:50', '18:50'], ['sete da noite', '19:00']]) assert.equal(normalize('time', input), output, input)
  for (const input of ['três horas', '3', 'três da noite', '25 horas', 'quinze e sessenta', '15:60', 'por volta de três da tarde', 'três ou quatro da tarde', 'quinze da tarde']) assert.equal(normalize('time', input), null, input)
})

test('idade aceita cardinal completo até120 sem converter texto livre', () => {
  for (const [input, output] of [['zero', '0'], ['nove', '9'], ['vinte e duas', '22'], ['noventa e nove', '99'], ['cem', '100'], ['cento e uma', '101'], ['cento e dezenove', '119'], ['cento e vinte', '120'], ['120', '120'], ['001', '1'], ['dezassete', '17']]) assert.equal(normalize('age', input), output, input)
  for (const input of ['121', '-1', 'nove e meio', 'nove ou dez', 'mais ou menos nove', 'cento', 'cento e zero', 'cento e vinte e um', '9 anos', '9.0', 'um dois', 'um milhão']) assert.equal(normalize('age', input), null, input)
  assert.equal(normalize('age', 'cento e dezassete'), '117')
  assert.equal(normalize('age', ''), '')
})

test('textos livres não são convertidos e limpeza continua permitida', () => {
  for (const type of ['text', 'textarea', 'number']) assert.equal(normalize(type, 'três da tarde'), 'três da tarde')
  for (const type of ['date', 'time']) assert.equal(normalize(type, ''), '')
})

test('horas e minutos explícitos e limites não viram horários aproximados', () => {
  assert.equal(normalize('time', 'quinze horas e trinta minutos'), '15:30')
  assert.equal(normalize('time', 'três horas e cinquenta minutos da tarde'), '15:50')
  assert.equal(normalize('time', 'vinte horas e três'), '20:03')
  assert.equal(normalize('time', 'vinte e uma horas e trinta minutos'), '21:30')
  assert.equal(normalize('time', 'vinte e três horas e dez minutos'), '23:10')
  assert.equal(normalize('time', '18:50:30.123'), '18:50:30.123')
  assert.equal(normalize('time', '18:50:60'), null)
  assert.equal(normalize('date', 'dez de outubro de dois mil e 2026'), null)
  assert.equal(normalize('time', 'vinte e quatro horas'), null)
  assert.equal(normalize('time', 'três e sessenta da tarde'), null)
})
