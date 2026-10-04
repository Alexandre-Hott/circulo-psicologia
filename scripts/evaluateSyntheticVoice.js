import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { parseCentralCommand } from '../src/centralCommandRouter.js'

// A fixed fictitious context, never the user's profile. Full intents are checked;
// this is not UI execution, confirmation, persistence, or physical-mic validation.
const context = {
  patients: [{ id: 'ana', name: 'Ana Clara', archivedAt: null }],
  behaviors: [{ id: 'help', title: 'Pede ajuda', archivedAt: null }],
  indicators: [], activeSessionDraft: { id: 'synthetic-draft', patientId: 'ana' },
}
const expected = [
  { type: 'appointment.recurring.create', draft: { appointmentType: 'Recorrente', patientId: 'ana', patientName: 'Ana Clara', weekday: 4, frequency: 'Semanal', start: '15:00', end: '15:50', startDate: '2026-10-03', endDate: null, modality: 'Presencial', meetingLink: '' } },
  { type: 'patient.create', draft: { name: 'Bia Fictícia', age: 9 } },
  { type: 'session.draft.update', target: { patientId: 'ana', patientName: 'Ana Clara', sessionDraftId: 'synthetic-draft', sessionDate: null }, patch: { field: 'behaviorIds', operation: 'add', value: 'help', label: 'Pede ajuda' } },
  { type: 'behavior.create', draft: { title: 'Espera a vez', description: '' } },
  { type: 'workspace.open', target: { space: 'agenda' } },
  null, // Visible-control selection must be evaluated in a real rendered UI.
  null, // Confirmation requires an existing proposal in VoiceCommandCenter.
  { type: 'workspace.open', target: { space: 'patients' } },
  { type: 'patient.workspace.open', target: { patientId: 'ana', space: 'sessions' } },
  { type: 'analytics.view', target: { patientId: '', from: '2026-10-01', to: '2026-10-31', view: 'month' } },
  { type: 'workspace.open', target: { space: 'settings' } },
  { type: 'patient.edit.open', target: { patientId: 'ana' } },
  { type: 'workspace.open', target: { space: 'sessions', section: 'library' } },
  { type: 'patient.workspace.open', target: { patientId: 'ana', space: 'context' } },
  { type: 'behavior.edit.open', target: { behaviorId: 'help' } },
  { type: 'session.addendum.open', target: { patientId: 'ana', date: '2026-10-03', start: '15:00' } },
  { type: 'agenda.view', target: { view: 'day', referenceDate: '2026-10-03' } },
]
// Only fictional display names/titles tolerate case, accent, spacing and terminal
// sentence punctuation. IDs, action types, dates and times remain byte-exact.
const fold = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.!?]+$/g, '').trim()
function matches(actual, desired, key = '') {
  if (typeof desired === 'string') return typeof actual === 'string' && (['name', 'title', 'patientName', 'label'].includes(key) ? fold(actual) === fold(desired) : actual === desired)
  if (desired && typeof desired === 'object') return actual && typeof actual === 'object' && Object.keys(actual).length === Object.keys(desired).length && Object.entries(desired).every(([key, value]) => matches(actual[key], value, key))
  return actual === desired
}

