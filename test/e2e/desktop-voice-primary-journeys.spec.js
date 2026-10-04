import { expect, test } from '@playwright/test'

// Incremento 80: real DesktopVault/capture/gateway/router/forms/handlers.
// Only media devices and the native IPC boundary are synthetic. Fixed Portuguese
// transcripts are returned by voice_transcribe, never by injected intents or
// callbacks. No Rust/ASR, physical microphone, profile, password or file access.
test.describe.configure({ timeout: 120000 })
const assistant = page => page.getByRole('region', { name: 'Comando do Círculo', exact: true })
const preview = page => page.locator('.voice-command-preview')
const draftForm = page => page.getByRole('form', { name: 'Rascunho de sessão', exact: true })
const writes = page => page.evaluate(() => structuredClone(window.primaryJourney.writes))
const state = page => page.evaluate(() => structuredClone(window.primaryJourney.state))
const fields = [
  ['observation', 'Observações descritivas', 'No jogo fictício, disse: confirmar. Não executar; só registrar.'],
  ['procedures', 'Procedimentos realizados', 'Atividade sintética de turnos, com apoio e pausa.'],
  ['outcomeDecision', 'Resultado e decisão', 'Participou com apoio; manter acompanhamento fictício.'],
  ['referralClosure', 'Encaminhamento ou encerramento (opcional)', 'Orientação fictícia: voltar, salvar e confirmar são palavras do relato.'],
]

