import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const assistant = page => page.getByRole('region', { name: 'Comando do Círculo' })
const preview = page => page.locator('.voice-command-preview')
const occurrenceForm = page => page.getByRole('form', { name: 'Alterar ocorrência individual', exact: true })
const draftForm = page => page.getByRole('form', { name: 'Rascunho de sessão', exact: true })
const snapshot = page => page.evaluate(() => structuredClone(window.occurrenceMinutes.state))
const writes = page => page.evaluate(() => structuredClone(window.occurrenceMinutes.writes))
const clocks = [
  { start: '15:45', end: '16:35', decoy: '15:00', decoyEnd: '15:50', spoken: 'quinze horas e quarenta e cinco minutos' },
  { start: '21:35', end: '22:25', decoy: '21:00', decoyEnd: '21:50', spoken: 'vinte e uma horas e trinta e cinco minutos' },
]

// Load the real app entrypoint: DesktopVault, Agenda, Sessions and the central
// assistant router. Only native persistence is synthetic; unknown IPC throws.
async function openApp(page, clock = clocks[0], { allowStart = false, referenceDate = '2026-10-04', originalDate = '2026-10-03' } = {}) {
  await page.clock.install({ time: new Date(`${referenceDate}T15:00:00Z`) })
  await page.addInitScript(({ clock, allowStart, referenceDate, originalDate }) => {
    const clone = value => structuredClone(value)
    const patients = [{ id: 'ana', name: 'Ana Clara', age: 8, revision: 1, preferredModality: 'Presencial', archivedAt: null }]
    const occurrences = [
      { id: 'occ-decoy', seriesId: 'series-decoy', patientId: 'ana', originalDate: referenceDate, date: referenceDate, start: clock.decoy, end: clock.decoyEnd, status: 'scheduled', frequency: 'Avulsa', modality: 'Presencial', meetingLink: null, wasRescheduled: false },
      { id: 'occ-target', seriesId: 'series-target', patientId: 'ana', originalDate, date: referenceDate, start: clock.start, end: clock.end, status: 'scheduled', frequency: 'Avulsa', modality: 'Presencial', meetingLink: null, wasRescheduled: true },
    ]
    const series = occurrences.map(item => ({ id: item.seriesId, patientId: item.patientId, weekday: new Date(`${item.originalDate}T12:00:00Z`).getUTCDay(), start: item.start, end: item.end, frequency: 'Avulsa', startDate: item.originalDate, endDate: item.originalDate, modality: item.modality, meetingLink: null, timeZone: 'America/Sao_Paulo', revision: 1 }))
    const history = [{ id: 'move-target', seriesId: 'series-target', action: 'reschedule', originalDate, effectiveDate: referenceDate, start: clock.start, end: clock.end, reason: 'Remarcação fictícia preservada' }]
    const drafts = [{ id: 'draft-prior', patientId: 'ana', seriesId: 'series-prior', originalDate: '2026-09-27', observation: 'Observação fictícia anterior preservada.', procedures: '', outcomeDecision: '', referralClosure: '', behaviorIds: [], indicators: [] }]
    const sessions = occurrences.map((item, index) => ({
      id: index === 0 ? 'final-decoy' : 'final-target', patientId: 'ana', seriesId: `completed-${item.seriesId}`, originalDate: item.originalDate,
      sessionDate: referenceDate, start: item.start, end: item.end, modality: 'Presencial', wasRescheduled: item.wasRescheduled,
      observation: `Observação finalizada fictícia ${index}.`, procedures: `Procedimentos fictícios ${index}.`, outcomeDecision: `Resultado fictício ${index}.`, referralClosure: '', behaviors: [], indicators: [],
    }))
    const addenda = [{ id: 'adendo-prior', sessionId: 'final-decoy', patientId: 'ana', createdAt: `${referenceDate}T14:00:00Z`, content: 'Adendo fictício anterior preservado.' }]
    const fixture = window.occurrenceMinutes = {
      state: { patients, series, occurrences, history, drafts, sessions, addenda, contexts: [] },
      calls: [], writes: [], unexpected: [], catalogReady: false, transcript: '',
      mediaRequests: 0, trackStops: 0, contextCloses: 0, sourceDisconnects: 0, processorDisconnects: 0, captureRefs: [],
    }
    const catalogReads = new Set()
    const catalog = (command, result) => {
      catalogReads.add(command)
      fixture.catalogReady = ['patient_list', 'behavior_list', 'indicator_catalog'].every(name => catalogReads.has(name))
      return clone(result)
    }
    // Short synthetic speech then >1100 ms of trailing silence, as in the 76
    // replay fixtures. Continuous nonzero frames correctly reach the 12-second
    // cap and require manual preparation. Preserved transcripts are replayed
    // through simulated media/IPC, not Rust, captured WAVs or a real microphone.
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
      if (command === 'agenda_occurrences') return clone(occurrences.filter(item => item.date >= args.from && item.date <= args.to))
      if (command === 'session_draft_list') return clone(drafts.filter(item => item.patientId === args.patientId))
      if (command === 'session_timeline') return clone(sessions.filter(item => item.patientId === args.patientId))
      if (command === 'session_addendum_list') return clone(addenda.filter(item => item.patientId === args.patientId))
      if (command === 'case_context_list') return clone(fixture.state.contexts)
      if (command === 'voice_transcribe') { fixture.captureRefs.push(args); return fixture.transcript }
      if (command === 'session_draft_start' && allowStart) {
        // The sole authorized write must target the moved occurrence's original
        // identity, never the whole-hour decoy or its effective date as identity.
        if (args.seriesId !== 'series-target' || args.originalDate !== originalDate || Object.keys(args).length !== 2) {
          fixture.unexpected.push(command)
          throw new Error('session_draft_start: alvo ou payload incorreto')
        }
        fixture.writes.push(clone({ command, args }))
        const selected = { id: 'draft-target', patientId: 'ana', seriesId: args.seriesId, originalDate: args.originalDate, observation: 'Observação fictícia da ocorrência exata.', procedures: 'Procedimentos fictícios da ocorrência exata.', outcomeDecision: 'Resultado fictício da ocorrência exata.', referralClosure: '', behaviorIds: [], indicators: [] }
        drafts.push(selected)
        return clone(selected)
      }
      fixture.unexpected.push(command)
      if (/(?:create|update|save|start|cancel|finalize|reschedule|archive|restore)/.test(command)) fixture.writes.push(clone({ command, args }))
      throw new Error(`IPC sem fixture: ${command}`)
    } }
  }, { clock, allowStart, referenceDate, originalDate })
  await page.goto('/')
  await expect(assistant(page)).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.occurrenceMinutes.catalogReady)).toBe(true)
  await expect(page.locator('.vault-home-preview')).toContainText('Ana Clara')
  await page.clock.runFor(32)
  await propose(page, 'Mostrar agenda de hoje')
  await expect(preview(page)).toBeVisible()
  await confirm(page)
  await expect(page.getByRole('region', { name: 'Calendário dia', exact: true })).toBeVisible()
  await expect(page.getByText('Carregando Agenda...', { exact: true })).toHaveCount(0)
  await expect(page.locator('[data-voice-action^="agenda:details:"]')).toHaveCount(2)
  await expect(page.getByLabel('Data de referência')).toHaveValue(referenceDate)
  expect(await writes(page)).toEqual([])
}

