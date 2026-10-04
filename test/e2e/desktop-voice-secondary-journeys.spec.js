import { expect, test } from '@playwright/test'

// Increment 81: real capture, command gateway, DOM executor and existing handlers.
// Only PCM/media and native IPC are synthetic. No profile, ASR, disk or network.
// Native export chooser stays manual: the fixture waits for an explicit cancel;
// it neither invents a voice file-selection intent nor claims native GUI coverage.
const demand = 'Demanda inteiramente sintética; preservar MAIÚSCULAS.'
const objectives = 'Objetivos fictícios, sem interpretação clínica.'
const addendum = 'Adendo SINTÉTICO: conteúdo literal, sem corrigir o original.'

async function openApp(page, baseURL, scenario) {
  const external = []
  const dialogs = []
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss() })
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) return route.continue()
    external.push(route.request().url())
    return route.abort('blockedbyclient')
  })
  await page.clock.install({ time: new Date('2026-10-03T15:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-03T15:00:00Z'))
  await page.addInitScript(({ scenario, demand, objectives, addendum }) => {
    const patients = [
      { id: 'ana', name: 'Ana Clara', age: 8, revision: 1, preferredModality: 'Presencial', archivedAt: null },
      { id: 'caio', name: 'Caio Fictício', age: 9, revision: 1, preferredModality: 'Online', archivedAt: null },
    ]
    const session = (id, patientId, start, end) => ({ id, patientId, seriesId: null,
      originalDate: '2026-10-03', sessionDate: '2026-10-03', start, end,
      modality: 'Presencial', wasRescheduled: false, observation: `Original sintético ${id}`,
      procedures: '', outcomeDecision: '', referralClosure: '', behaviors: [], indicators: [] })
    const fixture = window.secondaryVoice = {
      calls: [], unexpected: [], effects: [], transcript: '', captures: [], captureRefs: [],
      mediaRequests: 0, trackStops: 0, contextCloses: 0, sourceDisconnects: 0, processorDisconnects: 0,
      unlocked: true, failAnalytics: false, chooserPending: false,
      timeline: [session('ana-afternoon', 'ana', '15:00', '15:50'),
        session('ana-morning', 'ana', '09:00', '09:50'), session('caio-afternoon', 'caio', '15:00', '15:50')],
      contexts: [
        { id: 'ana-context-old', patientId: 'ana', demand: 'Demanda antiga sintética', objectives: 'Objetivo antigo sintético', recordedAt: '2026-09-01T12:00:00Z' },
        { id: 'caio-context', patientId: 'caio', demand: 'Demanda do concorrente', objectives: 'Objetivo do concorrente', recordedAt: '2026-09-02T12:00:00Z' },
      ], addenda: [],
    }
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
            processor.onaudioprocess({
              inputBuffer: { getChannelData: () => new Float32Array(4096).fill(amplitude) },
              outputBuffer: { getChannelData: () => new Float32Array(4096) },
            })
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
    const expectedEffects = {
      context: { case_context_create: { patientId: 'ana', demand, objectives } },
      addendum: { session_addendum_create: { sessionId: 'ana-afternoon', patientId: 'ana', content: addendum } },
      export: { record_copy_export: { patientId: 'ana' } },
      settings: { auto_backup_retry: {}, vault_lock: {} },
    }
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      fixture.calls.push({ command, args: structuredClone(args) })
      if (command === 'voice_transcribe') {
        fixture.captures.push({ args: structuredClone(args), transcript: fixture.transcript })
        fixture.captureRefs.push(args)
        return fixture.transcript
      }
      if (command === 'vault_status') return { initialized: true, unlocked: fixture.unlocked, profileState: 'ready' }
      if (command === 'auto_backup_status') return { available: false, dirty: false }
      if (command === 'plugin:updater|check') return null
      if (command === 'patient_list') return structuredClone(patients.filter(patient => args.includeArchived || !patient.archivedAt))
      if (command === 'session_timeline') return structuredClone(fixture.timeline.filter(item => item.patientId === args.patientId))
      if (command === 'case_context_list') return structuredClone(fixture.contexts.filter(item => item.patientId === args.patientId))
      if (command === 'session_addendum_list') return structuredClone(fixture.addenda.filter(item => item.patientId === args.patientId))
      if (['agenda_occurrences', 'agenda_list_series', 'agenda_history', 'behavior_list', 'indicator_catalog', 'related_party_list', 'session_draft_list'].includes(command)) return []
      if (command === 'analytics_overview') {
        if (fixture.failAnalytics) throw new Error('Consulta sintética indisponível')
        return { totalCompletedSessions: 7, uniquePatients: 2,
          dailyCounts: [{ date: args.from, count: 7 }], monthlyCounts: [{ month: args.from.slice(0, 7), count: 7 }],
          behaviorCounts: [{ templateId: 'synthetic', templateVersion: 1, title: 'Observação sintética', occurrences: 7, uniquePatients: 2 }] }
      }
      const expected = expectedEffects[scenario]?.[command]
      const samePayload = expected && Object.keys(args).length === Object.keys(expected).length
        && Object.entries(expected).every(([key, value]) => args[key] === value)
      if (!samePayload) {
        fixture.unexpected.push({ command, args: structuredClone(args) })
        throw new Error(`IPC não autorizado neste cenário: ${command}`)
      }
      fixture.effects.push({ command, args: structuredClone(args) })
      if (command === 'case_context_create') {
        const saved = { id: 'ana-context-new', ...args, recordedAt: '2026-10-03T15:00:00Z' }
        fixture.contexts.unshift(saved)
        return structuredClone(saved)
      }
      if (command === 'session_addendum_create') {
        const saved = { id: 'ana-addendum-new', ...args, createdAt: '2026-10-03T15:00:00Z' }
        fixture.addenda.push(saved)
        return structuredClone(saved)
      }
      if (command === 'record_copy_export') {
        fixture.chooserPending = true
        return await new Promise(resolve => {
          fixture.cancelChooser = () => { fixture.chooserPending = false; resolve(false) }
        })
      }
      if (command === 'auto_backup_retry') return { available: true, dirty: false, lastVerifiedAt: 1791039600 }
      if (command === 'vault_lock') { fixture.unlocked = false; return null }
      throw new Error(`Handler sintético ausente: ${command}`)
    } }
  }, { scenario, demand, objectives, addendum })
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Comando do Círculo' })).toBeVisible()
  return { external, dialogs }
}

