import { expect, test } from '@playwright/test'
import { clinicalDictationFields } from '../../src/clinicalFieldDictation.js'

// RED78: real App/DesktopVault/Sessions/VoiceCommandCenter and gateway.
// Only native IPC/media are simulated. No ASR, profile, microphone, injected
// intents, handler mocks, DOM forwarding, production changes or real data.
test.describe.configure({ mode: 'default', timeout: 25000 })
const fields = Object.entries(clinicalDictationFields).map(([key, label]) => ({ key, label }))
const center = page => page.getByRole('region', { name: 'Comando do Círculo', exact: true })
const form = page => page.getByRole('form', { name: 'Rascunho de sessão', exact: true })
const field = (page, item = fields[0]) => form(page).getByLabel(item.label, { exact: true })
const body = page => center(page).getByLabel('Trecho a acrescentar', { exact: true })
const picker = page => center(page).getByLabel('Campo do rascunho', { exact: true })
const listenCommand = page => center(page).getByRole('button', { name: /Ouvir comando/ })
const listenChunk = page => center(page).getByRole('button', { name: /Ouvir trecho/ })
const applyChunk = page => center(page).getByRole('button', { name: 'Confirmar acréscimo', exact: true })
const prepareChunk = page => center(page).getByRole('button', { name: 'Preparar trecho', exact: true })
const state = page => page.evaluate(() => structuredClone(window.localDictation.state))
const writes = page => page.evaluate(() => structuredClone(window.localDictation.writes))
const counts = page => page.evaluate(() => {
  const f = window.localDictation
  return { requests: f.mediaRequests, ipc: f.calls.filter(call => call.command === 'voice_transcribe').length,
    stops: f.trackStops, closes: f.contextCloses, sources: f.sourceDisconnects, processors: f.processorDisconnects }
})

