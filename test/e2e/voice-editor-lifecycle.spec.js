import { expect, test } from '@playwright/test'

const assistant = page => page.getByRole('region', { name: 'Comando do Círculo' })
const preview = page => page.locator('.voice-command-preview')
const contextForm = page => page.getByRole('form', { name: 'Nova revisão do contexto do caso', exact: true })
const contextPanel = page => page.locator('details:has(form[aria-label="Nova revisão do contexto do caso"])')
const libraryForm = page => page.getByRole('form', { name: 'Comportamento reutilizável', exact: true })
const occurrenceForm = page => page.getByRole('form', { name: 'Alterar ocorrência individual', exact: true })
const snapshot = page => page.evaluate(() => structuredClone(window.editorLifecycle.state))

// Real App/DesktopVault, real generic parser and confirmation/apply path.
// Only native persistence is mocked, with cloned reads and unknown IPC throwing.
// No actual vault/profile, native media, injected intents or DOM fingerprints.
async function openApp(page, { contextSaveInput = null } = {}) {
  const time = new Date('2026-10-04T15:00:00Z')
  await page.clock.install({ time })
  await page.clock.pauseAt(time)
  await page.addInitScript(({ contextSaveInput }) => {
    const clone = value => structuredClone(value)
    const patients = [
      { id: 'ana', name: 'Ana Clara', age: 8, revision: 1, preferredModality: 'Presencial', archivedAt: null },
      { id: 'bia', name: 'Bia Fictícia', age: 9, revision: 1, preferredModality: 'Online', archivedAt: null },
    ]
    const behaviors = [
      { id: 'behavior-one', title: 'Pede ajuda', description: 'Descrição fictícia original', version: 1, archivedAt: null },
      { id: 'behavior-other', title: 'Espera a vez', description: 'Descrição concorrente preservada', version: 1, archivedAt: null },
    ]
    const contexts = patients.map(patient => ({
      id: `context-${patient.id}`, patientId: patient.id, recordedAt: '2026-10-03T18:00:00Z',
      demand: `Contexto persistido fictício ${patient.id}`, objectives: `Objetivos persistidos fictícios ${patient.id}`,
    }))
    const sessions = patients.map(patient => ({
      id: `final-${patient.id}`, patientId: patient.id, seriesId: `completed-${patient.id}`,
      originalDate: '2026-10-02', sessionDate: '2026-10-03', start: '15:00', end: '15:50',
      modality: 'Presencial', observation: `Observação fictícia imutável ${patient.id}`,
      procedures: 'Procedimentos fictícios', outcomeDecision: 'Resultado fictício', referralClosure: 'Encaminhamento fictício',
      behaviors: [], indicators: [], recordedAt: '2026-10-03T19:00:00Z',
    }))
    const addenda = [{ id: 'addendum-existing', sessionId: 'final-ana', patientId: 'ana', content: 'Adendo anterior fictício intacto', createdAt: '2026-10-03T20:00:00Z' }]
    const occurrences = [{ id: 'occ-ana', seriesId: 'series-ana', patientId: 'ana', originalDate: '2026-10-02', date: '2026-10-04', start: '15:00', end: '15:50', status: 'scheduled', frequency: 'Avulsa', modality: 'Presencial', meetingLink: null, wasRescheduled: true }]
    const series = [{ id: 'series-ana', patientId: 'ana', frequency: 'Avulsa', weekday: 5, startDate: '2026-10-02', endDate: '2026-10-02', start: '15:00', end: '15:50', modality: 'Presencial', meetingLink: null, timeZone: 'America/Sao_Paulo', revision: 1 }]
    const history = [{ id: 'move-ana', seriesId: 'series-ana', action: 'reschedule', originalDate: '2026-10-02', effectiveDate: '2026-10-04', start: '15:00', end: '15:50', reason: 'Motivo fictício persistido' }]
    const fixture = window.editorLifecycle = {
      state: { patients, behaviors, contexts, sessions, addenda, occurrences, series, history, drafts: [] },
      calls: [], writes: [], unexpected: [], catalogReady: false,
    }
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
      if (command === 'behavior_list') return catalog(command, behaviors)
      if (command === 'indicator_catalog') return catalog(command, [])
      if (command === 'session_draft_list') return clone(fixture.state.drafts.filter(item => item.patientId === args.patientId))
      if (command === 'session_timeline') return clone(sessions.filter(item => item.patientId === args.patientId))
      if (command === 'session_addendum_list') return clone(addenda.filter(item => item.patientId === args.patientId))
      if (command === 'case_context_list') return clone(contexts.filter(item => item.patientId === args.patientId))
      if (command === 'agenda_list_series') return clone(series)
      if (command === 'agenda_history') return clone(history)
      if (command === 'agenda_occurrences') return clone(occurrences.filter(item => item.date >= args.from && item.date <= args.to))
      if (command === 'related_party_list') return []
      if (command === 'case_context_create' && contextSaveInput !== null && fixture.writes.length === 0
        && JSON.stringify(args) === JSON.stringify(contextSaveInput)) {
        fixture.writes.push(clone({ command, args }))
        const saved = { id: 'context-reload-ana', ...clone(args), recordedAt: '2026-10-04T16:00:00Z' }
        contexts.unshift(saved)
        return clone(saved)
      }
      fixture.unexpected.push(command)
      if (/(?:create|update|save|start|cancel|finalize|reschedule|archive|restore)/.test(command)) fixture.writes.push(clone({ command, args }))
      throw new Error(`IPC sem fixture: ${command}`)
    } }
  }, { contextSaveInput })
  await page.goto('/')
  await expect(assistant(page)).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.editorLifecycle.catalogReady)).toBe(true)
  await expect(page.locator('.vault-home-preview')).toContainText('Ana Clara')
  await page.clock.runFor(32)
}

