import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCentralCommand } from '../src/centralCommandRouter.js'
import { validateClinicalTextAppend } from '../src/clinicalTextAppend.js'

// Parser and pure revalidation contract; UI effects are covered separately.
const fields = [
  ['observação', 'observation'], ['procedimentos', 'procedures'],
  ['resultado', 'outcomeDecision'], ['encaminhamento', 'referralClosure'],
]
function contextFor(field = 'observation', baseValue = 'Texto anterior preservado.') {
  return {
    patients: [{ id: 'ana', name: 'Ana Clara', archivedAt: null }, { id: 'bia', name: 'Bia', archivedAt: null }],
    activeSessionDraft: {
      id: 'draft-ana', patientId: 'ana', patientName: 'Ana Clara', originalDate: '2026-10-04',
      observation: 'Versão salva não deve ser usada como base.',
    },
    clinicalTextSnapshot: {
      patientId: 'ana', sessionDraftId: 'draft-ana', epoch: 1, revision: 7,
      values: { observation: '', procedures: '', outcomeDecision: '', referralClosure: '', [field]: baseValue },
    },
  }
}
const request = (field, value) => `Acrescentar ${field} da sessão de Ana Clara com ${value}`
const parse = (text, context) => parseCentralCommand({ text, context })

for (const [name, field] of fields) {
  test(`${name}: append propõe trecho literal, alvo e snapshot sem alterar texto anterior`, () => {
    const baseValue = 'Texto anterior: “Ána”  com apoio.  '
    const value = 'Pediu ajuda; não abrir Agenda. Ána  Clara.'
    const context = contextFor(field, baseValue)
    const before = JSON.stringify(context)
    const result = parse(request(name, value), context)
    assert.equal(result.status, 'draft')
    assert.equal(result.intent.type, 'session.draft.update')
    assert.deepEqual(result.intent.target, {
      patientId: 'ana', patientName: 'Ana Clara', sessionDraftId: 'draft-ana', sessionDate: '2026-10-04',
    })
    assert.deepEqual(result.intent.patch, {
      field, operation: 'append', value, separator: ' ', baseValue, baseEpoch: 1, baseRevision: 7,
    })
    assert.ok(result.preview.includes(baseValue + ' ' + value))
    assert.equal(JSON.stringify(context), before)
    assert.equal(validateClinicalTextAppend(result.intent.target, result.intent.patch, context.clinicalTextSnapshot), baseValue + ' ' + value)
    for (const prefix of ['Acrescente', 'Acrescenta']) {
      assert.deepEqual(parse(request(name, value).replace('Acrescentar', prefix), context).intent.patch, result.intent.patch)
    }
  })

  test(`${name}: campo vazio aceita trecho de 4000 sem espaço inicial`, () => {
    const value = 'Á'.repeat(3999) + '.'
    const context = contextFor(field, '')
    const result = parse(request(name, value), context)
    assert.equal(result.status, 'draft')
    assert.equal(result.intent.patch.operation, 'append')
    assert.equal(result.intent.patch.baseValue, '')
    assert.equal(result.intent.patch.value, value)
    assert.equal(result.intent.patch.separator, ' ')
    assert.ok(result.preview.includes(value))
    assert.equal(context.clinicalTextSnapshot.values[field], '')
  })

  test(`${name}: limite combinado inclui base + separador + trecho, sem truncar`, () => {
    const context = contextFor(field, 'A'.repeat(3990))
    const accepted = parse(request(name, 'B'.repeat(9)), context)
    assert.equal(accepted.status, 'draft')
    assert.equal(accepted.intent.patch.baseValue.length + accepted.intent.patch.separator.length + accepted.intent.patch.value.length, 4000)
    const refused = parse(request(name, 'B'.repeat(10)), context)
    assert.equal(refused.status, 'clarification')
    assert.equal(refused.intent, undefined)
    assert.equal(refused.code, 'clinical_text_limit')
    assert.match(refused.message, /4000/u)
    assert.equal(context.clinicalTextSnapshot.values[field], 'A'.repeat(3990))
  })

  test(`${name}: trecho 4001 recusado mesmo em campo vazio`, () => {
    const result = parse(request(name, 'A'.repeat(4001)), contextFor(field, ''))
    assert.equal(result.status, 'clarification')
    assert.equal(result.intent, undefined)
    assert.equal(result.code, 'clinical_text_limit')
    assert.match(result.message, /4000/u)
  })
}

test('append sem snapshot atual não usa a versão salva do campo como fallback', () => {
  const context = contextFor()
  delete context.clinicalTextSnapshot
  const result = parse(request('observação', 'pediu ajuda.'), context)
  assert.equal(result.status, 'clarification')
  assert.equal(result.intent, undefined)
  assert.equal(result.code, undefined)
  assert.match(result.message, /atual|snapshot|formulário/u)
})

