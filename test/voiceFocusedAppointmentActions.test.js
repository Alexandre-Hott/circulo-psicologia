import test from 'node:test'
import assert from 'node:assert/strict'
import { parseVoiceInterfaceCommand, applyVoiceInterfaceCommand } from '../src/voiceInterfaceCommands.js'

// Frozen RED specification after 0.2.76. Coordinator's attribute contract:
// Only an existing button INSIDE the explicitly focused detail receives
// data-voice-focused-appointment-action=edit|start and the following identity
// suffixes: id, patient-id, patient, series-id, original-date, date, start, end.
// series-id='' represents null. Preserve full aria-labels, never add a global
// short data-voice-label/alias or reuse data-voice-appointment-details.
// action=agenda:<edit|start>:<id>; record=JSON(['occurrence',id,patientId,
// seriesId|null,originalDate]); epoch=voiceInstance/seriesRevision/detailsRevision.
// Ancestor panel marks data-voice-focused-occurrence and -patient ONLY while
// detailsOpen && focusedOccurrenceId && !selected. Fingerprint the entire
// lifecycle chain, all identity metadata, action, record, epoch and focus.
// This uses the real parser/executor with synthetic DOM and handler spies.
// Eligibility is represented by existing buttons/disabled state, as in React:
// completed renders neither action; archived renders edit but no start.
// No native profile, persistence, router, backend, audio or UI integration.
// Phase before Curie's P2 additions: 223 tests, 118 pass, 105 fail, exit 1
// against 0.2.76. The final freeze/hash is reported after the expanded RED.

const prefix = 'data-voice-focused-appointment-'
const labels = { edit: 'Alterar', start: 'Iniciar sessão' }
const synthetic = (overrides = {}) => ({
  id: '00000000-0000-4000-8000-000000000001', patientId: 'synthetic-patient-1',
  patient: 'Ana Sintética', seriesId: 'synthetic-series-1',
  originalDate: '2026-10-03', date: '2026-10-04', start: '15:00', end: '15:50',
  status: 'scheduled', archived: false, ...overrides,
})
const fullLabel = (action, occurrence) => `${action === 'edit' ? 'Alterar ocorrência' : labels.start} de ${occurrence.patient} em ${occurrence.date} às ${occurrence.start}–${occurrence.end}`

