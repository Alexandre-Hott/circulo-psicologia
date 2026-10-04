import test from 'node:test'
import assert from 'node:assert/strict'
import { parseVoiceInterfaceCommand, applyVoiceInterfaceCommand } from '../src/voiceInterfaceCommands.js'

// Tests-only specification for generic Preencher on eligible TEXTAREA controls.
// IDs, labels, limits and ancestor structure mirror DesktopSessions/DesktopAgenda.
// The case-context record/epoch below are an INTENDED FUTURE patient-scoped
// contract, not metadata currently present in DesktopSessions. Production must
// supply that identity before these fields can safely accept multiline commands.
// This suite deliberately starts RED while only four clinical fields are allowed.
// Keep voiceClinicalMultiline.test.js unchanged: its library-denial assertion
// requires a separately coordinated update, not weakening here.
const fields = [
  { id: 'behavior-description', label: 'Descrição opcional', limit: 1000,
    formLabel: 'Comportamento reutilizável', record: 'behavior:synthetic-behavior', epoch: '3' },
  { id: 'case-demand', label: 'Demanda avaliada', limit: 4000,
    formLabel: 'Nova revisão do contexto do caso', record: 'context:ana', epoch: '7', futureContext: true },
  { id: 'case-objectives', label: 'Objetivos de trabalho', limit: 4000,
    formLabel: 'Nova revisão do contexto do caso', record: 'context:ana', epoch: '7', futureContext: true },
  { id: 'indicator-note-indicator-regulation', label: 'Nota contextual opcional · Regulação emocional', limit: 500,
    formId: 'session-draft', formLabel: 'Rascunho de sessão', record: 'synthetic-draft' },
  { id: 'addendum-synthetic-session', label: 'Texto do adendo (até 4000 caracteres)', limit: 4000,
    record: 'session:synthetic-session', sessionAncestor: true },
  { id: 'agenda-reason', label: 'Motivo administrativo (obrigatório)', limit: 240,
    formLabel: 'Alterar ocorrência individual', record: 'synthetic-series:2026-10-04' },
]
const breaks = [['LF', '\n'], ['CRLF', '\r\n'], ['LS', '\u2028'], ['PS', '\u2029']]

