import test from 'node:test'
import assert from 'node:assert/strict'
import { parseVoiceInterfaceCommand, applyVoiceInterfaceCommand } from '../src/voiceInterfaceCommands.js'

// MAIN's 76 contract. Global options are supplied by the fixture, representing
// sortedOccurrences (effective date/start/id), including every status/patient.
// This double checks gateway parsing/execution only: not React numbering,
// confirmation orchestration, IPC, persistence, or actual audio recognition.
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
      click() { clicks.push(this.getAttribute('data-voice-appointment-id') || 'unmarked') },
    }
  }
  const panel = node('SECTION', { 'data-voice-lifecycle': 'loaded-range-1' })
  const buttons = []
  const cards = []
  function add(spec = {}) {
    const index = buttons.length
    const occurrenceId = spec.occurrenceId || `occurrence-${index + 1}`
    const patientId = spec.patientId || 'ana'
    const patient = spec.patient || 'Ana Clara'
    const option = String(spec.option ?? index + 1)
    const date = spec.date || '2026-10-04'
    const originalDate = spec.originalDate || date
    const start = spec.start || '15:00'
    const end = spec.end || '15:50'
    const seriesId = Object.hasOwn(spec, 'seriesId') ? spec.seriesId : 'synthetic-series'
    const card = node('LI', { 'aria-label': patient }, panel)
    const button = node('BUTTON', {
      'aria-label': `Ver ações de ${patient} em ${date} às ${start}–${end}`,
      'data-voice-action': `agenda:details:${occurrenceId}`,
      'data-voice-record': JSON.stringify(['occurrence', occurrenceId, patientId, seriesId, originalDate]),
      'data-voice-epoch': 'instance-1:series-7:details-3',
      'data-voice-appointment-details': 'true',
      'data-voice-appointment-patient': patient,
      'data-voice-appointment-patient-id': patientId,
      'data-voice-appointment-id': occurrenceId,
      'data-voice-appointment-option': option,
      'data-voice-appointment-date': date,
      'data-voice-appointment-start': start,
      'data-voice-appointment-end': end,
      'data-voice-appointment-original-date': originalDate,
      'data-voice-appointment-ambiguous': spec.ambiguous ? 'true' : 'false',
    }, card, `Detalhes · opção ${option}`)
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
  assert.deepEqual(fixture.clicks, [], 'Preparation must not click any control')
  return result
}
function refused(fixture, text) {
  const result = parseVoiceInterfaceCommand(text, fixture.root)
  assert.equal(result?.status, 'clarification', text)
  assert.deepEqual(fixture.clicks, [])
}
const homonyms = () => dom([
  { patientId: 'ana-1', ambiguous: true },
  { patientId: 'ana-2', ambiguous: true },
])
const optionQuery = 'Abrir detalhes de Ana Clara opção dois'
const legacyQuery = 'Clicar em Ver ações de Ana Clara em 2026-10-04 às 15:00–15:50'

