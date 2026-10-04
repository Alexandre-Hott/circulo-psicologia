import { expect, test } from '@playwright/test'

// Real App, capture, voice gateway, updater wrapper and Tauri JS plugin/channel.
// Every native operation is synthetic: no endpoint, profile, download or installer.
// Manual clicks in the stale case only perturb updater state via existing handlers.
const versionA = '0.2.90'
const versionB = '0.2.91'
const warning = page => page.getByRole('alertdialog', { name: 'Confirmar ação', exact: true })
const calls = (page, command) => page.evaluate(name => window.voiceUpdater.calls.filter(item => item.command === name).map(item => item.args), command)

async function openApp(page, baseURL, { checkError = false, installError = false, patientScenario = null } = {}) {
  const external = [], dialogs = []
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss() })
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) return route.continue()
    external.push(route.request().url())
    return route.abort('blockedbyclient')
  })
  await page.clock.install({ time: new Date('2026-10-03T15:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-03T15:00:00Z'))
  await page.addInitScript(({ checkError, installError, versionA, patientScenario }) => {
    const fixture = window.voiceUpdater = {
      calls: [], unexpected: [], transcript: '', checkError, installError, deferCheck: false,
      version: versionA, resources: [], callbackIds: [], captures: [], captureRefs: [],
      mediaRequests: 0, trackStops: 0, contextCloses: 0, sourceDisconnects: 0, processorDisconnects: 0,
      writes: [], patients: patientScenario === 'existing-editors' ? [
        { id: 'existing-a', name: 'Paciente A Fictício', age: 8, revision: 1, archivedAt: null },
        { id: 'existing-b', name: 'Paciente B Fictício', age: 9, revision: 1, archivedAt: null },
      ] : [{ id: 'synthetic', name: 'Paciente Fictício', age: 8, revision: 1, archivedAt: null }],
    }
    const callbacks = new Map()
    let nextCallback = 1, nextResource = 101
    function resource() {
      const metadata = { rid: nextResource++, currentVersion: '0.2.78', version: fixture.version }
      fixture.resources.push({ ...metadata, closed: false })
      return metadata
    }
    function reject(command, args) {
      fixture.unexpected.push({ command, args })
      throw new Error(`IPC inesperado: ${command}`)
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
            processor.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(4096).fill(amplitude) },
              outputBuffer: { getChannelData: () => new Float32Array(4096) } })
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
    window.__TAURI_INTERNALS__ = {
      transformCallback(callback) {
        const id = nextCallback++
        callbacks.set(id, callback); fixture.callbackIds = [...callbacks.keys()]
        return id
      },
      unregisterCallback(id) { callbacks.delete(id); fixture.callbackIds = [...callbacks.keys()] },
      invoke: async (command, args = {}) => {
        const snapshot = command === 'plugin:updater|download_and_install'
          ? { rid: args.rid, onEvent: { id: args.onEvent?.id } } : structuredClone(args)
        fixture.calls.push({ command, args: snapshot })
        if (command === 'voice_transcribe') {
          fixture.captures.push({ args: structuredClone(args), transcript: fixture.transcript })
          fixture.captureRefs.push(args)
          return fixture.transcript
        }
        if (command === 'plugin:updater|check') {
          if (Object.keys(args).length) return reject(command, snapshot)
          if (fixture.checkError) throw new Error('Vérification synthétique indisponible')
          if (fixture.deferCheck) return await new Promise(resolve => { fixture.resolveCheck = () => resolve(resource()) })
          return resource()
        }
        if (command === 'plugin:resources|close') {
          const held = fixture.resources.find(item => item.rid === args.rid)
          if (Object.keys(args).length !== 1 || !held || held.closed) return reject(command, snapshot)
          held.closed = true
          return null
        }
        if (command === 'plugin:updater|download_and_install') {
          const held = fixture.resources.find(item => item.rid === args.rid)
          const callback = callbacks.get(args.onEvent?.id)
          if (Object.keys(args).sort().join(',') !== 'onEvent,rid' || !held || held.closed || !callback) return reject(command, snapshot)
          if (fixture.installError) {
            callback({ index: 0, end: true })
            throw new Error('Falha sintética de instalação; nenhum instalador executado')
          }
          callback({ index: 0, message: { event: 'Started', data: { contentLength: 100 } } })
          callback({ index: 1, message: { event: 'Progress', data: { chunkLength: 50 } } })
          await new Promise(resolve => setTimeout(resolve, 200))
          callback({ index: 2, message: { event: 'Finished' } })
          callback({ index: 3, end: true })
          return null
        }
        if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
        if (command === 'auto_backup_status') return { available: false, dirty: false }
        if (command === 'patient_list') return structuredClone(fixture.patients.filter(patient => args.includeArchived || !patient.archivedAt))
        if (command === 'patient_create') {
          // Only the explicitly authorized manual Save A in the real new-form
          // ABA case may write. Every other create/update remains forbidden.
          const expected = { name: 'Novo A sintético', age: null, selfRequester: null, preferredModality: '', lifeCycle: 'Não informado' }
          if (patientScenario !== 'new-save-a' || fixture.writes.length || Object.keys(args).join(',') !== 'input'
            || !args.input || Object.keys(args.input).length !== Object.keys(expected).length
            || !Object.entries(expected).every(([key, value]) => args.input[key] === value)) return reject(command, snapshot)
          fixture.writes.push({ command, args: snapshot })
          const saved = { id: 'created-a', revision: 1, archivedAt: null, ...args.input }
          fixture.patients.push(saved)
          return structuredClone(saved)
        }
        if (['agenda_occurrences', 'agenda_list_series', 'agenda_history', 'related_party_list', 'behavior_list',
          'indicator_catalog', 'session_draft_list', 'session_timeline', 'session_addendum_list', 'case_context_list'].includes(command)) return []
        return reject(command, snapshot) // No other clinical write, restart or plugin IPC allowed.
      },
    }
  }, { checkError, installError, versionA, patientScenario })
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Comando do Círculo' })).toBeVisible()
  return { external, dialogs }
}

