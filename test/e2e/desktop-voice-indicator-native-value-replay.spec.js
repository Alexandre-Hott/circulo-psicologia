import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const corpus = JSON.parse(readFileSync(new URL('../fixtures/native-voice-indicator-value-20261004.json', import.meta.url), 'utf8'))
const labels = ['Ainda não observado', 'Com muito apoio', 'Com algum apoio', 'Com autonomia']
const literalNote = 'Nota fictícia literal: "com apoio", seção e regulação; manter acentos e pontuação.'
const assistant = page => page.getByRole('region', { name: 'Comando do Círculo' })
const draftForm = page => page.getByRole('form', { name: 'Rascunho de sessão', exact: true })
const snapshot = page => page.evaluate(() => structuredClone(window.indicatorReplay.state))

// Real DesktopVault shell, Sessions and command router. Native media and IPC
// are explicitly simulated: replay does not run Rust or use a real microphone.
async function openApp(page) {
  await page.clock.install({ time: new Date('2026-10-04T15:00:00Z') })
  await page.addInitScript(({ labels, literalNote }) => {
    const clone = value => structuredClone(value)
    const patients = [
      { id: 'ana', name: 'Ana Clara', age: 8, revision: 1, preferredModality: 'Presencial', archivedAt: null },
      { id: 'bia', name: 'Bia Fictícia', age: 9, revision: 1, preferredModality: 'Online', archivedAt: null },
    ]
    const indicators = [{ id: 'indicator-regulation', name: 'Regulação emocional', definition: 'Uso de recursos para lidar com emoções intensas.', version: 1, labels }]
    const drafts = [
      { id: 'synthetic-draft', patientId: 'ana', seriesId: 'synthetic-series', originalDate: '2026-10-04', observation: 'Observação fictícia preservada.', procedures: 'Procedimentos fictícios preservados.', outcomeDecision: 'Resultado fictício preservado.', referralClosure: 'Encaminhamento fictício preservado.', behaviorIds: [], indicators: [{ id: 'indicator-regulation', value: 1, note: literalNote }] },
      { id: 'synthetic-draft-bia', patientId: 'bia', seriesId: 'synthetic-series-bia', originalDate: '2026-10-04', observation: 'Observação fictícia concorrente de Bia.', procedures: 'Procedimentos fictícios de Bia.', outcomeDecision: 'Resultado fictício de Bia.', referralClosure: 'Encaminhamento fictício de Bia.', behaviorIds: [], indicators: [{ id: 'indicator-regulation', value: 0, note: 'Nota fictícia concorrente de Bia: não alterar.' }] },
    ]
    const fixture = window.indicatorReplay = {
      state: { patients, indicators, drafts }, calls: [], writes: [], unexpected: [], catalogReady: false, transcript: '',
      mediaRequests: 0, trackStops: 0, contextCloses: 0, sourceDisconnects: 0, processorDisconnects: 0, captureRefs: [],
    }
    const catalogReads = new Set()
    const catalog = (command, result) => {
      catalogReads.add(command)
      fixture.catalogReady = ['patient_list', 'behavior_list', 'indicator_catalog'].every(name => catalogReads.has(name))
      return clone(result)
    }
    // Simulated short speech then >1100ms trailing silence, with clock progress.
    // Continuous speech would hit the 12-second cap and require manual review.
    // Actual fixture transcripts still come through the mocked transcribe IPC;
    // this is not a real media/Rust/ASR run or a bypass of cutoff handling.
    class SyntheticAudioContext {
      constructor() { this.sampleRate = 8_000; this.state = 'running'; this.destination = {} }
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
      fixture.calls.push(clone({ command, args }))
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { available: false, dirty: false }
      if (command === 'plugin:updater|check') return null
      if (command === 'patient_list') return catalog(command, patients)
      if (command === 'behavior_list') return catalog(command, [])
      if (command === 'indicator_catalog') return catalog(command, indicators)
      if (command === 'agenda_occurrences' || command === 'agenda_list_series' || command === 'agenda_history') return []
      if (command === 'session_draft_list') return clone(drafts.filter(item => item.patientId === args.patientId))
      if (command === 'session_timeline' || command === 'session_addendum_list' || command === 'case_context_list') return []
      if (command === 'voice_transcribe') { fixture.captureRefs.push(args); return fixture.transcript }
      fixture.unexpected.push(command)
      if (/(?:create|update|save|start|cancel|finalize|archive|restore)/.test(command)) fixture.writes.push(clone({ command, args }))
      throw new Error(`IPC sem fixture: ${command}`)
    } }
  }, { labels, literalNote })
  await page.goto('/')
  await expect(assistant(page)).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.indicatorReplay.catalogReady)).toBe(true)
  await expect(page.locator('.vault-home-preview')).toContainText('Ana Clara')
  await page.clock.runFor(32)
  await command(page, 'Abrir registros de Ana Clara')
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue('ana')
  await command(page, 'Abrir Outros rascunhos do paciente')
  const resume = page.locator('#session-other-drafts button[data-voice-record="draft:synthetic-draft"]')
  await expect(resume).toBeVisible()
  await expect(resume).toBeEnabled()
  await resume.click()
  await expect(draftForm(page)).toHaveAttribute('data-voice-record', 'synthetic-draft')
  await expect(draftForm(page).locator('#indicator-indicator-regulation')).toBeEnabled()
  await expect(draftForm(page).locator('#indicator-indicator-regulation')).toHaveValue('1')
  await expect(draftForm(page).locator('#indicator-note-indicator-regulation')).toHaveValue(literalNote)
}

