import { expect, test } from '@playwright/test'

// Finite residual matrix: real App/DesktopVault/capture/gateway/DOM handlers;
// synthetic records, PCM devices and strict IPC only. Contracts reused from
// desktop-voice-{patient-fields,workflows,library,agenda-mutations,analytics-controls,
// auto-backup-recovery} and primary-journeys. No intent/callback injection, new
// aliases, physical microphone, ASR, native profile or file operations.
test.describe.configure({ timeout: 120000 })
const assistant = page => page.getByRole('region', { name: 'Comando do Círculo', exact: true })
const preview = page => page.locator('.voice-command-preview')
const draftForm = page => page.getByRole('form', { name: 'Rascunho de sessão', exact: true })
const state = page => page.evaluate(() => structuredClone(window.residualVoice.state))
const effects = page => page.evaluate(() => structuredClone(window.residualVoice.effects))
const calls = (page, command) => page.evaluate(name => window.residualVoice.calls.filter(call => call.command === name), command)
const localPassword = 'senha-local-ficticia-residual'

async function openApp(page, permitted = [], { locked = false } = {}) {
  const time = new Date('2026-10-03T15:00:00Z')
  await page.clock.install({ time })
  await page.clock.pauseAt(time)
  await page.addInitScript(({ permitted, locked }) => {
    const clone = value => structuredClone(value)
    const patients = [
      { id: 'ana', name: 'Ana Clara', age: 8, lifeCycle: 'Criança', revision: 4, selfRequester: 'yes', preferredModality: 'Presencial', archivedAt: null },
      { id: 'bia', name: 'Bia Fictícia', age: 9, lifeCycle: 'Criança', revision: 2, selfRequester: 'no', preferredModality: 'Online', archivedAt: null },
      { id: 'archived', name: 'Paciente Arquivado Fictício', age: 10, lifeCycle: 'Criança', revision: 1, selfRequester: null, preferredModality: '', archivedAt: '2026-10-01T15:00:00Z' },
    ]
    const behaviors = [
      { id: 'help', title: 'Pede ajuda', description: 'Descrição fictícia preservada.', version: 1 },
      { id: 'other', title: 'Comportamento concorrente', description: 'Versão concorrente preservada.', version: 3 },
    ]
    const indicators = [{ id: 'participacao', name: 'Participação sintética', version: 1, definition: 'Escala fictícia.', labels: ['Sem participação', 'Com apoio', 'Autônoma'] }]
    const series = [
      { id: 'series-ana', patientId: 'ana', weekday: 1, frequency: 'Semanal', startDate: '2026-09-28', endDate: null, start: '15:00', end: '15:50', modality: 'Presencial', meetingLink: null, revision: 1, timeZone: 'America/Sao_Paulo' },
      { id: 'series-bia', patientId: 'bia', weekday: 1, frequency: 'Semanal', startDate: '2026-09-28', endDate: null, start: '15:00', end: '15:50', modality: 'Online', meetingLink: null, revision: 1, timeZone: 'America/Sao_Paulo' },
    ]
    const history = [{ id: 'event-prior', seriesId: 'series-ana', originalDate: '2026-09-28', action: 'reschedule', effectiveDate: '2026-09-29', start: '15:00', end: '15:50', reason: 'Histórico fictício preservado' }]
    const drafts = ['ana', 'bia'].map(patientId => ({ id: `draft-${patientId}`, patientId, seriesId: `draft-series-${patientId}`, originalDate: '2026-10-03', observation: `Observação original ${patientId}.`, procedures: `Procedimento original ${patientId}.`, outcomeDecision: `Decisão original ${patientId}.`, referralClosure: `Orientação original ${patientId}.`, behaviorIds: [patientId === 'ana' ? 'help' : 'other'], indicators: [{ id: 'participacao', value: 1, note: `Nota original ${patientId}.` }] }))
    const parties = [{ id: 'party-bia', patientId: 'bia', name: 'Pessoa concorrente', relation: 'Pai', roles: { requester: true, legalGuardian: false, administrativeContact: false }, revision: 2, archivedAt: null }]
    const fixture = window.residualVoice = {
      state: { patients, behaviors, series, history, drafts, parties, sessions: [], unlocked: !locked, database: 'original-synthetic' },
      calls: [], effects: [], unexpected: [], transcripts: [], captures: [], captureRefs: [],
      mediaRequests: 0, trackStops: 0, contextCloses: 0, sourceDisconnects: 0, processorDisconnects: 0,
      catalogReady: false, clicks: [],
    }
    document.addEventListener('click', event => {
      const button = event.target instanceof Element ? event.target.closest('button') : null
      const name = button?.textContent.trim()
      if (['Verificar cópia automática local', 'Recuperar cópia automática local'].includes(name)) fixture.clicks.push(name)
    }, true)
    const allowed = new Set(permitted)
    const mutations = new Set(['patient_archive', 'patient_restore', 'related_party_create', 'related_party_update', 'related_party_archive', 'related_party_restore', 'session_draft_save', 'session_draft_cancel', 'agenda_reschedule', 'agenda_cancel', 'agenda_end_series', 'auto_backup_validate', 'auto_backup_restore'])
    const ready = new Set()
    let validatedPassword = null
    const fail = message => { fixture.unexpected.push(message); throw new Error(message) }
    const keys = (value, expected) => {
      if (!value || Object.keys(value).sort().join('|') !== [...expected].sort().join('|')) fail('Chaves IPC inesperadas')
    }
    const catalog = (command, value) => {
      ready.add(command)
      fixture.catalogReady = ['patient_list', 'behavior_list', 'indicator_catalog'].every(name => ready.has(name))
      return clone(value)
    }
    const commit = (command, args, value) => { fixture.effects.push(clone({ command, args })); return clone(value) }
    const plusDays = (date, days) => {
      const value = new Date(`${date}T12:00:00Z`)
      value.setUTCDate(value.getUTCDate() + days)
      return value.toISOString().slice(0, 10)
    }
    const occurrences = (from, to) => series.flatMap(item => {
      const result = []
      const horizon = [to, ...history.filter(event => event.seriesId === item.id && event.effectiveDate >= from && event.effectiveDate <= to).map(event => event.originalDate)].sort().at(-1)
      for (let originalDate = item.startDate; originalDate <= horizon && (!item.endDate || originalDate <= item.endDate); originalDate = plusDays(originalDate, 7)) {
        const events = history.filter(event => event.seriesId === item.id && event.originalDate === originalDate)
        if (events.some(event => event.action === 'cancel')) continue
        const moved = events.filter(event => event.action === 'reschedule').at(-1)
        const date = moved?.effectiveDate || originalDate
        if (date < from || date > to) continue
        result.push({ id: `${item.id}:${originalDate}`, seriesId: item.id, patientId: item.patientId, originalDate, date, start: moved?.start || item.start, end: moved?.end || item.end, status: 'scheduled', frequency: item.frequency, modality: item.modality, meetingLink: null, wasRescheduled: Boolean(moved) })
      }
      return result
    })
    // Real JS capture naturally detects two speech frames followed by silence.
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
      if (command === 'voice_transcribe') {
        keys(args, ['samples', 'sampleRate', 'patientNames'])
        if (args.sampleRate !== 8000 || !Array.isArray(args.samples) || !args.samples.length
          || args.samples.length / args.sampleRate >= 12 || !args.samples.some(value => value !== 0)
          || !args.samples.some(value => value === 0) || !args.samples.every(Number.isFinite)
          || JSON.stringify(args.patientNames) !== JSON.stringify(fixture.state.unlocked ? patients.filter(patient => !patient.archivedAt).map(patient => patient.name) : [])) return fail('PCM/contexto IPC inválido')
        const transcript = fixture.transcripts.shift()
        if (typeof transcript !== 'string' || !transcript.trim()) return fail('Transcrição não autorizada')
        fixture.calls.push({ command })
        fixture.captures.push({ transcript, sampleRate: args.sampleRate, sampleCount: args.samples.length })
        fixture.captureRefs.push(args)
        return transcript
      }
      fixture.calls.push(clone({ command, args }))
      if (mutations.has(command) && !allowed.has(command)) return fail(`Mutação fora do caso: ${command}`)
      if (!fixture.state.unlocked && ['patient_list', 'behavior_list', 'indicator_catalog', 'agenda_list_series', 'agenda_history', 'agenda_occurrences', 'session_draft_list', 'session_timeline', 'session_addendum_list', 'case_context_list', 'related_party_list', 'analytics_overview'].includes(command)) return fail('Leitura clínica enquanto bloqueado')
      if (command === 'vault_status') return { initialized: true, unlocked: fixture.state.unlocked, profileState: 'ready' }
      if (command === 'auto_backup_status') return { present: true, keyEnvelopePresent: true, available: fixture.state.unlocked, dirty: false }
      if (command === 'plugin:updater|check') return null
      if (command === 'patient_list') return catalog(command, patients.filter(item => args.includeArchived || !item.archivedAt))
      if (command === 'behavior_list') return catalog(command, behaviors)
      if (command === 'indicator_catalog') return catalog(command, indicators)
      if (command === 'agenda_list_series') return clone(series)
      if (command === 'agenda_history') return clone(history.slice().reverse())
      if (command === 'agenda_occurrences') return clone(occurrences(args.from, args.to))
      if (command === 'session_draft_list') return clone(drafts.filter(item => item.patientId === args.patientId))
      if (command === 'session_timeline') return clone(fixture.state.sessions.filter(item => item.patientId === args.patientId))
      if (command === 'session_addendum_list' || command === 'case_context_list') return []
      if (command === 'related_party_list') return clone(parties.filter(item => item.patientId === args.patientId && (args.includeArchived || !item.archivedAt)))
      if (command === 'analytics_overview') {
        keys(args, ['from', 'to', 'patientId'])
        return { totalCompletedSessions: args.patientId === 'archived' ? 0 : 7, uniquePatients: args.patientId === 'archived' ? 0 : 2, dailyCounts: [], monthlyCounts: [], behaviorCounts: [] }
      }
      if (command === 'patient_archive' || command === 'patient_restore') {
        keys(args, ['id', 'revision'])
        const item = patients.find(patient => patient.id === args.id)
        if (!item || item.revision !== args.revision) return fail('Paciente/revisão incorreto')
        item.archivedAt = command === 'patient_archive' ? '2026-10-03T15:00:00Z' : null
        item.revision++
        return commit(command, args, item)
      }
      if (command === 'related_party_create' || command === 'related_party_update') {
        keys(args, command === 'related_party_create' ? ['patientId', 'input'] : ['patientId', 'id', 'revision', 'input'])
        keys(args.input, ['name', 'relation', 'roles'])
        keys(args.input.roles, ['requester', 'legalGuardian', 'administrativeContact'])
        if (!patients.some(item => item.id === args.patientId) || !args.input.name.trim() || !Object.values(args.input.roles).some(Boolean)) return fail('Vínculo inválido')
        if (command === 'related_party_create') {
          const item = { id: 'party-ana', patientId: args.patientId, revision: 1, archivedAt: null, ...clone(args.input) }
          parties.push(item); return commit(command, args, item)
        }
        const item = parties.find(party => party.id === args.id && party.patientId === args.patientId)
        if (!item || item.revision !== args.revision) return fail('Vínculo/revisão incorreto')
        Object.assign(item, clone(args.input), { revision: item.revision + 1 })
        return commit(command, args, item)
      }
      if (command === 'related_party_archive' || command === 'related_party_restore') {
        keys(args, ['patientId', 'id', 'revision'])
        const item = parties.find(party => party.id === args.id && party.patientId === args.patientId)
        if (!item || item.revision !== args.revision) return fail('Vínculo/revisão incorreto')
        item.archivedAt = command === 'related_party_archive' ? '2026-10-03T15:00:00Z' : null
        item.revision++
        return commit(command, args, item)
      }
      if (command === 'session_draft_save' || command === 'session_draft_cancel') {
        keys(args, command === 'session_draft_save' ? ['id', 'input'] : ['id'])
        const item = drafts.find(draft => draft.id === args.id)
        if (!item || item.id !== 'draft-ana') return fail('Rascunho alvo incorreto')
        if (command === 'session_draft_save') {
          keys(args.input, ['observation', 'procedures', 'outcomeDecision', 'referralClosure', 'behaviorIds', 'indicators'])
          if (args.input.behaviorIds.some(id => !behaviors.some(behavior => behavior.id === id))
            || args.input.indicators.some(entry => entry.id !== 'participacao' || (entry.value !== null && entry.value !== 1))) return fail('Payload do rascunho inválido')
          Object.assign(item, clone(args.input)); return commit(command, args, item)
        }
        drafts.splice(drafts.indexOf(item), 1); return commit(command, args, null)
      }
      if (command === 'agenda_reschedule' || command === 'agenda_cancel') {
        keys(args, command === 'agenda_reschedule' ? ['seriesId', 'originalDate', 'input'] : ['seriesId', 'originalDate', 'reason'])
        if (command === 'agenda_reschedule') keys(args.input, ['date', 'start', 'end', 'reason'])
        const currentDate = history.filter(event => event.seriesId === args.seriesId && event.originalDate === args.originalDate && event.action === 'reschedule').at(-1)?.effectiveDate || args.originalDate
        if (!occurrences(currentDate, currentDate).some(item => item.seriesId === args.seriesId && item.originalDate === args.originalDate)) return fail('Ocorrência alvo ausente')
        if (command === 'agenda_cancel' && !args.reason.trim()) return fail('Cancelamento sem motivo')
        history.push({ id: `event-${history.length + 1}`, seriesId: args.seriesId, originalDate: args.originalDate, action: command === 'agenda_cancel' ? 'cancel' : 'reschedule', effectiveDate: args.input?.date || null, start: args.input?.start || null, end: args.input?.end || null, reason: (args.reason ?? args.input?.reason)?.trim() || null })
        return commit(command, args, null)
      }
      if (command === 'agenda_end_series') {
        keys(args, ['seriesId', 'effectiveDate'])
        const item = series.find(entry => entry.id === args.seriesId)
        if (!item || args.effectiveDate < '2026-10-03' || history.some(event => event.seriesId === item.id && event.originalDate >= args.effectiveDate)) return fail('Corte da série inválido')
        item.endDate = plusDays(args.effectiveDate, -1)
        return commit(command, args, item)
      }
      if (command === 'auto_backup_validate') {
        keys(args, ['password'])
        if (typeof args.password !== 'string' || !args.password) return fail('Senha manual ausente')
        validatedPassword = args.password
        return commit(command, args, true)
      }
      if (command === 'auto_backup_restore') {
        keys(args, ['password', 'confirmed'])
        if (args.confirmed !== true || !validatedPassword || args.password !== validatedPassword) return fail('Recuperação sem validação/consentimento')
        fixture.state.database = 'restored-synthetic'
        fixture.state.unlocked = true
        patients.splice(0, patients.length, { id: 'restored', name: 'Paciente Restaurado Fictício', age: 10, revision: 1, archivedAt: null })
        return commit(command, args, null)
      }
      return fail(`IPC sem fixture: ${command}`)
    } }
  }, { permitted, locked })
  await page.goto('/')
  await expect(assistant(page)).toBeVisible()
  if (!locked) await expect.poll(() => page.evaluate(() => window.residualVoice.catalogReady)).toBe(true)
  else await expect(page.getByRole('navigation', { name: 'Espaços do Círculo' })).toHaveCount(0)
  await page.clock.runFor(32)
}