async function propose(page, text, literal) {
  await assistant(page).getByLabel('Seu comando').fill(text)
  await assistant(page).getByRole('button', { name: 'Preparar rascunho' }).click()
  await expect(preview(page)).toBeVisible()
  if (literal) await expect(preview(page)).toContainText(literal)
}

async function confirm(page) {
  await assistant(page).getByLabel('Seu comando').fill('confirmar')
  await assistant(page).getByRole('button', { name: 'Preparar rascunho' }).click()
  await page.clock.runFor(32)
  await expect(preview(page)).toHaveCount(0)
}

async function command(page, text) {
  await propose(page, text)
  await confirm(page)
}

async function unchanged(page, before) {
  expect(await snapshot(page)).toEqual(before)
  expect(await page.evaluate(() => window.editorLifecycle.writes)).toEqual([])
  expect(await page.evaluate(() => window.editorLifecycle.unexpected)).toEqual([])
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(page.getByRole('form', { name: 'Rascunho de sessão', exact: true })).toHaveCount(0)
}

async function openContext(page) {
  await command(page, 'Abrir contexto do caso de Ana Clara')
  await expect(contextForm(page)).toBeVisible()
  await expect(contextPanel(page)).toContainText('Contexto persistido fictício ana')
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue('ana')
  await expect(contextForm(page).getByLabel('Demanda avaliada', { exact: true })).toHaveValue('')
}

async function selectPatientLoaded(page, id) {
  const count = await page.evaluate(() => window.editorLifecycle.calls.filter(call => call.command === 'case_context_list').length)
  await page.getByLabel('Paciente para evolução e sessões').selectOption(id)
  await expect.poll(() => page.evaluate(({ count, id }) => {
    const calls = window.editorLifecycle.calls.filter(call => call.command === 'case_context_list')
    return calls.length > count && calls.at(-1).args.patientId === id
  }, { count, id })).toBe(true)
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue(id)
  await expect(contextPanel(page)).toContainText(`Contexto persistido fictício ${id}`)
  // Reopen only by a real click, never a new assistant proposal that would
  // replace the old fill intent being exercised.
  if (!await contextPanel(page).evaluate(element => element.open)) await contextPanel(page).locator('summary').click()
  await expect(contextForm(page)).toBeVisible()
  await expect(contextForm(page).getByLabel('Demanda avaliada', { exact: true })).toBeEnabled()
  await page.clock.runFor(32)
}

async function expectRefused(page) {
  await expect(page.getByText(/A tela mudou\. Prepare o comando novamente antes de aplicar\./u)).toBeVisible()
}

test.beforeEach(async ({ page, baseURL }) => {
  const unexpected = []
  page.on('dialog', async dialog => { unexpected.push(`native dialog: ${dialog.type()}`); await dialog.dismiss() })
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) await route.continue()
    else { unexpected.push(route.request().url()); await route.abort() }
  })
  page.editorLifecycleBoundary = unexpected
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.editorLifecycle?.unexpected || [])).toEqual([])
  expect(page.editorLifecycleBoundary).toEqual([])
})

