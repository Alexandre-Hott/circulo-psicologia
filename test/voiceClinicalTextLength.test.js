import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCentralCommand } from '../src/centralCommandRouter.js'
import { parseVoiceInterfaceCommand } from '../src/voiceInterfaceCommands.js'

const context = {
  patients: [{ id: 'ana', name: 'Ana Clara', archivedAt: null }],
  behaviors: [{ id: 'behavior', title: 'Pede ajuda', archivedAt: null }],
  activeSessionDraft: { id: 'draft-ana', patientId: 'ana', patientName: 'Ana Clara', originalDate: '2026-10-04' },
}
const fields = [
  ['observação', 'observation'], ['procedimentos', 'procedures'],
  ['resultado', 'outcomeDecision'], ['encaminhamento', 'referralClosure'],
]
const literal = length => {
  const seed = 'Ele disse “não abrir agenda”. Ána  Clara;  texto literal com apoio, sem diagnóstico. '
  return (seed.repeat(Math.ceil(length / seed.length))).slice(0, length - 1) + '!'
}
const parse = text => parseCentralCommand({ text, context })

for (const [field, key] of fields) {
  test(`${field}: 4000 caracteres literais mais prefixo completo são aceitos`, () => {
    const value = literal(4000)
    const text = `Preencher ${field} da sessão de Ana Clara com ${value}`
    assert.equal(value.length, 4000)
    assert.ok(text.length > 4000 && text.length < 4600)
    const snapshot = JSON.stringify(context)
    const result = parse(text)
    assert.equal(result.status, 'draft')
    assert.equal(result.code, undefined)
    assert.equal(result.intent.type, 'session.draft.update')
    assert.equal(result.intent.target.patientId, 'ana')
    assert.equal(result.intent.target.sessionDraftId, 'draft-ana')
    assert.deepEqual(result.intent.patch, { field: key, operation: 'replace', value })
    assert.equal(result.intent.patch.value.length, 4000)
    assert.ok(result.preview.includes(value))
    assert.equal(JSON.stringify(context), snapshot)
  })

  test(`${field}: 4001 caracteres são recusados, não truncados para 4000`, () => {
    const value = literal(4001)
    const result = parse(`Preencher ${field} da sessão de Ana Clara com ${value}`)
    assert.equal(result.status, 'clarification')
    assert.equal(result.intent, undefined)
    assert.match(result.message, /4000/u)
    assert.equal(result.code, 'clinical_text_limit')
    // Quoted empty payloads reach extraction, but must not receive the code
    // reserved for overflow or prepare an empty replacement.
    for (const empty of ['""', '“”', "''"]) {
      const refused = parse(`Preencher ${field} da sessão de Ana Clara com ${empty}`)
      assert.equal(refused.status, 'clarification')
      assert.equal(refused.intent, undefined)
      assert.equal(refused.code, undefined)
      assert.match(refused.message, /entre 1 e 4000/u)
    }
  })
}

test('comando clínico completo de 4600 caracteres preserva payload de 4000', () => {
  const value = literal(4000)
  const suffix = `observação da sessão de Ana Clara com ${value}`
  const text = `Preencher${' '.repeat(4600 - 'Preencher'.length - suffix.length)}${suffix}`
  assert.equal(text.length, 4600)
  const result = parse(text)
  assert.equal(result.status, 'draft')
  assert.equal(result.intent.patch.value, value)
})

test('teto 4601 recusa comando completo mesmo quando normalização comprime espaços', () => {
  for (const length of [4600, 4601]) {
    const text = `Abrir${' '.repeat(length - 'Abrir'.length - 'Agenda'.length)}Agenda`
    assert.equal(text.length, length)
    const result = parse(text)
    assert.equal(result.status, length === 4600 ? 'draft' : 'clarification')
    assert.equal(parse(` \n${text}\n `).status, result.status)
    if (length === 4601) {
      assert.equal(result.intent, undefined)
      assert.equal(result.code, undefined)
      assert.match(result.message, /4600/u)
    }
  }
})

test('4000 caracteres não dispensam paciente exato nem rascunho compatível', () => {
  const value = literal(4000)
  for (const [changed, reason] of [
    [{ ...context, activeSessionDraft: null }, /Abra primeiro um rascunho/u],
    [{ ...context, activeSessionDraft: { ...context.activeSessionDraft, patientId: 'other' } }, /Selecione a sessão de Ana Clara/u],
    [{ ...context, patients: [...context.patients, { ...context.patients[0], id: 'homonym' }] }, /mais de um paciente/u],
  ]) {
    const snapshot = JSON.stringify(changed)
    const result = parseCentralCommand({ text: `Preencher observação da sessão de Ana Clara com ${value}`, context: changed })
    assert.equal(result.status, 'clarification')
    assert.equal(result.intent, undefined)
    assert.equal(result.code, undefined)
    assert.match(result.message, reason)
    assert.doesNotMatch(result.message, /limite|caracteres/u)
    assert.equal(JSON.stringify(changed), snapshot)
  }
})

test('pacientes e títulos de biblioteca mantêm o limite menor de 160', () => {
  for (const [prefix, property] of [['Cadastrar paciente', 'name'], ['Criar comportamento', 'title']]) {
    const value = 'A'.repeat(160)
    const accepted = parse(`${prefix} ${value}`)
    assert.equal(accepted.status, 'draft')
    assert.equal(accepted.intent.draft[property], value)
    const refused = parse(`${prefix} ${value}A`)
    assert.equal(refused.status, 'clarification')
    assert.equal(refused.intent, undefined)
    assert.equal(refused.code, undefined)
    assert.match(refused.message, /160/u)
  }
})

test('descrição da biblioteca mantém o limite menor de 1000', () => {
  const value = literal(1000)
  const accepted = parse(`Criar comportamento Pede ajuda com descrição ${value}`)
  assert.equal(accepted.status, 'draft')
  assert.equal(accepted.intent.draft.description, value)
  const refused = parse(`Criar comportamento Pede ajuda com descrição ${literal(1001)}`)
  assert.equal(refused.status, 'clarification')
  assert.equal(refused.intent, undefined)
  assert.equal(refused.code, undefined)
  assert.match(refused.message, /1000/u)
})

// Minimal field DOM double: exercises the gateway's real maxLength check,
// without a browser, React, mutation handler or persistence API.
function fieldRoot(name, maxLength) {
  const element = {
    isConnected: true, parentElement: null, tagName: 'TEXTAREA', type: 'textarea',
    maxLength, readOnly: false,
    ownerDocument: { defaultView: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) } },
    closest: () => null,
    matches: () => false,
    getAttribute: key => key === 'data-voice-label' ? name : null,
    hasAttribute: () => false,
  }
  return { querySelector: () => null, querySelectorAll: () => [element] }
}

for (const [name, limit] of [['Nome', 160], ['Título descritivo', 160], ['Descrição opcional', 1000], ['Nota contextual de Participação', 500], ['Observações descritivas', 4000]]) {
  test(`gateway genérico respeita maxLength existente: ${name} (${limit})`, () => {
    const root = fieldRoot(name, limit)
    const value = 'Á'.repeat(limit)
    const accepted = parseVoiceInterfaceCommand(`Preencher ${name} com ${value}`, root)
    assert.equal(accepted.status, 'draft')
    assert.equal(accepted.intent.value, value)
    const refused = parseVoiceInterfaceCommand(`Preencher ${name} com ${value}Á`, root)
    assert.equal(refused.status, 'clarification')
    assert.equal(refused.intent, undefined)
    assert.equal(refused.code, undefined)
    assert.match(refused.message, new RegExp(String(limit), 'u'))
  })
}
