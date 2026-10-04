import { expect, test } from '@playwright/test'

const assistant = page => page.getByRole('region', { name: 'Comando do Círculo' })
const calendar = (page, view = 'semana') => page.getByRole('region', { name: 'Calendário ' + view, exact: true })
const details = page => page.locator('#agenda-details-panel')
const eventButton = (page, id, view = 'semana') => calendar(page, view).locator('button[data-voice-action="agenda:details:' + id + '"]')
const snapshot = page => page.evaluate(() => structuredClone(window.appointmentOptions.state))
const writes = page => page.evaluate(() => structuredClone(window.appointmentOptions.writes))

// Real App/DesktopVault/Agenda and real command parser/apply path. IPC alone is
// mocked with cloned fictional data; unknown IPC throws, including every write.
// No injected intents, real profile, microphone, native ASR or captured corpus.
async function openApp(page, { names = ['Ana Clara', 'Ána Clára'], extra = false, many = false } = {}) {
  const time = new Date('2026-10-04T15:00:00Z')
  await page.clock.install({ time })
  await page.clock.pauseAt(time)
  await page.addInitScript(({ names, extra, many }) => {
    const clone = value => structuredClone(value)
    const patients = [
      { id: 'ana-one', name: names[0], age: 8, revision: 1, preferredModality: 'Presencial', archivedAt: null },
      { id: 'ana-two', name: names[1], age: 9, revision: 1, preferredModality: 'Online', archivedAt: null },
    ]
    const series = [
      { id: 'series-completed', patientId: 'ana-one', weekday: 1, start: '15:00', end: '15:50', frequency: 'Semanal', startDate: '2026-09-28', endDate: null, modality: 'Presencial', meetingLink: null, timeZone: 'America/Sao_Paulo', revision: 1 },
      { id: 'series-one-off', patientId: 'ana-two', weekday: 5, start: '15:00', end: '15:50', frequency: 'Avulsa', startDate: '2026-10-02', endDate: '2026-10-02', modality: 'Online', meetingLink: null, timeZone: 'America/Sao_Paulo', revision: 1 },
    ]
    // Intentionally unsorted IPC order; both share effective date/time. Their
    // original dates, patient IDs, occurrence IDs and statuses are distinct.
    const occurrences = [
      { id: 'z-occurrence', seriesId: 'series-one-off', patientId: 'ana-two', originalDate: '2026-10-02', date: '2026-10-04', start: '15:00', end: '15:50', status: 'scheduled', frequency: 'Avulsa', modality: 'Online', meetingLink: null, wasRescheduled: true },
      { id: 'a-occurrence', seriesId: 'series-completed', patientId: 'ana-one', originalDate: '2026-09-28', date: '2026-10-04', start: '15:00', end: '15:50', status: 'completed', frequency: 'Semanal', modality: 'Presencial', meetingLink: null, wasRescheduled: true },
    ]
    if (extra) occurrences.push(
      { ...occurrences[1], id: 'early-completed', start: '14:00', end: '14:50' },
      { ...occurrences[0], id: 'late-one-off', start: '16:00', end: '16:50' },
    )
    if (many) for (let index = 3; index <= 11; index++) occurrences.push({
      ...occurrences[1], id: 'numbered-' + String(index).padStart(2, '0'), start: '16:' + String(index).padStart(2, '0'), end: '17:00',
    })
    const history = [{ id: 'move-preserved', seriesId: 'series-one-off', action: 'reschedule', originalDate: '2026-10-02', effectiveDate: '2026-10-04', start: '15:00', end: '15:50', reason: 'Remarcação fictícia preservada.' }]
    const drafts = [{ id: 'draft-preserved', patientId: 'ana-two', seriesId: 'series-one-off', originalDate: '2026-09-21', observation: 'Rascunho fictício intacto.', procedures: 'Procedimento intacto.', outcomeDecision: 'Resultado intacto.', referralClosure: 'Encaminhamento intacto.', behaviorIds: [], indicators: [] }]
    const sessions = [{ id: 'session-preserved', patientId: 'ana-one', seriesId: 'series-completed', originalDate: '2026-09-28', sessionDate: '2026-10-04', start: '15:00', end: '15:50', observation: 'Sessão concluída fictícia intacta.', procedures: '', outcomeDecision: '', referralClosure: '', behaviors: [], indicators: [] }]
    const fixture = window.appointmentOptions = { state: { patients, series, occurrences, history, drafts, sessions }, calls: [], writes: [], unexpected: [], catalogReady: false }
    const reads = new Set()
    const catalog = (command, result) => {
      reads.add(command)
      fixture.catalogReady = ['patient_list', 'behavior_list', 'indicator_catalog'].every(name => reads.has(name))
      return clone(result)
    }
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      fixture.calls.push(clone({ command, args }))
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { available: false, dirty: false }
      if (command === 'plugin:updater|check') return null
      if (command === 'patient_list') return catalog(command, patients)
      if (command === 'behavior_list' || command === 'indicator_catalog') return catalog(command, [])
      if (command === 'agenda_list_series') return clone(series)
      if (command === 'agenda_history') return clone(history)
      if (command === 'agenda_occurrences') return clone(fixture.loadedSuperset ? occurrences : occurrences.filter(item => item.date >= args.from && item.date <= args.to))
      if (command === 'session_draft_list') return clone(drafts.filter(item => item.patientId === args.patientId))
      if (command === 'session_timeline') return clone(sessions.filter(item => item.patientId === args.patientId))
      if (command === 'session_addendum_list' || command === 'case_context_list') return []
      fixture.unexpected.push(command)
      if (/(?:create|update|save|start|cancel|finalize|end_series|reschedule|archive|restore)/.test(command)) fixture.writes.push(clone({ command, args }))
      throw new Error('IPC sem fixture: ' + command)
    } }
  }, { names, extra, many })
  await page.goto('/')
  await expect(assistant(page)).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.appointmentOptions.catalogReady)).toBe(true)
  await expect(page.locator('.vault-home-preview')).toContainText(names[0])
  await page.clock.runFor(32)
  await command(page, 'Abrir Agenda')
  await expect(calendar(page)).toBeVisible()
  await expect(page.getByText('Carregando Agenda...', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Data de referência')).toHaveValue('2026-10-04')
  await expect(calendar(page).locator('button[data-voice-action^="agenda:details:"]')).toHaveCount(many ? 11 : extra ? 4 : 2)
  await expect(eventButton(page, 'a-occurrence')).toBeEnabled()
  await expect(eventButton(page, 'z-occurrence')).toBeEnabled()
  await expect(details(page)).toHaveCount(0)
}

async function propose(page, text) {
  await assistant(page).getByLabel('Seu comando').fill(text)
  await assistant(page).getByRole('button', { name: 'Preparar rascunho', exact: true }).click()
}

async function confirm(page) {
  await propose(page, 'confirmar')
  await page.clock.runFor(32)
}

async function command(page, text) {
  await propose(page, text)
  await expect(page.locator('.voice-command-preview')).toBeVisible()
  await confirm(page)
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
}

async function unchanged(page, before) {
  expect(await snapshot(page)).toEqual(before)
  expect(await writes(page)).toEqual([])
  for (const name of ['Rascunho de sessão', 'Alterar ocorrência individual', 'Novo compromisso', 'Encerrar série recorrente']) {
    await expect(page.getByRole('form', { name, exact: true })).toHaveCount(0)
  }
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
}

test.beforeEach(async ({ page, baseURL }) => {
  const unexpected = []
  page.on('dialog', async dialog => { unexpected.push(dialog.type()); await dialog.dismiss() })
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) await route.continue()
    else { unexpected.push(route.request().url()); await route.abort() }
  })
  page.appointmentOptionsBoundary = unexpected
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.appointmentOptions?.unexpected || [])).toEqual([])
  expect(page.appointmentOptionsBoundary).toEqual([])
})

