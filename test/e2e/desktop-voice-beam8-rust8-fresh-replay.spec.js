import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

// Fresh Rust stdout marker only: no CLI A/B text, fabricated transcript,
// clinical repair or historical fallback. Parser/intent proof is the real UI below.
const corpusPath = process.env.CIRCULO_NATIVE_REPLAY_JSON
  || new URL('../fixtures/native-voice-beam8-rust8-fresh.json', import.meta.url)
let corpus
test.beforeAll(() => {
  corpus = JSON.parse(readFileSync(corpusPath, 'utf8').replace(/^\uFEFF/, ''))
  expect(corpus.Cases.map(item => item.Index).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  for (const item of corpus.Cases) {
    expect(typeof item.Transcript).toBe('string')
    expect(item.Transcript.trim().length).toBeGreaterThan(0)
  }
})
const base = 'Base fictícia.'
const fields = [
  ['observation', 'Observações descritivas'], ['procedures', 'Procedimentos realizados'],
  ['outcomeDecision', 'Resultado e decisão'], ['referralClosure', 'Encaminhamento ou encerramento (opcional)'],
]
const assistant = page => page.getByRole('region', { name: 'Comando do Círculo', exact: true })
const preview = page => page.locator('.voice-command-preview')
const form = page => page.getByRole('form', { name: 'Rascunho de sessão', exact: true })
const snapshot = page => page.evaluate(() => structuredClone(window.freshBeamRustNative.state))
const recording = index => corpus.Cases.find(item => item.Index === index)

// Real App/DesktopVault/capture/gateway/Sessions/forms/handlers. Only native
// media and IPC are synthetic. These fixed texts came from actual ASR, but this
// replay is NOT new ASR, word accuracy, a physical-mic test or a usable-all claim.
// Never feed ExpectedSpoken to the app or inject an intent/React callback.
test.describe.configure({ timeout: 60000 })

async function openApp(page) {
  const time = new Date('2026-10-04T15:00:00Z')
  await page.clock.install({ time })
  await page.clock.pauseAt(time)
  await page.addInitScript(({ base }) => {
    const clone = value => structuredClone(value)
    const patients = [
      { id: 'ana', name: 'Ana Clara', age: 8, revision: 1, preferredModality: 'Presencial', archivedAt: null },
      { id: 'bia', name: 'Bia Fictícia', age: 9, revision: 1, preferredModality: 'Online', archivedAt: null },
    ]
    const behaviors = [
      { id: 'help', title: 'Pede ajuda', description: '', version: 1 },
      { id: 'other', title: 'Comportamento concorrente', description: '', version: 1 },
    ]
    const drafts = [
      { id: 'synthetic-draft', patientId: 'ana', seriesId: 'synthetic-series', originalDate: '2026-10-04', observation: base, procedures: base, outcomeDecision: base, referralClosure: base, behaviorIds: [], indicators: [] },
      { id: 'synthetic-draft-bia', patientId: 'bia', seriesId: 'synthetic-series-bia', originalDate: '2026-10-04', observation: 'Observação concorrente.', procedures: 'Procedimento concorrente.', outcomeDecision: 'Resultado concorrente.', referralClosure: 'Encaminhamento concorrente.', behaviorIds: ['other'], indicators: [] },
    ]
    const fixture = window.freshBeamRustNative = {
      state: { patients, behaviors, drafts }, calls: [], writes: [], unexpected: [],
      transcripts: [], captures: [], captureRefs: [], catalogReady: false,
      mediaRequests: 0, trackStops: 0, contextCloses: 0, sourceDisconnects: 0, processorDisconnects: 0,
    }
    const reads = new Set()
    const catalog = (command, value) => {
      reads.add(command)
      fixture.catalogReady = ['patient_list', 'behavior_list', 'indicator_catalog'].every(name => reads.has(name))
      return clone(value)
    }
    const fail = message => { fixture.unexpected.push(message); throw new Error(message) }
    class SyntheticAudioContext {
      constructor() { this.sampleRate = 8000; this.state = 'running'; this.destination = {} }
      createMediaStreamSource() { return { connect() {}, disconnect() { fixture.sourceDisconnects++ } } }
      createScriptProcessor() {
        const processor = { onaudioprocess: null, disconnect() { fixture.processorDisconnects++ } }
        processor.connect = () => queueMicrotask(() => {
          let frames = 0
          const emit = () => {
            if (!processor.onaudioprocess) return
            const amplitude = frames++ < 2 ? 0.1 : 0
            processor.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(4096).fill(amplitude) }, outputBuffer: { getChannelData: () => new Float32Array(4096) } })
            if (processor.onaudioprocess) setTimeout(emit, 200)
          }
          emit()
        })
        return processor
      }
      resume() { return Promise.resolve() }
      close() { this.state = 'closed'; fixture.contextCloses++; return Promise.resolve() }
    }
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: SyntheticAudioContext })
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
      fixture.mediaRequests++
      return { getTracks: () => [{ stop() { fixture.trackStops++ } }] }
    } } })
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      if (command === 'voice_transcribe') {
        if (Object.keys(args).sort().join('|') !== 'patientNames|sampleRate|samples'
          || args.sampleRate !== 8000 || !Array.isArray(args.samples) || !args.samples.length
          || args.samples.length / args.sampleRate >= 12 || !args.samples.every(Number.isFinite)
          || !args.samples.some(value => value !== 0) || !args.samples.some(value => value === 0)
          || JSON.stringify(args.patientNames) !== JSON.stringify(['Ana Clara', 'Bia Fictícia'])) return fail('Payload de captura inválido')
        const transcript = fixture.transcripts.shift()
        if (typeof transcript !== 'string' || !transcript.trim()) return fail('Captura sem transcrição congelada')
        fixture.calls.push({ command })
        fixture.captures.push({ transcript, sampleRate: args.sampleRate, sampleCount: args.samples.length, patientNames: clone(args.patientNames) })
        fixture.captureRefs.push(args)
        return transcript
      }
      fixture.calls.push(clone({ command, args }))
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { available: false, dirty: false }
      if (command === 'plugin:updater|check') return null
      if (command === 'patient_list') return catalog(command, patients)
      if (command === 'behavior_list') return catalog(command, behaviors)
      if (command === 'indicator_catalog') return catalog(command, [])
      if (command === 'session_draft_list') {
        if (!['ana', 'bia'].includes(args.patientId)) return fail('Leitura de paciente não sintético')
        return clone(drafts.filter(item => item.patientId === args.patientId))
      }
      if (['agenda_list_series', 'agenda_occurrences', 'agenda_history', 'session_timeline', 'session_addendum_list', 'case_context_list'].includes(command)) return []
      // Any persistence, creation, finalization, export or native chooser is forbidden.
      fixture.writes.push(clone({ command, args }))
      return fail(`IPC fora do contrato estrito: ${command}`)
    } }
  }, { base })
  await page.goto('/')
  await expect(assistant(page)).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.freshBeamRustNative.catalogReady)).toBe(true)
  await expect(page.getByRole('button', { name: 'Início', exact: true })).toHaveAttribute('aria-current', 'page')
}