async function audio(page, text) {
  const before = await page.evaluate(() => window.residualVoice.captures.length)
  await page.evaluate(transcript => window.residualVoice.transcripts.push(transcript), text)
  const listen = assistant(page).getByRole('button', { name: 'Ouvir comando', exact: true })
  await expect(listen).toBeEnabled()
  await listen.click()
  await expect(listen).toBeDisabled()
  await page.clock.runFor(1600)
  await expect(listen).toBeEnabled()
  expect(await page.evaluate(() => window.residualVoice.captures.length)).toBe(before + 1)
  expect(await page.evaluate(() => window.residualVoice.captures.at(-1).transcript)).toBe(text)
  await expect(assistant(page)).not.toContainText('pode estar incompleta')
}

async function prepare(page, text) {
  const beforeEffects = await effects(page)
  const beforeState = await state(page)
  await audio(page, text)
  await expect(preview(page), text).toContainText('Confira a proposta')
  expect(await effects(page), `Preparar não autoriza efeito: ${text}`).toEqual(beforeEffects)
  expect(await state(page)).toEqual(beforeState)
}

async function command(page, text, expected = []) {
  const before = await effects(page)
  await prepare(page, text)
  await audio(page, 'Confirmar')
  await expect(preview(page)).toHaveCount(0)
  await expect.poll(() => effects(page)).toEqual([...before, ...expected])
}

