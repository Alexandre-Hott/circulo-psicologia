import { expect, test } from '@playwright/test'

// Six bounded cases supplement the typed-only anchor journey in
// desktop-voice-interface.spec.js. Real App/Vault/capture/gateway/Sessions and
// existing DOM handlers; only synthetic media and strict native IPC doubles.
// Short-PCM/silence fixture reused from desktop-voice-small-rust8-replay and
// residual-controls: no ASR/TTS, profile, intent/React-state injection or writes.
test.describe.configure({ timeout: 90000 })
const assistant = page => page.getByRole('region', { name: 'Comando do Círculo', exact: true })
const preview = page => page.locator('.voice-command-preview')
const form = page => page.getByRole('form', { name: 'Rascunho de sessão', exact: true })
const actions = [
  { label: 'Comportamentos', id: 'draft-behaviors', tag: 'A', focus: true },
  { label: 'Indicadores e escalas', id: 'draft-indicators', tag: 'A' },
  { label: 'Salvar ou finalizar', id: 'draft-actions', tag: 'A' },
  { label: 'Evolução descritiva', id: 'session-observation', tag: 'A', focus: true },
  { label: 'Escolher comportamentos desta sessão', id: 'draft-behaviors', tag: 'BUTTON', focus: true },
]
const state = page => page.evaluate(() => structuredClone(window.draftNavigationPCM.state))
const clicks = page => page.evaluate(() => structuredClone(window.draftNavigationPCM.clicks))

async function openApp(page) {
  const time = new Date('2026-10-04T15:00:00Z')
  await page.clock.install({ time })
  await page.clock.pauseAt(time)
  await page.addInitScript(() => {
    const clone = value => structuredClone(value)
    const patients = [
      { id: 'ana', name: 'Ana Clara', age: 8, revision: 1, preferredModality: 'Presencial', archivedAt: null },
      { id: 'bia', name: 'Bia Fictícia', age: 9, revision: 1, preferredModality: 'Online', archivedAt: null },
    ]
    const behaviors = [{ id: 'help', title: 'Pede ajuda', description: 'Catálogo sintético.', version: 1 }]
    const indicators = [{ id: 'participacao', name: 'Participação sintética', version: 1, definition: 'Escala fictícia.', labels: ['Com apoio', 'Autônoma'] }]
    const drafts = ['ana', 'bia'].map(patientId => ({
      id: `draft-${patientId}`, patientId, seriesId: `series-${patientId}`, originalDate: '2026-10-04',
      observation: `Observação preservada ${patientId}.`, procedures: `Procedimento preservado ${patientId}.`,
      outcomeDecision: `Decisão preservada ${patientId}.`, referralClosure: `Orientação preservada ${patientId}.`,
      behaviorIds: patientId === 'ana' ? ['help'] : [], indicators: [{ id: 'participacao', value: 0, note: `Nota ${patientId}.` }],
    }))
    const f = window.draftNavigationPCM = {
      state: { patients, behaviors, indicators, drafts }, calls: [], writes: [], unexpected: [], clicks: [],
      transcripts: [], captures: [], captureRefs: [], catalogReady: false,
      mediaRequests: 0, trackStops: 0, contextCloses: 0, sourceDisconnects: 0, processorDisconnects: 0,
    }
    const ready = new Set()
    const fail = message => { f.unexpected.push(message); throw new Error(message) }
    const catalog = (command, value) => {
      ready.add(command)
      f.catalogReady = ['patient_list', 'behavior_list', 'indicator_catalog'].every(name => ready.has(name))
      return clone(value)
    }
    // Observe actual dispatched clicks only; never invoke/replace a handler.
    document.addEventListener('click', event => {
      const element = event.target instanceof Element ? event.target.closest('a,button') : null
      const workspace = element?.closest('section[aria-label="Sessões e registros"]')
      if (!workspace) return
      f.clicks.push({
        tag: element.tagName, label: element.textContent.trim(), href: element.getAttribute('href'),
        record: (element.closest('form[aria-label="Rascunho de sessão"]') || workspace.querySelector('form[aria-label="Rascunho de sessão"]'))?.getAttribute('data-voice-record') ?? null,
        patientId: workspace.querySelector('#session-patient')?.value ?? null,
      })
    }, true)
    class SyntheticAudioContext {
      constructor() { this.sampleRate = 8000; this.state = 'running'; this.destination = {} }
      createMediaStreamSource() { return { connect() {}, disconnect() { f.sourceDisconnects++ } } }
      createScriptProcessor() {
        const processor = { onaudioprocess: null, disconnect() { f.processorDisconnects++ } }
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
      close() { this.state = 'closed'; f.contextCloses++; return Promise.resolve() }
    }
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: SyntheticAudioContext })
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
      f.mediaRequests++
      return { getTracks: () => [{ stop() { f.trackStops++ } }] }
    } } })
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      if (command === 'voice_transcribe') {
        if (Object.keys(args).sort().join('|') !== 'patientNames|sampleRate|samples'
          || args.sampleRate !== 8000 || !Array.isArray(args.samples) || !args.samples.length
          || args.samples.length / args.sampleRate >= 12 || !args.samples.every(Number.isFinite)
          || !args.samples.some(value => value !== 0) || !args.samples.some(value => value === 0)
          || JSON.stringify(args.patientNames) !== JSON.stringify(['Ana Clara', 'Bia Fictícia'])) return fail('PCM/contexto inválido')
        const transcript = f.transcripts.shift()
        if (typeof transcript !== 'string' || !transcript.trim()) return fail('Transcrição não autorizada')
        f.calls.push({ command })
        f.captures.push({ transcript, sampleRate: args.sampleRate, sampleCount: args.samples.length })
        f.captureRefs.push(args)
        return transcript
      }
      f.calls.push(clone({ command, args }))
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { available: false, dirty: false }
      if (command === 'plugin:updater|check') return null
      if (command === 'patient_list') return catalog(command, patients)
      if (command === 'behavior_list') return catalog(command, behaviors)
      if (command === 'indicator_catalog') return catalog(command, indicators)
      if (command === 'session_draft_list') {
        if (!['ana', 'bia'].includes(args.patientId)) return fail('Paciente não sintético')
        return clone(drafts.filter(item => item.patientId === args.patientId))
      }
      if (['session_timeline', 'session_addendum_list', 'case_context_list'].includes(command)) {
        if (!['ana', 'bia'].includes(args.patientId)) return fail('Contexto de leitura incorreto')
        return []
      }
      if (command === 'agenda_occurrences') return []
      // No write operation is implemented or allowed, even after confirmation.
      f.writes.push(clone({ command, args }))
      return fail(`IPC fora do contrato: ${command}`)
    } }
  })
  await page.goto('/')
  await expect(assistant(page)).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.draftNavigationPCM.catalogReady)).toBe(true)
}

