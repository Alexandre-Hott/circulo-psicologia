import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupIndicatorHistory } from '../src/desktopIndicatorEvolution.js'

test('preserva zero e ausência em sessões ordenadas por data', () => {
  const snapshot = value => ({ id: 'regulation', version: 1, name: 'Regulação', definition: 'Descrição', labels: ['Não observado', 'Às vezes', 'Observado'], value })
  const groups = groupIndicatorHistory([
    { id: 'later', sessionDate: '2026-09-20', indicators: [snapshot(null)] },
    { id: 'earlier', sessionDate: '2026-09-01', indicators: [snapshot(0)] },
  ])
  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0].records.map(({ date, value, label }) => ({ date, value, label })), [
    { date: '2026-09-01', value: 0, label: 'Não observado' },
    { date: '2026-09-20', value: null, label: 'Sem registro' },
  ])
})

test('separa versões e rótulos incompatíveis mesmo com o mesmo ID', () => {
  const sessions = [
    { id: 'a', sessionDate: '2026-09-01', indicators: [{ id: 'x', version: 1, name: 'X', labels: ['A', 'B'], value: 1 }] },
    { id: 'b', sessionDate: '2026-09-02', indicators: [{ id: 'x', version: 2, name: 'X', labels: ['A', 'B'], value: 0 }] },
    { id: 'c', sessionDate: '2026-09-03', indicators: [{ id: 'x', version: 1, name: 'X', labels: ['A', 'C'], value: 1 }] },
  ]
  assert.deepEqual(groupIndicatorHistory(sessions).map(group => group.records.map(record => record.sessionId)), [['a'], ['b'], ['c']])
})