async function openApp(page, { observation, allowSave = false } = {}) {
  const time = new Date('2026-10-04T15:00:00Z')
  await page.clock.install({ time })
  await page.clock.pauseAt(time)
  await page.addInitScript(({ observation, allowSave }) => {
    const clone = value => structuredClone(value)
    const patients = ['ana', 'bia'].map((id, index) => ({ id, name: index ? 'Bia Fictícia' : 'Ana Clara', age: 8 + index, revision: 1, preferredModality: 'Presencial', archivedAt: null }))
    const drafts = [
      { id: 'draft-ana', patientId: 'ana', seriesId: 'series-ana', originalDate: '2026-10-04', observation: observation ?? 'Base literal: “Ána”  com apoio.  ', procedures: 'Procedimentos fictícios anteriores.  ', outcomeDecision: 'Resultado fictício anterior.  ', referralClosure: 'Encaminhamento fictício anterior.  ', behaviorIds: [], indicators: [] },
      { id: 'draft-ana-other', patientId: 'ana', seriesId: 'series-ana-other', originalDate: '2026-10-03', observation: 'Outro rascunho intacto.', procedures: 'Outro procedimento.', outcomeDecision: 'Outro resultado.', referralClosure: 'Outro encaminhamento.', behaviorIds: [], indicators: [] },
      { id: 'draft-bia', patientId: 'bia', seriesId: 'series-bia', originalDate: '2026-10-04', observation: 'Rascunho de Bia intacto.', procedures: 'Procedimento de Bia.', outcomeDecision: 'Resultado de Bia.', referralClosure: 'Encaminhamento de Bia.', behaviorIds: [], indicators: [] },
    ]
    const f = window.localDictation = { state: { patients, drafts }, calls: [], writes: [], unexpected: [], catalogReady: false,
      plans: [], pending: {}, captureRefs: [], captureIPC: [], mediaRequests: 0, trackStops: 0, contextCloses: 0, sourceDisconnects: 0, processorDisconnects: 0 }
    const reads = new Set()
    const catalog = (command, result) => {
      reads.add(command)
      f.catalogReady = ['patient_list', 'behavior_list', 'indicator_catalog'].every(item => reads.has(item))
      return clone(result)
    }
    // Purpose is NOT supplied by the fixture: actual UI selects command/chunk.
    // Each synthetic capture keeps its own plan, even if context changes later.
    class SyntheticAudioContext {
      constructor() { this.sampleRate = 8000; this.state = 'running'; this.destination = {} }
      createMediaStreamSource(stream) {
        this.plan = stream.plan
        return { connect() {}, disconnect() { f.sourceDisconnects++ } }
      }
      createScriptProcessor() {
        const plan = this.plan
        const processor = { onaudioprocess: null, disconnect() { f.processorDisconnects++ } }
        processor.connect = () => queueMicrotask(() => {
          let frames = 0
          const emit = () => {
            if (!processor.onaudioprocess) return
            const amplitude = plan.cutoff || frames++ < 2 ? 0.1 : 0
            processor.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(4096).fill(amplitude) }, outputBuffer: { getChannelData: () => new Float32Array(4096) } })
            if (processor.onaudioprocess) setTimeout(emit, plan.cutoff ? 0 : 200)
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
      const plan = { ...f.plans.shift(), capture: ++f.mediaRequests }
      if (typeof plan.text !== 'string') { f.unexpected.push('capture without synthetic plan'); throw new Error('Captura sem plano sintético') }
      f.captureIPC.push(plan)
      return { plan, getTracks: () => [{ stop() { f.trackStops++ } }] }
    } } })
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      f.calls.push(clone({ command, args }))
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { available: false, dirty: false }
      if (command === 'plugin:updater|check') return null
      if (command === 'patient_list') return catalog(command, patients)
      if (command === 'behavior_list' || command === 'indicator_catalog') return catalog(command, [])
      if (command === 'session_draft_list') return clone(drafts.filter(item => item.patientId === args.patientId))
      if (['agenda_occurrences', 'agenda_list_series', 'agenda_history', 'session_timeline', 'session_addendum_list', 'case_context_list', 'related_party_list'].includes(command)) return []
      if (command === 'voice_transcribe') {
        const plan = f.captureIPC.shift()
        f.captureRefs.push(args)
        if (!plan) { f.unexpected.push('transcription without capture'); throw new Error('IPC sem captura sintética') }
        if (plan.deferred) return new Promise((resolve, reject) => { f.pending[plan.capture] = { resolve, reject } })
        if (plan.error) throw new Error(plan.error)
        return plan.text
      }
      if (command === 'session_draft_save' && allowSave && args.id === 'draft-ana') {
        f.writes.push(clone({ command, args }))
        const index = drafts.findIndex(item => item.id === args.id)
        drafts[index] = { ...drafts[index], ...clone(args.input) }
        return clone(drafts[index])
      }
      f.unexpected.push(command)
      if (/(create|update|save|start|cancel|finalize|archive|restore|backup)/.test(command)) f.writes.push(clone({ command, args }))
      throw new Error('IPC sem fixture: ' + command)
    } }
  }, { observation, allowSave })
  await page.goto('/')
  await expect(center(page)).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.localDictation.catalogReady)).toBe(true)
  await page.clock.runFor(32)
  await propose(page, 'Abrir registros de Ana Clara')
  await expect(center(page).locator('.voice-command-preview')).toBeVisible()
  await propose(page, 'confirmar')
  await page.clock.runFor(32)
  await selectDraft(page, 'draft-ana')
}

