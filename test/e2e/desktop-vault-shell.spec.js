import { test, expect } from '@playwright/test'

const openAgendaDetails = async page => {
  const toggle = page.getByRole('button', { name: 'Detalhes e ações' })
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click()
}
const openPersistedAppointments = async page => {
  const toggle = page.getByRole('button', { name: 'Compromissos persistidos' })
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click()
}

const openPatients = async page => {
  await page.goto('/')
  await page.waitForFunction(() => document.querySelector('.vault-nav, #vault-password, .vault-warning[role="alert"]'))
  const patientsNav = page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Pacientes' })
  if (await patientsNav.count()) await patientsNav.click()
}

const installCalendarMock = async page => page.addInitScript(() => {
  const patients = [
    { id: 'calendar-a', name: 'Lia Calendário', revision: 1, archivedAt: null },
    { id: 'calendar-b', name: 'Rui Calendário', revision: 1, archivedAt: null },
  ]
  const appointments = [
    ['2026-09-30', '16:00', 'Lia Calendário'],
    ['2026-10-01', '08:00', 'Rui Calendário'],
    ['2026-10-05', '14:00', 'Lia Calendário'],
    ['2026-10-05', '09:00', 'Rui Calendário'],
    ['2026-10-10', '11:00', 'Lia Calendário'],
    ['2026-10-31', '17:00', 'Rui Calendário'],
    ['2026-11-01', '10:00', 'Lia Calendário'],
  ].map(([date, start, name], index) => ({
    id: `calendar-occurrence-${index}`, seriesId: `calendar-series-${index}`,
    patientId: patients.find(patient => patient.name === name).id, originalDate: date,
    date, start, end: `${String(Number(start.slice(0, 2)) + 1).padStart(2, '0')}:00`,
    frequency: 'Avulsa', modality: 'Presencial', status: 'scheduled',
  }))
  const queries = []
  const changes = []
  const starts = []
  const saves = []
  const templates = [{ id: 'calendar-template-1', title: 'Participação fictícia no jogo', description: 'Observação inteiramente sintética', version: 1, active: true }]
  const drafts = []
  const sessions = []
  window.calendarProbe = () => ({ queries, changes, starts, saves, templates, drafts, sessions })
  window.confirm = () => true
  window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
    if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
    if (command === 'auto_backup_status') return { present: false, available: false, dirty: false }
    if (command === 'patient_list') return patients
    if (command === 'agenda_list_series' || command === 'agenda_history') return []
    if (command === 'agenda_occurrences') {
      queries.push({ from: args.from, to: args.to })
      return appointments.filter(item => item.date >= args.from && item.date <= args.to).map(item => ({ ...item, status: sessions.some(session => session.seriesId === item.seriesId && session.originalDate === item.originalDate) ? 'completed' : item.status })).reverse()
    }
    if (command === 'agenda_reschedule') {
      changes.push(args)
      const item = appointments.find(occurrence => occurrence.seriesId === args.seriesId && occurrence.originalDate === args.originalDate)
      Object.assign(item, { date: args.input.date, start: args.input.start, end: args.input.end })
      return null
    }
    if (command === 'session_draft_start') {
      starts.push(args)
      const item = appointments.find(occurrence => occurrence.seriesId === args.seriesId && occurrence.originalDate === args.originalDate)
      const draft = { id: `calendar-draft-${drafts.length + 1}`, patientId: item.patientId, seriesId: args.seriesId, originalDate: args.originalDate, observation: '', behaviorIds: [], indicators: [] }
      drafts.push(draft)
      return draft
    }
    if (command === 'session_draft_save') {
      saves.push(args)
      const draft = drafts.find(item => item.id === args.id)
      Object.assign(draft, args.input)
      return { ...draft }
    }
    if (command === 'session_finalize') {
      const index = drafts.findIndex(item => item.id === args.id)
      const draft = drafts.splice(index, 1)[0]
      if (!draft) throw new Error('Rascunho sintético ausente')
      const session = { ...draft, id: `calendar-session-${sessions.length + 1}`, sessionDate: draft.originalDate, start: appointments.find(item => item.seriesId === draft.seriesId).start, end: appointments.find(item => item.seriesId === draft.seriesId).end, modality: 'Presencial', behaviors: draft.behaviorIds.map(id => { const template = templates.find(item => item.id === id); return { templateId: id, templateVersion: template.version, title: template.title, description: template.description } }), indicators: [] }
      sessions.push(session)
      return session
    }
    if (command === 'behavior_list') return templates
    if (command === 'behavior_create') { const template = { ...args, id: `calendar-template-${templates.length + 1}`, version: 1, active: true }; templates.push(template); return template }
    if (command === 'session_draft_list') return drafts.filter(item => item.patientId === args.patientId)
    if (command === 'session_timeline') return sessions.filter(item => item.patientId === args.patientId)
    if (command === 'indicator_catalog' || command === 'session_addendum_list' || command === 'case_context_list') return []
    if (command === 'professional_get') return null
    throw new Error(`Comando inesperado: ${command}`)
  } }
})

const installQuickStartMock = async (page, failDraft = false) => page.addInitScript(({ failDraft }) => {
  const patient = { id: 'patient-a', name: 'Lia Exemplo', revision: 1, archivedAt: null }
  const series = []
  const draftCalls = []
  let shouldFail = failDraft
  window.quickStartProbe = () => ({ created: series.length, draftCalls })
  window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
    if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
    if (command === 'auto_backup_status') return { present: false, available: false, dirty: false }
    if (command === 'patient_list') return [patient]
    if (command === 'agenda_list_series') return series
    if (command === 'agenda_history') return []
    if (command === 'agenda_create_series') { const saved = { ...args.input, id: `series-${series.length + 1}` }; series.push(saved); return saved }
    if (command === 'agenda_occurrences') return series.filter(item => item.startDate >= args.from && item.startDate <= args.to).map(item => ({ id: `${item.id}:${item.startDate}`, seriesId: item.id, patientId: item.patientId, originalDate: item.startDate, date: item.startDate, start: item.start, end: item.end, modality: item.modality, frequency: 'Avulsa', status: 'scheduled' }))
    if (command === 'session_draft_start') {
      draftCalls.push(args)
      if (shouldFail) { shouldFail = false; throw new Error('Falha sintética ao iniciar') }
      return { id: 'draft-1', patientId: patient.id, seriesId: args.seriesId, originalDate: args.originalDate, observation: '', behaviorIds: [], indicators: [] }
    }
    if (command === 'behavior_list' || command === 'indicator_catalog' || command === 'session_draft_list' || command === 'session_timeline' || command === 'session_addendum_list' || command === 'case_context_list') return []
    if (command === 'professional_get') return null
    throw new Error(`Comando inesperado: ${command}`)
  } }
}, { failDraft })

const openSyntheticCalendar = async page => {
  await page.clock.install({ time: new Date('2026-10-05T12:00:00Z') })
  await installCalendarMock(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Abrir Agenda' }).click()
  await expect(page.getByLabel('Data de referência')).toHaveValue('2026-10-05')
}

test('calendário sintético: mês mostra grade completa e apenas compromissos do mês', async ({ page }) => {
  await openSyntheticCalendar(page)
  await page.getByRole('group', { name: 'Visualização da Agenda' }).getByRole('button', { name: 'Mês' }).click()
  const month = page.locator('.agenda-month-grid')
  await expect(month.locator('.agenda-month-day')).toHaveCount(35)
  await expect(month.locator('.agenda-month-day:not(.outside)')).toHaveCount(31)
  await expect(month.locator('.agenda-weekday')).toHaveCount(7)
  await expect(month.getByRole('button', { name: 'Ver dia 2026-09-30' })).toBeVisible()
  await expect(month.getByRole('button', { name: 'Ver dia 2026-10-31' })).toBeVisible()
  await expect(month.getByRole('button', { name: 'Ver ações de Rui Calendário em 2026-10-01 às 08:00–09:00' })).toBeVisible()
  await expect(month.locator('.agenda-event-chip')).toHaveCount(5)
  await expect(month.getByRole('button', { name: /Ver ações.*2026-09-30/ })).toHaveCount(0)
  await expect(month.getByRole('button', { name: /Ver ações.*2026-11-01/ })).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.calendarProbe().queries.some(query => query.from === '2026-10-01' && query.to === '2026-10-31'))).toBe(true)
})

test('calendário sintético: semana tem sete dias e dia ordena horários, inclusive em celular', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openSyntheticCalendar(page)
  const week = page.locator('.agenda-time-grid.week-view')
  await expect(week.locator('.agenda-time-day')).toHaveCount(7)
  await expect(week.locator('.agenda-time-heading')).toHaveCount(7)
  await expect(week.locator('.agenda-time-day').first()).toBeVisible()
  await expect(week.locator('.agenda-time-day').last()).toBeVisible()
  await expect(week.locator('.agenda-time-heading time').first()).toHaveAttribute('datetime', '2026-10-04')
  await expect(week.locator('.agenda-time-heading time').last()).toHaveAttribute('datetime', '2026-10-10')
  await expect(week.locator('.agenda-time-event')).toHaveCount(3)
  await page.getByRole('group', { name: 'Visualização da Agenda' }).getByRole('button', { name: 'Dia' }).click()
  const day = page.locator('.agenda-day-compact')
  await expect(day.locator('.agenda-time-day')).toHaveCount(1)
  const appointments = day.locator('.agenda-day-list > li')
  await expect(appointments).toHaveCount(2)
  await expect(appointments.first()).toContainText('09:00–10:00')
  await expect(appointments.last()).toContainText('14:00–15:00')
  await expect(appointments.first().getByRole('button', { name: /Iniciar sessão de Rui Calendário/ })).toBeVisible()
})

test('registro sintético explícito parte do paciente e conduz a compromisso antes da evolução', async ({ page }) => {
  await installCalendarMock(page)
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Pacientes' }).click()
  await page.getByRole('listitem').filter({ hasText: 'Lia Calendário' }).getByRole('button', { name: 'Registrar comportamento / evolução' }).click()
  await expect(page.getByRole('region', { name: 'Registrar comportamento ou evolução' })).toBeVisible()
  await expect(page.getByText('Marque abaixo o que ocorreu; o comportamento entra no histórico ao finalizar a sessão.')).toBeVisible()
  await page.getByRole('button', { name: 'Escolher compromisso na Agenda' }).click()
  await expect(page.getByRole('heading', { name: 'Agenda de sessões' })).toBeVisible()
  await expect(page.getByRole('form', { name: 'Novo compromisso' })).toBeVisible()
  await expect(page.getByLabel('Paciente', { exact: true })).toHaveValue('calendar-a')
})

test('quickStart de paciente não prende Agenda em avulsa após iniciar compromisso existente', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-05T12:00:00Z') })
  await installCalendarMock(page)
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Pacientes' }).click()
  await page.getByRole('listitem').filter({ hasText: 'Lia Calendário' }).getByRole('button', { name: 'Registrar comportamento / evolução' }).click()
  await page.getByRole('button', { name: 'Escolher compromisso na Agenda' }).click()
  const type = page.getByLabel('Tipo', { exact: true })
  await expect(type).toHaveValue('Avulsa')
  await expect(type).toBeDisabled()
  await expect(page.getByLabel('Paciente', { exact: true })).toHaveValue('calendar-a')
  await openAgendaDetails(page)
  await page.getByRole('button', { name: 'Iniciar sessão de Lia Calendário em 2026-10-05 às 14:00–15:00' }).click()
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toBeVisible()
  expect((await page.evaluate(() => window.calendarProbe().starts)).length).toBe(1)
  await page.getByRole('button', { name: 'Abrir Agenda' }).click()
  await expect(page.getByRole('heading', { name: 'Agenda de sessões' })).toBeVisible()
  await expect(type).toBeEnabled()
  await type.selectOption('Recorrente')
  await expect(page.getByRole('button', { name: 'Criar série' })).toBeVisible()
  expect((await page.evaluate(() => window.calendarProbe().starts)).length).toBe(1)
})

test('paciente registra comportamento e evolução via Agenda Dia compacta em 390px com mouse', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.clock.install({ time: new Date('2026-10-05T12:00:00Z') })
  await installCalendarMock(page)
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Pacientes' }).click()
  await page.getByRole('listitem').filter({ hasText: 'Lia Calendário' }).getByRole('button', { name: 'Registrar comportamento / evolução' }).click()
  await expect(page.getByRole('region', { name: 'Registrar comportamento ou evolução' })).toBeVisible()
  await page.getByRole('button', { name: 'Escolher compromisso na Agenda' }).click()
  await page.getByRole('group', { name: 'Visualização da Agenda' }).getByRole('button', { name: 'Dia' }).click()
  const day = page.getByRole('region', { name: 'Calendário dia' })
  await expect(day.locator('.agenda-day-list > li')).toHaveCount(2)
  await page.getByRole('button', { name: 'Iniciar sessão de Lia Calendário em 2026-10-05 às 14:00–15:00' }).click()
  const draft = page.getByRole('form', { name: 'Rascunho de sessão' })
  await expect(draft).toBeVisible()
  const behavior = draft.getByRole('checkbox', { name: /Participação fictícia no jogo/ })
  await expect(behavior).toBeVisible()
  await behavior.check()
  await page.getByLabel('Observações descritivas').fill('Evolução descritiva fictícia')
  await page.getByLabel('Procedimentos realizados').fill('Atividade de jogo fictícia')
  await page.getByLabel('Resultado e decisão').fill('Continuar observação fictícia')
  await page.getByRole('navigation', { name: 'Etapas do rascunho' }).getByRole('link', { name: 'Salvar ou finalizar' }).click()
  await draft.getByRole('button', { name: 'Salvar rascunho' }).click()
  await expect.poll(() => page.evaluate(() => window.calendarProbe().drafts[0]?.behaviorIds)).toEqual(['calendar-template-1'])
  await expect.poll(() => page.evaluate(() => window.calendarProbe().drafts[0]?.observation)).toBe('Evolução descritiva fictícia')
  await draft.getByRole('button', { name: 'Finalizar sessão' }).click()
  await expect.poll(() => page.evaluate(() => window.calendarProbe().sessions.length)).toBe(1)
  await page.getByText('Evolução e escalas registradas').click()
  await expect(page.getByText('Evolução descritiva fictícia')).toBeVisible()
  expect((await page.evaluate(() => window.calendarProbe().sessions[0].behaviors)).map(item => item.title)).toEqual(['Participação fictícia no jogo'])
})