test('cartões homônimos exibem opção global e identidade exata incluindo completed e avulsa remarcada', async ({ page }, testInfo) => {
  await openApp(page)
  const before = await snapshot(page)
  const sorted = [...before.occurrences].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.id.localeCompare(b.id))
  expect(sorted.map(item => item.id)).toEqual(['a-occurrence', 'z-occurrence'])
  for (const [index, occurrence] of sorted.entries()) {
    const patient = before.patients.find(item => item.id === occurrence.patientId)
    const button = eventButton(page, occurrence.id)
    await expect(button).toBeVisible()
    await expect(button).toHaveAttribute('data-voice-appointment-option', String(index + 1))
    await expect(button).toHaveAttribute('data-voice-appointment-patient-id', patient.id)
    await expect(button).toHaveAttribute('data-voice-appointment-id', occurrence.id)
    await expect(button).toHaveAttribute('data-voice-appointment-patient', patient.name)
    await expect(button).toHaveAttribute('data-voice-appointment-date', occurrence.date)
    await expect(button).toHaveAttribute('data-voice-appointment-start', occurrence.start)
    await expect(button).toHaveAttribute('data-voice-appointment-end', occurrence.end)
    await expect(button).toHaveAttribute('data-voice-appointment-original-date', occurrence.originalDate)
    await expect(button).toHaveAttribute('data-voice-appointment-ambiguous', 'true')
    await expect(button).toHaveAttribute('data-voice-record', JSON.stringify(['occurrence', occurrence.id, patient.id, occurrence.seriesId, occurrence.originalDate]))
    await expect(button).toHaveAttribute('data-voice-action', 'agenda:details:' + occurrence.id)
    await expect(button).toHaveAttribute('data-voice-epoch', /.+/)
    await expect(button).toHaveAttribute('aria-label', 'Ver ações de ' + patient.name + ' em ' + occurrence.date + ' às ' + occurrence.start + '–' + occurrence.end)
    await expect(button).toContainText('opção ' + (index + 1))
  }
  await expect(details(page)).toHaveCount(0)
  await unchanged(page, before)
  await page.screenshot({ path: testInfo.outputPath('ocorrencias-homonimas-opcoes-ficticias.png'), fullPage: true })
})

