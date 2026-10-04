import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const assistant = page => page.getByRole('region', { name: 'Comando do Círculo' })
const draftForm = page => page.getByRole('form', { name: 'Rascunho de sessão', exact: true })
const drawer = page => page.locator('#session-other-drafts')
const snapshot = page => page.evaluate(() => structuredClone(window.draftResume.state))
const writes = page => page.evaluate(() => structuredClone(window.draftResume.writes))
const requestDate = 'Retomar rascunho três de outubro de dois mil e vinte e seis'
const mutationCommands = ['session_draft_start', 'session_draft_save', 'session_draft_cancel', 'session_finalize']

// Full DesktopVault shell, real Sessions and gateway. IPC fixtures are cloned,
// every unknown IPC fails, and native audio hardware is simulated.
async function openApp(page, { duplicate = false } = {}) {
  await page.clock.install({ time: new Date('2026-10-04T15:00:00Z') })
  await page.addInitScript(({ duplicate }) => {
    const clone = value => structuredClone(value)
    const patients = [{ id: 'ana', name: 'Ana Clara', age: 8, revision: 1, preferredModality: 'Presencial', archivedAt: null }]
    const drafts = [
      { id: 'd1', patientId: 'ana', seriesId: 'series-d1', originalDate: '2026-10-03', observation: 'Observação fictícia do rascunho d1 de três de outubro.', procedures: 'Procedimentos fictícios de d1.', outcomeDecision: 'Resultado fictício de d1.', referralClosure: 'Encaminhamento fictício de d1.', behaviorIds: [], indicators: [] },
      { id: 'd2', patientId: 'ana', seriesId: 'series-d2', originalDate: duplicate ? '2026-10-03' : '2026-10-04', observation: 'Observação fictícia do rascunho d2.', procedures: 'Procedimentos fictícios de d2.', outcomeDecision: 'Resultado fictício de d2.', referralClosure: 'Encaminhamento fictício de d2.', behaviorIds: [], indicators: [] },
    ]
    const fixture = window.draftResume = {
      state: { patients, drafts, series: [], occurrences: [], history: [], sessions: [], addenda: [], contexts: [] },
      calls: [], writes: [], unexpected: [], catalogReady: false, transcript: '',
    }
    const catalogReads = new Set()
    const catalog = (command, value) => {
      catalogReads.add(command)
      fixture.catalogReady = ['patient_list', 'behavior_list', 'indicator_catalog'].every(name => catalogReads.has(name))
      return clone(value)
    }
    // Exact helper from the previous full-shell specs and the old voice
    // interface spec. Native fixture transcripts are replayed through fake
    // media/IPC; this neither executes Rust nor exercises a real microphone.
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
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: SyntheticAudioContext })
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } })
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      fixture.calls.push(clone({ command, args }))
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { available: false, dirty: false }
      if (command === 'plugin:updater|check') return null
      if (command === 'patient_list') return catalog(command, patients)
      if (command === 'behavior_list' || command === 'indicator_catalog') return catalog(command, [])
      if (command === 'agenda_list_series') return clone(fixture.state.series)
      if (command === 'agenda_occurrences') return clone(fixture.state.occurrences)
      if (command === 'agenda_history') return clone(fixture.state.history)
      if (command === 'session_draft_list') return clone(drafts.filter(item => item.patientId === args.patientId))
      if (command === 'session_timeline') return clone(fixture.state.sessions)
      if (command === 'session_addendum_list') return clone(fixture.state.addenda)
      if (command === 'case_context_list') return clone(fixture.state.contexts)
      if (command === 'voice_transcribe') return fixture.transcript
      fixture.unexpected.push(command)
      if (/(?:create|update|save|start|cancel|finalize|archive|restore)/.test(command)) fixture.writes.push(clone({ command, args }))
      throw new Error(`IPC sem fixture: ${command}`)
    } }
  }, { duplicate })
  await page.goto('/')
  await expect(assistant(page)).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.draftResume.catalogReady)).toBe(true)
  await expect(page.locator('.vault-home-preview')).toContainText('Ana Clara')
  await page.clock.runFor(32)
  await command(page, 'Abrir registros de Ana Clara')
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue('ana')
  // Waiting for rendered draft controls also waits for patient-specific IPC
  // and Sessions' loadedPatientId, rather than racing the records bootstrap.
  await command(page, 'Abrir Outros rascunhos do paciente')
  await expect(drawer(page)).toHaveAttribute('open', '')
  await expect(drawer(page).getByRole('button', { name: /^Retomar rascunho / })).toHaveCount(2)
  await expect(drawer(page).locator('button[data-voice-record="draft:d1"]')).toBeVisible()
  await expect(drawer(page).locator('button[data-voice-record="draft:d2"]')).toBeVisible()
  await expect(draftForm(page)).toHaveCount(0)
}

async function propose(page, text) {
  await assistant(page).getByLabel('Seu comando').fill(text)
  await assistant(page).getByRole('button', { name: 'Preparar rascunho' }).click()
}

async function confirmProposal(page) {
  await propose(page, 'confirmar')
  await page.clock.runFor(32)
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
}

