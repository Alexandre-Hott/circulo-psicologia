import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const nativeVoiceCorpus = JSON.parse(readFileSync(new URL('../fixtures/native-voice-20261003.json', import.meta.url), 'utf8'))
const nativeSaveCorpus = JSON.parse(readFileSync(new URL('../fixtures/native-voice-save-20261004.json', import.meta.url), 'utf8'))
const nativeOccurrenceCorpus = JSON.parse(readFileSync(new URL('../fixtures/native-voice-occurrence-20261004.json', import.meta.url), 'utf8'))
const nativeFieldsCorpus = JSON.parse(readFileSync(new URL('../fixtures/native-voice-fields-20261004.json', import.meta.url), 'utf8'))
const nativeWeekdayCorpus = JSON.parse(readFileSync(new URL('../fixtures/native-voice-weekday-20261004.json', import.meta.url), 'utf8'))
const nativePartyCorpus = JSON.parse(readFileSync(new URL('../fixtures/native-voice-party-20261004.json', import.meta.url), 'utf8'))
const nativeDrawerCorpus = JSON.parse(readFileSync(new URL('../fixtures/native-voice-drawer-20261004.json', import.meta.url), 'utf8'))
const nativeRemoveCorpus = JSON.parse(readFileSync(new URL('../fixtures/native-voice-remove-20261004.json', import.meta.url), 'utf8'))

async function openApp(page, { emptyLibrary = false, archivedPatient = false, specialCatalog = false, nativeCatalog = false } = {}) {
  await page.clock.install({ time: new Date('2026-10-03T15:00:00Z') })
  await page.addInitScript(({ emptyLibrary, archivedPatient, specialCatalog, nativeCatalog }) => {
    window.writes = []
    window.voiceTranscript = ''
    window.voiceFailure = null
    window.analyticsRequests = []
    window.voiceNativeCalls = []
    const media = window.voiceMedia = { mediaRequests: 0, trackStops: 0, contextCloses: 0,
      sourceDisconnects: 0, processorDisconnects: 0, captures: [], captureRefs: [] }
    const patients = [{ id: 'ana', name: 'Ana Clara', age: 8, revision: 1, preferredModality: 'Presencial', archivedAt: null }]
    const behaviors = [{ id: 'help', title: 'Pede ajuda', description: '', version: 1 }]
    if (specialCatalog) {
      behaviors.push({ id: 'long-title', title: 'Pede ajuda para o adulto', description: '', version: 1 })
      patients.push({ id: 'caio', name: 'Caio Fictício', age: 11, revision: 1, archivedAt: null })
    }
    if (emptyLibrary) behaviors.length = 0
    if (archivedPatient) patients.push({ id: 'archived', name: 'Bia Arquivada', age: 30, revision: 1, preferredModality: 'Online', archivedAt: '2026-09-01' })
    const occurrence = { id: 'occ', seriesId: 'series', patientId: 'ana', date: '2026-10-03', originalDate: '2026-10-03', start: '15:00', end: '15:50', frequency: 'Avulsa', modality: 'Presencial', status: 'scheduled' }
    let draft = { id: 'draft', patientId: 'ana', originalDate: '2026-10-03', observation: '', procedures: '', outcomeDecision: '', referralClosure: '', behaviorIds: [], indicators: [] }
    // Two speech frames followed by trailing silence, matching the 76 replay
    // fixtures. Continuous signal correctly reaches the 12-second cutoff.
    class SyntheticAudioContext {
      constructor() { this.sampleRate = 8_000; this.state = 'running'; this.destination = {} }
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
    window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
      window.voiceNativeCalls.push({ command, args })
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { available: false, dirty: false }
      if (command === 'patient_list') return patients.filter(patient => args?.includeArchived || patient.archivedAt == null)
      if (command === 'related_party_list') return []
      if (command === 'behavior_list') return window.voiceBehaviorCatalog ?? behaviors
      if (command === 'indicator_catalog') return nativeCatalog ? [{ id: 'reg', name: 'Regulação emocional', definition: 'Uso de recursos para lidar com emoções intensas.', version: 1, labels: ['Ainda não observado', 'Com muito apoio', 'Com algum apoio', 'Com autonomia'] }] : specialCatalog ? [{ id: 'group', name: 'Participação em grupo como apoio', version: 1, labels: ['Com apoio em grupo', 'Sem apoio'] }] : []
      if (command === 'voice_transcribe') {
        media.captures.push(structuredClone(args))
        media.captureRefs.push(args)
        if (window.voiceFailure) throw new Error(window.voiceFailure)
        return window.deferVoice ? await new Promise(resolve => { window.resolveVoice = resolve }) : window.voiceTranscript
      }
      if (command === 'agenda_occurrences') return (window.voiceOccurrences || [occurrence]).filter(item => item.date >= args.from && item.date <= args.to)
      if (command === 'session_draft_start') return draft
      if (command === 'session_timeline') return window.deferTimeline ? await new Promise(resolve => { window.resolveTimeline = resolve }) : window.voiceTimeline || []
      if (command === 'session_draft_list') return window.voiceDrafts || []
      if (command === 'case_context_list' && window.deferContexts) return await new Promise(resolve => { window.resolveContexts = resolve })
      if (command === 'session_draft_cancel') { window.writes.push({ command, args }); window.voiceDrafts = (window.voiceDrafts || []).filter(item => item.id !== args.id); return null }
      if (['agenda_list_series', 'agenda_history', 'session_timeline', 'session_addendum_list', 'case_context_list', 'session_draft_list'].includes(command)) return []
      if (command === 'patient_create') { const saved = { id: 'bia', revision: 1, archivedAt: null, ...args.input }; patients.push(saved); window.writes.push({ command, args }); return saved }
      if (command === 'patient_update') { const index = patients.findIndex(item => item.id === args.id); patients[index] = { ...patients[index], ...args.input, revision: patients[index].revision + 1 }; window.writes.push({ command, args }); return patients[index] }
      if (command === 'patient_archive' || command === 'patient_restore') { const patient = patients.find(item => item.id === args.id); patient.archivedAt = command === 'patient_archive' ? '2026-10-03' : null; patient.revision++; window.writes.push({ command, args }); return { ...patient } }
      if (command === 'behavior_create') { const saved = { id: 'wait', title: args.title, description: args.description, version: 1 }; behaviors.push(saved); window.writes.push({ command, args }); return saved }
      if (command === 'behavior_update') { const saved = behaviors.find(item => item.id === args.id); Object.assign(saved, args, { version: saved.version + 1 }); window.writes.push({ command, args }); return saved }
      if (command === 'session_draft_save') { draft = { ...draft, ...args.input }; window.writes.push({ command, args }); return draft }
      if (command === 'session_finalize') { window.writes.push({ command, args }); return null }
      if (command === 'session_addendum_create') { window.writes.push({ command, args }); return { id: 'new-addendum', ...args, createdAt: '2026-10-03T12:00:00Z' } }
      if (command === 'agenda_create_series') { window.writes.push({ command, args }); return { id: 'series-2', ...args.input } }
      if (command === 'analytics_overview') { window.analyticsRequests.push(args); return { totalCompletedSessions: 0, uniquePatients: 0, dailyCounts: [], monthlyCounts: [], behaviorCounts: [] } }
      if (command === 'plugin:updater|check') return null
      return null
    } }
  }, { emptyLibrary, archivedPatient, specialCatalog, nativeCatalog })
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Comando do Círculo' })).toBeVisible()
}

async function propose(page, text) {
  const assistant = page.getByRole('region', { name: 'Comando do Círculo' })
  await assistant.getByLabel('Seu comando').fill(text)
  await assistant.getByRole('button', { name: 'Preparar rascunho' }).click()
}

async function expectAudioCleanup(page) {
  const media = await page.evaluate(() => {
    const media = window.voiceMedia
    return { captures: media.captures,
      counters: [media.mediaRequests, media.trackStops, media.contextCloses, media.sourceDisconnects, media.processorDisconnects],
      erased: media.captureRefs.length === media.captures.length && media.captureRefs.every(args =>
        args.samples.every(sample => sample === 0) && args.patientNames.every(name => name === '')) }
  })
  expect(media.captures.length).toBeGreaterThan(0)
  expect(media.counters).toEqual(Array(5).fill(media.captures.length))
  expect(media.erased).toBe(true)
  for (const args of media.captures) {
    expect(args.sampleRate).toBe(8000)
    expect(args.samples.length).toBeGreaterThan(0)
    expect(args.samples.some(sample => sample !== 0)).toBe(true)
    expect(args.samples.length / args.sampleRate).toBeLessThan(12)
  }
  await expect(page.getByRole('region', { name: 'Comando do Círculo' })
    .getByText(/A captura atingiu .*segundos e pode estar incompleta/u)).toHaveCount(0)
}

async function finishAudio(page) {
  await page.clock.runFor(1600)
  await expect(page.getByRole('region', { name: 'Comando do Círculo' })
    .getByRole('button', { name: 'Ouvir comando', exact: true })).toBeEnabled()
  await expectAudioCleanup(page)
}
async function command(page, text) {
  await propose(page, text)
  await expect(page.locator('.voice-command-preview')).toBeVisible()
  await propose(page, 'confirmar')
}

test('gavetas naturais da Agenda abrem e recolhem sem alternar por repetição nem gravar', async ({ page }) => {
  await openApp(page)
  await command(page, 'Abrir Agenda')
  const form = page.getByRole('form', { name: 'Novo compromisso', exact: true })
  await propose(page, 'Abrir Novo compromisso')
  await expect(page.locator('.voice-command-preview')).toContainText('Abrir Novo compromisso')
  await expect(form).toHaveCount(0)
  await propose(page, 'Abrir Novo compromisso')
  await page.locator('button[aria-controls="agenda-create-panel"]').click()
  await propose(page, 'confirmar')
  await expect(form).toBeVisible()
  await propose(page, 'Recolher Novo compromisso')
  await page.locator('button[aria-controls="agenda-create-panel"]').click()
  await propose(page, 'confirmar')
  await expect(form).toHaveCount(0)
  await command(page, 'Abrir Novo compromisso')
  await expect(form).toBeVisible()
  await command(page, 'Preencher Horário inicial com três da tarde')
  await command(page, 'Abrir Novo compromisso')
  await expect(form).toBeVisible()
  await expect(form.getByLabel('Horário inicial', { exact: true })).toHaveValue('15:00')
  await command(page, 'Recolher Novo compromisso')
  await expect(form).toHaveCount(0)
  await command(page, 'Fechar Novo compromisso')
  await expect(form).toHaveCount(0)
  await command(page, 'Abrir Novo compromisso')
  await expect(form.getByLabel('Horário inicial', { exact: true })).toHaveValue('15:00')
  await command(page, 'Abrir Detalhes e ações')
  await expect(page.locator('#agenda-details-panel')).toBeVisible()
  await command(page, 'Abrir Detalhes e ações')
  await expect(page.locator('#agenda-details-panel')).toBeVisible()
  await command(page, 'Recolher Detalhes e ações')
  await expect(page.locator('#agenda-details-panel')).toHaveCount(0)
  expect(await page.evaluate(() => window.writes)).toEqual([])
})

test('gaveta da Agenda exige áudio de confirmação para abrir e recolher', async ({ page }) => {
  await openApp(page)
  await command(page, 'Abrir Agenda')
  const assistant = page.getByRole('region', { name: 'Comando do Círculo' })
  const form = page.getByRole('form', { name: 'Novo compromisso', exact: true })
  async function audio(text) {
    // Synthetic transcript/media/IPC: not physical-microphone evidence.
    await page.evaluate(value => { window.voiceTranscript = value }, text)
    await assistant.getByRole('button', { name: 'Ouvir comando' }).click()
    await finishAudio(page)
    await expect(assistant.getByRole('button', { name: 'Ouvir comando' })).toBeEnabled()
  }
  await audio('Abrir Novo compromisso')
  await expect(page.locator('.voice-command-preview')).toContainText('Abrir Novo compromisso')
  await expect(form).toHaveCount(0)
  await audio('Confirmar comando')
  await expect(form).toBeVisible()
  await audio('Recolher Novo compromisso')
  await expect(page.locator('.voice-command-preview')).toContainText('Recolher Novo compromisso')
  await expect(form).toBeVisible()
  await audio('Confirmar comando')
  await expect(form).toHaveCount(0)
  expect(await page.evaluate(() => window.voiceNativeCalls.filter(call => call.command === 'voice_transcribe').length)).toBe(4)
  expect(await page.evaluate(() => window.writes)).toEqual([])
})