async function propose(page, text) {
  // Actual existing Ctrl+Enter textarea handler, same interpret as Prepare.
  const input = center(page).getByLabel('Seu comando', { exact: true })
  await input.fill(text)
  await input.press('Control+Enter')
  await page.clock.runFor(32)
}
async function selectDraft(page, id) {
  const chooser = page.locator('#session-other-drafts')
  await expect(chooser).toBeVisible()
  if (!await chooser.evaluate(element => element.open)) await chooser.locator('summary').click()
  await chooser.locator(`button[data-voice-record="draft:${id}"]`).click()
  await expect(form(page)).toHaveAttribute('data-voice-record', id)
  await expect(field(page)).toBeEnabled()
}
async function arm(page, item = fields[0]) {
  await propose(page, 'Ditar neste campo')
  await expect(body(page)).toBeEditable()
  await propose(page, 'Selecionar campo ' + item.label)
  await expect(picker(page)).toHaveValue(item.key)
  await expect(center(page).locator('.voice-dictation-target')).toContainText(item.label)
}
async function values(page, expected, id = 'draft-ana') {
  await expect(form(page)).toHaveAttribute('data-voice-record', id)
  for (const item of fields) await expect(field(page, item)).toHaveValue(expected[item.key])
}
async function noWrites(page, before) {
  expect(await state(page)).toEqual(before)
  expect(await writes(page)).toEqual([])
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
}
async function noAutosave(page, before) {
  await expect(form(page)).toContainText('Alteração de voz ainda não salva.')
  await page.clock.runFor(1200)
  await noWrites(page, before)
}
async function queue(page, plan) {
  await page.evaluate(plan => window.localDictation.plans.push(plan), plan)
}
async function capture(page, channel, text, options = {}) {
  const before = (await counts(page)).requests
  await queue(page, { text, ...options })
  await (channel === 'command' ? listenCommand(page) : listenChunk(page)).click()
  await expect.poll(async () => (await counts(page)).requests).toBe(before + 1)
  await page.clock.runFor(1600)
  if (options.deferred) await expect.poll(() => page.evaluate(id => Boolean(window.localDictation.pending[id]), before + 1)).toBe(true)
  else await expect(listenCommand(page)).toBeEnabled()
  return before + 1
}
async function finish(page, id, { text = '', error } = {}) {
  await page.evaluate(({ id, text, error }) => {
    const pending = window.localDictation.pending[id]
    if (!pending) throw new Error('IPC sintético pendente ausente: ' + id)
    delete window.localDictation.pending[id]
    if (error) pending.reject(new Error(error))
    else pending.resolve(text)
  }, { id, text, error })
  await page.clock.runFor(32)
}
async function cleanup(page, count, { cutoff = false } = {}) {
  expect(await counts(page)).toEqual({ requests: count, ipc: count, stops: count, closes: count, sources: count, processors: count })
  const captures = await page.evaluate(() => {
    const f = window.localDictation
    return { calls: f.calls.filter(item => item.command === 'voice_transcribe'), erased: f.captureRefs.every(args => args.samples.every(sample => sample === 0) && args.patientNames.every(name => name === '')) }
  })
  expect(captures.erased).toBe(true)
  for (const { args } of captures.calls) {
    expect(args.sampleRate).toBe(8000)
    expect(args.samples.some(sample => sample !== 0)).toBe(true)
    expect(args.patientNames).toEqual(['Ana Clara', 'Bia Fictícia'])
    if (cutoff) expect(args.samples).toHaveLength(96000)
    else expect(args.samples.length).toBeLessThan(96000)
  }
}
async function consumed(page, literal) {
  await expect(body(page)).toHaveValue(literal)
  await expect(picker(page)).toHaveValue('')
  await expect(applyChunk(page)).toHaveCount(0)
  await expect(prepareChunk(page)).toBeDisabled()
}

// Read-only observation of the real component's committed prop. Never invoke
// callbacks or write React state. This verifies the actual intent shape without
// introducing a host callback double or adding production test metadata.
async function realPendingIntent(page) {
  return center(page).evaluate(region => {
    const key = Object.keys(region).find(key => key.startsWith('__reactFiber$'))
    let root = region[key]
    while (root?.return) root = root.return
    // Bailouts can share children whose return pointers reach the current root
    // through an obsolete branch. Derive ancestry from actual child/sibling
    // edges of FiberRoot.current and bind it to this exact region DOM node.
    const stack = [{ fiber: root?.stateNode?.current, path: [] }]
    let committedPath
    while (stack.length) {
      const { fiber, path } = stack.pop()
      if (!fiber) continue
      const nextPath = [...path, fiber]
      if (fiber.stateNode === region) { committedPath = nextPath; break }
      for (let child = fiber.child; child; child = child.sibling) stack.push({ fiber: child, path: nextPath })
    }
    if (!committedPath) throw new Error('Região do VoiceCommandCenter não encontrada na árvore React atual')
    for (const fiber of committedPath.reverse()) {
      if (typeof fiber.memoizedProps?.prepareDictation === 'function') return structuredClone(fiber.memoizedProps.pendingIntent)
    }
    throw new Error('Props reais do VoiceCommandCenter não encontradas')
  })
}
async function prepareLocal(page, item, text) {
  await body(page).fill(text)
  await propose(page, 'Preparar trecho')
  await expect(applyChunk(page)).toBeEnabled()
  const intent = await realPendingIntent(page)
  expect(intent).toMatchObject({ type: 'session.draft.update', target: { patientId: 'ana', sessionDraftId: 'draft-ana' },
    patch: { field: item.key, operation: 'append', value: text, separator: ' ' },
    dictationSelection: { field: item.key, patientId: 'ana', sessionDraftId: 'draft-ana', label: item.label, patientName: 'Ana Clara' } })
  expect(intent.dictationSelection.baseValue).toBe(intent.patch.baseValue)
  expect(intent.dictationSelection.epoch).toBe(intent.patch.baseEpoch)
  expect(intent.dictationSelection.revision).toBe(intent.patch.baseRevision)
  expect(intent.dictationSelection.lifecycle).toEqual(expect.any(String))
  await expect(page.locator('.vault-voice-review')).toHaveCount(0)
  return intent
}