async function audio(page, transcript) {
  const count = await page.evaluate(() => window.draftNavigationPCM.captures.length)
  await page.evaluate(text => window.draftNavigationPCM.transcripts.push(text), transcript)
  const listen = assistant(page).getByRole('button', { name: 'Ouvir comando', exact: true })
  await expect(listen).toBeEnabled()
  await listen.click()
  await expect(listen).toBeDisabled()
  await page.clock.runFor(1600)
  await expect(listen).toBeEnabled()
  expect(await page.evaluate(() => window.draftNavigationPCM.captures.length)).toBe(count + 1)
  expect(await page.evaluate(() => window.draftNavigationPCM.captures.at(-1).transcript)).toBe(transcript)
  await expect(assistant(page)).not.toContainText('pode estar incompleta')
}

async function prepare(page, transcript) {
  const beforeState = await state(page)
  const beforeClicks = await clicks(page)
  const beforeURL = page.url()
  await audio(page, transcript)
  await expect(preview(page)).toContainText('Confira a proposta')
  expect(await state(page)).toEqual(beforeState)
  expect(await clicks(page)).toEqual(beforeClicks)
  expect(page.url()).toBe(beforeURL)
}

async function command(page, transcript) {
  await prepare(page, transcript)
  await audio(page, 'Confirmar')
  await expect(preview(page)).toHaveCount(0)
  await page.clock.runFor(32)
}

async function openDraft(page) {
  await command(page, 'Abrir registros de Ana Clara')
  await command(page, 'Clicar em Retomar sessão de 2026-10-04')
  await expect(form(page)).toHaveAttribute('data-voice-record', 'draft-ana')
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue('ana')
}

async function assertDraft(page, original) {
  await expect(form(page)).toHaveAttribute('data-voice-record', 'draft-ana')
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue('ana')
  for (const [key, id] of [['observation', 'session-observation'], ['procedures', 'session-procedures'], ['outcomeDecision', 'session-outcome-decision'], ['referralClosure', 'session-referral-closure']]) {
    await expect(form(page).locator(`#${id}`)).toHaveValue(original.drafts[0][key])
  }
  await expect(form(page).getByRole('checkbox', { name: /^Pede ajuda · v1$/ })).toBeChecked()
  await expect(form(page).locator('#indicator-participacao')).toHaveValue('0')
  await expect(form(page).locator('#indicator-note-participacao')).toHaveValue('Nota ana.')
  expect(await state(page)).toEqual(original)
}

