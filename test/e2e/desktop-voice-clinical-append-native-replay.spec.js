import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const corpus = JSON.parse(readFileSync(new URL('../fixtures/native-voice-clinical-append-20261004.json', import.meta.url), 'utf8'))
const base = 'Base fictícia.'
const fields = [
  { key: 'observation', label: 'Observações descritivas' },
  { key: 'procedures', label: 'Procedimentos realizados' },
  { key: 'outcomeDecision', label: 'Resultado e decisão' },
  { key: 'referralClosure', label: 'Encaminhamento ou encerramento (opcional)' },
]
const assistant = page => page.getByRole('region', { name: 'Comando do Círculo' })
const form = page => page.getByRole('form', { name: 'Rascunho de sessão', exact: true })
const snapshot = page => page.evaluate(() => structuredClone(window.nativeAppend.state))

// Real DesktopVault, Sessions, parser and append handler. Native media and IPC
// are simulated; this replay neither runs Rust nor exercises a real microphone.
async function openApp(page) {
  await page.clock.install({ time: new Date('2026-10-04T15:00:00Z') })
  await page.addInitScript(({ base }) => {
    const clone = value => structuredClone(value)
    const patients = [
      { id: 'ana', name: 'Ana Clara', age: 8, revision: 1, preferredModality: 'Presencial', archivedAt: null },
      { id: 'bia', name: 'Bia Fictícia', age: 9, revision: 1, preferredModality: 'Online', archivedAt: null },
    ]
    const drafts = [
      { id: 'synthetic-draft', patientId: 'ana', seriesId: 'synthetic-series', originalDate: '2026-10-04', observation: base, procedures: base, outcomeDecision: base, referralClosure: base, behaviorIds: [], indicators: [] },
      { id: 'synthetic-draft-bia', patientId: 'bia', seriesId: 'synthetic-series-bia', originalDate: '2026-10-04', observation: 'Observação fictícia concorrente.', procedures: 'Procedimentos fictícios concorrentes.', outcomeDecision: 'Resultado fictício concorrente.', referralClosure: 'Encaminhamento fictício concorrente.', behaviorIds: [], indicators: [] },
    ]
    const fixture = window.nativeAppend = { state: { patients, drafts }, calls: [], writes: [], unexpected: [], catalogReady: false, transcript: '', mediaRequests: 0 }
    const reads = new Set()
    const catalog = (command, result) => {
      reads.add(command)
      fixture.catalogReady = ['patient_list', 'behavior_list', 'indicator_catalog'].every(name => reads.has(name))
      return clone(result)
    }

    // Same synthetic PCM helper used by the indicator native value replay.
    // Current capture uses AudioContext, not MediaRecorder; both surfaces are
    // stubbed here and no captured WAV or physical device is used.
    class SyntheticAudioContext {
      constructor() { this.sampleRate = 8_000; this.state = 'running'; this.destination = {} }
      createMediaStreamSource() { return { connect() {}, disconnect() {} } }
      createScriptProcessor() {
        const processor = { onaudioprocess: null, disconnect() {} }
        processor.connect = () => queueMicrotask(() => {
          const emit = () => {
            if (!processor.onaudioprocess) return
            processor.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(4096).fill(0.1) }, outputBuffer: { getChannelData: () => new Float32Array(4096) } })
            if (processor.onaudioprocess) setTimeout(emit, 0)
          }
          emit()
        })
        return processor
      }
      resume() { return Promise.resolve() }
      close() { this.state = 'closed'; return Promise.resolve() }
    }
    class SyntheticMediaRecorder {
      static isTypeSupported() { return true }
      constructor(stream) { this.stream = stream; this.state = 'inactive'; this.mimeType = 'audio/webm'; this.ondataavailable = null; this.onstop = null }
      start() { this.state = 'recording' }
      stop() {
        this.state = 'inactive'
        this.ondataavailable?.({ data: new Blob(['synthetic-media'], { type: this.mimeType }) })
        this.onstop?.()
      }
    }
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: SyntheticAudioContext })
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: SyntheticMediaRecorder })
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
      fixture.mediaRequests++
      return { getTracks: () => [{ stop() {} }] }
    } } })
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      fixture.calls.push(clone({ command, args }))
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { available: false, dirty: false }
      if (command === 'plugin:updater|check') return null
      if (command === 'patient_list') return catalog(command, patients)
      if (command === 'behavior_list' || command === 'indicator_catalog') return catalog(command, [])
      if (command === 'session_draft_list') return clone(drafts.filter(item => item.patientId === args.patientId))
      if (['agenda_occurrences', 'agenda_list_series', 'agenda_history', 'session_timeline', 'session_addendum_list', 'case_context_list'].includes(command)) return []
      if (command === 'voice_transcribe') return fixture.transcript
      fixture.unexpected.push(command)
      if (/(?:create|update|save|start|cancel|finalize|archive|restore)/.test(command)) fixture.writes.push(clone({ command, args }))
      throw new Error(`IPC sem fixture: ${command}`)
    } }
  }, { base })
  await page.goto('/')
  await expect(assistant(page)).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.nativeAppend.catalogReady)).toBe(true)
  await expect(page.locator('.vault-home-preview')).toContainText('Ana Clara')
  await page.clock.runFor(32)
  await command(page, 'Abrir registros de Ana Clara')
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue('ana')
  await command(page, 'Abrir Outros rascunhos do paciente')
  const resume = page.locator('#session-other-drafts button[data-voice-record="draft:synthetic-draft"]')
  await expect(resume).toBeVisible()
  await expect(resume).toBeEnabled()
  await resume.click()
  await expect(form(page)).toHaveAttribute('data-voice-record', 'synthetic-draft')
  await expect(form(page).getByLabel(fields[0].label, { exact: true })).toBeEnabled()
}