async function openApp(page, { homonyms = false } = {}) {
  const time = new Date('2026-10-03T15:00:00Z')
  await page.clock.install({ time })
  await page.clock.pauseAt(time)
  await page.addInitScript(({ homonyms }) => {
    const clone = value => structuredClone(value)
    const patients = [
      { id: 'ana', name: 'Ana Fictícia', age: 8, lifeCycle: 'Criança', revision: 4, birthDate: null, selfRequester: 'yes', preferredModality: 'Presencial', archivedAt: null },
      { id: 'bia', name: homonyms ? 'Ana Fictícia' : 'Bia Fictícia', age: 9, lifeCycle: 'Criança', revision: 7, birthDate: null, selfRequester: 'no', preferredModality: 'Online', archivedAt: null },
    ]
    const behaviors = [{ id: 'behavior-other', title: 'Comportamento concorrente', description: 'Preservar esta versão.', version: 3 }]
    const indicators = [{ id: 'participacao', name: 'Participação sintética', version: 1, definition: 'Escala exclusivamente fictícia.', labels: ['Sem participação', 'Com apoio', 'Autônoma'] }]
    const series = [{ id: 'series-bia', patientId: 'bia', weekday: 6, frequency: 'Avulsa', startDate: '2026-10-03', endDate: '2026-10-03', start: '15:00', end: '15:50', modality: 'Online', meetingLink: null, timeZone: 'America/Sao_Paulo', revision: 1 }]
    const drafts = [{ id: 'draft-bia', patientId: 'bia', seriesId: 'series-bia', originalDate: '2026-10-03', observation: 'Concorrente preservado.', procedures: 'Procedimento concorrente.', outcomeDecision: 'Decisão concorrente.', referralClosure: 'Orientação concorrente.', behaviorIds: ['behavior-other'], indicators: [] }]
    const fixture = window.primaryJourney = {
      state: { patients, behaviors, series, drafts, sessions: [] }, calls: [], writes: [], unexpected: [],
      transcripts: [], captures: [], captureRefs: [], mediaRequests: 0, trackStops: 0,
      contextCloses: 0, sourceDisconnects: 0, processorDisconnects: 0, catalogReady: false,
    }
    const ready = new Set()
    const catalog = (command, value) => {
      ready.add(command)
      fixture.catalogReady = ['patient_list', 'behavior_list', 'indicator_catalog'].every(name => ready.has(name))
      return clone(value)
    }
    const fail = message => { fixture.unexpected.push(message); throw new Error(message) }
    const requireKeys = (value, keys) => {
      if (!value || Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) fail('Payload IPC inesperado')
    }
    const commit = (command, args, value) => { fixture.writes.push(clone({ command, args })); return clone(value) }
    const plusDays = (date, days) => {
      const value = new Date(`${date}T12:00:00Z`)
      value.setUTCDate(value.getUTCDate() + days)
      return value.toISOString().slice(0, 10)
    }
    const occurrences = (from, to) => series.flatMap(item => {
      const result = []
      let date = item.startDate
      if (item.frequency !== 'Avulsa') while (new Date(`${date}T12:00:00Z`).getUTCDay() !== item.weekday) date = plusDays(date, 1)
      for (; date <= to && (!item.endDate || date <= item.endDate); date = plusDays(date, 7)) {
        if (date >= from) result.push({ id: `${item.id}:${date}`, seriesId: item.id, patientId: item.patientId, originalDate: date, date, start: item.start, end: item.end, frequency: item.frequency, modality: item.modality, meetingLink: item.meetingLink, wasRescheduled: false, status: fixture.state.sessions.some(session => session.seriesId === item.id && session.originalDate === date) ? 'completed' : 'scheduled' })
        if (item.frequency === 'Avulsa') break
      }
      return result
    })

    // Two speech frames, then silence. Exercise captureCommandAudio's own VAD,
    // timer, teardown and host serialization; never synthesize endedBy metadata.
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
        requireKeys(args, ['samples', 'sampleRate', 'patientNames'])
        if (args.sampleRate !== 8000 || !Array.isArray(args.samples) || !args.samples.length
          || args.samples.length / args.sampleRate >= 12 || !args.samples.some(value => value !== 0)
          || !args.samples.some(value => value === 0) || !args.samples.every(Number.isFinite)
          || JSON.stringify(args.patientNames) !== JSON.stringify(patients.filter(item => !item.archivedAt).map(item => item.name))) fail('Captura IPC inválida')
        const transcript = fixture.transcripts.shift()
        if (typeof transcript !== 'string' || !transcript.trim()) fail('Áudio sem transcrição fixa autorizada')
        fixture.calls.push({ command })
        fixture.captures.push({ transcript, sampleRate: args.sampleRate, sampleCount: args.samples.length, patientNames: clone(args.patientNames) })
        fixture.captureRefs.push(args)
        return transcript
      }
      fixture.calls.push(clone({ command, args }))
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { available: false, dirty: false }
      if (command === 'plugin:updater|check') return null
      if (command === 'patient_list') return catalog(command, patients)
      if (command === 'behavior_list') return catalog(command, behaviors)
      if (command === 'indicator_catalog') return catalog(command, indicators)
      if (command === 'agenda_list_series') return clone(series)
      if (command === 'agenda_occurrences') return clone(occurrences(args.from, args.to))
      if (command === 'agenda_history' || command === 'related_party_list' || command === 'case_context_list' || command === 'session_addendum_list') return []
      if (command === 'session_draft_list') return clone(drafts.filter(item => item.patientId === args.patientId))
      if (command === 'session_timeline') return clone(fixture.state.sessions.filter(item => item.patientId === args.patientId))
      if (command === 'patient_create' || command === 'patient_update') {
        requireKeys(args, command === 'patient_create' ? ['input'] : ['id', 'revision', 'input'])
        requireKeys(args.input, ['name', 'age', 'lifeCycle', 'selfRequester', 'preferredModality'])
        if (command === 'patient_create') {
          const item = { ...clone(args.input), id: 'patient-created', revision: 1, birthDate: null, archivedAt: null }
          patients.push(item); return commit(command, args, item)
        }
        const item = patients.find(patient => patient.id === args.id && !patient.archivedAt)
        if (!item || item.revision !== args.revision) return fail('Paciente/revisão incorreto')
        Object.assign(item, clone(args.input), { revision: item.revision + 1 })
        return commit(command, args, item)
      }
      if (command === 'behavior_create' || command === 'behavior_update') {
        requireKeys(args, command === 'behavior_create' ? ['title', 'description'] : ['id', 'version', 'title', 'description'])
        if (command === 'behavior_create') {
          const item = { id: 'behavior-created', title: args.title, description: args.description, version: 1 }
          behaviors.push(item); return commit(command, args, item)
        }
        const item = behaviors.find(behavior => behavior.id === args.id)
        if (!item || item.version !== args.version) return fail('Comportamento/versão incorreto')
        Object.assign(item, { title: args.title, description: args.description, version: item.version + 1 })
        return commit(command, args, item)
      }
      if (command === 'agenda_create_series') {
        requireKeys(args, ['input'])
        requireKeys(args.input, ['patientId', 'weekday', 'frequency', 'startDate', 'endDate', 'start', 'end', 'modality', 'meetingLink'])
        if (!patients.some(item => item.id === args.input.patientId) || !['Avulsa', 'Semanal'].includes(args.input.frequency)) return fail('Série inválida')
        const item = { ...clone(args.input), id: 'series-created', revision: 1, timeZone: 'America/Sao_Paulo' }
        series.push(item); return commit(command, args, item)
      }
      if (command === 'session_draft_start') {
        requireKeys(args, ['seriesId', 'originalDate'])
        const occurrence = occurrences(args.originalDate, args.originalDate).find(item => item.seriesId === args.seriesId && item.status === 'scheduled')
        if (!occurrence || drafts.some(item => item.seriesId === args.seriesId && item.originalDate === args.originalDate)) return fail('Ocorrência incorreta/rascunho duplicado')
        const draft = { id: 'draft-created', patientId: occurrence.patientId, seriesId: args.seriesId, originalDate: args.originalDate, observation: '', procedures: '', outcomeDecision: '', referralClosure: null, behaviorIds: [], indicators: [] }
        drafts.push(draft); return commit(command, args, draft)
      }
      if (command === 'session_draft_save') {
        requireKeys(args, ['id', 'input'])
        requireKeys(args.input, ['observation', 'procedures', 'outcomeDecision', 'referralClosure', 'behaviorIds', 'indicators'])
        const draft = drafts.find(item => item.id === args.id)
        if (!draft || args.id !== 'draft-created' || args.input.behaviorIds.some(id => !behaviors.some(item => item.id === id))
          || args.input.indicators.some(item => item.id !== 'participacao' || item.value !== 1)) return fail('Destino/payload do rascunho incorreto')
        Object.assign(draft, clone(args.input)); return commit(command, args, draft)
      }
      if (command === 'session_finalize') {
        requireKeys(args, ['id'])
        const draft = drafts.find(item => item.id === args.id)
        if (!draft || args.id !== 'draft-created' || !draft.observation || !draft.procedures || !draft.outcomeDecision) return fail('Finalização inválida')
        const occurrence = occurrences(draft.originalDate, draft.originalDate).find(item => item.seriesId === draft.seriesId)
        const indicatorSnapshots = indicators.map(definition => {
          const entry = draft.indicators.find(item => item.id === definition.id)
          return { ...clone(definition), value: entry?.value ?? null, note: entry?.note ?? null }
        })
        const session = { ...clone(draft), sessionDate: occurrence.date, start: occurrence.start, end: occurrence.end, modality: occurrence.modality, wasRescheduled: false, recordedAt: '2026-10-03T15:00:00Z', indicators: indicatorSnapshots, behaviors: draft.behaviorIds.map(id => { const item = behaviors.find(behavior => behavior.id === id); return { templateId: id, templateVersion: item.version, title: item.title, description: item.description } }) }
        fixture.state.sessions.push(session); drafts.splice(drafts.indexOf(draft), 1)
        return commit(command, args, session)
      }
      return fail(`IPC sem fixture: ${command}`)
    } }
  }, { homonyms })
  await page.goto('/')
  await expect(assistant(page)).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.primaryJourney.catalogReady)).toBe(true)
  await page.clock.runFor(32)
}