async function propose(page, text) {
  const input = assistant(page).getByLabel('Seu comando')
  await input.fill(text)
  await input.press('Control+Enter')
  await page.clock.runFor(32)
}

async function command(page, text) {
  await propose(page, text)
  await expect(preview(page)).toBeVisible()
  await propose(page, 'Confirmar')
  await expect(preview(page)).toHaveCount(0)
}

async function resumeDraft(page, patientId) {
  const details = page.locator('#session-other-drafts')
  const summary = details.locator('summary')
  await expect(summary).toBeVisible()
  if (await details.getAttribute('open') === null) await summary.press('Enter')
  const id = patientId === 'ana' ? 'synthetic-draft' : 'synthetic-draft-bia'
  const resume = details.locator(`button[data-voice-record="draft:${id}"]`)
  await expect(resume).toBeEnabled()
  await resume.press('Enter')
  await expect(form(page)).toHaveAttribute('data-voice-record', id)
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue(patientId)
}

async function openDraft(page) {
  await openApp(page)
  await command(page, 'Abrir registros de Ana Clara')
  await resumeDraft(page, 'ana')
  await expect(form(page).getByLabel(fields[0][1], { exact: true })).toBeEnabled()
}

async function replayAudio(page, index) {
  const text = recording(index).Transcript
  await page.evaluate(transcript => window.freshBeamRustNative.transcripts.push(transcript), text)
  const listen = assistant(page).getByRole('button', { name: 'Ouvir comando', exact: true })
  await expect(listen).toBeEnabled()
  await assistant(page).getByLabel('Seu comando').press('Control+Alt+m')
  await page.clock.runFor(1600)
  await expect(listen).toBeEnabled()
  await expect(assistant(page).getByLabel('Seu comando')).toHaveValue(text)
  await expect(assistant(page).getByText(/A captura atingiu .*segundos/u)).toHaveCount(0)
}