test.beforeEach(async ({ page, baseURL }) => {
  page.localBoundary = []
  page.on('dialog', async dialog => { page.localBoundary.push(dialog.type()); await dialog.dismiss() })
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) await route.continue()
    else { page.localBoundary.push(route.request().url()); await route.abort() }
  })
})
test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.localDictation?.unexpected || [])).toEqual([])
  expect(page.localBoundary).toEqual([])
})

test('RED78 channels: rascunho real válido expõe Ouvir comando e destino limita Ouvir trecho', async ({ page }) => {
  await openApp(page)
  const before = await state(page)
  await values(page, before.drafts[0])
  // FIRST RED: against 77, the existing region/input/form are mounted; the
  // missing new command-channel button is the intentional product assertion.
  await expect(listenCommand(page)).toHaveCount(1)
  await expect(listenCommand(page)).toBeEnabled()
  await propose(page, 'Ditar neste campo')
  await expect(listenCommand(page)).toBeEnabled()
  await expect(listenChunk(page)).toBeDisabled()
  expect(fields.map(item => item.key)).toEqual(['observation', 'procedures', 'outcomeDecision', 'referralClosure'])
  expect(await picker(page).locator('option').evaluateAll(options => options.filter(option => option.value).map(option => [option.value, option.textContent]))).toEqual(fields.map(item => [item.key, item.label]))
  await propose(page, 'Selecionar campo Observações descritivas')
  await expect(listenChunk(page)).toBeEnabled()
  await propose(page, 'Usar comandos')
  await expect(center(page).getByLabel('Seu comando', { exact: true })).toBeEditable()
  await noWrites(page, before)
  expect((await counts(page)).requests).toBe(0)
})

for (const item of fields) {
  test(item.key + ': corpo literal + controles digitados usam append real e Save manual exato', async ({ page }) => {
    await openApp(page, { allowSave: true })
    const before = await state(page)
    const text = '  Ána literal.\nconfirmar\ndescartar trecho\nUsar comandos  '
    await arm(page, item)
    let captureCount = 1
    if (item.key === 'referralClosure') {
      // Exact full spoken forms; canonical UI label remains authoritative.
      // Synthetic transcripts only: no new ASR or shorthand field aliases.
      for (const spoken of ['Encaminhamento ou encerramento', 'Encaminhamento ou encerramento opcional']) {
        await propose(page, 'Selecionar campo ' + fields[0].label)
        await expect(picker(page)).toHaveValue(fields[0].key)
        await expect(center(page).locator('.voice-dictation-target')).toContainText(fields[0].label)
        await capture(page, 'command', 'Selecionar campo ' + spoken)
        captureCount++
        await expect(picker(page)).toHaveValue(item.key)
        await expect(center(page).locator('.voice-dictation-target')).toContainText(item.label)
        await values(page, before.drafts[0])
        await noWrites(page, before)
      }
    }
    await capture(page, 'chunk', text)
    await expect(body(page)).toHaveValue(text)
    await expect(applyChunk(page)).toHaveCount(0)
    await values(page, before.drafts[0])
    await prepareLocal(page, item, text)
    await values(page, before.drafts[0])
    await noWrites(page, before)
    await propose(page, 'Confirmar acréscimo')
    const expected = { ...before.drafts[0], [item.key]: before.drafts[0][item.key] + ' ' + text }
    await values(page, expected)
    await consumed(page, text)
    await noAutosave(page, before)
    await cleanup(page, captureCount)
    await form(page).getByRole('button', { name: 'Salvar rascunho', exact: true }).click()
    const input = Object.fromEntries(fields.map(item => [item.key, expected[item.key]]))
    Object.assign(input, { behaviorIds: [], indicators: [] })
    await expect.poll(() => writes(page)).toEqual([{ command: 'session_draft_save', args: { id: 'draft-ana', input } }])
    expect(await state(page)).toEqual({ ...before, drafts: [expected, ...before.drafts.slice(1)] })
  })
}

