import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCentralCommand } from '../src/centralCommandRouter.js'

const fields = [
  ['observação', 'observation'], ['procedimentos', 'procedures'],
  ['resultado', 'outcomeDecision'], ['encaminhamento', 'referralClosure'],
]

// A valid patient name and permitted horizontal header spacing reach the
// command ceiling without exceeding the clinical ceiling. No data/handlers.
function fixture(verb, label, field, budget) {
  const patientName = 'Ana Clara'
  const header = `${verb}${' '.repeat(650)}${label} da sessão de ${patientName} com `
  const value = 'Á\r\n' + 'B'.repeat(budget - header.length - 6) + '\n  '
  const baseValue = 'Manual.\r\nAnterior'
  const context = {
    patients: [{ id: 'patient-budget', name: patientName, archivedAt: null }],
    activeSessionDraft: { id: 'draft-budget', patientId: 'patient-budget', patientName, originalDate: '2026-10-04' },
    clinicalTextSnapshot: {
      patientId: 'patient-budget', sessionDraftId: 'draft-budget', epoch: 70, revision: 1,
      values: { observation: '', procedures: '', outcomeDecision: '', referralClosure: '', [field]: baseValue },
    },
  }
  const text = header + value
  assert.equal(text.length, budget)
  assert.equal(text.trim().length, budget - 3, 'trim would wrongly discount preserved payload LF and two spaces')
  assert.ok(value.length <= 4000)
  assert.ok(baseValue.length + 1 + value.length <= 4000, 'append must independently fit the clinical ceiling')
  return { text, value, context, patientName, baseValue }
}

for (const [label, field] of fields) {
  for (const [verb, operation] of [['Preencher', 'replace'], ['Acrescentar', 'append']]) {
    for (const budget of [4600, 4601]) {
      test(`${field} ${operation}: effective multiline command ${budget}, including literal trailing whitespace`, () => {
        const { text, value, context, patientName, baseValue } = fixture(verb, label, field, budget)
        const before = structuredClone(context)
        const result = parseCentralCommand({ text, context })
        assert.deepEqual(context, before)
        if (budget === 4601) {
          assert.equal(result.status, 'clarification')
          assert.equal(result.intent, undefined)
          assert.equal(result.code, undefined, 'command budget is not the clinical field limit')
          assert.match(result.message, /4600/u)
          return
        }
        assert.equal(result.status, 'draft')
        assert.equal(result.intent.type, 'session.draft.update')
        assert.deepEqual(result.intent.target, {
          patientId: 'patient-budget', patientName, sessionDraftId: 'draft-budget', sessionDate: '2026-10-04',
        })
        assert.equal(result.intent.patch.field, field)
        assert.equal(result.intent.patch.operation, operation)
        assert.equal(result.intent.patch.value, value, 'CRLF and final LF/two spaces are never trimmed to fit')
        if (operation === 'append') {
          assert.equal(result.intent.patch.baseValue, baseValue)
          assert.equal(result.intent.patch.separator, ' ')
          assert.equal(result.intent.patch.baseEpoch, 70)
          assert.equal(result.intent.patch.baseRevision, 1)
        }
        assert.ok(result.preview.includes(value))
      })
    }
  }
}

test('external leading whitespace is not clinical payload and does not consume the effective budget', () => {
  const { text, value, context } = fixture('Acrescentar', 'observação', 'observation', 4600)
  const result = parseCentralCommand({ text: ' \t\n' + text, context })
  assert.equal(result.status, 'draft')
  assert.equal(result.intent.patch.value, value)
})

test('legacy one-line command retains outer trim and the 4600/4601 ceiling', () => {
  for (const budget of [4600, 4601]) {
    const text = 'Abrir' + ' '.repeat(budget - 'AbrirAgenda'.length) + 'Agenda'
    assert.equal(text.length, budget)
    for (const source of [text, ' \n' + text + '\n ']) {
      const result = parseCentralCommand({ text: source })
      assert.equal(result.status, budget === 4600 ? 'draft' : 'clarification')
      if (budget === 4601) {
        assert.equal(result.intent, undefined)
        assert.match(result.message, /4600/u)
      }
    }
  }
})