async function cleanup(page) {
  const state = await page.evaluate(() => {
    const fixture = window.voiceUpdater
    return { captures: fixture.captures,
      counters: [fixture.mediaRequests, fixture.trackStops, fixture.contextCloses, fixture.sourceDisconnects, fixture.processorDisconnects],
      erased: fixture.captureRefs.length === fixture.captures.length && fixture.captureRefs.every(args =>
        args.samples.every(sample => sample === 0) && args.patientNames.every(name => name === '')) }
  })
  expect(state.captures.length).toBeGreaterThan(0)
  expect(state.counters).toEqual(Array(5).fill(state.captures.length))
  expect(state.erased).toBe(true)
  for (const { args } of state.captures) {
    expect(args.sampleRate).toBe(8000)
    expect(args.samples.some(sample => sample !== 0)).toBe(true)
    expect(args.samples.length / args.sampleRate).toBeLessThan(12)
  }
  await expect(page.getByText(/A captura atingiu .*segundos e pode estar incompleta/u)).toHaveCount(0)
}

async function audio(page, transcript) {
  const before = await page.evaluate(text => {
    window.voiceUpdater.transcript = text
    return window.voiceUpdater.captures.length
  }, transcript)
  const listen = page.getByRole('region', { name: 'Comando do Círculo' }).getByRole('button', { name: 'Ouvir comando', exact: true })
  await listen.click()
  await page.clock.runFor(1600)
  await expect(listen).toBeEnabled()
  await expect.poll(() => page.evaluate(() => window.voiceUpdater.captures.length)).toBe(before + 1)
  expect(await page.evaluate(() => window.voiceUpdater.captures.at(-1).transcript)).toBe(transcript)
  await cleanup(page)
}