async function confirmedDialog(page, text, expected, accepted = true) {
  const beforeEffects = await effects(page)
  const beforeState = await state(page)
  await command(page, text)
  await expect(page.getByRole('alertdialog', { name: 'Confirmar ação' })).toBeVisible()
  expect(await state(page)).toEqual(beforeState)
  await audio(page, accepted ? 'Confirmar' : 'Voltar')
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect.poll(() => effects(page)).toEqual([...beforeEffects, ...(accepted ? [expected] : [])])
  if (!accepted) expect(await state(page)).toEqual(beforeState)
}

async function openDraft(page) {
  await command(page, 'Abrir registros de Ana Clara')
  await command(page, 'Clicar em Retomar sessão de 2026-10-03')
  await expect(draftForm(page)).toHaveAttribute('data-voice-record', 'draft-ana')
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue('ana')
}

test.beforeEach(async ({ page, baseURL }) => {
  const boundary = []
  page.on('pageerror', error => boundary.push(error.message))
  page.on('dialog', async dialog => { boundary.push(`native dialog: ${dialog.type()}`); await dialog.dismiss() })
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) await route.continue()
    else { boundary.push(route.request().url()); await route.abort() }
  })
  page.residualBoundary = boundary
})

test.afterEach(async ({ page }) => {
  expect(page.residualBoundary).toEqual([])
  const diagnostics = await page.evaluate(() => {
    const f = window.residualVoice
    return { unexpected: f.unexpected, queued: f.transcripts, count: f.captures.length,
      releases: [f.mediaRequests, f.trackStops, f.contextCloses, f.sourceDisconnects, f.processorDisconnects],
      cleared: f.captureRefs.every(args => args.samples.every(value => value === 0) && args.patientNames.every(value => value === '')) }
  })
  expect(diagnostics.unexpected).toEqual([])
  expect(diagnostics.queued).toEqual([])
  expect(diagnostics.releases).toEqual(Array(5).fill(diagnostics.count))
  expect(diagnostics.cleared).toBe(true)
})