const sorted = occurrences => [...occurrences].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.id.localeCompare(b.id))

async function view(page, name) {
  await page.getByRole('group', { name: 'Visualização da Agenda', exact: true }).getByRole('button', { name, exact: true }).click()
  await page.clock.runFor(32)
  const label = name === 'Mês' ? 'mês' : name.toLowerCase()
  await expect(calendar(page, label)).toBeVisible()
  await expect(page.getByText('Carregando Agenda...', { exact: true })).toHaveCount(0)
  return label
}

async function prepareDetails(page, phrase, id, before, currentView = 'semana') {
  const occurrence = before.occurrences.find(item => item.id === id)
  expect(occurrence).toBeDefined()
  const patient = before.patients.find(item => item.id === occurrence.patientId)
  const option = String(sorted(before.occurrences).findIndex(item => item.id === id) + 1)
  await expect(eventButton(page, id, currentView)).toHaveAttribute('data-voice-appointment-option', option)
  await expect(eventButton(page, id, currentView)).toHaveAttribute('data-voice-appointment-patient-id', patient.id)
  await expect(eventButton(page, id, currentView)).toHaveAttribute('data-voice-appointment-id', id)
  await propose(page, phrase)
  const preview = page.locator('.voice-command-preview')
  await expect(preview).toBeVisible()
  await expect(preview).toContainText(patient.name)
  await expect(preview).toContainText(new RegExp('opção\\s+' + option + '(?:\\D|$)', 'u'))
  const [year, month, day] = occurrence.date.split('-')
  await expect(preview).toContainText(new RegExp(occurrence.date + '|' + day + '/' + month + '/' + year, 'u'))
  await expect(preview).toContainText(occurrence.start)
  await expect(preview).toContainText(occurrence.end)
  for (const item of before.occurrences) await expect(preview).not.toContainText(item.id)
  for (const item of before.series) await expect(preview).not.toContainText(item.id)
  await expect(details(page)).toHaveCount(0)
  await unchanged(page, before)
}

async function exactDetails(page, id, before) {
  const occurrence = before.occurrences.find(item => item.id === id)
  const patient = before.patients.find(item => item.id === occurrence.patientId)
  await expect(details(page)).toBeVisible()
  await expect(details(page).locator('.agenda-detail-list > li')).toHaveCount(1)
  const card = details(page).locator('[id="agenda-detail-' + id + '"]')
  await expect(card).toBeVisible()
  await expect(card).toContainText(patient.name)
  await expect(card).toContainText(occurrence.date + ' · ' + occurrence.start + '–' + occurrence.end)
  if (occurrence.originalDate !== occurrence.date) await expect(card).toContainText('Data original: ' + occurrence.originalDate)
  if (occurrence.wasRescheduled) await expect(card).toContainText('Remarcada')
  if (occurrence.status === 'completed') {
    await expect(card).toContainText('Realizada')
    await expect(card.getByRole('button')).toHaveCount(0)
  }
  for (const other of before.occurrences.filter(item => item.id !== id)) await expect(details(page).locator('[id="agenda-detail-' + other.id + '"]')).toHaveCount(0)
  await unchanged(page, before)
}