test('áudio comando seleciona campo/prepara; segunda captura Confirmar acrescenta sem Save', async ({ page }) => {
  await openApp(page)
  const before = await state(page)
  await capture(page, 'command', 'Ditar neste campo')
  await capture(page, 'command', 'Selecionar campo Procedimentos realizados')
  await expect(picker(page)).toHaveValue('procedures')
  await capture(page, 'chunk', 'confirmar\nDescartar trecho')
  await expect(body(page)).toHaveValue('confirmar\nDescartar trecho')
  await capture(page, 'command', 'Preparar trecho')
  await expect(applyChunk(page)).toBeEnabled()
  const proposal = await realPendingIntent(page)
  expect(proposal.patch).toMatchObject({ field: 'procedures', operation: 'append', value: 'confirmar\nDescartar trecho' })
  // This new command capture must preserve the pending local proposal until
  // its recognized bare Confirmar passes the local dispatcher, not generic apply.
  await capture(page, 'command', 'Confirmar')
  await values(page, { ...before.drafts[0], procedures: before.drafts[0].procedures + ' confirmar\nDescartar trecho' })
  await noAutosave(page, before)
  await cleanup(page, 5)
})

test('descartar digitado/áudio preserva corpo e consome destino; fora do modo não há escape', async ({ page }) => {
  await openApp(page)
  const before = await state(page)
  for (const via of ['typed', 'audio']) {
    await arm(page)
    await prepareLocal(page, fields[0], 'confirmar\ndescartar trecho')
    if (via === 'typed') await propose(page, 'Descartar trecho')
    else await capture(page, 'command', 'Descartar trecho')
    await consumed(page, 'confirmar\ndescartar trecho')
    await propose(page, 'confirmar')
    await propose(page, 'Preparar trecho')
    await values(page, before.drafts[0])
    await noWrites(page, before)
    await propose(page, 'Usar comandos')
    await propose(page, 'Confirmar acréscimo')
    await values(page, before.drafts[0])
    await noWrites(page, before)
  }
  await cleanup(page, 1)
})