async function command(page, text) {
  const input = assistant(page).getByLabel('Seu comando')
  const prepare = assistant(page).getByRole('button', { name: 'Preparar rascunho' })
  await input.fill(text)
  await prepare.click()
  await expect(page.locator('.voice-command-preview')).toBeVisible()
  await input.fill('confirmar')
  await prepare.click()
  await page.clock.runFor(32)
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
}

async function replayAudio(page, index) {
  const recording = corpus.find(item => item.Index === index)
  expect(recording, `Captura nativa Index ${index}`).toBeDefined()
  expect(recording.Transcript).toEqual(expect.any(String))
  // Do not use IntendedCommand or repair the actual header/payload in the test.
  await page.evaluate(text => { window.nativeAppend.transcript = text }, recording.Transcript)
  const listen = assistant(page).getByRole('button', { name: 'Ouvir e transcrever' })
  await listen.click()
  await page.clock.runFor(1000)
  await expect(listen).toBeEnabled()
  await expect(assistant(page).getByLabel('Seu comando')).toHaveValue(recording.Transcript)
}

async function expectValues(page, values) {
  await expect(form(page)).toHaveCount(1)
  await expect(form(page)).toHaveAttribute('data-voice-record', 'synthetic-draft')
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue('ana')
  for (const field of fields) await expect(form(page).getByLabel(field.label, { exact: true })).toHaveValue(values[field.key])
  await expect(page.locator('form[data-voice-record="synthetic-draft-bia"]')).toHaveCount(0)
}

async function expectNoWrites(page, before) {
  expect(await snapshot(page)).toEqual(before)
  expect(await page.evaluate(() => window.nativeAppend.writes)).toEqual([])
  expect(await page.evaluate(() => window.nativeAppend.unexpected)).toEqual([])
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
}

async function expectCaptures(page, count) {
  const captures = await page.evaluate(() => window.nativeAppend.calls.filter(call => call.command === 'voice_transcribe'))
  expect(captures).toHaveLength(count)
  expect(await page.evaluate(() => window.nativeAppend.mediaRequests)).toBe(count)
  for (const { args } of captures) {
    expect(args.sampleRate).toBe(8000)
    expect(args.samples.length).toBeGreaterThan(0)
    expect(args.samples.some(sample => sample !== 0)).toBe(true)
    expect(args.patientNames).toEqual(['Ana Clara', 'Bia Fictícia'])
  }
}

test.beforeEach(async ({ page, baseURL }) => {
  const unexpected = []
  page.on('dialog', async dialog => { unexpected.push(`native dialog: ${dialog.type()}`); await dialog.dismiss() })
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) await route.continue()
    else { unexpected.push(route.request().url()); await route.abort() }
  })
  page.nativeAppendBoundary = unexpected
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.nativeAppend?.unexpected || [])).toEqual([])
  expect(page.nativeAppendBoundary).toEqual([])
})

for (const [index, key, chunk] of [
  [1, 'procedures', 'fez jogo de turnos.'],
  [2, 'outcomeDecision', 'manteve atenção.'],
  [3, 'referralClosure', 'próxima seção semanal.'],
]) {
  test(`REPLAY append ${index}+4: ${key} aplica payload ASR literal somente após confirmar sem salvar`, async ({ page }) => {
    expect(corpus.find(item => item.Index === index).Transcript.endsWith(` com ${chunk}`)).toBe(true)
    await openApp(page)
    const before = await snapshot(page)
    const original = before.drafts.find(item => item.id === 'synthetic-draft')
    await replayAudio(page, index)
    await expect(page.locator('.voice-command-preview')).toContainText('Ana Clara')
    await expect(page.locator('.voice-command-preview')).toContainText(chunk)
    await expectValues(page, original)
    await expect(form(page)).not.toContainText('Alteração de voz ainda não salva')
    await expectNoWrites(page, before)
    await expectCaptures(page, 1)

    await replayAudio(page, 4)
    await expect(page.locator('.voice-command-preview')).toHaveCount(0)
    const expected = { ...original, [key]: `${base} ${chunk}` }
    await expectValues(page, expected)
    await expect(form(page)).toContainText('Alteração de voz ainda não salva')
    await expect(form(page).getByRole('button', { name: 'Salvar rascunho', exact: true })).toBeEnabled()
    await expectNoWrites(page, before)
    await page.clock.runFor(1200)
    await expectValues(page, expected)
    await expectNoWrites(page, before)
    await expectCaptures(page, 2)
    if (index === 3) {
      // Literal ASR payload acceptance does not imply intended-speech semantic
      // fidelity: "seção" must not be silently corrected to "sessão".
      expect(await form(page).getByLabel('Encaminhamento ou encerramento (opcional)', { exact: true }).inputValue()).not.toBe(`${base} próxima sessão semanal.`)
    }
  })
}

test('REPLAY append 0+4: observação sem delimitador com é recusada e confirmar não produz efeito', async ({ page }) => {
  expect(corpus.find(item => item.Index === 0).Transcript).toContain('compidiu ajuda.')
  await openApp(page)
  const before = await snapshot(page)
  const original = before.drafts.find(item => item.id === 'synthetic-draft')
  await replayAudio(page, 0)
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  await expect(page.locator('.voice-command-error')).toBeVisible()
  await expectValues(page, original)
  await expectNoWrites(page, before)
  await expectCaptures(page, 1)
  await replayAudio(page, 4)
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  await expectValues(page, original)
  await expect(form(page)).not.toContainText('Alteração de voz ainda não salva')
  await page.clock.runFor(1200)
  await expectValues(page, original)
  await expectNoWrites(page, before)
  await expectCaptures(page, 2)
})