async function prepare(page, transcript) {
  const downloads = await calls(page, 'plugin:updater|download_and_install')
  const checks = await calls(page, 'plugin:updater|check')
  await audio(page, transcript)
  await expect(page.locator('.voice-command-preview')).toBeVisible()
  expect(await calls(page, 'plugin:updater|download_and_install')).toEqual(downloads)
  expect(await calls(page, 'plugin:updater|check')).toEqual(checks)
}
async function command(page, transcript) {
  await prepare(page, transcript)
  await audio(page, 'Confirmar')
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
}
async function available(page, version = versionA) {
  await expect(page.getByText(`Atualização disponível: Círculo ${version}`, { exact: true })).toBeVisible()
}
async function installWarning(page, version = versionA) {
  await command(page, 'Clicar em Baixar e instalar')
  await expect(warning(page)).toContainText(`Instalar Círculo ${version}?`)
  await expect(warning(page)).toContainText('O aplicativo será fechado')
}
async function activeRid(page) {
  return page.evaluate(() => window.voiceUpdater.resources.filter(item => !item.closed).at(-1).rid)
}
async function boundaries(page, state) {
  expect(state.external).toEqual([])
  expect(state.dialogs).toEqual([])
  expect(await page.evaluate(() => window.voiceUpdater.unexpected)).toEqual([])
  expect(await page.evaluate(() => window.voiceUpdater.callbackIds)).toEqual([])
  await cleanup(page)
}

test('updater por áudio: retry de check só consulta após confirmação e respeita checking', async ({ page, baseURL }) => {
  const state = await openApp(page, baseURL, { checkError: true })
  await expect(page.getByText('Não foi possível verificar atualizações. Você pode continuar normalmente.', { exact: true })).toBeVisible()
  const initial = await calls(page, 'plugin:updater|check')
  await page.evaluate(() => { window.voiceUpdater.checkError = false; window.voiceUpdater.deferCheck = true })
  await command(page, 'Clicar em Verificar atualizações')
  await expect.poll(() => calls(page, 'plugin:updater|check')).toEqual([...initial, {}])
  await expect(page.getByRole('button', { name: 'Verificar atualizações', exact: true })).toHaveCount(0)
  expect(await calls(page, 'plugin:updater|download_and_install')).toEqual([])
  await page.evaluate(() => window.voiceUpdater.resolveCheck())
  await available(page)
  expect(await calls(page, 'plugin:updater|download_and_install')).toEqual([])
  await boundaries(page, state)
})

test('updater por áudio: preparar e confirmar abre aviso, Voltar cancela sem download', async ({ page, baseURL }) => {
  const state = await openApp(page, baseURL)
  await available(page)
  await prepare(page, 'Clicar em Baixar e instalar')
  await expect(page.locator('.voice-command-preview')).toContainText('Baixar e instalar')
  await expect(warning(page)).toHaveCount(0)
  await audio(page, 'Confirmar')
  await expect(warning(page)).toContainText(`Instalar Círculo ${versionA}?`)
  expect(await calls(page, 'plugin:updater|download_and_install')).toEqual([])
  await audio(page, 'Voltar')
  await expect(warning(page)).toHaveCount(0)
  await available(page)
  expect(await calls(page, 'plugin:updater|download_and_install')).toEqual([])
  await boundaries(page, state)
})

test('updater por áudio: confirmação explícita chama somente recurso sintético exato', async ({ page, baseURL }) => {
  const state = await openApp(page, baseURL)
  await available(page)
  const rid = await activeRid(page)
  await installWarning(page)
  expect(await calls(page, 'plugin:updater|download_and_install')).toEqual([])
  await audio(page, 'Confirmar')
  await expect(page.getByText(`Atualização ${versionA} instalada. Reinicie o aplicativo para usar a nova versão.`, { exact: true })).toBeVisible()
  expect(await calls(page, 'plugin:updater|download_and_install')).toEqual([{ rid, onEvent: { id: expect.any(Number) } }])
  await expect.poll(() => calls(page, 'plugin:resources|close')).toContainEqual({ rid })
  await boundaries(page, state)
})

