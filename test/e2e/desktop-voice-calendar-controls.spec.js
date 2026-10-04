import { expect, test } from '@playwright/test'

async function openApp(page, { failStart = false, seed = false, failAuxiliary = '', pcm = false } = {}) {
  await page.clock.install({ time: new Date('2026-10-03T15:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-03T15:00:00Z'))
  await page.addInitScript(({ failStart, seed, failAuxiliary, pcm }) => {
    const clone = value => structuredClone(value)
    const patient = { id: 'lia', name: 'Lia Exemplo', revision: 1, archivedAt: null }
    const series = seed ? [{ id: 'seed', patientId: 'lia', startDate: '2026-10-31', endDate: '2026-10-31', weekday: 6, frequency: 'Avulsa', start: '14:00', end: '14:50', modality: 'Presencial', meetingLink: null }] : []
    const drafts = []
    const sessions = []
    const patients = [patient]
    if (pcm) {
      patients.push({ id: 'bia', name: 'Bia Fictícia', revision: 3, archivedAt: null })
      series.push({ id: 'seed-bia', patientId: 'bia', startDate: '2026-11-15', endDate: '2026-11-15', weekday: 0, frequency: 'Avulsa', start: '15:45', end: '16:35', modality: 'Online', meetingLink: null })
      drafts.push({ id: 'draft-bia', patientId: 'bia', seriesId: 'seed-bia', originalDate: '2026-11-15', observation: 'Concorrente preservado.', procedures: 'Procedimento concorrente.', outcomeDecision: 'Decisão concorrente.', referralClosure: '', behaviorIds: [], indicators: [] })
      sessions.push({ id: 'finished-bia', patientId: 'bia', seriesId: 'history-bia', originalDate: '2026-10-02', sessionDate: '2026-10-02', observation: 'Snapshot histórico preservado.', procedures: 'Histórico sintético.', outcomeDecision: 'Histórico intacto.', behaviors: [], indicators: [] })
    }
    let fail = failStart
    let auxiliaryFailed = false
    let refreshAfterStart = false
    const fixture = window.calendarVoice = { patients, series, drafts, sessions, calls: [], unexpected: [], unlocked: true }
    if (pcm) {
      const media = fixture.pcm = { transcripts: [], captures: [], refs: [], mediaRequests: 0, trackStops: 0, contextCloses: 0, sourceDisconnects: 0, processorDisconnects: 0 }
      class SyntheticAudioContext {
        constructor() { this.sampleRate = 8000; this.state = 'running'; this.destination = {} }
        createMediaStreamSource() { return { connect() {}, disconnect() { media.sourceDisconnects++ } } }
        createScriptProcessor() {
          const processor = { onaudioprocess: null, disconnect() { media.processorDisconnects++ } }
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
        close() { this.state = 'closed'; media.contextCloses++; return Promise.resolve() }
      }
      Object.defineProperty(window, 'AudioContext', { configurable: true, value: SyntheticAudioContext })
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
        media.mediaRequests++
        return { getTracks: () => [{ stop() { media.trackStops++ } }] }
      } } })
    }
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      if (pcm && command === 'voice_transcribe') {
        const media = fixture.pcm
        if (Object.keys(args).sort().join('|') !== 'patientNames|sampleRate|samples'
          || args.sampleRate !== 8000 || !Array.isArray(args.samples) || !args.samples.length
          || args.samples.length / args.sampleRate >= 12 || !args.samples.every(Number.isFinite)
          || !args.samples.some(value => value !== 0) || !args.samples.some(value => value === 0)
          || JSON.stringify(args.patientNames) !== JSON.stringify(patients.map(item => item.name))) {
          fixture.unexpected.push('Invalid PCM payload'); throw new Error('Invalid PCM payload')
        }
        const transcript = media.transcripts.shift()
        if (typeof transcript !== 'string' || !transcript.trim()) {
          fixture.unexpected.push('Missing fixed transcript'); throw new Error('Missing fixed transcript')
        }
        media.captures.push({ transcript, sampleCount: args.samples.length, sampleRate: args.sampleRate })
        media.refs.push(args)
        fixture.calls.push({ command })
        return transcript
      }
      window.calendarVoice.calls.push(clone({ command, args }))
      if (command === 'behavior_list' && series.length && !drafts.length && window.calendarVoice.pauseCreationRefresh && !window.calendarVoice.deferredCreationRefresh) {
        window.calendarVoice.deferredCreationRefresh = true
        return await new Promise((resolve, reject) => { window.calendarVoice.finishCreationRefresh = accepted => accepted ? resolve([]) : reject(new Error('Atualização fictícia atrasada')) })
      }
      if ((!auxiliaryFailed && failAuxiliary === 'after-create' && command === 'behavior_list' && series.length > 0 && drafts.length === 0) || (failAuxiliary === 'after-start' && command === 'indicator_catalog' && refreshAfterStart && !window.calendarVoice.releaseAuxiliary)) {
        auxiliaryFailed = true
        window.calendarVoice.auxiliaryFailure = command
        throw new Error('Falha sintética na atualização auxiliar')
      }
      if (command === 'vault_status') return { initialized: true, unlocked: window.calendarVoice.unlocked, profileState: 'ready' }
      if (command === 'vault_unlock') {
        if (window.calendarVoice.pauseUnlock) await new Promise(resolve => { window.calendarVoice.finishUnlock = resolve })
        window.calendarVoice.unlocked = true; return null
      }
      if (command === 'vault_lock') { window.calendarVoice.unlocked = false; return null }
      if (command === 'auto_backup_status') { if (drafts.length) refreshAfterStart = true; return { available: false, dirty: false } }
      if (command === 'plugin:updater|check') return null
      if (command === 'patient_list') return clone(patients)
      if (command === 'agenda_list_series') return clone(series)
      if (command === 'agenda_occurrences') return clone(series.filter(item => item.startDate >= args.from && item.startDate <= args.to).map(item => ({ id: `${item.id}:${item.startDate}`, seriesId: item.id, patientId: item.patientId, originalDate: item.startDate, date: item.startDate, start: item.start, end: item.end, frequency: item.frequency, modality: item.modality, status: 'scheduled' })))
      if (command === 'agenda_create_series') {
        if (pcm && (Object.keys(args).join('|') !== 'input' || Object.keys(args.input).sort().join('|') !== 'end|endDate|frequency|meetingLink|modality|patientId|start|startDate|weekday')) {
          fixture.unexpected.push('Invalid agenda payload'); throw new Error('Invalid agenda payload')
        }
        const saved = { ...clone(args.input), id: `series-${series.length + 1}` }; series.push(saved); return clone(saved)
      }
      if (command === 'session_draft_start') {
        if (pcm && (Object.keys(args).sort().join('|') !== 'originalDate|seriesId' || !series.some(item => item.id === args.seriesId && item.patientId === 'lia' && item.startDate === args.originalDate))) {
          fixture.unexpected.push('Invalid draft start identity'); throw new Error('Invalid draft start identity')
        }
        if (fail) { fail = false; throw new Error('Falha sintética ao iniciar') }
        const existing = drafts.find(item => item.seriesId === args.seriesId && item.originalDate === args.originalDate)
        if (existing) return clone(existing)
        const draft = { id: `draft-lia-${drafts.length + 1}`, patientId: 'lia', seriesId: args.seriesId, originalDate: args.originalDate, observation: '', procedures: '', outcomeDecision: '', referralClosure: '', behaviorIds: [], indicators: [] }
        drafts.push(draft)
        if (window.calendarVoice.pauseStart) return await new Promise((resolve, reject) => { window.calendarVoice.finishStart = accepted => accepted ? resolve(clone(draft)) : reject(new Error('Início fictício atrasado')) })
        return clone(draft)
      }
      if (command === 'session_draft_list') return clone(drafts.filter(item => item.patientId === args.patientId))
      if (command === 'session_timeline') return clone(sessions.filter(item => item.patientId === args.patientId))
      if (command === 'session_draft_save') {
        const draft = drafts.find(item => item.id === args.id)
        if (!draft) throw new Error('Rascunho ausente')
        Object.assign(draft, clone(args.input)); return clone(draft)
      }
      if (command === 'session_finalize') {
        const draft = drafts.find(item => item.id === args.id)
        if (!draft || !draft.observation.trim() || !draft.procedures.trim() || !draft.outcomeDecision.trim()) throw new Error('Registro incompleto')
        const origin = series.find(item => item.id === draft.seriesId)
        const saved = { ...clone(draft), id: 'finished-lia', sessionDate: draft.originalDate, start: origin.start, end: origin.end, modality: origin.modality, behaviors: [], indicators: [], recordedAt: '2026-10-03T15:00:00Z' }
        sessions.push(saved); drafts.splice(drafts.indexOf(draft), 1); return clone(saved)
      }
      if (['agenda_history', 'behavior_list', 'indicator_catalog', 'related_party_list', 'session_addendum_list', 'case_context_list'].includes(command)) return []
      window.calendarVoice.unexpected.push(command)
      throw new Error(`Invoke sem fixture: ${command}`)
    } }
  }, { failStart, seed, failAuxiliary, pcm })
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Comando do Círculo' })).toBeVisible()
}