test('âncora final do rascunho deixa Salvar rascunho clicável com mouse, sem overlay', async ({ page }) => {
  await openSyntheticCalendar(page)
  await openAgendaDetails(page)
  await page.getByRole('button', { name: 'Iniciar sessão de Rui Calendário em 2026-10-05 às 09:00–10:00' }).click()
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toBeVisible()
  await page.getByLabel('Observações descritivas').fill('Observação totalmente fictícia')
  await page.getByRole('navigation', { name: 'Etapas do rascunho' }).getByRole('link', { name: 'Salvar ou finalizar' }).click()
  const save = page.getByRole('button', { name: 'Salvar rascunho' })
  await expect(save).toBeInViewport()
  await save.click({ timeout: 5000 })
  await expect.poll(() => page.evaluate(() => window.calendarProbe().saves.length)).toBeGreaterThan(0)
  await expect(page.getByText('Rascunho salvo no cofre cifrado.')).toBeVisible()
})

test('demonstração sintética exige CTA e confirmação, cria quatro sessões e repetir não duplica', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-05T12:00:00Z') })
  await page.addInitScript(() => {
    const db = { patients: [{ id: 'existing', name: 'Cadastro preexistente fictício', archivedAt: null }], templates: [], series: [], drafts: [], sessions: [] }
    let sequence = 0
    let confirmed = false
    window.confirm = () => confirmed
    window.demoProbe = () => ({ patients: db.patients, templates: db.templates, series: db.series, drafts: db.drafts, sessions: db.sessions })
    window.confirmDemo = value => { confirmed = value }
    const plusSeven = date => { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + 7); return value.toISOString().slice(0, 10) }
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { present: false, available: false, dirty: false }
      if (command === 'patient_list') return db.patients
      if (command === 'patient_create') { const item = { ...args.input, id: `demo-p${++sequence}`, revision: 1, archivedAt: null }; db.patients.push(item); return item }
      if (command === 'behavior_list') return db.templates
      if (command === 'behavior_create') { const item = { ...args, id: `demo-b${++sequence}`, version: 1 }; db.templates.push(item); return item }
      if (command === 'agenda_list_series') return db.series
      if (command === 'agenda_create_series') { const item = { ...args.input, id: `demo-a${++sequence}` }; db.series.push(item); return item }
      if (command === 'indicator_catalog') return [{ id: 'demo-i1', name: 'Indicador fictício 1', version: 1, labels: ['A', 'B', 'C'] }, { id: 'demo-i2', name: 'Indicador fictício 2', version: 1, labels: ['A', 'B', 'C'] }]
      if (command === 'agenda_history' || command === 'case_context_list' || command === 'session_addendum_list') return []
      if (command === 'agenda_occurrences') return db.series.flatMap(series => [series.startDate, plusSeven(series.startDate)].filter(date => date >= args.from && date <= args.to).map(date => ({ id: `${series.id}:${date}`, seriesId: series.id, patientId: series.patientId, originalDate: date, date, start: series.start, end: series.end, modality: series.modality, frequency: series.frequency, status: db.sessions.some(item => item.seriesId === series.id && item.originalDate === date) ? 'completed' : 'scheduled' })))
      if (command === 'session_draft_list') return db.drafts.filter(item => item.patientId === args.patientId)
      if (command === 'session_timeline') return db.sessions.filter(item => item.patientId === args.patientId)
      if (command === 'session_draft_start') { const item = { id: `demo-d${++sequence}`, patientId: db.series.find(series => series.id === args.seriesId).patientId, ...args }; db.drafts.push(item); return item }
      if (command === 'session_draft_save') { const item = db.drafts.find(draft => draft.id === args.id); Object.assign(item, args.input); return item }
      if (command === 'session_finalize') { const draft = db.drafts.find(item => item.id === args.id); const item = { ...draft, id: `demo-s${++sequence}`, sessionDate: draft.originalDate, start: db.series.find(series => series.id === draft.seriesId).start }; db.sessions.push(item); db.drafts = db.drafts.filter(value => value.id !== args.id); return item }
      throw new Error(`Comando inesperado: ${command}`)
    } }
  })
  await page.goto('/')
  const demo = page.getByRole('button', { name: /Carregar exemplos de demonstração/ })
  await expect(demo).toBeVisible()
  expect((await page.evaluate(() => window.demoProbe())).patients).toHaveLength(1)
  await demo.click()
  expect((await page.evaluate(() => window.demoProbe())).patients).toHaveLength(1)
  await page.evaluate(() => window.confirmDemo(true))
  await demo.click()
  await expect.poll(() => page.evaluate(() => window.demoProbe().sessions.length)).toBe(4)
  const first = await page.evaluate(() => window.demoProbe())
  expect(first.patients).toHaveLength(4)
  expect(first.patients[0].name).toBe('Cadastro preexistente fictício')
  expect(first.templates).toHaveLength(2)
  expect(first.series).toHaveLength(3)
  expect(first.sessions.every(item => item.observation.startsWith('EXEMPLO DEMO —') && item.indicators.length === 2)).toBe(true)
  await page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Início' }).click()
  await demo.click()
  await expect(page.getByText(/Demonstração disponível: 0 paciente\(s\), 0 modelo\(s\), 0 compromisso\(s\) e 0 sessão\(ões\) adicionados/)).toBeVisible()
  const second = await page.evaluate(() => window.demoProbe())
  expect(second.patients).toHaveLength(4)
  expect(second.templates).toHaveLength(2)
  expect(second.series).toHaveLength(3)
})