async function expectNoWrites(page, before) {
  expect(await snapshot(page)).toEqual(before)
  expect(await page.evaluate(() => window.freshBeamRustNative.writes)).toEqual([])
  expect(await page.evaluate(() => window.freshBeamRustNative.unexpected)).toEqual([])
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
}

async function expectValues(page, expected) {
  await expect(form(page)).toHaveAttribute('data-voice-record', expected.id)
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue(expected.patientId)
  for (const [key, label] of fields) await expect(form(page).getByLabel(label, { exact: true })).toHaveValue(expected[key])
  for (const [id, title] of [['help', 'Pede ajuda'], ['other', 'Comportamento concorrente']]) {
    const checkbox = form(page).getByRole('checkbox', { name: `${title} · v1`, exact: true })
    if (expected.behaviorIds.includes(id)) await expect(checkbox).toBeChecked()
    else await expect(checkbox).not.toBeChecked()
  }
}

test.beforeEach(async ({ page, baseURL }) => {
  const boundary = []
  page.on('dialog', async dialog => { boundary.push(`native dialog: ${dialog.type()}`); await dialog.dismiss() })
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) await route.continue()
    else { boundary.push(route.request().url()); await route.abort() }
  })
  page.freshBeamRustNativeBoundary = boundary
})

test.afterEach(async ({ page }) => {
  expect(page.freshBeamRustNativeBoundary).toEqual([])
  const status = await page.evaluate(() => {
    const f = window.freshBeamRustNative
    return { writes: f.writes, unexpected: f.unexpected, queued: f.transcripts,
      count: f.captures.length, releases: [f.mediaRequests, f.trackStops, f.contextCloses, f.sourceDisconnects, f.processorDisconnects],
      cleared: f.captureRefs.every(args => args.samples.every(sample => sample === 0) && args.patientNames.every(name => name === '')) }
  })
  expect(status.writes).toEqual([])
  expect(status.unexpected).toEqual([])
  expect(status.queued).toEqual([])
  expect(status.releases).toEqual(Array(5).fill(status.count))
  expect(status.cleared).toBe(true)
})


// Read-only, committed-root observation reused from the approved dictation suite.
// No callback invocation, synthetic intent, or React state mutation.
async function realPendingIntent(page) {
  return assistant(page).evaluate(region => {
    const key = Object.keys(region).find(key => key.startsWith('__reactFiber$'))
    let root = region[key]
    while (root?.return) root = root.return
    const stack = [{ fiber: root?.stateNode?.current, path: [] }]
    let committedPath
    while (stack.length) {
      const { fiber, path } = stack.pop()
      if (!fiber) continue
      const nextPath = [...path, fiber]
      if (fiber.stateNode === region) { committedPath = nextPath; break }
      for (let child = fiber.child; child; child = child.sibling) stack.push({ fiber: child, path: nextPath })
    }
    if (!committedPath) throw new Error('Região não encontrada na árvore React atual')
    for (const fiber of committedPath.reverse()) {
      if (typeof fiber.memoizedProps?.prepareDictation === 'function') return structuredClone(fiber.memoizedProps.pendingIntent)
    }
    throw new Error('Props reais do VoiceCommandCenter não encontradas')
  })
}

