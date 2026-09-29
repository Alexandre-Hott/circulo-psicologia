import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { inSupportedRange } from '../src/analyticsRange.js'

test('analytics range follows 60 calendar months with leap-day clamping', () => {
  assert.equal(inSupportedRange('2020-02-29', '2025-02-28'), true)
  assert.equal(inSupportedRange('2020-02-29', '2025-03-01'), false)
  assert.equal(inSupportedRange('2021-03-01', '2026-03-01'), true)
  assert.equal(inSupportedRange('2021-03-01', '2026-03-02'), false)
  assert.equal(inSupportedRange('2020-01-01', '2025-01-01'), true)
})

test('analytics range rejects impossible and malformed civil dates', () => {
  for (const [from, to] of [['2026-02-29', '2026-03-01'], ['2024-04-31', '2024-05-01'], ['2024-02-29', '2024-02-30'], ['2026-1-01', '2026-01-31'], ['2026-10-06', '2026-10-05'], ['', '2026-10-05']]) {
    assert.equal(inSupportedRange(from, to), false, `${from} to ${to}`)
  }
})
