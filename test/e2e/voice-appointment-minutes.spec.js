import { expect, test } from '@playwright/test'

// Real DesktopVault/DesktopAgenda and assistant; vault IPC and optional audio are synthetic.
// Typed transcripts follow desktop-voice-interface.spec.js's propose/command helpers.
// No native microphone, real patient, profile or backend is used by this fixture.
async function openApp(page, { simulatedAudio = false } = {}) {
  await page.clock.install({ time: new Date('2026-10-03T15:00:00Z') })
  await page.addInitScript(({ simulatedAudio }) => {
    const clone = value => JSON.parse(JSON.stringify(value))
    // Ana is deliberately not the default patient: name-to-ID resolution must work.
    const patients = [
      { id: 'minutes-caio', name: 'Caio Fictício', age: 9, revision: 1, preferredModality: 'Presencial', archivedAt: null },
      { id: 'minutes-ana', name: 'Ana Clara', age: 8, revision: 1, preferredModality: 'Presencial', archivedAt: null },
    ]
    window.minuteFixture = { writes: [], series: [], unexpected: [] }
    if (simulatedAudio) {
      window.voiceTranscript = ''
      window.minuteVoiceCalls = []
      const media = window.minuteMedia = { mediaRequests: 0, trackStops: 0, contextCloses: 0, sourceDisconnects: 0, processorDisconnects: 0, captureRefs: [] }
      // Short synthetic speech then >1100 ms of trailing silence. Continuous
      // speech reaches the 12-second cap and requires manual preparation.
      // Fixed transcripts are not a native corpus or Rust/ASR accuracy evidence.
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
        close() { this.state = 'closed'; media.contextCloses++; return Promise.resolve() }
      }
      Object.defineProperty(window, 'AudioContext', { configurable: true, value: SyntheticAudioContext })
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
        getUserMedia: async () => {
          media.mediaRequests++
          return { getTracks: () => [{ stop() { media.trackStops++ } }] }
        },
      } })
    }
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      if (command === 'voice_transcribe' && simulatedAudio) {
        window.minuteMedia.captureRefs.push(args)
        // Snapshot evidence before transcribeLocalVoice clears the sample array.
        window.minuteVoiceCalls.push({
          command, sampleRate: args.sampleRate, sampleCount: args.samples.length,
          hasSignal: args.samples.some(sample => sample !== 0),
          patientNames: [...args.patientNames], transcript: window.voiceTranscript,
        })
        return window.voiceTranscript
      }
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { available: false, dirty: false }
      if (command === 'plugin:updater|check') return null
      if (command === 'patient_list') return clone(patients)
      if (command === 'agenda_list_series') return clone(window.minuteFixture.series)
      if ([
        'behavior_list', 'indicator_catalog', 'related_party_list', 'agenda_occurrences',
        'agenda_history', 'session_timeline', 'session_draft_list', 'case_context_list',
      ].includes(command)) return []
      if (command === 'agenda_create_series') {
        window.minuteFixture.writes.push(clone({ command, args }))
        const saved = { id: `minutes-series-${window.minuteFixture.series.length + 1}`, ...clone(args.input) }
        window.minuteFixture.series.push(saved)
        return clone(saved)
      }
      window.minuteFixture.unexpected.push(clone({ command, args }))
      throw new Error(`IPC não previsto na fixture de minutos: ${command}`)
    } }
  }, { simulatedAudio })
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Comando do Círculo' })).toBeVisible()
  // Wait for the catalog before proposing a command, rather than racing startup.
  await expect(page.getByRole('listitem').filter({ hasText: /^Ana Clara$/ })).toBeVisible()
}

async function propose(page, text) {
  const assistant = page.getByRole('region', { name: 'Comando do Círculo' })
  await assistant.getByLabel('Seu comando').fill(text)
  await assistant.getByRole('button', { name: 'Preparar rascunho' }).click()
}

async function command(page, text) {
  await propose(page, text)
  await expect(page.locator('.voice-command-preview')).toBeVisible()
  await propose(page, 'confirmar')
}

const appointmentForm = page => page.getByRole('form', { name: 'Novo compromisso', exact: true })

async function expectNoPersistence(page) {
  expect(await page.evaluate(() => window.minuteFixture)).toEqual({ writes: [], series: [], unexpected: [] })
}

