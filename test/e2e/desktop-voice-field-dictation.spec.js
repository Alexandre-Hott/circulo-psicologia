import { expect, test } from '@playwright/test'

const fields = [
  { key: 'observation', label: 'Observações descritivas', noun: 'observação' },
  { key: 'procedures', label: 'Procedimentos realizados', noun: 'procedimentos' },
  { key: 'outcomeDecision', label: 'Resultado e decisão', noun: 'resultado' },
  { key: 'referralClosure', label: 'Encaminhamento ou encerramento (opcional)', noun: 'encaminhamento' },
]
const assistant = page => page.getByRole('region', { name: 'Comando do Círculo' })
const form = page => page.getByRole('form', { name: 'Rascunho de sessão', exact: true })
const fieldControl = (page, field = fields[0]) => form(page).getByLabel(field.label, { exact: true })
const snapshot = page => page.evaluate(() => structuredClone(window.fieldDictationShell.state))
const writes = page => page.evaluate(() => structuredClone(window.fieldDictationShell.writes))

// Real app entrypoint, both command routing and Sessions apply handlers. Only
// native IPC/media are simulated: no injected intents, ASR, real vault or device.
async function openApp(page, { allowSave = false, observation, allowContextSave = false } = {}) {
  const time = new Date('2026-10-04T15:00:00Z')
  await page.clock.install({ time })
  await page.clock.pauseAt(time)
  await page.addInitScript(({ allowSave, observation, allowContextSave }) => {
    const clone = value => structuredClone(value)
    const patients = [
      { id: 'ana', name: 'Ana Clara', age: 8, revision: 1, preferredModality: 'Presencial', archivedAt: null },
      { id: 'bia', name: 'Bia Fictícia', age: 9, revision: 1, preferredModality: 'Online', archivedAt: null },
    ]
    const drafts = [
      { id: 'draft-ana', patientId: 'ana', seriesId: 'series-ana', originalDate: '2026-10-04', observation: observation ?? 'Base literal: “Ána”  com apoio.  ', procedures: 'Procedimentos fictícios anteriores.  ', outcomeDecision: 'Resultado fictício anterior.  ', referralClosure: 'Encaminhamento fictício anterior.  ', behaviorIds: [], indicators: [] },
      { id: 'draft-ana-other', patientId: 'ana', seriesId: 'series-ana-other', originalDate: '2026-10-03', observation: 'Outro rascunho de Ana intacto.', procedures: 'Procedimentos concorrentes.', outcomeDecision: 'Resultado concorrente.', referralClosure: 'Encaminhamento concorrente.', behaviorIds: [], indicators: [] },
      { id: 'draft-bia', patientId: 'bia', seriesId: 'series-bia', originalDate: '2026-10-04', observation: 'Rascunho fictício de Bia intacto.', procedures: 'Procedimentos de Bia.', outcomeDecision: 'Resultado de Bia.', referralClosure: 'Encaminhamento de Bia.', behaviorIds: [], indicators: [] },
    ]
    const contexts = []
    const fixture = window.fieldDictationShell = {
      state: { patients, drafts, contexts }, calls: [], writes: [], unexpected: [], catalogReady: false,
      transcript: '', mediaMode: 'silence', ipcMode: 'normal', captureRefs: [],
      mediaRequests: 0, trackStops: 0, contextCloses: 0, sourceDisconnects: 0, processorDisconnects: 0,
    }
    const reads = new Set()
    const catalog = (command, result) => {
      reads.add(command)
      fixture.catalogReady = ['patient_list', 'behavior_list', 'indicator_catalog'].every(name => reads.has(name))
      return clone(result)
    }
    // Short synthetic speech followed by trailing silence finishes naturally.
    // Continuous .1 frames would hit the 12-second cap and intentionally require
    // manual review under the cutoff contract, not native auto-interpretation.
    // Current capture uses AudioContext, not MediaRecorder; both surfaces are
    // stubbed here and no captured WAV or physical device is used.
    class SyntheticAudioContext {
      constructor() { this.sampleRate = 8_000; this.state = 'running'; this.destination = {} }
      createMediaStreamSource() { return { connect() {}, disconnect() { fixture.sourceDisconnects++ } } }
      createScriptProcessor() {
        const processor = { onaudioprocess: null, disconnect() { fixture.processorDisconnects++ } }
        processor.connect = () => queueMicrotask(() => {
          let frames = 0
          const emit = () => {
            if (!processor.onaudioprocess) return
            const amplitude = fixture.mediaMode === 'cutoff' || frames++ < 2 ? 0.1 : 0
            processor.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(4096).fill(amplitude) }, outputBuffer: { getChannelData: () => new Float32Array(4096) } })
            if (processor.onaudioprocess) setTimeout(emit, fixture.mediaMode === 'cutoff' ? 0 : 200)
          }
          emit()
        })
        return processor
      }
      resume() { return Promise.resolve() }
      close() { this.state = 'closed'; fixture.contextCloses++; return Promise.resolve() }
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
      return { getTracks: () => [{ stop() { fixture.trackStops++ } }] }
    } } })
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      fixture.calls.push(clone({ command, args }))
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { available: false, dirty: false }
      if (command === 'plugin:updater|check') return null
      if (command === 'patient_list') return catalog(command, patients)
      if (command === 'behavior_list' || command === 'indicator_catalog') return catalog(command, [])
      if (command === 'session_draft_list') return clone(drafts.filter(item => item.patientId === args.patientId))
      if (command === 'voice_transcribe') {
        fixture.captureRefs.push(args)
        if (fixture.ipcMode === 'error') throw new Error('Falha fictícia de transcrição.')
        if (fixture.ipcMode === 'deferred') return new Promise(resolve => { fixture.resolveTranscript = resolve })
        return fixture.transcript
      }
      if (command === 'case_context_list') return clone(contexts.filter(item => item.patientId === args.patientId))
      if (command === 'case_context_create' && allowContextSave && fixture.writes.length === 0
        && args.patientId === 'ana' && args.demand === 'Demanda fictícia para reload'
        && args.objectives === 'Objetivos fictícios para reload') {
        fixture.writes.push(clone({ command, args }))
        const saved = { id: 'context-reload-ana', ...clone(args), recordedAt: '2026-10-04T16:00:00Z' }
        contexts.unshift(saved)
        return clone(saved)
      }
      if (['agenda_occurrences', 'agenda_list_series', 'agenda_history', 'session_timeline', 'session_addendum_list'].includes(command)) return []
      if (command === 'session_draft_save' && allowSave && args.id === 'draft-ana') {
        fixture.writes.push(clone({ command, args }))
        const index = drafts.findIndex(item => item.id === args.id)
        drafts[index] = { ...drafts[index], ...clone(args.input) }
        return clone(drafts[index])
      }
      fixture.unexpected.push(command)
      if (/(?:create|update|save|start|cancel|finalize|archive|restore)/.test(command)) fixture.writes.push(clone({ command, args }))
      throw new Error(`IPC sem fixture: ${command}`)
    } }
  }, { allowSave, observation, allowContextSave })
  await page.goto('/')
  await expect(assistant(page)).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.fieldDictationShell.catalogReady)).toBe(true)
  await expect(page.locator('.vault-home-preview')).toContainText('Ana Clara')
  await page.clock.runFor(32)
  await command(page, 'Abrir registros de Ana Clara')
  await selectDraft(page, 'draft-ana')
}