test('residual PCM: buscar/limpar cadastro, incluir arquivados e atualizar sem gravação', async ({ page }) => {
  await openApp(page)
  const original = await state(page)
  await command(page, 'Abrir pacientes')
  const panel = page.getByRole('region', { name: 'Pacientes', exact: true })
  const rows = panel.locator(':scope > ul.vault-patients > li')
  await expect(rows).toHaveCount(2)
  await command(page, 'Preencher Buscar cadastro com Bia')
  await expect(rows).toHaveCount(1)
  await expect(rows).toHaveAttribute('data-voice-record', 'patient:bia')
  await command(page, 'Limpar o campo Buscar cadastro')
  await expect(rows).toHaveCount(2)
  await command(page, 'Marcar Mostrar arquivados')
  await expect(rows).toHaveCount(3)
  await expect(panel.getByLabel('Mostrar arquivados', { exact: true })).toBeChecked()
  const before = (await calls(page, 'patient_list')).length
  await command(page, 'Atualizar lista')
  await expect.poll(async () => (await calls(page, 'patient_list')).length).toBe(before + 1)
  expect((await calls(page, 'patient_list')).at(-1)).toEqual({ command: 'patient_list', args: { includeArchived: true } })
  expect(await state(page)).toEqual(original)
})

test('residual PCM: arquivar paciente com recusa/aceite e restaurar ID/revisões exatos', async ({ page }) => {
  await openApp(page, ['patient_archive', 'patient_restore'])
  const original = await state(page)
  await command(page, 'Abrir pacientes')
  const archive = { command: 'patient_archive', args: { id: 'ana', revision: 4 } }
  await confirmedDialog(page, 'Clicar em Arquivar de Ana Clara', archive, false)
  await confirmedDialog(page, 'Clicar em Arquivar de Ana Clara', archive)
  await command(page, 'Marcar Mostrar arquivados')
  const restore = { command: 'patient_restore', args: { id: 'ana', revision: 5 } }
  await confirmedDialog(page, 'Clicar em Restaurar de Ana Clara', restore)
  expect((await state(page)).patients).toEqual([{ ...original.patients[0], revision: 6 }, ...original.patients.slice(1)])
  expect((await state(page)).drafts).toEqual(original.drafts)
})

