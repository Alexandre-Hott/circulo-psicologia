import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { evaluateSyntheticVoice } from '../scripts/evaluateSyntheticVoice.js'

test('série nativa exige replay de interface: zero aprovações e três não avaliados', () => {
  const cases = JSON.parse(readFileSync(new URL('./fixtures/native-voice-series-20261004.json', import.meta.url), 'utf8'))
  const result = evaluateSyntheticVoice(cases, { scenario: 'interface-series' })
  assert.equal(result.Passed, 0)
  assert.equal(result.Failed, 0)
  assert.equal(result.NotEvaluated, 3)
  assert.deepEqual(result.Results.map(item => item.Status), ['not-evaluated', 'not-evaluated', 'not-evaluated'])
  for (const [index, item] of result.Results.entries()) {
    assert.equal(item.Transcript, cases[index].Transcript)
    assert.match(item.Reason, /não avaliado pelo parser central/)
    assert.equal(Object.hasOwn(item, 'ActualIntent'), false)
  }
  assert.throws(() => evaluateSyntheticVoice(cases.slice(1), { scenario: 'interface-series' }))
  assert.throws(() => evaluateSyntheticVoice([...cases, cases[0]], { scenario: 'interface-series' }))
  for (const invalid of [
    { Index: 0, Transcript: '' }, { Index: 0, Transcript: '   ' },
    { Index: 0, Transcript: null }, { Index: 1, Transcript: 'Confirmar comando.' },
    { Index: -1, Transcript: 'Confirmar comando.' }, { Index: 3, Transcript: 'Confirmar comando.' },
    { Index: 0.5, Transcript: 'Confirmar comando.' },
  ]) {
    assert.throws(() => evaluateSyntheticVoice([invalid, ...cases.slice(1)], { scenario: 'interface-series' }))
  }
  const reordered = evaluateSyntheticVoice([...cases].reverse(), { scenario: 'interface-series' })
  assert.equal(reordered.NotEvaluated, 3)
  assert.equal(reordered.Passed, 0)
  assert.equal(reordered.Failed, 0)
})

test('gavetas exigem replay de interface: evaluator central não anuncia comandos aplicados', () => {
  const cases = JSON.parse(readFileSync(new URL('./fixtures/native-voice-drawer-20261004.json', import.meta.url), 'utf8'))
  const result = evaluateSyntheticVoice(cases, { scenario: 'interface-drawer' })
  assert.equal(result.Passed, 0)
  assert.equal(result.Failed, 0)
  assert.equal(result.NotEvaluated, 3)
  assert.throws(() => evaluateSyntheticVoice(cases.slice(0, 2), { scenario: 'interface-drawer' }))
  assert.throws(() => evaluateSyntheticVoice([{ Index: 0, Transcript: '' }, ...cases.slice(1)], { scenario: 'interface-drawer' }))
})

const phrases = [
  'Marcar sessão semanal para Ana Clara toda quinta às quinze horas.',
  'Cadastrar paciente Bia Fictícia com nove anos.',
  'Registrar comportamento Pede ajuda para Ana Clara na sessão.',
  'Criar comportamento Espera a vez.', 'Abrir agenda.', 'Clicar em Novo cadastro.', 'Confirmar comando.',
  'Abrir pacientes.', 'Abrir sessões de Ana Clara.', 'Abrir análises deste mês.', 'Abrir ajustes.', 'Editar paciente Ana Clara.',
  'Abrir biblioteca de comportamentos reutilizáveis.', 'Abrir contexto do caso de Ana Clara.', 'Editar comportamento Pede ajuda.',
  'Adicionar adendo à sessão de Ana Clara de três de outubro de dois mil e vinte e seis às quinze horas.', 'Mostrar agenda de hoje.',
]

test('remoção nativa confere operação e alvo sem aprovar confirmação isolada', () => {
  const cases = JSON.parse(readFileSync(new URL('./fixtures/native-voice-remove-20261004.json', import.meta.url), 'utf8'))
  const result = evaluateSyntheticVoice(cases, { scenario: 'behavior-remove' })
  assert.equal(result.Passed, 2)
  assert.equal(result.Failed, 0)
  assert.equal(result.NotEvaluated, 1)
  const added = structuredClone(cases); added[0].Transcript = 'Registrar comportamento Pede ajuda para Ana Clara na sessão'
  assert.equal(evaluateSyntheticVoice(added, { scenario: 'behavior-remove' }).Failed, 1)
  const other = structuredClone(cases); other[0].Transcript = 'Retirar comportamento Espera a vez da sessão de Ana Clara'
  assert.equal(evaluateSyntheticVoice(other, { scenario: 'behavior-remove' }).Failed, 1)
  assert.throws(() => evaluateSyntheticVoice(cases.slice(1), { scenario: 'behavior-remove' }))
})
const corpus = () => phrases.map((Transcript, Index) => ({ Index, IntendedCommand: Transcript, Transcript }))