async function command(page, text) {
  await assistant(page).getByLabel('Seu comando').fill(text)
  await assistant(page).getByRole('button', { name: 'Preparar rascunho' }).click()
  await expect(page.locator('.voice-command-preview')).toBeVisible()
  await assistant(page).getByLabel('Seu comando').fill('confirmar')
  await assistant(page).getByRole('button', { name: 'Preparar rascunho' }).click()
  await page.clock.runFor(32)
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
}

async function replayAudio(page, index) {
  const recording = corpus.find(item => item.Index === index)
  expect(recording, `Captura nativa Index ${index}`).toBeDefined()
  expect(recording.Transcript).toEqual(expect.any(String))
  await page.evaluate(text => { window.indicatorReplay.transcript = text }, recording.Transcript)
  const listen = assistant(page).getByRole('button', { name: 'Ouvir e transcrever' })
  await listen.click()
  await page.clock.runFor(1600)
  await expect(listen).toBeEnabled()
  await expect(assistant(page).getByLabel('Seu comando')).toHaveValue(recording.Transcript)
  await expect(assistant(page).getByText(/A captura atingiu .*segundos e pode estar incompleta/u)).toHaveCount(0)
  const captures = await page.evaluate(() => window.indicatorReplay.calls.filter(call => call.command === 'voice_transcribe'))
  expect(await page.evaluate(() => {
    const fixture = window.indicatorReplay
    return [fixture.mediaRequests, fixture.trackStops, fixture.contextCloses, fixture.sourceDisconnects, fixture.processorDisconnects]
  })).toEqual(Array(5).fill(captures.length))
  expect(await page.evaluate(() => window.indicatorReplay.captureRefs.every(args => args.samples.every(sample => sample === 0) && args.patientNames.every(name => name === '')))).toBe(true)
  for (const { args } of captures) expect(args.samples.length / args.sampleRate).toBeLessThan(12)
}

async function expectPreserved(page, before) {
  const current = await snapshot(page)
  expect(current).toEqual(before)
  // Both patients and drafts coexist in the native boundary; the competing
  // record must remain intact rather than relying on a single-record fixture.
  expect(current.drafts.find(item => item.id === 'synthetic-draft-bia')).toEqual(before.drafts.find(item => item.id === 'synthetic-draft-bia'))
  expect(await page.evaluate(() => window.indicatorReplay.writes)).toEqual([])
  expect(await page.evaluate(() => window.indicatorReplay.unexpected)).toEqual([])
  const patientControl = page.getByLabel('Paciente para evolução e sessões')
  await expect(patientControl).toHaveValue('ana')
  await expect(patientControl.locator('option[value="ana"]')).toHaveText('Ana Clara')
  await expect(patientControl.locator('option[value="bia"]')).toHaveText('Bia Fictícia')
  const form = draftForm(page)
  await expect(form).toHaveCount(1)
  await expect(form).toHaveAttribute('data-voice-record', 'synthetic-draft')
  await expect(page.locator('form[data-voice-record="synthetic-draft-bia"]')).toHaveCount(0)
  await expect(page.locator('#session-other-drafts button[data-voice-record="draft:synthetic-draft-bia"]')).toHaveCount(0)
  await expect(form.locator('#indicator-indicator-regulation')).toHaveCount(1)
  await expect(form.locator('#indicator-note-indicator-regulation')).toHaveValue(literalNote)
  const target = before.drafts.find(item => item.id === 'synthetic-draft' && item.patientId === 'ana')
  for (const [label, field] of [['Observações descritivas', 'observation'], ['Procedimentos realizados', 'procedures'], ['Resultado e decisão', 'outcomeDecision'], ['Encaminhamento ou encerramento (opcional)', 'referralClosure']]) {
    await expect(form.getByLabel(label, { exact: true })).toHaveValue(target[field])
  }
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
}