async function audio(page, transcript, channel = 'Ouvir comando') {
  const before = await page.evaluate(() => window.primaryJourney.captures.length)
  await page.evaluate(text => window.primaryJourney.transcripts.push(text), transcript)
  const listen = assistant(page).getByRole('button', { name: channel, exact: true })
  await expect(listen).toBeEnabled()
  await listen.click()
  await expect(listen).toBeDisabled()
  await page.clock.runFor(1600)
  await expect(listen).toBeEnabled()
  await expect.poll(() => page.evaluate(() => window.primaryJourney.captures.length)).toBe(before + 1)
  expect(await page.evaluate(() => window.primaryJourney.captures.at(-1).transcript)).toBe(transcript)
  await expect(assistant(page)).not.toContainText('pode estar incompleta')
  expect(await page.evaluate(() => {
    const f = window.primaryJourney
    return [f.mediaRequests, f.trackStops, f.contextCloses, f.sourceDisconnects, f.processorDisconnects]
  })).toEqual(Array(5).fill(before + 1))
  expect(await page.evaluate(() => window.primaryJourney.captureRefs.every(args => args.samples.every(value => value === 0) && args.patientNames.every(value => value === '')))).toBe(true)
}

async function prepare(page, text, review = null) {
  const before = await writes(page)
  const beforeState = await state(page)
  await audio(page, text)
  await expect(preview(page), text).toContainText('Confira a proposta')
  if (review) await expect(preview(page)).toContainText(review)
  expect(await writes(page), `Nenhum write ao preparar: ${text}`).toEqual(before)
  expect(await state(page), `Estado persistido intacto ao preparar: ${text}`).toEqual(beforeState)
}

