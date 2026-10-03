import { expect, test } from '@playwright/test'

// Exercise the real desktop shell, agenda and voice router. Only native persistence
// is synthetic; event fields and inclusive endDate mirror vault/agenda.rs.
async function openApp(page, { seed = true, endDate = null, homonyms = false } = {}) {
  await page.clock.install({ time: new Date('2026-10-03T15:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-03T15:00:00Z'))
  await page.addInitScript(({ seed, endDate, homonyms }) => {
    const clone = value => structuredClone(value)
    const plusDays = (date, days) => {
      const value = new Date(`${date}T12:00:00Z`)
      value.setUTCDate(value.getUTCDate() + days)
      return value.toISOString().slice(0, 10)
    }
    const patient = { id: 'ana', name: 'Ana Clara', age: 8, revision: 1, preferredModality: 'Presencial', archivedAt: null }
    const series = seed ? [{ id: 'series-ana', patientId: 'ana', weekday: 1, start: '15:00', end: '15:50', frequency: 'Semanal', startDate: '2026-09-28', endDate, modality: 'Presencial', meetingLink: null, timeZone: 'America/Sao_Paulo', revision: 1 }] : []
    const history = seed ? [{ id: 'event-prior', seriesId: 'series-ana', action: 'reschedule', originalDate: '2026-09-28', effectiveDate: '2026-09-29', start: '15:00', end: '15:50', reason: 'Ajuste sintético anterior' }] : []
    const state = { series, history }
    window.agendaWorkflow = { state, calls: [], writes: [], unexpected: [] }
    const occurrences = (from, to) => series.flatMap(item => {
      const result = []
      let originalDate = item.startDate
      while (new Date(`${originalDate}T12:00:00Z`).getUTCDay() !== item.weekday) originalDate = plusDays(originalDate, 1)
      // Include earlier originals which were moved into the requested range.
      const horizon = [to, ...history.filter(event => event.seriesId === item.id && event.effectiveDate >= from && event.effectiveDate <= to).map(event => event.originalDate)].sort().at(-1)
      for (; originalDate <= horizon && (!item.endDate || originalDate <= item.endDate); originalDate = plusDays(originalDate, item.frequency === 'Quinzenal' ? 14 : 7)) {
        const events = history.filter(event => event.seriesId === item.id && event.originalDate === originalDate)
        if (events.some(event => event.action === 'cancel')) continue
        const moved = events.filter(event => event.action === 'reschedule').at(-1)
        const date = moved?.effectiveDate || originalDate
        if (date < from || date > to) continue
        result.push({ id: `${item.id}:${originalDate}`, seriesId: item.id, patientId: item.patientId, originalDate, date, start: moved?.start || item.start, end: moved?.end || item.end, status: 'scheduled', frequency: item.frequency, modality: item.modality, meetingLink: item.meetingLink, wasRescheduled: Boolean(moved) })
      }
      return result
    })
    const save = (command, args, result) => {
      window.agendaWorkflow.writes.push(clone({ command, args }))
      return clone(result)
    }
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      window.agendaWorkflow.calls.push(clone({ command, args }))
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { available: false, dirty: false }
      if (command === 'plugin:updater|check') return null
      if (command === 'patient_list') return clone(homonyms ? [patient, { ...patient, id: 'ana2' }] : [patient])
      if (command === 'behavior_list' || command === 'indicator_catalog') return []
      if (command === 'agenda_list_series') return clone(series)
      if (command === 'agenda_history') return clone(history.slice().reverse())
      if (command === 'agenda_occurrences') return clone(occurrences(args.from, args.to))
      if (command === 'agenda_create_series') {
        const item = { ...clone(args.input), id: 'series-created', timeZone: 'America/Sao_Paulo', revision: 1 }
        series.push(item)
        return save(command, args, item)
      }
      if (command === 'agenda_reschedule' || command === 'agenda_cancel') {
        const item = series.find(item => item.id === args.seriesId)
        const effectiveDate = history.filter(event => event.seriesId === args.seriesId && event.originalDate === args.originalDate && event.action === 'reschedule').at(-1)?.effectiveDate || args.originalDate
        if (!item || !occurrences(effectiveDate, effectiveDate).some(occurrence => occurrence.seriesId === args.seriesId && occurrence.originalDate === args.originalDate)) throw new Error('Ocorrência sintética ausente')
        if (command === 'agenda_cancel' && !args.reason.trim()) throw new Error('Motivo obrigatório')
        history.push({ id: `event-${history.length + 1}`, seriesId: args.seriesId, originalDate: args.originalDate, action: command === 'agenda_cancel' ? 'cancel' : 'reschedule', effectiveDate: args.input?.date || null, start: args.input?.start || null, end: args.input?.end || null, reason: (args.reason ?? args.input?.reason)?.trim() || null })
        return save(command, args, null)
      }
      if (command === 'agenda_end_series') {
        const item = series.find(item => item.id === args.seriesId)
        if (!item || item.frequency === 'Avulsa' || args.effectiveDate < '2026-10-03' || (item.endDate && args.effectiveDate > item.endDate)) throw new Error('Corte inválido')
        if (history.some(event => event.seriesId === item.id && event.originalDate >= args.effectiveDate)) throw new Error('Alteração individual após o corte')
        item.endDate = plusDays(args.effectiveDate, -1)
        return save(command, args, item)
      }
      window.agendaWorkflow.unexpected.push(command)
      throw new Error(`Invoke sem fixture: ${command}`)
    } }
  }, { seed, endDate, homonyms })
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Comando do Círculo' })).toBeVisible()
}

