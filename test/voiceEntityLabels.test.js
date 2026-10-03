import test from 'node:test'
import assert from 'node:assert/strict'
import { entityOptionSuffix } from '../src/voiceEntityLabels.js'

test('homônimos recebem opções distintas sem renomear registros', () => {
  const list = [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Caio' }, { id: 'c', name: 'Ana' }]
  const original = structuredClone(list)
  assert.equal(entityOptionSuffix(list[0], list), ' · opção 1')
  assert.equal(entityOptionSuffix(list[2], list), ' · opção 2')
  assert.equal(entityOptionSuffix(list[1], list), '')
  assert.deepEqual(list, original)
})

test('lista reordenada recalcula opções sem perder IDs', () => {
  const list = [{ id: 'c', name: 'Ana' }, { id: 'a', name: 'Ana' }]
  assert.equal(entityOptionSuffix(list[0], list), ' · opção 1')
  assert.equal(entityOptionSuffix(list[1], list), ' · opção 2')
  assert.equal(entityOptionSuffix(list[0], [list[0]]), '')
})