test('updater por áudio: erro fecha recurso, recheck usa novo e retry não descarta editor', async ({ page, baseURL }) => {
  const state = await openApp(page, baseURL, { installError: true })
  await available(page)
  const oldRid = await activeRid(page)
  await installWarning(page)
  await audio(page, 'Confirmar')
  await expect(page.getByText(`Não foi possível instalar Círculo ${versionA}.`, { exact: true })).toBeVisible()
  await expect.poll(() => calls(page, 'plugin:resources|close')).toContainEqual({ rid: oldRid })
  const before = await calls(page, 'plugin:updater|check')
  await command(page, 'Clicar em Verificar atualizações')
  await available(page)
  expect(await calls(page, 'plugin:updater|check')).toEqual([...before, {}])
  expect(await activeRid(page)).not.toBe(oldRid)
  await command(page, 'Abrir pacientes')
  await command(page, 'Clicar em Novo cadastro')
  await command(page, 'Preencher Nome com Rascunho sintético pendente')
  await command(page, 'Clicar em Baixar e instalar')
  await expect(page.getByText(`Feche os formulários antes de instalar Círculo ${versionA}.`, { exact: true })).toBeVisible()
  const downloads = await calls(page, 'plugin:updater|download_and_install')
  await command(page, 'Clicar em Tentar instalação novamente')
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('Rascunho sintético pendente')
  expect(await calls(page, 'plugin:updater|download_and_install')).toEqual(downloads)
  expect(downloads).toEqual([{ rid: oldRid, onEvent: { id: expect.any(Number) } }])
  await boundaries(page, state)
})

test('updater por áudio: proposta A não autoriza B após substituição com mesmo botão', async ({ page, baseURL }) => {
  const state = await openApp(page, baseURL, { installError: true })
  await available(page)
  const oldRid = await activeRid(page)
  await prepare(page, 'Clicar em Baixar e instalar')
  // A separate manual attempt fails legitimately. Keep the voice proposal A
  // untouched while existing error/recheck handlers replace the available resource.
  await page.getByRole('button', { name: 'Baixar e instalar', exact: true }).click()
  await expect(warning(page)).toContainText(`Instalar Círculo ${versionA}?`)
  await warning(page).getByRole('button', { name: 'Confirmar ação', exact: true }).click()
  await expect(page.getByText(`Não foi possível instalar Círculo ${versionA}.`, { exact: true })).toBeVisible()
  await page.evaluate(version => { window.voiceUpdater.version = version }, versionB)
  await page.getByRole('button', { name: 'Verificar atualizações', exact: true }).click()
  await available(page, versionB)
  const newRid = await activeRid(page)
  expect(newRid).not.toBe(oldRid)
  await expect(page.getByRole('button', { name: 'Baixar e instalar', exact: true })).toBeVisible()
  const downloads = await calls(page, 'plugin:updater|download_and_install')
  expect(downloads).toEqual([{ rid: oldRid, onEvent: { id: expect.any(Number) } }])
  await audio(page, 'Confirmar')
  // Either proposal invalidation or explicit refusal is safe; opening B's native
  // install warning from A's confirmation is already an unauthorized handler call.
  await expect(warning(page)).toHaveCount(0)
  await available(page, versionB)
  expect(await calls(page, 'plugin:updater|download_and_install')).toEqual(downloads)
  expect(await calls(page, 'plugin:updater|download_and_install')).not.toContainEqual({ rid: newRid, onEvent: { id: expect.any(Number) } })
  await boundaries(page, state)
})