async function propose(page, text) {
  await assistant(page).getByLabel('Seu comando').fill(text)
  await assistant(page).getByRole('button', { name: 'Preparar rascunho' }).click()
}

async function confirm(page) {
  await propose(page, 'confirmar')
  await page.clock.runFor(32)
  await expect(preview(page)).toHaveCount(0)
}

async function expectUnchanged(page, before) {
  expect(await snapshot(page)).toEqual(before)
  expect(await writes(page)).toEqual([])
  expect(await page.evaluate(() => window.occurrenceMinutes.unexpected)).toEqual([])
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
}

async function expectProposal(page, request, clock, before) {
  await propose(page, request)
  await expect(preview(page)).toContainText('Ana Clara')
  await expect(preview(page)).toContainText(clock.start)
  await expect(preview(page)).not.toContainText(clock.decoy)
  await expect(occurrenceForm(page)).toHaveCount(0)
  await expect(draftForm(page)).toHaveCount(0)
  await expect(page.locator('textarea[id^="addendum-"]')).toHaveCount(0)
  await expectUnchanged(page, before)
}

test.beforeEach(async ({ page, baseURL }) => {
  const unexpected = []
  page.on('dialog', async dialog => { unexpected.push(`native dialog: ${dialog.type()}`); await dialog.dismiss() })
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) await route.continue()
    else { unexpected.push(route.request().url()); await route.abort() }
  })
  page.occurrenceMinutesBoundary = unexpected
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.occurrenceMinutes?.unexpected || [])).toEqual([])
  expect(page.occurrenceMinutesBoundary).toEqual([])
})