test('snapshot vincula paciente/rascunho/epoch/revisão e rejeita metadados incompatíveis', () => {
  for (const patch of [
    { patientId: 'bia' }, { sessionDraftId: 'other-draft' }, { patientId: null }, { sessionDraftId: 42 },
    ...['epoch', 'revision'].flatMap(key => [undefined, null, '', '1', NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, true].map(value => ({ [key]: value }))),
    { values: null }, { values: { observation: 42 } }, { values: { observation: null } },
  ]) {
    const context = contextFor()
    Object.assign(context.clinicalTextSnapshot, patch)
    const before = JSON.stringify(context)
    const result = parse(request('observação', 'pediu ajuda.'), context)
    assert.equal(result.status, 'clarification')
    assert.equal(result.intent, undefined)
    assert.equal(result.code, undefined)
    assert.match(result.message, /atual|snapshot|formulário|rascunho/u)
    assert.equal(JSON.stringify(context), before)
    // Identity/type errors take precedence over length diagnostics.
    const tooLong = parse(request('observação', 'A'.repeat(4001)), context)
    assert.equal(tooLong.code, undefined)
    assert.match(tooLong.message, /formulário atual/u)
  }
})

test('duas propostas mantêm snapshots distintos para revalidação posterior no handler', () => {
  const first = parse(request('observação', 'pediu ajuda.'), contextFor('observation', 'Antes.'))
  assert.equal(first.status, 'draft')
  const changed = contextFor('observation', 'Editado manualmente.')
  changed.clinicalTextSnapshot.revision = 8
  changed.clinicalTextSnapshot.epoch = 2
  const next = parse(request('observação', 'pediu ajuda.'), changed)
  assert.equal(next.status, 'draft')
  assert.equal(first.intent.patch.baseValue, 'Antes.')
  assert.equal(first.intent.patch.baseRevision, 7)
  assert.equal(first.intent.patch.baseEpoch, 1)
  assert.equal(next.intent.patch.baseValue, 'Editado manualmente.')
  assert.equal(next.intent.patch.baseRevision, 8)
  assert.equal(next.intent.patch.baseEpoch, 2)
  assert.throws(() => validateClinicalTextAppend(first.intent.target, first.intent.patch, changed.clinicalTextSnapshot), /formulário atual/u)
  for (const mutation of [
    { epoch: 2 }, { revision: 8 }, { patientId: 'bia' }, { sessionDraftId: 'other' },
    { values: { observation: 'Editado manualmente.' } },
  ]) {
    const current = { ...contextFor('observation', 'Antes.').clinicalTextSnapshot, ...mutation }
    assert.throws(() => validateClinicalTextAppend(first.intent.target, first.intent.patch, current), /formulário atual/u)
  }
  for (const mutation of [{ operation: 'replace' }, { field: 'notes' }, { separator: '\n' }, { value: null }, { baseValue: null },
    ...['baseEpoch', 'baseRevision'].flatMap(key => [NaN, -1, 0.5, '1', Number.MAX_SAFE_INTEGER + 1].map(value => ({ [key]: value })))]) {
    assert.throws(() => validateClinicalTextAppend(first.intent.target, { ...first.intent.patch, ...mutation }, contextFor('observation', 'Antes.').clinicalTextSnapshot), /formulário atual/u)
  }
  const live = contextFor('observation', 'Antes.').clinicalTextSnapshot
  live.values.observation = validateClinicalTextAppend(first.intent.target, first.intent.patch, live)
  live.revision++
  const secondChunk = parse(request('observação', 'Trecho dois.'), { ...contextFor(), clinicalTextSnapshot: live })
  assert.equal(validateClinicalTextAppend(secondChunk.intent.target, secondChunk.intent.patch, live), 'Antes. pediu ajuda. Trecho dois.')
})

test('append mantém exigência de paciente exato e rascunho selecionado', () => {
  for (const [text, change, reason] of [
    ['Acrescentar observação da sessão de Ana com pediu ajuda.', {}, /nome completo/u],
    [request('observação', 'pediu ajuda.'), { activeSessionDraft: null }, /Abra primeiro um rascunho/u],
    [request('observação', 'pediu ajuda.'), { activeSessionDraft: { id: 'draft-bia', patientId: 'bia' } }, /sessão aberta pertence/u],
    [request('observação', 'pediu ajuda.'), { patients: [{ id: 'ana', name: 'Ana Clara' }, { id: 'homonym', name: 'ANA CLARA' }] }, /mais de um paciente/u],
  ]) {
    const context = { ...contextFor(), ...change }
    const result = parse(text, context)
    assert.equal(result.status, 'clarification')
    assert.equal(result.intent, undefined)
    assert.equal(result.code, undefined)
    assert.match(result.message, reason)
  }
})