test('updater por áudio: ABA mesma versão com novo RID invalida proposta antiga', async ({ page, baseURL }) => {
  const state = await openApp(page, baseURL, { installError: true })
  await available(page, versionA)
  const oldRid = await activeRid(page)
  await prepare(page, 'Clicar em Baixar e instalar')
  // Perturb state only through existing manual handlers. The version never
  // changes: identity must distinguish the replacement resource, not just text.
  await page.getByRole('button', { name: 'Baixar e instalar', exact: true }).click()
  await expect(warning(page)).toContainText(`Instalar Círculo ${versionA}?`)
  await warning(page).getByRole('button', { name: 'Confirmar ação', exact: true }).click()
  await expect(page.getByText(`Não foi possível instalar Círculo ${versionA}.`, { exact: true })).toBeVisible()
  await expect.poll(() => calls(page, 'plugin:resources|close')).toContainEqual({ rid: oldRid })
  const checks = await calls(page, 'plugin:updater|check')
  await page.getByRole('button', { name: 'Verificar atualizações', exact: true }).click()
  await available(page, versionA)
  expect(await calls(page, 'plugin:updater|check')).toEqual([...checks, {}])
  const newRid = await activeRid(page)
  expect(newRid).not.toBe(oldRid)
  expect(await page.evaluate(() => window.voiceUpdater.resources.filter(item => !item.closed)))
    .toEqual([{ rid: newRid, currentVersion: '0.2.78', version: versionA, closed: false }])
  await expect(page.getByRole('button', { name: 'Baixar e instalar', exact: true })).toBeVisible()
  const downloads = await calls(page, 'plugin:updater|download_and_install')
  expect(downloads).toEqual([{ rid: oldRid, onEvent: { id: expect.any(Number) } }])
  await audio(page, 'Confirmar')
  await expect(warning(page)).toHaveCount(0)
  await available(page, versionA)
  expect(await activeRid(page)).toBe(newRid)
  expect(await calls(page, 'plugin:updater|download_and_install')).toEqual(downloads)
  expect(await calls(page, 'plugin:updater|download_and_install')).not.toContainEqual({ rid: newRid, onEvent: { id: expect.any(Number) } })
  await boundaries(page, state)
})

const discardRequest = 'Clicar em Descartar edições e fechar formulários'
const discardMessage = 'Fechar cadastro, vínculo e Agenda e descartar contexto, adendo ou comportamento não salvos em Sessões?'
async function formsBlocked(page) {
  await command(page, 'Clicar em Baixar e instalar')
  await expect(page.getByText(`Feche os formulários antes de instalar Círculo ${versionA}.`, { exact: true })).toBeVisible()
  await expect(warning(page)).toHaveCount(0)
  expect(await calls(page, 'plugin:updater|download_and_install')).toEqual([])
}
async function noDiscardWrites(page, creates = []) {
  expect(await calls(page, 'patient_create')).toEqual(creates)
  expect(await calls(page, 'patient_update')).toEqual([])
  expect(await calls(page, 'plugin:updater|download_and_install')).toEqual([])
  expect(await page.evaluate(() => window.voiceUpdater.writes)).toEqual(creates.map(args => ({ command: 'patient_create', args })))
}

test('updater descarte por áudio: cancelar editor existente A e editar B invalida proposta', async ({ page, baseURL }) => {
  const state = await openApp(page, baseURL, { patientScenario: 'existing-editors' })
  await available(page)
  const patients = await page.evaluate(() => window.voiceUpdater.patients)
  await command(page, 'Editar paciente Paciente A Fictício')
  const form = page.getByRole('form', { name: 'Editar cadastro', exact: true })
  await expect(form).toHaveAttribute('data-voice-record', 'existing-a')
  await formsBlocked(page)
  await prepare(page, discardRequest)
  await expect(page.locator('.voice-command-preview')).toContainText('Descartar edições e fechar formulários')
  await expect(warning(page)).toHaveCount(0)
  await noDiscardWrites(page)
  // Cancel is real only for an existing editor, never fabricated for a new form.
  await form.getByRole('button', { name: 'Cancelar edição', exact: true }).click()
  await page.locator('[data-voice-record="patient:existing-b"]').getByRole('button', { name: 'Editar', exact: true }).click()
  await expect(form).toHaveAttribute('data-voice-record', 'existing-b')
  await form.getByLabel('Nome', { exact: true }).fill('Edição B sintética pendente')
  await audio(page, 'Confirmar')
  await expect(warning(page)).toHaveCount(0)
  await expect(form).toBeVisible()
  await expect(form).toHaveAttribute('data-voice-record', 'existing-b')
  await expect(form.getByLabel('Nome', { exact: true })).toHaveValue('Edição B sintética pendente')
  expect(await page.evaluate(() => window.voiceUpdater.patients)).toEqual(patients)
  await noDiscardWrites(page)
  await boundaries(page, state)
})

