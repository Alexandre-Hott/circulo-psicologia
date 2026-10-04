import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const assistant = page => page.getByRole('region', { name: 'Comando do Círculo' })
const panel = page => page.locator('#agenda-details-panel')
const snapshot = page => page.evaluate(() => structuredClone(window.appointmentDetails.state))
const writes = page => page.evaluate(() => structuredClone(window.appointmentDetails.writes))
const fullSpokenRequest = 'Abrir detalhes de Ana Clara em quatro de outubro de dois mil e vinte e seis às quinze horas'

// Same full DesktopVault shell boundary as voice-series-ending-assistant.spec.js:
// real components and voice gateway; cloned synthetic IPC, unknown IPC fails.
async function openApp(page, { week = false } = {}) {
  await page.clock.install({ time: new Date('2026-10-04T15:00:00Z') })
  await page.addInitScript(({ week }) => {
    const clone = value => structuredClone(value)
    const patients = [{ id: 'ana', name: 'Ana Clara', age: 8, revision: 1, preferredModality: 'Presencial', archivedAt: null }]
    const series = [{ id: 'series-ana-15', patientId: 'ana', weekday: 1, start: '15:00', end: '15:50', frequency: 'Semanal', startDate: '2026-09-28', endDate: null, modality: 'Presencial', meetingLink: null, timeZone: 'America/Sao_Paulo', revision: 1 }]
    const target = {
      id: 'series-ana-15:2026-09-28', seriesId: 'series-ana-15', patientId: 'ana',
      originalDate: '2026-09-28', date: '2026-10-04', start: '15:00', end: '15:50',
      status: week ? 'completed' : 'scheduled', frequency: 'Semanal', modality: 'Presencial', meetingLink: null, wasRescheduled: true,
    }
    const occurrences = [target]
    if (week) {
      series.push({ ...series[0], id: 'series-ana-16', weekday: 2, start: '16:00', end: '16:50', startDate: '2026-10-06' })
      occurrences.push({ ...target, id: 'series-ana-16:2026-10-06', seriesId: 'series-ana-16', originalDate: '2026-10-06', date: '2026-10-06', start: '16:00', end: '16:50', status: 'scheduled', wasRescheduled: false })
    }
    const history = [{ id: 'move-prior', seriesId: target.seriesId, action: 'reschedule', originalDate: target.originalDate, effectiveDate: target.date, start: target.start, end: target.end, reason: 'Remarcação administrativa sintética' }]
    const drafts = [{ id: 'draft-prior', patientId: 'ana', seriesId: 'series-ana-15', originalDate: '2026-09-21', observation: 'Rascunho sintético preservado', procedures: '', outcomeDecision: '', referralClosure: '', behaviorIds: [], indicators: [] }]
    const sessions = [{ id: 'session-prior', patientId: 'ana', seriesId: 'series-ana-15', originalDate: '2026-09-14', observation: 'Registro sintético preservado' }]
    if (week) sessions.push({ id: 'session-target', patientId: 'ana', seriesId: target.seriesId, originalDate: target.originalDate, date: target.date, observation: 'Sessão concluída sintética preservada' })
    const fixture = window.appointmentDetails = {
      state: { patients, series, occurrences, history, drafts, sessions },
      calls: [], writes: [], unexpected: [], catalogReady: false, transcript: '',
    }
    const catalogReads = new Set()
    const catalog = (command, result) => {
      catalogReads.add(command)
      fixture.catalogReady = ['patient_list', 'behavior_list', 'indicator_catalog'].every(name => catalogReads.has(name))
      return clone(result)
    }

    // Exact media helper from the old desktop-voice-interface spec and the
    // series assistant spec. Replay uses captured native transcripts with
    // simulated media/IPC; it does not execute Rust or use a real microphone.
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
      if (command === 'agenda_list_series') return clone(series)
      if (command === 'agenda_history') return clone(history.slice().reverse())
      // Filter by the effective date, including originals outside the week.
      if (command === 'agenda_occurrences') return clone(occurrences.filter(item => item.date >= args.from && item.date <= args.to))
      if (command === 'session_draft_list') return clone(drafts)
      if (command === 'session_timeline') return clone(sessions)
      if (command === 'voice_transcribe') return fixture.transcript
      fixture.unexpected.push(command)
      // No mutation is authorized by a details request. Record an attempted
      // write as well as rejecting every command outside the explicit fixture.
      if (/(?:create|update|save|start|cancel|finalize|end_series|reschedule|archive|restore)/.test(command)) fixture.writes.push(clone({ command, args }))
      throw new Error(`IPC sem fixture: ${command}`)
    } }
  }, { week })
  await page.goto('/')
  await expect(assistant(page)).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.appointmentDetails.catalogReady)).toBe(true)
  await expect(page.locator('.vault-home-preview')).toContainText('Ana Clara')
  await page.clock.runFor(32)
  await command(page, 'Abrir Agenda')
  await expect(page.getByRole('region', { name: 'Calendário semana', exact: true })).toBeVisible()
  await expect(page.getByText('Carregando Agenda...', { exact: true })).toHaveCount(0)
  if (!week) {
    await command(page, 'Clicar em Dia')
    await expect(page.getByRole('region', { name: 'Calendário dia', exact: true })).toBeVisible()
    await expect(page.getByText('Carregando Agenda...', { exact: true })).toHaveCount(0)
  }
  await expect(page.getByLabel('Data de referência')).toHaveValue('2026-10-04')
  const controls = page.locator('[data-voice-action^="agenda:details:"]')
  await expect(controls).toHaveCount(week ? 2 : 1)
  for (const control of await controls.all()) {
    await expect(control).toBeVisible()
    await expect(control).toBeEnabled()
  }
  await expect(panel(page)).toHaveCount(0)
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