test('negação, campos fora do escopo e payload vazio não geram append', () => {
  for (const text of [
    'Não acrescentar observação da sessão de Ana Clara com pediu ajuda.',
    'Nunca acrescente observação da sessão de Ana Clara com pediu ajuda.',
    'Por favor não acrescenta observação da sessão de Ana Clara com pediu ajuda.',
    'Acrescentar observação da sessão de Ana Clara e acrescentar resultado com pediu ajuda.',
    'Acrescentar nota contextual da sessão de Ana Clara com pediu ajuda.',
    'Acrescentar descrição da sessão de Ana Clara com pediu ajuda.',
    'Acrescentar nome da sessão de Ana Clara com pediu ajuda.',
    request('observação', '""'), request('observação', '“”'), request('observação', ''),
  ]) {
    const result = parse(text, contextFor())
    assert.equal(result.status, 'clarification')
    assert.equal(result.intent, undefined)
    assert.equal(result.code, undefined)
  }
})

test('preencher continua replace, sem transformar comandos existentes em append', () => {
  const context = contextFor()
  const before = JSON.stringify(context)
  for (const [name, field] of fields) {
    const result = parse(`Preencher ${name} da sessão de Ana Clara com Novo texto.`, context)
    assert.equal(result.status, 'draft')
    assert.deepEqual(result.intent.patch, { field, operation: 'replace', value: 'Novo texto.' })
  }
  assert.equal(JSON.stringify(context), before)
})

test('capturas nativas: aliases apenas no cabeçalho, sem reparar payload ou delimitador ausente', () => {
  for (const [text, field, value] of [
    ['Acrescentar resultado da seção de Ana Clara com manteve atenção.', 'outcomeDecision', 'manteve atenção.'],
    ['Acrecentar encaminhamento da seção de Ana Clara com próxima seção semanal.', 'referralClosure', 'próxima seção semanal.'],
    ['Acrescentar procedimentos da sessão de Ana Clara com realizou atividade.', 'procedures', 'realizou atividade.'],
  ]) {
    const result = parse(text, contextFor(field, 'Anterior.'))
    assert.equal(result.status, 'draft')
    assert.equal(result.intent.patch.operation, 'append')
    assert.equal(result.intent.patch.field, field)
    assert.equal(result.intent.patch.value, value)
    assert.equal(validateClinicalTextAppend(result.intent.target, result.intent.patch, contextFor(field, 'Anterior.').clinicalTextSnapshot), 'Anterior. ' + value)
  }
  const missingDelimiter = parse('Acrescentar observação da seção de Ana Clara compidiu ajuda.', contextFor())
  assert.equal(missingDelimiter.status, 'clarification')
  assert.equal(missingDelimiter.intent, undefined)
  assert.equal(missingDelimiter.code, undefined)
})

test('aliases do cabeçalho preservam nome cadastrado e seção literal no trecho', () => {
  const context = contextFor()
  context.patients[0].name = 'Ana seção Acrecentar'
  context.activeSessionDraft.patientName = 'Ana seção Acrecentar'
  const before = JSON.stringify(context)
  const value = 'próxima seção semanal. Acrecentar não é instrução; compidiu permanece.'
  const result = parse(`Acrecentar observação da seção de Ana seção Acrecentar com ${value}`, context)
  assert.equal(result.status, 'draft')
  assert.equal(result.intent.target.patientName, 'Ana seção Acrecentar')
  assert.equal(result.intent.patch.value, value)
  assert.equal(JSON.stringify(context), before)
})

test('alias nativo recusa negação, ações compostas e campos fora dos quatro clínicos', () => {
  for (const text of [
    'Não acrecentar resultado da seção de Ana Clara com manteve atenção.',
    'Por favor nunca acrecentar resultado da seção de Ana Clara com manteve atenção.',
    'Acrescentar resultado da seção de Ana Clara e acrecentar encaminhamento com manteve atenção.',
    'Acrecentar resultado da seção de Ana Clara e abrir Agenda com manteve atenção.',
    'Acrecentar nota contextual da seção de Ana Clara com próxima seção semanal.',
    'Acrecentar nome da seção de Ana Clara com próxima seção semanal.',
  ]) {
    const result = parse(text, contextFor())
    assert.equal(result.status, 'clarification')
    assert.equal(result.intent, undefined)
    assert.equal(result.code, undefined)
  }
})