async function propose(page, text) {
  expect(text.length).toBeLessThanOrEqual(4600)
  await assistant(page).getByLabel('Seu comando').fill(text)
  await expect(assistant(page).getByLabel('Seu comando')).toHaveValue(text)
  await assistant(page).getByRole('button', { name: 'Preparar rascunho' }).click()
}

async function confirm(page) {
  await propose(page, 'confirmar')
  await page.clock.runFor(32)
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
}

async function command(page, text) {
  await propose(page, text)
  await expect(page.locator('.voice-command-preview')).toBeVisible()
  await confirm(page)
}

async function selectDraft(page, id) {
  const chooser = page.locator('#session-other-drafts')
  await expect(chooser).toBeVisible()
  if (!await chooser.evaluate(element => element.open)) await chooser.locator('summary').click()
  const button = chooser.locator(`button[data-voice-record="draft:${id}"]`)
  await expect(button).toBeVisible()
  await expect(button).toBeEnabled()
  await button.click()
  await expect(form(page)).toHaveAttribute('data-voice-record', id)
  await expect(fieldControl(page)).toBeEnabled()
}

async function expectValues(page, values, id = 'draft-ana', patientId = 'ana') {
  await expect(form(page)).toHaveCount(1)
  await expect(form(page)).toHaveAttribute('data-voice-record', id)
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue(patientId)
  for (const field of fields) await expect(fieldControl(page, field)).toHaveValue(values[field.key])
}