const effects = page => page.evaluate(() => window.secondaryVoice.effects)
const calls = (page, command) => page.evaluate(name => window.secondaryVoice.calls.filter(item => item.command === name).map(item => item.args), command)

async function assertCaptureCleanup(page) {
  const media = await page.evaluate(() => {
    const fixture = window.secondaryVoice
    return { captures: fixture.captures,
      counters: [fixture.mediaRequests, fixture.trackStops, fixture.contextCloses, fixture.sourceDisconnects, fixture.processorDisconnects],
      erased: fixture.captureRefs.length === fixture.captures.length && fixture.captureRefs.every(args =>
        args.samples.every(sample => sample === 0) && args.patientNames.every(name => name === '')) }
  })
  expect(media.captures.length).toBeGreaterThan(0)
  expect(media.counters).toEqual(Array(5).fill(media.captures.length))
  expect(media.erased).toBe(true)
  for (const { args } of media.captures) {
    expect(args.sampleRate).toBe(8000)
    expect(args.samples.length).toBeGreaterThan(0)
    expect(args.samples.some(sample => sample !== 0)).toBe(true)
    expect(args.samples.length / args.sampleRate).toBeLessThan(12)
  }
  await expect(page.getByText(/A captura atingiu .*segundos e pode estar incompleta/u)).toHaveCount(0)
}

async function audio(page, transcript) {
  const count = await page.evaluate(text => {
    window.secondaryVoice.transcript = text
    return window.secondaryVoice.captures.length
  }, transcript)
  const listen = page.getByRole('region', { name: 'Comando do Círculo' }).getByRole('button', { name: 'Ouvir comando', exact: true })
  await listen.click()
  await page.clock.runFor(1600)
  await expect(listen).toBeEnabled()
  await expect.poll(() => page.evaluate(() => window.secondaryVoice.captures.length)).toBe(count + 1)
  expect(await page.evaluate(() => window.secondaryVoice.captures.at(-1).transcript)).toBe(transcript)
  await assertCaptureCleanup(page)
}

async function prepare(page, transcript) {
  const before = await effects(page)
  await audio(page, transcript)
  await expect(page.locator('.voice-command-preview'), transcript).toBeVisible()
  expect(await effects(page)).toEqual(before)
}

async function confirm(page) {
  await audio(page, 'Confirmar')
  await page.clock.runFor(32)
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
}

async function command(page, transcript) {
  await prepare(page, transcript)
  await confirm(page)
}

async function assertBoundaries(page, boundaries) {
  expect(boundaries.external).toEqual([])
  expect(boundaries.dialogs).toEqual([])
  expect(await page.evaluate(() => window.secondaryVoice.unexpected)).toEqual([])
  await assertCaptureCleanup(page)
}