for (const clock of clocks) {
  test(`shell iniciar ${clock.start}: minutos falados exigem confirmação e iniciam somente a ocorrência exata`, async ({ page }) => {
    await openApp(page, clock, { allowStart: true })
    const before = await snapshot(page)
    await expectProposal(page, `Iniciar sessão de Ana Clara hoje às ${clock.spoken}`, clock, before)
    await confirm(page)
    const expectedWrites = [{ command: 'session_draft_start', args: { seriesId: 'series-target', originalDate: '2026-10-03' } }]
    await expect.poll(() => writes(page)).toEqual(expectedWrites)
    const form = draftForm(page)
    await expect(form).toHaveAttribute('data-voice-record', 'draft-target')
    await expect(form.getByRole('heading')).toHaveText('Rascunho da ocorrência 2026-10-03')
    await expect(form.getByLabel('Observações descritivas', { exact: true })).toHaveValue('Observação fictícia da ocorrência exata.')
    await expect(form.getByLabel('Procedimentos realizados', { exact: true })).toHaveValue('Procedimentos fictícios da ocorrência exata.')
    await expect(form.getByLabel('Resultado e decisão', { exact: true })).toHaveValue('Resultado fictício da ocorrência exata.')
    await page.clock.runFor(1200)
    expect(await writes(page)).toEqual(expectedWrites)
    const after = await snapshot(page)
    expect(after.drafts).toEqual([...before.drafts, {
      id: 'draft-target', patientId: 'ana', seriesId: 'series-target', originalDate: '2026-10-03', observation: 'Observação fictícia da ocorrência exata.', procedures: 'Procedimentos fictícios da ocorrência exata.', outcomeDecision: 'Resultado fictício da ocorrência exata.', referralClosure: '', behaviorIds: [], indicators: [],
    }])
    expect({ ...after, drafts: before.drafts }).toEqual(before)
    await expect(occurrenceForm(page)).toHaveCount(0)
  })

  for (const [verb, action] of [['Remarcar', 'remarcar'], ['Cancelar', 'cancelar']]) {
    test(`shell ${verb.toLowerCase()} ${clock.start}: minutos abrem somente o formulário correto sem writes`, async ({ page }) => {
      await openApp(page, clock)
      const before = await snapshot(page)
      await expectProposal(page, `${verb} sessão de Ana Clara hoje às ${clock.spoken}`, clock, before)
      await confirm(page)
      const form = occurrenceForm(page)
      await expect(form).toBeVisible()
      await expect(form).toHaveAttribute('data-voice-record', 'series-target:2026-10-03')
      await expect(form).toContainText(`original 2026-10-03 · efetiva 2026-10-04 às ${clock.start}–${clock.end}`)
      await expect(form.getByLabel('Ação explícita')).toHaveValue(action)
      if (action === 'remarcar') {
        await expect(form.getByLabel('Nova data efetiva')).toHaveValue('2026-10-04')
        await expect(form.getByLabel('Novo início')).toHaveValue(clock.start)
        await expect(form.getByLabel('Novo fim')).toHaveValue(clock.end)
      } else {
        await expect(form.getByLabel('Nova data efetiva')).toHaveCount(0)
      }
      await expect(form.getByLabel(action === 'cancelar' ? 'Motivo administrativo (obrigatório)' : 'Motivo administrativo (opcional)', { exact: true })).toHaveValue('')
      await expect(draftForm(page)).toHaveCount(0)
      await expectUnchanged(page, before)
      await page.clock.runFor(1200)
      await expectUnchanged(page, before)
    })
  }

  test(`shell adendo ${clock.start}: minutos selecionam a finalizada exata sem criar adendo ou mudar registros`, async ({ page }) => {
    await openApp(page, clock)
    const before = await snapshot(page)
    await expectProposal(page, `Adicionar adendo à sessão de Ana Clara de 04/10/2026 às ${clock.spoken}`, clock, before)
    await confirm(page)
    const editor = page.locator('#addendum-final-target')
    await expect(editor).toBeVisible()
    await expect(editor).toHaveValue('')
    await expect(page.locator('textarea[id^="addendum-"]')).toHaveCount(1)
    await expect(page.locator('#addendum-final-decoy')).toHaveCount(0)
    const card = page.locator('li[data-voice-record="session:final-target"]')
    await expect(card).toContainText(`${clock.start}–${clock.end}`)
    await expect(card).toContainText(before.sessions[1].observation)
    await expect(page.locator('li[data-voice-record="session:final-decoy"]')).toContainText(before.sessions[0].observation)
    await expectUnchanged(page, before)
    // Editing remains local until the explicit save; this spec never saves.
    await editor.fill('Complemento fictício ainda não salvo para a sessão exata.')
    await expect(card.getByRole('button', { name: 'Salvar adendo imutável', exact: true })).toBeEnabled()
    await page.clock.runFor(1200)
    await expect(editor).toHaveValue('Complemento fictício ainda não salvo para a sessão exata.')
    await expectUnchanged(page, before)
    await expect(draftForm(page)).toHaveCount(0)
    await expect(occurrenceForm(page)).toHaveCount(0)
  })
}