test('gavetas: replay das transcrições Rust abre formulário e recolhe detalhes após segundo áudio', async ({ page }) => {
  await openApp(page)
  await command(page, 'Abrir Agenda')
  await command(page, 'Clicar em Detalhes e ações')
  const assistant = page.getByRole('region', { name: 'Comando do Círculo' })
  const form = page.getByRole('form', { name: 'Novo compromisso', exact: true })
  const details = page.locator('#agenda-details-panel')
  async function audio(index) {
    // Real, unedited Rust transcripts; media/IPC are simulated, not a physical microphone.
    await page.evaluate(value => { window.voiceTranscript = value }, nativeDrawerCorpus.find(item => item.Index === index).Transcript)
    await assistant.getByRole('button', { name: 'Ouvir comando' }).click()
    await finishAudio(page)
    await expect(assistant.getByRole('button', { name: 'Ouvir comando' })).toBeEnabled()
  }
  await audio(0)
  await expect(page.locator('.voice-command-preview')).toContainText('Abrir Novo compromisso')
  await expect(form).toHaveCount(0)
  await expect(details).toBeVisible()
  await audio(2)
  await expect(form).toBeVisible()
  await expect(details).toBeVisible()
  await command(page, 'Preencher Horário inicial com três da tarde')
  await audio(1)
  await expect(page.locator('.voice-command-preview')).toContainText('Recolher Detalhes e ações')
  await expect(details).toBeVisible()
  await expect(form).toBeVisible()
  await expect(form.getByLabel('Horário inicial', { exact: true })).toHaveValue('15:00')
  await audio(2)
  await expect(details).toHaveCount(0)
  await expect(form).toBeVisible()
  await expect(form.getByLabel('Horário inicial', { exact: true })).toHaveValue('15:00')
  expect(await page.evaluate(() => window.voiceNativeCalls.filter(call => call.command === 'voice_transcribe').length)).toBe(4)
  expect(await page.evaluate(() => window.writes)).toEqual([])
})

test('recolher Contexto do caso descarta abertura natural que aguarda consulta', async ({ page }) => {
  await openApp(page)
  await page.evaluate(() => { window.deferContexts = true })
  await command(page, 'Abrir contexto do caso de Ana Clara')
  await expect.poll(() => page.evaluate(() => typeof window.resolveContexts)).toBe('function')
  const panel = page.getByRole('form', { name: 'Nova revisão do contexto do caso', includeHidden: true }).locator('..')
  await command(page, 'Recolher Contexto do caso')
  await expect(panel).not.toHaveAttribute('open', '')
  await page.evaluate(() => { window.resolveContexts([]); window.deferContexts = false })
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue('ana')
  await expect(panel).not.toHaveAttribute('open', '')
  expect(await page.evaluate(() => window.writes)).toEqual([])
})

test('recolher Evolução descritiva descarta adendo pendente sem reabrir editor', async ({ page }) => {
  await openApp(page)
  await page.evaluate(() => { window.voiceTimeline = [{ id: 'late-close', patientId: 'ana', sessionDate: '2026-10-03', start: '15:00', end: '15:50', behaviors: [], indicators: [] }] })
  await command(page, 'Abrir registros de Ana Clara')
  await page.evaluate(() => { window.deferTimeline = true })
  await command(page, 'Adicionar adendo à sessão de Ana Clara de 03/10/2026 às 15:00')
  await expect.poll(() => page.evaluate(() => typeof window.resolveTimeline)).toBe('function')
  await command(page, 'Recolher Evolução e escalas registradas · Adicionar adendo')
  await page.evaluate(() => { window.deferTimeline = false; window.resolveTimeline(window.voiceTimeline) })
  await expect(page.locator('#session-evolution')).not.toHaveAttribute('open', '')
  await expect(page.locator('#addendum-late-close')).toHaveCount(0)
  expect(await page.evaluate(() => window.writes)).toEqual([])
})

test('registro natural preserva modelo completo e texto literal após confirmação', async ({ page }) => {
  await openApp(page, { specialCatalog: true })
  await command(page, 'Mostrar agenda de hoje')
  await command(page, 'Clicar em Detalhes e ações')
  await command(page, 'Clicar em Iniciar sessão de Ana Clara em 2026-10-03 às 15:00–15:50')
  const form = page.getByRole('form', { name: 'Rascunho de sessão' })
  await expect(form).toBeVisible()
  await propose(page, 'Registrar comportamento Pede ajuda para o adulto para Ana Clara na sessão')
  await expect(page.locator('.voice-command-preview')).toContainText('Pede ajuda para o adulto')
  await expect(form.getByRole('checkbox', { name: /^Pede ajuda para o adulto · v1$/ })).not.toBeChecked()
  await propose(page, 'confirmar')
  await expect(form.getByRole('checkbox', { name: /^Pede ajuda para o adulto · v1$/ })).toBeChecked()
  const literal = 'Caio Fictício disse "sim"'
  await propose(page, `Preencher observação da sessão de Ana Clara com ${literal}`)
  await expect(form.getByLabel('Observações descritivas')).toHaveValue('')
  await propose(page, 'confirmar')
  await expect(form.getByLabel('Observações descritivas')).toHaveValue(literal)
  await command(page, 'Registrar indicador Participação em grupo como apoio como Com apoio em grupo na sessão de Ana Clara')
  await expect(form.getByRole('combobox', { name: /^Participação em grupo como apoio · v1$/ })).toHaveValue('0')
})

async function openBehaviorRemovalDraft(page) {
  await openApp(page, { specialCatalog: true })
  await command(page, 'Mostrar agenda de hoje')
  await command(page, 'Clicar em Detalhes e ações')
  await command(page, 'Clicar em Iniciar sessão de Ana Clara em 2026-10-03 às 15:00–15:50')
  const form = page.getByRole('form', { name: 'Rascunho de sessão' })
  await expect(form).toHaveAttribute('data-voice-record', 'draft')
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue('ana')
  await command(page, 'Registrar comportamento Pede ajuda na sessão de Ana Clara')
  await command(page, 'Registrar comportamento Pede ajuda para o adulto para Ana Clara na sessão')
  const literal = 'Caio Fictício disse "Retire comportamento Pede ajuda para o adulto da sessão de Ana Clara"'
  await command(page, `Preencher observação da sessão de Ana Clara com ${literal}`)
  await expect(form.getByRole('checkbox', { name: /^Pede ajuda · v1$/ })).toBeChecked()
  await expect(form.getByRole('checkbox', { name: /^Pede ajuda para o adulto · v1$/ })).toBeChecked()
  await expect(form.getByLabel('Observações descritivas')).toHaveValue(literal)
  expect(await page.evaluate(() => window.writes)).toEqual([])
  return { form, literal }
}

for (const [verb, preposition] of [
  ['Retirar', 'da'], ['Retire', 'na'], ['Remover', 'da'],
  ['Remova', 'na'], ['Desmarcar', 'da'], ['Desmarque', 'na'],
]) {
  test(`remoção natural: ${verb} comportamento ${preposition} sessão exige confirmação e Salvar rascunho`, async ({ page }) => {
    const { form, literal } = await openBehaviorRemovalDraft(page)
    const help = form.getByRole('checkbox', { name: /^Pede ajuda · v1$/ })
    const longTitle = form.getByRole('checkbox', { name: /^Pede ajuda para o adulto · v1$/ })
    await propose(page, `${verb} comportamento Pede ajuda para o adulto ${preposition} sessão de Ana Clara`)
    await expect(page.locator('.voice-command-preview')).toContainText('Pede ajuda para o adulto')
    await expect(page.locator('.voice-command-preview')).toContainText('Ana Clara')
    await expect(longTitle).toBeChecked()
    await expect(help).toBeChecked()
    await expect(form.getByLabel('Observações descritivas')).toHaveValue(literal)
    await page.clock.runFor(5000)
    expect(await page.evaluate(() => window.writes)).toEqual([])
    await propose(page, 'confirmar')
    await expect(longTitle).not.toBeChecked()
    await expect(help).toBeChecked()
    await expect(form.getByLabel('Observações descritivas')).toHaveValue(literal)
    await expect(page.locator('.voice-command-preview')).toHaveCount(0)
    await page.clock.runFor(5000)
    expect(await page.evaluate(() => window.writes)).toEqual([])
    await form.getByRole('button', { name: 'Salvar rascunho', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.writes)).toEqual([
      { command: 'session_draft_save', args: { id: 'draft', input: {
        observation: literal,
        procedures: '', outcomeDecision: '', referralClosure: '', behaviorIds: ['help'], indicators: [],
      } } },
    ])
    expect(await page.evaluate(() => window.voiceNativeCalls.filter(call => ['behavior_delete', 'behavior_update', 'session_finalize'].includes(call.command)))).toEqual([])
  })
}

test('remoção natural: mídia e transcrições fixas simuladas exigem segundo áudio sem gravar', async ({ page }) => {
  const { form, literal } = await openBehaviorRemovalDraft(page)
  const help = form.getByRole('checkbox', { name: /^Pede ajuda · v1$/ })
  const longTitle = form.getByRole('checkbox', { name: /^Pede ajuda para o adulto · v1$/ })
  const assistant = page.getByRole('region', { name: 'Comando do Círculo' })
  async function audio(text) {
    // Fixed synthetic transcripts, media and IPC; this is not native recognition or microphone evidence.
    await page.evaluate(value => { window.voiceTranscript = value }, text)
    await assistant.getByRole('button', { name: 'Ouvir comando' }).click()
    await finishAudio(page)
    await expect(assistant.getByRole('button', { name: 'Ouvir comando' })).toBeEnabled()
  }
  await audio('Retire comportamento Pede ajuda para o adulto da sessão de Ana Clara')
  await expect(page.locator('.voice-command-preview')).toContainText('Pede ajuda para o adulto')
  await expect(longTitle).toBeChecked()
  await expect(help).toBeChecked()
  await expect(form.getByLabel('Observações descritivas')).toHaveValue(literal)
  expect(await page.evaluate(() => window.writes)).toEqual([])
  await audio('Confirmar comando')
  await expect(longTitle).not.toBeChecked()
  await expect(help).toBeChecked()
  await expect(form.getByLabel('Observações descritivas')).toHaveValue(literal)
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  await page.clock.runFor(5000)
  expect(await page.evaluate(() => window.writes)).toEqual([])
  expect(await page.evaluate(() => window.voiceNativeCalls.filter(call => call.command === 'voice_transcribe').length)).toBe(2)
  expect(await page.evaluate(() => window.voiceNativeCalls.filter(call => ['session_draft_save', 'behavior_delete', 'behavior_update', 'session_finalize'].includes(call.command)))).toEqual([])
})

for (const index of [0, 1]) test(`remoção nativa: replay ${index} desmarca somente Pede ajuda após segundo áudio`, async ({ page }) => {
  const { form, literal } = await openBehaviorRemovalDraft(page)
  const help = form.getByRole('checkbox', { name: /^Pede ajuda · v1$/ })
  const other = form.getByRole('checkbox', { name: /^Pede ajuda para o adulto · v1$/ })
  const assistant = page.getByRole('region', { name: 'Comando do Círculo' })
  async function audio(caseIndex) {
    // Unedited SAPI/Rust transcripts; capture and IPC simulated, not physical microphone.
    await page.evaluate(value => { window.voiceTranscript = value }, nativeRemoveCorpus.find(item => item.Index === caseIndex).Transcript)
    await assistant.getByRole('button', { name: 'Ouvir comando' }).click()
    await finishAudio(page)
    await expect(assistant.getByRole('button', { name: 'Ouvir comando' })).toBeEnabled()
  }
  await audio(index)
  await expect(page.locator('.voice-command-preview')).toContainText('Desmarcar “Pede ajuda”')
  await expect(help).toBeChecked()
  await expect(other).toBeChecked()
  await expect(form.getByLabel('Observações descritivas')).toHaveValue(literal)
  expect(await page.evaluate(() => window.writes)).toEqual([])
  await audio(2)
  await expect(help).not.toBeChecked()
  await expect(other).toBeChecked()
  await expect(form.getByLabel('Observações descritivas')).toHaveValue(literal)
  await page.clock.runFor(5000)
  expect(await page.evaluate(() => window.writes)).toEqual([])
  expect(await page.evaluate(() => window.voiceNativeCalls.filter(call => call.command === 'voice_transcribe').length)).toBe(2)
})

test('remoção natural recusa negação, outro paciente e títulos desconhecido ou truncado', async ({ page }) => {
  const { form, literal } = await openBehaviorRemovalDraft(page)
  for (const invalid of [
    'Não retirar comportamento Pede ajuda para o adulto da sessão de Ana Clara',
    'Retire comportamento Pede ajuda para o adulto da sessão de Caio Fictício',
    'Remover comportamento Modelo inexistente na sessão de Ana Clara',
    'Desmarque comportamento Pede ajuda para o da sessão de Ana Clara',
  ]) {
    await propose(page, invalid)
    await expect(page.locator('.voice-command-error')).toBeVisible()
    await expect(page.locator('.voice-command-preview')).toHaveCount(0)
    // A rejected request must not leave a removable action available to confirmation.
    await propose(page, 'confirmar')
    await expect(page.locator('.voice-command-preview')).toHaveCount(0)
    await expect(form.getByRole('checkbox', { name: /^Pede ajuda · v1$/ })).toBeChecked()
    await expect(form.getByRole('checkbox', { name: /^Pede ajuda para o adulto · v1$/ })).toBeChecked()
    await expect(form.getByLabel('Observações descritivas')).toHaveValue(literal)
    await page.clock.runFor(5000)
    expect(await page.evaluate(() => window.writes)).toEqual([])
  }
  expect(await page.evaluate(() => window.voiceNativeCalls.filter(call => ['session_draft_save', 'behavior_delete', 'behavior_update', 'session_finalize'].includes(call.command)))).toEqual([])
})