async function command(page, text) {
  const before = await writes(page)
  await propose(page, text)
  await expect(page.locator('.voice-command-preview')).toBeVisible()
  expect(await writes(page)).toEqual(before)
  await confirmProposal(page)
  expect(await writes(page)).toEqual(before)
}

async function expectNoPersistence(page, before) {
  expect(await snapshot(page)).toEqual(before)
  expect(await writes(page)).toEqual([])
  expect(await page.evaluate(() => window.draftResume.unexpected)).toEqual([])
  expect(await page.evaluate(names => window.draftResume.calls.filter(call => names.includes(call.command)), mutationCommands)).toEqual([])
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
}

async function expectActiveDraft(page, before, id) {
  const expected = before.drafts.find(item => item.id === id)
  expect(expected).toBeDefined()
  const form = draftForm(page)
  await expect(form).toBeVisible()
  await expect(form).toHaveAttribute('data-voice-record', id)
  await expect(form.getByRole('heading')).toHaveText(`Rascunho da ocorrência ${expected.originalDate}`)
  await expect(form.getByLabel('Observações descritivas', { exact: true })).toHaveValue(expected.observation)
  await expect(form.getByLabel('Procedimentos realizados', { exact: true })).toHaveValue(expected.procedures)
  await expect(form.getByLabel('Resultado e decisão', { exact: true })).toHaveValue(expected.outcomeDecision)
  await expect(form.getByLabel('Encaminhamento ou encerramento (opcional)', { exact: true })).toHaveValue(expected.referralClosure)
  await expectNoPersistence(page, before)
}

async function expectCleanAfterAutosaveWindow(page, before, id) {
  // A clean load must remain read-only after the 600ms autosave deadline.
  await page.clock.runFor(1200)
  await expectActiveDraft(page, before, id)
}

async function replayAudio(page, corpus, index) {
  const recording = corpus.find(item => item.Index === index)
  expect(recording, `Captura nativa Index ${index}`).toBeDefined()
  expect(recording.Transcript).toEqual(expect.any(String))
  await page.evaluate(text => { window.draftResume.transcript = text }, recording.Transcript)
  const listen = assistant(page).getByRole('button', { name: 'Ouvir e transcrever' })
  await listen.click()
  await page.clock.runFor(1000)
  await expect(listen).toBeEnabled()
}

test.beforeEach(async ({ page, baseURL }) => {
  const unexpected = []
  page.on('dialog', async dialog => { unexpected.push(`native dialog: ${dialog.type()}`); await dialog.dismiss() })
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) await route.continue()
    else { unexpected.push(route.request().url()); await route.abort() }
  })
  page.draftResumeBoundary = unexpected
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.draftResume?.unexpected || [])).toEqual([])
  expect(page.draftResumeBoundary).toEqual([])
})

test('shell: data falada prepara sem trocar d2 ativo; confirmar retoma d1 de 3/10 com conteúdo preservado e sem autosave', async ({ page }) => {
  await openApp(page)
  const before = await snapshot(page)
  await command(page, 'Clicar em Retomar rascunho 2026-10-04')
  await expectActiveDraft(page, before, 'd2')
  // Selecting a draft remounts Sessions. Open the new drawer after its load.
  await command(page, 'Abrir Outros rascunhos do paciente')
  const resumeD1 = drawer(page).locator('button[data-voice-record="draft:d1"]')
  await expect(resumeD1).toBeVisible()
  await expect(resumeD1).toContainText('Retomar rascunho 2026-10-03')
  await propose(page, requestDate)
  await expect(page.locator('.voice-command-preview')).toContainText('2026-10-03')
  await expectActiveDraft(page, before, 'd2')
  await confirmProposal(page)
  await expectActiveDraft(page, before, 'd1')
  await expectCleanAfterAutosaveWindow(page, before, 'd1')
})

test('shell: dois rascunhos em 3/10 recusam data ambígua; opção dois retoma somente o ID d2 do controle existente', async ({ page }) => {
  await openApp(page, { duplicate: true })
  const before = await snapshot(page)
  await expect(drawer(page).getByRole('button', { name: 'Retomar rascunho 2026-10-03 · opção 2', exact: true })).toBeVisible()
  await propose(page, requestDate)
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  await expect(page.locator('.voice-command-error')).toContainText(/mais de um|mais de uma|ambígu/i)
  await expect(draftForm(page)).toHaveCount(0)
  await expectNoPersistence(page, before)
  await propose(page, `${requestDate} opção dois`)
  await expect(page.locator('.voice-command-preview')).toContainText('2026-10-03')
  await expect(page.locator('.voice-command-preview')).toContainText(/opção 2/i)
  await expect(draftForm(page)).toHaveCount(0)
  await expectNoPersistence(page, before)
  await confirmProposal(page)
  await expectActiveDraft(page, before, 'd2')
  await expectCleanAfterAutosaveWindow(page, before, 'd2')
})