async function expectSessionIntent(page, field, value, operation) {
  const intent = await realPendingIntent(page)
  expect(intent.type).toBe('session.draft.update')
  expect(intent.target).toEqual({
    patientId: 'ana', patientName: 'Ana Clara', sessionDraftId: 'synthetic-draft', sessionDate: '2026-10-04',
  })
  if (operation === 'add') expect(intent.patch).toEqual({ field, operation, value, label: 'Pede ajuda' })
  else expect(intent.patch).toEqual({
    field, operation, value, separator: ' ', baseValue: base,
    baseEpoch: expect.any(Number), baseRevision: expect.any(Number),
  })
  // UI snapshot generations are current runtime values, not Rust's isolated
  // evaluation epoch=1/revision=7. IDs, destination and literal remain exact.
}

async function refuseStaleThenReturn(page, before, original) {
  await page.getByLabel('Paciente para evolução e sessões').selectOption('bia')
  await resumeDraft(page, 'bia')
  const other = before.drafts.find(item => item.patientId === 'bia')
  await expectValues(page, other)
  await replayAudio(page, 7)
  await expect(preview(page)).toHaveCount(0)
  expect(await realPendingIntent(page)).toBeNull()
  await expectValues(page, other)
  await expectNoWrites(page, before)
  await page.getByLabel('Paciente para evolução e sessões').selectOption('ana')
  await resumeDraft(page, 'ana')
  await replayAudio(page, 7)
  await expect(preview(page)).toHaveCount(0)
  await expectValues(page, original)
  await expectNoWrites(page, before)
}

test('FRESH BEAM8 Rust8 0: recorrência abre apenas formulário exato após segundo áudio, zero writes', async ({ page }) => {
  await openApp(page)
  const before = await snapshot(page)
  await replayAudio(page, 0)
  await expect(preview(page)).toContainText('Ana Clara')
  expect(await realPendingIntent(page)).toEqual({
    type: 'appointment.recurring.create',
    draft: {
      appointmentType: 'Recorrente', patientId: 'ana', patientName: 'Ana Clara',
      weekday: 4, frequency: 'Semanal', start: '15:00', end: '15:50',
      startDate: '2026-10-04', endDate: null, modality: 'Presencial', meetingLink: '',
    },
  })
  await expect(page.getByRole('form', { name: 'Novo compromisso', exact: true })).toHaveCount(0)
  await expectNoWrites(page, before)
  await replayAudio(page, 7)
  const appointment = page.getByRole('form', { name: 'Novo compromisso', exact: true })
  await expect(appointment).toBeVisible()
  for (const [label, value] of [
    ['Tipo', 'Recorrente'], ['Paciente', 'ana'], ['Dia da semana', '4'],
    ['Frequência', 'Semanal'], ['Início da série', '2026-10-04'],
    ['Horário inicial', '15:00'], ['Horário final', '15:50'], ['Modalidade', 'Presencial'],
  ]) await expect(appointment.getByLabel(label, { exact: true })).toHaveValue(value)
  await expect(preview(page)).toHaveCount(0)
  await expectNoWrites(page, before)
})

test('FRESH BEAM8 Rust8 1: nome real correto prepara cadastro exato só após confirmação sem criar paciente', async ({ page }) => {
  await openApp(page)
  const before = await snapshot(page)
  await replayAudio(page, 1)
  await expect(preview(page)).toContainText('Bia Fictícia')
  expect(await realPendingIntent(page)).toEqual({ type: 'patient.create', draft: { name: 'Bia Fictícia', age: 9 } })
  await expect(page.getByRole('form', { name: 'Novo cadastro', exact: true })).toHaveCount(0)
  await expectNoWrites(page, before)
  await replayAudio(page, 7)
  const patientForm = page.getByRole('form', { name: 'Novo cadastro', exact: true })
  await expect(patientForm).toBeVisible()
  await expect(patientForm).toHaveAttribute('data-voice-record', 'new-patient')
  await expect(patientForm.getByLabel('Nome', { exact: true })).toHaveValue('Bia Fictícia')
  await expect(patientForm.getByLabel('Idade em anos (opcional)', { exact: true })).toHaveValue('9')
  await replayAudio(page, 7)
  await expect(patientForm.getByLabel('Nome', { exact: true })).toHaveValue('Bia Fictícia')
  await expectNoWrites(page, before)
})

