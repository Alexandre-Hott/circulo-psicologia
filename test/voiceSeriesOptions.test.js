import test from 'node:test'
import assert from 'node:assert/strict'
import { parseVoiceInterfaceCommand, applyVoiceInterfaceCommand } from '../src/voiceInterfaceCommands.js'

// Contract supplied by MAIN: options belong to all recurring cards in loaded
// list order, not to a patient or the subset of enabled/visible buttons.
// This DOM double tests the real gateway, not React numbering/rendering or IPC.
function dom(specs = [{}]) {
  const clicks = []
  const ownerDocument = { defaultView: { getComputedStyle: element => element.style } }
  function node(tagName, attributes = {}, parentElement = null, textContent = '') {
    return {
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
          const match = /^(\w+)?(?:#([\w-]+))?(?:\[([\w-]+)(?:="([^"]*)")?\])?$/.exec(query)
          return Boolean(match && (!match[1] || match[1].toUpperCase() === this.tagName)
            && (!match[2] || match[2] === this.id)
            && (!match[3] || (match[4] === undefined ? this.hasAttribute(match[3]) : this.getAttribute(match[3]) === match[4])))
        })
      },
      closest(selector) {
        for (let ancestor = this; ancestor; ancestor = ancestor.parentElement) {
          if (ancestor.matches(selector)) return ancestor
        }
        return null
      },
      querySelector: () => null,
      cloneNode() { return { textContent: this.textContent, querySelectorAll: () => [] } },
      scrollIntoView() {}, focus() {},
      click() { clicks.push(this.getAttribute('data-voice-series-id') || 'unmarked') },
    }
  }
  const panel = node('SECTION', { 'data-voice-lifecycle': 'loaded-list-1' })
  const buttons = []
  const cards = []
  function add(spec = {}) {
    const index = buttons.length
    const patientId = spec.patientId || 'ana'
    const seriesId = spec.seriesId || `s${index + 1}`
    const patient = spec.patient || 'Ana Clara'
    const option = String(spec.option ?? index + 1)
    const card = node('LI', { 'aria-label': `Série · opção ${option} · Segunda-feira` }, panel)
    const attributes = {
      'aria-label': `Encerrar série de ${patient} · série ${seriesId}`,
      'data-voice-series-kind': spec.kind || 'end',
      'data-voice-series-patient': patient,
      'data-voice-series-patient-id': patientId,
      'data-voice-series-id': seriesId,
      'data-voice-series-option': option,
      'data-voice-series-weekday': String(spec.weekday ?? 1),
      'data-voice-series-time': spec.time || '15:00',
      'data-voice-series-ambiguous': spec.ambiguous ? 'true' : 'false',
      'data-voice-action': `agenda:end-series:${patientId}:${seriesId}`,
      'data-voice-record': `series:${patientId}:${seriesId}`,
      'data-voice-epoch': 'instance-1:revision-7',
    }
    const button = node('BUTTON', attributes, card, spec.kind === 'advance' ? 'Antecipar término' : 'Encerrar série')
    button.type = 'button'
    button.disabled = Boolean(spec.disabled)
    if (spec.hidden) card.attributes.hidden = ''
    buttons.push(button); cards.push(card)
    return button
  }
  specs.forEach(add)
  const root = { querySelector: () => null, querySelectorAll: () => buttons }
  ownerDocument.getElementById = id => buttons.find(button => button.id === id) || null
  return { root, buttons, cards, panel, clicks, add }
}
function proposal(fixture, text) {
  const result = parseVoiceInterfaceCommand(text, fixture.root)
  assert.equal(result?.status, 'draft', result?.message || text)
  assert.equal(result.intent.type, 'interface.control')
  assert.equal(result.intent.operation, 'click')
  assert.deepEqual(fixture.clicks, [], 'Parsing must not open a form')
  return result.intent
}
function refused(fixture, text) {
  const result = parseVoiceInterfaceCommand(text, fixture.root)
  assert.notEqual(result?.status, 'draft', text)
  assert.deepEqual(fixture.clicks, [])
}
const homonyms = () => dom([
  { patientId: 'ana-1', ambiguous: true },
  { patientId: 'ana-2', ambiguous: true },
])