test('encaminhamento por voz: preencher, limpar, salvar e recusar/confirmar finalização', async ({ page }) => {
  await openApp(page)
  await command(page, 'Clicar em Registrar sessão')
  await command(page, 'Clicar em Criar e iniciar sessão')
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toBeVisible()
  const label = 'Encaminhamento ou encerramento (opcional)'
  await command(page, `Preencher ${label} com Texto a limpar`)
  await command(page, `Limpar ${label}`)
  await expect(page.getByLabel(label)).toHaveValue('')
  await command(page, 'Clicar em Salvar rascunho')
  expect((await calls(page, 'session_draft_save')).at(-1).args.input.referralClosure).toBe('')
  for (const [field, value] of [['Observações descritivas', 'Observação sintética'], ['Procedimentos realizados', 'Procedimento sintético'], ['Resultado e decisão', 'Resultado sintético'], [label, 'Encaminhamento inteiramente fictício']]) {
    await command(page, `Preencher ${field} com ${value}`)
  }
  await command(page, 'Clicar em Finalizar sessão')
  await expect(page.getByRole('alertdialog', { name: 'Confirmar ação' })).toBeVisible()
  await propose(page, 'voltar')
  expect(await calls(page, 'session_finalize')).toEqual([])
  await expect(page.getByLabel(label)).toHaveValue('Encaminhamento inteiramente fictício')
  await command(page, 'Clicar em Finalizar sessão')
  await propose(page, 'confirmar')
  await expect.poll(async () => (await calls(page, 'session_finalize')).length).toBe(1)
  expect((await calls(page, 'session_draft_save')).at(-1).args.input.referralClosure).toBe('Encaminhamento inteiramente fictício')
  await command(page, 'Clicar em Evolução e escalas registradas · Adicionar adendo')
  await expect(page.locator('[data-voice-record="session:finished-lia"]')).toContainText('Encaminhamento inteiramente fictício')
  expect(await page.evaluate(() => window.calendarVoice.drafts)).toEqual([])
  expect(await page.evaluate(() => window.calendarVoice.sessions)).toHaveLength(1)
})