test('modo local consome não locais; confirmação explícita inativa não aplica proposta externa', async ({ page }) => {
  await openApp(page)
  const before = await state(page)
  await propose(page, 'Abrir Agenda')
  expect((await realPendingIntent(page)).type).toBe('workspace.open')
  await propose(page, 'Confirmar acréscimo')
  await values(page, before.drafts[0])
  await noWrites(page, before)
  await arm(page)
  const proposal = await prepareLocal(page, fields[0], 'Corpo local preservado.')
  await capture(page, 'command', 'Abrir Agenda')
  expect(await realPendingIntent(page)).toEqual(proposal)
  await propose(page, 'Selecionar campo campo inexistente')
  expect(await realPendingIntent(page)).toEqual(proposal)
  await expect(page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Abrir sessões', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(body(page)).toHaveValue('Corpo local preservado.')
  await values(page, before.drafts[0])
  await noWrites(page, before)
  await propose(page, 'Descartar trecho')
  await propose(page, 'Confirmar')
  await values(page, before.drafts[0])
  await propose(page, 'Usar comandos')
  await propose(page, 'Abrir Agenda')
  await propose(page, 'Confirmar') // outside mode bare Confirmar remains generic
  await expect(page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Abrir Agenda', exact: true })).toHaveAttribute('aria-current', 'page')
  await noWrites(page, before)
})

test('erro/ausência de transcrição de comando preservam proposta local e corpo; confirmação explícita funciona', async ({ page }) => {
  await openApp(page)
  const before = await state(page)
  await arm(page)
  const proposal = await prepareLocal(page, fields[0], 'Proposta local preservada.')
  for (const response of [{ error: 'Falha sintética command-channel.' }, { text: '' }]) {
    const id = await capture(page, 'command', '', { deferred: true })
    expect(await realPendingIntent(page)).toEqual(proposal)
    await finish(page, id, response)
    await expect(listenCommand(page)).toBeEnabled()
    expect(await realPendingIntent(page)).toEqual(proposal)
    await expect(body(page)).toHaveValue('Proposta local preservada.')
    await values(page, before.drafts[0])
    await noWrites(page, before)
  }
  await propose(page, 'Confirmar acréscimo')
  await values(page, { ...before.drafts[0], observation: before.drafts[0].observation + ' Proposta local preservada.' })
  await noAutosave(page, before)
  await cleanup(page, 2)
})

for (const transcript of ['Confirmar', 'Preparar trecho']) {
  test('corte comando 12s ' + transcript + ': revisão editável não confirma nem prepara automaticamente', async ({ page }) => {
    await openApp(page)
    const before = await state(page)
    await arm(page)
    if (transcript === 'Confirmar') await prepareLocal(page, fields[0], 'Só após revisão manual.')
    else await body(page).fill('Só após revisão manual.')
    const proposal = await realPendingIntent(page)
    await capture(page, 'command', transcript, { cutoff: true })
    await expect(center(page)).toContainText('pode estar incompleta')
    await expect(center(page).getByLabel('Seu comando', { exact: true })).toHaveValue(transcript)
    expect(await realPendingIntent(page)).toEqual(proposal)
    await values(page, before.drafts[0])
    await noWrites(page, before)
    await cleanup(page, 1, { cutoff: true })
    await propose(page, transcript)
    if (transcript === 'Confirmar') {
      await values(page, { ...before.drafts[0], observation: before.drafts[0].observation + ' Só após revisão manual.' })
      await noAutosave(page, before)
    } else {
      await expect(applyChunk(page)).toBeEnabled()
      await values(page, before.drafts[0])
      await noWrites(page, before)
    }
  })
}

test('corte trecho é literal e editável; 4000 UTF16 com separador aceita, 4001 recusa sem truncar', async ({ page }) => {
  await openApp(page, { observation: 'B' })
  const before = await state(page)
  await arm(page)
  const text = '😀'.repeat(1997) + '\nabc'
  expect(('B ' + text).length).toBe(4000)
  await capture(page, 'chunk', text + 'x', { cutoff: true })
  await expect(body(page)).toHaveValue(text + 'x')
  await expect(center(page)).toContainText('pode estar incompleta')
  await expect(applyChunk(page)).toHaveCount(0)
  await propose(page, 'Preparar trecho')
  await expect(applyChunk(page)).toHaveCount(0)
  await expect(center(page)).toContainText(/4000/)
  await expect(body(page)).toHaveValue(text + 'x')
  await values(page, before.drafts[0])
  await noWrites(page, before)
  await prepareLocal(page, fields[0], text)
  await propose(page, 'Confirmar')
  await values(page, { ...before.drafts[0], observation: 'B ' + text })
  await noAutosave(page, before)
  await cleanup(page, 1, { cutoff: true })
})

for (const change of ['field-change', 'erase-body']) {
  test('proposta local stale após ' + change + ' não aplica nem confirma genericamente', async ({ page }) => {
    await openApp(page)
    const before = await state(page)
    await arm(page)
    await prepareLocal(page, fields[0], 'TRECHO OBSOLETO PROIBIDO.')
    if (change === 'field-change') {
      await propose(page, 'Selecionar campo Resultado e decisão')
      await expect(picker(page)).toHaveValue('outcomeDecision')
    } else await body(page).fill('')
    await propose(page, 'Confirmar acréscimo')
    await propose(page, 'Confirmar')
    await values(page, before.drafts[0])
    await noWrites(page, before)
    await expect(form(page)).not.toContainText('Alteração de voz ainda não salva.')
  })
}

test('proposta preparada draft A → outro draft de Ana → A invalida lifecycle e ambas confirmações recusam', async ({ page }) => {
  await openApp(page)
  const before = await state(page)
  const text = 'PROPOSTA ANTERIOR AO ABA PROIBIDA.'
  await arm(page)
  await prepareLocal(page, fields[0], text)
  await values(page, before.drafts[0])
  await noWrites(page, before)
  await selectDraft(page, 'draft-ana-other')
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue('ana')
  await values(page, before.drafts[1], 'draft-ana-other')
  await selectDraft(page, 'draft-ana')
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue('ana')
  await values(page, before.drafts[0])
  expect(await realPendingIntent(page)).toBeNull()
  await consumed(page, text)
  for (const confirmation of ['Confirmar acréscimo', 'Confirmar']) {
    await propose(page, confirmation)
    await values(page, before.drafts[0])
    await noWrites(page, before)
    expect(await realPendingIntent(page)).toBeNull()
    await expect(applyChunk(page)).toHaveCount(0)
    await expect(form(page)).not.toContainText('Alteração de voz ainda não salva.')
  }
  await page.clock.runFor(1200)
  await values(page, before.drafts[0])
  await noWrites(page, before)
  expect((await counts(page)).requests).toBe(0)
})

test('editar body durante IPC de trecho no mesmo destino preserva edição e invalida resposta antiga', async ({ page }) => {
  await openApp(page)
  const before = await state(page)
  await arm(page)
  await body(page).fill('Corpo antes da captura.')
  const id = await capture(page, 'chunk', 'RESPOSTA ANTIGA NÃO PODE SOBRESCREVER.', { deferred: true })
  await expect(form(page)).toHaveAttribute('data-voice-record', 'draft-ana')
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue('ana')
  await expect(picker(page)).toHaveValue('observation')
  const edited = 'Edição durante IPC.\nconfirmar\ndescartar trecho  '
  await body(page).fill(edited)
  await finish(page, id, { text: 'RESPOSTA ANTIGA NÃO PODE SOBRESCREVER.' })
  await expect(listenCommand(page)).toBeEnabled()
  await expect(body(page)).toHaveValue(edited)
  expect(await realPendingIntent(page)).toBeNull()
  await expect(applyChunk(page)).toHaveCount(0)
  await values(page, before.drafts[0])
  await expect(form(page)).not.toContainText('Alteração de voz ainda não salva.')
  await page.clock.runFor(1200)
  await expect(body(page)).toHaveValue(edited)
  await values(page, before.drafts[0])
  await noWrites(page, before)
  await cleanup(page, 1)
})

test('resposta de trecho tardia Ana → Bia → Ana não ressuscita seleção nem aplica body antigo', async ({ page }) => {
  await openApp(page)
  const before = await state(page)
  await arm(page)
  await body(page).fill('Corpo atual preservado.')
  const id = await capture(page, 'chunk', 'RESPOSTA TARDIA PROIBIDA.', { deferred: true })
  await page.getByLabel('Paciente para evolução e sessões').selectOption('bia')
  await selectDraft(page, 'draft-bia')
  await page.getByLabel('Paciente para evolução e sessões').selectOption('ana')
  await selectDraft(page, 'draft-ana')
  await finish(page, id, { text: 'RESPOSTA TARDIA PROIBIDA.' })
  await expect(body(page)).toHaveValue('Corpo atual preservado.')
  await expect(picker(page)).toHaveValue('')
  await propose(page, 'Confirmar')
  await values(page, before.drafts[0])
  await noWrites(page, before)
  await cleanup(page, 1)
})

test('owner síncrono impede dois cliques e atalhos no mesmo task; purpose permanece trecho', async ({ page }) => {
  await openApp(page)
  const before = await state(page)
  await arm(page)
  await queue(page, { text: 'Confirmar', deferred: true })
  // Deliberately same browser task: actual click/keydown listeners, before React
  // can commit transcribing state. No handler calls, force or injected intents.
  await listenChunk(page).evaluate(button => {
    button.click()
    button.click()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', code: 'KeyM', ctrlKey: true, altKey: true, bubbles: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', ctrlKey: true, shiftKey: true, bubbles: true }))
  })
  await page.clock.runFor(1600)
  await expect.poll(() => page.evaluate(() => Boolean(window.localDictation.pending[1]))).toBe(true)
  expect((await counts(page)).requests).toBe(1)
  expect((await counts(page)).ipc).toBe(1)
  await expect(listenCommand(page)).toBeDisabled()
  await finish(page, 1, { text: 'Confirmar' })
  await expect(body(page)).toHaveValue('Confirmar')
  await expect(applyChunk(page)).toHaveCount(0)
  await values(page, before.drafts[0])
  await noWrites(page, before)
  await cleanup(page, 1)
  // CtrlAltKeyM always selects commands, even in dictation mode.
  await queue(page, { text: 'Selecionar campo Procedimentos realizados' })
  await page.keyboard.press('Control+Alt+KeyM')
  await page.clock.runFor(1600)
  await expect(picker(page)).toHaveValue('procedures')
  await expect(body(page)).toHaveValue('Confirmar')
  await cleanup(page, 2)
})