// Small DOM double only; the real parser/executor are imported, never imitated.
function dom(spec) {
  const events = []
  const prototype = {}
  Object.defineProperty(prototype, 'value', { set(value) { this.value = value } })
  const ownerDocument = { defaultView: {
    getComputedStyle: element => element.style,
    HTMLTextAreaElement: { prototype }, HTMLInputElement: { prototype }, HTMLSelectElement: { prototype },
    Event: class { constructor(type, options) { this.type = type; this.bubbles = options.bubbles } },
  } }
  function node(tagName, attributes = {}, parentElement = null) {
    const element = {
      tagName, attributes, parentElement, ownerDocument, isConnected: true,
      style: { display: 'block', visibility: 'visible' }, disabled: false,
      get id() { return this.attributes.id || '' },
      getAttribute(name) { return this.attributes[name] ?? null },
      hasAttribute(name) { return Object.hasOwn(this.attributes, name) },
      matches(selector) {
        return selector.split(',').some(part => {
          const query = part.trim()
          if (query === ':disabled') return this.disabled
          if (query === '.voice-command-center') return this.voiceCenter === true
          const match = /^(\w+)?(?:#([\w-]+))?(?:\[([\w-]+)(?:="([^"]*)")?\])?$/.exec(query)
          if (!match) return false
          return (!match[1] || match[1].toUpperCase() === this.tagName)
            && (!match[2] || match[2] === this.id)
            && (!match[3] || (match[4] === undefined ? this.hasAttribute(match[3]) : this.getAttribute(match[3]) === match[4]))
        })
      },
      closest(selector) {
        for (let ancestor = this; ancestor; ancestor = ancestor.parentElement) {
          if (ancestor.matches(selector)) return ancestor
        }
        return null
      },
      querySelector: () => null,
      scrollIntoView() {}, focus() {},
      dispatchEvent(event) { events.push([event.type, event.bubbles]) },
    }
    return element
  }
  const container = node('DETAILS'); container.open = true
  const recordAttributes = { 'data-voice-record': spec.record,
    ...(spec.epoch ? { 'data-voice-epoch': spec.epoch } : {}) }
  const session = spec.sessionAncestor ? node('LI', recordAttributes, container) : null
  const form = node('FORM', {
    ...(spec.formId ? { id: spec.formId } : {}),
    ...(spec.formLabel ? { 'aria-label': spec.formLabel } : {}),
    ...(!session ? recordAttributes : {}),
  }, session || container)
  const element = node('TEXTAREA', { id: spec.id, 'data-voice-label': spec.label }, form)
  Object.assign(element, { type: 'textarea', value: 'Base fictícia.', readOnly: false, maxLength: spec.limit })
  const root = { querySelector: () => null, querySelectorAll: () => [element] }
  ownerDocument.getElementById = id => [element, form].find(item => item.id === id) || null
  return { root, element, form, recordOwner: session || form, container, events }
}
const command = (spec, value) => `Preencher ${spec.label} com ${value}`
function draft(spec, fixture, value) {
  const result = parseVoiceInterfaceCommand(command(spec, value), fixture.root)
  assert.equal(result?.status, 'draft', result?.message || 'Expected a reviewable multiline proposal')
  assert.equal(result.intent.type, 'interface.control')
  assert.equal(result.intent.operation, 'fill')
  assert.equal(result.intent.target.id, spec.id)
  assert.equal(result.intent.target.record, spec.record)
  assert.equal(result.intent.target.epoch, spec.epoch || null)
  assert.equal(result.intent.value, value, 'Never normalize, repair, trim or truncate the payload')
  assert.ok(result.preview.includes(value))
  assert.equal(fixture.element.value, 'Base fictícia.', 'Preparing is not executing')
  return result.intent
}
function refused(spec, fixture, text = command(spec, 'Linha um.\nLinha dois.')) {
  const result = parseVoiceInterfaceCommand(text, fixture.root)
  assert.equal(result?.status, 'clarification', 'Must explicitly refuse, not silently return a proposal/null')
  assert.equal(result.intent, undefined)
  assert.equal(fixture.element.value, 'Base fictícia.')
  assert.deepEqual(fixture.events, [])
}

for (const spec of fields) {
  for (const [name, lineBreak] of breaks) {
    test(`${spec.id}: generic Preencher preserves literal ${name} through preview and confirmed DOM fill`, () => {
      const fixture = dom(spec)
      const value = `Linha um com sessão. ${lineBreak}${lineBreak}Linha dois como escrita?!  `
      const intent = draft(spec, fixture, value)
      applyVoiceInterfaceCommand(intent, fixture.root)
      assert.equal(fixture.element.value, value)
      assert.deepEqual(fixture.events, [['input', true], ['change', true]])
    })
    test(`${spec.id}: ${name} payload exactly maxLength ${spec.limit} is accepted`, () => {
      const fixture = dom(spec)
      const value = 'a'.repeat(spec.limit - lineBreak.length - 1) + lineBreak + '.'
      assert.equal(value.length, spec.limit)
      draft(spec, fixture, value)
    })
    test(`${spec.id}: ${name} payload one character over ${spec.limit} is refused without truncation`, () => {
      const fixture = dom(spec)
      const value = 'a'.repeat(spec.limit - lineBreak.length) + lineBreak + '.'
      assert.equal(value.length, spec.limit + 1)
      refused(spec, fixture, command(spec, value))
    })
    for (const [part, text] of [
      ['verb/header', `Preencher${lineBreak}${spec.label} com Linha um.\nLinha dois.`],
      ['field query', `Preencher ${spec.label}${lineBreak}extra com Linha um.\nLinha dois.`],
      ['query/separator', `Preencher ${spec.label}${lineBreak}com Linha um.\nLinha dois.`],
    ]) {
      test(`${spec.id}: ${name} in ${part} is not payload and is refused`, () => refused(spec, dom(spec), text))
    }
  }

  const unavailable = {
    readonly: fixture => { fixture.element.readOnly = true },
    disabled: fixture => { fixture.element.disabled = true },
    hidden: fixture => { fixture.element.attributes.hidden = '' },
    'hidden ancestor': fixture => { fixture.form.attributes.hidden = '' },
    inert: fixture => { fixture.form.attributes.inert = '' },
    'aria-hidden': fixture => { fixture.form.attributes['aria-hidden'] = 'true' },
    'display none': fixture => { fixture.form.style.display = 'none' },
    'visibility hidden': fixture => { fixture.element.style.visibility = 'hidden' },
    disconnected: fixture => { fixture.element.isConnected = false },
    'closed details': fixture => { fixture.container.open = false },
    'voice command center': fixture => { fixture.form.voiceCenter = true },
  }
  for (const [state, change] of Object.entries(unavailable)) {
    test(`${spec.id}: ${state} is refused even with an eligible ID and record`, () => {
      const fixture = dom(spec); change(fixture); refused(spec, fixture)
    })
  }
  for (const tag of ['INPUT', 'SELECT']) {
    test(`${spec.id}: unrelated ${tag} cannot gain multiline permission from a copied ID`, () => {
      const fixture = dom(spec)
      fixture.element.tagName = tag
      fixture.element.type = tag === 'INPUT' ? 'text' : 'select-one'
      fixture.element.options = [{ value: 'Linha um.\nLinha dois.', textContent: 'Linha um.\nLinha dois.', disabled: false }]
      refused(spec, fixture)
    })
  }
  test(`${spec.id}: ambiguous visible labels are refused rather than selecting the first textarea`, () => {
    const fixture = dom(spec), other = dom(spec)
    fixture.root.querySelectorAll = () => [fixture.element, other.element]
    refused(spec, fixture)
  })
  test(`${spec.id}: missing explicit record cannot authorize multiline`, () => {
    const fixture = dom(spec)
    delete fixture.recordOwner.attributes['data-voice-record']
    refused(spec, fixture)
  })
  test(`${spec.id}: copied ID in an unrelated patient form is refused`, () => {
    const fixture = dom(spec)
    fixture.form.attributes.id = 'patient-form'
    fixture.form.attributes['aria-label'] = 'Cadastro do paciente'
    fixture.recordOwner.attributes['data-voice-record'] = 'patient:ana'
    refused(spec, fixture)
  })
  test(`${spec.id}: prepared multiline is invalidated by a record change`, () => {
    const fixture = dom(spec), intent = draft(spec, fixture, 'Linha um.\nLinha dois.')
    fixture.recordOwner.attributes['data-voice-record'] = 'unrelated-record'
    assert.throws(() => applyVoiceInterfaceCommand(intent, fixture.root))
    assert.equal(fixture.element.value, 'Base fictícia.')
    assert.deepEqual(fixture.events, [])
  })
  for (const state of ['readonly', 'disabled', 'hidden', 'disconnected']) {
    test(`${spec.id}: ${state} after preview refuses confirmation`, () => {
      const fixture = dom(spec), intent = draft(spec, fixture, 'Linha um.\nLinha dois.')
      unavailable[state](fixture)
      assert.throws(() => applyVoiceInterfaceCommand(intent, fixture.root))
      assert.equal(fixture.element.value, 'Base fictícia.')
      assert.deepEqual(fixture.events, [])
    })
  }
  if (spec.epoch) {
    test(`${spec.id}: epoch/version change invalidates a prepared multiline proposal`, () => {
      const fixture = dom(spec), intent = draft(spec, fixture, 'Linha um.\nLinha dois.')
      fixture.recordOwner.attributes['data-voice-epoch'] = String(Number(spec.epoch) + 1)
      assert.throws(() => applyVoiceInterfaceCommand(intent, fixture.root))
      assert.equal(fixture.element.value, 'Base fictícia.')
      assert.deepEqual(fixture.events, [])
    })
  }
}

// Exact-ID contracts cannot be granted by a similar field spelling. Dynamic IDs
// must still correspond to their actual draft/session ancestor, not another one.
for (const index of [0, 1, 2, 5]) {
  const spec = fields[index]
  test(`${spec.id}: similar forged ID is refused despite matching visible label`, () => {
    const fixture = dom(spec)
    fixture.element.attributes.id += '-forged'
    refused(spec, fixture)
  })
}
test('indicator contextual note outside the active draft form is refused', () => {
  const spec = fields[3], fixture = dom(spec)
  fixture.form.attributes.id = 'unrelated-form'
  refused(spec, fixture)
})
test('addendum ID for another finalized session is refused', () => {
  const spec = fields[4], fixture = dom(spec)
  fixture.element.attributes.id = 'addendum-other-session'
  refused(spec, fixture)
})
for (const spec of fields.filter(item => item.futureContext)) {
  test(`${spec.id}: current context form without future patient metadata is explicitly refused`, () => {
    const fixture = dom(spec)
    delete fixture.form.attributes['data-voice-record']
    delete fixture.form.attributes['data-voice-epoch']
    refused(spec, fixture)
  })
}

// Author-confirmed lifecycle contract: start at the element, walk parentElement
// to null, collect every non-null data-voice-lifecycle nearest -> farthest.
// Fingerprint stores JSON.stringify(chain), or null for no tokens. Confirmation
// compares it strictly with target.lifecycle ?? null; tokens are opaque strings.
// These additive cases do not change the existing eligibility specifications.
function lifecycleDom(spec, input = false) {
  const fixture = dom(spec)
  // A farther ancestor with no record/version: nearest record and epoch stay
  // identical when its scope changes. The unmarked DETAILS remains in between.
  const outer = {
    ...fixture.form, tagName: 'DIV', attributes: {}, parentElement: null,
  }
  fixture.container.parentElement = outer
  fixture.outer = outer
  if (input) {
    fixture.element.tagName = 'INPUT'
    fixture.element.type = 'text'
    fixture.element.cloneNode = () => ({ value: '', checkValidity: () => true })
  }
  return fixture
}
const scopeAttribute = 'data-voice-lifecycle'
function markLifecycle(fixture) {
  fixture.form.attributes[scopeAttribute] = 'editor:3'
  fixture.container.attributes[scopeAttribute] = 'patient:ana:7'
  fixture.outer.attributes[scopeAttribute] = 'workspace:open:12'
}
function unchangedIdentity(spec, fixture, intent) {
  assert.equal(fixture.element.closest('[data-voice-record]').getAttribute('data-voice-record'), spec.record)
  assert.equal(fixture.element.closest('[data-voice-epoch]').getAttribute('data-voice-epoch'), spec.epoch)
  assert.equal(intent.target.record, spec.record)
  assert.equal(intent.target.epoch, spec.epoch)
}
function lifecycleRefusal(spec, fixture, intent) {
  unchangedIdentity(spec, fixture, intent)
  assert.throws(() => applyVoiceInterfaceCommand(intent, fixture.root))
  assert.equal(fixture.element.value, 'Base fictícia.')
  assert.deepEqual(fixture.events, [])
}

for (const input of [false, true]) {
  const spec = input
    ? { ...fields[0], id: 'behavior-title', label: 'Título descritivo', limit: 160 }
    : fields[0]
  const kind = input ? 'simple INPUT' : 'multiline TEXTAREA'
  const value = input ? 'Texto simples' : 'Linha um.\nLinha dois.'
  const prepare = fixture => draft(spec, fixture, value)

  test(`lifecycle ${kind}: same valid chain is accepted in nearest-to-farthest order, including the element`, () => {
    const fixture = lifecycleDom(spec, input)
    markLifecycle(fixture)
    fixture.element.attributes[scopeAttribute] = 'control:1'
    const intent = prepare(fixture)
    assert.equal(intent.target.lifecycle, JSON.stringify(['control:1', 'editor:3', 'patient:ana:7', 'workspace:open:12']))
    unchangedIdentity(spec, fixture, intent)
    applyVoiceInterfaceCommand(intent, fixture.root)
    assert.equal(fixture.element.value, value)
    assert.deepEqual(fixture.events, [['input', true], ['change', true]])
  })

  test(`lifecycle ${kind}: unmarked ancestors are omitted and empty-string tokens are retained`, () => {
    const fixture = lifecycleDom(spec, input)
    fixture.form.attributes[scopeAttribute] = ''
    fixture.outer.attributes[scopeAttribute] = 'workspace:open:12'
    const intent = prepare(fixture)
    assert.equal(intent.target.lifecycle, JSON.stringify(['', 'workspace:open:12']))
    applyVoiceInterfaceCommand(intent, fixture.root)
    assert.equal(fixture.element.value, value)
    assert.deepEqual(fixture.events, [['input', true], ['change', true]])
  })

  test(`lifecycle ${kind}: no marked ancestor yields null and accepts a legacy target without lifecycle`, () => {
    const fixture = lifecycleDom(spec, input), intent = prepare(fixture)
    assert.equal(intent.target.lifecycle, null)
    delete intent.target.lifecycle
    applyVoiceInterfaceCommand(intent, fixture.root)
    assert.equal(fixture.element.value, value)
    assert.deepEqual(fixture.events, [['input', true], ['change', true]])
  })

  test(`lifecycle ${kind}: a legacy target without lifecycle cannot confirm against a marked chain`, () => {
    const fixture = lifecycleDom(spec, input)
    markLifecycle(fixture)
    const intent = prepare(fixture)
    delete intent.target.lifecycle
    lifecycleRefusal(spec, fixture, intent)
  })

  test(`lifecycle ${kind}: adding a distant token to an originally unmarked chain invalidates confirmation`, () => {
    const fixture = lifecycleDom(spec, input), intent = prepare(fixture)
    assert.equal(intent.target.lifecycle, null)
    fixture.outer.attributes[scopeAttribute] = 'workspace:reopened:13'
    lifecycleRefusal(spec, fixture, intent)
  })

  const changes = {
    'distant ancestor token changes while nearest scope, record and epoch stay identical': fixture => {
      fixture.outer.attributes[scopeAttribute] = 'workspace:reopened:13'
    },
    'multiple ancestor tokens change while nearest scope, record and epoch stay identical': fixture => {
      fixture.container.attributes[scopeAttribute] = 'patient:ana:8'
      fixture.outer.attributes[scopeAttribute] = 'workspace:reopened:13'
    },
    'token is added on a previously unmarked element': fixture => {
      fixture.element.attributes[scopeAttribute] = 'control:1'
    },
    'intermediate ancestor token is removed': fixture => {
      delete fixture.container.attributes[scopeAttribute]
    },
    'all ancestor tokens are removed': fixture => {
      delete fixture.form.attributes[scopeAttribute]
      delete fixture.container.attributes[scopeAttribute]
      delete fixture.outer.attributes[scopeAttribute]
    },
    'same token set changes lineage order': fixture => {
      fixture.container.attributes[scopeAttribute] = 'workspace:open:12'
      fixture.outer.attributes[scopeAttribute] = 'patient:ana:7'
    },
    'ancestor token becomes an empty string, not an absent attribute': fixture => {
      fixture.outer.attributes[scopeAttribute] = ''
    },
  }
  for (const [name, change] of Object.entries(changes)) {
    test(`lifecycle ${kind}: ${name} rejects confirmation`, () => {
      const fixture = lifecycleDom(spec, input)
      markLifecycle(fixture)
      const intent = prepare(fixture)
      assert.equal(intent.target.lifecycle, JSON.stringify(['editor:3', 'patient:ana:7', 'workspace:open:12']))
      change(fixture)
      lifecycleRefusal(spec, fixture, intent)
    })
  }
}

test('lifecycle simple INPUT: valid scope chain never grants multiline permission', () => {
  const spec = { ...fields[0], id: 'behavior-title', label: 'Título descritivo', limit: 160 }
  const fixture = lifecycleDom(spec, true)
  markLifecycle(fixture)
  refused(spec, fixture, command(spec, 'Linha um.\nLinha dois.'))
})
