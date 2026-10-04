import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCentralCommand } from '../src/centralCommandRouter.js'
import { parseVoiceInterfaceCommand } from '../src/voiceInterfaceCommands.js'
import { validateClinicalTextAppend } from '../src/clinicalTextAppend.js'

// Real parsers, no handler/IPC/browser. Only the generic visible textarea is a
// DOM double. Values deliberately end in letters to avoid punctuation cleanup.
const fields = [
  ['observação', 'observation', 'Observações descritivas'],
  ['procedimentos', 'procedures', 'Procedimentos realizados'],
  ['resultado', 'outcomeDecision', 'Resultado e decisão'],
  ['encaminhamento', 'referralClosure', 'Encaminhamento ou encerramento (opcional)'],
]
function contextFor(key, base = 'Base fictícia.\nEdição manual não salva') {
  return {
    space: 'sessions',
    patients: [{ id: 'ana', name: 'Ana Clara', archivedAt: null }],
    activeSessionDraft: {
      id: 'draft-ana', patientId: 'ana', patientName: 'Ana Clara', originalDate: '2026-10-04',
      observation: 'Versão salva diferente', procedures: 'Versão salva diferente',
      outcomeDecision: 'Versão salva diferente', referralClosure: 'Versão salva diferente',
    },
    clinicalTextSnapshot: {
      patientId: 'ana', sessionDraftId: 'draft-ana', epoch: 3, revision: 69,
      values: { observation: '', procedures: '', outcomeDecision: '', referralClosure: '', [key]: base },
    },
  }
}
const fieldIds = {
  observation: 'session-observation', procedures: 'session-procedures',
  outcomeDecision: 'session-outcome-decision', referralClosure: 'session-referral-closure',
}
function fieldRoot(label, key, { id = fieldIds[key], formId = 'session-draft', tagName = 'TEXTAREA' } = {}) {
  const ownerDocument = { defaultView: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) } }
  const form = {
    id: formId, tagName: 'FORM', isConnected: true, parentElement: null, ownerDocument,
    closest: () => null, querySelector: () => null,
    matches: selector => selector === 'form' || selector === `form#${formId}`,
    getAttribute: name => ({ id: formId, 'aria-label': 'Rascunho de sessão', 'data-voice-record': 'draft-ana' })[name] ?? null,
    hasAttribute: () => false,
  }
  const element = {
    id, value: 'Texto fictício anterior', isConnected: true,
    parentElement: form, tagName, type: tagName === 'INPUT' ? 'text' : tagName === 'SELECT' ? 'select-one' : 'textarea',
    maxLength: 4000, readOnly: false, ownerDocument,
    closest: selector => selector === 'form' || selector === `form#${formId}`
      || selector === 'li, form, article, [role="dialog"], [role="alertdialog"]' ? form : null,
    matches: selector => selector === 'textarea' ? tagName === 'TEXTAREA' : selector === `#${id}`,
    hasAttribute: () => false,
    getAttribute: name => name === 'id' ? id : name === 'data-voice-label' ? label : null,
  }
  ownerDocument.getElementById = requested => requested === id ? element : requested === formId ? form : null
  return { element, form, querySelector: () => null, querySelectorAll: () => [element] }
}
function parse(kind, field, value, context, root) {
  const [name, , label] = field
  if (kind === 'generic') return parseVoiceInterfaceCommand(`Preencher ${label} com ${value}`, root)
  return parseCentralCommand({ text: `${kind === 'append' ? 'Acrescentar' : 'Preencher'} ${name} da sessão de Ana Clara com ${value}`, context })
}
function accepted(kind, field, value, context, root) {
  const before = structuredClone(context)
  const previous = root.element.value
  const result = parse(kind, field, value, context, root)
  assert.deepEqual(context, before, 'preparar não muda snapshot live ou cadastro')
  assert.equal(root.element.value, previous, 'preparar não escreve no textarea')
  assert.equal(result?.status, 'draft')
  if (kind === 'generic') {
    assert.equal(result.intent.type, 'interface.control')
    assert.equal(result.intent.operation, 'fill')
    assert.equal(result.intent.target.id, root.element.id)
    assert.equal(result.intent.value, value)
  } else {
    assert.equal(result.intent.type, 'session.draft.update')
    assert.equal(result.intent.target.patientId, 'ana')
    assert.equal(result.intent.target.sessionDraftId, 'draft-ana')
    assert.equal(result.intent.patch.field, field[1])
    assert.equal(result.intent.patch.operation, kind === 'append' ? 'append' : 'replace')
    assert.equal(result.intent.patch.value, value)
    if (kind === 'append') {
      const base = context.clinicalTextSnapshot.values[field[1]]
      assert.deepEqual(result.intent.patch, {
        field: field[1], operation: 'append', value, separator: ' ',
        baseValue: base, baseEpoch: 3, baseRevision: 69,
      })
      assert.equal(validateClinicalTextAppend(result.intent.target, result.intent.patch, context.clinicalTextSnapshot), base ? `${base} ${value}` : value)
    }
  }
  assert.ok(result.preview.includes(value), 'prévia mantém quebras e texto literal')
}

