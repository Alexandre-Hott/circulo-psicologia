import test from 'node:test'
import assert from 'node:assert/strict'
import { clearIndicatorValue } from '../src/indicatorValueModel.js'

test('clearing an indicator removes only that value and does not mutate the draft', () => {
  const values={reg:0,com:2}
  assert.deepEqual(clearIndicatorValue(values,'reg'),{com:2})
  assert.deepEqual(values,{reg:0,com:2})
  assert.deepEqual(clearIndicatorValue({reg:null,com:2},'reg'),{com:2})
})