async function propose(page, text) {
  const assistant = page.getByRole('region', { name: 'Comando do Círculo' })
  await assistant.getByLabel('Seu comando').fill(text)
  await assistant.getByRole('button', { name: 'Preparar rascunho' }).click()
}

async function writes(page, commandName) {
  return page.evaluate(name => window.agendaWorkflow.writes.filter(item => item.command === name), commandName)
}

async function state(page) {
  return page.evaluate(() => window.agendaWorkflow.state)
}

async function command(page, text, persistenceCommand = null) {
  const before = await page.evaluate(() => window.agendaWorkflow.writes)
  await propose(page, text)
  await expect(page.locator('.voice-command-preview'), `Proposta para: ${text}`).toBeVisible()
  expect(await page.evaluate(() => window.agendaWorkflow.writes)).toEqual(before)
  await propose(page, 'confirmar')
  await page.clock.runFor(32)
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  // A native mutation requiring confirmation must still be untouched here.
  if (persistenceCommand && await page.getByRole('alertdialog').count()) {
    expect(await page.evaluate(() => window.agendaWorkflow.writes)).toEqual(before)
  }
}

async function secondVoiceConfirmation(page, text, persistenceCommand, accepted) {
  const beforeWrites = await writes(page, persistenceCommand)
  const beforeState = await state(page)
  await command(page, text, persistenceCommand)
  await expect(page.getByRole('alertdialog', { name: 'Confirmar ação' })).toBeVisible()
  expect(await writes(page, persistenceCommand)).toEqual(beforeWrites)
  expect(await state(page)).toEqual(beforeState)
  await propose(page, accepted ? 'confirmar' : 'voltar')
  await page.clock.runFor(32)
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  if (accepted) await expect.poll(async () => (await writes(page, persistenceCommand)).length).toBe(beforeWrites.length + 1)
  else {
    expect(await writes(page, persistenceCommand)).toEqual(beforeWrites)
    expect(await state(page)).toEqual(beforeState)
  }
}

test.beforeEach(async ({ page, baseURL }) => {
  const unexpected = []
  page.on('dialog', async dialog => { unexpected.push(`native dialog: ${dialog.type()}`); await dialog.dismiss() })
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) await route.continue()
    else { unexpected.push(route.request().url()); await route.abort() }
  })
  page.unexpectedAgendaBoundary = unexpected
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.agendaWorkflow?.unexpected || [])).toEqual([])
  expect(page.unexpectedAgendaBoundary).toEqual([])
})

