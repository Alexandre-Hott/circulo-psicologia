import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { INDICATORS } from '../src/indicatorCatalog.js'
import { groupIndicatorHistory } from '../src/desktopIndicatorEvolution.js'

test('desktop Rust indicator catalog exactly matches existing web definitions', () => {
  const rust = readFileSync(new URL('../src-tauri/src/vault/indicators.rs', import.meta.url), 'utf8')
  const json = rust.match(/DESKTOP_INDICATOR_CATALOG_JSON: &str = r#"([\s\S]*?)"#;/)?.[1]
  assert.ok(json, 'Rust catalog constant must remain inspectable')
  assert.deepEqual(JSON.parse(json), INDICATORS)
})

test('evolution groups only matching saved scales and distinguishes zero from no record', () => {
  const base = { id: 'reg', name: 'Regulação emocional', definition: 'Definição sintética', version: 1, labels: ['Ainda não observado', 'Com apoio'] }
  const sessions = [
    { id: 's3', sessionDate: '2026-10-12', observation: 'PRIVADO-NÃO-USAR', indicators: [{ ...base, value: 0, note: 'Nota contextual' }] },
    { id: 's2', sessionDate: '2026-10-05', indicators: [{ ...base, value: null, note: null }] },
    { id: 's1', sessionDate: '2026-09-28', indicators: [{ ...base, labels: ['Ainda não observado', 'Sem apoio'], value: 1, note: null }] },
    { id: 'old', sessionDate: '2026-09-21', indicators: [] },
  ]
  const groups = groupIndicatorHistory(sessions)
  assert.equal(groups.length, 2)
  assert.deepEqual(groups[0].records.map(({ sessionId, date, value, label, note }) => ({ sessionId, date, value, label, note })), [
    { sessionId: 's2', date: '2026-10-05', value: null, label: 'Sem registro', note: null },
    { sessionId: 's3', date: '2026-10-12', value: 0, label: 'Ainda não observado', note: 'Nota contextual' },
  ])
  assert.deepEqual(groups[1].records.map(({ sessionId, value, label, note }) => ({ sessionId, value, label, note })), [
    { sessionId: 's1', value: 1, label: 'Sem apoio', note: null },
  ])
  assert.ok(!JSON.stringify(groups).includes('PRIVADO-NÃO-USAR'))
  assert.ok(!JSON.stringify(groups).includes('old'))
})