test.beforeEach(async ({ page, baseURL }) => {
  const unexpected = []
  page.on('dialog', async dialog => { unexpected.push(`native dialog: ${dialog.type()}`); await dialog.dismiss() })
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) await route.continue()
    else { unexpected.push(route.request().url()); await route.abort() }
  })
  page.indicatorReplayBoundary = unexpected
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.indicatorReplay?.unexpected || [])).toEqual([])
  expect(page.indicatorReplayBoundary).toEqual([])
})

for (const [index, value] of [[0, 2], [1, 3]]) {
  test(`REPLAY nativo indicador ${index}+2: ${labels[value]} aplica valor ${value} somente após áudio de confirmação e preserva nota literal`, async ({ page }) => {
    await openApp(page)
    const before = await snapshot(page)
    expect(before.patients.map(item => item.id)).toEqual(['ana', 'bia'])
    expect(before.drafts).toHaveLength(2)
    expect(before.drafts.find(item => item.id === 'synthetic-draft')).toMatchObject({ id: 'synthetic-draft', patientId: 'ana', indicators: [{ id: 'indicator-regulation', value: 1, note: literalNote }] })
    expect(before.drafts.find(item => item.id === 'synthetic-draft-bia')).toMatchObject({ patientId: 'bia', indicators: [{ id: 'indicator-regulation', value: 0, note: 'Nota fictícia concorrente de Bia: não alterar.' }] })
    const scale = draftForm(page).locator('#indicator-indicator-regulation')
    await expect(scale).toHaveAccessibleName('Regulação emocional · v1')
    await expect(scale.locator('option')).toHaveText(['Sem registro', ...labels])
    expect(await scale.locator('option').evaluateAll(options => options.map(option => option.value))).toEqual(['', '0', '1', '2', '3'])
    await expectPreserved(page, before)

    await replayAudio(page, index)
    await expect(page.locator('.voice-command-preview')).toContainText('Ana Clara')
    await expect(page.locator('.voice-command-preview')).toContainText('Regulação emocional')
    await expect(page.locator('.voice-command-preview')).toContainText(labels[value])
    await expect(scale).toHaveValue('1')
    await expectPreserved(page, before)
    expect(await page.evaluate(() => window.indicatorReplay.calls.filter(call => call.command === 'voice_transcribe').length)).toBe(1)

    await replayAudio(page, 2)
    await expect(page.locator('.voice-command-preview')).toHaveCount(0)
    await expect(scale).toHaveValue(String(value))
    expect(await scale.locator('option:checked').textContent()).toBe(labels[value])
    await expectPreserved(page, before)
    await expect(draftForm(page)).toContainText('Alteração de voz ainda não salva')
    // Voice confirmation updates the local draft only; it must not autosave.
    await page.clock.runFor(1200)
    await expect(scale).toHaveValue(String(value))
    await expectPreserved(page, before)
    const captures = await page.evaluate(() => window.indicatorReplay.calls.filter(call => call.command === 'voice_transcribe'))
    expect(captures).toHaveLength(2)
    for (const { args } of captures) {
      expect(args.sampleRate).toBe(8000)
      expect(args.samples.length).toBeGreaterThan(0)
      expect(args.samples.length / args.sampleRate).toBeLessThan(12)
      expect(args.samples.some(sample => sample !== 0)).toBe(true)
      expect(args.patientNames).toEqual(['Ana Clara', 'Bia Fictícia'])
    }
  })
}
