import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const nativeSeriesCorpus = JSON.parse(readFileSync(new URL('../fixtures/native-voice-series-20261004.json', import.meta.url), 'utf8'))
const endingForm = page => page.getByRole('form', { name: 'Encerrar série recorrente', exact: true })
const snapshot = page => page.evaluate(() => structuredClone(window.seriesEnding.state))
const writes = page => page.evaluate(() => structuredClone(window.seriesEnding.writes))

// Full DesktopVault shell and real gateway/Agenda. Only IPC and audio hardware
// are synthetic. Every IPC result is cloned; an unknown command fails loudly.
async function openApp(page, { multiple = false, endDate = null } = {}) {
  await page.clock.install({ time: new Date('2026-10-04T15:00:00Z') })
  await page.addInitScript(({ multiple, endDate }) => {
    const clone = value => structuredClone(value)
    const plusDays = (date, days) => {
      const value = new Date(`${date}T12:00:00Z`)
      value.setUTCDate(value.getUTCDate() + days)
      return value.toISOString().slice(0, 10)
    }
    const patients = [{ id: 'ana', name: 'Ana Clara', age: 8, revision: 1, preferredModality: 'Presencial', archivedAt: null }]
    const series = [{ id: 'series-ana-15', patientId: 'ana', weekday: 1, start: '15:00', end: '15:50', frequency: 'Semanal', startDate: '2026-09-28', endDate, modality: 'Presencial', meetingLink: null, timeZone: 'America/Sao_Paulo', revision: 1 }]
    if (multiple) series.push({ ...series[0], id: 'series-ana-16', start: '16:00', end: '16:50' })
    const history = [{ id: 'event-prior', seriesId: 'series-ana-15', action: 'reschedule', originalDate: '2026-09-28', effectiveDate: '2026-09-29', start: '15:00', end: '15:50', reason: 'Ajuste administrativo sintético anterior' }]
    const drafts = [{ id: 'draft-prior', patientId: 'ana', seriesId: 'series-ana-15', originalDate: '2026-09-21', observation: 'Rascunho sintético preservado', procedures: '', outcomeDecision: '', referralClosure: '', behaviorIds: [], indicators: [] }]
    const sessions = [{ id: 'session-prior', patientId: 'ana', seriesId: 'series-ana-15', originalDate: '2026-09-14', observation: 'Registro sintético preservado' }]
    const fixture = window.seriesEnding = {
      state: { patients, series, history, drafts, sessions }, calls: [], writes: [], unexpected: [], catalogReady: false, transcript: '',
      mediaRequests: 0, trackStops: 0, contextCloses: 0, sourceDisconnects: 0, processorDisconnects: 0, captureRefs: [],
    }
    const catalogReads = new Set()
    const catalog = (command, result) => {
      catalogReads.add(command)
      fixture.catalogReady = ['patient_list', 'behavior_list', 'indicator_catalog'].every(name => catalogReads.has(name))
      return clone(result)
    }
    const occurrences = (from, to) => series.flatMap(item => {
      const result = []
      for (let originalDate = item.startDate; originalDate <= to && (!item.endDate || originalDate <= item.endDate); originalDate = plusDays(originalDate, 7)) {
        const events = history.filter(event => event.seriesId === item.id && event.originalDate === originalDate)
        if (events.some(event => event.action === 'cancel')) continue
        const moved = events.filter(event => event.action === 'reschedule').at(-1)
        const date = moved?.effectiveDate || originalDate
        if (date < from || date > to) continue
        result.push({ id: `${item.id}:${originalDate}`, seriesId: item.id, patientId: item.patientId, originalDate, date, start: moved?.start || item.start, end: moved?.end || item.end, status: 'scheduled', frequency: item.frequency, modality: item.modality, meetingLink: item.meetingLink, wasRescheduled: Boolean(moved) })
      }
      return result
    })

    // Short synthetic speech followed by >1100 ms of trailing silence, matching
    // the other replay fixtures. Continuous nonzero frames hit the 12-second
    // cap and correctly require manual preparation under the cutoff contract.
    // Preserved transcript replay is not Rust/ASR execution or real microphone.
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
      if (command === 'behavior_list' || command === 'indicator_catalog') return catalog(command, [])
      if (command === 'agenda_list_series') return clone(series)
      if (command === 'agenda_history') return clone(history.slice().reverse())
      if (command === 'agenda_occurrences') return clone(occurrences(args.from, args.to))
      if (command === 'session_draft_list') return clone(drafts)
      if (command === 'session_timeline') return clone(sessions)
      if (command === 'voice_transcribe') { fixture.captureRefs.push(args); return fixture.transcript }
      if (command === 'agenda_end_series') {
        const item = series.find(item => item.id === args.seriesId)
        if (!item || args.effectiveDate < '2026-10-04' || (item.endDate && args.effectiveDate > item.endDate)) throw new Error('Corte sintético inválido')
        if (history.some(event => event.seriesId === item.id && (event.originalDate >= args.effectiveDate || event.effectiveDate >= args.effectiveDate))) throw new Error('Alteração individual após o corte')
        item.endDate = plusDays(args.effectiveDate, -1)
        fixture.writes.push(clone({ command, args }))
        return clone(item)
      }
      fixture.unexpected.push(command)
      throw new Error(`IPC sem fixture: ${command}`)
    } }
  }, { multiple, endDate })
  await page.goto('/')
  const assistant = page.getByRole('region', { name: 'Comando do Círculo' })
  await expect(assistant).toBeVisible()
  // Wait for all fake catalog reads and the shell's rendered patient catalog
  // before even the navigation request; do not race bootstrap with a command.
  await expect.poll(() => page.evaluate(() => window.seriesEnding.catalogReady)).toBe(true)
  await expect(page.locator('.vault-home-preview')).toContainText('Ana Clara')
  await page.clock.runFor(32)
  await command(page, 'Abrir Agenda')
  await expect(page.getByRole('region', { name: 'Calendário semana', exact: true })).toBeVisible()
  await expect(page.getByText('Carregando Agenda...', { exact: true })).toHaveCount(0)
  await command(page, 'Abrir Compromissos persistidos')
  const controls = page.locator('[data-voice-action^="agenda:end-series:"]')
  await expect(controls).toHaveCount(multiple ? 2 : 1)
  for (const start of multiple ? ['15:00', '16:00'] : ['15:00']) {
    // Each enabled control is the gateway's real, record-scoped catalog entry.
    const entry = page.locator(`[data-voice-action^="agenda:end-series:"][data-voice-series-time="${start}"]`)
    await expect(entry).toBeEnabled()
    await expect(entry).toHaveAttribute('data-voice-series-kind', endDate ? 'advance' : 'end')
    await expect(entry).toHaveAttribute('data-voice-series-patient', 'Ana Clara')
    await expect(entry).toHaveAttribute('data-voice-series-weekday', '1')
    await expect(entry).toHaveAttribute('data-voice-record', `series:ana:series-ana-${start.slice(0, 2)}`)
    await expect(entry).toHaveAttribute('data-voice-epoch', /.+/)
  }
}