export function evaluateSyntheticVoice(cases, { scenario = 'core' } = {}) {
  if (!['core', 'behavior-save', 'behavior-remove', 'indicator-value', 'occurrence-date', 'occurrence-minutes', 'analytics-range', 'interface-fields', 'interface-weekday', 'interface-party', 'interface-drawer', 'interface-series', 'interface-details', 'interface-draft-resume', 'interface-draft-continue', 'interface-draft-choice'].includes(scenario)) throw new Error('Cenário de áudio desconhecido.')
  const scenarioContext = scenario === 'indicator-value' ? {
    ...context,
    indicators: [{ id: 'indicator-regulation', name: 'Regulação emocional', archivedAt: null, labels: ['Ainda não observado', 'Com muito apoio', 'Com algum apoio', 'Com autonomia'] }],
  } : context
  const expectations = scenario === 'core' ? expected : ['behavior-save', 'interface-fields', 'interface-weekday', 'interface-drawer', 'interface-series', 'interface-details', 'interface-draft-resume', 'interface-draft-continue', 'interface-draft-choice'].includes(scenario) ? [null, null, null]
    : scenario === 'interface-party' ? [{ type: 'patient.workspace.open', target: { patientId: 'ana', space: 'links' } }, null, null]
    : scenario === 'behavior-remove' ? [0, 1].map(() => ({ type: 'session.draft.update', target: { patientId: 'ana', patientName: 'Ana Clara', sessionDraftId: 'synthetic-draft', sessionDate: null }, patch: { field: 'behaviorIds', operation: 'remove', value: 'help', label: 'Pede ajuda' } })).concat(null)
    : scenario === 'indicator-value' ? ['Com algum apoio', 'Com autonomia'].map((label, index) => ({ type: 'session.draft.update', target: { patientId: 'ana', patientName: 'Ana Clara', sessionDraftId: 'synthetic-draft', sessionDate: null }, patch: { field: 'indicators', operation: 'set', value: { id: 'indicator-regulation', value: index + 2, label } } })).concat(null)
    : scenario === 'analytics-range' ? ['ana', ''].map(patientId => ({ type: 'analytics.view', target: { patientId, from: '2026-09-01', to: '2026-09-30', view: 'custom' } }))
    : scenario === 'occurrence-minutes' ? ['start', 'remarcar', 'cancelar'].map(action => ({ type: 'agenda.occurrence.action', target: { patientId: 'ana', date: '2026-10-03', start: '15:45', action } })).concat(
      { type: 'session.addendum.open', target: { patientId: 'ana', date: '2026-10-03', start: '15:45' } }, null)
    : ['start', 'remarcar', 'cancelar'].map(action => ({ type: 'agenda.occurrence.action', target: { patientId: 'ana', date: '2026-10-03', start: '15:00', action } }))
  if (!Array.isArray(cases) || cases.length !== expectations.length) throw new Error(`Corpus nativo deve conter exatamente${expectations.length} casos.`)
  const seen = new Set()
  const results = cases.map(item => {
    if (!Number.isInteger(item.Index) || item.Index < 0 || item.Index >= expectations.length || seen.has(item.Index) || typeof item.Transcript !== 'string' || !item.Transcript.trim()) throw new Error('Índice/transcrição inválido ou duplicado no corpus nativo.')
    seen.add(item.Index)
    const desired = expectations[item.Index]
    if (!desired) return { ...item, Status: 'not-evaluated', Reason: 'Exige interface visível ou proposta pendente; não avaliado pelo parser central.' }
    const parsed = parseCentralCommand({ text: item.Transcript, context: scenarioContext, referenceDate: '2026-10-03' })
    const passed = parsed.status === 'draft' && matches(parsed.intent, desired)
    return { ...item, Status: passed ? 'passed' : 'failed', ExpectedIntent: desired, ActualIntent: parsed.intent ?? null, Reason: passed ? 'Intent completo correspondente, com tolerância explícita de grafia em nomes/títulos.' : parsed.message || 'Ação ou campos divergentes.' }
  })
  return { Passed: results.filter(item => item.Status === 'passed').length, Failed: results.filter(item => item.Status === 'failed').length, NotEvaluated: results.filter(item => item.Status === 'not-evaluated').length, Results: results }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = {}
    for (let index = 2; index < process.argv.length; index += 2) {
      const key = process.argv[index]
      if (!['--input', '--scenario'].includes(key) || !process.argv[index + 1] || Object.hasOwn(options, key)) throw new Error('Argumentos inválidos.')
      options[key] = process.argv[index + 1]
    }
    const input = options['--input'] || 0
    process.stdout.write(JSON.stringify(evaluateSyntheticVoice(JSON.parse(readFileSync(input, 'utf8').replace(/^\uFEFF/, '')), { scenario: options['--scenario'] || 'core' })) + '\n')
  } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1 }
}