for (const field of fields) {
  for (const [breakName, newline] of [['LF', '\n'], ['CRLF', '\r\n']]) {
    for (const kind of ['replace', 'append', 'generic']) {
      test(`${field[1]} ${kind}: ${breakName} literal dentro do payload`, () => {
        const value = `Ána  disse “com apoio”${newline}Segunda linha; seção literal${newline}FIM`
        accepted(kind, field, value, contextFor(field[1]), fieldRoot(field[2], field[1]))
      })
    }
  }
  for (const kind of ['replace', 'append', 'generic']) {
    test(`${field[1]} ${kind}: 4000 inclui newline e base live/separador no append`, () => {
      const context = contextFor(field[1], 'Base\r\nmanual')
      const overhead = kind === 'append' ? context.clinicalTextSnapshot.values[field[1]].length + 1 : 0
      const value = 'Á\r\n' + 'B'.repeat(4000 - overhead - 3)
      assert.equal(overhead + value.length, 4000)
      accepted(kind, field, value, context, fieldRoot(field[2], field[1]))
    })
    test(`${field[1]} ${kind}: 4001 incluindo newline é recusado sem truncamento`, () => {
      const context = contextFor(field[1], 'Base\r\nmanual')
      const before = structuredClone(context)
      const root = fieldRoot(field[2], field[1])
      const overhead = kind === 'append' ? context.clinicalTextSnapshot.values[field[1]].length + 1 : 0
      const value = 'Á\r\n' + 'B'.repeat(4001 - overhead - 3)
      assert.equal(overhead + value.length, 4001)
      const result = parse(kind, field, value, context, root)
      assert.deepEqual(context, before)
      assert.equal(root.element.value, 'Texto fictício anterior')
      assert.equal(result?.status, 'clarification')
      assert.equal(result.intent, undefined)
      assert.match(result.message, /4000/u)
      if (kind !== 'generic') assert.equal(result.code, 'clinical_text_limit')
    })
  }
}

test('newline no cabeçalho/paciente ou ação composta fora do payload não prepara intenção', () => {
  const context = contextFor('observation')
  const before = structuredClone(context)
  for (const text of [
    'Preencher observação da sessão de Ana\nClara com Texto literal',
    'Acrescentar observação da sessão de Ana\r\nClara com Texto literal',
    'Preencher\nobservação da sessão de Ana Clara com Texto literal',
    'Acrescentar observação da sessão de Ana Clara\nabrir Agenda com Texto literal',
    'Abrir Agenda\nPreencher observação da sessão de Ana Clara com Texto literal',
  ]) {
    const result = parseCentralCommand({ text, context })
    assert.equal(result.status, 'clarification', text)
    assert.equal(result.intent, undefined, text)
    assert.deepEqual(context, before)
  }
  const root = fieldRoot(fields[0][2], fields[0][1])
  for (const text of [
    'Preencher Observações\ndescritivas com Texto literal',
    'Abrir Agenda\nPreencher Observações descritivas com Texto literal',
  ]) {
    const result = parseVoiceInterfaceCommand(text, root)
    assert.notEqual(result?.status, 'draft', text)
    assert.equal(result?.intent, undefined)
    assert.equal(root.element.value, 'Texto fictício anterior')
  }
})

test('nova linha falada permanece texto literal, nunca infere uma quebra', () => {
  for (const field of fields) for (const kind of ['replace', 'append', 'generic']) {
    accepted(kind, field, 'Pediu ajuda nova linha manteve atenção', contextFor(field[1]), fieldRoot(field[2], field[1]))
  }
})

for (const [description, options] of [
  ['ID errado mesmo com rótulo clínico', { id: 'unrelated-observation' }],
  ['mesmo ID/rótulo em outro formulário', { formId: 'unrelated-form' }],
  // Intentional semantic change in 71: library description now accepts literal
  // multiline in its eligible behavior form (covered by the separate suite).
  // Retain refusal here only for the copied ID outside that eligible form.
  ['descrição da biblioteca fora do formulário elegível', { id: 'behavior-description', formId: 'unrelated-form' }],
  ['input com ID/rótulo clínico', { tagName: 'INPUT' }],
  ['select com ID/rótulo clínico', { tagName: 'SELECT' }],
]) {
  test(`gateway multiline recusa ${description}`, () => {
    const field = fields[0]
    const root = fieldRoot(field[2], field[1], options)
    const context = contextFor(field[1])
    const before = structuredClone(context)
    const result = parse('generic', field, 'Texto fictício\nSegunda linha', context, root)
    assert.notEqual(result?.status, 'draft')
    assert.equal(result?.intent, undefined)
    assert.equal(root.element.value, 'Texto fictício anterior')
    assert.deepEqual(context, before)
  })
}