async function propose(page, text) {
  const assistant = page.getByRole('region', { name: 'Comando do Círculo' })
  await assistant.getByLabel('Seu comando').fill(text)
  await assistant.getByRole('button', { name: 'Preparar rascunho' }).click()
}

async function command(page, text) {
  await propose(page, text)
  await expect(page.locator('.voice-command-preview'), text).toBeVisible()
  await propose(page, 'confirmar')
  await page.clock.runFor(32)
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
}

const calls = (page, commandName) => page.evaluate(name => window.calendarVoice.calls.filter(item => item.command === name), commandName)

test('pedido natural com em data exige confirmação antes de iniciar a sessão exata', async ({ page }) => {
  await openApp(page, { seed: true })
  await propose(page, 'Iniciar sessão de Lia Exemplo em 31/10/2026 às 14 horas')
  await expect(page.locator('.voice-command-preview')).toContainText('Lia Exemplo em 31/10/2026 às 14:00')
  expect(await calls(page, 'session_draft_start')).toEqual([])
  await propose(page, 'confirmar')
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toBeVisible()
  expect((await calls(page, 'session_draft_start')).map(item => item.args)).toEqual([{ seriesId: 'seed', originalDate: '2026-10-31' }])
  expect(await calls(page, 'agenda_create_series')).toEqual([])
  expect(await page.evaluate(() => window.calendarVoice.unexpected)).toEqual([])
})