async function expectNoWrites(page, before) {
  expect(await snapshot(page)).toEqual(before)
  expect(await writes(page)).toEqual([])
  expect(await page.evaluate(() => window.fieldDictationShell.unexpected)).toEqual([])
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
}


const body = page => assistant(page).getByLabel('Trecho a acrescentar', { exact: true })
const prepareChunk = page => assistant(page).getByRole('button', { name: 'Preparar trecho', exact: true })
const applyChunk = page => assistant(page).getByRole('button', { name: 'Confirmar acréscimo', exact: true })
const pending = page => form(page).getByText('Alteração de voz ainda não salva. Revise os campos e clique em “Salvar rascunho”.', { exact: true })

async function arm(page, field = fields[0]) {
  const chooser = assistant(page).getByLabel('Campo do rascunho', { exact: true })
  if (!await chooser.isVisible()) await assistant(page).getByRole('button', { name: 'Ditar neste campo', exact: true }).click()
  await expect(chooser).toBeVisible()
  await chooser.selectOption(field.key)
  await expect(body(page)).toHaveCount(1)
  await expect(body(page)).toBeEditable()
  await expect(assistant(page)).toContainText('Ana Clara')
  await expect(assistant(page)).toContainText('draft-ana')
  await expect(assistant(page)).toContainText(field.label)
}

async function prepareLiteral(page, text, field = fields[0]) {
  await arm(page, field)
  await body(page).fill(text)
  await expect(body(page)).toHaveValue(text)
  await prepareChunk(page).click()
  await expect(applyChunk(page)).toBeEnabled()
}

async function applyLiteral(page) {
  await applyChunk(page).click()
  await page.clock.runFor(32)
}

async function capture(page, text, mode = 'silence') {
  await page.evaluate(({ text, mode }) => {
    window.fieldDictationShell.transcript = text
    window.fieldDictationShell.mediaMode = mode
  }, { text, mode })
  const listen = assistant(page).getByRole('button', { name: 'Ouvir e transcrever' })
  await listen.click()
  await page.clock.runFor(1600)
  await expect(listen).toBeEnabled()
  await expect(body(page)).toHaveValue(text)
  if (mode === 'silence') await expect(assistant(page).getByText(/A captura atingiu .*segundos e pode estar incompleta/u)).toHaveCount(0)
}

async function expectCaptureCleanup(page, count, { cutoff = false } = {}) {
  const result = await page.evaluate(() => {
    const f = window.fieldDictationShell
    return {
      captures: f.calls.filter(call => call.command === 'voice_transcribe'),
      counters: [f.mediaRequests, f.trackStops, f.contextCloses, f.sourceDisconnects, f.processorDisconnects],
      erased: f.captureRefs.every(args => args.samples.every(sample => sample === 0) && args.patientNames.every(name => name === '')),
    }
  })
  expect(result.captures).toHaveLength(count)
  expect(result.counters).toEqual([count, count, count, count, count])
  expect(result.erased).toBe(true)
  for (const { args } of result.captures) {
    expect(args.sampleRate).toBe(8000)
    expect(args.patientNames).toEqual(['Ana Clara', 'Bia Fictícia'])
    expect(args.samples.some(value => value !== 0)).toBe(true)
    if (cutoff) expect(args.samples).toHaveLength(96000)
    else expect(args.samples.length / args.sampleRate).toBeLessThan(12)
  }
}

async function noVoiceSave(page, before) {
  await expect(pending(page)).toBeVisible()
  await page.clock.runFor(1200)
  await expectNoWrites(page, before)
}

async function consumed(page) {
  // A completed/invalidated selection cannot silently acquire a fresh snapshot.
  await expect(applyChunk(page)).toHaveCount(0)
  await expect(assistant(page).getByLabel('Campo do rascunho', { exact: true })).toHaveValue('')
  const button = prepareChunk(page)
  await expect(button).toBeDisabled()
  await expect(applyChunk(page)).toHaveCount(0)
}