async function expectUnchanged(page, before) {
  expect(await snapshot(page)).toEqual(before)
  expect(await writes(page)).toEqual([])
  expect(await page.evaluate(() => window.appointmentDetails.unexpected)).toEqual([])
  await expect(page.getByRole('form', { name: 'Rascunho de sessão', exact: true })).toHaveCount(0)
  await expect(page.getByRole('form', { name: 'Alterar ocorrência individual', exact: true })).toHaveCount(0)
  await expect(page.getByRole('form', { name: 'Novo compromisso', exact: true })).toHaveCount(0)
  await expect(page.getByRole('form', { name: 'Encerrar série recorrente', exact: true })).toHaveCount(0)
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
}

async function expectExactDetails(page, { completed = false } = {}) {
  await expect(panel(page)).toBeVisible()
  await expect(panel(page).locator('.agenda-detail-list > li')).toHaveCount(1)
  const card = page.locator('[id="agenda-detail-series-ana-15:2026-09-28"]')
  await expect(card).toBeVisible()
  await expect(card).toContainText('Ana Clara')
  await expect(card).toContainText('2026-10-04 · 15:00–15:50')
  await expect(card).toContainText('Data original: 2026-09-28')
  await expect(card).toContainText('Remarcada')
  await expect(page.locator('[id="agenda-detail-series-ana-16:2026-10-06"]')).toHaveCount(0)
  if (completed) {
    await expect(card).toContainText('Realizada')
    await expect(card.getByRole('button')).toHaveCount(0)
  }
}

async function replayAudio(page, corpus, index) {
  const recording = corpus.find(item => item.Index === index)
  expect(recording, `Captura nativa Index ${index}`).toBeDefined()
  expect(recording.Transcript).toEqual(expect.any(String))
  await page.evaluate(text => { window.appointmentDetails.transcript = text }, recording.Transcript)
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
  page.appointmentDetailsBoundary = unexpected
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.appointmentDetails?.unexpected || [])).toEqual([])
  expect(page.appointmentDetailsBoundary).toEqual([])
})

test('shell Dia por comando: aliases preparam sem abrir; confirmar mostra somente os detalhes exatos e fechar preserva tudo', async ({ page }) => {
  await openApp(page)
  const before = await snapshot(page)
  for (const request of ['Abrir detalhes de Ana Clara', 'Ver detalhes de Ana Clara', 'Clicar em Detalhes de Ana Clara']) {
    await propose(page, request)
    await expect(page.locator('.voice-command-preview')).toContainText('Ana Clara')
    await expect(panel(page)).toHaveCount(0)
    await expectUnchanged(page, before)
    await confirmProposal(page)
    await expectExactDetails(page)
    await expectUnchanged(page, before)
    await propose(page, 'Clicar em Fechar detalhes')
    await expect(page.locator('.voice-command-preview')).toBeVisible()
    await expectExactDetails(page)
    await expectUnchanged(page, before)
    await confirmProposal(page)
    await expect(panel(page)).toHaveCount(0)
    await expectUnchanged(page, before)
  }
})