for (const action of ['Abrir detalhes', 'Ver detalhes', 'Detalhes']) {
  for (const prefix of ['', 'Clicar em ']) {
    for (const [option, word] of [[1, 'um'], [2, 'dois']]) {
      test(`${prefix}${action}: homônimo opção ${word} identifica ocorrência exata`, () => {
        const fixture = homonyms()
        const result = proposal(fixture, `${prefix}${action} de ANA CLÁRA opção ${word}`)
        assert.equal(result.intent.target.record, JSON.stringify(['occurrence', `occurrence-${option}`, `ana-${option}`, 'synthetic-series', '2026-10-04']))
        applyVoiceInterfaceCommand(result.intent, fixture.root)
        assert.deepEqual(fixture.clicks, [`occurrence-${option}`])
      })
    }
  }
}
for (const separator of ['em', 'no dia']) {
  test(`qualificador ${separator}: data/hora efetivas correspondem a remarcada`, () => {
    const fixture = dom([{ option: 2, ambiguous: true, originalDate: '2026-10-03' }])
    const result = proposal(fixture, `Ver detalhes de Ana Clara ${separator} quatro de outubro de dois mil e vinte e seis às quinze horas opção dois`)
    assert.equal(result.intent.target.record, JSON.stringify(['occurrence', 'occurrence-1', 'ana', 'synthetic-series', '2026-10-03']))
    applyVoiceInterfaceCommand(result.intent, fixture.root)
    assert.deepEqual(fixture.clicks, ['occurrence-1'])
  })
}
for (const name of ['Ana C.', 'Ana em Casa', 'Ana às Flores', 'Ana opção Clara', 'Ana opção dois']) {
  test(`nome completo literal não perde pontuação/delimitadores: ${name}`, () => {
    const fixture = dom([{ patient: name, option: 2, ambiguous: true }])
    const result = proposal(fixture, `Abrir detalhes de ${name} em quatro de outubro de 2026 às quinze horas opção dois`)
    applyVoiceInterfaceCommand(result.intent, fixture.root)
    assert.deepEqual(fixture.clicks, ['occurrence-1'])
  })
}
test('nome pontuado não admite outro nome pela remoção do ponto interno', () => {
  refused(dom([{ patient: 'Ana C.', option: 2 }]), 'Abrir detalhes de Ana C opção dois')
})
test('opção dois no fim do nome homônimo não é sufixo seletor', () => {
  const fixture = dom([{ patient: 'Ana opção dois', ambiguous: true, option: 2 }])
  refused(fixture, 'Abrir detalhes de Ana opção dois')
  refused(fixture, 'Clicar em Abrir detalhes de Ana opção dois')
})
test('nome terminado em opção dois recebe sufixo opção um independente', () => {
  const fixture = dom([
    { patient: 'Ana opção dois', patientId: 'ana-1', ambiguous: true },
    { patient: 'Ana opção dois', patientId: 'ana-2', ambiguous: true },
  ])
  const result = proposal(fixture, 'Abrir detalhes de Ana opção dois opção um')
  assert.equal(result.intent.target.record, JSON.stringify(['occurrence', 'occurrence-1', 'ana-1', 'synthetic-series', '2026-10-04']))
  applyVoiceInterfaceCommand(result.intent, fixture.root)
  assert.deepEqual(fixture.clicks, ['occurrence-1'])
})
test('conversão numérica apenas no sufixo não reescreve opção dois do nome', () => {
  const fixture = dom([{ patient: 'Ana opção dois', option: 1, ambiguous: true }])
  refused(fixture, 'Abrir detalhes de Ana opção 2 opção um')
  refused(fixture, 'Clicar em Ver detalhes de Ana opção 2 opção 1')
})
test('opção global não é por paciente nem pelo subconjunto enabled/visible', () => {
  const fixture = dom([{ patient: 'Caio', disabled: true }, { patient: 'Bia', hidden: true }, { option: 3 }])
  refused(fixture, 'Abrir detalhes de Ana Clara opção um')
  applyVoiceInterfaceCommand(proposal(fixture, 'Abrir detalhes de Ana Clara opção três').intent, fixture.root)
  assert.deepEqual(fixture.clicks, ['occurrence-3'])
})
test('opção distingue duas ocorrências do mesmo paciente/data/hora', () => {
  const fixture = dom([{}, {}])
  applyVoiceInterfaceCommand(proposal(fixture, optionQuery).intent, fixture.root)
  assert.deepEqual(fixture.clicks, ['occurrence-2'])
})
test('numeral canônico 11 aceita somente opção exibida', () => {
  const fixture = dom([{ option: 11 }])
  refused(fixture, 'Ver detalhes de Ana Clara opção 12')
  applyVoiceInterfaceCommand(proposal(fixture, 'Ver detalhes de Ana Clara opção 11').intent, fixture.root)
  assert.deepEqual(fixture.clicks, ['occurrence-1'])
})
test('avulsa com seriesId null continua elegível para detalhes por opção', () => {
  const fixture = dom([{ option: 2, seriesId: null }])
  applyVoiceInterfaceCommand(proposal(fixture, optionQuery).intent, fixture.root)
  assert.deepEqual(fixture.clicks, ['occurrence-1'])
})
test('preview por opção mostra nome/data/intervalo/número sem UUID', () => {
  const occurrenceId = '4cc2c2a3-58af-4e42-b614-7c0ff0a8926a'
  const fixture = dom([{ occurrenceId, option: 2 }])
  const result = proposal(fixture, optionQuery)
  assert.ok(typeof result.preview === 'string' && result.preview.includes('Ana Clara')
    && result.preview.includes('opção 2') && result.preview.includes('15:00') && result.preview.includes('15:50')
    && !result.preview.includes(occurrenceId))
  assert.ok(result.preview.includes('2026-10-04') || result.preview.includes('04/10/2026') || /quatro de outubro|4 de outubro/iu.test(result.preview))
  assert.equal(result.intent.target.action, `agenda:details:${occurrenceId}`)
})
for (const text of [
  'Abrir detalhes de Ana Clara',
  'Ver detalhes de Ana Clara em quatro de outubro de 2026 às quinze horas',
  'Clicar em Detalhes de Ana Clara no dia quatro de outubro de 2026 às quinze horas',
]) {
  test(`homônimo sem opção recusa mesmo horário único: ${text}`, () => {
    refused(dom([{ ambiguous: true }, { patientId: 'ana-2', ambiguous: true, start: '16:00' }]), text)
  })
}
for (const suffix of ['zero', '0', '-1', '01', '1.0', 'três', 'onze', 'dois agora', 'dois opção um', 'dois e iniciar sessão']) {
  test(`opção inválida/inexistente/extras recusa: ${suffix}`, () => refused(homonyms(), `Abrir detalhes de Ana Clara opção ${suffix}`))
}
for (const text of [
  'Abrir detalhes opção dois',
  'Abrir detalhes de Ana opção dois',
  'Abrir detalhes de Caio opção dois',
  'Abrir detalhes de Ana Clara em três de outubro de 2026 às quinze horas opção dois',
  'Abrir detalhes de Ana Clara em quatro de outubro de 2026 às dezesseis horas opção dois',
  'Abrir detalhes de Ana Clara em quatro de outubro às quinze horas opção dois',
  'Abrir detalhes de Ana Clara em trinta e um de fevereiro de 2026 às quinze horas opção dois',
  'Abrir detalhes de Ana Clara às quinze horas opção dois',
]) {
  test(`fullmatch nome/data/hora obrigatórios quando qualificados: ${text}`, () => refused(homonyms(), text))
}
for (const mutation of [
  button => { delete button.attributes['data-voice-appointment-details'] },
  button => { button.attributes['data-voice-action'] = 'agenda:start:occurrence-1' },
  button => { button.attributes['data-voice-action'] = 'agenda:edit:occurrence-1' },
  button => { button.attributes['data-voice-record'] = JSON.stringify(['occurrence', 'other', 'ana', 'synthetic-series', '2026-10-04']) },
]) {
  test(`contrato de detalhes, não start/edit/registro incoerente: ${mutation.toString()}`, () => {
    const fixture = dom([{ option: 2 }])
    mutation(fixture.buttons[0])
    refused(fixture, optionQuery)
    refused(fixture, `Clicar em ${optionQuery}`)
  })
}
test('botão não marcado com texto exato não autoriza detalhes numerados', () => {
  const fixture = dom()
  fixture.buttons[0].attributes = { 'aria-label': optionQuery }
  refused(fixture, optionQuery)
  refused(fixture, `Clicar em ${optionQuery}`)
})
test('alvo numerado único recusa patient-id contradizendo paciente do JSON record', () => {
  const fixture = dom([{ option: 2 }])
  const button = fixture.buttons[0]
  const record = JSON.parse(button.getAttribute('data-voice-record'))
  assert.equal(button.getAttribute('data-voice-action'), `agenda:details:${record[1]}`)
  button.attributes['data-voice-appointment-patient-id'] = 'contradictory-patient'
  assert.notEqual(button.getAttribute('data-voice-appointment-patient-id'), record[2])
  refused(fixture, optionQuery)
})
test('alvo numerado único recusa original-date contradizendo data original do JSON record', () => {
  const fixture = dom([{ option: 2 }])
  const button = fixture.buttons[0]
  const record = JSON.parse(button.getAttribute('data-voice-record'))
  assert.equal(button.getAttribute('data-voice-action'), `agenda:details:${record[1]}`)
  button.attributes['data-voice-appointment-original-date'] = '2026-10-03'
  assert.notEqual(button.getAttribute('data-voice-appointment-original-date'), record[4])
  refused(fixture, optionQuery)
})
test('aliases externos competem com detalhes numerados', () => {
  const fixture = dom([{ option: 2 }])
  const other = fixture.add({ patient: 'Caio', occurrenceId: 'other' })
  other.attributes = { 'aria-label': 'Outra ação', 'data-voice-alias': optionQuery }
  refused(fixture, optionQuery)
  refused(fixture, `Clicar em ${optionQuery}`)
})