test('corpus de data falada exige ação, paciente, data e horário completos', () => {
  const cases = ['Iniciar', 'Remarcar', 'Cancelar'].map((verb, Index) => ({ Index, Transcript: `${verb} sessão de Ana Clara em três de outubro de dois mil e vinte e seis às quinze horas.` }))
  const result = evaluateSyntheticVoice(cases, { scenario: 'occurrence-date' })
  assert.equal(result.Passed, 3)
  assert.equal(result.NotEvaluated, 0)
  assert.equal(result.Failed, 0)
  const changed = structuredClone(cases)
  changed[0].Transcript = changed[0].Transcript.replace('quinze', 'dezesseis')
  changed[1].Transcript = changed[1].Transcript.replace('três', 'quatro')
  changed[2].Transcript = changed[2].Transcript.replace('Cancelar', 'Iniciar')
  assert.equal(evaluateSyntheticVoice(changed, { scenario: 'occurrence-date' }).Failed, 3)
  assert.throws(() => evaluateSyntheticVoice(cases))
})

test('datas faladas capturadas no backend instalado preservam as três ações de ocorrência', () => {
  const recorded = JSON.parse(readFileSync(new URL('./fixtures/native-voice-occurrence-20261004.json', import.meta.url), 'utf8'))
  const result = evaluateSyntheticVoice(recorded, { scenario: 'occurrence-date' })
  assert.equal(result.Passed, 3, JSON.stringify(result.Results))
  assert.equal(result.Failed, 0)
  assert.equal(result.NotEvaluated, 0)
})

test('corpus de salvar comportamento depende de interface e não recebe aprovação semântica antecipada', () => {
  const cases = ['Salvar comportamento.', 'Salve o comportamento.', 'Confirmar comando.'].map((Transcript, Index) => ({ Index, Transcript }))
  const result = evaluateSyntheticVoice(cases, { scenario: 'behavior-save' })
  assert.equal(result.Passed, 0)
  assert.equal(result.Failed, 0)
  assert.equal(result.NotEvaluated, 3)
  assert.throws(() => evaluateSyntheticVoice(cases))
  assert.throws(() => evaluateSyntheticVoice(cases, { scenario: 'unknown' }))
  assert.throws(() => evaluateSyntheticVoice(cases.slice(1), { scenario: 'behavior-save' }))
  const duplicate = structuredClone(cases); duplicate[1].Index = 0
  assert.throws(() => evaluateSyntheticVoice(duplicate, { scenario: 'behavior-save' }))
})

test('transcrições de salvamento coletadas no backend instalado continuam exigindo verificação de interface', () => {
  const recorded = JSON.parse(readFileSync(new URL('./fixtures/native-voice-save-20261004.json', import.meta.url), 'utf8'))
  const result = evaluateSyntheticVoice(recorded, { scenario: 'behavior-save' })
  assert.equal(result.NotEvaluated, 3)
  assert.equal(result.Passed, 0)
})
test('corpus realmente transcrito pelo backend Rust preserva quinze intents; dois exigem UI', () => {
  const recorded = JSON.parse(readFileSync(new URL('./fixtures/native-voice-20261003.json', import.meta.url), 'utf8'))
  const result = evaluateSyntheticVoice(recorded)
  assert.equal(result.Passed, 15, JSON.stringify(result.Results.filter(item => item.Status === 'failed')))
  assert.equal(result.Failed, 0)
  assert.equal(result.NotEvaluated, 2)
})
test('avalia campos centrais e não aprova controles dependentes de UI por transcrição apenas', () => {
  const result = evaluateSyntheticVoice(corpus())
  assert.equal(result.Passed, 15, JSON.stringify(result.Results.filter(item => item.Status === 'failed')))
  assert.equal(result.Failed, 0)
  assert.equal(result.NotEvaluated, 2)
})
test('rejeita comportamento literal alterado, horário, paciente e ação divergentes', () => {
  const cases = corpus()
  cases[0].Transcript = 'Marcar sessão semanal para Ana Clara toda quinta às dezesseis horas'
  cases[3].Transcript = 'Criar comportamento Espera a mesa'
  cases[8].Transcript = 'Abrir sessões de Ana'
  cases[15].Transcript = 'Marcar sessão semanal para Ana Clara toda quinta às quinze horas'
  const result = evaluateSyntheticVoice(cases)
  assert.equal(result.Failed, 4)
  assert.equal(result.Passed, 11)
  assert.equal(result.NotEvaluated, 2)
})
test('atributos introduzidos, nomes excedentes, negação e ações compostas não passam', () => {
  for (const [index, transcript] of [
    [0, 'Marcar sessão semanal para Ana Clara toda quinta às quinze horas online'],
    [1, 'Cadastrar paciente Bia Fictícia com nove anos online'],
    [2, 'Registrar comportamento Pede ajuda inexistente para Ana Clara na sessão'],
    [2, 'Registrar comportamento Pede ajuda para Ana Clara desconhecida na sessão'],
    [4, 'Não abrir agenda'], [4, 'Abrir agenda e abrir pacientes'],
  ]) {
    const cases = corpus(); cases[index].Transcript = transcript
    assert.equal(evaluateSyntheticVoice(cases).Results[index].Status, 'failed', transcript)
  }
})