test('residual PCM: vínculo criar/editar/arquivar/restaurar preserva outro paciente', async ({ page }) => {
  await openApp(page, ['related_party_create', 'related_party_update', 'related_party_archive', 'related_party_restore'])
  const original = await state(page)
  await command(page, 'Abrir vínculos de Ana Clara')
  const panel = page.getByRole('region', { name: 'Pessoas vinculadas ao paciente' })
  await command(page, 'Preencher Nome da pessoa ou instituição com Maria Fictícia')
  await command(page, 'Selecionar Relação com o paciente como Mãe')
  await expect(panel.getByRole('button', { name: 'Adicionar vínculo', exact: true })).toBeDisabled()
  await command(page, 'Marcar Solicitante')
  await command(page, 'Marcar Responsável legal')
  const input = { name: 'Maria Fictícia', relation: 'Mãe', roles: { requester: true, legalGuardian: true, administrativeContact: false } }
  await command(page, 'Clicar em Adicionar vínculo', [{ command: 'related_party_create', args: { patientId: 'ana', input } }])
  await command(page, 'Clicar em Editar vínculo de Maria Fictícia')
  await expect(panel.getByRole('form', { name: 'Editar vínculo', exact: true })).toHaveAttribute('data-voice-record', 'party:ana:party-ana')
  await command(page, 'Preencher Nome da pessoa ou instituição com Escola Fictícia')
  await command(page, 'Selecionar Relação com o paciente como Escola')
  await command(page, 'Desmarcar Responsável legal')
  const updated = { name: 'Escola Fictícia', relation: 'Escola', roles: { requester: true, legalGuardian: false, administrativeContact: false } }
  await command(page, 'Clicar em Salvar vínculo', [{ command: 'related_party_update', args: { patientId: 'ana', id: 'party-ana', revision: 1, input: updated } }])
  await confirmedDialog(page, 'Clicar em Arquivar vínculo de Escola Fictícia', { command: 'related_party_archive', args: { patientId: 'ana', id: 'party-ana', revision: 2 } })
  await command(page, 'Marcar Mostrar vínculos arquivados')
  await confirmedDialog(page, 'Clicar em Restaurar vínculo de Escola Fictícia', { command: 'related_party_restore', args: { patientId: 'ana', id: 'party-ana', revision: 3 } })
  expect((await state(page)).parties).toEqual([...original.parties, { id: 'party-ana', patientId: 'ana', revision: 4, archivedAt: null, ...updated }])
  expect((await state(page)).patients).toEqual(original.patients)
})