test.beforeEach(async ({ page, baseURL }) => {
  const boundary = []
  page.on('pageerror', error => boundary.push(error.message))
  page.on('dialog', async dialog => { boundary.push(`native dialog: ${dialog.type()}`); await dialog.dismiss() })
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) await route.continue()
    else { boundary.push(route.request().url()); await route.abort() }
  })
  page.draftNavigationBoundary = boundary
})

test.afterEach(async ({ page }) => {
  expect(page.draftNavigationBoundary).toEqual([])
  const diagnostics = await page.evaluate(() => {
    const f = window.draftNavigationPCM
    return { writes: f.writes, unexpected: f.unexpected, queued: f.transcripts, count: f.captures.length,
      releases: [f.mediaRequests, f.trackStops, f.contextCloses, f.sourceDisconnects, f.processorDisconnects],
      cleared: f.captureRefs.every(args => args.samples.every(value => value === 0) && args.patientNames.every(value => value === '')) }
  })
  expect(diagnostics.writes).toEqual([])
  expect(diagnostics.unexpected).toEqual([])
  expect(diagnostics.queued).toEqual([])
  expect(diagnostics.releases).toEqual(Array(5).fill(diagnostics.count))
  expect(diagnostics.cleared).toBe(true)
})

for (const action of actions) {
  test(`rascunho PCM: ${action.label} prepara sem ação e confirma destino exato sem writes`, async ({ page }) => {
    await openApp(page)
    const original = await state(page)
    await openDraft(page)
    await assertDraft(page, original)
    const beforeClicks = await clicks(page)
    const beforeURL = page.url()
    const target = action.tag === 'A'
      ? form(page).getByRole('link', { name: action.label, exact: true })
      : page.getByRole('button', { name: action.label, exact: true })
    await expect(target).toBeVisible()
    if (action.tag === 'A') await expect(target).toHaveAttribute('href', `#${action.id}`)
    await prepare(page, `Clicar em ${action.label}`)
    await expect(preview(page)).toContainText(action.label)
    await assertDraft(page, original)
    if (action.focus) await expect(page.locator(`#${action.id}`)).not.toBeFocused()
    await audio(page, 'Confirmar')
    await expect(preview(page)).toHaveCount(0)
    await page.clock.runFor(32)
    expect(await clicks(page)).toEqual([...beforeClicks, {
      tag: action.tag, label: action.label, href: action.tag === 'A' ? `#${action.id}` : null,
      record: 'draft-ana', patientId: 'ana',
    }])
    if (action.tag === 'A') await expect(page).toHaveURL(new RegExp(`#${action.id}$`))
    else expect(page.url()).toBe(beforeURL)
    if (action.focus) await expect(page.locator(`#${action.id}`)).toBeFocused()
    // Non-focusable indicator/actions containers promise hash navigation only.
    await expect(form(page).locator(`#${action.id}`)).toBeVisible()
    await page.clock.runFor(3000)
    await assertDraft(page, original)
  })
}

test('rascunho PCM: alvo de outro paciente e cinco controles indisponíveis recusam sem fallback', async ({ page }) => {
  await openApp(page)
  const original = await state(page)
  await openDraft(page)
  const beforeClicks = await clicks(page)
  const beforeURL = page.url()
  await audio(page, 'Clicar em Escolher comportamentos desta sessão de Bia Fictícia')
  await expect(page.locator('.voice-command-error')).toContainText('Não encontrei')
  await expect(preview(page)).toHaveCount(0)
  await audio(page, 'Confirmar')
  await expect(preview(page)).toHaveCount(0)
  expect(await clicks(page)).toEqual(beforeClicks)
  expect(page.url()).toBe(beforeURL)
  await assertDraft(page, original)
  // Select the other patient via the existing control, but do not resume its draft.
  await command(page, 'Selecionar Paciente para evolução e sessões como Bia Fictícia')
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue('bia')
  await expect(form(page)).toHaveCount(0)
  for (const action of actions) {
    const before = await clicks(page)
    const url = page.url()
    await audio(page, `Clicar em ${action.label}`)
    await expect(page.locator('.voice-command-error')).toContainText('Não encontrei')
    await expect(preview(page)).toHaveCount(0)
    await audio(page, 'Confirmar')
    await expect(preview(page)).toHaveCount(0)
    expect(await clicks(page)).toEqual(before)
    expect(page.url()).toBe(url)
    await expect(form(page)).toHaveCount(0)
    await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue('bia')
    expect(await state(page)).toEqual(original)
  }
  await page.clock.runFor(3000)
  expect(await state(page)).toEqual(original)
})