async function closeDetails(page, before) {
  await details(page).getByRole('button', { name: 'Fechar detalhes', exact: true }).click()
  await expect(details(page)).toHaveCount(0)
  await unchanged(page, before)
}

async function refuse(page, phrase, before) {
  await propose(page, phrase)
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  await expect(page.locator('.voice-command-error')).toBeVisible()
  await expect(details(page)).toHaveCount(0)
  await unchanged(page, before)
}

for (const name of ['Dia', 'Semana', 'Mês']) {
  test(name + ': pedido direto e Clicar em opção dois só abrem detalhes exatos após confirmar', async ({ page }) => {
    await openApp(page)
    const before = await snapshot(page)
    const currentView = await view(page, name)
    for (const phrase of [
      'Abrir detalhes de Ana Clara opção dois',
      'Clicar em Detalhes de Ana Clara em quatro de outubro de dois mil e vinte e seis às quinze horas opção 2',
    ]) {
      await prepareDetails(page, phrase, 'z-occurrence', before, currentView)
      await confirm(page)
      await exactDetails(page, 'z-occurrence', before)
      await closeDetails(page, before)
    }
  })
}

test('Ver detalhes e Detalhes diretos/por Clicar em preservam completed sem iniciar ou editar', async ({ page }) => {
  await openApp(page)
  const before = await snapshot(page)
  for (const phrase of [
    'Ver detalhes de Ana Clara no dia quatro de outubro de dois mil e vinte e seis às quinze horas opção um',
    'Detalhes de Ana Clara opção 1',
    'Clicar em Abrir detalhes de Ana Clara opção um',
    'Clicar em Ver detalhes de Ana Clara opção 1',
  ]) {
    await prepareDetails(page, phrase, 'a-occurrence', before)
    await confirm(page)
    await exactDetails(page, 'a-occurrence', before)
    await closeDetails(page, before)
  }
})

test('fullmatch e homônimos recusam nome parcial, opção ausente/inválida, qualificadores e extras', async ({ page }) => {
  await openApp(page)
  const before = await snapshot(page)
  for (const phrase of [
    'Abrir detalhes de Ana Clara',
    'Ver detalhes de Ana Clara em quatro de outubro de dois mil e vinte e seis às quinze horas',
    'Detalhes de Ana opção dois',
    'Abrir detalhes de Ana Clara opção zero',
    'Abrir detalhes de Ana Clara opção -2',
    'Abrir detalhes de Ana Clara opção 02',
    'Abrir detalhes de Ana Clara opção 2.0',
    'Abrir detalhes de Ana Clara opção 3',
    'Abrir detalhes de Ana Clara opção dois por favor',
    'Abrir detalhes de Ana Clara opção dois e iniciar sessão',
    'Abrir detalhes de Ana Clara em dois de outubro de dois mil e vinte e seis às quinze horas opção dois',
    'Abrir detalhes de Ana Clara em quatro de outubro de dois mil e vinte e seis às dezesseis horas opção dois',
  ]) await refuse(page, phrase, before)
  await confirm(page)
  await expect(details(page)).toHaveCount(0)
  await unchanged(page, before)
})

test('nome com pontuação interna exige nome completo literal antes do sufixo opção', async ({ page }) => {
  await openApp(page, { names: ['Ana C.', 'Ána C.'] })
  const before = await snapshot(page)
  await refuse(page, 'Abrir detalhes de Ana C opção dois', before)
  await refuse(page, 'Abrir detalhes de Ana C.', before)
  await prepareDetails(page, 'Abrir detalhes de Ana C. opção dois', 'z-occurrence', before)
  await confirm(page)
  await exactDetails(page, 'z-occurrence', before)
  await closeDetails(page, before)
})

test('em/às/opção dois dentro do nome são literais; apenas sufixo extra escolhe ocorrência', async ({ page }) => {
  const name = 'Ana em Casa às Quinze opção dois'
  await openApp(page, { names: [name, 'Ána em Casa às Quinze opção dois'] })
  const before = await snapshot(page)
  // This is the complete homonymous name, not an option-bearing selection.
  await refuse(page, 'Abrir detalhes de ' + name, before)
  await refuse(page, 'Abrir detalhes de Ana em Casa às Quinze opção 2 opção um', before)
  await prepareDetails(page, 'Abrir detalhes de ' + name + ' opção um', 'a-occurrence', before)
  await confirm(page)
  await exactDetails(page, 'a-occurrence', before)
  await closeDetails(page, before)
})