for (const verb of ['Iniciar', 'Remarcar', 'Cancelar', 'Adicionar adendo']) {
  test(`shell ${verb.toLowerCase()}: horários ambíguos, minutos inválidos e texto extra recusam sem truncar ou gravar`, async ({ page }) => {
    await openApp(page)
    const before = await snapshot(page)
    const prefix = verb === 'Adicionar adendo'
      ? 'Adicionar adendo à sessão de Ana Clara de 04/10/2026 às '
      : `${verb} sessão de Ana Clara hoje às `
    for (const phrase of [
      'três horas e quarenta e cinco minutos',
      'quinze horas e sessenta minutos',
      'quinze horas e quarenta e cinco minutos e quinze horas',
      'quinze horas e quarenta e cinco minutos ou dezesseis horas',
      'quinze horas e quarenta e cinco minutos e salvar',
      'quinze horas e quarenta e cinco minutos comentário fictício',
      'vinte e uma horas e trinta e cinco minutos comentário fictício',
    ]) {
      await test.step(phrase, async () => {
        await propose(page, prefix + phrase)
        await expect(preview(page)).toHaveCount(0)
        await expect(page.locator('.voice-command-error')).toBeVisible()
        await expectUnchanged(page, before)
        await confirm(page)
        await expectUnchanged(page, before)
        await expect(draftForm(page)).toHaveCount(0)
        await expect(occurrenceForm(page)).toHaveCount(0)
        await expect(page.locator('textarea[id^="addendum-"]')).toHaveCount(0)
      })
    }
  })
}