async function refuseOld(page) {
  // Identity changes may proactively clear the old proposal, or refuse it when
  // the user clicks confirmation. Either must consume the selection.
  if (await applyChunk(page).isVisible() && await applyChunk(page).isEnabled()) await applyChunk(page).click()
  await page.clock.runFor(32)
  await expect(applyChunk(page)).toHaveCount(0)
  await expect(pending(page)).toHaveCount(0)
}

test.beforeEach(async ({ page, baseURL }) => {
  const unexpected = []
  page.on('dialog', async dialog => { unexpected.push('native dialog: ' + dialog.type()); await dialog.dismiss() })
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) await route.continue()
    else { unexpected.push(route.request().url()); await route.abort() }
  })
  page.dictationBoundary = unexpected
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.fieldDictationShell?.unexpected || [])).toEqual([])
  expect(page.dictationBoundary).toEqual([])
})

for (const field of fields) {
  test(field.noun + ': captura literal, confirmação local, Save exato e concorrentes preservados', async ({ page }, testInfo) => {
    await openApp(page, { allowSave: true })
    const before = await snapshot(page)
    const original = before.drafts[0]
    const text = 'Trecho fictício:  Ána.\nnão abrir Agenda\nconfirmar'
    await arm(page, field)
    await capture(page, text)
    await expectValues(page, original)
    await expect(applyChunk(page)).toHaveCount(0)
    await expectNoWrites(page, before)
    await expectCaptureCleanup(page, 1)
    await expect(assistant(page).getByLabel('Seu comando')).toHaveCount(0)
    await prepareChunk(page).click()
    await expect(applyChunk(page)).toBeEnabled()
    await expectValues(page, original)
    await expectNoWrites(page, before)
    if (field.key === 'observation') {
      await expect(page.locator('.vault-voice-review')).toHaveCount(0)
      await page.screenshot({ path: testInfo.outputPath('ditado-destino-previa-ficticia.png'), fullPage: true })
    }
    await applyLiteral(page)
    const expected = { ...original, [field.key]: original[field.key] + ' ' + text }
    await expectValues(page, expected)
    await noVoiceSave(page, before)
    await consumed(page)
    await form(page).getByRole('button', { name: 'Salvar rascunho', exact: true }).click()
    await expect.poll(() => writes(page)).toHaveLength(1)
    const input = Object.fromEntries(fields.map(item => [item.key, expected[item.key]]))
    Object.assign(input, { behaviorIds: [], indicators: [] })
    expect(await writes(page)).toEqual([{ command: 'session_draft_save', args: { id: 'draft-ana', input } }])
    expect(await snapshot(page)).toEqual({ ...before, drafts: [expected, ...before.drafts.slice(1)] })
    await expectValues(page, expected)
    await expect(pending(page)).toHaveCount(0)
  })
}

test('base manual viva e chunk 2 exigem nova seleção explícita sem autosave', async ({ page }) => {
  await openApp(page, { allowSave: true })
  const before = await snapshot(page)
  const manual = 'Base manual fictícia.\nSegunda linha  '
  await fieldControl(page).fill(manual)
  await prepareLiteral(page, 'confirmar')
  await expectValues(page, { ...before.drafts[0], observation: manual })
  await expectNoWrites(page, before)
  await applyLiteral(page)
  const first = manual + ' confirmar'
  await expectValues(page, { ...before.drafts[0], observation: first })
  await noVoiceSave(page, before)
  await consumed(page)
  await expectValues(page, { ...before.drafts[0], observation: first })
  await prepareLiteral(page, 'não abrir Agenda\nSegundo trecho.')
  await applyLiteral(page)
  const expected = { ...before.drafts[0], observation: first + ' não abrir Agenda\nSegundo trecho.' }
  await expectValues(page, expected)
  await noVoiceSave(page, before)
  await form(page).getByRole('button', { name: 'Salvar rascunho', exact: true }).click()
  await expect.poll(() => writes(page)).toHaveLength(1)
  const input = Object.fromEntries(fields.map(field => [field.key, expected[field.key]]))
  Object.assign(input, { behaviorIds: [], indicators: [] })
  expect(await writes(page)).toEqual([{ command: 'session_draft_save', args: { id: 'draft-ana', input } }])
  expect(await snapshot(page)).toEqual({ ...before, drafts: [expected, ...before.drafts.slice(1)] })
  await expectValues(page, expected)
  await expect(pending(page)).toHaveCount(0)
})

