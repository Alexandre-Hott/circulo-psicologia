import test from 'node:test'
import assert from 'node:assert/strict'
import { parseVoiceInterfaceCommand, applyVoiceInterfaceCommand } from '../src/voiceInterfaceCommands.js'

// Functional RED for unchanged journey81 literals. No IPC, ASR or persistence.
// Normalize the command header for matching, never the clinical textarea body.
const fields = [
  { id: 'case-demand', label: 'Demanda avaliada', record: 'context:ana',
    body: 'Demanda inteiramente sintética; preservar MAIÚSCULAS.' },
  { id: 'case-objectives', label: 'Objetivos de trabalho', record: 'context:ana',
    body: 'Objetivos fictícios, sem interpretação clínica.' },
  { id: 'addendum-ana-afternoon', label: 'Texto do adendo (até 4000 caracteres)', record: 'session:ana-afternoon',
    body: 'Adendo SINTÉTICO: conteúdo literal, sem corrigir o original.' },
]

// DOM double follows voiceTextareaMultiline.test.js; parser/executor stay real.
function dom(spec, tag = 'TEXTAREA', type = 'textarea') {
  const events = []
  const prototype = {}
  Object.defineProperty(prototype, 'value', { set(value) { this.value = value } })
  const ownerDocument = { defaultView: {
    getComputedStyle: element => element.style,
    HTMLTextAreaElement: { prototype }, HTMLInputElement: { prototype }, HTMLSelectElement: { prototype },
    Event: class { constructor(type, options) { this.type = type; this.bubbles = options.bubbles } },
  } }
  function node(tagName, attributes, parentElement = null) {
    return {
      tagName, attributes, parentElement, ownerDocument, isConnected: true,
      style: { display: 'block', visibility: 'visible' }, disabled: false,
      get id() { return this.attributes.id || '' },
      getAttribute(name) { return this.attributes[name] ?? null },
      hasAttribute(name) { return Object.hasOwn(this.attributes, name) },
      matches(selector) {
        return selector.split(',').some(part => {
          if (part.trim() === ':disabled') return this.disabled
          const match = /^(\w+)?(?:#([\w-]+))?(?:\[([\w-]+)(?:="([^"]*)")?\])?$/.exec(part.trim())
          return Boolean(match && (!match[1] || match[1].toUpperCase() === this.tagName)
            && (!match[2] || match[2] === this.id)
            && (!match[3] || (match[4] === undefined ? this.hasAttribute(match[3]) : this.getAttribute(match[3]) === match[4])))
        })
      },
      closest(selector) {
        for (let ancestor = this; ancestor; ancestor = ancestor.parentElement) if (ancestor.matches(selector)) return ancestor
        return null
      },
      querySelector: () => null, scrollIntoView() {}, focus() {},
      cloneNode: () => ({ value: '', checkValidity: () => true }),
      dispatchEvent(event) { events.push([event.type, event.bubbles]) },
    }
  }
  const container = node('DETAILS', { 'data-voice-lifecycle': 'workspace:1' }); container.open = true
  const addendum = spec.id.startsWith('addendum-')
  const recordOwner = node(addendum ? 'LI' : 'FORM', {
    'data-voice-record': spec.record, 'data-voice-epoch': '7',
    'data-voice-lifecycle': 'editor:1',
    ...(!addendum ? { 'aria-label': 'Nova revisão do contexto do caso' } : {}),
  }, container)
  const form = addendum ? node('FORM', {}, recordOwner) : recordOwner
  const element = node(tag, { id: spec.id, 'data-voice-label': spec.label }, form)
  Object.assign(element, { type, value: '', readOnly: false, maxLength: 4000 })
  const root = { querySelector: () => null, querySelectorAll: () => [element] }
  ownerDocument.getElementById = id => [element, form].find(item => item.id === id) || null
  return { root, element, form, recordOwner, events }
}

function prepare(spec, fixture, body, prefix = 'Preencher') {
  const result = parseVoiceInterfaceCommand(`${prefix} ${spec.label} com ${body}`, fixture.root)
  assert.equal(result?.status, 'draft', result?.message)
  assert.equal(result.intent.type, 'interface.control')
  assert.equal(result.intent.operation, 'fill')
  assert.equal(result.intent.target.id, spec.id)
  assert.equal(result.intent.target.record, spec.record)
  assert.equal(fixture.element.value, '', 'prepare cannot fill the body')
  assert.deepEqual(fixture.events, [], 'prepare cannot dispatch input/change')
  return result
}

for (const spec of fields) {
  test(`${spec.id}: journey81 single-line literal is exact in proposal/preview`, () => {
    const result = prepare(spec, dom(spec), spec.body)
    assert.equal(result.intent.value, spec.body)
    assert.ok(result.preview.endsWith(spec.body))
  })
  test(`${spec.id}: real confirmed fill preserves journey81 punctuation`, () => {
    const fixture = dom(spec), result = prepare(spec, fixture, spec.body)
    applyVoiceInterfaceCommand(result.intent, fixture.root)
    assert.equal(fixture.element.value, spec.body)
    assert.deepEqual(fixture.events, [['input', true], ['change', true]])
  })
  for (const [name, opening, closing] of [['straight', '"', '"'], ['curly', '“', '”']]) {
    for (const [bodyKind, body] of [['plain body', 'Conteúdo sintético.'], ['quoted body', '“Conteúdo SINTÉTICO.”']]) {
      test(`${spec.id}: ${name} quoted header / ${bodyKind} preserves exact body or refuses`, () => {
        const fixture = dom(spec)
        const result = parseVoiceInterfaceCommand(`${opening}Preencher ${spec.label} com ${body}${closing}`, fixture.root)
        assert.equal(fixture.element.value, '', 'prepare never fills the body')
        assert.deepEqual(fixture.events, [])
        if (result?.status === 'draft') {
          assert.equal(result.intent.value, body, 'Never silently fall back to a cleaned clinical body')
          assert.ok(result.preview.endsWith(body))
          applyVoiceInterfaceCommand(result.intent, fixture.root)
          assert.equal(fixture.element.value, body)
          assert.deepEqual(fixture.events, [['input', true], ['change', true]])
        } else {
          assert.equal(result?.status, 'clarification', 'An ambiguous literal boundary requires explicit refusal')
          assert.equal(result.intent, undefined)
          assert.deepEqual(fixture.events, [])
        }
      })
    }
  }
  for (const [name, body] of [
    ['terminal punctuation', 'Literal sintético?!...'],
    ['quotes', '“Literal com Á e MAIÚSCULAS.”'],
    ['terminal spaces', 'Literal; sem reparo.  '],
  ]) test(`${spec.id}: preserves ${name} without clinical normalization`, () => {
    const result = prepare(spec, dom(spec), body)
    assert.equal(result.intent.value, body)
    assert.ok(result.preview.endsWith(body))
  })
  test(`${spec.id}: command case/outer spaces do not normalize the body`, () => {
    const result = prepare(spec, dom(spec), spec.body, '  pReEnChEr  ')
    assert.equal(result.intent.value, spec.body)
  })
  test(`${spec.id}: exactly 4000 characters preserve the terminal dot`, () => {
    const body = 'a'.repeat(3999) + '.'
    const result = prepare(spec, dom(spec), body)
    assert.equal(result.intent.value, body)
  })
  test(`${spec.id}: 4001 characters cannot fit by stripping punctuation`, () => {
    const fixture = dom(spec), body = 'a'.repeat(4000) + '.'
    const result = parseVoiceInterfaceCommand(`Preencher ${spec.label} com ${body}`, fixture.root)
    assert.equal(result?.status, 'clarification')
    assert.equal(result.intent, undefined)
    assert.equal(fixture.element.value, '')
    assert.deepEqual(fixture.events, [])
  })
  for (const [name, body] of [
    ['4000 with terminal space', 'a'.repeat(3999) + ' '],
    ['4000 UTF-16 units including terminal emoji', 'a'.repeat(3998) + '😀'],
    ['4000 UTF-16 units including emoji and punctuation', 'a'.repeat(3997) + '😀.'],
  ]) test(`${spec.id}: accepts and preserves ${name}`, () => {
    assert.equal(body.length, 4000, 'HTML maxLength counts UTF-16 units, not code points')
    const fixture = dom(spec), result = prepare(spec, fixture, body)
    assert.equal(result.intent.value, body)
    applyVoiceInterfaceCommand(result.intent, fixture.root)
    assert.equal(fixture.element.value, body)
  })
  for (const [name, body] of [
    ['4001 with terminal space', 'a'.repeat(4000) + ' '],
    ['4001 UTF-16 units including terminal emoji', 'a'.repeat(3999) + '😀'],
  ]) test(`${spec.id}: refuses ${name} without events or truncation`, () => {
    assert.equal(body.length, 4001)
    const fixture = dom(spec)
    const result = parseVoiceInterfaceCommand(`Preencher ${spec.label} com ${body}`, fixture.root)
    assert.equal(result?.status, 'clarification')
    assert.equal(result.intent, undefined)
    assert.equal(fixture.element.value, '')
    assert.deepEqual(fixture.events, [])
  })
  test(`${spec.id}: existing multiline literal still works`, () => {
    const fixture = dom(spec), body = 'Linha SINTÉTICA.\nOutra linha?!  '
    const result = prepare(spec, fixture, body)
    assert.equal(result.intent.value, body)
    applyVoiceInterfaceCommand(result.intent, fixture.root)
    assert.equal(fixture.element.value, body)
  })
  test(`${spec.id}: stale lifecycle cannot apply a single-line proposal`, () => {
    const fixture = dom(spec), result = prepare(spec, fixture, 'Literal sintético')
    fixture.recordOwner.attributes['data-voice-lifecycle'] = 'editor:2'
    assert.throws(() => applyVoiceInterfaceCommand(result.intent, fixture.root))
    assert.equal(fixture.element.value, '')
    assert.deepEqual(fixture.events, [])
  })
  test(`${spec.id}: duplicate visible fields refuse, never choose first`, () => {
    const fixture = dom(spec), other = dom(spec)
    fixture.root.querySelectorAll = () => [fixture.element, other.element]
    const result = parseVoiceInterfaceCommand(`Preencher ${spec.label} com ${spec.body}`, fixture.root)
    assert.equal(result?.status, 'clarification')
    assert.equal(result.intent, undefined)
    assert.equal(fixture.element.value, '')
    assert.equal(other.element.value, '')
  })
}

// Ineligible textareas must not acquire literal-body permission. Preserve their
// existing single-line grammar; multiline remains refused, not newly authorized.
function ineligibleCases(spec, name, change) {
  test(`${spec.id}: ${name} retains legacy single-line cleaning, not clinical preservation`, () => {
    const fixture = dom(spec); change(fixture)
    const result = parseVoiceInterfaceCommand(`Preencher ${spec.label} com Literal sintético.`, fixture.root)
    assert.equal(result?.status, 'draft')
    assert.equal(result.intent.value, 'Literal sintético')
    assert.equal(fixture.element.value, '')
    assert.deepEqual(fixture.events, [])
    applyVoiceInterfaceCommand(result.intent, fixture.root)
    assert.equal(fixture.element.value, 'Literal sintético')
    assert.deepEqual(fixture.events, [['input', true], ['change', true]])
  })
  test(`${spec.id}: ${name} still refuses multiline permission`, () => {
    const fixture = dom(spec); change(fixture)
    const result = parseVoiceInterfaceCommand(`Preencher ${spec.label} com Linha um.\nLinha dois.`, fixture.root)
    assert.equal(result?.status, 'clarification')
    assert.equal(result.intent, undefined)
    assert.equal(fixture.element.value, '')
    assert.deepEqual(fixture.events, [])
  })
}
ineligibleCases({ id: 'arbitrary-textarea', label: 'Campo sintético', record: 'context:ana' },
  'arbitrary ID even inside a marked clinical form', () => {})
for (const spec of fields.slice(0, 2)) {
  for (const [name, change] of [
    ['wrong form', fixture => { fixture.form.attributes['aria-label'] = 'Cadastro do paciente' }],
    ['wrong record kind', fixture => { fixture.recordOwner.attributes['data-voice-record'] = 'patient:ana' }],
    ['missing record', fixture => { delete fixture.recordOwner.attributes['data-voice-record'] }],
    ['empty record', fixture => { fixture.recordOwner.attributes['data-voice-record'] = '' }],
    ['missing epoch', fixture => { delete fixture.form.attributes['data-voice-epoch'] }],
    ['empty epoch', fixture => { fixture.form.attributes['data-voice-epoch'] = '' }],
    ['forged clinical ID', fixture => { fixture.element.attributes.id += '-forged' }],
  ]) ineligibleCases(spec, name, change)
}
const addendumSpec = fields[2]
for (const [name, change] of [
  ['wrong session record', fixture => { fixture.recordOwner.attributes['data-voice-record'] = 'session:other' }],
  ['missing session record', fixture => { delete fixture.recordOwner.attributes['data-voice-record'] }],
  ['empty session record', fixture => { fixture.recordOwner.attributes['data-voice-record'] = '' }],
  ['ID belongs to another session', fixture => { fixture.element.attributes.id = 'addendum-other' }],
  ['no form ancestor', fixture => { fixture.element.parentElement = fixture.recordOwner }],
  ['record is not on a session li', fixture => { fixture.recordOwner.tagName = 'ARTICLE' }],
]) ineligibleCases(addendumSpec, name, change)
test('addendum: absence of epoch does not invent a requirement outside existing eligibility', () => {
  const fixture = dom(addendumSpec)
  delete fixture.recordOwner.attributes['data-voice-epoch']
  const result = prepare(addendumSpec, fixture, addendumSpec.body)
  assert.equal(result.intent.value, addendumSpec.body)
})

// Controls that are not literal clinical text retain normalization/eligibility.
for (const [label, type, body, expected, attrs] of [
  ['De', 'date', '01/09/2026.', '2026-09-01', {}],
  ['Horário', 'time', '15:00.', '15:00', {}],
  ['Idade', 'text', 'oito.', '8', { 'data-voice-value-type': 'age' }],
  ['Paciente', 'select-one', 'Ana Clara.', 'ana', {}],
]) test(`nontext ${type}: existing value normalization remains unchanged`, () => {
  const spec = { id: `synthetic-${type}`, label, record: 'synthetic-controls' }
  const fixture = dom(spec, type === 'select-one' ? 'SELECT' : 'INPUT', type)
  Object.assign(fixture.element.attributes, attrs)
  fixture.element.options = [{ value: 'ana', textContent: 'Ana Clara', disabled: false }]
  const result = prepare(spec, fixture, body)
  assert.equal(result.intent.value, expected)
  applyVoiceInterfaceCommand(result.intent, fixture.root)
  assert.equal(fixture.element.value, expected)
})
for (const type of ['password', 'file']) test(`manual ${type}: body preservation cannot authorize protected input`, () => {
  const spec = { id: `synthetic-${type}`, label: 'Entrada manual', record: 'synthetic-controls' }
  const fixture = dom(spec, 'INPUT', type)
  const result = parseVoiceInterfaceCommand('Preencher Entrada manual com Literal.', fixture.root)
  assert.equal(result?.status, 'clarification')
  assert.equal(result.intent, undefined)
  assert.equal(fixture.element.value, '')
  assert.deepEqual(fixture.events, [])
})
