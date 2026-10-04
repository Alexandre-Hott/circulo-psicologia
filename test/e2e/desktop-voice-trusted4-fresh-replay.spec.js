import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

// Fresh Rust stdout marker only: no CLI A/B text, fabricated transcript,
// clinical repair or historical fallback. Parser/intent proof is the real UI below.
const corpusPath = new URL('../fixtures/native-voice-trusted4-fresh.json', import.meta.url)
const confirmationCorpus = JSON.parse(readFileSync(new URL('../fixtures/native-voice-beam8-rust8-fresh.json', import.meta.url), 'utf8'))
const confirmation = confirmationCorpus.Cases.find(item => item.Index === 7).Transcript
let corpus
test.beforeAll(() => {
  corpus = JSON.parse(readFileSync(corpusPath, 'utf8').replace(/^\uFEFF/, ''))
  expect(corpus.Cases.map(item => item.Index).sort((a, b) => a - b)).toEqual([0, 1, 2, 3])
  expect(confirmation).toBe('Confirmar comando.')
  for (const item of corpus.Cases) {
    expect(typeof item.Transcript).toBe('string')
    expect(item.Transcript.trim().length).toBeGreaterThan(0)
  }
})
const base = 'Base fictícia.'
const assistant = page => page.getByRole('region', { name: 'Comando do Círculo', exact: true })
const preview = page => page.locator('.voice-command-preview')
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
      { id: 'help', title: 'Pede ajuda', description: 'Descrição original help.', version: 1 },
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
      if (command === 'analytics_overview') {
        if (Object.keys(args).sort().join('|') !== 'from|patientId|to'
          || args.from !== '2026-10-01' || args.to !== '2026-10-31' || args.patientId !== null) return fail('Filtro analítico inesperado')
        return { totalCompletedSessions: 0, uniquePatients: 0, dailyCounts: [], monthlyCounts: [], behaviorCounts: [] }
      }
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