test('CtrlShiftSpace é contextual; CtrlAltKeyM ouve comando nos dois modos sem reinterpretar corpo', async ({ page }) => {
  await openApp(page)
  const before = await state(page)
  await queue(page, { text: 'Ditar neste campo' })
  await page.keyboard.press('Control+Shift+Space') // command mode
  await page.clock.runFor(1600)
  await expect(body(page)).toBeEditable()
  await propose(page, 'Selecionar campo Observações descritivas')
  await queue(page, { text: 'Usar comandos' })
  await page.keyboard.press('Control+Shift+Space') // field mode: literal body
  await page.clock.runFor(1600)
  await expect(body(page)).toHaveValue('Usar comandos')
  await expect(picker(page)).toHaveValue('observation')
  await queue(page, { text: 'Preparar trecho' })
  await page.keyboard.press('Control+Alt+KeyM') // still field mode: local command
  await page.clock.runFor(1600)
  await expect(applyChunk(page)).toBeEnabled()
  await values(page, before.drafts[0])
  await queue(page, { text: 'Confirmar' })
  await page.keyboard.press('Control+Alt+KeyM')
  await page.clock.runFor(1600)
  await values(page, { ...before.drafts[0], observation: before.drafts[0].observation + ' Usar comandos' })
  await noAutosave(page, before)
  await propose(page, 'Usar comandos')
  await queue(page, { text: 'Ditar neste campo' })
  await page.keyboard.press('Control+Alt+KeyM') // command mode too
  await page.clock.runFor(1600)
  await expect(body(page)).toBeEditable()
  await noWrites(page, before)
  await cleanup(page, 5)
})