async function command(page, text, expectedWrites = [], review = null) {
  const before = await writes(page)
  await prepare(page, text, review)
  await audio(page, 'Confirmar')
  await expect(preview(page)).toHaveCount(0)
  await expect.poll(() => writes(page)).toEqual([...before, ...expectedWrites])
}

test.beforeEach(async ({ page, baseURL }) => {
  const unexpected = []
  page.on('dialog', async dialog => { unexpected.push(`native dialog: ${dialog.type()}`); await dialog.dismiss() })
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) await route.continue()
    else { unexpected.push(route.request().url()); await route.abort() }
  })
  page.primaryJourneyBoundary = unexpected
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.primaryJourney?.unexpected || [])).toEqual([])
  expect(await page.evaluate(() => window.primaryJourney?.transcripts || [])).toEqual([])
  expect(page.primaryJourneyBoundary).toEqual([])
})

test('áudio: cadastrar e editar paciente, prévias sem writes e Save com ID/revisão exatos', async ({ page }) => {
  await openApp(page)
  const original = await state(page)
  await command(page, 'Cadastrar paciente Mara Fictícia com 8 anos presencial', [], 'Mara Fictícia')
  await expect(page.getByRole('form', { name: 'Novo cadastro', exact: true })).toBeVisible()
  await command(page, 'Selecionar O próprio paciente solicitou o atendimento? como Sim')
  const input = { name: 'Mara Fictícia', age: 8, lifeCycle: 'Criança', selfRequester: 'yes', preferredModality: 'Presencial' }
  await command(page, 'Salvar paciente', [{ command: 'patient_create', args: { input } }])
  await command(page, 'Clicar em Editar de Mara Fictícia')
  const form = page.getByRole('form', { name: 'Editar cadastro', exact: true })
  await expect(form).toHaveAttribute('data-voice-record', 'patient-created')
  await expect(form).toHaveAttribute('data-voice-epoch', '1')
  await command(page, 'Preencher Nome com Mara Revisada')
  await command(page, 'Preencher Idade em anos (opcional) com nove')
  await command(page, 'Selecionar O próprio paciente solicitou o atendimento? como Não')
  await command(page, 'Selecionar Modalidade como Online')
  const updated = { ...input, name: 'Mara Revisada', age: 9, selfRequester: 'no', preferredModality: 'Online' }
  await command(page, 'Salvar alterações', [{ command: 'patient_update', args: { id: 'patient-created', revision: 1, input: updated } }])
  await expect(form).toHaveCount(0)
  expect((await state(page)).patients).toEqual([...original.patients, { ...updated, id: 'patient-created', revision: 2, birthDate: null, archivedAt: null }])
  expect((await state(page)).drafts).toEqual(original.drafts)
})