for (const returnToAna of [true, false]) {
  test(`contexto sem activeDraft: proposta Ana → Bia${returnToAna ? ' → Ana' : ' (guarda direta)'} deve ser recusada`, async ({ page }) => {
    await openApp(page)
    await openContext(page)
    const before = await snapshot(page)
    const text = 'DEMANDA FICTÍCIA ANTIGA NÃO APLICAR'
    await propose(page, `Preencher Demanda avaliada com ${text}`, text)
    await expect(contextForm(page).getByLabel('Demanda avaliada', { exact: true })).toHaveValue('')
    await unchanged(page, before)
    await selectPatientLoaded(page, 'bia')
    if (returnToAna) await selectPatientLoaded(page, 'ana')
    await confirm(page)
    await expect(contextForm(page).getByLabel('Demanda avaliada', { exact: true })).toHaveValue('')
    await expect(contextForm(page).getByLabel('Objetivos de trabalho', { exact: true })).toHaveValue('')
    await expectRefused(page)
    await page.clock.runFor(1200)
    await unchanged(page, before)
  })
}

test('biblioteca: cancelar e reabrir o mesmo template/versão invalida fill antigo', async ({ page }) => {
  await openApp(page)
  await command(page, 'Abrir registros de Ana Clara')
  await command(page, 'Clicar em Biblioteca de comportamentos reutilizáveis')
  const edit = page.getByRole('button', { name: 'Editar comportamento Pede ajuda', exact: true })
  await edit.click()
  await expect(libraryForm(page)).toHaveAttribute('data-voice-record', 'behavior:behavior-one')
  const before = await snapshot(page)
  const originalVersion = before.behaviors[0].version
  await propose(page, 'Preencher Descrição opcional com DESCRIÇÃO ANTIGA NÃO APLICAR', 'DESCRIÇÃO ANTIGA NÃO APLICAR')
  await expect(page.locator('#behavior-description')).toHaveValue(before.behaviors[0].description)
  await unchanged(page, before)
  await libraryForm(page).getByRole('button', { name: 'Cancelar edição', exact: true }).click()
  await expect(libraryForm(page)).toHaveAttribute('data-voice-record', 'behavior:new')
  await expect(page.locator('#behavior-description')).toHaveValue('')
  await edit.click()
  await expect(libraryForm(page)).toHaveAttribute('data-voice-record', 'behavior:behavior-one')
  expect((await snapshot(page)).behaviors[0].version).toBe(originalVersion)
  await confirm(page)
  await expect(page.locator('#behavior-description')).toHaveValue(before.behaviors[0].description)
  await expect(page.locator('#behavior-title')).toHaveValue(before.behaviors[0].title)
  await expectRefused(page)
  await page.clock.runFor(1200)
  await unchanged(page, before)
})

test('adendo: cancelar e reabrir a mesma sessão finalizada invalida fill antigo', async ({ page }) => {
  await openApp(page)
  await command(page, 'Adicionar adendo à sessão de Ana Clara de 03/10/2026 às 15:00')
  const card = page.locator('li[data-voice-record="session:final-ana"]')
  const editor = page.locator('#addendum-final-ana')
  await expect(editor).toBeVisible()
  const before = await snapshot(page)
  await propose(page, 'Preencher Texto do adendo com ADENDO ANTIGO NÃO APLICAR', 'ADENDO ANTIGO NÃO APLICAR')
  await expect(editor).toHaveValue('')
  await unchanged(page, before)
  await card.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(editor).toHaveCount(0)
  await card.getByRole('button', { name: 'Adicionar adendo', exact: true }).click()
  await expect(editor).toBeVisible()
  await confirm(page)
  await expect(editor).toHaveValue('')
  await expect(card.getByRole('button', { name: 'Salvar adendo imutável', exact: true })).toBeDisabled()
  await expectRefused(page)
  await page.clock.runFor(1200)
  await unchanged(page, before)
})

test('motivo administrativo: fechar e reabrir a mesma ocorrência invalida fill antigo', async ({ page }) => {
  await openApp(page)
  await command(page, 'Remarcar sessão de Ana Clara hoje às quinze horas')
  await expect(occurrenceForm(page)).toBeVisible()
  await expect(occurrenceForm(page)).toHaveAttribute('data-voice-record', 'series-ana:2026-10-02')
  const before = await snapshot(page)
  await propose(page, 'Preencher Motivo administrativo com MOTIVO ANTIGO NÃO APLICAR', 'MOTIVO ANTIGO NÃO APLICAR')
  await expect(page.locator('#agenda-reason')).toHaveValue('')
  await unchanged(page, before)
  await occurrenceForm(page).getByRole('button', { name: 'Fechar', exact: true }).click()
  await expect(occurrenceForm(page)).toHaveCount(0)
  const alter = page.getByRole('region', { name: 'Calendário dia', exact: true }).getByRole('button', { name: 'Alterar ocorrência de Ana Clara em 2026-10-04 às 15:00–15:50', exact: true })
  await expect(alter).toBeEnabled()
  await alter.click()
  await expect(occurrenceForm(page)).toBeVisible()
  await expect(occurrenceForm(page)).toHaveAttribute('data-voice-record', 'series-ana:2026-10-02')
  await confirm(page)
  await expect(page.locator('#agenda-reason')).toHaveValue('')
  await expect(page.locator('#agenda-new-date')).toHaveValue('2026-10-04')
  await expect(page.locator('#agenda-new-start')).toHaveValue('15:00')
  await expect(page.locator('#agenda-new-end')).toHaveValue('15:50')
  await expectRefused(page)
  await page.clock.runFor(1200)
  await unchanged(page, before)
})