async function propose(page, text) {
  const assistant = page.getByRole('region', { name: 'Comando do Círculo' })
  await assistant.getByLabel('Seu comando').fill(text)
  await assistant.getByRole('button', { name: 'Preparar rascunho' }).click()
}

async function command(page, text) {
  const before = await writes(page)
  await propose(page, text)
  await expect(page.locator('.voice-command-preview')).toBeVisible()
  expect(await writes(page)).toEqual(before)
  await propose(page, 'confirmar')
  await page.clock.runFor(32)
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
}

async function expectUnchanged(page, before) {
  expect(await snapshot(page)).toEqual(before)
  expect(await writes(page)).toEqual([])
}

async function replayAudio(page, index) {
  const recording = nativeSeriesCorpus.find(item => item.Index === index)
  expect(recording).toBeDefined()
  await page.evaluate(text => { window.seriesEnding.transcript = text }, recording.Transcript)
  const listen = page.getByRole('region', { name: 'Comando do Círculo' }).getByRole('button', { name: 'Ouvir comando' })
  await listen.click()
  await page.clock.runFor(1600)
  await expect(listen).toBeEnabled()
  await expect(page.getByRole('region', { name: 'Comando do Círculo' }).getByLabel('Seu comando')).toHaveValue(recording.Transcript)
  await expect(page.getByRole('region', { name: 'Comando do Círculo' }).getByText(/A captura atingiu .*segundos e pode estar incompleta/u)).toHaveCount(0)
}

test.beforeEach(async ({ page, baseURL }) => {
  const unexpected = []
  page.on('dialog', async dialog => { unexpected.push(`native dialog: ${dialog.type()}`); await dialog.dismiss() })
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) await route.continue()
    else { unexpected.push(route.request().url()); await route.abort() }
  })
  page.seriesEndingBoundary = unexpected
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.seriesEnding?.unexpected || [])).toEqual([])
  expect(page.seriesEndingBoundary).toEqual([])
})