test('FRESH BEAM8 Rust8 2: comportamento mantém IDs Ana/help e aplica uma vez sem salvar', async ({ page }) => {
  await openDraft(page)
  const before = await snapshot(page)
  const original = before.drafts.find(item => item.patientId === 'ana')
  await replayAudio(page, 2)
  await expect(preview(page)).toContainText('Ana Clara')
  await expect(preview(page)).toContainText('Pede ajuda')
  await expectSessionIntent(page, 'behaviorIds', 'help', 'add')
  await expectValues(page, original)
  await expectNoWrites(page, before)
  await replayAudio(page, 7)
  const expected = { ...original, behaviorIds: ['help'] }
  await expectValues(page, expected)
  await expect(form(page)).toContainText('Alteração de voz ainda não salva')
  await replayAudio(page, 7)
  await page.clock.runFor(1200)
  await expectValues(page, expected)
  await expectNoWrites(page, before)
})


for (const [index, key, chunk] of [
  [3, 'observation', 'pediu ajuda.'], [4, 'procedures', 'fez jogo de turnos.'], [5, 'outcomeDecision', 'manteve atenção.'],
  [6, 'referralClosure', 'próxima sessão semanal.'],
]) test(`FRESH BEAM8 Rust8 ${index}: ${key} literal exato, stale ABA recusado e confirmação nova sem Save`, async ({ page }) => {
  expect(recording(index).Transcript.endsWith(` com ${chunk}`)).toBe(true)
  await openDraft(page)
  const before = await snapshot(page)
  const original = before.drafts.find(item => item.patientId === 'ana')
  await replayAudio(page, index)
  await expect(preview(page)).toContainText('Ana Clara')
  await expect(preview(page)).toContainText(chunk)
  await expectSessionIntent(page, key, chunk, 'append')
  await expectValues(page, original)
  await expectNoWrites(page, before)
  // Proposal invalidation through real patient/draft UI, including return to A.
  await refuseStaleThenReturn(page, before, original)
  await replayAudio(page, index)
  await expectSessionIntent(page, key, chunk, 'append')
  await expect(preview(page)).toContainText(chunk)
  await expectValues(page, original)
  await expectNoWrites(page, before)
  await replayAudio(page, 7)
  const expected = { ...original, [key]: `${base} ${chunk}` }
  await expectValues(page, expected)
  await expect(form(page)).toContainText('Alteração de voz ainda não salva')
  await replayAudio(page, 7)
  await page.clock.runFor(1200)
  await expectValues(page, expected)
  await expectNoWrites(page, before)
})

test('FRESH BEAM8 Rust8 7: confirmar texto isolado ou proposta de outro paciente não autoriza apply', async ({ page }) => {
  expect(recording(7).Transcript).toBe('Confirmar comando.')
  await openDraft(page)
  const before = await snapshot(page)
  const original = before.drafts.find(item => item.patientId === 'ana')
  await replayAudio(page, 7)
  await expect(preview(page)).toHaveCount(0)
  await expectValues(page, original)
  await expectNoWrites(page, before)
  await replayAudio(page, 4)
  await expectSessionIntent(page, 'procedures', 'fez jogo de turnos.', 'append')
  await expectValues(page, original)
  await page.getByLabel('Paciente para evolução e sessões').selectOption('bia')
  await resumeDraft(page, 'bia')
  const other = before.drafts.find(item => item.patientId === 'bia')
  await replayAudio(page, 7)
  await page.clock.runFor(1200)
  await expect(preview(page)).toHaveCount(0)
  await expectValues(page, other)
  await expect(form(page)).not.toContainText('Alteração de voz ainda não salva')
  await expectNoWrites(page, before)
})