test('adendo: reload do mesmo paciente após Save do contexto recusa proposta antiga e aceita nova', async ({ page }) => {
  const input = {
    patientId: 'ana', demand: 'Demanda fictícia legítima para reload', objectives: 'Objetivos fictícios legítimos para reload',
  }
  await openApp(page, { contextSaveInput: input })
  await openContext(page)
  await command(page, 'Adicionar adendo à sessão de Ana Clara de 03/10/2026 às 15:00')
  const card = page.locator('li[data-voice-record="session:final-ana"]')
  const editor = page.locator('#addendum-final-ana')
  await expect(editor).toBeVisible()
  await expect(editor).toHaveValue('')
  const before = await snapshot(page)
  const oldText = 'ADENDO FICTÍCIO ANTIGO NÃO APLICAR APÓS RELOAD'
  await propose(page, `Preencher Texto do adendo com ${oldText}`, oldText)
  await expect(editor).toHaveValue('')
  await unchanged(page, before)

  // Use the actual non-voice Save button so the old assistant fill proposal
  // remains pending. This calls Sessions.reload('ana'), not a patient cycle,
  // editor close/reopen, remount or artificially injected epoch change.
  await contextForm(page).getByLabel('Demanda avaliada', { exact: true }).fill(input.demand)
  await contextForm(page).getByLabel('Objetivos de trabalho', { exact: true }).fill(input.objectives)
  await expect(editor).toHaveValue('')
  await unchanged(page, before)
  const loadCount = await page.evaluate(() => window.editorLifecycle.calls.filter(call => call.command === 'session_timeline').length)
  await contextForm(page).getByRole('button', { name: 'Salvar nova revisão do contexto', exact: true }).click()
  const expectedWrite = { command: 'case_context_create', args: input }
  await expect.poll(() => page.evaluate(() => window.editorLifecycle.writes)).toEqual([expectedWrite])
  await expect.poll(() => page.evaluate(count => {
    const calls = window.editorLifecycle.calls.filter(call => call.command === 'session_timeline')
    return calls.length > count && calls.at(-1).args.patientId === 'ana'
  }, loadCount)).toBe(true)
  await expect(contextPanel(page)).toContainText(input.demand)
  await expect(contextForm(page).getByLabel('Demanda avaliada', { exact: true })).toHaveValue('')
  await expect(contextForm(page).getByLabel('Objetivos de trabalho', { exact: true })).toHaveValue('')
  await expect(contextForm(page).getByRole('button', { name: 'Salvar nova revisão do contexto', exact: true })).toBeDisabled()
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue('ana')
  await expect(editor).toBeVisible()
  await expect(editor).toBeEnabled()
  await expect(editor).toHaveValue('')
  const afterSave = {
    ...before, contexts: [{ id: 'context-reload-ana', ...input, recordedAt: '2026-10-04T16:00:00Z' }, ...before.contexts],
  }
  expect(await snapshot(page)).toEqual(afterSave)

  await confirm(page)
  await expect(editor).toHaveValue('')
  await expect(card.getByRole('button', { name: 'Salvar adendo imutável', exact: true })).toBeDisabled()
  await expectRefused(page)
  await page.clock.runFor(1200)
  expect(await snapshot(page)).toEqual(afterSave)
  expect(await page.evaluate(() => window.editorLifecycle.writes)).toEqual([expectedWrite])

  const newText = 'ADENDO FICTÍCIO NOVO APÓS RELOAD VÁLIDO'
  await propose(page, `Preencher Texto do adendo com ${newText}`, newText)
  await expect(editor).toHaveValue('')
  expect(await snapshot(page)).toEqual(afterSave)
  expect(await page.evaluate(() => window.editorLifecycle.writes)).toEqual([expectedWrite])
  await confirm(page)
  await expect(editor).toHaveValue(newText)
  await expect(card.getByRole('button', { name: 'Salvar adendo imutável', exact: true })).toBeEnabled()
  await page.clock.runFor(1200)
  await expect(editor).toHaveValue(newText)
  expect(await snapshot(page)).toEqual(afterSave)
  expect(await page.evaluate(() => window.editorLifecycle.writes)).toEqual([expectedWrite])
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(page.getByRole('form', { name: 'Rascunho de sessão', exact: true })).toHaveCount(0)
})