function twin(fixture) {
  const original = fixture.buttons[0]
  const duplicate = fixture.add()
  duplicate.attributes = { ...original.attributes }
  duplicate.textContent = original.textContent
  duplicate.parentElement.attributes = { ...original.parentElement.attributes }
  return duplicate
}
test('representações idênticas da ocorrência deduplicam sem trocar a opção', () => {
  const fixture = dom([{ option: 2 }])
  twin(fixture)
  applyVoiceInterfaceCommand(proposal(fixture, optionQuery).intent, fixture.root)
  assert.deepEqual(fixture.clicks, ['occurrence-1'])
})
test('attrs idênticos e lifecycle nearest igual não deduplicam ancestral diferente', () => {
  const fixture = dom()
  fixture.cards[0].attributes['data-voice-lifecycle'] = 'same-nearest-cycle'
  const duplicate = twin(fixture)
  duplicate.parentElement.parentElement = { ...fixture.panel, attributes: { 'data-voice-lifecycle': 'other-loaded-range' } }
  assert.deepEqual(duplicate.attributes, fixture.buttons[0].attributes)
  assert.deepEqual(duplicate.parentElement.attributes, fixture.cards[0].attributes)
  refused(fixture, 'Abrir detalhes de Ana Clara')
})
const divergentTwins = [
  ['option', button => { button.attributes['data-voice-appointment-option'] = '3' }],
  ['patient-id', button => { button.attributes['data-voice-appointment-patient-id'] = 'other-patient' }],
  ['occurrence-id', button => { button.attributes['data-voice-appointment-id'] = 'other-occurrence' }],
  ['date', button => { button.attributes['data-voice-appointment-date'] = '2026-10-05' }],
  ['action', button => { button.attributes['data-voice-action'] = 'agenda:details:other-occurrence' }],
  ['record', button => { button.attributes['data-voice-record'] = JSON.stringify(['occurrence', 'occurrence-1', 'ana', 'other-series', '2026-10-04']) }],
  ['epoch', button => { button.attributes['data-voice-epoch'] = 'instance-1:series-8:details-3' }],
  ['lifecycle', button => { button.parentElement.attributes['data-voice-lifecycle'] = 'different-card-cycle' }],
]
for (const [label, mutate] of divergentTwins) {
  test(`same occurrence/action/label com ${label} divergente compete`, () => {
    const fixture = dom()
    mutate(twin(fixture))
    // Short legacy query deliberately matches both representations irrespective
    // of their option/date, exposing unsafe dedupe rather than suffix parsing.
    refused(fixture, 'Abrir detalhes de Ana Clara')
  })
}