test('limite combinado 4000 literal com LF aceita; 4001 recusa sem truncar', async ({ page }) => {
  await openApp(page, { observation: 'Base.' })
  const before = await snapshot(page)
  const text = 'x'.repeat(3992) + '\ny'
  expect(('Base. ' + text).length).toBe(4000)
  await arm(page)
  await body(page).fill(text + 'z')
  await prepareChunk(page).click()
  await expect(applyChunk(page)).toHaveCount(0)
  await expect(assistant(page).getByText(/texto combinado.*4000/u)).toBeVisible()
  await expect(body(page)).toHaveValue(text + 'z')
  await expectValues(page, before.drafts[0])
  await expectNoWrites(page, before)
  await prepareLiteral(page, text)
  await expectValues(page, before.drafts[0])
  await applyLiteral(page)
  await expectValues(page, { ...before.drafts[0], observation: 'Base. ' + text })
  await noVoiceSave(page, before)
})

for (const destination of ['patient-return', 'draft-return', 'remount', 'reload']) {
  test('seleção/proposta obsoleta após ' + destination + ' recusa; nova seleção válida funciona', async ({ page }) => {
    await openApp(page, { allowContextSave: destination === 'reload' })
    const before = await snapshot(page)
    await prepareLiteral(page, 'NÃO APLICAR TRECHO ANTIGO.')
    let expectedState = before
    let expectedWrites = []
    if (destination === 'patient-return') {
      await page.getByLabel('Paciente para evolução e sessões').selectOption('bia')
      await selectDraft(page, 'draft-bia')
      await expectValues(page, before.drafts[2], 'draft-bia', 'bia')
      await page.getByLabel('Paciente para evolução e sessões').selectOption('ana')
      await selectDraft(page, 'draft-ana')
    } else if (destination === 'draft-return') {
      await selectDraft(page, 'draft-ana-other')
      await expectValues(page, before.drafts[1], 'draft-ana-other')
      await selectDraft(page, 'draft-ana')
    } else if (destination === 'remount') {
      await page.getByRole('button', { name: 'Fechar sessões', exact: true }).click()
      await expect(form(page)).toHaveCount(0)
      await page.getByRole('button', { name: 'Abrir sessões', exact: true }).click()
      await page.getByLabel('Paciente para evolução e sessões').selectOption('ana')
      await selectDraft(page, 'draft-ana')
    } else {
      const context = page.getByRole('form', { name: 'Nova revisão do contexto do caso', exact: true })
      const panel = page.locator('details:has(form[aria-label="Nova revisão do contexto do caso"])')
      if (!await panel.evaluate(element => element.open)) await panel.locator('summary').click()
      const input = { patientId: 'ana', demand: 'Demanda fictícia para reload', objectives: 'Objetivos fictícios para reload' }
      await context.getByLabel('Demanda avaliada', { exact: true }).fill(input.demand)
      await context.getByLabel('Objetivos de trabalho', { exact: true }).fill(input.objectives)
      await context.getByRole('button', { name: 'Salvar nova revisão do contexto', exact: true }).click()
      await expect.poll(() => writes(page)).toHaveLength(1)
      await expect(context.getByLabel('Demanda avaliada', { exact: true })).toHaveValue('')
      await expect(fieldControl(page)).toBeEnabled()
      expectedWrites = [{ command: 'case_context_create', args: input }]
      expectedState = { ...before, contexts: [{ id: 'context-reload-ana', ...input, recordedAt: '2026-10-04T16:00:00Z' }] }
    }
    await refuseOld(page)
    await expectValues(page, before.drafts[0])
    await consumed(page)
    await page.clock.runFor(1200)
    expect(await writes(page)).toEqual(expectedWrites)
    expect(await snapshot(page)).toEqual(expectedState)
    await prepareLiteral(page, 'Trecho novo válido.')
    await applyLiteral(page)
    await expectValues(page, { ...before.drafts[0], observation: before.drafts[0].observation + ' Trecho novo válido.' })
    await expect(pending(page)).toBeVisible()
    await page.clock.runFor(1200)
    expect(await writes(page)).toEqual(expectedWrites)
    expect(await snapshot(page)).toEqual(expectedState)
  })
}