async function replayAudio(page, corpus, index) {
  const recording = corpus.find(item => item.Index === index)
  expect(recording, `Captura nativa Index ${index}`).toBeDefined()
  expect(recording.Transcript).toEqual(expect.any(String))
  expect(recording.Transcript.trim()).not.toBe('')
  // Pass the actual captured text unchanged, including "hoje" and "seção".
  await page.evaluate(text => { window.occurrenceMinutes.transcript = text }, recording.Transcript)
  const listen = assistant(page).getByRole('button', { name: 'Ouvir comando' })
  await listen.click()
  await page.clock.runFor(1600)
  await expect(listen).toBeEnabled()
  await expect(assistant(page).getByLabel('Seu comando')).toHaveValue(recording.Transcript)
  await expect(assistant(page).getByText(/A captura atingiu .*segundos e pode estar incompleta/u)).toHaveCount(0)
}

async function expectReplayCleanup(page) {
  expect(await page.evaluate(() => {
    const fixture = window.occurrenceMinutes
    return [fixture.mediaRequests, fixture.trackStops, fixture.contextCloses, fixture.sourceDisconnects, fixture.processorDisconnects]
  })).toEqual([2, 2, 2, 2, 2])
  expect(await page.evaluate(() => {
    const refs = window.occurrenceMinutes.captureRefs
    return refs.length === 2 && refs.every(args => args.samples.every(sample => sample === 0) && args.patientNames.every(name => name === ''))
  })).toBe(true)
}