for (const natural of [false, true]) test(`resultado antigo de início não libera busy do novo desbloqueio: ${natural ? 'pedido natural' : 'botão'}`, async ({ page }) => {
  await openApp(page, { seed: natural })
  if (!natural) await command(page, 'Clicar em Registrar sessão')
  await page.evaluate(() => { window.calendarVoice.pauseStart = true })
  await command(page, natural ? 'Iniciar sessão de Lia Exemplo no dia 31/10/2026 às 14 horas' : 'Clicar em Criar e iniciar sessão')
  await expect.poll(() => page.evaluate(() => typeof window.calendarVoice.finishStart)).toBe('function')
  await page.evaluate(() => { window.calendarVoice.unlocked = false; window.calendarVoice.pauseUnlock = true; window.dispatchEvent(new Event('focus')) })
  await expect(page.getByLabel('Senha do cofre')).toBeVisible()
  await page.getByLabel('Senha do cofre').fill('senha-ficticia-2026')
  const unlock = page.getByRole('button', { name: 'Desbloquear', exact: true })
  await unlock.click()
  await expect.poll(() => page.evaluate(() => typeof window.calendarVoice.finishUnlock)).toBe('function')
  await page.evaluate(() => window.calendarVoice.finishStart(true))
  await page.clock.runFor(64)
  await expect(unlock).toBeDisabled()
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toHaveCount(0)
  await page.evaluate(() => window.calendarVoice.finishUnlock())
  await expect(page.getByRole('region', { name: 'Início', exact: true })).toBeVisible()
})