for (const change of ['rascunho', 'paciente']) {
  test(`remoção natural preparada é descartada após trocar de ${change}`, async ({ page }) => {
    await openApp(page, { specialCatalog: true })
    await page.evaluate(change => {
      window.voiceDrafts = [
        { id: 'remove-old', patientId: 'ana', originalDate: '2026-10-02' },
        { id: 'remove-next', patientId: change === 'paciente' ? 'caio' : 'ana', originalDate: '2026-10-01' },
      ].map(draft => ({ ...draft, observation: `Texto literal de ${draft.id}`, procedures: '', outcomeDecision: '', referralClosure: '', behaviorIds: ['help', 'long-title'], indicators: [] }))
    }, change)
    await command(page, 'Mostrar agenda de hoje')
    await command(page, 'Clicar em Detalhes e ações')
    await command(page, 'Clicar em Iniciar sessão de Ana Clara em 2026-10-03 às 15:00–15:50')
    const form = page.getByRole('form', { name: 'Rascunho de sessão' })
    await page.locator('#session-other-drafts > summary').click()
    await page.getByRole('button', { name: 'Retomar rascunho 2026-10-02 · opção 1', exact: true }).click()
    await expect(form).toHaveAttribute('data-voice-record', 'remove-old')
    await propose(page, 'Retirar comportamento Pede ajuda para o adulto da sessão de Ana Clara')
    await expect(page.locator('.voice-command-preview')).toContainText('Pede ajuda para o adulto')
    await expect(form.getByRole('checkbox', { name: /^Pede ajuda para o adulto · v1$/ })).toBeChecked()
    if (change === 'paciente') {
      await page.getByLabel('Paciente para evolução e sessões').selectOption('caio')
      await expect(form).toHaveCount(0)
    }
    await page.locator('#session-other-drafts > summary').click()
    const resumeNext = page.locator('#session-other-drafts button[data-voice-record="draft:remove-next"]')
    await expect(resumeNext).toHaveAccessibleName('Retomar rascunho 2026-10-01 · opção 2')
    await resumeNext.click()
    await expect(form).toHaveAttribute('data-voice-record', 'remove-next')
    await propose(page, 'confirmar')
    await expect(page.locator('.voice-command-preview')).toHaveCount(0)
    await expect(form.getByRole('checkbox', { name: /^Pede ajuda · v1$/ })).toBeChecked()
    await expect(form.getByRole('checkbox', { name: /^Pede ajuda para o adulto · v1$/ })).toBeChecked()
    await expect(form.getByLabel('Observações descritivas')).toHaveValue('Texto literal de remove-next')
    await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue(change === 'paciente' ? 'caio' : 'ana')
    await page.clock.runFor(5000)
    expect(await page.evaluate(() => window.writes)).toEqual([])
    expect(await page.evaluate(() => window.voiceDrafts.find(draft => draft.id === 'remove-old').behaviorIds)).toEqual(['help', 'long-title'])
    expect(await page.evaluate(() => window.voiceNativeCalls.filter(call => ['session_draft_save', 'behavior_delete', 'behavior_update', 'session_finalize'].includes(call.command)))).toEqual([])
  })
}

test('evolução por voz sem rascunho abre Agenda para o paciente sem criar dados', async ({ page }) => {
  await openApp(page)
  await command(page, 'Abrir evolução de Ana Clara')
  await command(page, 'Clicar em Registrar nova sessão ou continuar rascunho')
  const form = page.getByRole('form', { name: 'Novo compromisso', exact: true })
  await expect(form).toBeVisible()
  await expect(form.getByLabel('Paciente', { exact: true })).toHaveValue('ana')
  await expect(form.getByLabel('Tipo', { exact: true })).toHaveValue('Avulsa')
  await expect(form.getByLabel('Tipo', { exact: true })).toBeDisabled()
  expect(await page.evaluate(() => window.writes)).toEqual([])
  expect(await page.evaluate(() => window.voiceNativeCalls.filter(call => call.command === 'session_draft_start'))).toEqual([])
})

test('atalho do paciente por comando abre compromisso avulso com seu ID sem iniciar sessão', async ({ page }) => {
  await openApp(page)
  await command(page, 'Abrir registros de Ana Clara')
  await command(page, 'Clicar em Escolher compromisso na Agenda')
  const form = page.getByRole('form', { name: 'Novo compromisso', exact: true })
  await expect(form).toBeVisible()
  await expect(form.getByLabel('Paciente', { exact: true })).toHaveValue('ana')
  await expect(form.getByLabel('Tipo', { exact: true })).toHaveValue('Avulsa')
  await expect(form.getByLabel('Tipo', { exact: true })).toBeDisabled()
  expect(await page.evaluate(() => window.writes)).toEqual([])
  expect(await page.evaluate(() => window.voiceNativeCalls.filter(call => call.command === 'session_draft_start'))).toEqual([])
})

test('atalho geral de sessões por comando abre Agenda com formulário padrão sem iniciar ou criar dados', async ({ page }) => {
  await openApp(page)
  await command(page, 'Abrir Sessões')
  await command(page, 'Clicar em Criar compromisso avulso ou escolher agendado')
  await expect(page.getByRole('group', { name: 'Visualização da Agenda' })).toBeVisible()
  await command(page, 'Clicar em Novo compromisso')
  const form = page.getByRole('form', { name: 'Novo compromisso', exact: true })
  await expect(form).toBeVisible()
  // emptyForm selects the first active patient for mouse and voice alike.
  await expect(form.getByLabel('Paciente', { exact: true })).toHaveValue('ana')
  await expect(form.getByLabel('Tipo', { exact: true })).toBeEnabled()
  await expect(form.getByRole('button', { name: 'Criar compromisso avulso', exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.writes)).toEqual([])
  expect(await page.evaluate(() => window.voiceNativeCalls.filter(call => call.command === 'session_draft_start'))).toEqual([])
})

test('evolução por voz retoma rascunho e âncoras não criam nem gravam outra sessão', async ({ page }) => {
  await openApp(page)
  await page.evaluate(() => { window.voiceDrafts = [{ id: 'resume', patientId: 'ana', seriesId: 'resume-series', originalDate: '2026-10-02', observation: 'Observação fictícia preservada', procedures: '', outcomeDecision: '', referralClosure: '', behaviorIds: [], indicators: [] }] })
  await command(page, 'Abrir evolução de Ana Clara')
  await command(page, 'Clicar em Registrar nova sessão ou continuar rascunho')
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toHaveAttribute('data-voice-record', 'resume')
  await expect(page.getByLabel('Observações descritivas')).toHaveValue('Observação fictícia preservada')
  for (const [label, hash] of [['Comportamentos', 'draft-behaviors'], ['Indicadores e escalas', 'draft-indicators'], ['Salvar ou finalizar', 'draft-actions'], ['Evolução descritiva', 'session-observation']]) {
    await command(page, `Clicar em ${label}`)
    await expect(page).toHaveURL(new RegExp(`#${hash}$`))
  }
  await command(page, 'Clicar em Escolher comportamentos desta sessão')
  await expect(page.locator('#draft-behaviors')).toBeFocused()
  // Retaking a draft remounts the session workspace, closing secondary drawers.
  // Voice must open the drawer before targeting its hidden action.
  await command(page, 'Clicar em Evolução e escalas registradas · Adicionar adendo')
  await page.evaluate(() => {
    window.voiceScrolledIds = []
    const scroll = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (...args) { window.voiceScrolledIds.push(this.id); return scroll.apply(this, args) }
  })
  await command(page, 'Clicar em Registrar nova sessão ou continuar rascunho')
  expect(await page.evaluate(() => window.voiceScrolledIds)).toContain('session-draft')
  expect(await page.evaluate(() => window.writes)).toEqual([])
  expect(await page.evaluate(() => window.voiceNativeCalls.filter(call => call.command === 'session_draft_start'))).toEqual([])
})

test('biblioteca vazia abre pelo atalho de voz e paciente arquivado continua consultável', async ({ page }) => {
  await openApp(page, { emptyLibrary: true, archivedPatient: true })
  await page.evaluate(() => { window.voiceDrafts = [{ id: 'empty-library', patientId: 'ana', originalDate: '2026-10-02', observation: '', procedures: '', outcomeDecision: '', referralClosure: '', behaviorIds: [], indicators: [] }] })
  await command(page, 'Abrir registros de Ana Clara')
  await command(page, 'Clicar em Retomar sessão de 2026-10-02')
  await command(page, 'Clicar em Criar na biblioteca')
  await expect(page.locator('#session-behaviors')).toHaveAttribute('open', '')
  await expect(page.getByLabel('Título descritivo')).toBeVisible()
  await expect(page).toHaveURL(/#session-behaviors$/)
  await command(page, 'Selecionar Paciente para evolução e sessões como Bia Arquivada arquivado')
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue('archived')
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.voiceNativeCalls.filter(call => call.command === 'session_timeline').at(-1)?.args)).toEqual({ patientId: 'archived' })
  expect(await page.evaluate(() => window.writes)).toEqual([])
})

test('cadastro, edição e comportamento usam formulários existentes sem gravação antecipada', async ({ page }) => {
  await openApp(page)
  await command(page, 'Cadastrar paciente Bia Fictícia com 27 anos online')
  const patientForm = page.getByRole('form', { name: 'Novo cadastro' })
  await expect(patientForm.getByLabel('Nome', { exact: true })).toHaveValue('Bia Fictícia')
  await expect(patientForm.getByLabel('Idade em anos (opcional)')).toHaveValue('27')
  await expect.poll(() => page.evaluate(() => window.writes.length)).toBe(0)
  await command(page, 'Clicar em Salvar paciente')
  await expect.poll(() => page.evaluate(() => window.writes.filter(item => item.command === 'patient_create').length)).toBe(1)
  await command(page, 'Editar paciente Bia Fictícia com 28 anos')
  await command(page, 'Clicar em Salvar alterações')
  await expect.poll(() => page.evaluate(() => window.writes.find(item => item.command === 'patient_update')?.args.input.age)).toBe(28)
  await propose(page, 'Clicar em Editar')
  await expect(page.locator('.voice-command-error')).toContainText('Há mais de uma opção')
  await command(page, 'Criar comportamento Espera a vez com descrição Aguarda sua vez no jogo')
  await expect(page.getByLabel('Título descritivo')).toHaveValue('Espera a vez')
  await command(page, 'Criar comportamento reutilizável')
  await expect.poll(() => page.evaluate(() => window.writes.find(item => item.command === 'behavior_create')?.args.title)).toBe('Espera a vez')
  await command(page, 'Editar comportamento Espera a vez com descrição Aguarda em atividades')
  await expect(page.getByLabel('Descrição opcional')).toHaveValue('Aguarda em atividades')
  await command(page, 'Clicar em Salvar versão do comportamento')
  await expect.poll(() => page.evaluate(() => window.writes.find(item => item.command === 'behavior_update')?.args.description)).toBe('Aguarda em atividades')
})

