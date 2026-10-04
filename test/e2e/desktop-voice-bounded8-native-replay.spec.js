import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const corpus = JSON.parse(readFileSync(new URL('../fixtures/native-voice-bounded8-20261004.json', import.meta.url), 'utf8'))
const base = 'Base fictícia.'
const fields = [
  ['observation', 'Observações descritivas'], ['procedures', 'Procedimentos realizados'],
  ['outcomeDecision', 'Resultado e decisão'], ['referralClosure', 'Encaminhamento ou encerramento (opcional)'],
]
const assistant = page => page.getByRole('region', { name: 'Comando do Círculo', exact: true })
const preview = page => page.locator('.voice-command-preview')
const form = page => page.getByRole('form', { name: 'Rascunho de sessão', exact: true })
const snapshot = page => page.evaluate(() => structuredClone(window.boundedNative.state))
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
    const fixture = window.boundedNative = {
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
      if (['agenda_occurrences', 'session_timeline', 'session_addendum_list', 'case_context_list'].includes(command)) return []
      // Any persistence, creation, finalization, export or native chooser is forbidden.
      fixture.writes.push(clone({ command, args }))
      return fail(`IPC fora do contrato estrito: ${command}`)
    } }
  }, { base })
  await page.goto('/')
  await expect(assistant(page)).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.boundedNative.catalogReady)).toBe(true)
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
  await page.evaluate(transcript => window.boundedNative.transcripts.push(transcript), text)
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
  expect(await page.evaluate(() => window.boundedNative.writes)).toEqual([])
  expect(await page.evaluate(() => window.boundedNative.unexpected)).toEqual([])
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
  page.boundedNativeBoundary = boundary
})

test.afterEach(async ({ page }) => {
  expect(page.boundedNativeBoundary).toEqual([])
  const status = await page.evaluate(() => {
    const f = window.boundedNative
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

test('REPLAY nativo 0: recorrência mal reconhecida é recusada; confirmar não cria compromisso', async ({ page }) => {
  expect(recording(0).Transcript).not.toBe(recording(0).ExpectedSpoken)
  await openApp(page)
  const before = await snapshot(page)
  await replayAudio(page, 0)
  await expect(preview(page)).toHaveCount(0)
  await expect(page.locator('.voice-command-error')).toBeVisible()
  await expect(page.getByRole('form', { name: 'Novo compromisso', exact: true })).toHaveCount(0)
  await expectNoWrites(page, before)
  await replayAudio(page, 7)
  await expect(preview(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Início', exact: true })).toHaveAttribute('aria-current', 'page')
  await expectNoWrites(page, before)
})

test('REPLAY nativo 1: nome divergente aparece no preview/formulário sem autocorreção nem cadastro implícito', async ({ page }) => {
  expect(recording(1).ExpectedSpoken).toContain('Bia Fictícia')
  expect(recording(1).Transcript).toContain('bia fictânsia')
  await openApp(page)
  const before = await snapshot(page)
  await replayAudio(page, 1)
  await expect(preview(page)).toContainText('bia fictânsia')
  await expect(preview(page)).not.toContainText('Bia Fictícia')
  await expect(page.getByRole('form', { name: 'Novo cadastro', exact: true })).toHaveCount(0)
  await expectNoWrites(page, before)
  await replayAudio(page, 7)
  const patientForm = page.getByRole('form', { name: 'Novo cadastro', exact: true })
  await expect(patientForm).toBeVisible()
  await expect(patientForm.getByLabel('Nome', { exact: true })).toHaveValue('bia fictânsia')
  await expect(patientForm.getByLabel('Idade em anos (opcional)', { exact: true })).toHaveValue('9')
  await expectNoWrites(page, before)
})

test('REPLAY nativo 2: comportamento aplica só ao rascunho Ana após confirmar; não salva nem duplica', async ({ page }) => {
  await openDraft(page)
  const before = await snapshot(page)
  const original = before.drafts.find(item => item.patientId === 'ana')
  await replayAudio(page, 2)
  await expect(preview(page)).toContainText('Ana Clara')
  await expect(preview(page)).toContainText('Pede ajuda')
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

test('REPLAY nativo 3: observação sem delimitador é recusada sem inferir corpo pretendido', async ({ page }) => {
  expect(recording(3).ExpectedSpoken).toContain('com pediu ajuda.')
  expect(recording(3).Transcript).toContain('compidiu ajuda.')
  await openDraft(page)
  const before = await snapshot(page)
  const original = before.drafts.find(item => item.patientId === 'ana')
  await replayAudio(page, 3)
  await expect(preview(page)).toHaveCount(0)
  await expect(page.locator('.voice-command-error')).toBeVisible()
  await replayAudio(page, 7)
  await page.clock.runFor(1200)
  await expectValues(page, original)
  await expect(form(page)).not.toContainText('Alteração de voz ainda não salva')
  await expectNoWrites(page, before)
})

for (const [index, key, chunk] of [
  [4, 'procedures', 'fez jogo de turnos.'], [5, 'outcomeDecision', 'manteve atenção.'],
  [6, 'referralClosure', 'próxima seção semanal.'],
]) test(`REPLAY nativo ${index}: ${key} preserva corpo ASR no preview e destino após confirmar sem Save`, async ({ page }) => {
  expect(recording(index).Transcript.endsWith(` com ${chunk}`)).toBe(true)
  await openDraft(page)
  const before = await snapshot(page)
  const original = before.drafts.find(item => item.patientId === 'ana')
  await replayAudio(page, index)
  await expect(preview(page)).toContainText('Ana Clara')
  await expect(preview(page)).toContainText(chunk)
  if (index === 6) {
    expect(recording(index).ExpectedSpoken).toContain('próxima sessão semanal.')
    await expect(preview(page)).not.toContainText('próxima sessão semanal.')
  }
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

test('REPLAY nativo 7: confirmar isolado ou após trocar Ana por Bia não aplica proposta a outro destino', async ({ page }) => {
  await openDraft(page)
  const before = await snapshot(page)
  const original = before.drafts.find(item => item.patientId === 'ana')
  await replayAudio(page, 7)
  await expect(preview(page)).toHaveCount(0)
  await expectValues(page, original)
  await expectNoWrites(page, before)
  await replayAudio(page, 4)
  await expect(preview(page)).toContainText('Ana Clara')
  await expectValues(page, original)
  // Genuine UI context change, without replacing the proposal through another
  // typed command, injecting an intent, or mutating the fixture's draft state.
  await page.getByLabel('Paciente para evolução e sessões').selectOption('bia')
  await resumeDraft(page, 'bia')
  const other = before.drafts.find(item => item.patientId === 'bia')
  await expectValues(page, other)
  await replayAudio(page, 7)
  await page.clock.runFor(1200)
  await expectValues(page, other)
  await expect(form(page)).not.toContainText('Alteração de voz ainda não salva')
  await expectNoWrites(page, before)
})