for (const accepted of [true, false]) {
  test(`início por voz ignora resultado do cofre anterior: ${accepted ? 'sucesso' : 'erro'}`, async ({ page }) => {
    await openApp(page)
    await command(page, 'Clicar em Registrar sessão')
    await page.evaluate(() => { window.calendarVoice.pauseStart = true })
    await command(page, 'Clicar em Criar e iniciar sessão')
    await expect.poll(() => page.evaluate(() => typeof window.calendarVoice.finishStart)).toBe('function')
    await page.evaluate(() => { window.calendarVoice.unlocked = false; window.dispatchEvent(new Event('focus')) })
    await expect(page.getByLabel('Senha do cofre')).toBeVisible()
    await page.getByLabel('Senha do cofre').fill('senha-ficticia-2026')
    await page.getByRole('button', { name: 'Desbloquear', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Início', exact: true })).toBeVisible()
    await page.evaluate(value => window.calendarVoice.finishStart(value), accepted)
    await page.clock.runFor(64)
    await expect(page.getByRole('region', { name: 'Início', exact: true })).toBeVisible()
    await expect(page.getByText(/Início fictício atrasado|Sessão aberta\./)).toHaveCount(0)
    await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toHaveCount(0)
    expect(await calls(page, 'session_draft_start')).toHaveLength(1)
    expect(await page.evaluate(() => window.calendarVoice.drafts)).toHaveLength(1)
    await command(page, 'Abrir agenda')
    await expect(page.getByRole('region', { name: 'Agenda', exact: true })).toBeVisible()
  })

  test(`criação por voz não continua após novo desbloqueio: refresh ${accepted ? 'resolvido' : 'rejeitado'}`, async ({ page }) => {
    await openApp(page)
    await command(page, 'Clicar em Registrar sessão')
    await command(page, 'Preencher Data do compromisso com 15/11/2026')
    await page.evaluate(() => { window.calendarVoice.pauseCreationRefresh = true })
    await command(page, 'Clicar em Criar e iniciar sessão')
    await expect.poll(() => page.evaluate(() => typeof window.calendarVoice.finishCreationRefresh)).toBe('function')
    await page.evaluate(() => { window.calendarVoice.unlocked = false; window.dispatchEvent(new Event('focus')) })
    await expect(page.getByLabel('Senha do cofre')).toBeVisible()
    await page.getByLabel('Senha do cofre').fill('senha-ficticia-2026')
    await page.getByRole('button', { name: 'Desbloquear', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Início', exact: true })).toBeVisible()
    await page.evaluate(value => window.calendarVoice.finishCreationRefresh(value), accepted)
    await page.clock.runFor(64)
    await expect(page.getByRole('region', { name: 'Início', exact: true })).toBeVisible()
    expect(await calls(page, 'session_draft_start')).toEqual([])
    expect(await page.evaluate(() => window.calendarVoice.series)).toHaveLength(1)
    expect(await page.evaluate(() => window.calendarVoice.drafts)).toEqual([])
  })
}

for (const failAuxiliary of ['after-create', 'after-start']) {
  test(`sessão por voz preserva sucesso parcial e ID no retry: ${failAuxiliary}`, async ({ page }) => {
    await openApp(page, { failAuxiliary })
    await command(page, 'Clicar em Registrar sessão')
    await command(page, 'Preencher Data do compromisso com 15/11/2026')
    await command(page, 'Clicar em Criar e iniciar sessão')
    await expect(page.getByRole('heading', { name: 'Rascunho da ocorrência 2026-11-15' })).toBeVisible()
    expect(await page.evaluate(() => window.calendarVoice.auxiliaryFailure)).toBe(failAuxiliary === 'after-create' ? 'behavior_list' : 'indicator_catalog')
    if (failAuxiliary === 'after-start') {
      await expect(page.getByText(/Sessão aberta\. Não foi possível atualizar informações auxiliares:/)).toBeVisible()
      await page.evaluate(() => { window.calendarVoice.releaseAuxiliary = true })
    }
    await expect(page.getByText('Compromisso criado, mas a sessão não iniciou. Use Iniciar sessão no compromisso exibido abaixo.')).toHaveCount(0)
    await command(page, 'Preencher Observações descritivas com Conteúdo fictício preservado')
    await command(page, 'Clicar em Salvar rascunho')
    const original = await page.evaluate(() => window.calendarVoice.drafts[0].id)
    await command(page, 'Clicar em Fechar sessões')
    await command(page, 'Mostrar agenda do dia 15/11/2026')
    await command(page, 'Clicar em Detalhes e ações')
    await command(page, 'Clicar em Iniciar sessão de Lia Exemplo em 2026-11-15 às 14:00–14:50')
    await expect(page.getByLabel('Observações descritivas')).toHaveValue('Conteúdo fictício preservado')
    expect(await calls(page, 'agenda_create_series')).toHaveLength(1)
    expect(await calls(page, 'session_draft_start')).toHaveLength(2)
    expect(await page.evaluate(() => window.calendarVoice.drafts.map(item => item.id))).toEqual([original])
  })
}
test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.calendarVoice?.unexpected || [])).toEqual([])
  if (page.calendarPCMBoundary) {
    expect(page.calendarPCMBoundary).toEqual([])
    const status = await page.evaluate(() => {
      const media = window.calendarVoice.pcm
      return { queued: media.transcripts, count: media.captures.length,
        releases: [media.mediaRequests, media.trackStops, media.contextCloses, media.sourceDisconnects, media.processorDisconnects],
        cleared: media.refs.every(args => args.samples.every(sample => sample === 0) && args.patientNames.every(name => name === '')) }
    })
    expect(status.queued).toEqual([])
    expect(status.releases).toEqual(Array(5).fill(status.count))
    expect(status.cleared).toBe(true)
  }
})

async function calendarAudio(page, text) {
  const assistant = page.getByRole('region', { name: 'Comando do Círculo', exact: true })
  const before = await page.evaluate(() => window.calendarVoice.pcm.captures.length)
  await page.evaluate(transcript => window.calendarVoice.pcm.transcripts.push(transcript), text)
  const listen = assistant.getByRole('button', { name: 'Ouvir comando', exact: true })
  await expect(listen).toBeEnabled()
  await listen.click()
  await expect(listen).toBeDisabled()
  await page.clock.runFor(1600)
  await expect(listen).toBeEnabled()
  await expect.poll(() => page.evaluate(() => window.calendarVoice.pcm.captures.length)).toBe(before + 1)
  await expect(assistant.getByLabel('Seu comando')).toHaveValue(text)
  await expect(assistant).not.toContainText('pode estar incompleta')
}