test('residual PCM: cancelar editor da biblioteca invalida proposta sem alterar catálogo', async ({ page }) => {
  await openApp(page)
  const original = await state(page)
  await command(page, 'Abrir registros de Ana Clara')
  await command(page, 'Clicar em Biblioteca de comportamentos reutilizáveis')
  await command(page, 'Clicar em Editar comportamento Pede ajuda')
  await command(page, 'Preencher Descrição opcional com Edição fictícia descartável')
  await command(page, 'Clicar em Cancelar edição')
  await expect(page.getByLabel('Título descritivo')).toHaveValue('')
  await command(page, 'Clicar em Editar comportamento Pede ajuda')
  await prepare(page, 'Preencher Descrição opcional com Proposta antiga não autorizada')
  // Sole manual context intervention: genuine cancel/reopen of existing buttons
  // while an audio proposal is pending, preserving the stale proposal itself.
  await page.getByRole('button', { name: 'Cancelar edição', exact: true }).click()
  await page.getByRole('button', { name: 'Editar comportamento Comportamento concorrente', exact: true }).click()
  await audio(page, 'Confirmar')
  await expect(page.getByText('A tela mudou. Prepare o comando novamente antes de aplicar.', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Descrição opcional')).toHaveValue('Versão concorrente preservada.')
  expect(await state(page)).toEqual(original)
  expect(await effects(page)).toEqual([])
})

test('residual PCM: desmarcar confirmado autoriza autosave exato; Save explícito repete o payload', async ({ page }) => {
  await openApp(page, ['session_draft_save'])
  const original = await state(page)
  await openDraft(page)
  // First runtime (5238): the former only-explicit-Save expectation failed.
  // Generic controls intentionally use normal handlers/autosave after their
  // own confirmation; do not suppress that write during the next capture.
  await prepare(page, 'Desmarcar Pede ajuda · v1')
  await expect(draftForm(page).getByRole('checkbox', { name: 'Pede ajuda · v1', exact: true })).toBeChecked()
  expect(await effects(page)).toEqual([])
  expect(await state(page)).toEqual(original)
  await audio(page, 'Confirmar')
  await expect(preview(page)).toHaveCount(0)
  await expect(draftForm(page).getByRole('checkbox', { name: 'Pede ajuda · v1', exact: true })).not.toBeChecked()
  const draft = original.drafts[0]
  const input = { observation: draft.observation, procedures: draft.procedures, outcomeDecision: draft.outcomeDecision, referralClosure: draft.referralClosure, behaviorIds: [], indicators: draft.indicators }
  const save = { command: 'session_draft_save', args: { id: 'draft-ana', input } }
  await page.clock.runFor(600)
  await expect.poll(() => effects(page)).toEqual([save])
  expect((await state(page)).drafts).toEqual([{ ...draft, ...input }, original.drafts[1]])
  const savedState = await state(page)
  await prepare(page, 'Salvar rascunho')
  expect(await effects(page)).toEqual([save])
  expect(await state(page)).toEqual(savedState)
  await audio(page, 'Confirmar')
  await expect(preview(page)).toHaveCount(0)
  await expect.poll(() => effects(page)).toEqual([save, save])
  expect(await state(page)).toEqual(savedState)
  expect((await state(page)).drafts).toEqual([{ ...draft, ...input }, original.drafts[1]])
  expect((await state(page)).behaviors).toEqual(original.behaviors)
})

test('residual PCM: remarcar ocorrência conserva identidade original, motivo e histórico', async ({ page }) => {
  await openApp(page, ['agenda_reschedule'])
  const original = await state(page)
  await command(page, 'Remarcar sessão de Ana Clara no dia 05/10/2026 às 15 horas')
  const form = page.getByRole('form', { name: 'Alterar ocorrência individual', exact: true })
  await expect(form).toHaveAttribute('data-voice-record', 'series-ana:2026-10-05')
  for (const [label, value] of [['Nova data efetiva', '2026-10-06'], ['Novo início', '16:00'], ['Novo fim', '16:50'], ['Motivo administrativo (opcional)', 'Ajuste fictício de horário']]) await command(page, `Preencher ${label} com ${value}`)
  const input = { date: '2026-10-06', start: '16:00', end: '16:50', reason: 'Ajuste fictício de horário' }
  await confirmedDialog(page, 'Clicar em Confirmar remarcação individual', { command: 'agenda_reschedule', args: { seriesId: 'series-ana', originalDate: '2026-10-05', input } })
  await expect(form).toHaveCount(0)
  expect((await state(page)).history).toEqual([...original.history, { id: 'event-2', seriesId: 'series-ana', originalDate: '2026-10-05', action: 'reschedule', effectiveDate: input.date, start: input.start, end: input.end, reason: input.reason }])
  expect((await state(page)).series).toEqual(original.series)
  expect((await state(page)).drafts).toEqual(original.drafts)
})

test('residual PCM: cancelar ocorrência recusa/aceita sem atingir série ou paciente concorrente', async ({ page }) => {
  await openApp(page, ['agenda_cancel'])
  const original = await state(page)
  await command(page, 'Cancelar sessão de Ana Clara no dia 05/10/2026 às 15 horas')
  const form = page.getByRole('form', { name: 'Alterar ocorrência individual', exact: true })
  await expect(form).toHaveAttribute('data-voice-record', 'series-ana:2026-10-05')
  await expect(form.getByLabel('Ação explícita')).toHaveValue('cancelar')
  const reason = 'Indisponibilidade fictícia'
  await command(page, `Preencher Motivo administrativo (obrigatório) com ${reason}`)
  const effect = { command: 'agenda_cancel', args: { seriesId: 'series-ana', originalDate: '2026-10-05', reason } }
  await confirmedDialog(page, 'Clicar em Confirmar cancelamento', effect, false)
  await expect(form.getByLabel('Motivo administrativo (obrigatório)')).toHaveValue(reason)
  await confirmedDialog(page, 'Clicar em Confirmar cancelamento', effect)
  expect((await state(page)).history).toEqual([...original.history, { id: 'event-2', seriesId: 'series-ana', originalDate: '2026-10-05', action: 'cancel', effectiveDate: null, start: null, end: null, reason }])
  expect((await state(page)).series).toEqual(original.series)
})

test('residual PCM: encerrar série usa corte inclusivo após recusa, Voltar e novo aceite', async ({ page }) => {
  await openApp(page, ['agenda_end_series'])
  const original = await state(page)
  await command(page, 'Mostrar agenda do mês de 05/10/2026')
  await command(page, 'Clicar em Compromissos persistidos')
  const open = 'Clicar em Encerrar série de Ana Clara · série series-ana'
  const form = page.getByRole('form', { name: 'Encerrar série recorrente', exact: true })
  await command(page, open)
  await command(page, 'Preencher Primeira data excluída com 2026-10-19')
  const effect = { command: 'agenda_end_series', args: { seriesId: 'series-ana', effectiveDate: '2026-10-19' } }
  await confirmedDialog(page, 'Clicar em Confirmar encerramento', effect, false)
  await command(page, 'Clicar em Voltar')
  await expect(form).toHaveCount(0)
  expect(await state(page)).toEqual(original)
  await command(page, open)
  await command(page, 'Preencher Primeira data excluída com 2026-10-19')
  await confirmedDialog(page, 'Clicar em Confirmar encerramento', effect)
  await expect(form).toHaveCount(0)
  expect((await state(page)).series).toEqual([{ ...original.series[0], endDate: '2026-10-18' }, original.series[1]])
  expect((await state(page)).history).toEqual(original.history)
  expect((await state(page)).drafts).toEqual(original.drafts)
})

test('residual PCM: cancelar rascunho exige aceite e não finaliza nem exclui concorrente', async ({ page }) => {
  await openApp(page, ['session_draft_cancel'])
  const original = await state(page)
  await openDraft(page)
  const effect = { command: 'session_draft_cancel', args: { id: 'draft-ana' } }
  await confirmedDialog(page, 'Cancelar rascunho', effect, false)
  await expect(draftForm(page)).toHaveAttribute('data-voice-record', 'draft-ana')
  await confirmedDialog(page, 'Cancelar rascunho', effect)
  await expect(draftForm(page)).toHaveCount(0)
  expect((await state(page)).drafts).toEqual([original.drafts[1]])
  expect((await state(page)).sessions).toEqual([])
})

test('residual PCM: limpar indicador confirmado autoriza autosave; Save explícito repete nulls exatos', async ({ page }) => {
  await openApp(page, ['session_draft_save'])
  const original = await state(page)
  await openDraft(page)
  // Preserve the observed 5238 failure history: autosave was authorized by the
  // confirmed generic clear, not by merely preparing the following Save.
  await prepare(page, 'Clicar em Limpar Participação sintética')
  await expect(draftForm(page).getByLabel('Participação sintética · v1', { exact: true })).toHaveValue('1')
  await expect(draftForm(page).getByLabel('Nota contextual opcional · Participação sintética')).toHaveValue('Nota original ana.')
  expect(await effects(page)).toEqual([])
  expect(await state(page)).toEqual(original)
  await audio(page, 'Confirmar')
  await expect(preview(page)).toHaveCount(0)
  await expect(draftForm(page).getByLabel('Participação sintética · v1', { exact: true })).toHaveValue('')
  await expect(draftForm(page).getByLabel('Nota contextual opcional · Participação sintética')).toHaveValue('')
  const draft = original.drafts[0]
  const input = { observation: draft.observation, procedures: draft.procedures, outcomeDecision: draft.outcomeDecision, referralClosure: draft.referralClosure, behaviorIds: draft.behaviorIds, indicators: [{ id: 'participacao', value: null, note: null }] }
  const save = { command: 'session_draft_save', args: { id: 'draft-ana', input } }
  await page.clock.runFor(600)
  await expect.poll(() => effects(page)).toEqual([save])
  expect((await state(page)).drafts).toEqual([{ ...draft, ...input }, original.drafts[1]])
  const savedState = await state(page)
  await prepare(page, 'Salvar rascunho')
  expect(await effects(page)).toEqual([save])
  expect(await state(page)).toEqual(savedState)
  await audio(page, 'Confirmar')
  await expect(preview(page)).toHaveCount(0)
  await expect.poll(() => effects(page)).toEqual([save, save])
  expect(await state(page)).toEqual(savedState)
  expect((await state(page)).drafts).toEqual([{ ...draft, ...input }, original.drafts[1]])
})

test('residual PCM: presets Hoje/12 meses/Este mês e paciente arquivado consultam filtros exatos', async ({ page }) => {
  await openApp(page)
  const original = await state(page)
  await command(page, 'Abrir Análises')
  const panel = page.getByRole('region', { name: 'Análises', exact: true })
  const request = (from, to, patientId = null) => ({ command: 'analytics_overview', args: { from, to, patientId } })
  for (const [label, from, to] of [['Hoje', '2026-10-03', '2026-10-03'], ['12 meses', '2025-11-01', '2026-10-31'], ['Este mês', '2026-10-01', '2026-10-31']]) {
    const before = await calls(page, 'analytics_overview')
    await prepare(page, `Clicar em ${label}`)
    expect(await calls(page, 'analytics_overview')).toEqual(before)
    await audio(page, 'Confirmar')
    await expect(panel.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(panel.getByLabel('De', { exact: true })).toHaveValue(from)
    await expect(panel.getByLabel('Até', { exact: true })).toHaveValue(to)
    await expect.poll(() => calls(page, 'analytics_overview')).toEqual([...before, request(from, to)])
  }
  const before = await calls(page, 'analytics_overview')
  await command(page, 'Selecionar Paciente como Paciente Arquivado Fictício (arquivado)')
  await expect(panel.getByLabel('Paciente', { exact: true })).toHaveValue('archived')
  await expect.poll(() => calls(page, 'analytics_overview')).toEqual([...before, request('2026-10-01', '2026-10-31', 'archived')])
  await expect(panel.locator('.analytics-summary strong')).toHaveText(['0', '0'])
  await command(page, 'Selecionar Paciente como Todos os pacientes')
  await expect.poll(async () => (await calls(page, 'analytics_overview')).at(-1)).toEqual(request('2026-10-01', '2026-10-31'))
  expect(await effects(page)).toEqual([])
  expect(await state(page)).toEqual(original)
})

test('residual PCM: recuperação locked verifica senha manual; recusa limpa e novo aceite restaura uma vez', async ({ page }) => {
  await openApp(page, ['auto_backup_validate', 'auto_backup_restore'], { locked: true })
  await command(page, 'Clicar em Opções avançadas de backup e restauração')
  const field = page.getByLabel('Senha local para verificar cópia automática', { exact: true })
  const verify = 'Clicar em Verificar cópia automática local'
  const recover = 'Clicar em Recuperar cópia automática local'
  const validateEffect = { command: 'auto_backup_validate', args: { password: localPassword } }
  const restoreEffect = { command: 'auto_backup_restore', args: { password: localPassword, confirmed: true } }
  // Secret is entered only manually. Never put it in a voice transcript.
  await field.fill(localPassword)
  await prepare(page, verify)
  await expect(preview(page)).not.toContainText(localPassword)
  expect(await page.evaluate(() => window.residualVoice.clicks)).toEqual([])
  await audio(page, 'Confirmar')
  await expect(page.getByText('Cópia automática local validada.', { exact: true })).toBeVisible()
  expect(await effects(page)).toEqual([validateEffect])
  await command(page, recover)
  await expect(page.getByRole('alertdialog')).toBeVisible()
  expect(await calls(page, 'auto_backup_restore')).toEqual([])
  await audio(page, 'Voltar')
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(field).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Recuperar cópia automática local', exact: true })).toHaveCount(0)
  expect((await state(page)).database).toBe('original-synthetic')
  await field.fill(localPassword)
  await command(page, verify, [validateEffect])
  await prepare(page, recover)
  await expect(preview(page)).not.toContainText(localPassword)
  expect(await calls(page, 'auto_backup_restore')).toEqual([])
  await audio(page, 'Confirmar')
  await expect(page.getByRole('alertdialog')).toBeVisible()
  expect(await calls(page, 'auto_backup_restore')).toEqual([])
  await audio(page, 'Confirmar')
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Espaços do Círculo' })).toBeVisible()
  await expect(page.getByText('Cópia automática local restaurada e verificada.', { exact: true })).toBeVisible()
  expect(await effects(page)).toEqual([validateEffect, validateEffect, restoreEffect])
  expect((await state(page)).database).toBe('restored-synthetic')
  expect((await state(page)).patients.map(item => item.id)).toEqual(['restored'])
  expect(await page.evaluate(() => window.residualVoice.captures.some(item => item.transcript.includes('senha-local')))).toBe(false)
  expect(await page.evaluate(() => window.residualVoice.clicks)).toEqual(['Verificar cópia automática local', 'Recuperar cópia automática local', 'Verificar cópia automática local', 'Recuperar cópia automática local'])
})
