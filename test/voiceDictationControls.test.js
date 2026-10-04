import test from 'node:test'
import assert from 'node:assert/strict'
import { clinicalDictationFields, createClinicalDictationSelection, prepareClinicalDictation } from '../src/clinicalFieldDictation.js'

// MAIN's accepted 78 API. This suite specifies pure parsing only, never React
// pending state, dispatcher priority, capture errors, DOM, IPC or persistence.
// Unknown requests return null here; the component consumes them inside mode.
// No clinical.text.append intent: the existing preparation contract remains
// session.draft.update + patch.operation=append + dictationSelection.
// A missing production module is ONE prerequisite failure, not functional RED.
// Functional cases are individually registered and explicitly skipped ONLY
// for that missing module. Once it exists, every case runs against its export.
const moduleUrl = new URL('../src/voiceDictationControls.js', import.meta.url)
let parseDictationControl, missingModule
try {
  ;({ parseDictationControl } = await import(moduleUrl.href))
} catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND' || error.url !== moduleUrl.href) throw error
  missingModule = error
}
test('78 prerequisite: real voiceDictationControls module/export exists (not functional RED)', () => {
  assert.ifError(missingModule)
  assert.equal(typeof parseDictationControl, 'function')
})

const cases = []
const local = action => ({ kind: 'local-action', action })
const inactive = { kind: 'local-refusal', reason: 'inactive-mode' }
const invalidField = { kind: 'local-refusal', reason: 'invalid-field' }
const commands = [
  ['Ditar neste campo', 'enter'],
  ['Preparar trecho', 'prepare'],
  ['Confirmar acréscimo', 'confirm'],
  ['Descartar trecho', 'discard'],
  ['Usar comandos', 'exit'],
]
const active = { dictatingField: true }
function add(name, run) { cases.push({ name, run }) }
function expectParse(text, context, expected) {
  const before = context && typeof context === 'object' ? structuredClone(context) : context
  assert.deepEqual(parseDictationControl(text, context), expected)
  assert.deepEqual(context, before, 'parser must not mutate context, body or pending data')
}

for (const [command, action] of commands) {
  for (const mode of [false, true]) {
    const expected = action === 'enter' || mode ? local(action) : inactive
    add(`${command}: exact, dictatingField=${mode}`, () => expectParse(command, { dictatingField: mode }, expected))
    const variants = [
      ['case', command.toUpperCase()],
      ['accent fold', command.normalize('NFD').replace(/[\u0300-\u036f]/g, '')],
      ['decomposed accents', command.normalize('NFD')],
      ['spaces', `  ${command.replaceAll(' ', '   ')}  `],
      ...['.', '!', '?'].map(mark => [`final ${mark}`, command + mark]),
    ]
    for (const [name, text] of variants) add(`${command}: ${name}, dictatingField=${mode}`, () => expectParse(text, { dictatingField: mode }, expected))
  }
  add(`${command}: omitted context defaults inactive`, () => {
    assert.deepEqual(parseDictationControl(command), action === 'enter' ? local(action) : inactive)
  })
  for (const text of [
    `não ${command}`, `${command} agora`, `${command} e salvar`,
    `${command}; Confirmar`, `Antes ${command}`, `“${command}”`,
    command.replace(' ', '. '), `${command}${'.'.repeat(64)}`,
  ]) add(`strict command fullmatch: ${JSON.stringify(text)}`, () => expectParse(text, active, null))
}

for (const [field, label] of Object.entries(clinicalDictationFields)) {
  const command = `Selecionar campo ${label}`
  for (const mode of [false, true]) {
    const expected = mode ? { kind: 'local-action', action: 'select', field } : inactive
    for (const [name, text] of [
      ['canonical full label', command], ['case', command.toUpperCase()],
      ['accent fold', command.normalize('NFD').replace(/[\u0300-\u036f]/g, '')],
      ['spaces', ` ${command.replaceAll(' ', '  ')} `], ['final punctuation', command + '.'],
    ]) add(`select ${field}: ${name}, dictatingField=${mode}`, () => expectParse(text, { dictatingField: mode }, expected))
  }
  for (const text of [`${command} e preparar`, `${command} comentário clínico`, `${command}; Confirmar acréscimo`]) {
    add(`select ${field}: consumes invalid suffix ${JSON.stringify(text)}`, () => expectParse(text, active, invalidField))
  }
}

for (const text of [
  'Selecionar campo', 'Selecionar campo Nome', 'Selecionar campo observação',
  'Selecionar campo procedimentos', 'Selecionar campo resultado',
  'Selecionar campo encaminhamento', 'Selecionar campo observation',
  'Selecionar campo Observações descritivas ou Procedimentos realizados',
  'Selecionar campo Encaminhamento e encerramento (opcional)',
  'Selecionar campo Observações. descritivas',
]) add(`unknown/ambiguous field is consumed: ${JSON.stringify(text)}`, () => expectParse(text, active, invalidField))