test('áudio: Análises aplica campos/filtro exatos e retry consulta sem escrita', async ({ page, baseURL }) => {
  const boundaries = await openApp(page, baseURL, 'analytics')
  await command(page, 'Abrir Análises')
  const panel = page.getByRole('region', { name: 'Análises', exact: true })
  const month = { from: '2026-10-01', to: '2026-10-31', patientId: null }
  await expect.poll(() => calls(page, 'analytics_overview')).toEqual([month, month])
  const initial = [month, month]
  await prepare(page, 'Preencher De com 01/09/2026')
  await expect(panel.getByLabel('De', { exact: true })).toHaveValue(month.from)
  expect(await calls(page, 'analytics_overview')).toEqual(initial)
  await confirm(page)
  await expect(panel.getByLabel('De', { exact: true })).toHaveValue('2026-09-01')
  await expect.poll(() => calls(page, 'analytics_overview')).toEqual([...initial, { ...month, from: '2026-09-01' }])
  await command(page, 'Preencher Até com 30/09/2026')
  const september = { from: '2026-09-01', to: '2026-09-30', patientId: null }
  await expect(panel.getByLabel('Até', { exact: true })).toHaveValue(september.to)
  await expect.poll(() => calls(page, 'analytics_overview')).toEqual([...initial, { ...month, from: september.from }, september])
  await page.evaluate(() => { window.secondaryVoice.failAnalytics = true })
  await prepare(page, 'Selecionar Paciente como Ana Clara')
  await expect(panel.getByLabel('Paciente', { exact: true })).toHaveValue('')
  const beforeFilter = await calls(page, 'analytics_overview')
  await confirm(page)
  const filtered = { ...september, patientId: 'ana' }
  await expect.poll(() => calls(page, 'analytics_overview')).toEqual([...beforeFilter, filtered])
  await expect(panel.getByLabel('Paciente', { exact: true })).toHaveValue('ana')
  await expect(panel.getByRole('alert')).toContainText('Não foi possível carregar as análises')
  await expect(panel.locator('.analytics-summary')).toHaveCount(0)
  await page.evaluate(() => { window.secondaryVoice.failAnalytics = false })
  await prepare(page, 'Clicar em Tentar novamente')
  expect(await calls(page, 'analytics_overview')).toEqual([...beforeFilter, filtered])
  await confirm(page)
  await expect.poll(() => calls(page, 'analytics_overview')).toEqual([...beforeFilter, filtered, filtered])
  await expect(panel.locator('.analytics-summary strong')).toHaveText(['7', '2'])
  expect(await effects(page)).toEqual([])
  await assertBoundaries(page, boundaries)
})

test('áudio: contexto cria uma revisão do paciente certo só após segunda captura', async ({ page, baseURL }) => {
  const boundaries = await openApp(page, baseURL, 'context')
  const original = await page.evaluate(() => window.secondaryVoice.contexts)
  await prepare(page, 'Abrir contexto do caso de Ana Clara')
  await expect(page.locator('.voice-command-preview')).toContainText('Ana Clara')
  await expect(page.getByRole('form', { name: 'Nova revisão do contexto do caso' })).toHaveCount(0)
  await confirm(page)
  const form = page.getByRole('form', { name: 'Nova revisão do contexto do caso' })
  await expect(form).toBeVisible()
  await expect(form).toHaveAttribute('data-voice-record', 'context:ana')
  expect(await calls(page, 'case_context_list')).toContainEqual({ patientId: 'ana' })
  await command(page, `Preencher Demanda avaliada com ${demand}`)
  await command(page, `Preencher Objetivos de trabalho com ${objectives}`)
  await expect(form.getByLabel('Demanda avaliada')).toHaveValue(demand)
  await expect(form.getByLabel('Objetivos de trabalho')).toHaveValue(objectives)
  await prepare(page, 'Clicar em Salvar nova revisão do contexto')
  expect(await effects(page)).toEqual([])
  expect(await page.evaluate(() => window.secondaryVoice.contexts)).toEqual(original)
  await confirm(page)
  const payload = { patientId: 'ana', demand, objectives }
  expect(await effects(page)).toEqual([{ command: 'case_context_create', args: payload }])
  expect(await page.evaluate(() => window.secondaryVoice.contexts)).toEqual([
    { id: 'ana-context-new', ...payload, recordedAt: '2026-10-03T15:00:00Z' }, ...original,
  ])
  await expect(form.getByLabel('Demanda avaliada')).toHaveValue('')
  await expect(form.locator('..')).toContainText(demand)
  await assertBoundaries(page, boundaries)
})