const mutations = [
  ['option', '2'], ['patient-id', 'other-patient'], ['id', 'other-occurrence'],
  ['patient', 'Caio'], ['date', '2026-10-05'], ['start', '16:00'], ['end', '16:50'],
  ['original-date', '2026-10-03'], ['ambiguous', 'true'],
].map(([key, value]) => [`appointment-${key}`, fixture => { fixture.buttons[0].attributes[`data-voice-appointment-${key}`] = value }])
mutations.push(
  ['action', fixture => { fixture.buttons[0].attributes['data-voice-action'] = 'agenda:details:other' }],
  ['record', fixture => { fixture.buttons[0].attributes['data-voice-record'] = 'other-record' }],
  ['epoch', fixture => { fixture.buttons[0].attributes['data-voice-epoch'] = 'instance-2:series-7:details-3' }],
  ['lifecycle', fixture => { fixture.panel.attributes['data-voice-lifecycle'] = 'loaded-range-2' }],
  ['disabled', fixture => { fixture.buttons[0].disabled = true }],
  ['hidden', fixture => { fixture.cards[0].attributes.hidden = '' }],
  ['inert', fixture => { fixture.panel.attributes.inert = '' }],
  ['display none', fixture => { fixture.panel.style.display = 'none' }],
  ['disconnected', fixture => { fixture.buttons[0].isConnected = false }],
  ['option removed', fixture => { delete fixture.buttons[0].attributes['data-voice-appointment-option'] }],
)
for (const [label, mutate] of mutations) {
  test(`apply fingerprint integral por preparo legado: ${label}`, () => {
    const fixture = dom()
    const result = proposal(fixture, legacyQuery)
    mutate(fixture)
    assert.throws(() => applyVoiceInterfaceCommand(result.intent, fixture.root))
    assert.deepEqual(fixture.clicks, [])
  })
}
test('apply re-resolve opção quando surge novo concorrente com mesmo número', () => {
  const fixture = dom([{ option: 2 }])
  const result = proposal(fixture, optionQuery)
  fixture.add({ option: 2, occurrenceId: 'new-competitor' })
  assert.throws(() => applyVoiceInterfaceCommand(result.intent, fixture.root))
  assert.deepEqual(fixture.clicks, [])
})
test('apply re-resolve opção quando botão concorrente se torna enabled/visible', () => {
  const fixture = dom([{ option: 2 }, { option: 2, disabled: true, hidden: true }])
  const result = proposal(fixture, optionQuery)
  fixture.buttons[1].disabled = false
  delete fixture.cards[1].attributes.hidden
  assert.throws(() => applyVoiceInterfaceCommand(result.intent, fixture.root))
  assert.deepEqual(fixture.clicks, [])
})
test('apply re-resolve opção quando surge alias sem modificar o alvo', () => {
  const fixture = dom([{ option: 2 }])
  const result = proposal(fixture, optionQuery)
  const before = { ...fixture.buttons[0].attributes }
  const other = fixture.add({ patient: 'Caio' })
  other.attributes = { 'aria-label': 'Outra ação', 'data-voice-alias': optionQuery }
  assert.deepEqual(fixture.buttons[0].attributes, before)
  assert.throws(() => applyVoiceInterfaceCommand(result.intent, fixture.root))
  assert.deepEqual(fixture.clicks, [])
})
test('apply recusa renumeração após reordenar ocorrências', () => {
  const fixture = homonyms()
  const result = proposal(fixture, optionQuery)
  fixture.buttons.reverse()
  fixture.buttons.forEach((button, index) => { button.attributes['data-voice-appointment-option'] = String(index + 1) })
  assert.throws(() => applyVoiceInterfaceCommand(result.intent, fixture.root))
  assert.deepEqual(fixture.clicks, [])
})
test('apply aceita representação idêntica introduzida após preparar', () => {
  const fixture = dom([{ option: 2 }])
  const result = proposal(fixture, optionQuery)
  twin(fixture)
  applyVoiceInterfaceCommand(result.intent, fixture.root)
  assert.deepEqual(fixture.clicks, ['occurrence-1'])
})
test('apply legado recusa twin posterior divergente em lifecycle', () => {
  const fixture = dom()
  const result = proposal(fixture, 'Abrir detalhes de Ana Clara')
  twin(fixture).parentElement.attributes['data-voice-lifecycle'] = 'other-cycle'
  assert.throws(() => applyVoiceInterfaceCommand(result.intent, fixture.root))
  assert.deepEqual(fixture.clicks, [])
})
for (const text of ['Abrir detalhes de Ana Clara', 'Ver detalhes de Ana Clara em quatro de outubro de 2026 às quinze horas', legacyQuery]) {
  test(`legado não homônimo preservado: ${text}`, () => {
    const fixture = dom()
    for (const button of fixture.buttons) {
      delete button.attributes['data-voice-appointment-option']
      delete button.attributes['data-voice-appointment-patient-id']
      delete button.attributes['data-voice-appointment-id']
    }
    applyVoiceInterfaceCommand(proposal(fixture, text).intent, fixture.root)
    assert.deepEqual(fixture.clicks, ['unmarked'])
  })
}