test('campos, opções e gavetas são controláveis de qualquer área; ocultos e ambíguos são recusados', async ({ page }) => {
  await openApp(page)
  await propose(page, 'Clicar em Salvar paciente')
  await expect(page.locator('.voice-command-error')).toContainText('Não encontrei')
  await command(page, 'Abrir Pacientes')
  await command(page, 'Ficarem novo cadastro')
  await command(page, 'Preencher Nome com Joana Fictícia')
  await command(page, 'Preencher Nome para Ana com Silva')
  await expect(page.getByRole('form', { name: 'Novo cadastro' }).getByLabel('Nome', { exact: true })).toHaveValue('Ana com Silva')
  await command(page, 'Preencher Idade com 42')
  await command(page, 'Selecionar Modalidade como Online')
  await expect(page.getByRole('form', { name: 'Novo cadastro' }).getByLabel('Modalidade')).toHaveValue('Online')
  await command(page, 'Abrir Agenda')
  await propose(page, 'Preencher Data de referência com 99/99/2026')
  await expect(page.locator('.voice-command-error')).toContainText('Valor inválido')
  await command(page, 'Clicar em Mês')
  await expect(page.getByRole('button', { name: 'Mês', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await command(page, 'Abrir Análises')
  await command(page, 'Clicar em Hoje')
  await expect(page.getByRole('button', { name: 'Hoje', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('pedidos naturais abrem registros e vínculos do paciente sem criar dados', async ({ page }) => {
  await openApp(page)
  await command(page, 'Abrir registros de Ana Clara')
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue('ana')
  await command(page, 'Abrir evolução de Ana Clara')
  await expect(page.locator('details[aria-label="Evolução descritiva somente leitura"]')).toHaveAttribute('open', '')
  await command(page, 'Abrir vínculos de Ana Clara')
  await expect(page.getByRole('region', { name: 'Pessoas vinculadas ao paciente' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Vínculos de Ana Clara' })).toBeVisible()
  await command(page, 'Clicar em Fechar vínculos')
  await expect(page.getByRole('region', { name: 'Pessoas vinculadas ao paciente' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Pessoas vinculadas', exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.writes.length)).toBe(0)
})

test('pedidos naturais filtram análises por paciente e período e removem filtro anterior', async ({ page }) => {
  await openApp(page)
  for (const [text, from, to, patientId] of [
    ['Mostrar análises de Ana Clara neste mês', '2026-10-01', '2026-10-31', 'ana'],
    ['Mostrar análises de Ana Clara hoje', '2026-10-03', '2026-10-03', 'ana'],
    ['Mostrar gráficos dos últimos 12 meses', '2025-11-01', '2026-10-31', ''],
    ['Mostrar análises de Ana Clara de 01/09/2026 até 30/09/2026', '2026-09-01', '2026-09-30', 'ana'],
    ['Mostrar análises deste mês', '2026-10-01', '2026-10-31', ''],
  ]) {
    await command(page, text)
    const filters = page.locator('.analytics-filters')
    await expect(filters.getByLabel('De', { exact: true })).toHaveValue(from)
    await expect(filters.getByLabel('Até', { exact: true })).toHaveValue(to)
    await expect(filters.getByLabel('Paciente', { exact: true })).toHaveValue(patientId)
    await expect.poll(() => page.evaluate(() => window.analyticsRequests.at(-1))).toEqual({ from, to, patientId: patientId || null })
  }
  await expect.poll(() => page.evaluate(() => window.writes.length)).toBe(0)
})

test('limpar campos por voz altera apenas o formulário e não grava ou escolhe opção', async ({ page }) => {
  await openApp(page)
  await command(page, 'Cadastrar paciente Bia Fictícia com 27 anos online')
  await command(page, 'Limpar Nome')
  await expect(page.getByRole('form', { name: 'Novo cadastro' }).getByLabel('Nome', { exact: true })).toHaveValue('')
  await command(page, 'Limpar Idade')
  await expect(page.getByLabel('Idade em anos (opcional)')).toHaveValue('')
  await expect.poll(() => page.evaluate(() => window.writes.length)).toBe(0)
  await propose(page, 'Limpar Modalidade')
  await expect(page.locator('.voice-command-error')).toContainText('selecionar')
  await expect(page.getByRole('form', { name: 'Novo cadastro' }).getByLabel('Modalidade')).toHaveValue('Online')
  await command(page, 'Criar comportamento Espera a vez com descrição Aguarda no jogo')
  await command(page, 'Limpar Descrição opcional')
  await expect(page.getByLabel('Descrição opcional')).toHaveValue('')
  await expect.poll(() => page.evaluate(() => window.writes.length)).toBe(0)
})

test('abrir biblioteca por pedido natural de qualquer área preserva edição sem gravar', async ({ page }) => {
  await openApp(page)
  await command(page, 'Abrir biblioteca de comportamentos reutilizáveis')
  const panel = page.locator('#session-behaviors')
  await expect(panel).toHaveAttribute('open', '')
  await expect(page.getByLabel('Título descritivo')).toBeVisible()
  expect(await page.evaluate(() => window.writes)).toEqual([])
  await command(page, 'Preencher Título descritivo com Modelo fictício ainda não salvo')
  await command(page, 'Abrir Análises')
  await command(page, 'Abrir biblioteca de comportamentos')
  await expect(page.getByLabel('Título descritivo')).toHaveValue('Modelo fictício ainda não salvo')
  await expect(panel).toHaveAttribute('open', '')
  expect(await page.evaluate(() => window.writes)).toEqual([])
})

test('contexto natural aguarda dados do paciente correto e abre sem salvar revisão', async ({ page }) => {
  await openApp(page)
  await page.evaluate(() => { window.deferContexts = true })
  await propose(page, 'Abrir contexto do caso de Ana Clara')
  await expect(page.locator('.voice-command-preview')).toContainText('contexto do caso de Ana Clara')
  await propose(page, 'confirmar')
  await expect.poll(() => page.evaluate(() => typeof window.resolveContexts)).toBe('function')
  const form = page.getByRole('form', { name: 'Nova revisão do contexto do caso' })
  await expect(form).toBeHidden()
  expect(await page.evaluate(() => window.writes)).toEqual([])
  await page.evaluate(() => { window.resolveContexts([]); window.deferContexts = false })
  await expect(form).toBeVisible()
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue('ana')
  await expect(page.getByLabel('Demanda avaliada')).toHaveValue('')
  await expect.poll(() => page.evaluate(() => window.voiceNativeCalls.filter(call => call.command === 'case_context_list').at(-1)?.args)).toEqual({ patientId: 'ana' })
  expect(await page.evaluate(() => window.writes)).toEqual([])
})

test('contexto não reutiliza carga antiga ao selecionar novamente o mesmo paciente', async ({ page }) => {
  await openApp(page)
  await command(page, 'Abrir contexto do caso de Ana Clara')
  const form = page.getByRole('form', { name: 'Nova revisão do contexto do caso' })
  await expect(form).toBeVisible()
  await page.evaluate(() => document.querySelector('form[aria-label="Nova revisão do contexto do caso"]').closest('details').open = false)
  const patient = page.getByLabel('Paciente para evolução e sessões')
  await patient.selectOption('')
  await page.evaluate(() => { window.deferContexts = true; delete window.resolveContexts })
  await patient.selectOption('ana')
  await expect.poll(() => page.evaluate(() => typeof window.resolveContexts)).toBe('function')
  await command(page, 'Abrir contexto do caso de Ana Clara')
  await expect(form).toBeHidden()
  await page.evaluate(() => { window.resolveContexts([]); window.deferContexts = false })
  await expect(form).toBeVisible()
  await form.getByLabel('Demanda avaliada').fill('Demanda fictícia preservada')
  await expect(form.getByLabel('Demanda avaliada')).toHaveValue('Demanda fictícia preservada')
  expect(await page.evaluate(() => window.writes)).toEqual([])
})

test('contexto pendente é descartado ao trocar de área ou paciente', async ({ page }) => {
  await openApp(page)
  for (const change of ['area', 'patient']) {
    await page.evaluate(() => { window.deferContexts = true; delete window.resolveContexts })
    await command(page, 'Abrir contexto do caso de Ana Clara')
    await expect.poll(() => page.evaluate(() => typeof window.resolveContexts)).toBe('function')
    const panel = page.locator('details:has(form[aria-label="Nova revisão do contexto do caso"])')
    if (change === 'area') await command(page, 'Abrir Análises')
    else await page.getByLabel('Paciente para evolução e sessões').selectOption('')
    await page.evaluate(() => { window.resolveContexts([]); window.deferContexts = false })
    await expect(page.locator('details[open]:has(form[aria-label="Nova revisão do contexto do caso"])')).toHaveCount(0)
    await command(page, 'Abrir registros de Ana Clara')
    await expect.poll(() => page.evaluate(() => window.voiceNativeCalls.filter(call => call.command === 'case_context_list').length)).toBeGreaterThan(0)
    await expect(panel).not.toHaveAttribute('open', '')
    await page.getByLabel('Paciente para evolução e sessões').selectOption('')
  }
  expect(await page.evaluate(() => window.writes)).toEqual([])
})

test('fechar Sessões cancela abertura de contexto pendente antes da remontagem', async ({ page }) => {
  await openApp(page)
  await page.evaluate(() => { window.deferContexts = true })
  await command(page, 'Abrir contexto do caso de Ana Clara')
  await expect.poll(() => page.evaluate(() => typeof window.resolveContexts)).toBe('function')
  await command(page, 'Clicar em Fechar sessões')
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveCount(0)
  await page.evaluate(() => { window.resolveContexts([]); delete window.resolveContexts })
  await command(page, 'Abrir registros de Ana Clara')
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue('ana')
  await expect.poll(() => page.evaluate(() => typeof window.resolveContexts)).toBe('function')
  await page.evaluate(() => {
    window.resolveContexts([{ id: 'restored-context', patientId: 'ana', recordedAt: '2026-10-03T12:00:00Z', demand: 'Contexto fictício carregado após remontagem', objectives: 'Objetivo fictício' }])
    window.deferContexts = false
  })
  const panel = page.locator('details:has(form[aria-label="Nova revisão do contexto do caso"])')
  await expect(panel.locator(':scope > dl')).toContainText('Contexto fictício carregado após remontagem')
  await expect(panel).not.toHaveAttribute('open', '')
  await command(page, 'Abrir contexto do caso de Ana Clara')
  await expect(page.getByRole('form', { name: 'Nova revisão do contexto do caso' })).toBeVisible()
  expect(await page.evaluate(() => window.writes)).toEqual([])
})

test('voz abre modelo de comportamento e cancela ou salva versão sem registrar em sessão', async ({ page }) => {
  await openApp(page)
  const assistant = page.getByRole('region', { name: 'Comando do Círculo' })
  await page.evaluate(() => { window.voiceTranscript = 'Editar comportamento Pede ajuda.' })
  await assistant.getByRole('button', { name: 'Ouvir comando' }).click()
  await finishAudio(page)
  await expect(page.locator('.voice-command-preview')).toContainText('Abrir edição do comportamento Pede ajuda')
  expect(await page.evaluate(() => window.writes)).toEqual([])
  await page.evaluate(() => { window.voiceTranscript = 'confirmar' })
  await assistant.getByRole('button', { name: 'Ouvir comando' }).click()
  await finishAudio(page)
  const form = page.getByRole('form', { name: 'Comportamento reutilizável' })
  await expect(form).toHaveAttribute('data-voice-record', 'behavior:help')
  await expect(form).toHaveAttribute('data-voice-epoch', '1')
  await expect(form.getByLabel('Título descritivo')).toHaveValue('Pede ajuda')
  await expect(form.getByLabel('Descrição opcional')).toHaveValue('')
  expect(await page.evaluate(() => window.writes)).toEqual([])
  await command(page, 'Clicar em Cancelar edição')
  await expect(form).toHaveAttribute('data-voice-record', 'behavior:new')
  expect(await page.evaluate(() => window.writes)).toEqual([])
  await command(page, 'Editar comportamento Pede ajuda')
  await command(page, 'Preencher Descrição opcional com Solicita apoio durante atividades')
  expect(await page.evaluate(() => window.writes)).toEqual([])
  await command(page, 'Clicar em Salvar versão do comportamento')
  await expect.poll(() => page.evaluate(() => window.writes)).toEqual([
    { command: 'behavior_update', args: { id: 'help', version: 1, title: 'Pede ajuda', description: 'Solicita apoio durante atividades' } },
  ])
})

test('modelo desaparecido após preparar edição não abre outro nem grava', async ({ page }) => {
  await openApp(page)
  await propose(page, 'Editar comportamento Pede ajuda')
  await expect(page.locator('.voice-command-preview')).toContainText('Abrir edição')
  await page.evaluate(() => { window.voiceBehaviorCatalog = [] })
  await propose(page, 'confirmar')
  await expect(page.getByRole('alert')).toContainText('Não encontrei uma versão válida do comportamento solicitado. Atualize a biblioteca e tente novamente.')
  await expect(page.getByRole('button', { name: 'Salvar versão do comportamento', exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => window.writes)).toEqual([])
})

test('voz abre edição pelo nome e preserva os campos até salvar explicitamente', async ({ page }) => {
  await openApp(page)
  const assistant = page.getByRole('region', { name: 'Comando do Círculo' })
  await page.evaluate(() => { window.voiceTranscript = 'Editar paciente. Ana Clara.' })
  await assistant.getByRole('button', { name: 'Ouvir comando' }).click()
  await finishAudio(page)
  await expect(page.locator('.voice-command-preview')).toContainText('Abrir edição do cadastro de Ana Clara')
  await expect(page.getByRole('form', { name: 'Editar cadastro' })).toHaveCount(0)
  expect(await page.evaluate(() => window.writes)).toEqual([])
  await page.evaluate(() => { window.voiceTranscript = 'confirmar' })
  await assistant.getByRole('button', { name: 'Ouvir comando' }).click()
  await finishAudio(page)
  const form = page.getByRole('form', { name: 'Editar cadastro' })
  await expect(form).toHaveAttribute('data-voice-record', 'ana')
  await expect(form.getByLabel('Nome', { exact: true })).toHaveValue('Ana Clara')
  await expect(form.getByLabel('Idade em anos (opcional)')).toHaveValue('8')
  expect(await page.evaluate(() => window.writes)).toEqual([])
  await command(page, 'Preencher Idade em anos (opcional) com 9')
  expect(await page.evaluate(() => window.writes)).toEqual([])
  await command(page, 'Clicar em Salvar alterações')
  await expect.poll(() => page.evaluate(() => window.writes)).toEqual([
    { command: 'patient_update', args: { id: 'ana', revision: 1, input: { name: 'Ana Clara', age: 9, lifeCycle: 'Criança', selfRequester: null, preferredModality: 'Presencial' } } },
  ])
})

for (const [scenario, failure, message] of [
  ['transcrição vazia', null, 'Não recebi uma transcrição. Você pode digitar o comando.'],
  ['falha nativa', 'Falha nativa de transcrição simulada', 'Falha nativa de transcrição simulada'],
]) test(`${scenario} descarta edição pendente e permite preparar novamente sem gravar`, async ({ page }) => {
  await openApp(page)
  const assistant = page.getByRole('region', { name: 'Comando do Círculo' })
  const preview = page.locator('.voice-command-preview')
  const review = page.getByRole('button', { name: 'Revisar no formulário', exact: true })
  const discard = page.getByRole('button', { name: 'Descartar rascunho', exact: true })
  const editor = page.getByRole('form', { name: 'Editar cadastro', exact: true })
  await propose(page, 'Editar paciente Ana Clara')
  await expect(preview).toContainText('Abrir edição do cadastro de Ana Clara')
  await expect(review).toBeVisible()
  await expect(discard).toBeVisible()
  await expect(editor).toHaveCount(0)
  expect(await page.evaluate(() => window.writes)).toEqual([])

  await page.evaluate(failure => {
    window.voiceTranscript = ''
    window.voiceFailure = failure
  }, failure)
  await assistant.getByRole('button', { name: 'Ouvir comando' }).click()
  await finishAudio(page)
  await expect(page.locator('.voice-command-error')).toBeVisible()
  await expect(page.locator('.voice-command-error')).toContainText(message)
  expect(await page.evaluate(() => window.voiceNativeCalls.filter(call => call.command === 'voice_transcribe').length)).toBe(1)
  await expect(preview).toHaveCount(0)
  await expect(review).toHaveCount(0)
  await expect(discard).toHaveCount(0)
  await expect(editor).toHaveCount(0)
  expect(await page.evaluate(() => window.writes)).toEqual([])

  await propose(page, 'confirmar')
  await expect(editor).toHaveCount(0)
  await expect(preview).toHaveCount(0)
  await expect(review).toHaveCount(0)
  await expect(discard).toHaveCount(0)
  expect(await page.evaluate(() => window.writes)).toEqual([])

  await page.evaluate(() => { window.voiceFailure = null })
  await propose(page, 'Editar paciente Ana Clara')
  await expect(preview).toContainText('Abrir edição do cadastro de Ana Clara')
  await expect(review).toBeVisible()
  await expect(editor).toHaveCount(0)
  expect(await page.evaluate(() => window.writes)).toEqual([])
  await propose(page, 'confirmar')
  await expect(editor).toBeVisible()
  await expect(editor).toHaveAttribute('data-voice-record', 'ana')
  await expect(editor.getByLabel('Nome', { exact: true })).toHaveValue('Ana Clara')
  await expect(editor.getByLabel('Idade em anos (opcional)')).toHaveValue('8')
  await expect(preview).toHaveCount(0)
  await expect(review).toHaveCount(0)
  await expect(discard).toHaveCount(0)
  expect(await page.evaluate(() => window.writes)).toEqual([])
})

test('voz transcrita prepara cadastro e segundo áudio confirma sem voltar ao início', async ({ page }) => {
  await openApp(page)
  await command(page, 'Abrir Pacientes')
  const assistant = page.getByRole('region', { name: 'Comando do Círculo' })
  await page.evaluate(() => { window.voiceTranscript = 'Cadastrar paciente Bia Fictícia com 9 anos' })
  await assistant.getByRole('button', { name: 'Ouvir comando' }).click()
  await finishAudio(page)
  await expect(page.locator('.voice-command-preview')).toContainText('Bia Fictícia')
  await page.evaluate(() => { window.voiceTranscript = 'confirmar' })
  await assistant.getByRole('button', { name: 'Ouvir comando' }).click()
  await finishAudio(page)
  await expect(page.getByRole('form', { name: 'Novo cadastro' }).getByLabel('Nome', { exact: true })).toHaveValue('Bia Fictícia')
  await expect.poll(() => page.evaluate(() => window.writes.length)).toBe(0)
})

test('descartar durante a gravação de confirmação invalida a resposta tardia', async ({ page }) => {
  await openApp(page)
  await propose(page, 'Cadastrar paciente Bia Fictícia com 9 anos')
  await page.evaluate(() => { window.deferVoice = true })
  await page.keyboard.press('Control+Shift+Space')
  await page.clock.runFor(1600)
  await expect.poll(() => page.evaluate(() => typeof window.resolveVoice)).toBe('function')
  await page.getByRole('button', { name: 'Descartar rascunho' }).click()
  await page.evaluate(() => window.resolveVoice('confirmar'))
  await finishAudio(page)
  await expect(page.getByRole('form', { name: 'Novo cadastro' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Revisar no formulário' })).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.writes.length)).toBe(0)
})

test('um controle substituído por outra sessão não recebe o comando antigo', async ({ page }) => {
  await openApp(page)
  const result = await page.evaluate(async () => {
    const { parseVoiceInterfaceCommand, applyVoiceInterfaceCommand } = await import('/src/voiceInterfaceCommands.js')
    const fixture = document.createElement('section')
    fixture.dataset.voiceRecord = 'session-ana'
    fixture.innerHTML = '<label>Observação <textarea></textarea></label>'
    document.body.append(fixture)
    const prepared = parseVoiceInterfaceCommand('Preencher Observação com Pediu ajuda', fixture)
    fixture.dataset.voiceRecord = 'session-caio'
    let error = ''
    try { applyVoiceInterfaceCommand(prepared.intent, fixture) } catch (reason) { error = reason.message }
    const value = fixture.querySelector('textarea').value
    fixture.remove()
    return { error, value }
  })
  expect(result.error).toContain('A tela mudou')
  expect(result.value).toBe('')
})

test('trocar de área enquanto o backend transcreve descarta o áudio antigo', async ({ page }) => {
  await openApp(page)
  await page.evaluate(() => { window.deferVoice = true })
  await page.keyboard.press('Control+Shift+Space')
  await page.clock.runFor(1600)
  await expect.poll(() => page.evaluate(() => typeof window.resolveVoice)).toBe('function')
  await page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Pacientes', exact: true }).click()
  await page.evaluate(() => window.resolveVoice('Cadastrar paciente Bia Fictícia com 9 anos'))
  await finishAudio(page)
  await expect(page.getByRole('button', { name: 'Revisar no formulário' })).toHaveCount(0)
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.writes.length)).toBe(0)
})

test('arquivar e restaurar exigem confirmação de voz e preservam a identidade', async ({ page }) => {
  await openApp(page)
  await command(page, 'Arquivar paciente Ana Clara')
  await expect(page.getByRole('alertdialog')).toContainText('Ana Clara')
  await expect.poll(() => page.evaluate(() => window.writes.length)).toBe(0)
  await propose(page, 'voltar')
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await command(page, 'Arquivar paciente Ana Clara')
  await propose(page, 'confirmar')
  await expect.poll(() => page.evaluate(() => window.writes.find(item => item.command === 'patient_archive')?.args.id)).toBe('ana')
  await command(page, 'Abrir Pacientes')
  await command(page, 'Marcar Mostrar arquivados')
  await command(page, 'Restaurar paciente Ana Clara')
  await propose(page, 'confirmar')
  await expect.poll(() => page.evaluate(() => window.writes.find(item => item.command === 'patient_restore')?.args.id)).toBe('ana')
})

test('botões repetidos da mesma ocorrência não tornam a voz ambígua', async ({ page }) => {
  await openApp(page)
  await command(page, 'Abrir Agenda')
  await command(page, 'Novo compromisso')
  await expect(page.getByRole('form', { name: 'Novo compromisso' })).toBeVisible()
  await command(page, 'Clicar em Recolher novo compromisso')
  await expect(page.getByRole('form', { name: 'Novo compromisso' })).toHaveCount(0)
  await command(page, 'Clicar em Abrir formulário de novo compromisso')
  await expect(page.getByRole('form', { name: 'Novo compromisso' })).toBeVisible()
  await command(page, 'Mostrar agenda de hoje')
  await command(page, 'Clicar em Detalhes e ações')
  await expect(page.getByRole('button', { name: 'Iniciar sessão de Ana Clara em 2026-10-03 às 15:00–15:50', exact: true })).toHaveCount(2)
  await command(page, 'Clicar em Iniciar sessão de Ana Clara em 2026-10-03 às 15:00–15:50')
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toBeVisible()
})

test('texto visível Adicionar adendo abre o único alvo após confirmar e cancela sem gravar', async ({ page }) => {
  await openApp(page)
  await page.evaluate(() => { window.voiceTimeline = [
    { id: 'only', patientId: 'ana', sessionDate: '2026-10-03', start: '15:00', end: '15:50', modality: 'Presencial', behaviors: [], indicators: [] },
  ] })
  await command(page, 'Abrir evolução de Ana Clara')
  await propose(page, 'Clicar em Adicionar adendo')
  await expect(page.locator('.voice-command-preview')).toContainText('Adicionar adendo de Ana Clara em 2026-10-03 às 15:00–15:50')
  await expect(page.locator('#addendum-only')).toHaveCount(0)
  expect(await page.evaluate(() => window.writes)).toEqual([])
  await propose(page, 'confirmar')
  await expect(page.locator('#addendum-only')).toBeVisible()
  await command(page, 'Preencher Texto do adendo com Complemento fictício a descartar')
  await command(page, 'Clicar em Cancelar')
  await expect(page.locator('#addendum-only')).toHaveCount(0)
  expect(await page.evaluate(() => window.writes)).toEqual([])
})

test('adendo por voz identifica o horário entre duas sessões no mesmo dia', async ({ page }) => {
  await openApp(page)
  await page.evaluate(() => { window.voiceTimeline = [
    { id: 'morning', patientId: 'ana', sessionDate: '2026-10-03', start: '09:00', end: '09:50', modality: 'Presencial', behaviors: [], indicators: [] },
    { id: 'afternoon', patientId: 'ana', sessionDate: '2026-10-03', start: '15:00', end: '15:50', modality: 'Presencial', behaviors: [], indicators: [] },
  ] })
  await command(page, 'Abrir Sessões')
  await command(page, 'Selecionar Paciente para evolução e sessões como Ana Clara')
  await command(page, 'Clicar em Evolução e escalas registradas · Adicionar adendo')
  await propose(page, 'Clicar em Adicionar adendo')
  await expect(page.locator('.voice-command-error')).toContainText('Há mais de uma opção')
  await expect(page.locator('#addendum-afternoon')).toHaveCount(0)
  await expect(page.locator('#addendum-morning')).toHaveCount(0)
  await command(page, 'Clicar em Adicionar adendo de Ana Clara em 2026-10-03 às 15:00–15:50')
  await expect(page.locator('#addendum-afternoon')).toBeVisible()
  await expect(page.locator('#addendum-morning')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.writes.length)).toBe(0)
})

test('adendo natural escolhe sessão finalizada pelo horário e só salva após pedido explícito', async ({ page }) => {
  await openApp(page)
  await page.evaluate(() => { window.voiceTimeline = [
    { id: 'morning', patientId: 'ana', sessionDate: '2026-10-03', start: '09:00', end: '09:50', modality: 'Presencial', behaviors: [], indicators: [] },
    { id: 'afternoon', patientId: 'ana', sessionDate: '2026-10-03', start: '15:00', end: '15:50', modality: 'Presencial', behaviors: [], indicators: [] },
  ] })
  await propose(page, 'Adicionar adendo à sessão de Ana Clara de 03/10/2026 às 15:00')
  await expect(page.locator('.voice-command-preview')).toContainText('sessão finalizada de Ana Clara em 03/10/2026 às 15:00')
  await expect(page.locator('#addendum-afternoon')).toHaveCount(0)
  await propose(page, 'confirmar')
  await expect(page.locator('#addendum-afternoon')).toBeVisible()
  await expect(page.locator('#addendum-afternoon')).toBeFocused()
  await expect(page.locator('#addendum-morning')).toHaveCount(0)
  expect(await page.evaluate(() => window.writes)).toEqual([])
  await command(page, 'Preencher Texto do adendo com Complemento fictício preservado')
  await command(page, 'Abrir adendo da sessão de Ana Clara de 03/10/2026 às 15:00')
  await expect(page.locator('#addendum-afternoon')).toHaveValue('Complemento fictício preservado')
  await command(page, 'Adicionar adendo à sessão de Ana Clara de 03/10/2026 às 09:00')
  await expect(page.getByRole('alert')).toContainText('Salve ou cancele o adendo atual')
  await expect(page.locator('#addendum-afternoon')).toHaveValue('Complemento fictício preservado')
  await expect(page.locator('#addendum-morning')).toHaveCount(0)
  expect(await page.evaluate(() => window.writes)).toEqual([])
  await command(page, 'Clicar em Salvar adendo imutável')
  await expect.poll(() => page.evaluate(() => window.writes)).toEqual([{ command: 'session_addendum_create', args: { sessionId: 'afternoon', patientId: 'ana', content: 'Complemento fictício preservado' } }])
})

test('adendo natural recusa sessão ausente, duplicada e de outro paciente sem gravar', async ({ page }) => {
  await openApp(page)
  for (const kind of ['absent', 'duplicate', 'wrong-patient']) {
    await page.evaluate(kind => {
      const session = { id: 'one', patientId: kind === 'wrong-patient' ? 'other' : 'ana', sessionDate: '2026-10-03', start: '15:00', end: '15:50', modality: 'Presencial', behaviors: [], indicators: [] }
      window.voiceTimeline = kind === 'absent' ? [] : kind === 'duplicate' ? [session, { ...session, id: 'two' }] : [session]
    }, kind)
    await command(page, 'Adicionar adendo à sessão de Ana Clara de 03/10/2026 às 15:00')
    await expect(page.getByRole('alert')).toContainText(kind === 'duplicate' ? 'Há mais de uma sessão finalizada' : 'Não encontrei a sessão finalizada exata')
    await expect(page.locator('textarea[id^="addendum-"]')).toHaveCount(0)
  }
  expect(await page.evaluate(() => window.writes)).toEqual([])
})

test('consulta atrasada de adendo não atravessa navegação ou fechamento de Sessões', async ({ page }) => {
  await openApp(page)
  for (const destination of ['Análises', 'Fechar sessões']) {
    await command(page, 'Abrir registros de Ana Clara')
    await page.evaluate(() => { window.deferTimeline = true; delete window.resolveTimeline })
    await command(page, 'Adicionar adendo à sessão de Ana Clara de 03/10/2026 às 15:00')
    await expect.poll(() => page.evaluate(() => typeof window.resolveTimeline)).toBe('function')
    await command(page, `Clicar em ${destination}`)
    await page.evaluate(() => {
      window.voiceTimeline = [{ id: 'late', patientId: 'ana', sessionDate: '2026-10-03', start: '15:00', end: '15:50', modality: 'Presencial', behaviors: [], indicators: [] }]
      window.deferTimeline = false; window.resolveTimeline(window.voiceTimeline)
    })
    await command(page, 'Abrir registros de Ana Clara')
    await expect(page.locator('textarea[id^="addendum-"]')).toHaveCount(0)
    await expect(page.locator('details[aria-label="Evolução descritiva somente leitura"]')).not.toHaveAttribute('open', '')
  }
  expect(await page.evaluate(() => window.writes)).toEqual([])
})

test('consulta de adendo preserva texto digitado no editor atual durante a espera', async ({ page }) => {
  await openApp(page)
  await page.evaluate(() => { window.voiceTimeline = [
    { id: 'morning', patientId: 'ana', sessionDate: '2026-10-03', start: '09:00', end: '09:50', modality: 'Presencial', behaviors: [], indicators: [] },
    { id: 'afternoon', patientId: 'ana', sessionDate: '2026-10-03', start: '15:00', end: '15:50', modality: 'Presencial', behaviors: [], indicators: [] },
  ] })
  await command(page, 'Adicionar adendo à sessão de Ana Clara de 03/10/2026 às 09:00')
  await expect(page.locator('#addendum-morning')).toBeVisible()
  await page.evaluate(() => { window.deferTimeline = true })
  await command(page, 'Adicionar adendo à sessão de Ana Clara de 03/10/2026 às 15:00')
  await expect.poll(() => page.evaluate(() => typeof window.resolveTimeline)).toBe('function')
  await page.locator('#addendum-morning').fill('Texto fictício digitado durante espera')
  await page.evaluate(() => { window.deferTimeline = false; window.resolveTimeline(window.voiceTimeline) })
  await expect(page.getByRole('alert')).toContainText('Salve ou cancele o adendo atual')
  await expect(page.locator('#addendum-morning')).toHaveValue('Texto fictício digitado durante espera')
  await expect(page.locator('#addendum-afternoon')).toHaveCount(0)
  expect(await page.evaluate(() => window.writes)).toEqual([])
})

test('adendo de outro paciente não descarta editor nem salva rascunho aberto', async ({ page }) => {
  await openApp(page)
  await command(page, 'Cadastrar paciente Bia Fictícia com 27 anos')
  await command(page, 'Clicar em Salvar paciente')
  await page.evaluate(() => {
    window.writes = []
    window.voiceTimeline = [{ id: 'original', patientId: 'ana', sessionDate: '2026-10-03', start: '15:00', end: '15:50', modality: 'Presencial', behaviors: [], indicators: [] }]
  })
  await command(page, 'Adicionar adendo à sessão de Ana Clara de 03/10/2026 às 15:00')
  await page.locator('#addendum-original').fill('Complemento fictício ainda não salvo')
  await command(page, 'Adicionar adendo à sessão de Bia Fictícia de 03/10/2026 às 15:00')
  await expect(page.getByRole('alert')).toContainText('Salve e feche as edições atuais')
  await expect(page.locator('#addendum-original')).toHaveValue('Complemento fictício ainda não salvo')
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue('ana')
  await command(page, 'Clicar em Cancelar')
  await page.evaluate(() => { window.voiceDrafts = [{ id: 'unsaved', patientId: 'ana', originalDate: '2026-10-02', observation: 'Observação fictícia original', procedures: '', outcomeDecision: '', referralClosure: '', behaviorIds: [], indicators: [] }] })
  await command(page, 'Clicar em Fechar sessões')
  await command(page, 'Abrir registros de Ana Clara')
  await command(page, 'Clicar em Retomar sessão de 2026-10-02')
  await page.clock.pauseAt(new Date('2026-10-03T15:01:00Z'))
  await page.getByLabel('Observações descritivas').fill('Observação fictícia ainda não salva')
  await command(page, 'Adicionar adendo à sessão de Bia Fictícia de 03/10/2026 às 15:00')
  await expect(page.getByRole('alert')).toContainText('Salve e feche as edições atuais')
  await expect(page.getByLabel('Observações descritivas')).toHaveValue('Observação fictícia ainda não salva')
  expect(await page.evaluate(() => window.writes)).toEqual([])
})

test('retomar rascunho invalida consulta de adendo antes da remontagem', async ({ page }) => {
  await openApp(page)
  await page.evaluate(() => {
    window.voiceTimeline = [{ id: 'late-final', patientId: 'ana', sessionDate: '2026-10-03', start: '15:00', end: '15:50', modality: 'Presencial', behaviors: [], indicators: [] }]
    window.voiceDrafts = [{ id: 'resume-new', patientId: 'ana', originalDate: '2026-10-02', observation: 'Observação fictícia', procedures: '', outcomeDecision: '', referralClosure: '', behaviorIds: [], indicators: [] }]
  })
  await command(page, 'Abrir registros de Ana Clara')
  await page.evaluate(() => { window.deferTimeline = true })
  await command(page, 'Adicionar adendo à sessão de Ana Clara de 03/10/2026 às 15:00')
  await expect.poll(() => page.evaluate(() => typeof window.resolveTimeline)).toBe('function')
  await page.evaluate(() => { window.oldTimelineResolve = window.resolveTimeline; window.deferTimeline = false })
  await command(page, 'Clicar em Retomar sessão de 2026-10-02')
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toHaveAttribute('data-voice-record', 'resume-new')
  await expect(page.locator('details[aria-label="Evolução descritiva somente leitura"]')).not.toHaveAttribute('open', '')
  await page.evaluate(() => window.oldTimelineResolve(window.voiceTimeline))
  await expect(page.locator('#addendum-late-final')).toHaveCount(0)
  await expect(page.getByLabel('Observações descritivas')).toHaveValue('Observação fictícia')
  expect(await page.evaluate(() => window.writes)).toEqual([])
})

test('Cancelar adendo invalida consulta pendente sem reabrir o editor', async ({ page }) => {
  await openApp(page)
  await page.evaluate(() => { window.voiceTimeline = [{ id: 'cancelled', patientId: 'ana', sessionDate: '2026-10-03', start: '15:00', end: '15:50', modality: 'Presencial', behaviors: [], indicators: [] }] })
  await command(page, 'Adicionar adendo à sessão de Ana Clara de 03/10/2026 às 15:00')
  await expect(page.locator('#addendum-cancelled')).toBeVisible()
  await page.evaluate(() => { window.deferTimeline = true })
  await command(page, 'Adicionar adendo à sessão de Ana Clara de 03/10/2026 às 15:00')
  await expect.poll(() => page.evaluate(() => typeof window.resolveTimeline)).toBe('function')
  await command(page, 'Clicar em Cancelar')
  await page.evaluate(async () => { window.deferTimeline = false; window.resolveTimeline(window.voiceTimeline); await new Promise(resolve => queueMicrotask(resolve)) })
  await expect(page.locator('#addendum-cancelled')).toHaveCount(0)
  expect(await page.evaluate(() => window.writes)).toEqual([])
})

test('iniciar sessão pela Agenda não reaplica consulta antiga de adendo', async ({ page }) => {
  await openApp(page)
  await page.evaluate(() => { window.voiceTimeline = [{ id: 'previous-final', patientId: 'ana', sessionDate: '2026-10-02', start: '15:00', end: '15:50', modality: 'Presencial', behaviors: [], indicators: [] }] })
  await command(page, 'Abrir registros de Ana Clara')
  await page.evaluate(() => { window.deferTimeline = true })
  await command(page, 'Adicionar adendo à sessão de Ana Clara de 02/10/2026 às 15:00')
  await expect.poll(() => page.evaluate(() => typeof window.resolveTimeline)).toBe('function')
  await page.evaluate(() => { window.oldTimelineResolve = window.resolveTimeline; window.deferTimeline = false })
  await command(page, 'Abrir Agenda')
  await command(page, 'Iniciar sessão de Ana Clara hoje às 15:00')
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toHaveAttribute('data-voice-record', 'draft')
  await page.evaluate(async () => { window.oldTimelineResolve(window.voiceTimeline); await new Promise(resolve => queueMicrotask(resolve)) })
  await expect(page.locator('#addendum-previous-final')).toHaveCount(0)
  await expect(page.locator('details[aria-label="Evolução descritiva somente leitura"]')).not.toHaveAttribute('open', '')
  expect(await page.evaluate(() => window.writes)).toEqual([])
})

for (const editing of [false, true]) test(`transcrição nativa de salvar comportamento ${editing ? 'edita versão' : 'cria item'} somente após segundo áudio de confirmação`, async ({ page }) => {
  await openApp(page)
  await command(page, editing ? 'Editar comportamento Pede ajuda com descrição Descrição fictícia nova.' : 'Criar comportamento Solicita pausa')
  const assistant = page.getByRole('region', { name: 'Comando do Círculo' })
  await page.evaluate(text => { window.voiceTranscript = text }, nativeSaveCorpus.find(item => item.Index === (editing ? 1 : 0)).Transcript)
  await assistant.getByRole('button', { name: 'Ouvir comando' }).click()
  await finishAudio(page)
  await expect(page.locator('.voice-command-preview')).toContainText(editing ? 'Salvar versão do comportamento' : 'Criar comportamento reutilizável')
  expect(await page.evaluate(() => window.writes)).toEqual([])
  await page.evaluate(text => { window.voiceTranscript = text }, nativeSaveCorpus.find(item => item.Index === 2).Transcript)
  await assistant.getByRole('button', { name: 'Ouvir comando' }).click()
  await finishAudio(page)
  await expect.poll(() => page.evaluate(() => window.writes.length)).toBe(1)
  expect(await page.evaluate(() => window.writes)).toEqual([editing
    ? { command: 'behavior_update', args: { id: 'help', version: 1, title: 'Pede ajuda', description: 'Descrição fictícia nova.' } }
    : { command: 'behavior_create', args: { title: 'Solicita pausa', description: '' } }])
  expect(await page.evaluate(() => window.voiceNativeCalls.filter(item => item.command === 'voice_transcribe').length)).toBe(2)
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
})

for (const index of [0, 1, 2]) test(`campos: transcrição nativa ${index} prepara alvo correto e aguarda segundo áudio`, async ({ page }) => {
  await openApp(page, { nativeCatalog: true })
  let field
  let expected
  if (index === 0) {
    await command(page, 'Editar paciente Ana Clara')
    field = page.getByLabel('Idade em anos (opcional)')
    expected = '9'
  } else {
    await command(page, 'Iniciar sessão de Ana Clara hoje às 15 horas')
    await command(page, 'Registrar indicador Regulação emocional como Com algum apoio na sessão de Ana Clara')
    await command(page, 'Preencher Nota contextual de Regulação emocional com Nota original fictícia')
    field = page.getByLabel('Nota contextual opcional · Regulação emocional')
    expected = index === 1 ? 'participou com apoio' : ''
  }
  const before = await field.inputValue()
  const assistant = page.getByRole('region', { name: 'Comando do Círculo' })
  await page.evaluate(text => { window.voiceTranscript = text }, nativeFieldsCorpus.find(item => item.Index === index).Transcript)
  await assistant.getByRole('button', { name: 'Ouvir comando' }).click()
  await finishAudio(page)
  await expect(page.locator('.voice-command-preview')).toBeVisible()
  await expect(field).toHaveValue(before)
  expect(await page.evaluate(() => window.writes)).toEqual([])
  await page.evaluate(text => { window.voiceTranscript = text }, nativeSaveCorpus.find(item => item.Index === 2).Transcript)
  await assistant.getByRole('button', { name: 'Ouvir comando' }).click()
  await finishAudio(page)
  await expect(field).toHaveValue(expected)
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  expect(await page.evaluate(() => window.writes)).toEqual([])
  if (index !== 0) await expect(page.getByLabel('Regulação emocional · v1', { exact: true })).toHaveValue('2')
  expect(await page.evaluate(() => window.voiceNativeCalls.filter(item => item.command === 'voice_transcribe').length)).toBe(2)
})

test('reparo de prefixo não adivinha valor, respeita negação e mantém conteúdo literal', async ({ page }) => {
  await openApp(page)
  await command(page, 'Editar paciente Ana Clara')
  const age = page.getByLabel('Idade em anos (opcional)')
  for (const text of ['Preencher Idade com Nov.', 'Não prinscheridade com nove.', 'Prinscheridade com nove ou dez.', 'Prie encher idade com nove.']) {
    await propose(page, text)
    await expect(page.locator('.voice-command-error')).toBeVisible()
    await expect(page.locator('.voice-command-preview')).toHaveCount(0)
    await expect(age).toHaveValue('8')
    expect(await page.evaluate(() => window.writes)).toEqual([])
  }
  await command(page, 'Preencher Nome com Princher e Prinscheridade')
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('Princher e Prinscheridade')
  expect(await page.evaluate(() => window.writes)).toEqual([])
})

test('transcrição nativa observada abre biblioteca após confirmação sem gravar', async ({ page }) => {
  await openApp(page)
  await page.evaluate(text => { window.voiceTranscript = text }, nativeVoiceCorpus.find(item => item.Index === 12).Transcript)
  const assistant = page.getByRole('region', { name: 'Comando do Círculo' })
  await assistant.getByRole('button', { name: 'Ouvir comando' }).click()
  await finishAudio(page)
  await expect(page.locator('.voice-command-preview')).toContainText('Abrir biblioteca de comportamentos reutilizáveis')
  await expect(page.locator('#session-behaviors')).toHaveCount(0)
  await propose(page, 'confirmar')
  await expect(page.locator('#session-behaviors')).toHaveAttribute('open', '')
  expect(await page.evaluate(() => window.writes)).toEqual([])
})

test('transcrição nativa com data falada abre o adendo exato só após confirmar', async ({ page }) => {
  await openApp(page)
  await page.evaluate(text => {
    window.voiceTranscript = text
    window.voiceTimeline = [{ id: 'spoken-date', patientId: 'ana', sessionDate: '2026-10-03', start: '15:00', end: '15:50', modality: 'Presencial', behaviors: [], indicators: [] }]
  }, nativeVoiceCorpus.find(item => item.Index === 15).Transcript)
  const assistant = page.getByRole('region', { name: 'Comando do Círculo' })
  await assistant.getByRole('button', { name: 'Ouvir comando' }).click()
  await finishAudio(page)
  await expect(page.locator('.voice-command-preview')).toContainText('Ana Clara em 03/10/2026 às 15:00')
  await expect(page.locator('#addendum-spoken-date')).toHaveCount(0)
  await propose(page, 'confirmar')
  await expect(page.locator('#addendum-spoken-date')).toBeVisible()
  await expect(page.locator('#addendum-spoken-date')).toBeFocused()
  expect(await page.evaluate(() => window.writes)).toEqual([])
})

test('transcrições nativas de botão e confirmação usam a tela visível sem gravar', async ({ page }) => {
  await openApp(page)
  await command(page, 'Abrir Pacientes')
  const assistant = page.getByRole('region', { name: 'Comando do Círculo' })
  await page.evaluate(text => { window.voiceTranscript = text }, nativeVoiceCorpus.find(item => item.Index === 5).Transcript)
  await assistant.getByRole('button', { name: 'Ouvir comando' }).click()
  await finishAudio(page)
  await expect(page.locator('.voice-command-preview')).toContainText('Novo cadastro')
  await expect(page.getByRole('form', { name: 'Novo cadastro' })).toHaveCount(0)
  await page.evaluate(text => { window.voiceTranscript = text }, nativeVoiceCorpus.find(item => item.Index === 6).Transcript)
  await assistant.getByRole('button', { name: 'Ouvir comando' }).click()
  await finishAudio(page)
  await expect(page.getByRole('form', { name: 'Novo cadastro' })).toBeVisible()
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  expect(await page.evaluate(() => window.writes)).toEqual([])
})

for (const [index, action] of ['start', 'remarcar', 'cancelar'].entries()) test(`data falada capturada ${action} abre a ocorrência exata somente após confirmar`, async ({ page }) => {
  await openApp(page)
  const assistant = page.getByRole('region', { name: 'Comando do Círculo' })
  await page.evaluate(text => { window.voiceTranscript = text }, nativeOccurrenceCorpus.find(item => item.Index === index).Transcript)
  await assistant.getByRole('button', { name: 'Ouvir comando' }).click()
  await finishAudio(page)
  await expect(page.locator('.voice-command-preview')).toContainText('Ana Clara em 03/10/2026 às 15:00')
  expect(await page.evaluate(() => window.writes)).toEqual([])
  expect(await page.evaluate(() => window.voiceNativeCalls.filter(item => item.command === 'session_draft_start'))).toEqual([])
  await expect(page.getByRole('form', { name: 'Alterar ocorrência individual' })).toHaveCount(0)
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toHaveCount(0)
  await page.evaluate(text => { window.voiceTranscript = text }, nativeSaveCorpus.find(item => item.Index === 2).Transcript)
  await assistant.getByRole('button', { name: 'Ouvir comando' }).click()
  await finishAudio(page)
  if (action === 'start') {
    await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toBeVisible()
    expect(await page.evaluate(() => window.voiceNativeCalls.filter(item => item.command === 'session_draft_start').map(item => item.args))).toEqual([{ seriesId: 'series', originalDate: '2026-10-03' }])
  } else {
    const form = page.getByRole('form', { name: 'Alterar ocorrência individual' })
    await expect(form).toBeVisible()
    await expect(form).toHaveAttribute('data-voice-record', 'series:2026-10-03')
    await expect(form).toContainText('Ana Clara · série series · original 2026-10-03 · efetiva 2026-10-03 às 15:00–15:50')
    await expect(form.getByLabel('Ação explícita')).toHaveValue(action)
    expect(await page.evaluate(() => window.voiceNativeCalls.filter(item => item.command.startsWith('agenda_') && !['agenda_list_series', 'agenda_occurrences', 'agenda_history'].includes(item.command)))).toEqual([])
    expect(await page.evaluate(() => window.writes)).toEqual([])
  }
})

test('pedido natural encontra compromisso e abre cancelamento ou remarcação sem gravar', async ({ page }) => {
  await openApp(page)
  await command(page, 'Cancelar sessão de Ana Clara hoje às 15 horas')
  const form = page.getByRole('form', { name: 'Alterar ocorrência individual' })
  await expect(form).toBeVisible()
  await expect(form.getByLabel('Ação explícita')).toHaveValue('cancelar')
  await expect.poll(() => page.evaluate(() => window.writes.length)).toBe(0)
  await command(page, 'Clicar em Fechar')
  await command(page, 'Remarcar sessão de Ana Clara hoje às três da tarde')
  await expect(form.getByLabel('Ação explícita')).toHaveValue('remarcar')
  await expect(form.getByLabel('Novo início')).toHaveValue('15:00')
  await expect.poll(() => page.evaluate(() => window.writes.length)).toBe(0)
  await command(page, 'Clicar em Fechar')
  await command(page, 'Iniciar sessão de Ana Clara hoje às 15 horas')
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toBeVisible()
})

test('pedido natural não inicia compromisso ausente, realizado ou duplicado', async ({ page }) => {
  await openApp(page)
  await command(page, 'Iniciar sessão de Ana Clara amanhã às 15 horas')
  await expect(page.getByRole('alert')).toContainText('Não encontrei esse compromisso')
  await page.evaluate(() => { window.voiceOccurrences = [{ id: 'done', patientId: 'ana', date: '2026-10-03', start: '15:00', status: 'completed' }] })
  await command(page, 'Iniciar sessão de Ana Clara hoje às 15 horas')
  await expect(page.getByRole('alert')).toContainText('não está agendado')
  await page.evaluate(() => { window.voiceOccurrences = ['first', 'second'].map(id => ({ id, patientId: 'ana', date: '2026-10-03', start: '15:00', status: 'scheduled' })) })
  await command(page, 'Iniciar sessão de Ana Clara hoje às 15 horas')
  await expect(page.getByRole('alert')).toContainText('mais de um compromisso')
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.writes.length)).toBe(0)
})

test('retomada distingue dois rascunhos do mesmo dia e cancelamento preserva o outro', async ({ page }) => {
  await openApp(page)
  await page.evaluate(() => { window.voiceDrafts = ['first', 'second'].map(id => ({ id, patientId: 'ana', seriesId: `series-${id}`, originalDate: '2026-10-03', observation: id, procedures: '', outcomeDecision: '', referralClosure: '', behaviorIds: [], indicators: [] })) })
  await command(page, 'Abrir registros de Ana Clara')
  await command(page, 'Clicar em Escolher rascunho para retomar')
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toHaveCount(0)
  await command(page, 'Clicar em Retomar rascunho 2026-10-03 · opção 2')
  await expect(page.getByLabel('Observações descritivas')).toHaveValue('second')
  await command(page, 'Clicar em Evolução descritiva')
  await expect(page).toHaveURL(/#session-observation$/)
  await command(page, 'Cancelar rascunho')
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await propose(page, 'voltar')
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.writes.filter(item => item.command === 'session_draft_cancel').length)).toBe(0)
  await command(page, 'Cancelar rascunho')
  await propose(page, 'confirmar')
  await expect.poll(() => page.evaluate(() => window.writes.filter(item => item.command === 'session_draft_cancel'))).toEqual([{ command: 'session_draft_cancel', args: { id: 'second' } }])
  await expect.poll(() => page.evaluate(() => window.voiceDrafts.map(item => item.id))).toEqual(['first'])
  await expect.poll(() => page.evaluate(() => window.writes.filter(item => item.command === 'session_finalize').length)).toBe(0)
})

for (const [index, label, value] of [[0, 'Quinta', '4'], [1, 'Terça', '2']]) test(`dia da semana: replay nativo ${index} seleciona ${label} somente após segundo áudio sem gravar`, async ({ page }) => {
  await openApp(page)
  await command(page, 'Mostrar agenda de hoje')
  await command(page, 'Clicar em Abrir formulário de novo compromisso')
  await command(page, 'Selecionar Tipo como Recorrente')
  const form = page.getByRole('form', { name: 'Novo compromisso', exact: true })
  const weekday = form.getByLabel('Dia da semana', { exact: true })
  await expect(weekday).toHaveValue('6')
  expect(await page.evaluate(() => window.writes)).toEqual([])
  const assistant = page.getByRole('region', { name: 'Comando do Círculo' })
  // Replay native SAPI transcripts through synthetic media; this does not verify a physical microphone.
  await page.evaluate(text => { window.voiceTranscript = text }, nativeWeekdayCorpus.find(item => item.Index === index).Transcript)
  await assistant.getByRole('button', { name: 'Ouvir comando' }).click()
  await finishAudio(page)
  await expect(page.locator('.voice-command-preview')).toContainText(`Dia da semana: ${label}`)
  await expect(weekday).toHaveValue('6')
  expect(await page.evaluate(() => window.writes)).toEqual([])
  expect(await page.evaluate(() => window.voiceNativeCalls.filter(item => item.command === 'voice_transcribe').length)).toBe(1)
  await page.evaluate(text => { window.voiceTranscript = text }, nativeWeekdayCorpus.find(item => item.Index === 2).Transcript)
  await assistant.getByRole('button', { name: 'Ouvir comando' }).click()
  await finishAudio(page)
  await expect(weekday).toHaveValue(value)
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  expect(await page.evaluate(() => window.writes)).toEqual([])
  expect(await page.evaluate(() => window.voiceNativeCalls.filter(item => item.command === 'voice_transcribe').length)).toBe(2)
  expect(await page.evaluate(() => window.voiceNativeCalls.filter(item => item.command === 'agenda_create_series'))).toEqual([])
})

test('vínculos: replay nativo abre Ana Clara e marca contato administrativo somente após cada áudio de confirmação sem gravar', async ({ page }) => {
  await openApp(page)
  const assistant = page.getByRole('region', { name: 'Comando do Círculo' })
  const parties = page.getByRole('region', { name: 'Pessoas vinculadas ao paciente' })
  const form = parties.getByRole('form', { name: 'Novo vínculo', exact: true })
  const administrativeContact = form.getByRole('checkbox', { name: 'Contato administrativo', exact: true })
  const requester = form.getByRole('checkbox', { name: 'Solicitante', exact: true })
  const legalGuardian = form.getByRole('checkbox', { name: 'Responsável legal', exact: true })
  // Replay native SAPI transcripts through synthetic media; this does not verify a physical microphone.
  await page.evaluate(text => { window.voiceTranscript = text }, nativePartyCorpus.find(item => item.Index === 0).Transcript)
  await assistant.getByRole('button', { name: 'Ouvir comando' }).click()
  await finishAudio(page)
  await expect(page.locator('.voice-command-preview')).toContainText('Ana Clara')
  await expect(parties).toHaveCount(0)
  expect(await page.evaluate(() => window.writes)).toEqual([])
  expect(await page.evaluate(() => window.voiceNativeCalls.filter(item => item.command === 'voice_transcribe').length)).toBe(1)

  await page.evaluate(text => { window.voiceTranscript = text }, nativePartyCorpus.find(item => item.Index === 2).Transcript)
  await assistant.getByRole('button', { name: 'Ouvir comando' }).click()
  await finishAudio(page)
  await expect(parties).toBeVisible()
  await expect(parties.getByRole('heading', { name: 'Vínculos de Ana Clara', exact: true })).toBeVisible()
  await expect(form).toBeVisible()
  await expect(form).toHaveAttribute('data-voice-record', 'party:ana:new')
  await expect(form.getByLabel('Nome da pessoa ou instituição', { exact: true })).toHaveValue('')
  await expect(administrativeContact).not.toBeChecked()
  await expect(requester).not.toBeChecked()
  await expect(legalGuardian).not.toBeChecked()
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  expect(await page.evaluate(() => window.writes)).toEqual([])
  expect(await page.evaluate(() => window.voiceNativeCalls.filter(item => item.command === 'voice_transcribe').length)).toBe(2)

  await page.evaluate(text => { window.voiceTranscript = text }, nativePartyCorpus.find(item => item.Index === 1).Transcript)
  await assistant.getByRole('button', { name: 'Ouvir comando' }).click()
  await finishAudio(page)
  await expect(page.locator('.voice-command-preview')).toContainText('Contato administrativo')
  await expect(administrativeContact).not.toBeChecked()
  await expect(requester).not.toBeChecked()
  await expect(legalGuardian).not.toBeChecked()
  expect(await page.evaluate(() => window.writes)).toEqual([])
  expect(await page.evaluate(() => window.voiceNativeCalls.filter(item => item.command === 'voice_transcribe').length)).toBe(3)

  await page.evaluate(text => { window.voiceTranscript = text }, nativePartyCorpus.find(item => item.Index === 2).Transcript)
  await assistant.getByRole('button', { name: 'Ouvir comando' }).click()
  await finishAudio(page)
  await expect(administrativeContact).toBeChecked()
  await expect(requester).not.toBeChecked()
  await expect(legalGuardian).not.toBeChecked()
  await expect(form).toHaveAttribute('data-voice-record', 'party:ana:new')
  await expect(form.getByLabel('Nome da pessoa ou instituição', { exact: true })).toHaveValue('')
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  expect(await page.evaluate(() => window.writes)).toEqual([])
  expect(await page.evaluate(() => window.voiceNativeCalls.filter(item => item.command === 'voice_transcribe').length)).toBe(4)
  expect(await page.evaluate(() => window.voiceNativeCalls.filter(item => ['related_party_create', 'related_party_update', 'related_party_archive', 'related_party_restore'].includes(item.command)))).toEqual([])
})

test('vínculos: contrato administrativo permanece literal no nome, recusa texto extra e negação e desmarca somente após confirmar sem gravar', async ({ page }) => {
  await openApp(page)
  await command(page, 'Abrir vínculos de Ana Clara')
  const form = page.getByRole('form', { name: 'Novo vínculo', exact: true })
  const name = form.getByLabel('Nome da pessoa ou instituição', { exact: true })
  const administrativeContact = form.getByRole('checkbox', { name: 'Contato administrativo', exact: true })
  const requester = form.getByRole('checkbox', { name: 'Solicitante', exact: true })
  const legalGuardian = form.getByRole('checkbox', { name: 'Responsável legal', exact: true })
  await expect(form).toHaveAttribute('data-voice-record', 'party:ana:new')
  await propose(page, 'Preencher Nome da pessoa ou instituição com contrato administrativo')
  await expect(page.locator('.voice-command-preview')).toContainText('Nome da pessoa ou instituição: contrato administrativo')
  await expect(name).toHaveValue('')
  expect(await page.evaluate(() => window.writes)).toEqual([])
  await propose(page, 'confirmar')
  await expect(name).toHaveValue('contrato administrativo')
  await expect(administrativeContact).not.toBeChecked()
  await expect(requester).not.toBeChecked()
  await expect(legalGuardian).not.toBeChecked()
  expect(await page.evaluate(() => window.writes)).toEqual([])

  for (const invalid of ['Marcar contrato administrativo extra', 'Não Marcar contrato administrativo']) {
    await propose(page, invalid)
    await expect(page.locator('.voice-command-error')).toBeVisible()
    await expect(page.locator('.voice-command-preview')).toHaveCount(0)
    await expect(name).toHaveValue('contrato administrativo')
    await expect(administrativeContact).not.toBeChecked()
    await expect(requester).not.toBeChecked()
    await expect(legalGuardian).not.toBeChecked()
    expect(await page.evaluate(() => window.writes)).toEqual([])
  }

  await command(page, 'Marcar Contato administrativo')
  await expect(administrativeContact).toBeChecked()
  await propose(page, 'Desmarcar contrato administrativo')
  await expect(page.locator('.voice-command-preview')).toContainText('Contato administrativo')
  await expect(administrativeContact).toBeChecked()
  await expect(name).toHaveValue('contrato administrativo')
  await expect(requester).not.toBeChecked()
  await expect(legalGuardian).not.toBeChecked()
  expect(await page.evaluate(() => window.writes)).toEqual([])
  await propose(page, 'confirmar')
  await expect(administrativeContact).not.toBeChecked()
  await expect(requester).not.toBeChecked()
  await expect(legalGuardian).not.toBeChecked()
  await expect(name).toHaveValue('contrato administrativo')
  await expect(form).toHaveAttribute('data-voice-record', 'party:ana:new')
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  expect(await page.evaluate(() => window.writes)).toEqual([])
  expect(await page.evaluate(() => window.voiceNativeCalls.filter(item => ['related_party_create', 'related_party_update', 'related_party_archive', 'related_party_restore'].includes(item.command)))).toEqual([])
})

test('quinta-feira seleciona Quinta somente após confirmar e cria série somente ao salvar explicitamente', async ({ page }) => {
  await openApp(page)
  await command(page, 'Mostrar agenda de hoje')
  await command(page, 'Clicar em Abrir formulário de novo compromisso')
  const form = page.getByRole('form', { name: 'Novo compromisso', exact: true })
  await command(page, 'Selecionar Tipo como Recorrente')
  const weekday = form.getByLabel('Dia da semana', { exact: true })
  await expect(weekday).toHaveAttribute('id', 'agenda-weekday')
  await expect(weekday).toHaveValue('6')
  await propose(page, 'Selecionar Dia da semana como quinta-feira')
  await expect(page.locator('.voice-command-preview')).toContainText('Dia da semana: Quinta')
  await expect(weekday).toHaveValue('6')
  expect(await page.evaluate(() => window.writes)).toEqual([])
  await propose(page, 'confirmar')
  await expect(weekday).toHaveValue('4')
  expect(await page.evaluate(() => window.writes)).toEqual([])
  await propose(page, 'Clicar em Criar série')
  await expect(page.locator('.voice-command-preview')).toContainText('Criar série')
  expect(await page.evaluate(() => window.writes)).toEqual([])
  await propose(page, 'confirmar')
  await expect.poll(() => page.evaluate(() => window.writes)).toEqual([
    { command: 'agenda_create_series', args: { input: {
      patientId: 'ana', weekday: 4, frequency: 'Semanal', startDate: '2026-10-03', endDate: null,
      start: '14:00', end: '14:50', modality: 'Presencial', meetingLink: null,
    } } },
  ])
})

for (const [label, value, variants] of [
  ['Domingo', '0', ['Domingo', 'DOMINGO', '0']],
  ['Segunda', '1', ['Segunda', 'segunda-feira', 'SEGUNDA FEIRA', '1']],
  ['Terça', '2', ['Terça', 'terça-feira', 'TERCA FEIRA', '2']],
  ['Quarta', '3', ['Quarta', 'quarta-feira', 'QUARTA FEIRA', '3']],
  ['Quinta', '4', ['Quinta', 'quinta-feira', 'QUINTA FEIRA', '4']],
  ['Sexta', '5', ['Sexta', 'sexta-feira', 'SEXTA FEIRA', '5']],
  ['Sábado', '6', ['Sábado', 'SABADO', '6']],
]) {
  test(`dia da semana ${label} aceita nome, variantes e valor numérico sem gravar`, async ({ page }) => {
    test.setTimeout(60000)
    await openApp(page)
    await command(page, 'Mostrar agenda de hoje')
    await command(page, 'Clicar em Abrir formulário de novo compromisso')
    const form = page.getByRole('form', { name: 'Novo compromisso', exact: true })
    await command(page, 'Selecionar Tipo como Recorrente')
    const weekday = form.getByLabel('Dia da semana', { exact: true })
    await expect(weekday).toHaveAttribute('data-voice-value-type', 'weekday')
    for (const variant of variants) {
      // Use a different existing option so every confirmation must change the control.
      const before = value === '0' ? '1' : '0'
      await weekday.selectOption(before)
      await propose(page, `Selecionar Dia da semana como ${variant}`)
      await expect(page.locator('.voice-command-preview')).toContainText(`Dia da semana: ${label}`)
      await expect(weekday).toHaveValue(before)
      expect(await page.evaluate(() => window.writes)).toEqual([])
      await propose(page, 'confirmar')
      await expect(weekday).toHaveValue(value)
      expect(await page.evaluate(() => window.writes)).toEqual([])
    }
  })
}

test('dia da semana recusa alternativas, data relativa e texto extra sem alterar a seleção', async ({ page }) => {
  await openApp(page)
  await command(page, 'Mostrar agenda de hoje')
  await command(page, 'Clicar em Abrir formulário de novo compromisso')
  const form = page.getByRole('form', { name: 'Novo compromisso', exact: true })
  await command(page, 'Selecionar Tipo como Recorrente')
  const weekday = form.getByLabel('Dia da semana', { exact: true })
  await expect(weekday).toHaveValue('6')
  for (const invalid of ['quinta ou sexta', 'proxima quinta', 'quinta-feira extra']) {
    await propose(page, `Selecionar Dia da semana como ${invalid}`)
    await expect(page.locator('.voice-command-error')).toBeVisible()
    await expect(page.locator('.voice-command-preview')).toHaveCount(0)
    await expect(weekday).toHaveValue('6')
    expect(await page.evaluate(() => window.writes)).toEqual([])
  }
})

test('quinta-feira permanece texto literal ao preencher Nome na edição do paciente', async ({ page }) => {
  await openApp(page)
  await command(page, 'Editar paciente Ana Clara')
  const form = page.getByRole('form', { name: 'Editar cadastro', exact: true })
  const name = form.getByLabel('Nome', { exact: true })
  await expect(name).toHaveValue('Ana Clara')
  await propose(page, 'Preencher Nome com quinta-feira')
  await expect(page.locator('.voice-command-preview')).toContainText('Nome: quinta-feira')
  await expect(name).toHaveValue('Ana Clara')
  expect(await page.evaluate(() => window.writes)).toEqual([])
  await propose(page, 'confirmar')
  await expect(name).toHaveValue('quinta-feira')
  expect(await page.evaluate(() => window.writes)).toEqual([])
})

test('marcador de dia da semana alterado invalida proposta antiga sem aplicar ou gravar', async ({ page }) => {
  await openApp(page)
  await command(page, 'Mostrar agenda de hoje')
  await command(page, 'Clicar em Abrir formulário de novo compromisso')
  const form = page.getByRole('form', { name: 'Novo compromisso', exact: true })
  await command(page, 'Selecionar Tipo como Recorrente')
  const weekday = form.getByLabel('Dia da semana', { exact: true })
  await expect(weekday).toHaveAttribute('data-voice-value-type', 'weekday')
  await expect(weekday).toHaveValue('6')
  await propose(page, 'Selecionar Dia da semana como quinta-feira')
  await expect(page.locator('.voice-command-preview')).toContainText('Dia da semana: Quinta')
  await weekday.evaluate(element => element.removeAttribute('data-voice-value-type'))
  await propose(page, 'confirmar')
  await expect(page.getByRole('alert')).toContainText('A tela mudou')
  await expect(weekday).toHaveValue('6')
  expect(await page.evaluate(() => window.writes)).toEqual([])
})

test('agenda avulsa e sessão com comportamento podem ser preenchidas e finalizadas por comando', async ({ page }) => {
  await openApp(page)
  await command(page, 'Agendar sessão para Ana Clara amanhã às três da tarde')
  const appointment = page.getByRole('form', { name: 'Novo compromisso' })
  await expect(appointment.getByLabel('Data do compromisso')).toHaveValue('2026-10-04')
  await command(page, 'Clicar em Criar compromisso avulso')
  await expect.poll(() => page.evaluate(() => window.writes.filter(item => item.command === 'agenda_create_series').length)).toBe(1)
  await command(page, 'Mostrar agenda de hoje')
  await command(page, 'Clicar em Detalhes e ações')
  await command(page, 'Clicar em Iniciar sessão de Ana Clara em 2026-10-03 às 15:00–15:50')
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toBeVisible()
  await command(page, 'Marcar Pede ajuda')
  await expect(page.getByRole('checkbox', { name: /Pede ajuda/ })).toBeChecked()
  await command(page, 'Preencher Observações descritivas com Pediu ajuda para concluir o jogo')
  await command(page, 'Preencher Procedimentos realizados com Atividade lúdica')
  await command(page, 'Preencher Resultado e decisão com Continuar acompanhamento')
  await command(page, 'Salvar rascunho')
  await expect.poll(() => page.evaluate(() => window.writes.filter(item => item.command === 'session_draft_save').length)).toBeGreaterThan(0)
  await command(page, 'Finalizar sessão')
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await propose(page, 'confirmar')
  await expect.poll(() => page.evaluate(() => window.writes.filter(item => item.command === 'session_finalize').length)).toBe(1)
})