test('áudio: adendo identifica sessão/data/hora sem alterar originais concorrentes', async ({ page, baseURL }) => {
  const boundaries = await openApp(page, baseURL, 'addendum')
  const original = await page.evaluate(() => window.secondaryVoice.timeline)
  await prepare(page, 'Adicionar adendo à sessão de Ana Clara de 03/10/2026 às 15:00')
  await expect(page.locator('.voice-command-preview')).toContainText('sessão finalizada de Ana Clara em 03/10/2026 às 15:00')
  await expect(page.locator('#addendum-ana-afternoon')).toHaveCount(0)
  await confirm(page)
  const body = page.locator('#addendum-ana-afternoon')
  await expect(body).toBeVisible()
  await expect(body.locator('xpath=ancestor::li[1]')).toHaveAttribute('data-voice-record', 'session:ana-afternoon')
  await expect(page.locator('#addendum-ana-morning, #addendum-caio-afternoon')).toHaveCount(0)
  // Use the full existing UI label; preserve the literal body without normalization.
  await expect(body).toHaveValue('')
  await prepare(page, `Preencher Texto do adendo (até 4000 caracteres) com ${addendum}`)
  await expect(body).toHaveValue('')
  expect(await effects(page)).toEqual([])
  await confirm(page)
  await expect(body).toHaveValue(addendum)
  expect(await effects(page)).toEqual([])
  await prepare(page, 'Clicar em Salvar adendo imutável')
  await expect(body).toHaveValue(addendum)
  expect(await effects(page)).toEqual([])
  expect(await page.evaluate(() => window.secondaryVoice.addenda)).toEqual([])
  await confirm(page)
  const payload = { sessionId: 'ana-afternoon', patientId: 'ana', content: addendum }
  expect(await effects(page)).toEqual([{ command: 'session_addendum_create', args: payload }])
  expect(await page.evaluate(() => window.secondaryVoice.addenda)).toEqual([{ id: 'ana-addendum-new', ...payload, createdAt: '2026-10-03T15:00:00Z' }])
  expect(await page.evaluate(() => window.secondaryVoice.timeline)).toEqual(original)
  await expect(page.locator('[data-voice-record="session:ana-afternoon"]')).toContainText(addendum)
  await expect(body).toHaveCount(0)
  await assertBoundaries(page, boundaries)
})

test('áudio: exportação exige confirmação do aviso e chooser continua manual', async ({ page, baseURL }) => {
  const boundaries = await openApp(page, baseURL, 'export')
  await command(page, 'Abrir registros de Ana Clara')
  await command(page, 'Clicar em Exportar cópia legível')
  const warning = page.getByRole('alertdialog', { name: 'Confirmar ação' })
  await prepare(page, 'Clicar em Exportar cópia legível deste paciente')
  await expect(warning).toHaveCount(0)
  expect(await effects(page)).toEqual([])
  await confirm(page)
  await expect(warning).toContainText('sem criptografia')
  expect(await calls(page, 'record_copy_export')).toEqual([])
  await audio(page, 'Voltar')
  await expect(warning).toHaveCount(0)
  expect(await effects(page)).toEqual([])
  await command(page, 'Clicar em Exportar cópia legível deste paciente')
  await expect(warning).toBeVisible()
  expect(await calls(page, 'record_copy_export')).toEqual([])
  await audio(page, 'Confirmar')
  await expect.poll(() => calls(page, 'record_copy_export')).toEqual([{ patientId: 'ana' }])
  expect(await page.evaluate(() => window.secondaryVoice.chooserPending)).toBe(true)
  await expect(page.getByText('Cópia legível criada.', { exact: false })).toHaveCount(0)
  // Explicit manual cancel of the synthetic native chooser; no path or file.
  await page.evaluate(() => window.secondaryVoice.cancelChooser())
  await expect.poll(() => page.evaluate(() => window.secondaryVoice.chooserPending)).toBe(false)
  await expect(page.getByRole('button', { name: 'Exportar cópia legível deste paciente', exact: true })).toBeEnabled()
  expect(await effects(page)).toEqual([{ command: 'record_copy_export', args: { patientId: 'ana' } }])
  await assertBoundaries(page, boundaries)
})

test('áudio: ajustes, cópia automática, licenças e bloqueio usam handlers existentes', async ({ page, baseURL }) => {
  const boundaries = await openApp(page, baseURL, 'settings')
  await command(page, 'Abrir ajustes')
  await prepare(page, 'Clicar em Atualizar cópia automática agora')
  expect(await calls(page, 'auto_backup_retry')).toEqual([])
  await confirm(page)
  expect(await calls(page, 'auto_backup_retry')).toEqual([{}])
  await command(page, 'Clicar em Licenças de terceiros')
  await expect(page.getByText('SQLite é disponibilizado em domínio público.', { exact: true })).toBeVisible()
  await prepare(page, 'Clicar em Bloquear')
  expect(await calls(page, 'vault_lock')).toEqual([])
  expect(await page.evaluate(() => window.secondaryVoice.unlocked)).toBe(true)
  await confirm(page)
  await expect(page.locator('#vault-password')).toBeVisible()
  expect(await page.evaluate(() => window.secondaryVoice.unlocked)).toBe(false)
  expect(await effects(page)).toEqual([{ command: 'auto_backup_retry', args: {} }, { command: 'vault_lock', args: {} }])
  expect(await calls(page, 'recovery_inventory')).toEqual([])
  await assertBoundaries(page, boundaries)
})