test('REPLAY nativo: prefixo corrompido 0 e data corrompida 1 são recusados; áudio 2 não seleciona nem grava', async ({ page }) => {
  // Replay the actual failed ASR captures unchanged. Successful native
  // transcription is not evidence of a valid resume command or date.
  const corpus = JSON.parse(readFileSync(new URL('../fixtures/native-voice-draft-resume-20261004.json', import.meta.url), 'utf8'))
  await openApp(page, { duplicate: true })
  const before = await snapshot(page)
  // A genuine option 2 is visible, so refusing Index 1 must not accidentally
  // depend on its absence. The corrupted year must never become 2026-10-03.
  await expect(drawer(page).getByRole('button', { name: 'Retomar rascunho 2026-10-03 · opção 2', exact: true })).toBeVisible()
  for (const index of [0, 1]) {
    await test.step(`captura ${index} recusada e captura 2 sem seleção`, async () => {
      await replayAudio(page, corpus, index)
      await expect(assistant(page).getByLabel('Seu comando')).toHaveValue(corpus.find(item => item.Index === index).Transcript)
      await expect(page.locator('.voice-command-preview')).toHaveCount(0)
      await expect(page.locator('.voice-command-error')).toBeVisible()
      await expect(draftForm(page)).toHaveCount(0)
      await expectNoPersistence(page, before)
      expect(await page.evaluate(() => window.draftResume.calls.filter(call => call.command === 'voice_transcribe').length)).toBe(index * 2 + 1)
      await replayAudio(page, corpus, 2)
      await expect(page.locator('.voice-command-preview')).toHaveCount(0)
      await expect(draftForm(page)).toHaveCount(0)
      await expectNoPersistence(page, before)
      await page.clock.runFor(1200)
      await expect(draftForm(page)).toHaveCount(0)
      await expectNoPersistence(page, before)
      expect(await page.evaluate(() => window.draftResume.calls.filter(call => call.command === 'voice_transcribe').length)).toBe((index + 1) * 2)
    })
  }
  const captures = await page.evaluate(() => window.draftResume.calls.filter(call => call.command === 'voice_transcribe'))
  expect(captures).toHaveLength(4)
  for (const { args } of captures) {
    expect(args.sampleRate).toBe(8000)
    expect(args.samples.length).toBeGreaterThan(0)
    expect(args.samples.some(sample => sample !== 0)).toBe(true)
    expect(args.patientNames).toContain('Ana Clara')
  }
})

test('REPLAY nativo opções: 0+2 retoma d1 e 1+2 troca para d2 exato sem data, writes ou autosave', async ({ page }) => {
  // Read Sagan's actual fixture at execution time. Do not reconstruct speech
  // or repair recognized dates; option-only commands go to the real gateway.
  const corpus = JSON.parse(readFileSync(new URL('../fixtures/native-voice-draft-choice-20261004.json', import.meta.url), 'utf8'))
  await openApp(page)
  const before = await snapshot(page)
  for (const [index, id] of [[0, 'd1'], [1, 'd2']]) {
    await test.step(`captura ${index} e confirmação 2 retomam somente ${id}`, async () => {
      if (index === 1) {
        // A clean selection remounts Sessions: reopen its loaded drawer before
        // asking for the other numbered option.
        await command(page, 'Abrir Outros rascunhos do paciente')
      }
      const first = drawer(page).locator('button[data-voice-record="draft:d1"]')
      const second = drawer(page).locator('button[data-voice-record="draft:d2"]')
      await expect(first).toBeVisible()
      await expect(first).toBeEnabled()
      await expect(first).toContainText(/opção 1/i)
      await expect(first).toHaveAttribute('data-voice-resume-option', '1')
      await expect(second).toBeVisible()
      await expect(second).toBeEnabled()
      await expect(second).toContainText(/opção 2/i)
      await expect(second).toHaveAttribute('data-voice-resume-option', '2')

      await replayAudio(page, corpus, index)
      await expect(assistant(page).getByLabel('Seu comando')).toHaveValue(corpus.find(item => item.Index === index).Transcript)
      await expect(page.locator('.voice-command-preview')).toContainText(`opção ${index + 1}`)
      if (index === 0) {
        await expect(draftForm(page)).toHaveCount(0)
        await expectNoPersistence(page, before)
      } else {
        await expectActiveDraft(page, before, 'd1')
      }
      expect(await page.evaluate(() => window.draftResume.calls.filter(call => call.command === 'voice_transcribe').length)).toBe(index * 2 + 1)

      await replayAudio(page, corpus, 2)
      await expect(page.locator('.voice-command-preview')).toHaveCount(0)
      await expectActiveDraft(page, before, id)
      await expectCleanAfterAutosaveWindow(page, before, id)
      expect(await page.evaluate(() => window.draftResume.calls.filter(call => call.command === 'voice_transcribe').length)).toBe((index + 1) * 2)
    })
  }
  const captures = await page.evaluate(() => window.draftResume.calls.filter(call => call.command === 'voice_transcribe'))
  expect(captures).toHaveLength(4)
  for (const { args } of captures) {
    expect(args.sampleRate).toBe(8000)
    expect(args.samples.length).toBeGreaterThan(0)
    expect(args.samples.some(sample => sample !== 0)).toBe(true)
    expect(args.patientNames).toContain('Ana Clara')
  }
})