for (const [kind, action] of [['end', 'Encerrar série'], ['advance', 'Antecipar término']]) {
  for (const prefix of ['', 'Clicar em ']) {
    for (const [option, word] of [[1, 'um'], [2, 'dois']]) {
      test(`${prefix}${action}: homônimo opção ${word} escolhe cartão exato sem UUID`, () => {
        const fixture = dom([
          { patientId: 'ana-1', ambiguous: true, kind },
          { patientId: 'ana-2', ambiguous: true, kind },
        ])
        const intent = proposal(fixture, `${prefix}${action} de ANA CLÁRA na segunda às quinze horas opção ${word}`)
        assert.equal(intent.target.record, `series:ana-${option}:s${option}`)
        applyVoiceInterfaceCommand(intent, fixture.root)
        assert.deepEqual(fixture.clicks, [`s${option}`])
      })
    }
  }
}
test('opção sem qualificador distingue duas séries do mesmo paciente e horário', () => {
  const fixture = dom([{}, {}])
  const result = parseVoiceInterfaceCommand('Encerrar série de Ana Clara opção dois', fixture.root)
  assert.equal(result?.status, 'draft', result?.message)
  const intent = result.intent
  assert.equal(intent.type, 'interface.control')
  assert.equal(intent.operation, 'click')
  assert.deepEqual(fixture.clicks, [], 'Parsing must not open a form')
  assert.ok(typeof result.preview === 'string' && result.preview.includes('opção 2')
    && result.preview.toLowerCase().includes('segunda') && result.preview.includes('15:00')
    && !result.preview.toLowerCase().includes('série s2'), 'Option preview must show option/day/time without the legacy technical series identifier')
  assert.equal(intent.target.record, 'series:ana:s2')
  applyVoiceInterfaceCommand(intent, fixture.root)
  assert.deepEqual(fixture.clicks, ['s2'])
})
test('numeração não é por paciente nem por controles disponíveis', () => {
  const fixture = dom([{ patient: 'Caio', disabled: true }, { patient: 'Ana Clara', option: 2 }])
  refused(fixture, 'Encerrar série de Ana Clara opção um')
  const intent = proposal(fixture, 'Encerrar série de Ana Clara opção dois')
  applyVoiceInterfaceCommand(intent, fixture.root)
  assert.deepEqual(fixture.clicks, ['s2'])
})
test('numeral canônico maior que dez apenas quando exibido', () => {
  const fixture = dom([{ option: 11 }])
  applyVoiceInterfaceCommand(proposal(fixture, 'Encerrar série de Ana Clara opção 11'), fixture.root)
  assert.deepEqual(fixture.clicks, ['s1'])
})
for (const text of [
  'Encerrar série de Ana Clara',
  'Encerrar série de Ana Clara na segunda às quinze horas',
  'Clicar em Encerrar série de Ana Clara na segunda às quinze horas',
]) {
  test(`homônimo sem opção recusa mesmo horário único: ${text}`, () => {
    const fixture = dom([{ ambiguous: true }, { patientId: 'ana-2', ambiguous: true, time: '16:00' }])
    refused(fixture, text)
  })
}
for (const suffix of ['zero', '0', '-1', '01', '1.0', 'três', 'onze', 'dois agora', 'dois opção um', 'dois e salvar']) {
  test(`opção inválida/inexistente/extras recusa: ${suffix}`, () => {
    refused(homonyms(), `Encerrar série de Ana Clara opção ${suffix}`)
  })
}
for (const text of [
  'Encerrar série de Ana opção dois',
  'Encerrar série opção dois',
  'Encerrar série de Caio opção dois',
  'Encerrar série de Ana Clara na terça às quinze horas opção dois',
  'Encerrar série de Ana Clara na segunda às dezesseis horas opção dois',
  'Antecipar término de Ana Clara opção dois',
]) {
  test(`nome completo e qualificadores/ação exatos: ${text}`, () => refused(homonyms(), text))
}
test('opção duplicada compete, nunca escolhe o primeiro cartão', () => {
  const fixture = dom([{ option: 2 }, { option: 2 }])
  refused(fixture, 'Encerrar série de Ana Clara opção dois')
})
test('mesmo action/label não deduplica séries com identidade e epoch divergentes', () => {
  const fixture = dom([{ option: 2 }])
  const original = fixture.buttons[0]
  const twin = fixture.add({ option: 2, seriesId: 'divergent-series' })
  twin.attributes['aria-label'] = original.attributes['aria-label']
  twin.attributes['data-voice-action'] = original.attributes['data-voice-action']
  twin.attributes['data-voice-epoch'] = 'instance-1:revision-8'
  assert.notEqual(twin.attributes['data-voice-series-id'], original.attributes['data-voice-series-id'])
  assert.notEqual(twin.attributes['data-voice-record'], original.attributes['data-voice-record'])
  for (const prefix of ['', 'Clicar em ']) {
    const result = parseVoiceInterfaceCommand(`${prefix}Encerrar série de Ana Clara opção dois`, fixture.root)
    assert.equal(result?.status, 'clarification')
  }
  assert.deepEqual(fixture.clicks, [])
})
test('apply recusa twin posterior mesmo action/label com metadata divergente', () => {
  const fixture = dom([{ option: 2 }])
  const intent = proposal(fixture, 'Clicar em Encerrar série de Ana Clara opção dois')
  const original = fixture.buttons[0]
  const originalAttributes = { ...original.attributes }
  const twin = fixture.add({ option: 2, seriesId: 'divergent-series' })
  twin.attributes['aria-label'] = original.attributes['aria-label']
  twin.attributes['data-voice-action'] = original.attributes['data-voice-action']
  twin.attributes['data-voice-epoch'] = 'instance-1:revision-8'
  // The prepared target itself is unchanged: rejection must detect competition,
  // rather than accidentally pass because the original fingerprint was altered.
  assert.deepEqual(original.attributes, originalAttributes)
  assert.throws(() => applyVoiceInterfaceCommand(intent, fixture.root))
  assert.deepEqual(fixture.clicks, [])
})
test('alias de outro botão compete com cartão numerado', () => {
  const fixture = homonyms()
  const twin = fixture.add({ patient: 'Caio' })
  twin.attributes['data-voice-alias'] = 'Encerrar série de Ana Clara opção dois'
  refused(fixture, 'Encerrar série de Ana Clara opção dois')
  refused(fixture, 'Clicar em Encerrar série de Ana Clara opção dois')
})
test('texto exato em botão sem contrato de série não autoriza opção', () => {
  const fixture = dom()
  const button = fixture.buttons[0]
  button.attributes = { 'aria-label': 'Encerrar série de Ana Clara opção dois' }
  refused(fixture, 'Encerrar série de Ana Clara opção dois')
  refused(fixture, 'Clicar em Encerrar série de Ana Clara opção dois')
})