async function replayAudio(page, index) {
  const text = index === 'confirmation' ? confirmation : recording(index).Transcript
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


const editor = page => page.getByRole('form', { name: 'Comportamento reutilizável', exact: true })

test('Correção explícita digitada: título bruto muda só após confirmação, sem Save', async ({ page }) => {
  await openApp(page)
  const before = await snapshot(page)
  await replayAudio(page, 0)
  await expect(preview(page)).toBeVisible()
  await expectNoWrites(page, before)
  await replayAudio(page, 'confirmation')
  const title = editor(page).getByLabel('Título descritivo', { exact: true })
  const description = editor(page).getByLabel('Descrição opcional', { exact: true })
  await expect(editor(page)).toHaveAttribute('data-voice-record', 'behavior:new')
  await expect(title).toHaveValue('Espera a vez.')
  await expect(description).toHaveValue('')
  await expectNoWrites(page, before)

  // Explicit user correction is typed, not another native ASR result or corpus repair.
  const input = assistant(page).getByLabel('Seu comando')
  await input.fill('Preencher Título descritivo com Espera a vez')
  await input.press('Control+Enter')
  await page.clock.runFor(32)
  await expect(preview(page)).toBeVisible()
  await expect(preview(page)).toContainText('Título descritivo')
  await expect(title).toHaveValue('Espera a vez.')
  await expect(description).toHaveValue('')
  await expectNoWrites(page, before)
  await input.fill('Confirmar')
  await input.press('Control+Enter')
  await page.clock.runFor(32)
  await expect(preview(page)).toHaveCount(0)
  await expect(editor(page)).toHaveAttribute('data-voice-record', 'behavior:new')
  await expect(title).toHaveValue('Espera a vez')
  await expect(description).toHaveValue('')
  expect(corpus.TitleComparison).toEqual({ Expected: 'Espera a vez', Actual: 'Espera a vez.', StrictMatch: false })
  expect(await page.evaluate(() => window.freshBeamRustNative.captures.map(item => item.transcript))).toEqual([recording(0).Transcript, confirmation])
  await expectNoWrites(page, before)
})

test('RAW Rust4 0: criação preserva título com ponto, sem Save', async ({ page }) => {
  await openApp(page)
  const before = await snapshot(page)
  await replayAudio(page, 0)
  await expect(preview(page)).toBeVisible()
  expect(await realPendingIntent(page)).toEqual({ type: 'behavior.create', draft: { title: 'Espera a vez.', description: '' } })
  await expect(editor(page)).toHaveCount(0)
  await expectNoWrites(page, before)
  await replayAudio(page, 'confirmation')
  await expect(editor(page)).toHaveAttribute('data-voice-record', 'behavior:new')
  await expect(editor(page).getByLabel('Título descritivo', { exact: true })).toHaveValue('Espera a vez.')
  await expect(editor(page).getByLabel('Descrição opcional', { exact: true })).toHaveValue('')
  expect(corpus.TitleComparison).toEqual({ Expected: 'Espera a vez', Actual: 'Espera a vez.', StrictMatch: false })
  await expectNoWrites(page, before)
})

test('RAW Rust4 1: edição abre help versão 1, preserva catálogo concorrente', async ({ page }) => {
  await openApp(page)
  const before = await snapshot(page)
  await replayAudio(page, 1)
  await expect(preview(page)).toBeVisible()
  expect(await realPendingIntent(page)).toEqual({ type: 'behavior.edit.open', target: { behaviorId: 'help' } })
  await expect(editor(page)).toHaveCount(0)
  await expectNoWrites(page, before)
  await replayAudio(page, 'confirmation')
  await expect(editor(page)).toHaveAttribute('data-voice-record', 'behavior:help')
  await expect(editor(page)).toHaveAttribute('data-voice-epoch', '1')
  await expect(editor(page).getByLabel('Título descritivo', { exact: true })).toHaveValue('Pede ajuda')
  await expect(editor(page).getByLabel('Descrição opcional', { exact: true })).toHaveValue('Descrição original help.')
  await expectNoWrites(page, before)
})

test('RAW Rust4 2: análises abre somente após segundo áudio, filtros exatos', async ({ page }) => {
  await openApp(page)
  const before = await snapshot(page)
  await replayAudio(page, 2)
  await expect(preview(page)).toBeVisible()
  expect(await realPendingIntent(page)).toEqual({ type: 'workspace.open', target: { space: 'analytics' } })
  await expect(page.getByRole('region', { name: 'Análises', exact: true })).toHaveCount(0)
  await expectNoWrites(page, before)
  await replayAudio(page, 'confirmation')
  await expect(page.getByRole('region', { name: 'Análises', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Análises', exact: true })).toHaveAttribute('aria-current', 'page')
  // React development lifecycle may repeat read effects; every query must stay exact.
  await expect.poll(() => page.evaluate(() => window.freshBeamRustNative.calls.filter(item => item.command === 'analytics_overview').length)).toBeGreaterThan(0)
  const queries = await page.evaluate(() => window.freshBeamRustNative.calls.filter(item => item.command === 'analytics_overview').map(item => item.args))
  for (const query of queries) expect(query).toEqual({ from: '2026-10-01', to: '2026-10-31', patientId: null })
  await expectNoWrites(page, before)
})

test('RAW Rust4 3: Registrar sessão Home abre apenas formulário rápido', async ({ page }) => {
  await openApp(page)
  const before = await snapshot(page)
  await replayAudio(page, 3)
  await expect(preview(page)).toBeVisible()
  expect((await realPendingIntent(page)).type).toBe('interface.control')
  const appointment = page.getByRole('form', { name: 'Novo compromisso', exact: true })
  await expect(appointment).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Início', exact: true })).toHaveAttribute('aria-current', 'page')
  await expectNoWrites(page, before)
  await replayAudio(page, 'confirmation')
  await expect(appointment).toBeVisible()
  await expect(appointment.getByLabel('Tipo', { exact: true })).toHaveValue('Avulsa')
  await expect(appointment.getByRole('button', { name: 'Criar e iniciar sessão', exact: true })).toBeVisible()
  await expectNoWrites(page, before)
})