test('não homônimo sem opção e aria-label legado exato continuam válidos', async ({ page }) => {
  await openApp(page, { names: ['Ana Clara', 'Bia Fictícia'] })
  const before = await snapshot(page)
  for (const [phrase, id] of [
    ['Abrir detalhes de Ana Clara', 'a-occurrence'],
    ['Clicar em Ver ações de Bia Fictícia em 2026-10-04 às 15:00–15:50', 'z-occurrence'],
  ]) {
    await propose(page, phrase)
    await expect(page.locator('.voice-command-preview')).toBeVisible()
    await expect(details(page)).toHaveCount(0)
    await unchanged(page, before)
    await confirm(page)
    await exactDetails(page, id, before)
    await closeDetails(page, before)
  }
})

test('ordem global usa data efetiva/horário/id em todos os status e mantém opção nas três views', async ({ page }) => {
  await openApp(page, { extra: true })
  const before = await snapshot(page)
  const expected = ['early-completed', 'a-occurrence', 'z-occurrence', 'late-one-off']
  expect(sorted(before.occurrences).map(item => item.id)).toEqual(expected)
  for (const name of ['Dia', 'Semana', 'Mês']) {
    const currentView = await view(page, name)
    for (const [index, id] of expected.entries()) {
      const button = eventButton(page, id, currentView)
      await expect(button).toBeVisible()
      await expect(button).toHaveAttribute('data-voice-appointment-option', String(index + 1))
      await expect(button).toContainText('opção ' + (index + 1))
    }
    await prepareDetails(page, 'Ver detalhes de Ana Clara opção três', 'z-occurrence', before, currentView)
    await confirm(page)
    await exactDetails(page, 'z-occurrence', before)
    await closeDetails(page, before)
  }
})

test('11 numérico canônico exibido funciona; onze e opção inexistente recusam', async ({ page }) => {
  await openApp(page, { many: true })
  const before = await snapshot(page)
  const target = sorted(before.occurrences)[10]
  expect(target.id).toBe('numbered-11')
  await expect(eventButton(page, target.id)).toHaveAttribute('data-voice-appointment-option', '11')
  await refuse(page, 'Abrir detalhes de Ana Clara opção onze', before)
  await refuse(page, 'Abrir detalhes de Ana Clara opção 12', before)
  await prepareDetails(page, 'Abrir detalhes de Ana Clara opção 11', target.id, before)
  await confirm(page)
  await exactDetails(page, target.id, before)
  await closeDetails(page, before)
})

async function reloadCurrentRange(page) {
  const calls = await page.evaluate(() => window.appointmentOptions.calls.filter(call => call.command === 'agenda_occurrences').length)
  const scope = page.getByRole('region', { name: 'Agenda persistente de sessões', exact: true })
  await scope.getByRole('button', { name: 'Próximo', exact: true }).click()
  await page.clock.runFor(32)
  await scope.getByRole('button', { name: 'Anterior', exact: true }).click()
  await page.clock.runFor(32)
  await expect.poll(() => page.evaluate(() => window.appointmentOptions.calls.filter(call => call.command === 'agenda_occurrences').length)).toBeGreaterThan(calls)
  await expect(page.getByText('Carregando Agenda...', { exact: true })).toHaveCount(0)
  await expect(calendar(page)).toBeVisible()
}