test('áudio simulado: segundo áudio confirma 15:45–16:35 e criação exige salvar separadamente', async ({ page }) => {
  await openApp(page, { simulatedAudio: true })
  const assistant = page.getByRole('region', { name: 'Comando do Círculo' })
  const form = appointmentForm(page)
  const agenda = page.getByRole('region', { name: 'Agenda', exact: true })
  const preview = page.locator('.voice-command-preview')
  const transcripts = [
    'Agendar sessão semanal para Ana Clara na quinta às quinze e quarenta e cinco',
    'Confirmar comando',
  ]
  async function audio(text) {
    // Fixed, simulated transcripts: no native harness/corpus or Rust recognition claim.
    await page.evaluate(value => { window.voiceTranscript = value }, text)
    await assistant.getByRole('button', { name: 'Ouvir comando' }).click()
    await page.clock.runFor(1600)
    await expect(assistant.getByRole('button', { name: 'Ouvir comando' })).toBeEnabled()
    await expect(assistant.getByLabel('Seu comando')).toHaveValue(text)
    await expect(assistant.getByText(/A captura atingiu .*segundos e pode estar incompleta/u)).toHaveCount(0)
  }
  await expect(form).toHaveCount(0)
  await expect(agenda).toBeHidden()
  await audio(transcripts[0])
  await expect(preview).toContainText('Ana Clara')
  await expect(preview).toContainText('15:45–16:35')
  // The first audio only proposes; fields are not opened or filled yet.
  await expect(form).toHaveCount(0)
  await expect(agenda).toBeHidden()
  expect(await page.evaluate(() => window.minuteVoiceCalls.length)).toBe(1)
  await expectNoPersistence(page)

  await audio(transcripts[1])
  await expect(form).toBeVisible()
  await expect(preview).toHaveCount(0)
  await expect(form.getByLabel('Paciente', { exact: true })).toHaveValue('minutes-ana')
  await expect(form.getByLabel('Tipo', { exact: true })).toHaveValue('Recorrente')
  await expect(form.getByLabel('Dia da semana', { exact: true })).toHaveValue('4')
  await expect(form.getByLabel('Frequência', { exact: true })).toHaveValue('Semanal')
  await expect(form.getByLabel('Início da série', { exact: true })).toHaveValue('2026-10-03')
  await expect(form.getByLabel('Horário inicial', { exact: true })).toHaveValue('15:45')
  await expect(form.getByLabel('Horário final', { exact: true })).toHaveValue('16:35')
  await expectNoPersistence(page)
  const calls = await page.evaluate(() => window.minuteVoiceCalls)
  expect(calls).toHaveLength(2)
  expect(calls.map(call => call.transcript)).toEqual(transcripts)
  expect(await page.evaluate(() => {
    const media = window.minuteMedia
    return [media.mediaRequests, media.trackStops, media.contextCloses, media.sourceDisconnects, media.processorDisconnects]
  })).toEqual([2, 2, 2, 2, 2])
  expect(await page.evaluate(() => {
    const refs = window.minuteMedia.captureRefs
    return refs.length === 2 && refs.every(args => args.samples.every(sample => sample === 0) && args.patientNames.every(name => name === ''))
  })).toBe(true)
  for (const call of calls) {
    expect(call).toMatchObject({ command: 'voice_transcribe', sampleRate: 8_000, hasSignal: true })
    expect(call.sampleCount).toBeGreaterThan(0)
    expect(call.sampleCount / call.sampleRate).toBeLessThan(12)
    expect(call.patientNames).toEqual(['Caio Fictício', 'Ana Clara'])
  }

  // Saving remains an explicit, separate typed proposal and confirmation.
  await propose(page, 'Clicar em Criar série')
  await expect(preview).toContainText('Criar série')
  await expectNoPersistence(page)
  await propose(page, 'confirmar')
  await expect.poll(() => page.evaluate(() => window.minuteFixture.writes)).toEqual([
    { command: 'agenda_create_series', args: { input: {
      patientId: 'minutes-ana', weekday: 4, frequency: 'Semanal',
      startDate: '2026-10-03', endDate: null, start: '15:45', end: '16:35',
      modality: 'Presencial', meetingLink: null,
    } } },
  ])
  await expect(page.getByText('Série recorrente salva no cofre cifrado.', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.minuteVoiceCalls.length)).toBe(2)
  expect(await page.evaluate(() => window.minuteFixture.unexpected)).toEqual([])
})