for (const late of ['resolve', 'reject']) {
  test('old owner ' + late + '/finally não libera nova captura nem apaga sua proposta', async ({ page }) => {
    await openApp(page)
    const before = await state(page)
    await arm(page)
    const old = await capture(page, 'chunk', 'CAPTURA VELHA.', { deferred: true })
    await page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Pacientes', exact: true }).click()
    await page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Abrir sessões', exact: true }).click()
    await page.getByLabel('Paciente para evolução e sessões').selectOption('ana')
    await selectDraft(page, 'draft-ana')
    // Explicit lifecycle rule under test: context invalidation aborts/releases
    // the old owner while its IPC may still be pending. The center stays mounted;
    // DesktopVault already aborts and nulls voiceCaptureRef on space changes.
    await expect(listenCommand(page)).toBeEnabled()
    await arm(page)
    const proposal = await prepareLocal(page, fields[0], 'PROPOSTA NOVA.')
    const next = await capture(page, 'command', 'Confirmar', { deferred: true })
    await finish(page, old, late === 'reject' ? { error: 'ERRO VELHO PROIBIDO.' } : { text: 'CAPTURA VELHA.' })
    await expect(listenCommand(page)).toBeDisabled()
    expect(await realPendingIntent(page)).toEqual(proposal)
    await expect(center(page)).not.toContainText('ERRO VELHO PROIBIDO.')
    await page.keyboard.press('Control+Alt+KeyM')
    await page.keyboard.press('Control+Shift+Space')
    expect((await counts(page)).requests).toBe(2)
    await expect(listenCommand(page)).toBeDisabled()
    await finish(page, next, { text: 'Confirmar' })
    await expect(listenCommand(page)).toBeEnabled()
    await expect(body(page)).not.toHaveValue('CAPTURA VELHA.')
    await values(page, { ...before.drafts[0], observation: before.drafts[0].observation + ' PROPOSTA NOVA.' })
    await noAutosave(page, before)
    await cleanup(page, 2)
  })
}