test('PCM: Registrar sessão → Criar e iniciar sessão exige dois áudios e preserva concorrentes', async ({ page, baseURL }) => {
  page.calendarPCMBoundary = []
  page.on('dialog', async dialog => { page.calendarPCMBoundary.push(`native dialog: ${dialog.type()}`); await dialog.dismiss() })
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) await route.continue()
    else { page.calendarPCMBoundary.push(route.request().url()); await route.abort() }
  })
  await openApp(page, { seed: true, pcm: true })
  const snapshot = () => page.evaluate(() => {
    const { patients, series, drafts, sessions } = window.calendarVoice
    return structuredClone({ patients, series, drafts, sessions })
  })
  const writes = () => page.evaluate(() => window.calendarVoice.calls.filter(item => ['agenda_create_series', 'session_draft_start', 'session_draft_save', 'session_finalize'].includes(item.command)))
  const original = await snapshot()
  const preview = page.locator('.voice-command-preview')
  const appointment = page.getByRole('form', { name: 'Novo compromisso', exact: true })
  await calendarAudio(page, 'Clicar em Registrar sessão')
  await expect(preview).toContainText('Confira a proposta')
  await expect(appointment).toHaveCount(0)
  expect(await snapshot()).toEqual(original)
  expect(await writes()).toEqual([])
  await calendarAudio(page, 'Confirmar')
  await expect(preview).toHaveCount(0)
  await expect(appointment).toBeVisible()
  await expect(appointment.getByLabel('Paciente', { exact: true })).toHaveValue('lia')
  await expect(appointment.getByRole('button', { name: 'Criar e iniciar sessão', exact: true })).toBeEnabled()
  expect(await snapshot()).toEqual(original)
  expect(await writes()).toEqual([])

  for (const [label, value] of [['Data do compromisso', '2026-11-15'], ['Horário inicial', '15:45'], ['Horário final', '16:35']]) {
    const before = await appointment.getByLabel(label, { exact: true }).inputValue()
    await calendarAudio(page, `Preencher ${label} com ${value}`)
    await expect(preview).toContainText('Confira a proposta')
    await expect(appointment.getByLabel(label, { exact: true })).toHaveValue(before)
    expect(await snapshot()).toEqual(original)
    expect(await writes()).toEqual([])
    await calendarAudio(page, 'Confirmar')
    await expect(preview).toHaveCount(0)
    await expect(appointment.getByLabel(label, { exact: true })).toHaveValue(value)
    expect(await snapshot()).toEqual(original)
    expect(await writes()).toEqual([])
  }
  await calendarAudio(page, 'Clicar em Criar e iniciar sessão')
  await expect(preview).toContainText('Confira a proposta')
  expect(await snapshot()).toEqual(original)
  expect(await writes()).toEqual([])
  await expect(page.getByRole('form', { name: 'Rascunho de sessão', exact: true })).toHaveCount(0)
  await calendarAudio(page, 'Confirmar')
  const input = { patientId: 'lia', weekday: 0, startDate: '2026-11-15', endDate: '2026-11-15', start: '15:45', end: '16:35', frequency: 'Avulsa', modality: 'Presencial', meetingLink: null }
  await expect.poll(writes).toEqual([
    { command: 'agenda_create_series', args: { input } },
    { command: 'session_draft_start', args: { seriesId: 'series-3', originalDate: '2026-11-15' } },
  ])
  const draft = { id: 'draft-lia-2', patientId: 'lia', seriesId: 'series-3', originalDate: '2026-11-15', observation: '', procedures: '', outcomeDecision: '', referralClosure: '', behaviorIds: [], indicators: [] }
  await expect(page.getByRole('form', { name: 'Rascunho de sessão', exact: true })).toHaveAttribute('data-voice-record', draft.id)
  await expect(page.getByRole('heading', { name: 'Rascunho da ocorrência 2026-11-15', exact: true })).toBeVisible()
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue('lia')
  expect(await snapshot()).toEqual({ ...original, series: [...original.series, { ...input, id: 'series-3' }], drafts: [...original.drafts, draft] })
  expect(await page.evaluate(() => window.calendarVoice.pcm.captures.map(item => item.transcript))).toEqual([
    'Clicar em Registrar sessão', 'Confirmar', 'Preencher Data do compromisso com 2026-11-15', 'Confirmar',
    'Preencher Horário inicial com 15:45', 'Confirmar', 'Preencher Horário final com 16:35', 'Confirmar',
    'Clicar em Criar e iniciar sessão', 'Confirmar',
  ])
})