for (const change of ['reload', 'renumber', 'identity', 'space-return']) {
  test('proposta antiga após ' + change + ' recusa sem efeitos; nova proposta aponta identidade atual', async ({ page }) => {
    await openApp(page)
    const before = await snapshot(page)
    await prepareDetails(page, 'Abrir detalhes de Ana Clara opção dois', 'z-occurrence', before)
    if (change === 'renumber') {
      // Change only the read fixture and force real Agenda loading/rendering.
      await page.evaluate(() => {
        const records = window.appointmentOptions.state.occurrences
        records.push({ ...records.find(item => item.id === 'a-occurrence'), id: 'new-earlier', start: '14:00', end: '14:50' })
      })
      await reloadCurrentRange(page)
      await expect(eventButton(page, 'z-occurrence')).toHaveAttribute('data-voice-appointment-option', '3')
    } else if (change === 'identity') {
      await page.evaluate(() => {
        const item = window.appointmentOptions.state.occurrences.find(item => item.id === 'z-occurrence')
        item.originalDate = '2026-10-01'
        item.seriesId = 'replacement-series'
      })
      await reloadCurrentRange(page)
      await expect(eventButton(page, 'z-occurrence')).toHaveAttribute('data-voice-record', JSON.stringify(['occurrence', 'z-occurrence', 'ana-two', 'replacement-series', '2026-10-01']))
    } else if (change === 'space-return') {
      await page.getByRole('button', { name: 'Fechar Agenda', exact: true }).click()
      await expect(calendar(page)).toBeHidden()
      await page.getByRole('navigation', { name: 'Espaços do Círculo', exact: true }).getByRole('button', { name: 'Abrir Agenda', exact: true }).click()
      await page.clock.runFor(32)
      await expect(calendar(page)).toBeVisible()
      await expect(page.locator('.voice-command-preview')).toHaveCount(0)
      await expect(page.locator('.vault-voice-review')).toHaveCount(0)
    } else {
      const epoch = await eventButton(page, 'z-occurrence').getAttribute('data-voice-epoch')
      await reloadCurrentRange(page)
      await expect(eventButton(page, 'z-occurrence')).not.toHaveAttribute('data-voice-epoch', epoch)
    }
    const current = await snapshot(page)
    await confirm(page)
    await expect(details(page)).toHaveCount(0)
    if (change === 'space-return') {
      await expect(assistant(page).getByRole('status')).toHaveText('Não encontrei “Confirmar ação” disponível nesta tela. Abra a área correspondente e diga o texto do botão ou campo.')
    } else await expect(page.getByText(/A tela mudou|Prepare.*novamente/u)).toBeVisible()
    await unchanged(page, current)
    const id = change === 'renumber' ? 'a-occurrence' : 'z-occurrence'
    await prepareDetails(page, 'Abrir detalhes de Ana Clara opção dois', id, current)
    await confirm(page)
    await exactDetails(page, id, current)
    await closeDetails(page, current)
  })
}

test('controles duplicados com identidade/metadados/action/record/epoch/lifecycle iguais deduplicam', async ({ page }) => {
  await openApp(page)
  const before = await snapshot(page)
  await page.evaluate(() => {
    const original = document.querySelector('button[data-voice-action="agenda:details:z-occurrence"]')
    const clone = original.cloneNode(true)
    clone.addEventListener('click', () => original.click())
    original.parentElement.append(clone)
  })
  await expect(eventButton(page, 'z-occurrence')).toHaveCount(2)
  await propose(page, 'Abrir detalhes de Ana Clara opção dois')
  await expect(page.locator('.voice-command-preview')).toContainText('opção 2')
  await expect(details(page)).toHaveCount(0)
  await unchanged(page, before)
  await confirm(page)
  await exactDetails(page, 'z-occurrence', before)
  await closeDetails(page, before)
})

test('sameID com metadados divergentes ou cadeia lifecycle diferente compete e invalida proposta', async ({ page }) => {
  await openApp(page)
  const before = await snapshot(page)
  for (const difference of ['original-date', 'lifecycle']) {
    await prepareDetails(page, 'Abrir detalhes de Ana Clara opção dois', 'z-occurrence', before)
    // DOM competitors are deliberate test controls. Parser and apply remain
    // real; no injected intents or production lifecycle values are overridden.
    await page.evaluate(difference => {
      const original = document.querySelector('button[data-voice-action="agenda:details:z-occurrence"]')
      const host = document.createElement('div')
      host.id = 'appointment-duplicate-host'
      const clone = original.cloneNode(true)
      if (difference === 'original-date') clone.setAttribute('data-voice-appointment-original-date', '2026-10-01')
      else host.setAttribute('data-voice-lifecycle', 'synthetic-divergent-lifecycle')
      host.append(clone)
      original.parentElement.append(host)
    }, difference)
    await confirm(page)
    await expect(details(page)).toHaveCount(0)
    await expect(page.getByText(/A tela mudou|Prepare.*novamente/u)).toBeVisible()
    await unchanged(page, before)
    await refuse(page, 'Abrir detalhes de Ana Clara opção dois', before)
    await page.locator('#appointment-duplicate-host').evaluate(element => element.remove())
  }
})