test('calendário sintético: anterior, hoje, próximo, limite de mês e clique no dia', async ({ page }) => {
  await openSyntheticCalendar(page)
  const modes = page.getByRole('group', { name: 'Visualização da Agenda' })
  await modes.getByRole('button', { name: 'Mês' }).click()
  await page.getByLabel('Data de referência').fill('2026-10-31')
  await page.getByRole('button', { name: 'Próximo' }).click()
  await expect(page.getByLabel('Data de referência')).toHaveValue('2026-11-30')
  await expect(page.locator('.agenda-month-day:not(.outside)')).toHaveCount(30)
  await page.getByRole('button', { name: 'Anterior' }).click()
  await expect(page.getByLabel('Data de referência')).toHaveValue('2026-10-30')
  await page.getByRole('button', { name: 'Hoje' }).click()
  await expect(page.getByLabel('Data de referência')).toHaveValue('2026-10-05')
  await page.getByRole('button', { name: 'Ver dia 2026-10-31' }).click()
  await expect(modes.getByRole('button', { name: 'Dia' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Data de referência')).toHaveValue('2026-10-31')
  await expect(page.locator('.agenda-day-compact .agenda-day-list > li')).toHaveCount(1)
  await page.getByRole('button', { name: 'Próximo' }).click()
  await expect(page.getByLabel('Data de referência')).toHaveValue('2026-11-01')
  await expect(page.locator('.agenda-day-compact .agenda-day-list > li')).toHaveCount(1)
})

test('calendário sintético: período vazio, alteração e início continuam acessíveis', async ({ page }) => {
  await openSyntheticCalendar(page)
  await page.getByLabel('Data de referência').fill('2027-02-15')
  await expect(page.locator('.agenda-empty')).toContainText('Nenhum compromisso neste período.')
  await page.getByLabel('Data de referência').fill('2026-10-05')
  await page.getByRole('button', { name: 'Ver ações de Rui Calendário em 2026-10-05 às 09:00–10:00' }).click()
  await page.getByRole('button', { name: 'Alterar ocorrência de Rui Calendário em 2026-10-05 às 09:00–10:00' }).click()
  await page.getByLabel('Nova data efetiva').fill('2026-10-06')
  await page.getByLabel('Motivo administrativo (opcional)').fill('Ajuste sintético de horário')
  await page.getByRole('button', { name: 'Confirmar remarcação individual' }).click()
  await expect.poll(() => page.evaluate(() => window.calendarProbe().changes.length)).toBe(1)
  await expect(page.getByRole('button', { name: 'Ver ações de Rui Calendário em 2026-10-06 às 09:00–10:00' })).toBeVisible()
  await page.getByRole('button', { name: 'Iniciar sessão de Rui Calendário em 2026-10-06 às 09:00–10:00' }).click()
  await expect(page.getByRole('heading', { name: 'Rascunho da ocorrência 2026-10-05' })).toBeVisible()
  expect((await page.evaluate(() => window.calendarProbe())).starts).toEqual([{ seriesId: 'calendar-series-3', originalDate: '2026-10-05' }])
})

test('CTA cria compromisso avulso fora da semana e inicia um único rascunho', async ({ page }) => {
  await installQuickStartMock(page)
  await page.goto('/')
  await page.getByRole('button', { name: /Registrar sessão/ }).click()
  await page.getByLabel('Data do compromisso').fill('2030-04-14')
  await page.getByRole('button', { name: 'Criar e iniciar sessão' }).click()
  await expect(page.getByRole('heading', { name: 'Rascunho da ocorrência 2030-04-14' })).toBeVisible()
  expect(await page.evaluate(() => window.quickStartProbe())).toEqual({ created: 1, draftCalls: [{ seriesId: 'series-1', originalDate: '2030-04-14' }] })
})

test('falha ao iniciar preserva e revela compromisso criado, com retomada sem duplicar', async ({ page }) => {
  await installQuickStartMock(page, true)
  await page.goto('/')
  await page.getByRole('button', { name: /Registrar sessão/ }).click()
  await page.getByLabel('Data do compromisso').fill('2030-04-14')
  await page.getByRole('button', { name: 'Criar e iniciar sessão' }).click()
  await expect(page.getByText('Compromisso criado, mas a sessão não iniciou. Use Iniciar sessão no compromisso exibido abaixo.')).toBeVisible()
  await openAgendaDetails(page)
  await expect(page.locator('.agenda-detail-list')).toContainText('2030-04-14 · 14:00–14:50')
  await page.getByRole('button', { name: 'Iniciar sessão de Lia Exemplo em 2030-04-14 às 14:00–14:50' }).click()
  await expect(page.getByRole('heading', { name: 'Rascunho da ocorrência 2030-04-14' })).toBeVisible()
  expect((await page.evaluate(() => window.quickStartProbe())).created).toBe(1)
})

test('início mostra dados persistidos, estados vazios e ações em desktop e celular', async ({ page }) => {
  await page.addInitScript(() => {
    window.__TAURI_INTERNALS__ = { invoke: async command => {
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { present: false, available: false, dirty: false }
      if (command === 'patient_list') return [{ id: 'p1', name: 'Lia Exemplo', revision: 1, lifeCycle: 'Criança', age: 8, archivedAt: null }]
      if (command === 'agenda_occurrences') return []
      if (command === 'agenda_list_series' || command === 'agenda_history') return []
      throw new Error(`Comando inesperado: ${command}`)
    } }
  })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Olá, por onde começamos?' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Início' }).getByText('Lia Exemplo')).toBeVisible()
    await expect(page.getByText('Nenhum compromisso para hoje.')).toBeVisible()
    await expect(page.getByRole('button', { name: /Registrar sessão/ })).toBeVisible()
    await page.screenshot({ path: `test-results/home-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: /Registrar sessão/ }).click()
    await expect(page.getByRole('form', { name: 'Novo compromisso' })).toBeVisible()
    await expect(page.getByLabel('Tipo')).toHaveValue('Avulsa')
    await expect(page.getByLabel('Paciente', { exact: true })).toBeFocused()
    await page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Início' }).click()
    await page.getByRole('button', { name: /Pacientes Cadastros/ }).click()
    await expect(page.getByRole('heading', { name: 'Pacientes' })).toBeVisible()
  }
})

test('verifica bloqueio diário ao voltar ao aplicativo e limpa dados visíveis', async ({ page }) => {
  await page.addInitScript(() => {
    let unlocked = true
    window.expireDay = () => { unlocked = false }
    window.__TAURI_INTERNALS__ = { invoke: async command => {
      if (command === 'vault_status') return { initialized: true, unlocked, profileState: 'ready' }
      if (command === 'auto_backup_status') return { present: false, available: false, dirty: false }
      if (command === 'patient_list') return [{ id: 'p1', name: 'Paciente do dia anterior', revision: 1, archivedAt: null }]
      if (command === 'agenda_occurrences') return []
      throw new Error(`Comando inesperado: ${command}`)
    } }
  })
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Início' }).getByText('Paciente do dia anterior')).toBeVisible()
  await page.evaluate(() => window.expireDay())
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByLabel('Senha do cofre')).toBeVisible()
  await expect(page.getByText('Paciente do dia anterior')).toHaveCount(0)
  await expect(page.getByText('O cofre foi bloqueado. Desbloqueie para continuar.')).toBeVisible()
})

test('verificação periódica identifica bloqueio diário sem interação', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-28T12:00:00Z') })
  await page.addInitScript(() => {
    let unlocked = true
    window.expireDay = () => { unlocked = false }
    window.__TAURI_INTERNALS__ = { invoke: async command => {
      if (command === 'vault_status') return { initialized: true, unlocked, profileState: 'ready' }
      if (command === 'auto_backup_status') return { present: false, available: false, dirty: false }
      if (command === 'patient_list' || command === 'agenda_occurrences') return []
      throw new Error(`Comando inesperado: ${command}`)
    } }
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Olá, por onde começamos?' })).toBeVisible()
  await page.evaluate(() => window.expireDay())
  await page.clock.fastForward(60_000)
  await expect(page.getByLabel('Senha do cofre')).toBeVisible()
})

test('virada do dia oculta pacientes mesmo com gravação ocupada', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-28T12:00:00Z') })
  await page.addInitScript(() => {
    let resolveCreate
    let started = false
    let statusCalls = 0
    window.pendingProbe = () => ({ started, statusCalls })
    window.finishCreate = () => resolveCreate?.({ id: 'p2', name: 'Cadastro pendente', revision: 1, archivedAt: null })
    window.__TAURI_INTERNALS__ = { invoke: async (command) => {
      if (command === 'vault_status') { statusCalls++; return { initialized: true, unlocked: true, profileState: 'ready' } }
      if (command === 'auto_backup_status') return { present: false, available: false, dirty: false }
      if (command === 'patient_list') return [{ id: 'p1', name: 'Paciente visível', revision: 1, archivedAt: null }]
      if (command === 'agenda_occurrences') return []
      if (command === 'patient_create') { started = true; return new Promise(resolve => { resolveCreate = resolve }) }
      if (command === 'vault_lock') return null
      throw new Error(`Comando inesperado: ${command}`)
    } }
  })
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Pacientes' }).click()
  await page.getByRole('button', { name: 'Novo cadastro' }).click()
  await page.getByLabel('Nome', { exact: true }).fill('Cadastro pendente')
  await page.getByRole('button', { name: 'Salvar paciente' }).click()
  await expect.poll(() => page.evaluate(() => window.pendingProbe().started)).toBe(true)
  await page.clock.fastForward(24 * 60 * 60 * 1000)
  await expect(page.getByLabel('Senha do cofre')).toBeVisible()
  await expect(page.getByText('Paciente visível')).toHaveCount(0)
  await expect(page.getByText('Cadastro pendente')).toHaveCount(0)
  expect((await page.evaluate(() => window.pendingProbe())).statusCalls).toBeGreaterThan(1)
  await page.evaluate(() => window.finishCreate())
  await expect(page.getByText('Cadastro pendente')).toHaveCount(0)
})

test('virada do dia invoca bloqueio backend mesmo com savePending sem resolução', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-28T12:00:00Z') })
  await page.addInitScript(() => {
    let unlocked = true
    let saveStarted = false
    let lockCalls = 0
    const patient = { id: 'p1', name: 'Lia Exemplo', revision: 1, archivedAt: null }
    window.hangingSaveProbe = () => ({ saveStarted, lockCalls })
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      if (command === 'vault_status') return { initialized: true, unlocked, profileState: 'ready' }
      if (command === 'vault_lock') { lockCalls++; unlocked = false; return null }
      if (command === 'auto_backup_status') return { present: false, available: false, dirty: false }
      if (command === 'patient_list') return [patient]
      if (command === 'agenda_list_series') return [{ id: 'series-1', patientId: patient.id, startDate: '2026-09-28', start: '14:00', end: '14:50', modality: 'Presencial', frequency: 'Avulsa' }]
      if (command === 'agenda_occurrences') return args.from <= '2026-09-28' && args.to >= '2026-09-28' ? [{ id: 'occ-1', seriesId: 'series-1', patientId: patient.id, originalDate: '2026-09-28', date: '2026-09-28', start: '14:00', end: '14:50', modality: 'Presencial', frequency: 'Avulsa', status: 'scheduled' }] : []
      if (command === 'agenda_history' || command === 'behavior_list' || command === 'indicator_catalog' || command === 'session_draft_list' || command === 'session_timeline' || command === 'session_addendum_list' || command === 'case_context_list') return []
      if (command === 'professional_get') return null
      if (command === 'session_draft_start') return { id: 'draft-1', patientId: patient.id, seriesId: 'series-1', originalDate: '2026-09-28', observation: '', behaviorIds: [], indicators: [] }
      if (command === 'session_draft_save') { saveStarted = true; return new Promise(() => {}) }
      throw new Error(`Comando inesperado: ${command}`)
    } }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Abrir Agenda' }).click()
  await openAgendaDetails(page)
  await page.getByRole('button', { name: 'Iniciar sessão de Lia Exemplo em 2026-09-28 às 14:00–14:50' }).click()
  await page.getByLabel('Observações descritivas').fill('Rascunho ainda pendente')
  await page.clock.fastForward(1000)
  await expect.poll(() => page.evaluate(() => window.hangingSaveProbe().saveStarted)).toBe(true)
  await page.clock.fastForward(24 * 60 * 60 * 1000)
  await expect(page.getByLabel('Senha do cofre')).toBeVisible()
  await expect(page.getByText('Rascunho ainda pendente')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.hangingSaveProbe().lockCalls)).toBe(1)
})

test('falha do bloqueio backend na virada do dia é exibida sem reabrir dados', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-28T12:00:00Z') })
  await page.addInitScript(() => {
    window.__TAURI_INTERNALS__ = { invoke: async command => {
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'vault_lock') throw new Error('Falha sintética no bloqueio')
      if (command === 'auto_backup_status') return { present: false, available: false, dirty: false }
      if (command === 'patient_list') return [{ id: 'p1', name: 'Paciente privado', revision: 1, archivedAt: null }]
      if (command === 'agenda_occurrences') return []
      throw new Error(`Comando inesperado: ${command}`)
    } }
  })
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Início' }).getByText('Paciente privado')).toBeVisible()
  await page.clock.fastForward(24 * 60 * 60 * 1000)
  await expect(page.getByLabel('Senha do cofre')).toBeVisible()
  await expect(page.getByText('Paciente privado')).toHaveCount(0)
  await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível bloquear o cofre no dispositivo' })).toBeVisible()
})

test('prévia da agenda acompanha criação e consulta o dia novo após desbloquear', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-28T12:00:00Z') })
  await page.addInitScript(() => {
    let unlocked = true
    const series = []
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      if (command === 'vault_status') return { initialized: true, unlocked, profileState: 'ready' }
      if (command === 'vault_lock') { unlocked = false; return null }
      if (command === 'vault_unlock') { unlocked = true; return null }
      if (command === 'auto_backup_status') return { present: false, available: false, dirty: false }
      if (command === 'patient_list') return [{ id: 'p1', name: 'Lia Exemplo', revision: 1, archivedAt: null }]
      if (command === 'agenda_list_series') return series
      if (command === 'agenda_history') return []
      if (command === 'agenda_create_series') { const saved = { ...args.input, id: `s${series.length + 1}` }; series.push(saved); return saved }
      if (command === 'agenda_occurrences') return series.filter(item => item.startDate >= args.from && item.startDate <= args.to).map(item => ({ id: item.id, seriesId: item.id, patientId: item.patientId, originalDate: item.startDate, date: item.startDate, start: item.start, end: item.end, status: 'scheduled', modality: item.modality, frequency: 'Avulsa' }))
      throw new Error(`Comando inesperado: ${command}`)
    } }
  })
  await page.goto('/')
  await expect(page.getByText('Nenhum compromisso para hoje.')).toBeVisible()
  await page.getByRole('button', { name: /Agenda Compromissos/ }).click()
  await page.getByRole('button', { name: /Novo compromisso/ }).last().click()
  await page.getByLabel('Data do compromisso').fill('2026-09-28')
  await page.getByRole('button', { name: 'Criar compromisso avulso' }).click()
  await page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Início' }).click()
  await expect(page.getByRole('region', { name: 'Início' }).getByText('14:00 · Lia Exemplo')).toBeVisible()
  await page.clock.fastForward(24 * 60 * 60 * 1000)
  await expect(page.getByLabel('Senha do cofre')).toBeVisible()
  await page.getByLabel('Senha do cofre').fill('senha sintética longa')
  await page.getByRole('button', { name: 'Desbloquear' }).click()
  await expect(page.getByText('Nenhum compromisso para hoje.')).toBeVisible()
})

test('cofre já desbloqueado carrega pacientes sem atualização manual', async ({ page }) => {
  await page.addInitScript(() => {
    window.__TAURI_INTERNALS__ = { invoke: async command => {
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { present: false, available: false, dirty: false }
      if (command === 'patient_list') return [{ id: 'synthetic-initial', name: 'Paciente Inicial Fictício', revision: 1, lifeCycle: 'Criança', age: 8, archivedAt: null }]
      throw new Error(`Comando inesperado: ${command}`)
    } }
  })
  await openPatients(page)
  await expect(page.getByRole('listitem').filter({ hasText: 'Paciente Inicial Fictício' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pacientes' })).toHaveAttribute('aria-current', 'page')
})

test('respostas tardias não atravessam bloqueio ou troca de paciente', async ({ page }) => {
  await page.addInitScript(() => {
    let unlocked = true
    let holdList = false
    let resolveList
    let resolveWrite
    const patients = [{ id: 'a', name: 'Paciente A', revision: 1, archivedAt: null }, { id: 'b', name: 'Paciente B', revision: 1, archivedAt: null }]
    window.holdNextList = () => { holdList = true }
    window.releaseList = () => resolveList?.([{ id: 'stale', name: 'Paciente Obsoleto', revision: 1, archivedAt: null }])
    window.releaseWrite = () => resolveWrite?.({ id: 'r', patientId: 'a', revision: 1, name: 'Vínculo A', relation: 'Mãe', roles: { requester: true, legalGuardian: false, administrativeContact: false }, archivedAt: null })
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      if (command === 'vault_status') return { initialized: true, unlocked, profileState: 'ready' }
      if (command === 'auto_backup_status') return { present: false, available: false, dirty: false }
      if (command === 'patient_list') { if (holdList) { holdList = false; return new Promise(resolve => { resolveList = resolve }) } return patients.map(item => ({ ...item })) }
      if (command === 'vault_lock') { unlocked = false; return null }
      if (command === 'vault_unlock') { unlocked = true; return null }
      if (command === 'related_party_list') return args.patientId === 'a' ? [] : []
      if (command === 'related_party_create') return new Promise(resolve => { resolveWrite = resolve })
      if (command === 'patient_archive') { const item = patients.find(value => value.id === args.id); item.archivedAt = '2026-09-28'; item.revision++; return { ...item } }
      throw new Error(`Comando inesperado: ${command}`)
    } }
  })
  await openPatients(page)
  await page.evaluate(() => window.holdNextList())
  await page.getByRole('checkbox', { name: 'Mostrar arquivados' }).check()
  await page.getByRole('button', { name: 'Bloquear' }).click()
  await expect(page.getByText('Paciente A')).toHaveCount(0)
  await page.getByLabel('Senha do cofre').fill('senha sintética longa')
  await page.getByRole('button', { name: 'Desbloquear' }).click()
  await page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Pacientes' }).click()
  await page.evaluate(() => window.releaseList())
  await expect(page.getByRole('listitem').filter({ hasText: 'Paciente A' })).toHaveCount(1)
  await expect(page.getByText('Paciente Obsoleto')).toHaveCount(0)
  await page.getByRole('listitem').filter({ hasText: 'Paciente A' }).getByRole('button', { name: 'Pessoas vinculadas' }).click()
  await page.getByLabel('Nome da pessoa ou instituição').fill('Vínculo A')
  await page.getByRole('checkbox', { name: 'Solicitante' }).check()
  await page.getByRole('button', { name: 'Adicionar vínculo' }).click()
  await page.getByRole('listitem').filter({ hasText: 'Paciente B' }).getByRole('button', { name: 'Pessoas vinculadas' }).click()
  await page.evaluate(() => window.releaseWrite())
  await expect(page.getByRole('heading', { name: 'Vínculos de Paciente B' })).toBeVisible()
  await expect(page.getByText('Vínculo A')).toHaveCount(0)
  await expect(page.getByLabel('Nome da pessoa ou instituição')).toHaveValue('')
  await page.getByRole('listitem').filter({ hasText: 'Paciente A' }).getByRole('button', { name: 'Editar', exact: true }).click()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('listitem').filter({ hasText: 'Paciente A' }).getByRole('button', { name: 'Arquivar' }).click()
  await page.getByRole('button', { name: 'Novo cadastro' }).click()
  await expect(page.getByRole('form', { name: 'Novo cadastro' })).toBeVisible()
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('')
})

test('identificação e vínculos sintéticos persistem e ficam restritos ao paciente', async ({ page }) => {
  await page.addInitScript(() => {
    let unlocked = true
    const patients = []
    const parties = []
    let nextId = 0
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      if (command === 'vault_status') return { initialized: true, unlocked, profileState: 'ready' }
      if (command === 'auto_backup_status') return { present: false, available: false, dirty: false, error: null }
      if (command === 'vault_lock') { unlocked = false; return null }
      if (command === 'vault_unlock') { unlocked = true; return null }
      if (command === 'patient_list') return patients.map(item => ({ ...item }))
      if (command === 'patient_create') { const item = { ...args.input, id: `p${++nextId}`, revision: 1, archivedAt: null }; patients.push(item); return { ...item } }
      if (command === 'patient_update') { const item = patients.find(value => value.id === args.id); if (item.revision !== args.revision) throw new Error('revision conflict'); Object.assign(item, args.input, { revision: item.revision + 1 }); return { ...item } }
      if (command === 'related_party_list') return parties.filter(item => item.patientId === args.patientId && (args.includeArchived || item.archivedAt == null)).map(item => ({ ...item, roles: { ...item.roles } }))
      if (command === 'related_party_create') { const item = { ...args.input, patientId: args.patientId, id: `r${++nextId}`, revision: 1, archivedAt: null }; parties.push(item); return { ...item } }
      if (command === 'related_party_update' || command === 'related_party_archive' || command === 'related_party_restore') { const item = parties.find(value => value.id === args.id && value.patientId === args.patientId); if (!item || item.revision !== args.revision) throw new Error('revision conflict'); if (command === 'related_party_update') Object.assign(item, args.input); else item.archivedAt = command === 'related_party_archive' ? '2026-09-28' : null; item.revision++; return { ...item } }
      throw new Error(`Comando inesperado: ${command}`)
    } }
    window.identificationState = () => ({ patients, parties })
  })
  await openPatients(page)
  await page.getByRole('button', { name: 'Novo cadastro' }).click()
  await page.getByLabel('Nome', { exact: true }).fill('Adulto Sintético')
  await page.getByLabel('O próprio paciente solicitou o atendimento?').selectOption('yes')
  await page.getByRole('button', { name: 'Salvar paciente' }).click()
  await page.getByLabel('Nome', { exact: true }).fill('Criança Sintética')
  await page.getByLabel('Idade em anos (opcional)').fill('8')
  await page.getByLabel('Modalidade', { exact: true }).selectOption('Presencial')
  await page.getByLabel('O próprio paciente solicitou o atendimento?').selectOption('no')
  await page.getByRole('button', { name: 'Salvar paciente' }).click()
  await page.getByRole('listitem').filter({ hasText: 'Criança Sintética' }).getByRole('button', { name: 'Pessoas vinculadas' }).click()
  const add = async (name, relation, roles) => {
    await page.getByLabel('Nome da pessoa ou instituição').fill(name)
    await page.getByLabel('Relação com o paciente').selectOption(relation)
    for (const role of roles) await page.getByRole('checkbox', { name: role }).check()
    await page.getByRole('button', { name: 'Adicionar vínculo' }).click()
  }
  await add('Guardião A', 'Mãe', ['Solicitante', 'Responsável legal'])
  await add('Guardião B', 'Pai', ['Responsável legal'])
  await add('Escola Sintética', 'Escola', ['Contato administrativo'])
  await expect(page.getByText('Guardião A')).toBeVisible()
  await expect(page.getByText('Guardião B')).toBeVisible()
  await expect(page.getByText('Escola Sintética')).toBeVisible()
  const school = page.getByRole('listitem').filter({ hasText: 'Escola Sintética' })
  page.once('dialog', dialog => dialog.accept())
  await school.getByRole('button', { name: 'Arquivar vínculo' }).click()
  await expect(page.getByText('Escola Sintética')).toHaveCount(0)
  await page.getByRole('checkbox', { name: 'Mostrar vínculos arquivados' }).check()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('listitem').filter({ hasText: 'Escola Sintética' }).getByRole('button', { name: 'Restaurar vínculo' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Vínculo restaurado.' })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'Escola Sintética' }).getByRole('button', { name: 'Arquivar vínculo' })).toBeVisible()
  await page.getByRole('button', { name: 'Bloquear' }).click()
  await expect(page.getByText('Guardião A')).toHaveCount(0)
  await page.getByLabel('Senha do cofre').fill('senha sintética longa')
  await page.getByRole('button', { name: 'Desbloquear' }).click()
  await page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Pacientes' }).click()
  await page.getByRole('listitem').filter({ hasText: 'Criança Sintética' }).getByRole('button', { name: 'Pessoas vinculadas' }).click()
  await expect(page.getByText('Guardião A')).toBeVisible()
  await expect(page.getByText('Escola Sintética')).toBeVisible()
  await page.getByRole('listitem').filter({ hasText: 'Adulto Sintético' }).getByRole('button', { name: 'Pessoas vinculadas' }).click()
  await expect(page.getByText('Guardião A')).toHaveCount(0)
  await expect(page.getByText('Nenhum vínculo cadastrado.')).toBeVisible()
  await page.getByRole('listitem').filter({ hasText: 'Adulto Sintético' }).getByRole('button', { name: 'Editar', exact: true }).click()
  await page.getByLabel('O próprio paciente solicitou o atendimento?').selectOption('')
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Adulto Sintético' })).toContainText('Idade não informada')
  const child = page.getByRole('listitem').filter({ hasText: 'Criança Sintética' })
  await child.getByRole('button', { name: 'Editar', exact: true }).click()
  await page.getByLabel('Idade em anos (opcional)').fill('')
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
  expect(await page.evaluate(() => window.identificationState())).toMatchObject({ patients: [{ selfRequester: null }, { selfRequester: 'no', age: null, preferredModality: 'Presencial' }] })
  await expect(page.getByLabel('Data de nascimento (opcional)')).toHaveCount(0)
})

test('cópia legível exige confirmação e cancelamento não confirma arquivo', async ({ page }) => {
  await page.addInitScript(() => {
    let calls = 0
    let confirmed = false
    window.exportProbe = () => calls
    window.setExportConfirmation = value => { confirmed = value }
    window.confirm = () => confirmed
    window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { present: false, available: false, keyEnvelopePresent: true, dirty: false, error: null }
      if (command === 'patient_list') return [{ id: 'p', name: 'Paciente teste', revision: 1, archivedAt: null }]
      if (command === 'behavior_list' || command === 'indicator_catalog' || command === 'session_draft_list' || command === 'session_addendum_list' || command === 'session_timeline' || command === 'case_context_list') return []
      if (command === 'professional_get') return null
      if (command === 'record_copy_export') { if (args.patientId !== 'p') throw new Error('Paciente incorreto'); calls++; return false }
      throw new Error(`Comando inesperado: ${command}`)
    } }
  })
  await openPatients(page)
  await expect(page.getByRole('button', { name: 'Exportar cópia legível deste paciente' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Abrir sessões' }).click()
  await page.getByLabel('Paciente para evolução e sessões').selectOption('p')
  await page.getByText('Exportar cópia legível', { exact: true }).click()
  const button = page.getByRole('button', { name: 'Exportar cópia legível deste paciente' })
  await button.click()
  expect(await page.evaluate(() => window.exportProbe())).toBe(0)
  await page.evaluate(() => window.setExportConfirmation(true))
  await button.click()
  expect(await page.evaluate(() => window.exportProbe())).toBe(1)
  await expect(page.getByText('Cópia legível criada.')).toHaveCount(0)
})

test('restauração aberta em perfil vazio mantém controles do cofre ocultos', async ({ page }) => {
  await page.addInitScript(() => {
    window.__TAURI_INTERNALS__ = { invoke: async command => {
      if (command === 'vault_status') return { initialized: false, unlocked: false, profileState: 'empty' }
      throw new Error(`Comando inesperado: ${command}`)
    } }
  })
  await openPatients(page)
  await page.getByText('Opções avançadas de restauração').click()
  await page.getByRole('button', { name: 'Restaurar backup existente' }).click()
  await expect(page.getByLabel('Senha independente do backup')).toBeVisible()
  await expect(page.getByText('Cofre desbloqueado neste dispositivo.')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Abrir Agenda' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Abrir sessões' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Salvar paciente' })).toHaveCount(0)
})

test('contexto salva sem profissional local e preserva autoria histórica na evolução', async ({ page }) => {
  await page.addInitScript(() => {
    const contexts = [{ id: 'legacy-context', patientId: 'synthetic-p', recordedAt: '2025-01-01T00:00:00Z', demand: 'Demanda antiga com autoria', objectives: 'Objetivo antigo', author: { displayName: 'Autora Histórica Sintética', registration: 'TEST-ANTIGO' } }]
    const addenda = []
    let failRefresh = false
    let failAddendumRefresh = false
    let createCount = 0
    let addendumCreateCount = 0
    window.failNextContextRefresh = () => { failRefresh = true }
    window.failNextAddendumRefresh = () => { failAddendumRefresh = true }
    window.contextCreateCount = () => createCount
    window.addendumCreateCount = () => addendumCreateCount
    window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { present: false, available: false, keyEnvelopePresent: true, dirty: false, error: null }
      if (command === 'patient_list') return [{ id: 'synthetic-p', name: 'Paciente Sintético', revision: 1, archivedAt: null }]
      if (command === 'behavior_list' || command === 'indicator_catalog' || command === 'session_draft_list') return []
      if (command === 'session_addendum_list') { if (failAddendumRefresh) { failAddendumRefresh = false; throw new Error('Falha sintética de atualização do adendo') } return addenda.map(item => ({ ...item })) }
      if (command === 'session_addendum_create') { addendumCreateCount++; const item = { id: `addendum-${addendumCreateCount}`, sessionId: args.sessionId, patientId: args.patientId, createdAt: '2026-09-27T12:00:00Z', content: args.content }; addenda.push(item); return item }
      if (command === 'case_context_list') { if (failRefresh) { failRefresh = false; throw new Error('Falha sintética de atualização') } return contexts.filter(item => item.patientId === args.patientId).slice().reverse() }
      if (command === 'case_context_create') { createCount++; const item = { id: `synthetic-${contexts.length}`, patientId: args.patientId, recordedAt: `2026-09-27T12:00:0${contexts.length}Z`, demand: args.demand, objectives: args.objectives, author: null }; contexts.push(item); return item }
      if (command === 'session_timeline') return [{ id: 'old', patientId: 'synthetic-p', sessionDate: '2026-01-01', start: '10:00', end: '10:50', modality: 'Online', observation: 'observação sintética antiga', behaviors: [], indicators: [], author: null, recordedAt: null }]
      throw new Error(`Comando inesperado: ${command}`)
    } }
  })
  await openPatients(page)
  await page.getByRole('button', { name: 'Abrir sessões' }).click()
  await page.getByLabel('Paciente para evolução e sessões').selectOption('synthetic-p')
  await page.getByText('Evolução e escalas registradas').click()
  await page.getByText('Contexto do caso', { exact: true }).click()
  await expect(page.getByText('observação sintética antiga')).toBeVisible()
  await page.getByRole('button', { name: 'Adicionar adendo' }).click()
  await page.getByLabel('Texto do adendo (até 4000 caracteres)').fill('Correção sintética imutável')
  await page.evaluate(() => window.failNextAddendumRefresh())
  await page.getByRole('button', { name: 'Salvar adendo imutável' }).click()
  await expect(page.getByText('Adendo datado salvo; a atualização da tela falhou. Reabra as sessões para atualizar os dados.')).toBeVisible()
  await expect(page.getByText('Correção sintética imutável')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Salvar adendo imutável' })).toHaveCount(0)
  expect(await page.evaluate(() => window.addendumCreateCount())).toBe(1)
  await expect(page.getByText('Demanda antiga com autoria')).toBeVisible()
  await expect(page.getByText('Autora Histórica Sintética · TEST-ANTIGO')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Salvar nova revisão do contexto' })).toBeDisabled()
  await expect(page.getByLabel('Nome de exibição')).toHaveCount(0)
  await page.getByLabel('Demanda avaliada').fill('Demanda sintética inicial')
  await page.getByLabel('Objetivos de trabalho').fill('Objetivo sintético inicial')
  await page.getByRole('button', { name: 'Salvar nova revisão do contexto' }).click()
  await expect(page.getByText('Demanda sintética inicial')).toBeVisible()
  await page.getByLabel('Demanda avaliada').fill('Demanda sintética revisada')
  await page.getByLabel('Objetivos de trabalho').fill('Objetivo sintético revisado')
  await page.evaluate(() => window.failNextContextRefresh())
  await page.getByRole('button', { name: 'Salvar nova revisão do contexto' }).click()
  await expect(page.getByText('Nova revisão datada do contexto salva; a atualização da tela falhou. Reabra as sessões para atualizar os dados.')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Salvar nova revisão do contexto' })).toBeDisabled()
  expect(await page.evaluate(() => window.contextCreateCount())).toBe(2)
  await expect(page.getByText('Demanda sintética revisada')).toBeVisible()
  await expect(page.getByText('Demanda sintética inicial')).toBeVisible()
  await expect(page.getByText('Autora Histórica Sintética · TEST-ANTIGO')).toBeVisible()
  await expect(page.getByText('observação sintética antiga')).toBeVisible()
})

test('compromisso avulso cria uma ocorrência e permite remarcação e cancelamento', async ({ page }) => {
  await page.addInitScript(() => {
    const patient = { id: 'synthetic-patient', name: 'Paciente Sintético', revision: 1, archivedAt: null }
    const series = []
    const events = []
    window.confirm = () => true
    window.oneOffProbe = () => ({ series, events })
    window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { present: true, available: true, keyEnvelopePresent: true, dirty: false, error: null }
      if (command === 'patient_list') return [patient]
      if (command === 'agenda_list_series') return series
      if (command === 'agenda_history') return events
      if (command === 'agenda_create_series') { series.push({ id: 'one-off', ...args.input }); return series[0] }
      if (command === 'agenda_occurrences') {
        if (!series.length || events.some(event => event.action === 'cancel')) return []
        const moved = events.find(event => event.action === 'reschedule')
        const item = series[0]
        const date = moved?.effectiveDate || item.startDate
        return date >= args.from && date <= args.to ? [{ id: `one-off:${item.startDate}`, seriesId: item.id, patientId: item.patientId, originalDate: item.startDate, date, start: moved?.start || item.start, end: moved?.end || item.end, status: 'scheduled', frequency: 'Avulsa', modality: item.modality, wasRescheduled: Boolean(moved) }] : []
      }
      if (command === 'agenda_reschedule') { events.push({ id: 'move', seriesId: args.seriesId, originalDate: args.originalDate, action: 'reschedule', effectiveDate: args.input.date, start: args.input.start, end: args.input.end, reason: args.input.reason }); return null }
      if (command === 'agenda_cancel') { events.push({ id: 'cancel', seriesId: args.seriesId, originalDate: args.originalDate, action: 'cancel', reason: args.reason }); return null }
      throw new Error(`Comando inesperado: ${command}`)
    } }
  })
  await openPatients(page)
  await page.getByRole('button', { name: 'Abrir Agenda' }).click()
  await page.getByRole('button', { name: /Novo compromisso/ }).last().click()
  await page.getByLabel('Data do compromisso').fill('2026-10-05')
  await page.getByRole('button', { name: 'Criar compromisso avulso' }).click()
  await page.getByRole('button', { name: 'Detalhes e ações' }).click()
  await expect(page.getByRole('region', { name: 'Detalhes e ações dos compromissos' })).toContainText('Paciente Sintético')
  await page.getByRole('button', { name: 'Alterar ocorrência de Paciente Sintético em 2026-10-05 às 14:00–14:50' }).click()
  await page.getByLabel('Nova data efetiva').fill('2026-10-06')
  await page.getByLabel(/Motivo administrativo/).fill('motivo sintético da remarcação')
  await page.getByRole('button', { name: 'Confirmar remarcação individual' }).click()
  await page.getByLabel('Data de referência').fill('2026-10-06')
  await expect(page.locator('.agenda-detail-list')).toContainText('2026-10-06 · 14:00–14:50')
  await page.getByRole('button', { name: 'Alterar ocorrência de Paciente Sintético em 2026-10-06 às 14:00–14:50' }).click()
  await page.getByLabel('Ação explícita').selectOption('cancelar')
  await page.getByLabel(/Motivo administrativo/).fill('motivo sintético')
  await page.getByRole('button', { name: 'Confirmar cancelamento' }).click()
  await expect(page.getByText('Nenhum compromisso neste período.')).toBeVisible()
  expect((await page.evaluate(() => window.oneOffProbe())).events.map(event => event.action)).toEqual(['reschedule', 'cancel'])
})

test('encerramento de série persistida mostra conflito e atualiza calendário sem apagar histórico', async ({ page }) => {
  await page.addInitScript(() => {
    const patient = { id: 'synthetic-patient', name: 'Paciente Sintético', revision: 1, archivedAt: null }
    const series = [{ id: 'synthetic-series', patientId: patient.id, weekday: 4, start: '14:00', end: '14:50', frequency: 'Semanal', startDate: '2026-01-01', endDate: null, modality: 'Presencial', meetingLink: null }]
    const history = [{ id: 'synthetic-event', seriesId: series[0].id, action: 'reschedule', originalDate: '2026-01-01', effectiveDate: '2026-01-02', start: '14:00', end: '14:50', reason: 'sintético' }]
    let calls = 0
    window.endProbe = () => ({ calls, endDate: series[0].endDate, history: history.length })
    window.confirm = () => true
    window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { present: true, available: true, keyEnvelopePresent: true, dirty: false, error: null }
      if (command === 'patient_list') return [patient]
      if (command === 'agenda_list_series') return series.map(item => ({ ...item }))
      if (command === 'agenda_occurrences') return []
      if (command === 'agenda_history') return history
      if (command === 'agenda_end_series') {
        calls++
        if (calls === 1) throw new Error('Não é possível encerrar: a ocorrência original 2026-01-01 foi remarcada para 2026-10-08 após o corte.')
        if (calls === 2) throw new Error('Não é possível encerrar: há rascunho de sessão na ocorrência original 2026-10-08.')
        series[0].endDate = args.effectiveDate === '2026-10-01' ? '2026-09-30' : null
        return { ...series[0] }
      }
      throw new Error(`Comando inesperado: ${command}`)
    } }
  })
  await openPatients(page)
  await page.getByRole('button', { name: 'Abrir Agenda' }).click()
  await openPersistedAppointments(page)
  await page.getByRole('button', { name: 'Encerrar série de Paciente Sintético · série synthetic-series' }).click()
  await page.getByLabel('Primeira data excluída').fill('2026-10-01')
  await page.getByRole('button', { name: 'Confirmar encerramento' }).click()
  await expect(page.getByRole('alert')).toContainText('remarcada para 2026-10-08')
  await page.getByRole('button', { name: 'Confirmar encerramento' }).click()
  await expect(page.getByRole('alert')).toContainText('rascunho de sessão')
  await page.getByRole('button', { name: 'Confirmar encerramento' }).click()
  await expect(page.locator('.vault-agenda .vault-ok[role="status"]')).toContainText('histórico preservado')
  await expect(page.getByText('2026-09-30')).toBeVisible()
  expect(await page.evaluate(() => window.endProbe())).toEqual({ calls: 3, endDate: '2026-09-30', history: 1 })
})

test('séries persistidas permitem corte antes do início e antecipação com nomes acessíveis distintos', async ({ page }) => {
  await page.addInitScript(() => {
    const patients = [
      { id: 'p1', name: 'Paciente Sintético A', revision: 1, archivedAt: null },
      { id: 'p2', name: 'Paciente Sintético B', revision: 1, archivedAt: null },
    ]
    const series = [
      { id: 's-future', patientId: 'p1', weekday: 4, start: '14:00', end: '14:50', frequency: 'Semanal', startDate: '2026-11-05', endDate: null, modality: 'Presencial' },
      { id: 's-bounded', patientId: 'p2', weekday: 4, start: '16:00', end: '16:50', frequency: 'Semanal', startDate: '2026-01-01', endDate: '2026-12-31', modality: 'Presencial' },
    ]
    const calls = []
    window.endProbe = () => ({ calls, series })
    window.confirm = () => true
    window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { present: true, available: true, keyEnvelopePresent: true, dirty: false, error: null }
      if (command === 'patient_list') return patients
      if (command === 'agenda_list_series') return series.map(item => ({ ...item }))
      if (command === 'agenda_occurrences' || command === 'agenda_history') return []
      if (command === 'agenda_end_series') {
        calls.push(args)
        const item = series.find(candidate => candidate.id === args.seriesId)
        item.endDate = '2026-09-30'
        return { ...item }
      }
      throw new Error(`Comando inesperado: ${command}`)
    } }
  })
  await openPatients(page)
  await page.getByRole('button', { name: 'Abrir Agenda' }).click()
  await openPersistedAppointments(page)
  const first = page.getByRole('button', { name: 'Encerrar série de Paciente Sintético A · série s-future' })
  const second = page.getByRole('button', { name: 'Encerrar série de Paciente Sintético B · série s-bounded' })
  await expect(first).toBeVisible()
  await expect(second).toHaveText('Antecipar término')
  await first.click()
  await page.getByLabel('Primeira data excluída').fill('2026-10-01')
  await page.getByRole('button', { name: 'Confirmar encerramento' }).click()
  await expect(page.getByText(/encerrada antes do início/)).toBeVisible()
  await second.click()
  await page.getByLabel('Primeira data excluída').fill('2026-10-01')
  await page.getByRole('button', { name: 'Confirmar encerramento' }).click()
  expect((await page.evaluate(() => window.endProbe())).calls).toEqual([
    { seriesId: 's-future', effectiveDate: '2026-10-01' },
    { seriesId: 's-bounded', effectiveDate: '2026-10-01' },
  ])
})

test('desktop synthetic registry is persistent-shaped, editable and isolated from demo', async ({ page }) => {
  await page.addInitScript(() => {
    let initialized = false
    let unlocked = false
    let patients = []
    let failNextList = false
    window.__TAURI_INTERNALS__ = {
      invoke: async (command, args) => {
        if (command === 'vault_status') return { initialized, unlocked, profileState: initialized ? 'ready' : 'empty' }
        if (command === 'auto_backup_status' || command === 'auto_backup_retry') return { available: initialized, keyEnvelopePresent: initialized, dirty: false, error: null, lastVerifiedAt: initialized ? 1700000000 : null }
        if (command === 'recovery_inventory') return { categories: [{ category: 'pre-migration-removivel', count: 1, bytes: 2048, oldestAt: 1700000000, newestAt: 1700000000 }, { category: 'quarentena-preservada', count: 1, bytes: 4096, oldestAt: 1700000000, newestAt: 1700000000 }], eligibleCount: 1, eligibleBytes: 2048, previewToken: 'synthetic-preview', cleanupBlocked: false }
        if (command === 'vault_create') {
          if (args.password.length < 12) throw new Error('Senha curta')
          initialized = true
          unlocked = true
          return null
        }
        if (command === 'patient_list') {
          if (failNextList) { failNextList = false; throw new Error('Leitura indisponível') }
          return patients.filter(patient => args.includeArchived || patient.archivedAt == null)
        }
        if (command === 'patient_create') {
          const patient = { ...args.input, id: '11111111-1111-4111-8111-111111111111', revision: 1, archivedAt: null }
          patients = [patient]
          failNextList = true
          return patient
        }
        if (command === 'patient_update') {
          const patient = patients.find(item => item.id === args.id)
          if (patient.revision !== args.revision) throw new Error('Revisão desatualizada')
          Object.assign(patient, args.input, { revision: patient.revision + 1 })
          return patient
        }
        if (command === 'patient_archive' || command === 'patient_restore') {
          const patient = patients.find(item => item.id === args.id)
          patient.archivedAt = command === 'patient_archive' ? 1700000000 : null
          patient.revision++
          return patient
        }
        if (command === 'vault_lock') { unlocked = false; return null }
        if (command === 'vault_unlock') { unlocked = true; return null }
        if (command === 'backup_create') return true
        if (command === 'backup_select') return { createdAt: 1700000000, schemaVersion: 3, sizeBytes: 4096, replacesExisting: true, profileState: 'ready' }
        if (command === 'backup_restore') {
          if (!args.confirmed) throw new Error('Confirmação ausente')
          unlocked = true
          return null
        }
        throw new Error(`Comando inesperado: ${command}`)
      },
    }
  })
  await openPatients(page)
  await expect(page.getByRole('heading', { name: 'Círculo' })).toBeVisible()
  await expect(page.getByText(/Entre com sua senha para acessar pacientes, agenda e sessões/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Agenda' })).toHaveCount(0)
  await page.getByLabel('Crie uma senha local').fill('senha sintética longa')
  await page.getByRole('button', { name: 'Criar cofre cifrado' }).click()
  await page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Pacientes' }).click()
  await expect(page.getByText('Paciente Sintético 001')).toHaveCount(0)
  await page.getByRole('button', { name: 'Novo cadastro' }).click()
  await page.getByLabel('Nome').fill('Paciente Fictício A')
  await page.getByLabel('Idade em anos (opcional)').fill('9')
  await page.getByRole('button', { name: 'Salvar paciente' }).click()
  await expect(page.getByText('Paciente Fictício A')).toBeVisible()
  await expect(page.getByText('Cadastro salvo, mas não foi possível atualizar a lista.')).toBeVisible()
  await page.getByRole('button', { name: 'Atualizar lista' }).click()
  await expect(page.getByText('Paciente Fictício A')).toHaveCount(1)
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await page.getByText('Licenças de terceiros').click()
  await expect(page.locator('.vault-licenses pre').first()).toContainText('Copyright (c) 2008-2026, ZETETIC, LLC')
  await expect(page.locator('.vault-licenses pre').nth(1)).toContainText('Apache License')
  await page.getByRole('button', { name: 'Inspecionar artefatos locais' }).click()
  await expect(page.getByText(/quarentena-preservada/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Limpar cópias pré-migração selecionáveis' })).toBeDisabled()
  await expect(page.getByText(/proteção contra troca concorrente do arquivo/i)).toBeVisible()
  await page.getByRole('button', { name: 'Pacientes' }).click()
  await page.getByRole('button', { name: 'Editar' }).click()
  await page.getByLabel('Nome').fill('Paciente Fictício B')
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(page.getByText('Paciente Fictício B')).toBeVisible()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Arquivar' }).click()
  await expect(page.getByText('Paciente Fictício B')).toHaveCount(0)
  await page.getByLabel('Mostrar arquivados').check()
  await expect(page.getByText('Paciente Fictício B')).toBeVisible()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Restaurar', exact: true }).click()
  await expect(page.getByText('Paciente Fictício B')).toBeVisible()
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await page.getByLabel('Senha independente do backup').fill('senha backup sintética longa')
  await page.getByRole('button', { name: 'Criar backup cifrado' }).click()
  await expect(page.getByText('Backup cifrado criado e verificado.')).toBeVisible()
  await page.getByLabel('Senha independente do backup').fill('senha backup sintética longa')
  await page.getByRole('button', { name: 'Selecionar e verificar backup' }).click()
  await expect(page.getByText('A restauração substituirá o único perfil local')).toBeVisible()
  await page.getByLabel('Senha atual do cofre local').fill('senha sintética longa')
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Confirmar restauração' }).click()
  await expect(page.getByText(/Restauração concluída/)).toBeVisible()
  await page.getByRole('button', { name: 'Bloquear' }).click()
  await expect(page.getByLabel('Senha do cofre')).toBeVisible()
  await expect(page.getByText(/pré-migração-preservado|pre-migration-removivel/)).toHaveCount(0)
  await page.getByLabel('Senha do cofre').fill('senha sintética longa')
  await page.getByRole('button', { name: 'Desbloquear', exact: true }).click()
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await expect(page.getByRole('button', { name: 'Inspecionar artefatos locais' })).toBeVisible()
  await expect(page.getByText(/pre-migration-removivel/)).toHaveCount(0)
})

test('empty desktop vault restores a v5 backup with a new local password', async ({ page }) => {
  await page.addInitScript(() => {
    let initialized = false
    let unlocked = false
    window.__TAURI_INTERNALS__ = {
      invoke: async (command, args) => {
        if (command === 'vault_status') return { initialized, unlocked, profileState: initialized ? 'ready' : 'empty' }
        if (command === 'auto_backup_status') return { available: false, dirty: false, error: null, lastVerifiedAt: null }
        if (command === 'backup_select') return { createdAt: 1700000000, schemaVersion: 5, sizeBytes: 4096, replacesExisting: false, profileState: 'empty' }
        if (command === 'backup_restore') {
          if (args.backupPassword !== 'senha backup sintética longa' || args.localPassword !== 'nova senha local sintética longa' || !args.confirmed || args.quarantineConfirmed) throw new Error('Parâmetros incorretos')
          initialized = true; unlocked = true; return null
        }
        if (command === 'vault_lock') { unlocked = false; return null }
        if (command === 'patient_list') return unlocked ? [{ id: 'synthetic-import', name: 'Paciente Importado Fictício', revision: 1, lifeCycle: 'Adulto', age: null, preferredModality: 'Presencial', archivedAt: null }] : []
        throw new Error(`Comando inesperado: ${command}`)
      },
    }
  })
  await openPatients(page)
  await page.getByText('Opções avançadas de restauração').click()
  await expect(page.getByRole('button', { name: 'Restaurar backup existente' })).toBeVisible()
  await page.getByRole('button', { name: 'Restaurar backup existente' }).click()
  await expect(page.getByRole('button', { name: 'Criar cofre cifrado' })).toHaveCount(0)
  await page.getByLabel('Senha independente do backup').fill('senha backup sintética longa')
  await page.getByRole('button', { name: 'Selecionar e verificar backup' }).click()
  await expect(page.getByText(/O backup será restaurado neste perfil vazio/i)).toBeVisible()
  await page.getByLabel('Nova senha local').fill('nova senha local sintética longa')
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('button', { name: 'Confirmar restauração' }).click()
  await expect(page.getByText(/Restauração concluída/)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Criar cofre cifrado' })).toHaveCount(0)
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Confirmar restauração' }).click()
  await expect(page.getByText(/Restauração concluída/)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Início' }).getByText('Paciente Importado Fictício')).toBeVisible()
  await page.getByRole('button', { name: 'Bloquear' }).click()
  await expect(page.getByLabel('Senha do cofre')).toBeVisible()
  await expect(page.getByText('Paciente Importado Fictício')).toHaveCount(0)
})

test('restauração local confirma desbloqueio, mostra pacientes e ignora lista antiga', async ({ page }) => {
  await page.addInitScript(() => {
    let unlocked = false
    let restored = false
    let delayedList = false
    let resolveOldList
    window.delayPatientList = () => { delayedList = true }
    window.releaseOldList = () => resolveOldList?.([{ id: 'old', name: 'Paciente Antigo', revision: 1, archivedAt: null }])
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      if (command === 'vault_status') return { initialized: true, unlocked, profileState: 'ready' }
      if (command === 'auto_backup_status') return { present: true, available: unlocked, keyEnvelopePresent: true, dirty: false }
      if (command === 'auto_backup_validate') return args.password === 'senha sintética longa'
      if (command === 'auto_backup_restore') { restored = true; unlocked = true; return null }
      if (command === 'vault_lock') { unlocked = false; return null }
      if (command === 'vault_unlock') { unlocked = true; return null }
      if (command === 'patient_list') { if (delayedList) { delayedList = false; return new Promise(resolve => { resolveOldList = resolve }) } return [{ id: restored ? 'new' : 'before', name: restored ? 'Paciente Recuperado' : 'Paciente Anterior', revision: 1, archivedAt: null }] }
      throw new Error(`Comando inesperado: ${command}`)
    } }
  })
  await openPatients(page)
  await page.getByText('Opções avançadas de backup e restauração').click()
  await page.getByLabel('Senha local para verificar cópia automática').fill('senha sintética longa')
  await page.getByRole('button', { name: 'Verificar cópia automática local' }).click()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Recuperar cópia automática local' }).click()
  await expect(page.getByRole('region', { name: 'Início' }).getByText('Paciente Recuperado')).toBeVisible()
  await page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Pacientes' }).click()
  await page.evaluate(() => window.delayPatientList())
  await page.getByRole('checkbox', { name: 'Mostrar arquivados' }).check()
  await page.getByRole('button', { name: 'Bloquear' }).click()
  await page.getByLabel('Senha do cofre').fill('senha sintética longa')
  await page.getByRole('button', { name: 'Desbloquear' }).click()
  await page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Pacientes' }).click()
  await page.evaluate(() => window.releaseOldList())
  await expect(page.getByText('Paciente Recuperado')).toBeVisible()
  await expect(page.getByText('Paciente Antigo')).toHaveCount(0)
})

test('incomplete desktop profile preserves files and disables unvalidated portable restore', async ({ page }) => {
  await page.addInitScript(() => {
    window.__TAURI_INTERNALS__ = {
      invoke: async command => {
        if (command === 'vault_status') return { initialized: false, unlocked: false, profileState: 'incomplete' }
        if (command === 'auto_backup_status') return { available: false, dirty: false, error: null, lastVerifiedAt: null }
        if (command === 'backup_select') return { createdAt: 1700000000, schemaVersion: 5, sizeBytes: 4096, replacesExisting: false, profileState: 'incomplete-profile-unsupported' }
        if (command === 'backup_restore') throw new Error('Restauração em perfil incompleto indisponível')
        if (command === 'patient_list') return []
        throw new Error(`Comando inesperado: ${command}`)
      },
    }
  })
  await openPatients(page)
  await expect(page.getByText('Perfil local incompleto.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Recuperar cópia automática local' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Criar cofre cifrado' })).toHaveCount(0)
  await page.getByLabel('Senha independente do backup').fill('senha backup sintética longa')
  await page.getByRole('button', { name: 'Selecionar e verificar backup' }).click()
  await expect(page.getByText(/restauração portátil não foi validada/i)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirmar restauração' })).toBeDisabled()
  await expect(page.getByText('Nenhum cadastro encontrado.')).toHaveCount(0)
})

test('desktop agenda creates a recurring series, moves one occurrence, then locks without leaking state', async ({ page }) => {
  await page.addInitScript(() => {
    const patient = { id: '11111111-1111-4111-8111-111111111111', name: 'Paciente Fictício A', age: 9, lifeCycle: 'Não informado', preferredModality: '', revision: 1, archivedAt: null }
    const series = []
    const events = []
    const moved = new Map()
    let unlocked = false
    window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
      if (command === 'vault_status') return { initialized: true, unlocked, profileState: 'ready' }
      if (command === 'auto_backup_status' || command === 'auto_backup_retry') return { available: true, keyEnvelopePresent: true, dirty: false, error: null, lastVerifiedAt: 1700000000 }
      if (command === 'vault_unlock') { unlocked = true; return null }
      if (command === 'vault_lock') { unlocked = false; return null }
      if (!unlocked) throw new Error('Cofre bloqueado')
      if (command === 'patient_list') return args.includeArchived || patient.archivedAt == null ? [patient] : []
      if (command === 'patient_archive' || command === 'patient_restore') {
        patient.archivedAt = command === 'patient_archive' ? 1700000000 : null
        patient.revision++
        return { ...patient }
      }
      if (command === 'agenda_list_series') return series
      if (command === 'agenda_history') return events
      if (command === 'agenda_create_series') {
        const saved = { ...args.input, id: '22222222-2222-4222-8222-222222222222', timeZone: 'America/Sao_Paulo', revision: 1 }
        series.push(saved)
        events.push({ id: 'event-create', seriesId: saved.id, originalDate: '2026-10-05', action: 'create', effectiveDate: null, start: null, end: null, reason: null })
        return saved
      }
      if (command === 'agenda_occurrences') {
        return series.flatMap(item => {
          const originalDate = '2026-10-05'
          const effective = moved.get(originalDate) || { date: originalDate, start: item.start, end: item.end }
          if (effective.date < args.from || effective.date > args.to) return []
          return [{ id: `${item.id}:${originalDate}`, seriesId: item.id, patientId: item.patientId, originalDate, ...effective, status: moved.has(originalDate) ? 'remarcada' : 'ativa', frequency: item.frequency, modality: item.modality, meetingLink: null, timeZone: item.timeZone }]
        })
      }
      if (command === 'agenda_reschedule') {
        moved.set(args.originalDate, args.input)
        events.push({ id: 'event-1', seriesId: args.seriesId, originalDate: args.originalDate, action: 'remarcar', effectiveDate: args.input.date, start: args.input.start, end: args.input.end, reason: args.input.reason })
        return null
      }
      throw new Error(`Comando inesperado: ${command}`)
    } }
  })
  await openPatients(page)
  await page.getByLabel('Senha do cofre').fill('senha sintética longa')
  await page.getByRole('button', { name: 'Desbloquear' }).click()
  await page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Pacientes' }).click()
  await page.getByRole('button', { name: 'Abrir Agenda' }).click()
  await expect(page.getByRole('heading', { name: 'Agenda de sessões' })).toBeVisible()
  await page.getByRole('button', { name: /Novo compromisso/ }).last().click()
  await page.getByLabel('Tipo').selectOption('Recorrente')
  await page.getByLabel('Início da série').fill('2026-10-05')
  await page.getByLabel('Data de referência').fill('2026-10-05')
  await page.getByRole('button', { name: 'Criar série' }).click()
  await expect(page.getByText('Série recorrente salva no cofre cifrado.')).toBeVisible()
  await openAgendaDetails(page)
  await expect(page.getByRole('button', { name: 'Alterar ocorrência de Paciente Fictício A em 2026-10-05 às 14:00–14:50' })).toBeVisible()
  await page.getByRole('button', { name: 'Pacientes' }).click()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Arquivar' }).click()
  await page.getByRole('button', { name: 'Abrir Agenda' }).click()
  await openAgendaDetails(page)
  await page.getByRole('button', { name: 'Histórico administrativo' }).click()
  await expect(page.getByText('Paciente Fictício A · create · original 2026-10-05')).toBeVisible()
  await expect(page.locator('.agenda-detail-list')).toContainText('2026-10-05 · 14:00–14:50')
  await expect(page.locator('#agenda-patient option', { hasText: 'Paciente Fictício A' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Pacientes' }).click()
  await page.getByLabel('Mostrar arquivados').check()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Restaurar', exact: true }).click()
  await page.getByRole('button', { name: 'Abrir Agenda' }).click()
  await expect(page.locator('#agenda-patient option', { hasText: 'Paciente Fictício A' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Alterar ocorrência de Paciente Fictício A em 2026-10-05 às 14:00–14:50' }).click()
  await page.getByLabel('Nova data efetiva').fill('2026-10-06')
  await page.getByLabel('Data de referência').fill('2026-10-06')
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Confirmar remarcação individual' }).click()
  await expect(page.getByText('Ocorrência individual remarcada; data original preservada.')).toBeVisible()
  await expect(page.locator('.agenda-detail-list')).toContainText('Data original: 2026-10-05')
  await page.getByRole('button', { name: 'Bloquear' }).click()
  await expect(page.getByRole('heading', { name: 'Agenda de sessões' })).toHaveCount(0)
})

test('completed agenda occurrence is realized without start while scheduled occurrence remains startable', async ({ page }) => {
  await page.addInitScript(() => {
    const patient = { id: 'patient-synthetic', name: 'Paciente Sintético Agenda', age: 8, lifeCycle: 'Criança', preferredModality: '', revision: 1, archivedAt: null }
    const dates = ['2026-09-28', '2026-10-05']
    const startCalls = []
    window.agendaStartCalls = () => startCalls
    window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { present: true, available: true, keyEnvelopePresent: true, dirty: false, error: null, lastVerifiedAt: 1700000000 }
      if (command === 'patient_list') return [patient]
      if (command === 'agenda_list_series' || command === 'agenda_history') return []
      if (command === 'agenda_occurrences') return dates.filter(date => date >= args.from && date <= args.to).map(date => ({
        id: `series-synthetic:${date}`, seriesId: 'series-synthetic', patientId: patient.id,
        originalDate: date, date, start: '14:00', end: '14:50', frequency: 'Semanal',
        modality: 'Presencial', meetingLink: null, status: date === dates[0] ? 'completed' : 'scheduled',
      }))
      if (command === 'session_draft_start') {
        startCalls.push(args)
        return { id: 'draft-synthetic', patientId: patient.id, seriesId: args.seriesId, originalDate: args.originalDate, observation: '', behaviorIds: [], indicators: [] }
      }
      if (command === 'professional_get') return null
      if (command === 'behavior_list' || command === 'indicator_catalog' || command === 'session_timeline' || command === 'session_draft_list' || command === 'session_addendum_list' || command === 'case_context_list') return []
      throw new Error(`Comando inesperado: ${command}`)
    } }
  })
  await openPatients(page)
  await page.getByRole('button', { name: 'Abrir Agenda' }).click()
  await page.getByLabel('Data de referência').fill('2026-09-28')
  await openAgendaDetails(page)
  const completed = page.locator('.agenda-detail-list > li').filter({ hasText: '2026-09-28' })
  await expect(completed).toContainText('Realizada')
  await page.reload()
  await page.getByRole('button', { name: 'Abrir Agenda' }).click()
  await page.getByLabel('Data de referência').fill('2026-09-28')
  await openAgendaDetails(page)
  await expect(completed).toContainText('Realizada')
  await expect(completed.getByRole('button', { name: /Alterar ocorrência de/ })).toHaveCount(0)
  await expect(completed.getByRole('button', { name: /Iniciar sessão de/ })).toHaveCount(0)
  await page.getByLabel('Data de referência').fill('2026-10-05')
  const scheduled = page.locator('.agenda-detail-list > li').filter({ hasText: '2026-10-05' })
  await expect(scheduled).toContainText('Agendada')
  await expect(scheduled.getByRole('button', { name: 'Alterar ocorrência de Paciente Sintético Agenda em 2026-10-05 às 14:00–14:50' })).toBeVisible()
  await scheduled.getByRole('button', { name: 'Iniciar sessão de Paciente Sintético Agenda em 2026-10-05 às 14:00–14:50' }).click()
  await expect.poll(() => page.evaluate(() => window.agendaStartCalls())).toEqual([{ seriesId: 'series-synthetic', originalDate: '2026-10-05' }])
})

test('desktop session draft persists through lock, finalizes with snapshot and isolates timeline', async ({ page }) => {
  await page.addInitScript(() => {
    const patients = [
      { id: '11111111-1111-4111-8111-111111111111', name: 'Paciente Sintético A', age: 8, lifeCycle: 'Criança', preferredModality: '', revision: 1, archivedAt: null },
      { id: '22222222-2222-4222-8222-222222222222', name: 'Paciente Sintético B', age: null, lifeCycle: 'Adulto', preferredModality: '', revision: 1, archivedAt: null },
    ]
    const seriesId = '33333333-3333-4333-8333-333333333333'
    const drafts = []
    const sessions = []
    const templates = []
    const indicatorCatalog = [
      { id: 'reg', name: 'Regulação emocional', definition: 'Uso de recursos para lidar com emoções intensas.', version: 1, labels: ['Ainda não observado', 'Com muito apoio', 'Com algum apoio', 'Com autonomia'] },
      { id: 'com', name: 'Comunicação de necessidades', definition: 'Expressa o que precisa em situações cotidianas.', version: 1, labels: ['Ainda não observado', 'Raramente', 'Às vezes', 'Frequentemente'] },
    ]
    let unlocked = true
    let failNextSave = false
    let delayNextSave = false
    window.failNextDraftSave = () => { failNextSave = true }
    window.delayNextDraftSave = () => { delayNextSave = true }
    window.savedDraft = () => ({ ...drafts.find(item => item.originalDate === '2026-09-28') })
    window.addLegacyEmptySession = () => sessions.push({ id: 'legacy-empty', patientId: patients[0].id, seriesId, originalDate: '2026-08-31', sessionDate: '2026-08-31', start: '14:00', end: '14:50', modality: 'Presencial', timeZone: 'America/Sao_Paulo', wasRescheduled: false, observation: '', privateNote: 'NOTA_PRIVADA_SINTETICA_NAO_EXIBIR', finalizedAt: 1699999999, behaviors: [], indicators: [] })
    window.addIncompatibleIndicatorSession = () => sessions.push({ id: 'incompatible', patientId: patients[0].id, seriesId, originalDate: '2026-09-21', sessionDate: '2026-09-21', start: '14:00', end: '14:50', modality: 'Presencial', timeZone: 'America/Sao_Paulo', wasRescheduled: false, observation: '', finalizedAt: 1699999998, behaviors: [], indicators: [{ ...indicatorCatalog[0], labels: ['Ainda não observado', 'Escala divergente'], value: 1, note: null }] })
    window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
      if (command === 'vault_status') return { initialized: true, unlocked, profileState: 'ready' }
      if (command === 'auto_backup_status') return { present: true, available: unlocked, keyEnvelopePresent: true, dirty: false, error: null, lastVerifiedAt: unlocked ? 1700000000 : null }
      if (command === 'vault_lock') { unlocked = false; return null }
      if (command === 'vault_unlock') { unlocked = true; return null }
      if (command === 'patient_list') return patients.filter(patient => args.includeArchived || patient.archivedAt == null)
      if (command === 'agenda_list_series') return [{ id: seriesId, patientId: patients[0].id, weekday: 1, start: '14:00', end: '14:50', frequency: 'Semanal', startDate: '2026-09-28', endDate: '2026-10-05', modality: 'Presencial', meetingLink: null, timeZone: 'America/Sao_Paulo', revision: 1 }]
      if (command === 'agenda_history') return []
      if (command === 'agenda_occurrences') return ['2026-09-28', '2026-10-05'].filter(date => date >= args.from && date <= args.to).map(date => ({ id: `${seriesId}:${date}`, seriesId, patientId: patients[0].id, originalDate: date, date, start: '14:00', end: '14:50', modality: 'Presencial', meetingLink: null, status: 'Agendado', frequency: 'Semanal', timeZone: 'America/Sao_Paulo' }))
      if (command === 'behavior_list') return templates.map(item => ({ ...item }))
      if (command === 'indicator_catalog') return indicatorCatalog.map(item => ({ ...item, labels: [...item.labels] }))
      if (command === 'behavior_create') { const item = { id: '44444444-4444-4444-8444-444444444444', title: args.title, description: args.description, version: 1, active: true }; templates.push(item); return { ...item } }
      if (command === 'behavior_update') { const item = templates.find(value => value.id === args.id); Object.assign(item, { title: args.title, description: args.description, version: item.version + 1 }); return { ...item } }
      if (command === 'session_draft_start') {
        if (sessions.some(item => item.seriesId === args.seriesId && item.originalDate === args.originalDate)) throw new Error('Ocorrência já realizada')
        const existing = drafts.find(item => item.seriesId === args.seriesId && item.originalDate === args.originalDate)
        if (existing) return { ...existing }
        const draft = { id: `draft-${args.originalDate}`, patientId: patients[0].id, seriesId, originalDate: args.originalDate, observation: '', behaviorIds: [], indicators: [], updatedAt: 1700000000 }
        drafts.push(draft); return { ...draft }
      }
      if (command === 'session_draft_list') return drafts.filter(item => item.patientId === args.patientId).map(item => ({ ...item }))
      if (command === 'session_timeline') return sessions.filter(item => item.patientId === args.patientId).sort((a, b) => b.sessionDate.localeCompare(a.sessionDate) || b.finalizedAt - a.finalizedAt || a.id.localeCompare(b.id)).map(item => ({ ...item, behaviors: item.behaviors.map(behavior => ({ ...behavior })), indicators: item.indicators.map(indicator => ({ ...indicator, labels: [...indicator.labels] })) }))
      if (command === 'session_addendum_list') return []
      if (command === 'case_context_list') return []
      if (command === 'session_draft_save') {
        if (failNextSave) { failNextSave = false; throw new Error('Falha sintética de disco') }
        if (delayNextSave) { delayNextSave = false; await new Promise(resolve => setTimeout(resolve, 800)) }
        const draft = drafts.find(item => item.id === args.id); Object.assign(draft, args.input); return { ...draft }
      }
      if (command === 'session_draft_cancel') { const index = drafts.findIndex(item => item.id === args.id); drafts.splice(index, 1); return null }
      if (command === 'session_finalize') {
        const index = drafts.findIndex(item => item.id === args.id)
        const draft = drafts.splice(index, 1)[0]
        if (!draft) throw new Error('Rascunho não encontrado')
        if (!draft.observation.trim() || !draft.procedures?.trim() || !draft.outcomeDecision?.trim()) throw new Error('Campos essenciais são obrigatórios')
        const session = { id: `session-${draft.originalDate}`, patientId: draft.patientId, seriesId, originalDate: draft.originalDate, sessionDate: draft.originalDate, start: '14:00', end: '14:50', modality: 'Presencial', timeZone: 'America/Sao_Paulo', wasRescheduled: false, observation: draft.observation, procedures: draft.procedures, outcomeDecision: draft.outcomeDecision, referralClosure: draft.referralClosure, privateNote: 'NOTA_PRIVADA_SINTETICA_NAO_EXIBIR', finalizedAt: 1700000000, author: null, recordedAt: '2026-09-28T17:00:00+00:00', behaviors: draft.behaviorIds.map(id => { const item = templates.find(template => template.id === id); return { templateId: id, title: item.title, description: item.description, templateVersion: item.version } }), indicators: indicatorCatalog.map(item => ({ ...item, labels: [...item.labels], value: draft.indicators.find(entry => entry.id === item.id)?.value ?? null, note: draft.indicators.find(entry => entry.id === item.id)?.note || null })) }
        sessions.unshift(session); return { ...session }
      }
      throw new Error(`Comando inesperado: ${command}`)
    } }
  })
  await openPatients(page)
  await page.getByRole('button', { name: 'Abrir Agenda' }).click()
  await page.getByLabel('Data de referência').fill('2026-09-28')
  await page.getByRole('button', { name: 'Abrir sessões' }).click()
  await page.getByLabel('Paciente para evolução e sessões').selectOption('11111111-1111-4111-8111-111111111111')
  await page.getByText('Biblioteca de comportamentos reutilizáveis').click()
  await page.getByLabel('Título descritivo').fill('Participação sintética')
  await page.getByLabel('Descrição opcional').fill('Descrição inventada')
  await page.getByRole('button', { name: 'Criar comportamento reutilizável' }).click()
  await page.getByRole('button', { name: 'Abrir Agenda' }).click()
  await openAgendaDetails(page)
  await page.getByRole('button', { name: 'Iniciar sessão de Paciente Sintético A em 2026-09-28 às 14:00–14:50' }).click()
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toBeVisible()
  await page.getByLabel('Observações descritivas').fill('Rascunho A salvo antes da troca')
  await page.getByLabel('Procedimentos realizados').fill('Procedimento A antes da troca')
  await page.getByLabel('Resultado e decisão').fill('Decisão A antes da troca')
  await page.getByLabel('Encaminhamento ou encerramento (opcional)').fill('Encerramento A antes da troca')
  await page.getByLabel('Paciente para evolução e sessões').selectOption('22222222-2222-4222-8222-222222222222')
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toHaveCount(0)
  await expect(page.getByText('Rascunho A salvo antes da troca')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Retomar rascunho 2026-09-28' })).toHaveCount(0)
  await page.getByLabel('Paciente para evolução e sessões').selectOption('11111111-1111-4111-8111-111111111111')
  await expect(page.getByRole('button', { name: 'Retomar sessão de 2026-09-28' })).toBeVisible()
  await page.getByRole('button', { name: 'Retomar sessão de 2026-09-28' }).click()
  await expect(page.getByLabel('Observações descritivas')).toHaveValue('Rascunho A salvo antes da troca')
  await expect(page.getByLabel('Procedimentos realizados')).toHaveValue('Procedimento A antes da troca')
  await expect(page.getByLabel('Resultado e decisão')).toHaveValue('Decisão A antes da troca')
  await expect(page.getByLabel('Encaminhamento ou encerramento (opcional)')).toHaveValue('Encerramento A antes da troca')
  await page.getByRole('button', { name: 'Pacientes' }).click()
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toBeHidden()
  await page.getByRole('button', { name: 'Abrir sessões' }).click()
  await expect(page.getByLabel('Observações descritivas')).toHaveValue('Rascunho A salvo antes da troca')
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('button', { name: 'Cancelar rascunho' }).click()
  await expect(page.getByLabel('Observações descritivas')).toHaveValue('Rascunho A salvo antes da troca')
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toBeVisible()
  await page.getByLabel('Observações descritivas').fill('Texto local que será descartado')
  await page.getByRole('checkbox', { name: /Participação sintética/ }).check()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Cancelar rascunho' }).click()
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toHaveCount(0)
  await expect(page.getByText('Rascunho cancelado sem registro clínico final.')).toBeVisible()
  await expect(page.getByText('Texto local que será descartado')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Escolher compromisso na Agenda' })).toBeVisible()
  await page.getByText('Evolução e escalas registradas').click()
  await expect(page.getByText('Nenhuma sessão finalizada deste paciente.')).toBeVisible()
  await page.getByRole('button', { name: 'Abrir Agenda' }).click()
  await page.getByLabel('Data de referência').fill('2026-09-28')
  await openAgendaDetails(page)
  await page.getByRole('button', { name: 'Iniciar sessão de Paciente Sintético A em 2026-09-28 às 14:00–14:50' }).click()
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toBeVisible()
  await page.getByLabel('Observações descritivas').fill('Observação inventada e persistida')
  await expect(page.getByRole('button', { name: 'Finalizar sessão' })).toBeDisabled()
  await page.getByLabel('Procedimentos realizados').fill('Atividade descritiva sintética')
  await page.getByLabel('Resultado e decisão').fill('Registro de continuidade sintética')
  await page.getByLabel('Encaminhamento ou encerramento (opcional)').fill('Encerramento descritivo sintético')
  await expect.poll(() => page.evaluate(() => window.savedDraft()?.referralClosure)).toBe('Encerramento descritivo sintético')
  await page.getByRole('button', { name: 'Fechar sessões' }).click()
  await page.getByRole('button', { name: 'Abrir sessões' }).click()
  await page.getByLabel('Paciente para evolução e sessões').selectOption('11111111-1111-4111-8111-111111111111')
  await page.getByRole('button', { name: 'Retomar sessão de 2026-09-28' }).click()
  await expect(page.getByLabel('Encaminhamento ou encerramento (opcional)')).toHaveValue('Encerramento descritivo sintético')
  await page.evaluate(() => window.delayNextDraftSave())
  await page.getByLabel('Procedimentos realizados').fill('Primeira revisão sintética')
  await page.waitForTimeout(650)
  await page.getByLabel('Procedimentos realizados').fill('Atividade descritiva sintética')
  await page.getByRole('button', { name: 'Salvar rascunho' }).focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => page.evaluate(() => window.savedDraft()?.procedures)).toBe('Atividade descritiva sintética')
  await page.getByRole('button', { name: 'Abrir Agenda' }).click()
  await page.getByLabel('Data de referência').fill('2026-10-05')
  await openAgendaDetails(page)
  await page.getByRole('button', { name: 'Abrir sessões' }).click()
  await page.evaluate(() => window.delayNextDraftSave())
  await page.getByLabel('Procedimentos realizados').fill('Atividade sintética antes da troca de rascunho')
  await page.waitForTimeout(650)
  await page.getByRole('button', { name: 'Abrir Agenda' }).click()
  await openAgendaDetails(page)
  await page.getByRole('button', { name: 'Iniciar sessão de Paciente Sintético A em 2026-10-05 às 14:00–14:50' }).click()
  await expect(page.getByRole('heading', { name: 'Rascunho da ocorrência 2026-10-05' })).toBeVisible()
  await page.waitForTimeout(900)
  await expect(page.getByRole('heading', { name: 'Rascunho da ocorrência 2026-10-05' })).toBeVisible()
  await expect(page.getByLabel('Procedimentos realizados')).toHaveValue('')
  await expect.poll(() => page.evaluate(() => window.savedDraft()?.procedures)).toBe('Atividade sintética antes da troca de rascunho')
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Cancelar rascunho' }).click()
  await page.getByRole('button', { name: 'Retomar sessão de 2026-09-28' }).click()
  await page.getByLabel('Procedimentos realizados').fill('Atividade descritiva sintética')
  await expect(page.getByRole('button', { name: 'Finalizar sessão' })).toBeEnabled()
  await page.getByRole('checkbox', { name: /Participação sintética/ }).check()
  await page.getByLabel('Regulação emocional · v1').selectOption('2')
  await page.getByRole('button', { name: 'Limpar Regulação emocional' }).click()
  await expect(page.getByLabel('Regulação emocional · v1')).toHaveValue('')
  await page.getByLabel('Regulação emocional · v1').selectOption('0')
  await page.getByLabel('Nota contextual opcional · Regulação emocional').fill('Nota contextual inventada')
  await page.evaluate(() => window.failNextDraftSave())
  await page.getByRole('button', { name: 'Bloquear' }).click()
  await expect(page.getByText('Error: Falha sintética de disco')).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Cofre bloqueado por inatividade.' })).toHaveCount(0)
  await expect(page.getByLabel('Observações descritivas')).toHaveValue('Observação inventada e persistida')
  await expect(page.getByLabel('Procedimentos realizados')).toHaveValue('Atividade descritiva sintética')
  await expect(page.getByLabel('Resultado e decisão')).toHaveValue('Registro de continuidade sintética')
  await expect(page.getByLabel('Encaminhamento ou encerramento (opcional)')).toHaveValue('Encerramento descritivo sintético')
  await page.getByRole('button', { name: 'Bloquear' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Cofre bloqueado por inatividade.' })).toHaveCount(0)
  await expect(page.getByText('Observação inventada e persistida')).toHaveCount(0)
  await expect(page.getByText('Nota contextual inventada')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Evolução descritiva' })).toHaveCount(0)
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toHaveCount(0)
  await page.getByLabel('Senha do cofre').fill('senha sintética longa')
  await page.getByRole('button', { name: 'Desbloquear' }).click()
  await page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Pacientes' }).click()
  await expect(page.getByText('Observação inventada e persistida')).toHaveCount(0)
  await page.getByRole('button', { name: 'Abrir sessões' }).click()
  await page.getByLabel('Paciente para evolução e sessões').selectOption('11111111-1111-4111-8111-111111111111')
  await page.getByRole('button', { name: 'Retomar sessão de 2026-09-28' }).click()
  await expect(page.getByLabel('Observações descritivas')).toHaveValue('Observação inventada e persistida')
  await expect(page.getByLabel('Regulação emocional · v1')).toHaveValue('0')
  await expect(page.getByLabel('Nota contextual opcional · Regulação emocional')).toHaveValue('Nota contextual inventada')
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Finalizar sessão' }).click()
  await expect(page.getByText('Sessão finalizada e salva.')).toBeVisible()
  await page.getByText('Evolução e escalas registradas').click()
  await expect(page.getByText('Identidade local declarada:')).toHaveCount(0)
  await expect(page.getByText('Observação inventada e persistida')).toBeVisible()
  await expect(page.getByText('Atividade descritiva sintética')).toBeVisible()
  await expect(page.getByText('Registro de continuidade sintética')).toBeVisible()
  await expect(page.getByText('Encerramento descritivo sintético')).toBeVisible()
  await expect(page.getByText(/Participação sintética · v1/).last()).toBeVisible()
  await expect(page.getByText('Escala registrada: Ainda não observado · Com muito apoio · Com algum apoio · Com autonomia')).toBeVisible()
  await expect(page.getByText('Nota contextual: Nota contextual inventada').first()).toBeVisible()
  await page.getByLabel('Paciente para evolução e sessões').selectOption('22222222-2222-4222-8222-222222222222')
  await expect(page.getByText('Observação inventada e persistida')).toHaveCount(0)
  await expect(page.getByText('Nota contextual inventada')).toHaveCount(0)
  await page.getByLabel('Paciente para evolução e sessões').selectOption('11111111-1111-4111-8111-111111111111')
  await expect(page.getByText('Observação inventada e persistida')).toBeVisible()
  await expect(page.getByText('Evolução e escalas registradas')).toBeVisible()
  await expect(page.getByText('NOTA_PRIVADA_SINTETICA_NAO_EXIBIR')).toHaveCount(0)
  await page.evaluate(() => window.addLegacyEmptySession())
  await page.evaluate(() => window.addIncompatibleIndicatorSession())
  await page.getByLabel('Paciente para evolução e sessões').selectOption('22222222-2222-4222-8222-222222222222')
  await page.getByLabel('Paciente para evolução e sessões').selectOption('11111111-1111-4111-8111-111111111111')
  await expect(page.getByText('Sem registro').first()).toBeVisible()
  await expect(page.locator('.desktop-evolution-list > li').last()).toContainText('Procedimentos realizadosnão registrado')
  await expect(page.locator('.desktop-evolution-list > li').last()).toContainText('Resultado e decisãonão registrado')
  await expect(page.getByText('Escala registrada: Ainda não observado · Escala divergente')).toBeVisible()
  await expect(page.getByText('Escala registrada: Ainda não observado · Com muito apoio · Com algum apoio · Com autonomia')).toBeVisible()
  await expect(page.getByText('NOTA_PRIVADA_SINTETICA_NAO_EXIBIR')).toHaveCount(0)
  await expect(page.locator('.desktop-evolution-list > li').first()).toContainText('2026-09-28')
  await expect(page.locator('.desktop-evolution-list > li').last()).toContainText('2026-08-31')
  await page.getByRole('button', { name: 'Abrir Agenda' }).click()
  await page.getByLabel('Data de referência').fill('2026-09-28')
  await openAgendaDetails(page)
  await page.getByRole('button', { name: 'Iniciar sessão de Paciente Sintético A em 2026-09-28 às 14:00–14:50' }).click()
  await expect(page.getByText('Error: Ocorrência já realizada')).toBeVisible()
  await page.getByLabel('Data de referência').fill('2026-10-05')
  await page.getByRole('button', { name: 'Iniciar sessão de Paciente Sintético A em 2026-10-05 às 14:00–14:50' }).click()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Cancelar rascunho' }).click()
  await expect(page.getByText('Rascunho cancelado sem registro clínico final.')).toBeVisible()
  await page.getByText('Evolução e escalas registradas').click()
  await expect(page.getByText('Observação inventada e persistida')).toBeVisible()
})

test('automatic local backup exposes failure, retry and confirmed local recovery', async ({ page }) => {
  await page.addInitScript(() => {
    let unlocked = false
    let dirty = true
    window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
      if (command === 'vault_status') return { initialized: true, unlocked, profileState: 'ready' }
      if (command === 'auto_backup_status') return { present: true, available: unlocked, keyEnvelopePresent: true, dirty, error: dirty ? 'Disco indisponível' : null, lastVerifiedAt: unlocked && !dirty ? 1700000000 : null }
      if (command === 'auto_backup_retry') { dirty = false; return { present: true, available: true, keyEnvelopePresent: true, dirty, error: null, lastVerifiedAt: 1700000000 } }
      if (command === 'auto_backup_validate') {
        if (args.password !== 'senha sintética longa') throw new Error('Senha incorreta')
        return true
      }
      if (command === 'vault_unlock') { unlocked = true; return null }
      if (command === 'vault_lock') { unlocked = false; return null }
      if (command === 'patient_list') return []
      if (command === 'auto_backup_restore') {
        if (!args.confirmed || args.password !== 'senha sintética longa') throw new Error('Senha incorreta')
        unlocked = true
        return null
      }
      throw new Error(`Comando inesperado: ${command}`)
    } }
  })
  await openPatients(page)
  await page.getByText('Opções avançadas de backup e restauração').click()
  await expect(page.getByRole('alert').filter({ hasText: 'Cópia automática pendente' })).toBeVisible()
  await page.getByLabel('Senha do cofre').fill('senha sintética longa')
  await page.getByRole('button', { name: 'Desbloquear' }).click()
  await page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Pacientes' }).click()
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await page.getByRole('button', { name: 'Atualizar cópia automática agora' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Cópia automática pendente' })).toHaveCount(0)
  await expect(page.getByText(/Última verificação nesta sessão:/)).toBeVisible()
  await page.getByRole('button', { name: 'Bloquear' }).click()
  await page.getByText('Opções avançadas de backup e restauração').click()
  await page.getByLabel('Senha local para verificar cópia automática').fill('senha temporária longa')
  await page.getByLabel('Senha do cofre').fill('senha sintética longa')
  await page.getByRole('button', { name: 'Desbloquear' }).click()
  await page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Pacientes' }).click()
  await page.getByRole('button', { name: 'Bloquear' }).click()
  await page.getByText('Opções avançadas de backup e restauração').click()
  await expect(page.getByLabel('Senha local para verificar cópia automática')).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Recuperar cópia automática local' })).toHaveCount(0)
  await page.getByLabel('Senha local para verificar cópia automática').fill('senha incorreta longa')
  await page.getByRole('button', { name: 'Verificar cópia automática local' }).click()
  await expect(page.getByText('Error: Senha incorreta')).toBeVisible()
  await expect(page.getByLabel('Senha local para verificar cópia automática')).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Recuperar cópia automática local' })).toHaveCount(0)
  await page.getByLabel('Senha local para verificar cópia automática').fill('senha sintética longa')
  await page.getByRole('button', { name: 'Verificar cópia automática local' }).click()
  await expect(page.getByText('Cópia automática local validada.')).toBeVisible()
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('button', { name: 'Recuperar cópia automática local' }).click()
  await expect(page.getByLabel('Senha local para verificar cópia automática')).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Recuperar cópia automática local' })).toHaveCount(0)
  await page.getByLabel('Senha local para verificar cópia automática').fill('senha sintética longa')
  await page.getByRole('button', { name: 'Verificar cópia automática local' }).click()
  await expect(page.getByText('Cópia automática local validada.')).toBeVisible()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Recuperar cópia automática local' }).click()
  await expect(page.getByText('Cópia automática local restaurada e verificada.')).toBeVisible()
})

test('incomplete profile with intact key can recover missing database from local copy', async ({ page }) => {
  await page.addInitScript(() => {
    let recovered = false
    window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
      if (command === 'vault_status') return { initialized: recovered, unlocked: recovered, profileState: recovered ? 'ready' : 'incomplete' }
      if (command === 'auto_backup_status') return { present: true, available: false, keyEnvelopePresent: true, dirty: false, error: null, lastVerifiedAt: null }
      if (command === 'auto_backup_validate') return args.password === 'senha sintética longa'
      if (command === 'auto_backup_restore') {
        if (args.password !== 'senha sintética longa' || !args.confirmed) throw new Error('Recuperação não autorizada')
        recovered = true
        return null
      }
      if (command === 'patient_list') return []
      throw new Error(`Comando inesperado: ${command}`)
    } }
  })
  await openPatients(page)
  await expect(page.getByText('Perfil local incompleto.')).toBeVisible()
  await page.getByLabel('Senha local para verificar cópia automática').fill('senha sintética longa')
  await page.getByRole('button', { name: 'Verificar cópia automática local' }).click()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Recuperar cópia automática local' }).click()
  await expect(page.getByText('Cópia automática local restaurada e verificada.')).toBeVisible()
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await expect(page.getByText('Cofre desbloqueado neste dispositivo.')).toBeVisible()
})

test('present but invalid local copy never offers restore, and verification is password-bound', async ({ page }) => {
  await page.addInitScript(() => {
    let valid = false
    let unlocked = false
    window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
      if (command === 'vault_status') return { initialized: true, unlocked, profileState: 'ready' }
      if (command === 'auto_backup_status') return { present: true, available: false, keyEnvelopePresent: true, dirty: false, error: null, lastVerifiedAt: null }
      if (command === 'auto_backup_validate') {
        if (args.password !== 'senha sintética longa') throw new Error('Senha incorreta')
        return valid
      }
      if (command === 'auto_backup_restore') {
        if (!valid) throw new Error('Cópia automática local inválida')
        throw new Error('Restauração não deveria ser executada neste teste')
      }
      if (command === 'vault_unlock') { unlocked = true; return null }
      if (command === 'vault_lock') { unlocked = false; return null }
      if (command === 'patient_list') return []
      throw new Error(`Comando inesperado: ${command}`)
    } }
    window.makeAutoCopyValid = () => { valid = true }
    window.makeAutoCopyInvalid = () => { valid = false }
  })
  await openPatients(page)
  await page.getByText('Opções avançadas de backup e restauração').click()
  await expect(page.getByText('Cópia local encontrada, mas não validada enquanto o cofre está bloqueado.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Recuperar cópia automática local' })).toHaveCount(0)
  await page.getByLabel('Senha local para verificar cópia automática').fill('senha sintética longa')
  await page.getByRole('button', { name: 'Verificar cópia automática local' }).click()
  await expect(page.getByText('Error: Cópia automática local inválida.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Recuperar cópia automática local' })).toHaveCount(0)
  await page.evaluate(() => window.makeAutoCopyValid())
  await page.getByLabel('Senha local para verificar cópia automática').fill('senha sintética longa')
  await page.getByRole('button', { name: 'Verificar cópia automática local' }).click()
  await expect(page.getByRole('button', { name: 'Recuperar cópia automática local' })).toBeVisible()
  await page.evaluate(() => window.makeAutoCopyInvalid())
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Recuperar cópia automática local' }).click()
  await expect(page.getByText('Error: Cópia automática local inválida')).toBeVisible()
  await expect(page.getByLabel('Senha local para verificar cópia automática')).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Recuperar cópia automática local' })).toHaveCount(0)
  await page.evaluate(() => window.makeAutoCopyValid())
  await page.getByLabel('Senha local para verificar cópia automática').fill('senha sintética longa')
  await page.getByRole('button', { name: 'Verificar cópia automática local' }).click()
  await page.getByLabel('Senha local para verificar cópia automática').fill('senha trocada longa')
  await expect(page.getByRole('button', { name: 'Recuperar cópia automática local' })).toHaveCount(0)
  await page.getByLabel('Senha local para verificar cópia automática').fill('senha sintética longa')
  await page.getByRole('button', { name: 'Verificar cópia automática local' }).click()
  await expect(page.getByRole('button', { name: 'Recuperar cópia automática local' })).toBeVisible()
  await page.getByLabel('Senha do cofre').fill('senha sintética longa')
  await page.getByRole('button', { name: 'Desbloquear' }).click()
  await page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Pacientes' }).click()
  await page.getByRole('button', { name: 'Bloquear' }).click()
  await page.getByText('Opções avançadas de backup e restauração').click()
  await expect(page.getByLabel('Senha local para verificar cópia automática')).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Recuperar cópia automática local' })).toHaveCount(0)
})