for (const recurring of [true, false]) {
  const type = recurring ? 'semanal' : 'avulsa'
  const request = time => recurring
    ? `Agendar sessão semanal para Ana Clara na quinta às ${time}`
    : `Agendar sessão avulsa para Ana Clara amanhã às ${time}`

  for (const { spoken, start, end } of [
    { spoken: 'quinze e quarenta e cinco', start: '15:45', end: '16:35' },
    { spoken: 'vinte e uma e trinta', start: '21:30', end: '22:20' },
  ]) {
    test(`${type}: ${spoken} prepara ${start}–${end}, confirma campos e salva separadamente`, async ({ page }) => {
      await openApp(page)
      const form = appointmentForm(page)
      const agenda = page.getByRole('region', { name: 'Agenda', exact: true })
      await expect(form).toHaveCount(0)
      await expect(agenda).toBeHidden()

      await propose(page, request(spoken))
      const preview = page.locator('.voice-command-preview')
      await expect(preview).toContainText('Ana Clara')
      await expect(preview).toContainText(`${start}–${end}`)
      await expect(preview).toContainText(recurring ? 'semanal' : '2026-10-04')
      await expect(form).toHaveCount(0)
      await expect(agenda).toBeHidden()
      await expectNoPersistence(page)

      // The first confirmation opens/fills the form; it must not create a series.
      await propose(page, 'confirmar')
      await expect(form).toBeVisible()
      await expect(preview).toHaveCount(0)
      await expect(form.getByLabel('Tipo', { exact: true })).toHaveValue(recurring ? 'Recorrente' : 'Avulsa')
      await expect(form.getByLabel('Paciente', { exact: true })).toHaveValue('minutes-ana')
      await expect(form.getByLabel('Horário inicial', { exact: true })).toHaveValue(start)
      await expect(form.getByLabel('Horário final', { exact: true })).toHaveValue(end)
      await expect(form.getByLabel(recurring ? 'Início da série' : 'Data do compromisso', { exact: true }))
        .toHaveValue(recurring ? '2026-10-03' : '2026-10-04')
      await expect(form.getByLabel('Modalidade', { exact: true })).toHaveValue('Presencial')
      if (recurring) {
        await expect(form.getByLabel('Dia da semana', { exact: true })).toHaveValue('4')
        await expect(form.getByLabel('Frequência', { exact: true })).toHaveValue('Semanal')
        await expect(form.getByLabel('Término opcional (inclusivo)', { exact: true })).toHaveValue('')
      }
      await expectNoPersistence(page)

      const saveLabel = recurring ? 'Criar série' : 'Criar compromisso avulso'
      await propose(page, `Clicar em ${saveLabel}`)
      await expect(preview).toContainText(saveLabel)
      await expect(form.getByLabel('Horário inicial', { exact: true })).toHaveValue(start)
      await expect(form.getByLabel('Horário final', { exact: true })).toHaveValue(end)
      await expectNoPersistence(page)
      await propose(page, 'confirmar')
      const input = {
        patientId: 'minutes-ana', weekday: recurring ? 4 : 0,
        frequency: recurring ? 'Semanal' : 'Avulsa',
        startDate: recurring ? '2026-10-03' : '2026-10-04',
        endDate: recurring ? null : '2026-10-04',
        start, end, modality: 'Presencial', meetingLink: null,
      }
      await expect.poll(() => page.evaluate(() => window.minuteFixture.writes)).toEqual([
        { command: 'agenda_create_series', args: { input } },
      ])
      await expect(page.getByText(recurring
        ? 'Série recorrente salva no cofre cifrado.'
        : 'Compromisso avulso salvo no cofre cifrado.', { exact: true })).toBeVisible()
      expect(await page.evaluate(() => window.minuteFixture.series)).toEqual([{ id: 'minutes-series-1', ...input }])
      expect(await page.evaluate(() => window.minuteFixture.unexpected)).toEqual([])
    })
  }

  for (const { label, time } of [
    // Existing contract rejects an end at 00:00, including exactly 23:10 + 50 min.
    { label: 'limite natural 23:10–00:00', time: 'vinte e três e dez' },
    { label: 'limite numérico 23h10–00:00', time: '23h10' },
    { label: '3h ambíguo', time: '3h' },
    { label: 'comando extra', time: 'quinze e quarenta e cinco e abrir pacientes' },
    { label: 'horários alternativos', time: 'quinze e quarenta e cinco ou dezesseis horas' },
  ]) {
    test(`${type}: recusa ${label} sem alterar rascunho nem persistir`, async ({ page }) => {
      await openApp(page)
      // An existing unrelated draft catches accidental application of a prefix.
      await command(page, 'Abrir Agenda')
      await command(page, 'Abrir Novo compromisso')
      const form = appointmentForm(page)
      await expect(form).toBeVisible()
      await form.getByLabel('Paciente', { exact: true }).selectOption('minutes-caio')
      await form.getByLabel('Data do compromisso', { exact: true }).fill('2026-10-06')
      await form.getByLabel('Horário inicial', { exact: true }).fill('10:20')
      await form.getByLabel('Horário final', { exact: true }).fill('11:10')
      const fields = () => form.locator('input, select').evaluateAll(elements => elements.map(element => ({
        id: element.id, value: element.value,
      })))
      const before = await fields()

      await propose(page, request(time))
      await expect(page.locator('.voice-command-error')).toBeVisible()
      await expect(page.locator('.voice-command-preview')).toHaveCount(0)
      await expect(form).toBeVisible()
      expect(await fields()).toEqual(before)
      await expectNoPersistence(page)

      // A subsequent confirmation must not revive an invalid/partial proposal.
      await propose(page, 'confirmar')
      await expect(page.locator('.voice-command-error')).toBeVisible()
      await expect(page.locator('.voice-command-preview')).toHaveCount(0)
      await expect(form).toBeVisible()
      expect(await fields()).toEqual(before)
      await expectNoPersistence(page)
    })
  }
}