test('datas e horários falados preenchem agenda apenas após confirmação e recusam ambiguidade', async ({ page }) => {
  await openApp(page, { seed: false })
  await command(page, 'Abrir agenda')
  await command(page, 'Clicar em Novo compromisso')
  const form = page.getByRole('form', { name: 'Novo compromisso', exact: true })
  await propose(page, 'Preencher Data do compromisso com dez de outubro de dois mil e vinte e seis')
  await expect(page.locator('.voice-command-preview')).toContainText('2026-10-10')
  await expect(form.getByLabel('Data do compromisso')).toHaveValue('2026-10-03')
  await propose(page, 'confirmar')
  await page.clock.runFor(32)
  await expect(form.getByLabel('Data do compromisso')).toHaveValue('2026-10-10')
  await command(page, 'Preencher Horário inicial com vinte horas e três')
  await expect(form.getByLabel('Horário inicial')).toHaveValue('20:03')
  await command(page, 'Preencher Horário final com vinte e uma horas e trinta minutos')
  await expect(form.getByLabel('Horário final')).toHaveValue('21:30')
  await command(page, 'Preencher Horário inicial com três da tarde')
  await command(page, 'Preencher Horário final com três e cinquenta da tarde')
  await expect(form.getByLabel('Horário inicial')).toHaveValue('15:00')
  await expect(form.getByLabel('Horário final')).toHaveValue('15:50')
  for (const request of ['Preencher Horário inicial com três horas', 'Preencher Data do compromisso com trinta e um de fevereiro de 2026']) {
    await propose(page, request)
    await expect(page.locator('.voice-command-preview')).toHaveCount(0)
    await expect(form.getByLabel('Horário inicial')).toHaveValue('15:00')
    await expect(form.getByLabel('Data do compromisso')).toHaveValue('2026-10-10')
  }
  expect(await writes(page, 'agenda_create_series')).toEqual([])
  await command(page, 'Clicar em Criar compromisso avulso')
  await expect.poll(() => writes(page, 'agenda_create_series')).toEqual([{ command: 'agenda_create_series', args: { input: {
    patientId: 'ana', weekday: 6, frequency: 'Avulsa', startDate: '2026-10-10', endDate: '2026-10-10', start: '15:00', end: '15:50', modality: 'Presencial', meetingLink: null,
  } } }])
})

test('seletores diretos de agenda por voz preservam campos e salvam o payload escolhido', async ({ page }) => {
  await openApp(page, { seed: false })
  await command(page, 'Abrir agenda')
  await command(page, 'Clicar em Novo compromisso')
  const form = page.getByRole('form', { name: 'Novo compromisso', exact: true })
  for (const [label, option, value] of [
    ['Tipo', 'Recorrente', 'Recorrente'],
    ['Paciente', 'Ana Clara', 'ana'],
    ['Dia da semana', 'Quinta', '4'],
    ['Frequência', 'Quinzenal', 'Quinzenal'],
    ['Modalidade', 'Online', 'Online'],
  ]) {
    await command(page, `Selecionar ${label} como ${option}`)
    await expect(form.getByLabel(label, { exact: true })).toHaveValue(value)
  }
  for (const [label, value] of [['Início da série', '2026-10-08'], ['Término opcional (inclusivo)', '2026-11-19'], ['Horário inicial', '14:00'], ['Horário final', '14:50']]) {
    await command(page, `Preencher ${label} com ${value}`)
  }
  await command(page, 'Selecionar Tipo como Avulsa')
  await expect(form.getByLabel('Dia da semana')).toHaveCount(0)
  await expect(form.getByLabel('Data do compromisso')).toHaveValue('2026-10-08')
  await command(page, 'Selecionar Tipo como Recorrente')
  await expect(form.getByLabel('Dia da semana')).toHaveValue('4')
  await expect(form.getByLabel('Frequência')).toHaveValue('Quinzenal')
  expect(await writes(page, 'agenda_create_series')).toEqual([])
  await command(page, 'Clicar em Criar série')
  await expect.poll(() => writes(page, 'agenda_create_series')).toEqual([{ command: 'agenda_create_series', args: { input: {
    patientId: 'ana', weekday: 4, frequency: 'Quinzenal', startDate: '2026-10-08', endDate: '2026-11-19', start: '14:00', end: '14:50', modality: 'Online', meetingLink: null,
  } } }])
})