test('pedido direto prepara, confirmar abre formulário, recusa e Voltar preservam; aceite final grava o corte exato', async ({ page }) => {
  await openApp(page)
  const before = await snapshot(page)
  const form = endingForm(page)
  await propose(page, 'Encerrar série de Ana Clara')
  await expect(page.locator('.voice-command-preview')).toContainText('series-ana-15')
  await expect(form).toHaveCount(0)
  await expectUnchanged(page, before)
  await propose(page, 'confirmar')
  await page.clock.runFor(32)
  await expect(form).toBeVisible()
  await expect(form.getByRole('heading')).toHaveText('Encerrar série de Ana Clara · series-ana-15')
  await expectUnchanged(page, before)
  await command(page, 'Preencher Primeira data excluída com 2026-10-19')
  await expect(form.getByLabel('Primeira data excluída')).toHaveValue('2026-10-19')
  await command(page, 'Clicar em Confirmar encerramento')
  const confirmation = page.getByRole('alertdialog', { name: 'Confirmar ação' })
  await expect(confirmation).toContainText('series-ana-15')
  await expect(confirmation).toContainText('2026-10-19')
  await expectUnchanged(page, before)
  await propose(page, 'voltar')
  await expect(confirmation).toHaveCount(0)
  await expect(form.getByLabel('Primeira data excluída')).toHaveValue('2026-10-19')
  await expectUnchanged(page, before)
  await command(page, 'Clicar em Voltar')
  await expect(form).toHaveCount(0)
  await expectUnchanged(page, before)

  await command(page, 'Encerrar série de Ana Clara')
  await expect(form).toBeVisible()
  await command(page, 'Preencher Primeira data excluída com 2026-10-19')
  await command(page, 'Clicar em Confirmar encerramento')
  await expect(confirmation).toBeVisible()
  await expectUnchanged(page, before)
  await propose(page, 'confirmar')
  await expect.poll(() => writes(page)).toEqual([{ command: 'agenda_end_series', args: { seriesId: 'series-ana-15', effectiveDate: '2026-10-19' } }])
  await expect(form).toHaveCount(0)
  await expect(confirmation).toHaveCount(0)
  expect(await snapshot(page)).toEqual({ ...before, series: [{ ...before.series[0], endDate: '2026-10-18' }] })
})

test('duas séries às 15h e 16h recusam pedido curto; horário falado escolhe o formulário da série às 16h', async ({ page }) => {
  await openApp(page, { multiple: true })
  const before = await snapshot(page)
  const form = endingForm(page)
  await propose(page, 'Encerrar série de Ana Clara')
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  await expect(page.locator('.voice-command-error')).toContainText(/mais de um|mais de uma|ambígu|encontrei.*2/i)
  await expect(form).toHaveCount(0)
  await expectUnchanged(page, before)
  await propose(page, 'Encerrar série de Ana Clara na segunda às dezesseis horas')
  await expect(page.locator('.voice-command-preview')).toContainText('series-ana-16')
  await expect(page.locator('.voice-command-preview')).toContainText('16:00')
  await expect(form).toHaveCount(0)
  await expectUnchanged(page, before)
  await propose(page, 'confirmar')
  await page.clock.runFor(32)
  await expect(form).toBeVisible()
  await expect(form.getByRole('heading')).toHaveText('Encerrar série de Ana Clara · series-ana-16')
  await expectUnchanged(page, before)
  await command(page, 'Clicar em Voltar')
  await expect(form).toHaveCount(0)
  await expectUnchanged(page, before)
})

test('REPLAY nativo índices 1 e 2: Anticipar e Confirmar abrem formulário somente após o segundo áudio sem gravar', async ({ page }) => {
  await openApp(page, { endDate: '2026-11-30' })
  const before = await snapshot(page)
  const form = endingForm(page)
  expect(nativeSeriesCorpus.find(item => item.Index === 1).Transcript).toMatch(/^Anticipar /)
  expect(nativeSeriesCorpus.find(item => item.Index === 2).Transcript).toMatch(/^Confirmar /)
  await replayAudio(page, 1)
  await expect(page.locator('.voice-command-preview')).toContainText('series-ana-15')
  await expect(page.locator('.voice-command-preview')).toContainText('15:00')
  await expect(form).toHaveCount(0)
  await expectUnchanged(page, before)
  expect(await page.evaluate(() => window.seriesEnding.calls.filter(call => call.command === 'voice_transcribe').length)).toBe(1)
  await replayAudio(page, 2)
  await expect(form).toBeVisible()
  await expect(form.getByRole('heading')).toHaveText('Encerrar série de Ana Clara · series-ana-15')
  await expect(form.getByLabel('Primeira data excluída')).toHaveValue('2026-10-04')
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expectUnchanged(page, before)
  const captures = await page.evaluate(() => window.seriesEnding.calls.filter(call => call.command === 'voice_transcribe'))
  expect(captures).toHaveLength(2)
  expect(await page.evaluate(() => {
    const fixture = window.seriesEnding
    return [fixture.mediaRequests, fixture.trackStops, fixture.contextCloses, fixture.sourceDisconnects, fixture.processorDisconnects]
  })).toEqual([2, 2, 2, 2, 2])
  expect(await page.evaluate(() => window.seriesEnding.captureRefs.every(args => args.samples.every(sample => sample === 0) && args.patientNames.every(name => name === '')))).toBe(true)
  for (const { args } of captures) {
    expect(args.sampleRate).toBe(8000)
    expect(args.samples.length).toBeGreaterThan(0)
    expect(args.samples.length / args.sampleRate).toBeLessThan(12)
    expect(args.samples.some(sample => sample !== 0)).toBe(true)
    expect(args.patientNames).toContain('Ana Clara')
  }
})