for (const [index, action] of [[0, 'iniciar'], [1, 'remarcar'], [2, 'cancelar'], [3, 'adendo']]) {
  test(`REPLAY SAPI 0 ${action}: captura ${index}+4 intacta, efetiva 3/10 e original 2/10, confirmação por segundo áudio`, async ({ page }) => {
    // Use only the completed SAPI-rate-0 run, including its own confirmation.
    // The earlier corpus remains untouched: its null captures are not successes.
    const corpus = JSON.parse(readFileSync(new URL('../fixtures/native-voice-occurrence-minutes-normal-20261004.json', import.meta.url), 'utf8'))
    expect(corpus.find(item => item.Index === 4)?.Transcript).toBe('Confirmar comando.')
    await openApp(page, clocks[0], { allowStart: action === 'iniciar', referenceDate: '2026-10-03', originalDate: '2026-10-02' })
    const before = await snapshot(page)
    expect(before.occurrences[1]).toMatchObject({ originalDate: '2026-10-02', date: '2026-10-03', start: '15:45' })
    expect(before.sessions[1]).toMatchObject({ originalDate: '2026-10-02', sessionDate: '2026-10-03', start: '15:45' })
    await replayAudio(page, corpus, index)
    await expect(preview(page)).toContainText('Ana Clara')
    await expect(preview(page)).toContainText('03/10/2026')
    await expect(preview(page)).toContainText('15:45')
    await expect(preview(page)).not.toContainText('15:00')
    await expect(occurrenceForm(page)).toHaveCount(0)
    await expect(draftForm(page)).toHaveCount(0)
    await expect(page.locator('textarea[id^="addendum-"]')).toHaveCount(0)
    await expectUnchanged(page, before)
    expect(await page.evaluate(() => window.occurrenceMinutes.calls.filter(call => call.command === 'voice_transcribe').length)).toBe(1)

    await replayAudio(page, corpus, 4)
    await expect(preview(page)).toHaveCount(0)
    if (action === 'iniciar') {
      const expectedWrites = [{ command: 'session_draft_start', args: { seriesId: 'series-target', originalDate: '2026-10-02' } }]
      await expect.poll(() => writes(page)).toEqual(expectedWrites)
      const form = draftForm(page)
      await expect(form).toHaveAttribute('data-voice-record', 'draft-target')
      await expect(form.getByRole('heading')).toHaveText('Rascunho da ocorrência 2026-10-02')
      await expect(form.getByLabel('Observações descritivas', { exact: true })).toHaveValue('Observação fictícia da ocorrência exata.')
      await expect(form.getByLabel('Procedimentos realizados', { exact: true })).toHaveValue('Procedimentos fictícios da ocorrência exata.')
      await expect(form.getByLabel('Resultado e decisão', { exact: true })).toHaveValue('Resultado fictício da ocorrência exata.')
      await page.clock.runFor(1200)
      expect(await writes(page)).toEqual(expectedWrites)
      const after = await snapshot(page)
      expect(after.drafts).toEqual([...before.drafts, {
        id: 'draft-target', patientId: 'ana', seriesId: 'series-target', originalDate: '2026-10-02', observation: 'Observação fictícia da ocorrência exata.', procedures: 'Procedimentos fictícios da ocorrência exata.', outcomeDecision: 'Resultado fictício da ocorrência exata.', referralClosure: '', behaviorIds: [], indicators: [],
      }])
      expect({ ...after, drafts: before.drafts }).toEqual(before)
      await expect(occurrenceForm(page)).toHaveCount(0)
      await expect(page.locator('textarea[id^="addendum-"]')).toHaveCount(0)
    } else if (action === 'adendo') {
      const editor = page.locator('#addendum-final-target')
      await expect(editor).toBeVisible()
      await expect(editor).toHaveValue('')
      await expect(page.locator('textarea[id^="addendum-"]')).toHaveCount(1)
      await expect(page.locator('#addendum-final-decoy')).toHaveCount(0)
      const card = page.locator('li[data-voice-record="session:final-target"]')
      await expect(card).toContainText('2026-10-03')
      await expect(card).toContainText('15:45–16:35')
      await expect(card).toContainText(before.sessions[1].observation)
      await expect(page.locator('li[data-voice-record="session:final-decoy"]')).toContainText(before.sessions[0].observation)
      await page.clock.runFor(1200)
      await expectUnchanged(page, before)
      await expect(draftForm(page)).toHaveCount(0)
      await expect(occurrenceForm(page)).toHaveCount(0)
    } else {
      const form = occurrenceForm(page)
      await expect(form).toBeVisible()
      await expect(form).toHaveAttribute('data-voice-record', 'series-target:2026-10-02')
      await expect(form).toContainText('original 2026-10-02 · efetiva 2026-10-03 às 15:45–16:35')
      await expect(form.getByLabel('Ação explícita')).toHaveValue(action)
      if (action === 'remarcar') {
        await expect(form.getByLabel('Nova data efetiva')).toHaveValue('2026-10-03')
        await expect(form.getByLabel('Novo início')).toHaveValue('15:45')
        await expect(form.getByLabel('Novo fim')).toHaveValue('16:35')
      } else {
        await expect(form.getByLabel('Nova data efetiva')).toHaveCount(0)
      }
      await expect(form.getByLabel(action === 'cancelar' ? 'Motivo administrativo (obrigatório)' : 'Motivo administrativo (opcional)', { exact: true })).toHaveValue('')
      await page.clock.runFor(1200)
      await expectUnchanged(page, before)
      await expect(draftForm(page)).toHaveCount(0)
      await expect(page.locator('textarea[id^="addendum-"]')).toHaveCount(0)
    }
    const captures = await page.evaluate(() => window.occurrenceMinutes.calls.filter(call => call.command === 'voice_transcribe'))
    expect(captures).toHaveLength(2)
    await expectReplayCleanup(page)
    for (const { args } of captures) {
      expect(args.sampleRate).toBe(8000)
      expect(args.samples.length).toBeGreaterThan(0)
      expect(args.samples.length / args.sampleRate).toBeLessThan(12)
      expect(args.samples.some(sample => sample !== 0)).toBe(true)
      expect(args.patientNames).toContain('Ana Clara')
    }
  })
}