test('comando local da agenda por voz exige escolher o ID entre pacientes homônimos', async ({ page }) => {
  await openApp(page, { seed: false, homonyms: true })
  await command(page, 'Abrir agenda')
  await command(page, 'Clicar em Novo compromisso')
  const form = page.getByRole('form', { name: 'Novo compromisso', exact: true })
  await command(page, 'Preencher Comando de agendamento com marcar semanal para Ana Clara na quinta às 15 horas')
  await command(page, 'Clicar em Interpretar comando')
  await expect(form.getByRole('button', { name: 'Ana Clara · ID ana', exact: true })).toBeVisible()
  await expect(form.getByRole('button', { name: 'Ana Clara · ID ana2', exact: true })).toBeVisible()
  await expect(form.getByLabel('Paciente', { exact: true })).toHaveValue('')
  expect(await writes(page, 'agenda_create_series')).toEqual([])
  await command(page, 'Clicar em Ana Clara ID ana2')
  await expect(form.getByLabel('Paciente', { exact: true })).toHaveValue('ana2')
  await expect(form.getByLabel('Dia da semana')).toHaveValue('4')
  await expect(form.getByLabel('Horário inicial')).toHaveValue('15:00')
  // Local parser uses the reference date as the series boundary; occurrences
  // still begin on the selected weekday, not necessarily on that boundary.
  await expect(form.getByLabel('Início da série')).toHaveValue('2026-10-03')
  await command(page, 'Clicar em Criar série')
  await expect.poll(() => writes(page, 'agenda_create_series')).toEqual([{ command: 'agenda_create_series', args: { input: {
    patientId: 'ana2', weekday: 4, frequency: 'Semanal', startDate: '2026-10-03', endDate: null, start: '15:00', end: '15:50', modality: 'Presencial', meetingLink: null,
  } } }])
  await command(page, 'Mostrar agenda do dia 08/10/2026')
  await expect(page.locator('[data-voice-action^="agenda:details:"]')).toHaveCount(1)
  await expect.poll(() => page.evaluate(() => window.agendaWorkflow.calls.filter(call => call.command === 'agenda_occurrences').at(-1).args)).toEqual({ from: '2026-10-08', to: '2026-10-08' })
})

test('trocar ação explícita por voz e fechar não altera a ocorrência', async ({ page }) => {
  await openApp(page)
  const before = await state(page)
  await command(page, 'Remarcar sessão de Ana Clara no dia 05/10/2026 às 15 horas')
  const form = page.getByRole('form', { name: 'Alterar ocorrência individual' })
  await command(page, 'Selecionar Ação explícita como Cancelar esta ocorrência')
  await expect(form.getByLabel('Ação explícita')).toHaveValue('cancelar')
  await expect(form.getByLabel('Nova data efetiva')).toHaveCount(0)
  await command(page, 'Preencher Motivo administrativo (obrigatório) com Teste fictício')
  await command(page, 'Selecionar Ação explícita como Remarcar somente esta ocorrência')
  await expect(form.getByLabel('Ação explícita')).toHaveValue('remarcar')
  await expect(form.getByLabel('Nova data efetiva')).toHaveValue('2026-10-05')
  await command(page, 'Clicar em Fechar')
  await expect(form).toHaveCount(0)
  expect(await state(page)).toEqual(before)
  expect(await page.evaluate(() => window.agendaWorkflow.writes)).toEqual([])
})

test('voz cria série recorrente com payload completo somente após confirmar', async ({ page }) => {
  await openApp(page, { seed: false })
  await command(page, 'Agendar sessão quinzenal para Ana Clara na segunda às 15 horas online')
  const form = page.getByRole('form', { name: 'Novo compromisso', exact: true })
  await expect(form.getByLabel('Tipo', { exact: true })).toHaveValue('Recorrente')
  await expect(form.getByLabel('Paciente', { exact: true })).toHaveValue('ana')
  await expect(form.getByLabel('Dia da semana')).toHaveValue('1')
  await expect(form.getByLabel('Frequência')).toHaveValue('Quinzenal')
  await expect(form.getByLabel('Modalidade')).toHaveValue('Online')
  for (const [label, value] of [['Início da série', '2026-10-05'], ['Término opcional (inclusivo)', '2026-11-30'], ['Horário inicial', '15:10'], ['Horário final', '16:00'], ['Referência online opcional (somente texto)', 'https://example.invalid/sala-sintetica']]) {
    await command(page, `Preencher ${label} com ${value}`)
    await expect(form.getByLabel(label, { exact: true })).toHaveValue(value)
  }
  expect(await writes(page, 'agenda_create_series')).toEqual([])
  await command(page, 'Clicar em Criar série', 'agenda_create_series')
  const input = { patientId: 'ana', weekday: 1, frequency: 'Quinzenal', startDate: '2026-10-05', endDate: '2026-11-30', start: '15:10', end: '16:00', modality: 'Online', meetingLink: 'https://example.invalid/sala-sintetica' }
  await expect.poll(() => writes(page, 'agenda_create_series')).toEqual([{ command: 'agenda_create_series', args: { input } }])
  expect((await state(page)).series).toEqual([{ ...input, id: 'series-created', timeZone: 'America/Sao_Paulo', revision: 1 }])
  await expect(page.getByText('Série recorrente salva no cofre cifrado.')).toBeVisible()
  await command(page, 'Mostrar agenda do mês de 05/10/2026')
  await expect(page.locator('[data-voice-action^="agenda:details:"]')).toHaveCount(2)
  await command(page, 'Clicar em Compromissos persistidos')
  await expect(page.getByRole('region', { name: 'Compromissos persistidos' })).toContainText('Quinzenal · 15:10–16:00 · 2026-10-05 a 2026-11-30')
})