test('alias concorrente após proposta recusa opção no apply e no próximo preparo', async ({ page }) => {
  await openApp(page)
  const before = await snapshot(page)
  await prepareDetails(page, 'Abrir detalhes de Ana Clara opção dois', 'z-occurrence', before)
  await page.evaluate(() => {
    const button = document.createElement('button')
    button.id = 'appointment-alias-competitor'
    button.type = 'button'
    button.textContent = 'Abrir detalhes de Ana Clara opção dois'
    document.querySelector('[aria-label="Agenda persistente de sessões"]').append(button)
  })
  await confirm(page)
  await expect(details(page)).toHaveCount(0)
  await expect(page.getByText(/A tela mudou|Prepare.*novamente/u)).toBeVisible()
  await unchanged(page, before)
  await refuse(page, 'Abrir detalhes de Ana Clara opção dois', before)
})

test('datas efetivas precedem hora/id e Dia não renumera subconjunto de superset carregado fictício', async ({ page }) => {
  await openApp(page)
  // Explicit edge-case IPC fixture: return a loaded superset even to a Day
  // range request. This proves renderer numbering before visible-date filtering;
  // it does NOT claim the real backend returns out-of-range occurrences.
  await page.evaluate(() => {
    const fixture = window.appointmentOptions
    const records = fixture.state.occurrences
    const firstDateEarlier = { ...records.find(item => item.id === 'z-occurrence'), originalDate: '2026-10-03' }
    const firstDateLater = { ...records.find(item => item.id === 'a-occurrence'), originalDate: '2026-10-02', start: '15:30', end: '16:20' }
    const nextDateFirstId = { ...firstDateLater, id: '0-next-day', date: '2026-10-05', originalDate: '2026-09-25', start: '07:00', end: '07:50' }
    const nextDateSecondId = { ...firstDateEarlier, id: '1-next-day', date: '2026-10-05', originalDate: '2026-09-24', start: '07:00', end: '07:50' }
    records.splice(0, records.length, nextDateSecondId, firstDateLater, nextDateFirstId, firstDateEarlier)
    fixture.loadedSuperset = true
  })
  const before = await snapshot(page)
  const expected = ['z-occurrence', 'a-occurrence', '0-next-day', '1-next-day']
  const ordered = sorted(before.occurrences)
  expect(ordered.map(item => item.id)).toEqual(expected)
  expect(ordered.map(item => item.originalDate)).toEqual(['2026-10-03', '2026-10-02', '2026-09-25', '2026-09-24'])
  expect(ordered.map(item => item.date)).toEqual(['2026-10-04', '2026-10-04', '2026-10-05', '2026-10-05'])
  // Earlier effective date beats 07:00 and smaller ID on the next date;
  // 15:00 beats 15:30 despite z/a ID order; same date/time breaks ties by ID.
  await reloadCurrentRange(page)
  for (const name of ['Semana', 'Mês']) {
    const currentView = await view(page, name)
    for (const [index, id] of expected.entries()) {
      await expect(eventButton(page, id, currentView)).toBeVisible()
      await expect(eventButton(page, id, currentView)).toHaveAttribute('data-voice-appointment-option', String(index + 1))
    }
    await unchanged(page, before)
  }
  await page.getByLabel('Data de referência').fill('2026-10-05')
  const currentView = await view(page, 'Dia')
  await expect(page.getByLabel('Data de referência')).toHaveValue('2026-10-05')
  const request = await page.evaluate(() => window.appointmentOptions.calls.filter(call => call.command === 'agenda_occurrences').at(-1))
  expect(request.args).toMatchObject({ from: '2026-10-05', to: '2026-10-05' })
  await expect(calendar(page, currentView).locator('button[data-voice-action^="agenda:details:"]')).toHaveCount(2)
  await expect(eventButton(page, 'z-occurrence', currentView)).toHaveCount(0)
  await expect(eventButton(page, 'a-occurrence', currentView)).toHaveCount(0)
  for (const [id, option] of [['0-next-day', '3'], ['1-next-day', '4']]) {
    await expect(eventButton(page, id, currentView)).toBeVisible()
    await expect(eventButton(page, id, currentView)).toHaveAttribute('data-voice-appointment-option', option)
    await expect(eventButton(page, id, currentView)).toContainText('opção ' + option)
  }
  await prepareDetails(page, 'Abrir detalhes de Ana Clara opção três', '0-next-day', before, currentView)
  await confirm(page)
  await exactDetails(page, '0-next-day', before)
  await closeDetails(page, before)
})