async function createBehavior(page) {
  await command(page, 'Abrir registros de Ana Fictícia')
  await command(page, 'Clicar em Biblioteca de comportamentos reutilizáveis')
  await command(page, 'Criar comportamento Solicita pausa com descrição Pede um intervalo durante a atividade.')
  await expect(page.getByLabel('Título descritivo')).toHaveValue('Solicita pausa')
  await command(page, 'Salvar comportamento', [{ command: 'behavior_create', args: { title: 'Solicita pausa', description: 'Pede um intervalo durante a atividade.' } }])
  await command(page, 'Editar comportamento Solicita pausa com descrição Pede um intervalo curto durante a atividade.')
  await expect(page.getByLabel('Descrição opcional')).toHaveValue('Pede um intervalo curto durante a atividade.')
  await command(page, 'Salvar comportamento', [{ command: 'behavior_update', args: { id: 'behavior-created', version: 1, title: 'Solicita pausa', description: 'Pede um intervalo curto durante a atividade.' } }])
}

test('áudio: criar/editar comportamento; proposta stale não atravessa troca do editor', async ({ page }) => {
  await openApp(page)
  const original = await state(page)
  await createBehavior(page)
  await command(page, 'Clicar em Editar comportamento Solicita pausa')
  await prepare(page, 'Preencher Descrição opcional com Texto que não deve atravessar o editor')
  const before = await writes(page)
  // Sole manual intervention: a user changes the editor between audio proposal
  // and confirmation. No DOM/metadata changes and no callback/intent injection.
  await page.getByRole('button', { name: 'Editar comportamento Comportamento concorrente', exact: true }).click()
  await audio(page, 'Confirmar')
  await expect(page.getByText('A tela mudou. Prepare o comando novamente antes de aplicar.', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Descrição opcional')).toHaveValue('Preservar esta versão.')
  expect(await writes(page)).toEqual(before)
  expect((await state(page)).behaviors).toEqual([...original.behaviors, { id: 'behavior-created', title: 'Solicita pausa', description: 'Pede um intervalo curto durante a atividade.', version: 2 }])
  expect((await state(page)).drafts).toEqual(original.drafts)
})

for (const frequency of ['Avulsa', 'Semanal']) {
  test(`áudio: agenda ${frequency} → ocorrência específica → retomar → quatro literais/comportamento/indicador → Save/finalizar`, async ({ page }) => {
    await openApp(page)
    const original = await state(page)
    await createBehavior(page)
    await command(page, 'Abrir Agenda')
    await command(page, 'Clicar em Novo compromisso')
    const appointment = page.getByRole('form', { name: 'Novo compromisso', exact: true })
    await command(page, 'Selecionar Paciente como Ana Fictícia')
    if (frequency === 'Semanal') {
      await command(page, 'Selecionar Tipo como Recorrente')
      await command(page, 'Selecionar Dia da semana como Segunda')
      await command(page, 'Selecionar Frequência como Semanal')
    }
    const date = frequency === 'Avulsa' ? '2026-10-03' : '2026-10-05'
    await command(page, `Preencher ${frequency === 'Avulsa' ? 'Data do compromisso' : 'Início da série'} com ${date}`)
    await command(page, 'Preencher Horário inicial com quinze horas')
    await command(page, 'Preencher Horário final com quinze horas e cinquenta minutos')
    await expect(appointment.getByLabel('Paciente', { exact: true })).toHaveValue('ana')
    const input = { patientId: 'ana', weekday: frequency === 'Avulsa' ? 6 : 1, frequency, startDate: date, endDate: frequency === 'Avulsa' ? date : null, start: '15:00', end: '15:50', modality: 'Presencial', meetingLink: null }
    await command(page, frequency === 'Avulsa' ? 'Clicar em Criar compromisso avulso' : 'Clicar em Criar série', [{ command: 'agenda_create_series', args: { input } }])
    await command(page, `Mostrar agenda do dia ${frequency === 'Avulsa' ? '03/10/2026' : '05/10/2026'}`)
    await command(page, `Abrir detalhes de Ana Fictícia em ${date} às quinze horas`)
    const panel = page.locator('#agenda-details-panel')
    await expect(panel.locator(`#agenda-detail-series-created\\:${date}`)).toBeVisible()
    await expect(page.locator('[data-voice-focused-occurrence]')).toHaveAttribute('data-voice-focused-occurrence', `series-created:${date}`)
    await command(page, 'Clicar em Iniciar sessão', [{ command: 'session_draft_start', args: { seriesId: 'series-created', originalDate: date } }], 'Ana Fictícia')
    await expect(draftForm(page)).toHaveAttribute('data-voice-record', 'draft-created')
    expect((await state(page)).drafts.find(item => item.id === 'draft-created')).toMatchObject({ patientId: 'ana', seriesId: 'series-created', originalDate: date })

    // Switch to another patient's actual workspace, then return and resume via
    // the existing command/button. Merely reopening the same draft is not proof
    // of resume; require the primary resume control before invoking it.
    await command(page, 'Abrir registros de Bia Fictícia')
    await command(page, 'Abrir registros de Ana Fictícia')
    await expect(page.getByRole('button', { name: `Retomar sessão de ${date}`, exact: true })).toBeVisible()
    await command(page, `Clicar em Retomar sessão de ${date}`)
    await expect(draftForm(page)).toHaveAttribute('data-voice-record', 'draft-created')
    await command(page, 'Marcar comportamento Solicita pausa para Ana Fictícia na sessão')
    await expect(draftForm(page).getByRole('checkbox', { name: 'Solicita pausa · v2', exact: true })).toBeChecked()
    await command(page, 'Selecionar Participação sintética como Com apoio')
    await command(page, 'Preencher Nota contextual de Participação sintética com Apoio durante jogo fictício')
    await expect(draftForm(page).getByLabel('Participação sintética · v1', { exact: true })).toHaveValue('1')
    const beforeClinical = await state(page)
    const beforeWrites = await writes(page)
    await audio(page, 'Ditar neste campo')
    for (const [key, label, body] of fields) {
      await audio(page, `Selecionar campo ${key === 'referralClosure' ? 'Encaminhamento ou encerramento' : label}`)
      await expect(assistant(page).getByLabel('Campo do rascunho')).toHaveValue(key)
      await audio(page, body, 'Ouvir trecho')
      await expect(assistant(page).getByLabel('Trecho a acrescentar')).toHaveValue(body)
      await expect(draftForm(page).getByLabel(label, { exact: true })).toHaveValue('')
      await expect(assistant(page).getByRole('button', { name: 'Confirmar acréscimo', exact: true })).toHaveCount(0)
      expect(await state(page)).toEqual(beforeClinical)
      expect(await writes(page)).toEqual(beforeWrites)
      await audio(page, 'Preparar trecho')
      await expect(preview(page)).toContainText('Confira a proposta')
      await expect(preview(page)).toContainText(body)
      await expect(preview(page)).toContainText('Ana Fictícia')
      await expect(draftForm(page).getByLabel(label, { exact: true })).toHaveValue('')
      expect(await writes(page)).toEqual(beforeWrites)
      await audio(page, 'Confirmar acréscimo')
      await expect(preview(page)).toHaveCount(0)
      await expect(draftForm(page).getByLabel(label, { exact: true })).toHaveValue(body)
      expect(await state(page)).toEqual(beforeClinical)
      expect(await writes(page)).toEqual(beforeWrites)
    }
    await audio(page, 'Usar comandos')
    for (const [, label, body] of fields) await expect(draftForm(page).getByLabel(label, { exact: true })).toHaveValue(body)
    const payload = { ...Object.fromEntries(fields.map(([key, , body]) => [key, body])), behaviorIds: ['behavior-created'], indicators: [{ id: 'participacao', value: 1, note: 'Apoio durante jogo fictício' }] }
    const saveCall = { command: 'session_draft_save', args: { id: 'draft-created', input: payload } }
    await command(page, 'Salvar rascunho', [saveCall])
    expect((await state(page)).drafts.find(item => item.id === 'draft-created')).toEqual({ id: 'draft-created', patientId: 'ana', seriesId: 'series-created', originalDate: date, ...payload })
    const savedWrites = await writes(page)
    await command(page, 'Finalizar sessão')
    await expect(page.getByRole('alertdialog', { name: 'Confirmar ação' })).toBeVisible()
    expect(await writes(page)).toEqual(savedWrites)
    expect((await state(page)).sessions).toEqual([])
    await audio(page, 'Confirmar')
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect.poll(() => writes(page)).toEqual([...savedWrites, saveCall, { command: 'session_finalize', args: { id: 'draft-created' } }])
    await expect(draftForm(page)).toHaveCount(0)
    const final = await state(page)
    expect(final.drafts).toEqual(original.drafts)
    expect(final.patients).toEqual(original.patients)
    expect(final.series.find(item => item.id === 'series-bia')).toEqual(original.series[0])
    expect(final.sessions).toHaveLength(1)
    expect(final.sessions[0]).toMatchObject({ id: 'draft-created', patientId: 'ana', seriesId: 'series-created', originalDate: date, sessionDate: date, start: '15:00', end: '15:50', ...payload, behaviors: [{ templateId: 'behavior-created', templateVersion: 2, title: 'Solicita pausa', description: 'Pede um intervalo curto durante a atividade.' }] })
    expect(final.behaviors[0]).toEqual(original.behaviors[0])
  })
}

test('áudio: homônimos recusam alvo simples; opção dois edita somente seu ID/revisão', async ({ page }) => {
  await openApp(page, { homonyms: true })
  const original = await state(page)
  await command(page, 'Abrir pacientes')
  await audio(page, 'Clicar em Editar de Ana Fictícia')
  await expect(preview(page)).toHaveCount(0)
  await expect(page.locator('.voice-command-error')).toContainText('mais de uma opção')
  await audio(page, 'Confirmar')
  await expect(page.getByRole('form', { name: 'Editar cadastro', exact: true })).toHaveCount(0)
  expect(await writes(page)).toEqual([])
  expect(await state(page)).toEqual(original)
  await command(page, 'Clicar em Editar de Ana Fictícia opção dois')
  const form = page.getByRole('form', { name: 'Editar cadastro', exact: true })
  await expect(form).toHaveAttribute('data-voice-record', 'bia')
  await expect(form).toHaveAttribute('data-voice-epoch', '7')
  await command(page, 'Preencher Idade em anos (opcional) com dez')
  const input = { name: 'Ana Fictícia', age: 10, lifeCycle: 'Criança', selfRequester: 'no', preferredModality: 'Online' }
  await command(page, 'Salvar alterações', [{ command: 'patient_update', args: { id: 'bia', revision: 7, input } }])
  expect((await state(page)).patients).toEqual([original.patients[0], { ...original.patients[1], ...input, revision: 8 }])
  expect((await state(page)).drafts).toEqual(original.drafts)
})
