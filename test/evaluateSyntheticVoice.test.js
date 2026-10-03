import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { evaluateSyntheticVoice } from '../scripts/evaluateSyntheticVoice.js'

const phrases = [
  'Marcar sessão semanal para Ana Clara toda quinta às quinze horas.',
  'Cadastrar paciente Bia Fictícia com nove anos.',
  'Registrar comportamento Pede ajuda para Ana Clara na sessão.',
  'Criar comportamento Espera a vez.', 'Abrir agenda.', 'Clicar em Novo cadastro.', 'Confirmar comando.',
  'Abrir pacientes.', 'Abrir sessões de Ana Clara.', 'Abrir análises deste mês.', 'Abrir ajustes.', 'Editar paciente Ana Clara.',
  'Abrir biblioteca de comportamentos reutilizáveis.', 'Abrir contexto do caso de Ana Clara.', 'Editar comportamento Pede ajuda.',
  'Adicionar adendo à sessão de Ana Clara de três de outubro de dois mil e vinte e seis às quinze horas.', 'Mostrar agenda de hoje.',
]
const corpus = () => phrases.map((Transcript, Index) => ({ Index, IntendedCommand: Transcript, Transcript }))
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

test('recusa corpus incompleto, índice duplicado e transcrição vazia', () => {
  assert.throws(() => evaluateSyntheticVoice(corpus().slice(1)))
  const duplicate = corpus(); duplicate[1].Index = 0
  assert.throws(() => evaluateSyntheticVoice(duplicate))
  const empty = corpus(); empty[1].Transcript = ''
  assert.throws(() => evaluateSyntheticVoice(empty))
})