test('updater descarte por áudio: novo A salvo e novo B no mesmo form recusa proposta A', async ({ page, baseURL }) => {
  const state = await openApp(page, baseURL, { patientScenario: 'new-save-a' })
  await available(page)
  await command(page, 'Abrir pacientes')
  await command(page, 'Clicar em Novo cadastro')
  const form = page.getByRole('form', { name: 'Novo cadastro', exact: true })
  await command(page, 'Preencher Nome com Novo A sintético')
  await expect(form.getByLabel('Nome', { exact: true })).toHaveValue('Novo A sintético')
  await formsBlocked(page)
  await prepare(page, discardRequest)
  await expect(warning(page)).toHaveCount(0)
  await noDiscardWrites(page)
  // Keep the old voice proposal: manually submit the EXISTING Save A handler.
  // Saving leaves the new form open and editing=null; no invented Cancel/reopen.
  await form.getByRole('button', { name: 'Salvar paciente', exact: true }).click()
  const savedA = { input: { name: 'Novo A sintético', age: null, selfRequester: null, preferredModality: '', lifeCycle: 'Não informado' } }
  await expect.poll(() => calls(page, 'patient_create')).toEqual([savedA])
  await expect(form.getByRole('button', { name: 'Salvar paciente', exact: true })).toBeEnabled()
  await expect(form.getByLabel('Nome', { exact: true })).toHaveValue('')
  const patientsAfterSave = await page.evaluate(() => window.voiceUpdater.patients)
  await form.getByLabel('Nome', { exact: true }).fill('Novo B sintético pendente')
  await form.getByLabel('Idade em anos (opcional)').fill('11')
  await form.getByLabel('Modalidade', { exact: true }).selectOption('Online')
  await audio(page, 'Confirmar')
  await expect(warning(page)).toHaveCount(0)
  await expect(form).toBeVisible()
  await expect(form.getByLabel('Nome', { exact: true })).toHaveValue('Novo B sintético pendente')
  await expect(form.getByLabel('Idade em anos (opcional)')).toHaveValue('11')
  await expect(form.getByLabel('Modalidade', { exact: true })).toHaveValue('Online')
  expect(await page.evaluate(() => window.voiceUpdater.patients)).toEqual(patientsAfterSave)
  await noDiscardWrites(page, [savedA])
  await boundaries(page, state)
})

test('updater descarte por áudio: proposta fresca B exige duas confirmações e respeita Voltar', async ({ page, baseURL }) => {
  const state = await openApp(page, baseURL)
  await available(page)
  const patients = await page.evaluate(() => window.voiceUpdater.patients)
  await command(page, 'Abrir pacientes')
  await command(page, 'Clicar em Novo cadastro')
  // The existing warning makes the workspace inert, but its unchanged fields
  // must still be inspectable without granting any input/action permission.
  const form = page.getByRole('form', { name: 'Novo cadastro', exact: true, includeHidden: true })
  await expect(form).toBeVisible()
  await command(page, 'Preencher Nome com Novo B sintético pendente')
  await formsBlocked(page)
  await prepare(page, discardRequest)
  await expect(warning(page)).toHaveCount(0)
  await expect(form.getByLabel('Nome', { exact: true })).toHaveValue('Novo B sintético pendente')
  await noDiscardWrites(page)
  await audio(page, 'Confirmar')
  await expect(warning(page)).toContainText(discardMessage)
  await expect(form.getByLabel('Nome', { exact: true })).toHaveValue('Novo B sintético pendente')
  await noDiscardWrites(page)
  await audio(page, 'Voltar')
  await expect(warning(page)).toHaveCount(0)
  await expect(form).toBeVisible()
  await expect(form.getByLabel('Nome', { exact: true })).toHaveValue('Novo B sintético pendente')
  await prepare(page, discardRequest)
  await expect(form.getByLabel('Nome', { exact: true })).toHaveValue('Novo B sintético pendente')
  await audio(page, 'Confirmar')
  await expect(warning(page)).toContainText(discardMessage)
  await expect(form.getByLabel('Nome', { exact: true })).toHaveValue('Novo B sintético pendente')
  await noDiscardWrites(page)
  await audio(page, 'Confirmar')
  await expect(warning(page)).toHaveCount(0)
  await expect(form).toHaveCount(0)
  await available(page)
  expect(await page.evaluate(() => window.voiceUpdater.patients)).toEqual(patients)
  await noDiscardWrites(page)
  await boundaries(page, state)
})