test('voz remarca ocorrência e cancela com recusa e aceite preservando motivo e histórico', async ({ page }) => {
  await openApp(page)
  const originalHistory = (await state(page)).history
  await command(page, 'Remarcar sessão de Ana Clara no dia 05/10/2026 às 15 horas')
  const form = page.getByRole('form', { name: 'Alterar ocorrência individual' })
  await expect(form).toContainText('original 2026-10-05')
  for (const [label, value] of [['Nova data efetiva', '2026-10-06'], ['Novo início', '16:00'], ['Novo fim', '16:50'], ['Motivo administrativo (opcional)', 'Ajuste sintético de horário']]) {
    await command(page, `Preencher ${label} com ${value}`)
    await expect(form.getByLabel(label, { exact: true })).toHaveValue(value)
  }
  await secondVoiceConfirmation(page, 'Clicar em Confirmar remarcação individual', 'agenda_reschedule', true)
  await expect.poll(() => writes(page, 'agenda_reschedule')).toEqual([{ command: 'agenda_reschedule', args: { seriesId: 'series-ana', originalDate: '2026-10-05', input: { date: '2026-10-06', start: '16:00', end: '16:50', reason: 'Ajuste sintético de horário' } } }])
  await expect(form).toHaveCount(0)
  await command(page, 'Cancelar sessão de Ana Clara no dia 06/10/2026 às 16 horas')
  await expect(form.getByLabel('Ação explícita')).toHaveValue('cancelar')
  await expect(form).toContainText('original 2026-10-05 · efetiva 2026-10-06 às 16:00–16:50')
  await command(page, 'Preencher Motivo administrativo (obrigatório) com Indisponibilidade sintética da família')
  const reason = 'Indisponibilidade sintética da família'
  await secondVoiceConfirmation(page, 'Clicar em Confirmar cancelamento', 'agenda_cancel', false)
  await expect(form.getByLabel('Motivo administrativo (obrigatório)', { exact: true })).toHaveValue(reason)
  await secondVoiceConfirmation(page, 'Clicar em Confirmar cancelamento', 'agenda_cancel', true)
  await expect.poll(() => writes(page, 'agenda_cancel')).toEqual([{ command: 'agenda_cancel', args: { seriesId: 'series-ana', originalDate: '2026-10-05', reason } }])
  await expect(form).toHaveCount(0)
  await expect(page.locator('[data-voice-action^="agenda:details:"]')).toHaveCount(0)
  expect((await state(page)).history).toEqual([...originalHistory,
    { id: 'event-2', seriesId: 'series-ana', originalDate: '2026-10-05', action: 'reschedule', effectiveDate: '2026-10-06', start: '16:00', end: '16:50', reason: 'Ajuste sintético de horário' },
    { id: 'event-3', seriesId: 'series-ana', originalDate: '2026-10-05', action: 'cancel', effectiveDate: null, start: null, end: null, reason },
  ])
  await command(page, 'Clicar em Histórico administrativo')
  const history = page.getByRole('region', { name: 'Histórico administrativo', exact: true })
  await expect(history.locator('li')).toHaveCount(3)
  await expect(history).toContainText('Ajuste sintético anterior')
  await expect(history).toContainText('reschedule · original 2026-10-05 → 2026-10-06 16:00–16:50')
  await expect(history).toContainText('Motivo administrativo: Ajuste sintético de horário')
  await expect(history).toContainText('cancel · original 2026-10-05')
  await expect(history).toContainText(`Motivo administrativo: ${reason}`)
})