function dom({ occurrence = synthetic(), calendar = false, focused = true, selected = false } = {}) {
  const nodes = [], buttons = [], calls = [], effects = { editor: null, draft: null, writes: 0, focus: 0, scroll: 0 }
  const ownerDocument = { defaultView: { getComputedStyle: element => element.style } }
  function node(tagName, attributes = {}, parentElement = null, textContent = '') {
    const element = {
      tagName, attributes, parentElement, textContent, ownerDocument,
      isConnected: true, disabled: false, style: { display: 'block', visibility: 'visible' },
      get id() { return this.attributes.id || '' },
      getAttribute(name) { return this.attributes[name] ?? null },
      hasAttribute(name) { return Object.hasOwn(this.attributes, name) },
      matches(selector) {
        return selector.split(',').some(part => {
          const query = part.trim()
          if (query === ':disabled') return this.disabled
          if (query === '.voice-command-center') return false
          const match = /^(\w+)?(?:#([\w-]+))?((?:\[[^\]]+\])*)$/.exec(query)
          if (!match || (!match[1] && !match[2] && !match[3])) return false
          if (match[1] && match[1].toUpperCase() !== this.tagName) return false
          if (match[2] && match[2] !== this.id) return false
          return [...match[3].matchAll(/\[([\w-]+)(?:(\^?=)"([^"]*)")?\]/g)].every(([, key, op, value]) =>
            !op ? this.hasAttribute(key) : op === '^=' ? this.getAttribute(key)?.startsWith(value) : this.getAttribute(key) === value)
        })
      },
      closest(selector) {
        for (let current = this; current; current = current.parentElement) if (current.matches(selector)) return current
        return null
      },
      contains(other) {
        for (let current = other; current; current = current.parentElement) if (current === this) return true
        return false
      },
      querySelectorAll(selector) { return nodes.filter(other => other !== this && this.contains(other) && other.matches(selector)) },
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null },
      cloneNode() { return { textContent: this.textContent, querySelectorAll: () => [] } },
      scrollIntoView() { effects.scroll++ }, focus() { effects.focus++ },
      click() { this.handler?.() },
    }
    nodes.push(element)
    return element
  }
  const space = node('SECTION', { 'data-voice-lifecycle': 'synthetic-space-1' })
  const agenda = node('SECTION', { 'data-voice-lifecycle': 'loaded-range-1:options-1' }, space)
  const calendarPanel = node('SECTION', { 'aria-label': 'Calendário dia' }, agenda)
  const panel = node('SECTION', {
    id: 'agenda-details-panel', 'aria-label': 'Detalhes e ações dos compromissos',
    'data-voice-lifecycle': 'details-open-1:focus-1',
    ...(focused && !selected ? {
      'data-voice-focused-occurrence': occurrence.id,
      'data-voice-focused-patient': occurrence.patientId,
    } : {}),
  }, agenda)
  const card = node('LI', { 'aria-label': occurrence.patient, 'data-voice-lifecycle': 'detail-card-1' }, panel)
  if (selected) node('FORM', { 'aria-label': 'Alterar ocorrência individual', 'data-voice-record': 'synthetic-editor' }, agenda)
  function add(action, o = occurrence, parent = card, marked = focused && !selected) {
    const attrs = {
      'aria-label': fullLabel(action, o), 'data-voice-action': `agenda:${action}:${o.id}`,
      'data-voice-record': JSON.stringify(['occurrence', o.id, o.patientId, o.seriesId, o.originalDate]),
      'data-voice-epoch': 'voice-instance-1:series-revision-7:details-revision-3',
    }
    if (marked) Object.assign(attrs, Object.fromEntries(Object.entries({
      action, id: o.id, 'patient-id': o.patientId, patient: o.patient,
      'series-id': o.seriesId ?? '', 'original-date': o.originalDate,
      date: o.date, start: o.start, end: o.end,
    }).map(([key, value]) => [prefix + key, value])))
    const button = node('BUTTON', attrs, parent, labels[action])
    button.type = 'button'
    button.handler = () => {
      calls.push({ action, id: o.id, patientId: o.patientId, surface: parent === card ? 'detail' : 'calendar' })
      if (action === 'edit') effects.editor = o.id
      else effects.draft = o.id // Spy for existing validated start handler, not a backend simulation.
    }
    buttons.push(button)
    return button
  }
  // Calendar controls deliberately precede the detail in inventory order.
  if (calendar && occurrence.status !== 'completed') {
    add('edit', occurrence, calendarPanel, false)
    if (!occurrence.archived) add('start', occurrence, calendarPanel, false)
  }
  const controls = {}
  if (occurrence.status !== 'completed') {
    controls.edit = add('edit')
    if (!occurrence.archived) controls.start = add('start')
  }
  const root = {
    querySelectorAll: selector => nodes.filter(element => element.matches(selector)),
    querySelector: selector => nodes.find(element => element.matches(selector)) || null,
  }
  ownerDocument.getElementById = id => nodes.find(element => element.id === id) || null
  return { root, nodes, buttons, controls, panel, card, space, agenda, calendarPanel, occurrence, calls, effects, add, node }
}

function snapshot(fixture) {
  return JSON.stringify({ calls: fixture.calls, effects: fixture.effects, attrs: fixture.nodes.map(node => node.attributes) })
}
function prepare(fixture, command) {
  const before = snapshot(fixture)
  const result = parseVoiceInterfaceCommand(command, fixture.root)
  assert.equal(snapshot(fixture), before, 'prepare must not click, focus, scroll, open editor, start draft or write')
  assert.equal(result?.status, 'draft', result?.message || command)
  assert.equal(result.intent.type, 'interface.control')
  assert.equal(result.intent.operation, 'click')
  return result
}
function refuse(fixture, command) {
  const before = snapshot(fixture)
  assert.equal(parseVoiceInterfaceCommand(command, fixture.root)?.status, 'clarification', command)
  assert.equal(snapshot(fixture), before)
}
function obsolete(fixture, intent) {
  const before = snapshot(fixture)
  assert.throws(() => applyVoiceInterfaceCommand(intent, fixture.root))
  assert.equal(snapshot(fixture), before, 'obsolete confirmation must have no effects')
}
const short = action => `Clicar em ${labels[action]}`

for (const action of ['edit', 'start']) {
  for (const clickPrefix of ['Clicar em ', 'Clique no botão ', 'Clica em ', 'Acionar ', 'Acione ', 'Apertar ', 'Aperte ']) {
    test(`${action}: ${clickPrefix}prepara sem efeitos e confirma handler do detalhe`, () => {
      const f = dom()
      const result = prepare(f, clickPrefix + labels[action])
      assert.equal(result.intent.target.action, `agenda:${action}:${f.occurrence.id}`)
      assert.equal(result.intent.target.record, f.controls[action].getAttribute('data-voice-record'))
      assert.equal(result.intent.target.epoch, f.controls[action].getAttribute('data-voice-epoch'))
      assert.equal(result.intent.target.lifecycle, JSON.stringify(['detail-card-1', 'details-open-1:focus-1', 'loaded-range-1:options-1', 'synthetic-space-1']))
      applyVoiceInterfaceCommand(result.intent, f.root)
      assert.deepEqual(f.calls, [{ action, id: f.occurrence.id, patientId: f.occurrence.patientId, surface: 'detail' }])
      assert.equal(f.effects.editor, action === 'edit' ? f.occurrence.id : null)
      assert.equal(f.effects.draft, action === 'start' ? f.occurrence.id : null)
      assert.equal(f.effects.writes, 0)
    })
  }
  test(`${action}: preview nome/data efetiva/intervalo/ação sem identidade interna`, () => {
    const f = dom()
    const result = prepare(f, short(action))
    assert.ok(result.preview.includes(f.occurrence.patient))
    assert.ok(result.preview.includes('2026-10-04') || result.preview.includes('04/10/2026'))
    for (const value of ['15:00', '15:50', labels[action]]) assert.ok(result.preview.includes(value), result.preview)
    for (const value of [f.occurrence.id, f.occurrence.patientId, f.occurrence.seriesId, f.occurrence.originalDate]) assert.ok(!result.preview.includes(value), result.preview)
    assert.ok(!(result.notes || []).some(note => /apenas abre os detalhes/iu.test(note)))
    assert.equal(f.controls[action].getAttribute('aria-label'), fullLabel(action, f.occurrence))
    for (const attribute of ['data-voice-label', 'data-voice-alias', 'data-voice-appointment-details']) assert.equal(f.controls[action].hasAttribute(attribute), false)
  })
  test(`${action}: calendário duplicado não captura o curto antes do detalhe`, () => {
    const f = dom({ calendar: true })
    applyVoiceInterfaceCommand(prepare(f, short(action)).intent, f.root)
    assert.deepEqual(f.calls, [{ action, id: f.occurrence.id, patientId: f.occurrence.patientId, surface: 'detail' }])
  })
  test(`${action}: homônimos com mesma data/intervalo escolhem foco explícito, nunca primeiro`, () => {
    const f = dom({ calendar: true })
    const other = synthetic({ id: '00000000-0000-4000-8000-000000000002', patientId: 'synthetic-patient-2' })
    const first = f.add(action, other, f.calendarPanel, false)
    f.nodes.splice(f.nodes.indexOf(first), 1)
    f.nodes.unshift(first)
    applyVoiceInterfaceCommand(prepare(f, short(action)).intent, f.root)
    assert.deepEqual(f.calls, [{ action, id: f.occurrence.id, patientId: f.occurrence.patientId, surface: 'detail' }])
  })
  test(`${action}: avulsa series-id vazio concorda com null no record`, () => {
    const f = dom({ occurrence: synthetic({ seriesId: null }) })
    assert.equal(f.controls[action].getAttribute(prefix + 'series-id'), '')
    applyVoiceInterfaceCommand(prepare(f, short(action)).intent, f.root)
    assert.equal(f.calls[0].surface, 'detail')
  })
  test(`${action}: rótulo legado completo sem marca continua funcionando`, () => {
    const f = dom({ focused: false })
    applyVoiceInterfaceCommand(prepare(f, `Clicar em ${fullLabel(action, f.occurrence)}`).intent, f.root)
    assert.equal(f.calls.length, 1)
    assert.equal(f.calls[0].action, action)
  })
  test(`${action}: dois pacientes/ocorrências com rótulo completo igual competem`, () => {
    const f = dom({ focused: false })
    f.add(action, synthetic({ id: 'other-occurrence', patientId: 'other-patient' }), f.calendarPanel, false)
    refuse(f, `Clicar em ${fullLabel(action, f.occurrence)}`)
  })
  for (const [name, options] of [
    ['sem foco/detalhes gerais', { focused: false }],
    ['editor aberto', { selected: true }],
    ['completed sem botões existentes', { occurrence: synthetic({ status: 'completed' }) }],
  ]) test(`${action}: ${name} não autoriza curto`, () => refuse(dom(options), short(action)))
  for (const state of ['disabled', 'hidden', 'inert', 'disconnected']) {
    test(`${action}: controle ${state} não autoriza curto`, () => {
      const f = dom()
      if (state === 'disabled') f.controls[action].disabled = true
      if (state === 'hidden') f.panel.attributes.hidden = ''
      if (state === 'inert') f.panel.attributes.inert = ''
      if (state === 'disconnected') f.controls[action].isConnected = false
      refuse(f, short(action))
    })
  }
  for (const mode of ['alias', 'exact']) {
    test(`${action}: concorrente visível ${mode} compete com foco`, () => {
      const f = dom()
      const other = f.add(action, synthetic({ id: 'other', patientId: 'other-patient' }), f.calendarPanel, false)
      other.attributes = { 'aria-label': mode === 'exact' ? labels[action] : 'Outra ação', ...(mode === 'alias' ? { 'data-voice-alias': labels[action] } : {}) }
      refuse(f, short(action))
    })
    test(`${action}: novo concorrente ${mode} torna confirmação obsoleta`, () => {
      const f = dom()
      const result = prepare(f, short(action))
      const other = f.add(action, synthetic({ id: 'other' }), f.calendarPanel, false)
      other.attributes = { 'aria-label': mode === 'exact' ? labels[action] : 'Outra ação', ...(mode === 'alias' ? { 'data-voice-alias': labels[action] } : {}) }
      obsolete(f, result.intent)
    })
  }
  test(`${action}: alias igual mas oculto não compete`, () => {
    const f = dom()
    const other = f.add(action, synthetic({ id: 'other' }), f.calendarPanel, false)
    other.attributes = { 'aria-label': 'Outra ação', 'data-voice-alias': labels[action], hidden: '' }
    applyVoiceInterfaceCommand(prepare(f, short(action)).intent, f.root)
    assert.equal(f.calls[0].surface, 'detail')
  })
  test(`${action}: duplicata marcada idêntica dentro do detalhe recusa`, () => {
    const f = dom()
    f.add(action)
    refuse(f, short(action))
  })
  test(`${action}: duas marcações de foco concorrentes recusam`, () => {
    const f = dom()
    const o = synthetic({ id: 'other-occurrence', patientId: 'other-patient' })
    const otherPanel = f.node('SECTION', { 'data-voice-focused-occurrence': o.id, 'data-voice-focused-patient': o.patientId, 'data-voice-lifecycle': 'other-focus' }, f.agenda)
    f.add(action, o, f.node('LI', { 'aria-label': o.patient }, otherPanel), true)
    refuse(f, short(action))
  })
  test(`${action}: marcação copiada no calendário não substitui detalhe ausente`, () => {
    const f = dom({ calendar: true })
    f.buttons.find(button => button.parentElement === f.calendarPanel && button.textContent === labels[action]).attributes = { ...f.controls[action].attributes }
    f.controls[action].isConnected = false
    refuse(f, short(action))
  })
  for (const label of ['Alterar ocorrência individual', 'Encerrar série recorrente']) {
    test(`${action}: editor ${label} bloqueia curto mesmo com marca residual`, () => {
      const f = dom()
      f.node('FORM', { 'aria-label': label }, f.agenda)
      refuse(f, short(action))
    })
    test(`${action}: editor ${label} aberto depois de preparar invalida curto`, () => {
      const f = dom()
      const result = prepare(f, short(action))
      f.node('FORM', { 'aria-label': label }, f.agenda)
      obsolete(f, result.intent)
    })
  }
  test(`${action}: drawer de criação aberto por si só permite foco existente`, () => {
    const f = dom()
    f.node('FORM', { 'aria-label': 'Novo compromisso' }, f.agenda)
    applyVoiceInterfaceCommand(prepare(f, short(action)).intent, f.root)
    assert.equal(f.calls[0].surface, 'detail')
  })
}

test('archived: start ausente recusa; Alterar existente permanece elegível', () => {
  const f = dom({ occurrence: synthetic({ archived: true }) })
  refuse(f, short('start'))
  applyVoiceInterfaceCommand(prepare(f, short('edit')).intent, f.root)
  assert.equal(f.effects.editor, f.occurrence.id)
  assert.equal(f.effects.draft, null)
})

const inconsistent = [
  ['id', (f, b) => { b.attributes[prefix + 'id'] = 'other-occurrence' }],
  ['patient-id', (f, b) => { b.attributes[prefix + 'patient-id'] = 'other-patient' }],
  ['series-id', (f, b) => { b.attributes[prefix + 'series-id'] = 'other-series' }],
  ['original-date', (f, b) => { b.attributes[prefix + 'original-date'] = '2026-10-02' }],
  ['action', (f, b) => { b.attributes['data-voice-action'] = 'agenda:details:' + f.occurrence.id }],
  ['record', (f, b) => { b.attributes['data-voice-record'] = JSON.stringify(['occurrence', f.occurrence.id, 'other-patient', f.occurrence.seriesId, f.occurrence.originalDate]) }],
  ['record inválido', (f, b) => { b.attributes['data-voice-record'] = '{invalid' }],
  ['record de tamanho inválido', (f, b) => { b.attributes['data-voice-record'] = JSON.stringify(['occurrence', f.occurrence.id]) }],
  ['panel occurrence', f => { f.panel.attributes['data-voice-focused-occurrence'] = 'other-occurrence' }],
  ['panel patient', f => { f.panel.attributes['data-voice-focused-patient'] = 'other-patient' }],
  ['epoch ausente', (f, b) => { delete b.attributes['data-voice-epoch'] }],
  ['lifecycle ausente', f => { for (const node of f.nodes) delete node.attributes['data-voice-lifecycle'] }],
  ['data efetiva inválida', (f, b) => { b.attributes[prefix + 'date'] = '2026-02-31' }],
  ['início inválido', (f, b) => { b.attributes[prefix + 'start'] = '25:00' }],
  ['fim anterior ao início', (f, b) => { b.attributes[prefix + 'end'] = '14:00' }],
  ...['action', 'id', 'patient-id', 'patient', 'series-id', 'original-date', 'date', 'start', 'end'].map(key => [`${key} ausente`, (f, b) => { delete b.attributes[prefix + key] }]),
]
const stale = [
  ...inconsistent,
  ...Object.entries({ patient: 'Outra Sintética', date: '2026-10-05', start: '16:00', end: '16:50' })
    .map(([key, value]) => [`metadata ${key}`, (f, b) => { b.attributes[prefix + key] = value }]),
  ['epoch reload', (f, b) => { b.attributes['data-voice-epoch'] = 'voice-instance-2:series-revision-7:details-revision-3' }],
  ['series revision', (f, b) => { b.attributes['data-voice-epoch'] = 'voice-instance-1:series-revision-8:details-revision-3' }],
  ['details close/reopen', f => { f.panel.attributes['data-voice-lifecycle'] = 'details-open-2:focus-1' }],
  ['renumeração/reordenação', f => { f.agenda.attributes['data-voice-lifecycle'] = 'loaded-range-1:options-2' }],
  ['troca espaço', f => { f.space.attributes['data-voice-lifecycle'] = 'synthetic-space-2' }],
  ['lifecycle nearest igual ancestral diferente', f => { f.agenda.attributes['data-voice-lifecycle'] = 'loaded-range-2:options-1' }],
  ['foco removido', f => { delete f.panel.attributes['data-voice-focused-occurrence']; delete f.panel.attributes['data-voice-focused-patient'] }],
  ['editor aberto após preparo', f => { delete f.panel.attributes['data-voice-focused-occurrence']; delete f.panel.attributes['data-voice-focused-patient']; f.node('FORM', { 'aria-label': 'Alterar ocorrência individual' }, f.agenda) }],
  ['disabled após preparo', (f, b) => { b.disabled = true }],
  ['hidden após preparo', f => { f.panel.attributes.hidden = '' }],
  ['disconnected após preparo', (f, b) => { b.isConnected = false }],
  ['botão movido para calendário', (f, b) => { b.parentElement = f.calendarPanel }],
]
for (const action of ['edit', 'start']) {
  for (const event of ['fechar-reabrir', 'trocar foco e voltar', 'load e voltar', 'renumerar e voltar', 'trocar espaço e voltar']) {
    for (const queryMode of ['curto', 'legado completo']) {
      test(`${action}: ABA ${event}, ${queryMode}, mesma identidade não reusa proposta`, () => {
        const f = dom()
        const command = queryMode === 'curto' ? short(action) : `Clicar em ${fullLabel(action, f.occurrence)}`
        const result = prepare(f, command)
        const originalIdentity = { ...f.controls[action].attributes }
        const panelIdentity = { ...f.panel.attributes }
        // Synthetic intermediate B; return to A's patient/id/labels/record,
        // but never restore the previous monotonic detailsRevision/lifecycle.
        f.panel.attributes['data-voice-focused-occurrence'] = 'intermediate-focus'
        f.panel.attributes['data-voice-focused-patient'] = 'intermediate-patient'
        f.panel.attributes['data-voice-lifecycle'] = 'details-open-2:focus-2'
        f.controls[action].attributes['data-voice-epoch'] = 'voice-instance-1:series-revision-7:details-revision-4'
        Object.assign(f.panel.attributes, panelIdentity, { 'data-voice-lifecycle': 'details-open-3:focus-3' })
        Object.assign(f.controls[action].attributes, originalIdentity, { 'data-voice-epoch': 'voice-instance-1:series-revision-7:details-revision-5' })
        assert.equal(f.panel.attributes['data-voice-focused-occurrence'], f.occurrence.id)
        assert.equal(f.controls[action].getAttribute('data-voice-record'), result.intent.target.record)
        obsolete(f, result.intent)
        // A new request after A returns is valid; rejecting forever is incorrect.
        applyVoiceInterfaceCommand(prepare(f, command).intent, f.root)
        assert.equal(f.calls[0].surface, 'detail')
      })
    }
  }
  for (const [name, mutate] of inconsistent) {
    test(`${action}: coerência inicial recusa ${name}`, () => {
      const f = dom()
      mutate(f, f.controls[action])
      refuse(f, short(action))
    })
  }
  for (const [name, mutate] of stale) {
    // Full-label preparation is already supported in 76: these RED cases expose
    // missing focused metadata fingerprints even before short matching exists.
    test(`${action}: apply legado marcado revalida identidade/contexto ${name}`, () => {
      const f = dom()
      const result = prepare(f, `Clicar em ${fullLabel(action, f.occurrence)}`)
      mutate(f, f.controls[action])
      obsolete(f, result.intent)
    })
  }
  test(`${action}: foco trocado entre duas identidades visuais iguais invalida curto`, () => {
    const f = dom()
    const result = prepare(f, short(action))
    const other = synthetic({ id: 'other-occurrence', patientId: 'other-patient' })
    f.controls[action].isConnected = false
    f.panel.attributes['data-voice-focused-occurrence'] = other.id
    f.panel.attributes['data-voice-focused-patient'] = other.patientId
    f.panel.attributes['data-voice-lifecycle'] = 'details-open-1:focus-2'
    f.add(action, other)
    obsolete(f, result.intent)
  })
  test(`${action}: duplicata posterior marcada invalida apply legado`, () => {
    const f = dom()
    const result = prepare(f, `Clicar em ${fullLabel(action, f.occurrence)}`)
    f.add(action)
    obsolete(f, result.intent)
  })
  test(`${action}: metadata conflitante em duplicata visível recusa`, () => {
    const f = dom()
    f.add(action).attributes[prefix + 'patient-id'] = 'contradictory-patient'
    refuse(f, short(action))
    refuse(f, `Clicar em ${fullLabel(action, f.occurrence)}`)
  })
  test(`${action}: concorrente disabled torna-se elegível antes do apply`, () => {
    const f = dom()
    const other = f.add(action, synthetic({ id: 'other' }), f.calendarPanel, false)
    other.attributes = { 'aria-label': labels[action] }
    other.disabled = true
    const result = prepare(f, short(action))
    other.disabled = false
    obsolete(f, result.intent)
  })
}

// Curie P2: complete the other command mode in EACH existing matrix.
// These are additive: initial short and stale full-label cases above remain.
for (const action of ['edit', 'start']) {
  for (const [name, mutate] of inconsistent) {
    test(`${action}: coerência inicial legado completo marcado recusa ${name}`, () => {
      const f = dom()
      mutate(f, f.controls[action])
      refuse(f, `Clicar em ${fullLabel(action, f.occurrence)}`)
    })
  }
  for (const [name, mutate] of stale) {
    test(`${action}: apply curto marcado revalida identidade/contexto ${name}`, () => {
      const f = dom()
      const result = prepare(f, short(action))
      mutate(f, f.controls[action])
      obsolete(f, result.intent)
    })
  }
}

// Curie P2: calendar precedes detail, with identical action + full aria-label.
// A coherent equivalent full-label control can run either existing handler.
// The marked detail must nevertheless participate in validation before dedupe:
// an unchanged calendar representation cannot hide its conflict or stale focus.
const calendarStaleNames = new Set([
  'id', 'patient-id', 'series-id', 'original-date', 'action', 'record',
  'panel occurrence', 'panel patient', 'metadata patient', 'metadata date',
  'metadata start', 'metadata end', 'epoch reload', 'series revision',
  'details close/reopen', 'renumeração/reordenação', 'troca espaço',
  'lifecycle nearest igual ancestral diferente', 'foco removido',
  'editor aberto após preparo',
])
const calendarConflicts = [
  ['duplicata raw marcada idêntica', (f, action) => { f.add(action) }],
  ['duplicata marcada com metadata conflitante', (f, action) => {
    f.add(action).attributes[prefix + 'patient-id'] = 'contradictory-patient'
  }],
  ['outra identidade com rótulo visual igual', (f, action) => {
    f.add(action, synthetic({ id: 'other-occurrence', patientId: 'other-patient' }), f.calendarPanel, false)
  }],
  ['alias visível do rótulo completo', (f, action) => {
    const other = f.add(action, synthetic({ id: 'other-occurrence' }), f.calendarPanel, false)
    other.attributes = { 'aria-label': 'Outra ação', 'data-voice-alias': fullLabel(action, f.occurrence) }
  }],
]
for (const action of ['edit', 'start']) {
  test(`${action}: legado completo com calendário anterior e detalhe marcado coerente confirma equivalente`, () => {
    const f = dom({ calendar: true })
    const calendarButton = f.buttons.find(button => button.parentElement === f.calendarPanel && button.textContent === labels[action])
    assert.ok(f.nodes.indexOf(calendarButton) < f.nodes.indexOf(f.controls[action]))
    assert.equal(calendarButton.getAttribute('aria-label'), f.controls[action].getAttribute('aria-label'))
    assert.equal(calendarButton.getAttribute('data-voice-action'), f.controls[action].getAttribute('data-voice-action'))
    const result = prepare(f, `Clicar em ${fullLabel(action, f.occurrence)}`)
    assert.equal(result.intent.target.action, `agenda:${action}:${f.occurrence.id}`)
    assert.equal(result.intent.target.record, f.controls[action].getAttribute('data-voice-record'))
    assert.equal(result.intent.target.epoch, f.controls[action].getAttribute('data-voice-epoch'))
    applyVoiceInterfaceCommand(result.intent, f.root)
    assert.equal(f.calls.length, 1)
    assert.equal(f.calls[0].action, action)
    assert.equal(f.calls[0].id, f.occurrence.id)
    assert.equal(f.calls[0].patientId, f.occurrence.patientId)
    assert.ok(['calendar', 'detail'].includes(f.calls[0].surface))
    assert.equal(f.effects.editor, action === 'edit' ? f.occurrence.id : null)
    assert.equal(f.effects.draft, action === 'start' ? f.occurrence.id : null)
  })
  for (const [name, mutate] of inconsistent) {
    test(`${action}: calendário não esconde incoerência inicial marcada no legado: ${name}`, () => {
      const f = dom({ calendar: true })
      const beforeCalendar = f.buttons.filter(button => button.parentElement === f.calendarPanel).map(button => ({ ...button.attributes }))
      mutate(f, f.controls[action])
      assert.deepEqual(f.buttons.filter(button => button.parentElement === f.calendarPanel).map(button => button.attributes), beforeCalendar)
      refuse(f, `Clicar em ${fullLabel(action, f.occurrence)}`)
    })
  }
  for (const [name, mutate] of stale.filter(([name]) => calendarStaleNames.has(name))) {
    test(`${action}: apply legado com calendário revalida detalhe marcado: ${name}`, () => {
      const f = dom({ calendar: true })
      const result = prepare(f, `Clicar em ${fullLabel(action, f.occurrence)}`)
      const beforeCalendar = f.buttons.filter(button => button.parentElement === f.calendarPanel).map(button => ({ ...button.attributes }))
      mutate(f, f.controls[action])
      assert.deepEqual(f.buttons.filter(button => button.parentElement === f.calendarPanel).map(button => button.attributes), beforeCalendar)
      obsolete(f, result.intent)
    })
  }
  for (const [name, introduce] of calendarConflicts) {
    test(`${action}: calendário não esconde conflito inicial no legado: ${name}`, () => {
      const f = dom({ calendar: true })
      introduce(f, action)
      refuse(f, `Clicar em ${fullLabel(action, f.occurrence)}`)
    })
    test(`${action}: calendário não esconde conflito posterior no apply legado: ${name}`, () => {
      const f = dom({ calendar: true })
      const result = prepare(f, `Clicar em ${fullLabel(action, f.occurrence)}`)
      introduce(f, action)
      obsolete(f, result.intent)
    })
  }
}
