import { expect, test } from '@playwright/test'

async function openApp(page, { failStart = false, seed = false, failAuxiliary = '' } = {}) {
  await page.clock.install({ time: new Date('2026-10-03T15:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-03T15:00:00Z'))
  await page.addInitScript(({ failStart, seed, failAuxiliary }) => {
    const clone = value => structuredClone(value)
    const patient = { id: 'lia', name: 'Lia Exemplo', revision: 1, archivedAt: null }
    const series = seed ? [{ id: 'seed', patientId: 'lia', startDate: '2026-10-31', endDate: '2026-10-31', weekday: 6, frequency: 'Avulsa', start: '14:00', end: '14:50', modality: 'Presencial', meetingLink: null }] : []
    const drafts = []
    const sessions = []
    let fail = failStart
    let auxiliaryFailed = false
    let refreshAfterStart = false
    window.calendarVoice = { series, drafts, sessions, calls: [], unexpected: [] }
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      window.calendarVoice.calls.push(clone({ command, args }))
      if ((!auxiliaryFailed && failAuxiliary === 'after-create' && command === 'behavior_list' && series.length > 0 && drafts.length === 0) || (failAuxiliary === 'after-start' && command === 'indicator_catalog' && refreshAfterStart && !window.calendarVoice.releaseAuxiliary)) {
        auxiliaryFailed = true
        window.calendarVoice.auxiliaryFailure = command
        throw new Error('Falha sintética na atualização auxiliar')
      }
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') { if (drafts.length) refreshAfterStart = true; return { available: false, dirty: false } }
      if (command === 'plugin:updater|check') return null
      if (command === 'patient_list') return [patient]
      if (command === 'agenda_list_series') return clone(series)
      if (command === 'agenda_occurrences') return clone(series.filter(item => item.startDate >= args.from && item.startDate <= args.to).map(item => ({ id: `${item.id}:${item.startDate}`, seriesId: item.id, patientId: item.patientId, originalDate: item.startDate, date: item.startDate, start: item.start, end: item.end, frequency: item.frequency, modality: item.modality, status: 'scheduled' })))
      if (command === 'agenda_create_series') { const saved = { ...clone(args.input), id: `series-${series.length + 1}` }; series.push(saved); return clone(saved) }
      if (command === 'session_draft_start') {
        if (fail) { fail = false; throw new Error('Falha sintética ao iniciar') }
        const existing = drafts.find(item => item.seriesId === args.seriesId && item.originalDate === args.originalDate)
        if (existing) return clone(existing)
        const draft = { id: `draft-lia-${drafts.length + 1}`, patientId: 'lia', seriesId: args.seriesId, originalDate: args.originalDate, observation: '', procedures: '', outcomeDecision: '', referralClosure: '', behaviorIds: [], indicators: [] }
        drafts.push(draft); return clone(draft)
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
  }, { failStart, seed, failAuxiliary })
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
test.afterEach(async ({ page }) => expect(await page.evaluate(() => window.calendarVoice?.unexpected || [])).toEqual([]))

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