test('intervalo realmente transcrito mantém paciente e duas datas exatas', () => {
  const cases = JSON.parse(readFileSync(new URL('./fixtures/native-voice-analytics-20261004.json', import.meta.url), 'utf8'))
  const result = evaluateSyntheticVoice(cases, { scenario: 'analytics-range' })
  assert.equal(result.Passed, 2)
  assert.equal(result.Failed, 0)
  assert.equal(result.NotEvaluated, 0)
  const wrongDate = structuredClone(cases)
  wrongDate[0].Transcript = wrongDate[0].Transcript.replace('trinta de setembro', 'vinte de setembro')
  assert.equal(evaluateSyntheticVoice(wrongDate, { scenario: 'analytics-range' }).Failed, 1)
  assert.throws(() => evaluateSyntheticVoice(cases.slice(1), { scenario: 'analytics-range' }))
})

test('corpus de campos nativos não é aprovado sem interface', () => {
  const cases = JSON.parse(readFileSync(new URL('./fixtures/native-voice-fields-20261004.json', import.meta.url), 'utf8'))
  const result = evaluateSyntheticVoice(cases, { scenario: 'interface-fields' })
  assert.equal(result.Passed, 0)
  assert.equal(result.Failed, 0)
  assert.equal(result.NotEvaluated, 3)
  assert.throws(() => evaluateSyntheticVoice(cases.slice(1), { scenario: 'interface-fields' }))
  const empty = structuredClone(cases); empty[0].Transcript = ''
  assert.throws(() => evaluateSyntheticVoice(empty, { scenario: 'interface-fields' }))
})

test('recusa corpus incompleto, índice duplicado e transcrição vazia', () => {
  assert.throws(() => evaluateSyntheticVoice(corpus().slice(1)))
  const duplicate = corpus(); duplicate[1].Index = 0
  assert.throws(() => evaluateSyntheticVoice(duplicate))
  const empty = corpus(); empty[1].Transcript = ''
  assert.throws(() => evaluateSyntheticVoice(empty))
})

test('dias da semana transcritos exigem prova na interface e não aprovação central', () => {
  const cases = JSON.parse(readFileSync(new URL('./fixtures/native-voice-weekday-20261004.json', import.meta.url), 'utf8'))
  const result = evaluateSyntheticVoice(cases, { scenario: 'interface-weekday' })
  assert.equal(result.Passed, 0)
  assert.equal(result.Failed, 0)
  assert.equal(result.NotEvaluated, 3)
  assert.throws(() => evaluateSyntheticVoice(cases.slice(1), { scenario: 'interface-weekday' }))
  const duplicate = structuredClone(cases); duplicate[1].Index = 0
  assert.throws(() => evaluateSyntheticVoice(duplicate, { scenario: 'interface-weekday' }))
})

test('vínculos nativos conferem paciente e destino sem aprovar checkbox ou confirmação', () => {
  const cases = JSON.parse(readFileSync(new URL('./fixtures/native-voice-party-20261004.json', import.meta.url), 'utf8'))
  const result = evaluateSyntheticVoice(cases, { scenario: 'interface-party' })
  assert.equal(result.Passed, 1)
  assert.equal(result.Failed, 0)
  assert.equal(result.NotEvaluated, 2)
  const wrong = structuredClone(cases); wrong[0].Transcript = 'Abrir registros de Ana Clara'
  assert.equal(evaluateSyntheticVoice(wrong, { scenario: 'interface-party' }).Failed, 1)
  assert.throws(() => evaluateSyntheticVoice(cases.slice(1), { scenario: 'interface-party' }))
})