test('shell Semana: duas ocorrências recusam pedido curto e data/hora faladas escolhem a efetiva remarcada e concluída', async ({ page }) => {
  await openApp(page, { week: true })
  const before = await snapshot(page)
  await propose(page, 'Abrir detalhes de Ana Clara')
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  await expect(page.locator('.voice-command-error')).toContainText(/mais de um|mais de uma|ambígu/i)
  await expect(panel(page)).toHaveCount(0)
  await expectUnchanged(page, before)
  // The original is in September, outside this visible week. A request for
  // that original date must not match the October 4 effective occurrence.
  await propose(page, 'Abrir detalhes de Ana Clara em vinte e oito de setembro de dois mil e vinte e seis às quinze horas')
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  await expect(page.locator('.voice-command-error')).toBeVisible()
  await expect(panel(page)).toHaveCount(0)
  await expectUnchanged(page, before)
  await propose(page, fullSpokenRequest)
  await expect(page.locator('.voice-command-preview')).toContainText('Ana Clara')
  await expect(page.locator('.voice-command-preview')).toContainText('2026-10-04')
  await expect(page.locator('.voice-command-preview')).toContainText('15:00')
  await expect(panel(page)).toHaveCount(0)
  await expectUnchanged(page, before)
  await confirmProposal(page)
  await expectExactDetails(page, { completed: true })
  await expectUnchanged(page, before)
  await command(page, 'Clicar em Fechar detalhes')
  await expect(panel(page)).toHaveCount(0)
  await expectUnchanged(page, before)
})

test('REPLAY nativo detalhes índices 0 e 2: proposta real no primeiro áudio, detalhes exatos no segundo, duas transcrições sem gravar', async ({ page }) => {
  // Read only Sagan's captured fixture, at execution time so --list works while
  // the fixture is being produced. No invented corpus, fallback or skipped test.
  const corpus = JSON.parse(readFileSync(new URL('../fixtures/native-voice-details-20261004.json', import.meta.url), 'utf8'))
  await openApp(page)
  const before = await snapshot(page)
  await replayAudio(page, corpus, 0)
  await expect(page.locator('.voice-command-preview')).toContainText('Ana Clara')
  await expect(panel(page)).toHaveCount(0)
  await expectUnchanged(page, before)
  expect(await page.evaluate(() => window.appointmentDetails.calls.filter(call => call.command === 'voice_transcribe').length)).toBe(1)
  await replayAudio(page, corpus, 2)
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  await expectExactDetails(page)
  await expectUnchanged(page, before)
  const captures = await page.evaluate(() => window.appointmentDetails.calls.filter(call => call.command === 'voice_transcribe'))
  expect(captures).toHaveLength(2)
  for (const { args } of captures) {
    expect(args.sampleRate).toBe(8000)
    expect(args.samples.length).toBeGreaterThan(0)
    expect(args.samples.some(sample => sample !== 0)).toBe(true)
    expect(args.patientNames).toContain('Ana Clara')
  }
})

test('REPLAY nativo detalhes índices 1 e 2: Verdetales com data/hora escolhe entre duas ocorrências somente após confirmar sem gravar', async ({ page }) => {
  const corpus = JSON.parse(readFileSync(new URL('../fixtures/native-voice-details-20261004.json', import.meta.url), 'utf8'))
  // Keep the captured recognition error and mixed numeric/spoken date intact.
  // Only the production gateway may recognize its strict prefix alias.
  expect(corpus.find(item => item.Index === 1)?.Transcript).toBe('Verdetales de Ana Clara em 4 de outubro de dois mil e vinte e seis às quinze horas.')
  await openApp(page, { week: true })
  const before = await snapshot(page)
  await expect(page.locator('[data-voice-action^="agenda:details:"]')).toHaveCount(2)
  await replayAudio(page, corpus, 1)
  await expect(assistant(page).getByLabel('Seu comando')).toHaveValue(corpus.find(item => item.Index === 1).Transcript)
  await expect(page.locator('.voice-command-preview')).toContainText('Ana Clara')
  await expect(page.locator('.voice-command-preview')).toContainText('2026-10-04')
  await expect(page.locator('.voice-command-preview')).toContainText('15:00')
  await expect(panel(page)).toHaveCount(0)
  await expectUnchanged(page, before)
  expect(await page.evaluate(() => window.appointmentDetails.calls.filter(call => call.command === 'voice_transcribe').length)).toBe(1)

  await replayAudio(page, corpus, 2)
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  await expectExactDetails(page, { completed: true })
  await expectUnchanged(page, before)
  const captures = await page.evaluate(() => window.appointmentDetails.calls.filter(call => call.command === 'voice_transcribe'))
  expect(captures).toHaveLength(2)
  for (const { args } of captures) {
    expect(args.sampleRate).toBe(8000)
    expect(args.samples.length).toBeGreaterThan(0)
    expect(args.samples.some(sample => sample !== 0)).toBe(true)
    expect(args.patientNames).toContain('Ana Clara')
  }
})