test('dias semanal/diário, Voltar e gavetas administrativas por voz não alteram série', async ({ page }) => {
  await openApp(page)
  const before = await state(page)
  await command(page, 'Mostrar agenda da semana de 05/10/2026')
  await expect(page.getByRole('region', { name: 'Calendário semana' })).toBeVisible()
  await command(page, 'Clicar em Ver dia 2026-10-05')
  await expect(page.getByRole('region', { name: 'Calendário dia' })).toBeVisible()
  await expect(page.getByLabel('Data de referência')).toHaveValue('2026-10-05')
  await command(page, 'Clicar em Ver dia 2026-10-05')
  await expect(page.getByLabel('Data de referência')).toHaveValue('2026-10-05')
  await command(page, 'Clicar em Compromissos persistidos')
  const persisted = page.getByRole('region', { name: 'Compromissos persistidos' })
  await command(page, 'Clicar em Encerrar série de Ana Clara · série series-ana')
  await command(page, 'Preencher Primeira data excluída com 2026-10-19')
  await command(page, 'Clicar em Voltar')
  await expect(page.getByRole('form', { name: 'Encerrar série recorrente' })).toHaveCount(0)
  await command(page, 'Clicar em Compromissos persistidos')
  await expect(persisted.getByRole('button', { name: 'Compromissos persistidos' })).toHaveAttribute('aria-expanded', 'false')
  await command(page, 'Clicar em Histórico administrativo')
  const history = page.getByRole('region', { name: 'Histórico administrativo', exact: true })
  await expect(history.locator('li')).toHaveCount(1)
  await command(page, 'Clicar em Histórico administrativo')
  await expect(history.locator('li')).toHaveCount(0)
  expect(await state(page)).toEqual(before)
  expect(await page.evaluate(() => window.agendaWorkflow.writes)).toEqual([])
})

for (const [label, endDate] of [['encerrar série sem término', null], ['antecipar término existente', '2026-11-30']]) {
  test(`voz ${label}: recusa preserva estado e aceite envia primeira data excluída`, async ({ page }) => {
    await openApp(page, { endDate })
    const before = await state(page)
    await command(page, 'Mostrar agenda do mês de 05/10/2026')
    await expect(page.locator('[data-voice-action^="agenda:details:"]')).toHaveCount(4)
    await command(page, 'Clicar em Compromissos persistidos')
    const persisted = page.getByRole('region', { name: 'Compromissos persistidos' })
    await expect(persisted.getByRole('button', { name: 'Encerrar série de Ana Clara · série series-ana' })).toHaveText(endDate ? 'Antecipar término' : 'Encerrar série')
    await command(page, 'Clicar em Encerrar série de Ana Clara · série series-ana')
    const form = page.getByRole('form', { name: 'Encerrar série recorrente' })
    await command(page, 'Preencher Primeira data excluída com 2026-10-19')
    await expect(form.getByLabel('Primeira data excluída')).toHaveValue('2026-10-19')
    await secondVoiceConfirmation(page, 'Clicar em Confirmar encerramento', 'agenda_end_series', false)
    await expect(form.getByLabel('Primeira data excluída')).toHaveValue('2026-10-19')
    await expect(page.locator('[data-voice-action^="agenda:details:"]')).toHaveCount(4)
    await secondVoiceConfirmation(page, 'Clicar em Confirmar encerramento', 'agenda_end_series', true)
    await expect.poll(() => writes(page, 'agenda_end_series')).toEqual([{ command: 'agenda_end_series', args: { seriesId: 'series-ana', effectiveDate: '2026-10-19' } }])
    await expect(form).toHaveCount(0)
    expect(await state(page)).toEqual({ series: [{ ...before.series[0], endDate: '2026-10-18' }], history: before.history })
    await expect(persisted).toContainText('2026-09-28 a 2026-10-18')
    await expect(page.locator('[data-voice-action^="agenda:details:"]')).toHaveCount(2)
    await expect(page.getByRole('button', { name: 'Ver ações de Ana Clara em 2026-10-05 às 15:00–15:50' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ver ações de Ana Clara em 2026-10-12 às 15:00–15:50' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Ver ações de Ana Clara em 2026-10-(19|26)/ })).toHaveCount(0)
    await command(page, 'Clicar em Histórico administrativo')
    const history = page.getByRole('region', { name: 'Histórico administrativo', exact: true })
    await expect(history.locator('li')).toHaveCount(1)
    await expect(history).toContainText('reschedule · original 2026-09-28 → 2026-09-29 15:00–15:50')
    await expect(history).toContainText('Motivo administrativo: Ajuste sintético anterior')
  })
}
