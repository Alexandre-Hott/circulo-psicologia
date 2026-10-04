import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCentralCommand } from '../src/centralCommandRouter.js'

// Tests-only RED: consume a dot/comma pause only after the edit command noun.
// No inference, UI handler, persistence, alias or clinical-body normalization.
const context = {
  behaviors: [
    { id: 'first', title: 'Pede ajuda', description: 'Original first.', version: 1, archivedAt: null },
    { id: 'literal', title: 'Pede ajuda para o adulto', description: 'Original literal.', version: 1, archivedAt: null },
  ],
}
const description = 'Texto SINTÉTICO: "confirmar", salvar; não interpretar!'

function parse(text, suppliedContext = context) {
  const before = structuredClone(suppliedContext)
  const result = parseCentralCommand({ text, context: suppliedContext })
  assert.deepEqual(suppliedContext, before, 'pure preparation must not mutate catalog')
  return result
}

function assertEditPrefix(prefix) {
  const opened = parse(`${prefix} Pede ajuda.`)
  assert.equal(opened.status, 'draft')
  assert.deepEqual(opened.intent, { type: 'behavior.edit.open', target: { behaviorId: 'first' } })
  const changed = parse(`${prefix} Pede ajuda para o adulto com descrição ${description}`)
  assert.equal(changed.status, 'draft')
  assert.deepEqual(changed.intent, {
    type: 'behavior.update', target: { behaviorId: 'literal' }, draft: { description },
  }, 'full catalog title and literal description must remain exact')
}

test('behavior edit prefix: legacy unique title/open and literal description remain exact', () => {
  assertEditPrefix('Editar comportamento')
})

test('behavior edit prefix: dot pause opens unique ID and preserves full title/body', () => {
  assertEditPrefix('Editar comportamento.')
})

test('behavior edit prefix: comma pause opens unique ID and preserves full title/body', () => {
  assertEditPrefix('Editar comportamento,')
})

test('behavior edit prefix: no first-match homonym, shorthand or bare-title authorization', () => {
  const duplicate = { behaviors: [context.behaviors[0], { ...context.behaviors[0], id: 'second' }] }
  for (const prefix of ['Editar comportamento', 'Editar comportamento.', 'Editar comportamento,']) {
    for (const suffix of ['Pede ajuda.', `Pede ajuda com descrição ${description}`]) {
      const result = parse(`${prefix} ${suffix}`, duplicate)
      assert.equal(result.status, 'clarification')
      assert.equal(result.intent, undefined)
    }
    const partial = parse(`${prefix} Pede`)
    assert.equal(partial.status, 'clarification')
    assert.equal(partial.intent, undefined)
  }
  const bare = parse('. Pede ajuda.')
  assert.equal(bare.status, 'clarification')
  assert.equal(bare.intent, undefined)
})

test('behavior command header: existing create verbs accept one dot/comma without changing literal title/body', () => {
  for (const verb of ['Criar', 'Crie', 'Cria', 'Cadastrar', 'Cadastre', 'Cadastra', 'Adicionar', 'Adicione', 'Adiciona']) {
    for (const pause of ['', '.', ',']) {
      const result = parse(`${verb} comportamento${pause} Solicita, apoio! com descrição ${description}`)
      assert.equal(result.status, 'draft', `${verb}/${pause}`)
      assert.deepEqual(result.intent, { type: 'behavior.create', draft: { title: 'Solicita, apoio!', description } })
    }
  }
})

test('behavior command header: internal catalog punctuation and description are never repaired', () => {
  for (const title of ['Pede. ajuda', 'Pede, ajuda! para o adulto']) {
    const literal = { behaviors: [{ id: 'punctuated', title, version: 1 }] }
    for (const pause of ['', '.', ',']) {
      const opened = parse(`Editar comportamento${pause} ${title}`, literal)
      assert.equal(opened.status, 'draft')
      assert.deepEqual(opened.intent, { type: 'behavior.edit.open', target: { behaviorId: 'punctuated' } })
      const result = parse(`Editar comportamento${pause} ${title} com descrição ${description}`, literal)
      assert.equal(result.status, 'draft')
      assert.deepEqual(result.intent, { type: 'behavior.update', target: { behaviorId: 'punctuated' }, draft: { description } })
    }
  }
})

test('behavior command header: mandatory space and at most one pause punctuation', () => {
  for (const verb of ['Editar', 'Criar']) {
    for (const header of ['comportamento.Pede ajuda', 'comportamento,Pede ajuda', 'comportamentoPede ajuda',
      'comportamento.. Pede ajuda', 'comportamento,, Pede ajuda', 'comportamento., Pede ajuda', 'comportamento,. Pede ajuda']) {
      const result = parse(`${verb} ${header}`)
      assert.equal(result.status, 'clarification', `${verb} ${header}`)
      assert.equal(result.intent, undefined)
    }
  }
})
