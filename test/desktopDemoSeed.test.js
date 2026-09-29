import test from 'node:test'
import assert from 'node:assert/strict'
import { seedSyntheticDemo } from '../src/desktopDemoSeed.js'

function fakeVault(failOnceAt = '') {
  const db = { patients: [], templates: [], series: [], drafts: [], sessions: [] }
  let failed = false
  let id = 0
  const invoke = async (command, args = {}) => {
    if (command === failOnceAt && !failed) { failed = true; throw new Error('synthetic interruption') }
    if (command === 'vault_status') return { unlocked: true }
    if (command === 'patient_list') return db.patients
    if (command === 'patient_create') { const item = { ...args.input, id: `p${++id}`, archivedAt: null }; db.patients.push(item); return item }
    if (command === 'behavior_list') return db.templates
    if (command === 'behavior_create') { const item = { ...args, id: `b${++id}` }; db.templates.push(item); return item }
    if (command === 'agenda_list_series') return db.series
    if (command === 'agenda_create_series') { const item = { ...args.input, id: `a${++id}` }; db.series.push(item); return item }
    if (command === 'indicator_catalog') return [{ id: 'one', labels: ['0', '1', '2'] }, { id: 'two', labels: ['0', '1', '2'] }]
    if (command === 'agenda_occurrences') return db.series.flatMap(item => [item.startDate, plusSeven(item.startDate)].filter(date => date >= args.from && date <= args.to).map(date => ({ seriesId: item.id, originalDate: date, date, status: db.sessions.some(session => session.seriesId === item.id && session.originalDate === date) ? 'completed' : 'scheduled' })))
    if (command === 'session_draft_list') return db.drafts.filter(item => item.patientId === args.patientId)
    if (command === 'session_timeline') return db.sessions.filter(item => item.patientId === args.patientId)
    if (command === 'session_draft_start') { const item = { id: `d${++id}`, patientId: db.series.find(series => series.id === args.seriesId).patientId, ...args }; db.drafts.push(item); return item }
    if (command === 'session_draft_save') { const item = db.drafts.find(draft => draft.id === args.id); Object.assign(item, args.input); return item }
    if (command === 'session_finalize') { const draft = db.drafts.find(item => item.id === args.id); const item = { ...draft, id: `s${++id}`, sessionDate: draft.originalDate, start: db.series.find(series => series.id === draft.seriesId).start }; db.sessions.push(item); db.drafts = db.drafts.filter(value => value.id !== args.id); return item }
    throw new Error(`Unexpected command ${command}`)
  }
  return { db, invoke }
}
function installInvoke(t, handler) {
  const previousWindow = globalThis.window
  globalThis.window = { __TAURI_INTERNALS__: { invoke: handler } }
  t.after(() => { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow })
}
const plusSeven = date => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 7); return d.toISOString().slice(0, 10) }

test('creates only labelled synthetic data and rerun does not duplicate it', async t => {
  const { db, invoke } = fakeVault()
  installInvoke(t, invoke)
  db.patients.push({ id: 'real', name: 'Pessoa preexistente', archivedAt: null })
  const first = await seedSyntheticDemo()
  assert.equal(first.synthetic, true)
  assert.match(first.label, /fictícios/)
  assert.deepEqual(first.created, { patients: 3, templates: 2, series: 3, sessions: 4 })
  assert.equal(db.sessions.length, 4)
  assert.equal(db.patients[0].name, 'Pessoa preexistente')
  const second = await seedSyntheticDemo()
  assert.deepEqual(second.created, { patients: 0, templates: 0, series: 0, sessions: 0 })
  assert.deepEqual(second.sessionIds, first.sessionIds)
  assert.equal(db.patients.length, 4)
  assert.equal(db.series.length, 3)
})

test('resumes after partial failure without touching unrelated records', async t => {
  const { db, invoke } = fakeVault('session_finalize')
  installInvoke(t, invoke)
  await assert.rejects(seedSyntheticDemo(), /synthetic interruption/)
  assert.equal(db.drafts.length, 1)
  const result = await seedSyntheticDemo()
  assert.equal(result.created.patients, 0)
  assert.equal(db.sessions.length, 4)
  assert.equal(db.drafts.length, 0)
})

test('requires unlocked vault', async t => {
  installInvoke(t, async () => ({ unlocked: false }))
  await assert.rejects(seedSyntheticDemo(), /Desbloqueie/)
})

test('refuses a pre-existing namesake patient with unverified origin', async t => {
  const { db, invoke } = fakeVault()
  installInvoke(t, invoke)
  const collision = { id: 'external-patient-collision', name: 'Exemplo Demo — Lia Fictícia', archivedAt: null }
  db.patients.push(collision)
  await assert.rejects(seedSyntheticDemo(), /sem origem verificável/)
  assert.deepEqual(db.patients, [collision])
  assert.equal(db.templates.length, 0)
  assert.equal(db.series.length, 0)
  assert.equal(db.sessions.length, 0)
})

test('refuses a lookalike series with a different original date without changing it', async t => {
  const { db, invoke } = fakeVault('indicator_catalog')
  installInvoke(t, invoke)
  await assert.rejects(seedSyntheticDemo(), /synthetic interruption/)
  const original = { ...db.series[0] }
  db.series[0].startDate = plusSeven(original.startDate)
  await assert.rejects(seedSyntheticDemo(), /Série existente divergente/)
  assert.deepEqual(db.series[0], { ...original, startDate: plusSeven(original.startDate) })
  assert.equal(db.series.length, 3)
  assert.equal(db.sessions.length, 0)
})

test('refuses to overwrite a user-edited demo draft after interruption', async t => {
  const { db, invoke } = fakeVault('session_finalize')
  installInvoke(t, invoke)
  await assert.rejects(seedSyntheticDemo(), /synthetic interruption/)
  db.drafts[0].procedures = 'Texto alterado pela pessoa usuária'
  const preserved = structuredClone(db.drafts[0])
  await assert.rejects(seedSyntheticDemo(), /Rascunho existente modificado/)
  assert.deepEqual(db.drafts[0], preserved)
  assert.equal(db.sessions.length, 0)
})