// Legacy preparation isolates fingerprint regression from the new grammar:
// these tests can reach apply even while option parsing is still RED.
const mutations = [
  ['option', '3'], ['patient-id', 'other-patient'], ['id', 'other-series'],
  ['kind', 'advance'], ['patient', 'Caio'], ['weekday', '2'], ['time', '16:00'], ['ambiguous', 'true'],
].map(([key, value]) => [`series-${key}`, fixture => { fixture.buttons[0].attributes[`data-voice-series-${key}`] = value }])
mutations.push(
  ['action', fixture => { fixture.buttons[0].attributes['data-voice-action'] = 'agenda:end-series:ana:other' }],
  ['record', fixture => { fixture.buttons[0].attributes['data-voice-record'] = 'series:ana:other' }],
  ['epoch', fixture => { fixture.buttons[0].attributes['data-voice-epoch'] = 'instance-1:revision-8' }],
  ['reload lifecycle', fixture => { fixture.panel.attributes['data-voice-lifecycle'] = 'loaded-list-2' }],
  ['disabled', fixture => { fixture.buttons[0].disabled = true }],
  ['hidden', fixture => { fixture.cards[0].attributes.hidden = '' }],
  ['disconnected', fixture => { fixture.buttons[0].isConnected = false }],
  ['option removed', fixture => { delete fixture.buttons[0].attributes['data-voice-series-option'] }],
)
for (const [label, mutate] of mutations) {
  test(`apply revalida fingerprint integral: ${label}`, () => {
    const fixture = dom()
    const intent = proposal(fixture, 'Clicar em Encerrar série de Ana Clara · série s1')
    mutate(fixture)
    assert.throws(() => applyVoiceInterfaceCommand(intent, fixture.root))
    assert.deepEqual(fixture.clicks, [])
  })
}
test('apply re-resolve opção: novo alias concorrente invalida proposta', () => {
  const fixture = homonyms()
  const intent = proposal(fixture, 'Clicar em Encerrar série de Ana Clara opção dois')
  const twin = fixture.add({ patient: 'Caio' })
  twin.attributes['data-voice-alias'] = 'Encerrar série de Ana Clara opção dois'
  assert.throws(() => applyVoiceInterfaceCommand(intent, fixture.root))
  assert.deepEqual(fixture.clicks, [])
})
test('apply recusa renumeração após troca da ordem da lista', () => {
  const fixture = homonyms()
  const intent = proposal(fixture, 'Encerrar série de Ana Clara opção dois')
  fixture.buttons.reverse()
  fixture.buttons.forEach((button, index) => { button.attributes['data-voice-series-option'] = String(index + 1) })
  assert.throws(() => applyVoiceInterfaceCommand(intent, fixture.root))
  assert.deepEqual(fixture.clicks, [])
})
test('recolher e reabrir painel conserva opção, mas não permite ação enquanto oculto', () => {
  const fixture = dom([{ option: 2 }])
  fixture.panel.attributes.hidden = ''
  refused(fixture, 'Encerrar série de Ana Clara opção dois')
  delete fixture.panel.attributes.hidden
  const intent = proposal(fixture, 'Encerrar série de Ana Clara opção dois')
  applyVoiceInterfaceCommand(intent, fixture.root)
  assert.deepEqual(fixture.clicks, ['s1'])
})
for (const text of [
  'Encerrar série de Ana Clara',
  'Encerrar série de Ana Clara na segunda às quinze horas',
  'Clicar em Encerrar série de Ana Clara · série s1',
]) {
  test(`compatibilidade não homônimo/ID legado: ${text}`, () => {
    const fixture = dom()
    applyVoiceInterfaceCommand(proposal(fixture, text), fixture.root)
    assert.deepEqual(fixture.clicks, ['s1'])
  })
}
test('ID legado continua selecionando cartão de paciente homônimo', () => {
  const fixture = homonyms()
  applyVoiceInterfaceCommand(proposal(fixture, 'Clicar em Encerrar série de Ana Clara · série s2'), fixture.root)
  assert.deepEqual(fixture.clicks, ['s2'])
})
test('antecipar término sem opção de paciente único preservado', () => {
  const fixture = dom([{ kind: 'advance' }])
  applyVoiceInterfaceCommand(proposal(fixture, 'Antecipar término de Ana Clara na segunda às quinze horas'), fixture.root)
  assert.deepEqual(fixture.clicks, ['s1'])
})