// MAIN usability delta: only this full field permits omission of the optional
// UI annotation or speaking it without parentheses. Derive both variants from
// the authoritative label; no shorthand, fuzzy match or clinical normalization.
const referralLabel = clinicalDictationFields.referralClosure
for (const [variant, label] of [
  ['without optional annotation', referralLabel.replace(/ \(opcional\)$/u, '')],
  ['unparenthesized optional annotation', referralLabel.replace(/\(opcional\)$/u, 'opcional')],
]) {
  const command = `Selecionar campo ${label}`
  for (const mode of [false, true]) {
    const expected = mode ? { kind: 'local-action', action: 'select', field: 'referralClosure' } : inactive
    for (const [name, text] of [
      ['exact full label', command], ['case', command.toUpperCase()],
      ['accent fold', command.normalize('NFD').replace(/[\u0300-\u036f]/g, '')],
      ['spaces', ` ${command.replaceAll(' ', '  ')} `],
      ...['.', '!', '?'].map(mark => [`bounded final ${mark}`, command + mark]),
    ]) add(`select referralClosure ${variant}: ${name}, dictatingField=${mode}`, () => expectParse(text, { dictatingField: mode }, expected))
    for (const suffix of [' e preparar', ' comentário clínico', '; Confirmar acréscimo', '.'.repeat(64)]) {
      add(`select referralClosure ${variant}: invalid suffix ${JSON.stringify(suffix)}, dictatingField=${mode}`, () =>
        expectParse(command + suffix, { dictatingField: mode }, mode ? invalidField : inactive))
    }
  }
}

for (const text of ['Confirmar', 'confirmar.', ' CONFIRMAR ', 'Confirmar!']) {
  add(`bare confirm local in mode: ${JSON.stringify(text)}`, () => expectParse(text, active, local('confirm')))
  add(`bare confirm external outside mode: ${JSON.stringify(text)}`, () => expectParse(text, { dictatingField: false }, null))
}
add('bare Confirmar with omitted context keeps external confirmation', () => assert.equal(parseDictationControl('Confirmar'), null))

for (const [name, value] of [
  ['string true', 'true'], ['number one', 1], ['object', {}], ['array', []],
  ['null', null], ['undefined', undefined], ['string false', 'false'], ['zero', 0],
]) {
  for (const [text, expected] of [
    ['Ditar neste campo', local('enter')], ['Preparar trecho', inactive],
    ['Confirmar acréscimo', inactive], ['Confirmar', null],
    [`Selecionar campo ${clinicalDictationFields.observation}`, inactive],
  ]) add(`mode strict boolean ${name}: ${text}`, () => expectParse(text, { dictatingField: value }, expected))
}

for (const [name, text] of [
  ['null', null], ['undefined', undefined], ['number', 78], ['NaN', NaN],
  ['boolean', true], ['array', ['Confirmar']], ['object', { text: 'Confirmar' }],
  ['String wrapper', new String('Confirmar')], ['symbol', Symbol('Confirmar')],
  ['bigint', 78n], ['function', () => 'Confirmar'],
]) for (const mode of [false, true]) {
  add(`invalid text ${name}, dictatingField=${mode}: safe null`, () => {
    assert.doesNotThrow(() => expectParse(text, { dictatingField: mode }, null))
  })
}

for (const text of [
  '', '  ', 'confirmar comando', 'confirma', 'aplicar', 'aplica',
  'entrar no ditado', 'selecionar observação', 'preparar acréscimo',
  'cancelar trecho', 'voltar aos comandos', 'Confirmar acréscimo e salvar rascunho',
  'Clicar em Preparar trecho', 'Clicar em Confirmar acréscimo',
  'Acrescentar observação da sessão de Ana Sintética com Confirmar acréscimo',
  'Salvar rascunho', 'Iniciar sessão de Ana Sintética hoje às 15:45',
  'Trecho: Confirmar acréscimo.\r\nNão descartar; Ána  pediu apoio.',
  'A palavra “Confirmar” apareceu no relato.',
]) for (const mode of [false, true]) {
  add(`nonlocal remains null in pure parser, mode=${mode}: ${JSON.stringify(text)}`, () => expectParse(text, { dictatingField: mode }, null))
}

for (const [field, label] of Object.entries(clinicalDictationFields)) {
  add(`${field}: parser is independent of pending/snapshot/component guards`, () => {
    const context = Object.freeze({ dictatingField: true })
    expectParse('Confirmar acréscimo', context, local('confirm'))
    expectParse('Confirmar', context, local('confirm'))
    expectParse(`Selecionar campo ${label}`, context, { kind: 'local-action', action: 'select', field })
  })
  add(`${field}: clinical body stays literal; prepare keeps real update/append/selection`, () => {
    const body = '  Confirmar acréscimo.\r\nNÃO descartar trecho; Ána  pediu APOIO!  '
    const snapshot = { patientId: 'synthetic-patient', sessionDraftId: 'synthetic-draft', epoch: 1, revision: 2,
      lifecycle: '["synthetic-session-1","synthetic-space-1"]',
      values: Object.fromEntries(Object.keys(clinicalDictationFields).map(key => [key, 'Texto fictício anterior.'])) }
    const selection = createClinicalDictationSelection(field, snapshot, 'Ana Sintética')
    const before = structuredClone({ body, snapshot, selection })
    const context = { dictatingField: true, body, selection, pendingIntent: null }
    expectParse('Preparar trecho', context, local('prepare'))
    const result = prepareClinicalDictation(selection, body, snapshot)
    assert.equal(result.intent.type, 'session.draft.update')
    assert.equal(result.intent.patch.operation, 'append')
    assert.equal(result.intent.patch.field, field)
    assert.equal(result.intent.patch.value, body)
    assert.deepEqual(result.intent.dictationSelection, selection)
    assert.deepEqual({ body, snapshot, selection }, before)
    assert.equal(context.body, body)
  })
}

for (const { name, run } of cases) test(name, { skip: missingModule ? 'Prerequisite module missing; no functional RED claimed' : false }, run)
