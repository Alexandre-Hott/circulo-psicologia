import test from 'node:test'
import assert from 'node:assert/strict'
import { createClinicalDictationSelection, validateClinicalDictationSelection, prepareClinicalDictation } from '../src/clinicalFieldDictation.js'

const fields = ['observation', 'procedures', 'outcomeDecision', 'referralClosure']
const snapshot = () => ({ patientId: 'ana', sessionDraftId: 'draft-1', epoch: 2, revision: 3,
  lifecycle: '["sessions:1","vault:1"]', values: Object.fromEntries(fields.map(field => [field, 'Texto digitado'])) })

for (const field of fields) test(`${field}: corpo literal append sem modificar snapshot`, () => {
  const live = snapshot()
  const before = structuredClone(live)
  const selection = createClinicalDictationSelection(field, live, 'Ana Clara')
  const body = ' confirmar comando.\r\nNão cancelar; próxima seção semanal.  '
  const result = prepareClinicalDictation(selection, body, live)
  assert.equal(result.status, 'draft')
  assert.equal(result.intent.type, 'session.draft.update')
  assert.equal(result.intent.patch.field, field)
  assert.equal(result.intent.patch.operation, 'append')
  assert.equal(result.intent.patch.value, body)
  assert.equal(result.intent.patch.baseValue, 'Texto digitado')
  assert.deepEqual(result.intent.dictationSelection, selection)
  assert.ok(result.preview.includes('Texto digitado ' + body))
  assert.deepEqual(live, before)
})

test('seleção não aceita campo fora dos quatro nem snapshot ausente', () => {
  for (const field of ['caseDemand', 'name', '', null]) assert.throws(() => createClinicalDictationSelection(field, snapshot(), 'Ana Clara'))
  assert.throws(() => createClinicalDictationSelection('observation', null, 'Ana Clara'))
})

test('snapshot inválido nunca produz seleção', () => {
  for (const key of ['epoch', 'revision']) for (const value of [NaN, Infinity, -1, 1.5, '2', null, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createClinicalDictationSelection('observation', { ...snapshot(), [key]: value }, 'Ana Clara'))
  }
  for (const lifecycle of [null, '', 1]) assert.throws(() => createClinicalDictationSelection('observation', { ...snapshot(), lifecycle }, 'Ana Clara'))
  assert.throws(() => createClinicalDictationSelection('observation', { ...snapshot(), values: { observation: 4 } }, 'Ana Clara'))
})

test('troca, retorno, reload, remount e edição invalidam antes de preparar', () => {
  const live = snapshot()
  const selection = createClinicalDictationSelection('observation', live, 'Ana Clara')
  for (const changes of [{ patientId: 'bia' }, { sessionDraftId: 'draft-2' }, { epoch: 4 }, { revision: 4 },
    { lifecycle: '["sessions:2","vault:1"]' }, { lifecycle: '["sessions:1","vault:2"]' },
    { values: { ...live.values, observation: 'Mudou' } }]) {
    const current = { ...live, ...changes }
    assert.throws(() => validateClinicalDictationSelection(selection, current))
    assert.throws(() => prepareClinicalDictation(selection, 'trecho', current))
  }
  assert.throws(() => prepareClinicalDictation(selection, 'trecho', null))
})

test('seleção copia base: mutação posterior não renova pedido antigo', () => {
  const live = snapshot()
  const selection = createClinicalDictationSelection('observation', live, 'Ana Clara')
  live.values.observation = 'Outro texto'
  assert.equal(selection.baseValue, 'Texto digitado')
  assert.throws(() => prepareClinicalDictation(selection, 'trecho', live))
})

test('limite combinado UTF16 inclui separador e não trunca espaços ou quebras', () => {
  const live = { ...snapshot(), values: { ...snapshot().values, observation: 'A'.repeat(3990) } }
  const selection = createClinicalDictationSelection('observation', live, 'Ana Clara')
  assert.equal(prepareClinicalDictation(selection, 'B'.repeat(9), live).intent.patch.value.length, 9)
  assert.throws(() => prepareClinicalDictation(selection, 'B'.repeat(8) + '\n ', live), error => error.code === 'clinical_text_limit')
})

test('base vazia sem separador inicial aceita 4000, recusa 4001', () => {
  const live = { ...snapshot(), values: { ...snapshot().values, observation: '' } }
  const selection = createClinicalDictationSelection('observation', live, 'Ana Clara')
  assert.ok(prepareClinicalDictation(selection, 'Á'.repeat(4000), live).preview.includes('Á'.repeat(4000)))
  assert.throws(() => prepareClinicalDictation(selection, 'Á'.repeat(4001), live), error => error.code === 'clinical_text_limit')
})

test('corpo vazio/não string não vira comando nem proposta', () => {
  const live = snapshot()
  const selection = createClinicalDictationSelection('observation', live, 'Ana Clara')
  for (const body of ['', ' \r\n ', null, 4, {}]) assert.throws(() => prepareClinicalDictation(selection, body, live))
})

test('chunk2 requer nova seleção explícita e preserva chunk1', () => {
  const live = snapshot()
  const old = createClinicalDictationSelection('observation', live, 'Ana Clara')
  prepareClinicalDictation(old, 'trecho um', live)
  const after = { ...live, revision: 4, values: { ...live.values, observation: live.values.observation + ' trecho um' } }
  assert.throws(() => prepareClinicalDictation(old, 'trecho dois', after))
  const fresh = createClinicalDictationSelection('observation', after, 'Ana Clara')
  assert.ok(prepareClinicalDictation(fresh, 'trecho dois', after).preview.includes('Texto digitado trecho um trecho dois'))
})