test('calendário: controles mensais/diários, detalhes e fechamento por voz', async ({ page }) => {
  await openApp(page, { seed: true })
  await command(page, 'Abrir agenda')
  await command(page, 'Clicar em Mês')
  await command(page, 'Preencher Data de referência com 31/10/2026')
  await expect(page.getByLabel('Data de referência')).toHaveValue('2026-10-31')
  await command(page, 'Clicar em Próximo')
  await expect(page.getByLabel('Data de referência')).toHaveValue('2026-11-30')
  await expect(page.locator('.agenda-month-day:not(.outside)')).toHaveCount(30)
  await command(page, 'Clicar em Anterior')
  await expect(page.getByLabel('Data de referência')).toHaveValue('2026-10-30')
  await command(page, 'Clicar em Hoje')
  await expect(page.getByLabel('Data de referência')).toHaveValue('2026-10-03')
  await command(page, 'Clicar em Ver dia 2026-10-31')
  await expect(page.getByRole('button', { name: 'Dia', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await command(page, 'Clicar em Próximo')
  await expect(page.getByLabel('Data de referência')).toHaveValue('2026-11-01')
  await command(page, 'Clicar em Anterior')
  await command(page, 'Clicar em Ver ações de Lia Exemplo em 2026-10-31 às 14:00–14:50')
  await expect(page.locator('#agenda-details-panel')).toBeVisible()
  await command(page, 'Clicar em Fechar detalhes')
  await expect(page.locator('#agenda-details-panel')).toBeHidden()
  await command(page, 'Clicar em Fechar Agenda')
  await expect(page.getByRole('region', { name: 'Pacientes', exact: true })).toBeVisible()
  expect(await calls(page, 'agenda_create_series')).toEqual([])
  expect(await calls(page, 'session_draft_start')).toEqual([])
})

for (const failStart of [false, true]) {
  test(`criar e iniciar sessão por voz${failStart ? ': falha e retry sem duplicação' : ''}`, async ({ page }) => {
    await openApp(page, { failStart })
    await command(page, 'Clicar em Registrar sessão')
    await expect(page.getByRole('button', { name: 'Criar e iniciar sessão' })).toBeVisible()
    await command(page, 'Preencher Data do compromisso com 15/11/2026')
    await propose(page, 'Clicar em Criar e iniciar sessão')
    await expect(page.locator('.voice-command-preview')).toBeVisible()
    expect(await calls(page, 'agenda_create_series')).toEqual([])
    await propose(page, 'confirmar')
    await page.clock.runFor(32)
    if (failStart) {
      await expect(page.getByText('Compromisso criado, mas a sessão não iniciou. Use Iniciar sessão no compromisso exibido abaixo.')).toBeVisible()
      await command(page, 'Clicar em Detalhes e ações')
      await command(page, 'Clicar em Iniciar sessão de Lia Exemplo em 2026-11-15 às 14:00–14:50')
    }
    await expect(page.getByRole('heading', { name: 'Rascunho da ocorrência 2026-11-15' })).toBeVisible()
    expect(await calls(page, 'agenda_create_series')).toEqual([{ command: 'agenda_create_series', args: { input: { patientId: 'lia', weekday: 0, startDate: '2026-11-15', endDate: '2026-11-15', start: '14:00', end: '14:50', frequency: 'Avulsa', modality: 'Presencial', meetingLink: null } } }])
    expect(await calls(page, 'session_draft_start')).toEqual(Array.from({ length: failStart ? 2 : 1 }, () => ({ command: 'session_draft_start', args: { seriesId: 'series-1', originalDate: '2026-11-15' } })))
    expect(await page.evaluate(() => window.calendarVoice.drafts)).toHaveLength(1)
    await command(page, 'Clicar em Fechar sessões')
    await expect(page.getByRole('region', { name: 'Pacientes', exact: true })).toBeVisible()
  })
}