for (const restore of [false, true]) {
  test('edição após proposta' + (restore ? ' e restauração do mesmo valor' : '') + ' invalida revisão sem bloquear autosave manual', async ({ page }) => {
    await openApp(page, { allowSave: true })
    const before = await snapshot(page)
    await prepareLiteral(page, 'TRECHO VELHO PROIBIDO.')
    await fieldControl(page).fill('Edição manual fictícia.')
    if (restore) await fieldControl(page).fill(before.drafts[0].observation)
    const current = await fieldControl(page).inputValue()
    await refuseOld(page)
    await expectValues(page, { ...before.drafts[0], observation: current })
    await expectNoWrites(page, before)
    await consumed(page)
    await page.clock.runFor(1200)
    const saved = await writes(page)
    expect(saved.length).toBeLessThanOrEqual(1)
    const input = Object.fromEntries(fields.map(field => [field.key, field.key === 'observation' ? current : before.drafts[0][field.key]]))
    Object.assign(input, { behaviorIds: [], indicators: [] })
    for (const write of saved) expect(write).toEqual({ command: 'session_draft_save', args: { id: 'draft-ana', input } })
    const persisted = saved.length ? { ...before, drafts: [{ ...before.drafts[0], observation: current }, ...before.drafts.slice(1)] } : before
    expect(await snapshot(page)).toEqual(persisted)
    await expect(pending(page)).toHaveCount(0)
    await prepareLiteral(page, 'Novo trecho revisado.')
    await applyLiteral(page)
    await expectValues(page, { ...before.drafts[0], observation: current + ' Novo trecho revisado.' })
    await page.clock.runFor(1200)
    expect(await writes(page)).toEqual(saved)
    expect(await snapshot(page)).toEqual(persisted)
  })
}

test('corte de 12 segundos mantém literal editável sem interpretar, preparar ou aplicar automaticamente', async ({ page }) => {
  await openApp(page)
  const before = await snapshot(page)
  await arm(page)
  await capture(page, 'confirmar\nnão abrir Agenda', 'cutoff')
  await expectCaptureCleanup(page, 1, { cutoff: true })
  await expect(assistant(page).getByText(/A captura atingiu 12 segundos e pode estar incompleta/u)).toBeVisible()
  await expect(applyChunk(page)).toHaveCount(0)
  await expectValues(page, before.drafts[0])
  await expectNoWrites(page, before)
  await body(page).fill('confirmar\nnão abrir Agenda\nComplemento manual literal.')
  await prepareChunk(page).click()
  await expect(applyChunk(page)).toBeEnabled()
  await expectValues(page, before.drafts[0])
  await applyLiteral(page)
  await expectValues(page, { ...before.drafts[0], observation: before.drafts[0].observation + ' confirmar\nnão abrir Agenda\nComplemento manual literal.' })
  await noVoiceSave(page, before)
})

test('descartar trecho consome seleção sem efeitos; próximo trecho exige escolha explícita', async ({ page }) => {
  await openApp(page)
  const before = await snapshot(page)
  await prepareLiteral(page, 'Trecho fictício descartado.')
  await assistant(page).getByRole('button', { name: 'Descartar trecho', exact: true }).click()
  await consumed(page)
  await expectValues(page, before.drafts[0])
  await expect(pending(page)).toHaveCount(0)
  await page.clock.runFor(1200)
  await expectNoWrites(page, before)
  await prepareLiteral(page, 'Somente este trecho novo.')
  await applyLiteral(page)
  await expectValues(page, { ...before.drafts[0], observation: before.drafts[0].observation + ' Somente este trecho novo.' })
  await noVoiceSave(page, before)
})

test('erro IPC descarta proposta antiga sem efeitos; destino válido permite nova tentativa explícita', async ({ page }) => {
  await openApp(page)
  const before = await snapshot(page)
  await prepareLiteral(page, 'PROPOSTA ANTERIOR NÃO DEVE SER REAPLICADA.')
  await page.evaluate(() => { window.fieldDictationShell.ipcMode = 'error' })
  await assistant(page).getByRole('button', { name: 'Ouvir e transcrever' }).click()
  await page.clock.runFor(1600)
  await expect(assistant(page).getByText('Falha fictícia de transcrição.', { exact: true })).toBeVisible()
  await expectCaptureCleanup(page, 1)
  await expect(applyChunk(page)).toHaveCount(0)
  await expectValues(page, before.drafts[0])
  await page.clock.runFor(1200)
  await expectNoWrites(page, before)
  await expect(pending(page)).toHaveCount(0)

  // A transcription error alone does not change destination identity/revision.
  // It discards the old proposal, not necessarily the still-valid selection.
  // Retry must be explicit and pass the real capture/prepare/apply validators.
  const chooser = assistant(page).getByLabel('Campo do rascunho', { exact: true })
  if (await chooser.inputValue() !== 'observation') await arm(page)
  await page.evaluate(() => { window.fieldDictationShell.ipcMode = 'normal' })
  const retry = 'Trecho fictício da nova tentativa.'
  await capture(page, retry)
  await expectCaptureCleanup(page, 2)
  await expect(applyChunk(page)).toHaveCount(0)
  await expectValues(page, before.drafts[0])
  await expectNoWrites(page, before)
  await prepareChunk(page).click()
  await expect(applyChunk(page)).toBeEnabled()
  await expectValues(page, before.drafts[0])
  await expectNoWrites(page, before)
  await applyLiteral(page)
  await expectValues(page, { ...before.drafts[0], observation: before.drafts[0].observation + ' ' + retry })
  await noVoiceSave(page, before)
  await consumed(page)
})

test('abort durante captura ao sair da área limpa recursos e não alcança outro rascunho', async ({ page }) => {
  await openApp(page)
  const before = await snapshot(page)
  await arm(page)
  await assistant(page).getByRole('button', { name: 'Ouvir e transcrever' }).click()
  await expect.poll(() => page.evaluate(() => window.fieldDictationShell.mediaRequests)).toBe(1)
  await page.clock.runFor(200)
  await page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Pacientes', exact: true }).click()
  await expect(form(page)).toHaveCount(0)
  await page.clock.runFor(32)
  await page.getByRole('button', { name: 'Abrir sessões', exact: true }).click()
  await page.getByLabel('Paciente para evolução e sessões').selectOption('bia')
  await selectDraft(page, 'draft-bia')
  await expectValues(page, before.drafts[2], 'draft-bia', 'bia')
  await page.clock.runFor(1600)
  await expect(applyChunk(page)).toHaveCount(0)
  expect(await page.evaluate(() => {
    const f = window.fieldDictationShell
    return [f.calls.filter(call => call.command === 'voice_transcribe').length, f.trackStops, f.contextCloses, f.sourceDisconnects, f.processorDisconnects]
  })).toEqual([0, 1, 1, 1, 1])
  await expectNoWrites(page, before)
  await page.getByLabel('Paciente para evolução e sessões').selectOption('ana')
  await selectDraft(page, 'draft-ana')
  await consumed(page)
  await expectValues(page, before.drafts[0])
  await expect(pending(page)).toHaveCount(0)
})

test('resposta IPC tardia após Ana → Bia → Ana não revive seleção nem aplica texto antigo', async ({ page }) => {
  await openApp(page)
  const before = await snapshot(page)
  await arm(page)
  await page.evaluate(() => { window.fieldDictationShell.ipcMode = 'deferred' })
  await assistant(page).getByRole('button', { name: 'Ouvir e transcrever' }).click()
  await page.clock.runFor(1600)
  await expect.poll(() => page.evaluate(() => typeof window.fieldDictationShell.resolveTranscript)).toBe('function')
  await page.getByLabel('Paciente para evolução e sessões').selectOption('bia')
  await selectDraft(page, 'draft-bia')
  await expectValues(page, before.drafts[2], 'draft-bia', 'bia')
  await page.getByLabel('Paciente para evolução e sessões').selectOption('ana')
  await selectDraft(page, 'draft-ana')
  await page.evaluate(() => window.fieldDictationShell.resolveTranscript('NÃO APLICAR RESPOSTA TARDIA.'))
  await page.clock.runFor(1200)
  await expectValues(page, before.drafts[0])
  await expect(applyChunk(page)).toHaveCount(0)
  if (await body(page).isVisible()) await expect(body(page)).not.toHaveValue('NÃO APLICAR RESPOSTA TARDIA.')
  await expectCaptureCleanup(page, 1)
  await consumed(page)
  await expectNoWrites(page, before)
  await expect(pending(page)).toHaveCount(0)
})
