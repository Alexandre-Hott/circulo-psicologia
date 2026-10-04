import { expect, test } from '@playwright/test'

const assistant = page => page.getByRole('region', { name: 'Comando do Círculo' })
const preview = page => page.locator('.voice-command-preview')
const contextForm = page => page.getByRole('form', { name: 'Nova revisão do contexto do caso', exact: true })
const contextPanel = page => page.locator('details:has(form[aria-label="Nova revisão do contexto do caso"])')
const libraryForm = page => page.getByRole('form', { name: 'Comportamento reutilizável', exact: true })
const occurrenceForm = page => page.getByRole('form', { name: 'Alterar ocorrência individual', exact: true })
const snapshot = page => page.evaluate(() => structuredClone(window.textareaMultiline.state))

// Real App/DesktopVault, real generic parser and confirmation/apply path.
// Only native persistence is mocked, with cloned reads and unknown IPC throwing.
// No actual vault/profile, native media, injected intents or DOM fingerprints.
async function openApp(page) {
  const time = new Date('2026-10-04T15:00:00Z')
  await page.clock.install({ time })
  await page.clock.pauseAt(time)
  await page.addInitScript(() => {
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
    const indicators = [{ id: 'indicator-regulation', name: 'Regulação emocional', definition: 'Definição fictícia', version: 1, labels: ['Ainda não observado', 'Com muito apoio', 'Com algum apoio', 'Com autonomia'] }]
    const drafts = [
      { id: 'draft-ana', patientId: 'ana', seriesId: 'draft-series', originalDate: '2026-10-04', observation: 'Observação fictícia preservada', procedures: 'Procedimentos fictícios preservados', outcomeDecision: 'Resultado fictício preservado', referralClosure: 'Encaminhamento fictício preservado', behaviorIds: [], indicators: [{ id: 'indicator-regulation', value: 2, note: 'Nota fictícia preservada' }] },
      { id: 'draft-other', patientId: 'ana', seriesId: 'draft-series-other', originalDate: '2026-10-03', observation: 'Outro draft fictício intacto', procedures: '', outcomeDecision: '', referralClosure: '', behaviorIds: [], indicators: [] },
      { id: 'draft-bia', patientId: 'bia', seriesId: 'draft-series-bia', originalDate: '2026-10-04', observation: 'Draft concorrente fictício de Bia', procedures: '', outcomeDecision: '', referralClosure: '', behaviorIds: [], indicators: [] },
    ]
    const fixture = window.textareaMultiline = {
      state: { patients, behaviors, contexts, sessions, addenda, occurrences, series, history, drafts, indicators },
      calls: [], writes: [], unexpected: [], catalogReady: false, saveAllowed: false,
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
      if (command === 'indicator_catalog') return catalog(command, indicators)
      if (command === 'session_draft_list') return clone(fixture.state.drafts.filter(item => item.patientId === args.patientId))
      if (command === 'session_timeline') return clone(sessions.filter(item => item.patientId === args.patientId))
      if (command === 'session_addendum_list') return clone(addenda.filter(item => item.patientId === args.patientId))
      if (command === 'case_context_list') return clone(contexts.filter(item => item.patientId === args.patientId))
      if (command === 'agenda_list_series') return clone(series)
      if (command === 'agenda_history') return clone(history)
      if (command === 'agenda_occurrences') return clone(occurrences.filter(item => item.date >= args.from && item.date <= args.to))
      if (command === 'related_party_list') return []
      if (['case_context_create', 'behavior_update', 'session_addendum_create', 'session_draft_save', 'agenda_reschedule'].includes(command)) {
        fixture.writes.push(clone({ command, args }))
        if (!fixture.saveAllowed) { fixture.unexpected.push(command); throw new Error('Write antes do Save explícito') }
        fixture.saveAllowed = false
        if (command === 'case_context_create') {
          const item = { id: 'context-new', ...clone(args), recordedAt: '2026-10-04T16:00:00Z' }
          contexts.unshift(item); return clone(item)
        }
        if (command === 'behavior_update') {
          const item = behaviors.find(item => item.id === args.id && item.version === args.version)
          if (!item) throw new Error('Identidade/versão incorreta')
          Object.assign(item, { title: args.title, description: args.description, version: item.version + 1 })
          return clone(item)
        }
        if (command === 'session_addendum_create') {
          const item = { id: 'addendum-new', ...clone(args), createdAt: '2026-10-04T16:00:00Z' }
          addenda.push(item); return clone(item)
        }
        if (command === 'session_draft_save') {
          const item = drafts.find(item => item.id === args.id)
          if (!item) throw new Error('Draft incorreto')
          Object.assign(item, clone(args.input)); return clone(item)
        }
        const item = occurrences.find(item => item.seriesId === args.seriesId && item.originalDate === args.originalDate)
        if (!item) throw new Error('Ocorrência incorreta')
        Object.assign(item, { date: args.input.date, start: args.input.start, end: args.input.end })
        const itemHistory = { id: 'move-new', seriesId: args.seriesId, originalDate: args.originalDate, action: 'reschedule', effectiveDate: args.input.date, start: args.input.start, end: args.input.end, reason: args.input.reason }
        history.push(itemHistory); return clone(itemHistory)
      }
      fixture.unexpected.push(command)
      if (/(?:create|update|save|start|cancel|finalize|reschedule|archive|restore)/.test(command)) fixture.writes.push(clone({ command, args }))
      throw new Error(`IPC sem fixture: ${command}`)
    } }
  })
  await page.goto('/')
  await expect(assistant(page)).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.textareaMultiline.catalogReady)).toBe(true)
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
  expect(await page.evaluate(() => window.textareaMultiline.writes)).toEqual([])
  expect(await page.evaluate(() => window.textareaMultiline.unexpected)).toEqual([])
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
}

async function openContext(page) {
  await command(page, 'Abrir contexto do caso de Ana Clara')
  await expect(contextForm(page)).toBeVisible()
  await expect(contextPanel(page)).toContainText('Contexto persistido fictício ana')
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue('ana')
  await expect(contextForm(page).getByLabel('Demanda avaliada', { exact: true })).toHaveValue('')
}

async function selectPatientLoaded(page, id) {
  const count = await page.evaluate(() => window.textareaMultiline.calls.filter(call => call.command === 'case_context_list').length)
  await page.getByLabel('Paciente para evolução e sessões').selectOption(id)
  await expect.poll(() => page.evaluate(({ count, id }) => {
    const calls = window.textareaMultiline.calls.filter(call => call.command === 'case_context_list')
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
  page.textareaMultilineBoundary = unexpected
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.textareaMultiline?.unexpected || [])).toEqual([])
  expect(page.textareaMultilineBoundary).toEqual([])
})

const draftForm = page => page.getByRole('form', { name: 'Rascunho de sessão', exact: true })
const controls = [
  { kind: 'demand', selector: '#case-demand', label: 'Demanda avaliada', limit: 4000 },
  { kind: 'objectives', selector: '#case-objectives', label: 'Objetivos de trabalho', limit: 4000 },
  { kind: 'library', selector: '#behavior-description', label: 'Descrição opcional', limit: 1000 },
  { kind: 'indicator', selector: '#indicator-note-indicator-regulation', label: 'Nota contextual de Regulação emocional', limit: 500 },
  { kind: 'addendum', selector: '#addendum-final-ana', label: 'Texto do adendo', limit: 4000 },
  { kind: 'reason', selector: '#agenda-reason', label: 'Motivo administrativo', limit: 240 },
]
const canonical = text => text.replace(/\r\n?/g, '\n')
const request = (control, text) => 'Preencher ' + control.label + ' com ' + text
const boundary = length => 'Ána  literal\nnão abrir Agenda\n' + 'B'.repeat(length - 'Ána  literal\nnão abrir Agenda\n'.length - 3) + 'FIM'

async function selectDraft(page, id) {
  const drawer = page.locator('#session-other-drafts')
  await expect(drawer).toBeVisible()
  if (!await drawer.evaluate(element => element.open)) await drawer.locator('summary').click()
  const resume = drawer.locator('button[data-voice-record="draft:' + id + '"]')
  await expect(resume).toBeEnabled()
  await resume.click()
  await expect(draftForm(page)).toHaveAttribute('data-voice-record', id)
}

async function setupControl(page, control) {
  if (['demand', 'objectives'].includes(control.kind)) await openContext(page)
  else if (control.kind === 'reason') {
    await command(page, 'Remarcar sessão de Ana Clara hoje às quinze horas')
    await expect(occurrenceForm(page)).toHaveAttribute('data-voice-record', 'series-ana:2026-10-02')
  } else if (control.kind === 'addendum') {
    await command(page, 'Adicionar adendo à sessão de Ana Clara de 03/10/2026 às 15:00')
  } else {
    await command(page, 'Abrir registros de Ana Clara')
    if (control.kind === 'library') {
      await command(page, 'Clicar em Biblioteca de comportamentos reutilizáveis')
      await page.getByRole('button', { name: 'Editar comportamento Pede ajuda', exact: true }).click()
      await expect(libraryForm(page)).toHaveAttribute('data-voice-record', 'behavior:behavior-one')
    } else await selectDraft(page, 'draft-ana')
  }
  await expect(page.locator(control.selector)).toBeEnabled()
  await expect(page.locator(control.selector)).toHaveAttribute('maxlength', String(control.limit))
}

async function resetSameEditor(page, control) {
  if (['demand', 'objectives'].includes(control.kind)) {
    await selectPatientLoaded(page, 'bia')
    await selectPatientLoaded(page, 'ana')
  } else if (control.kind === 'library') {
    await libraryForm(page).getByRole('button', { name: 'Cancelar edição', exact: true }).click()
    await expect(libraryForm(page)).toHaveAttribute('data-voice-record', 'behavior:new')
    await page.getByRole('button', { name: 'Editar comportamento Pede ajuda', exact: true }).click()
    await expect(libraryForm(page)).toHaveAttribute('data-voice-record', 'behavior:behavior-one')
  } else if (control.kind === 'addendum') {
    const card = page.locator('li[data-voice-record="session:final-ana"]')
    await card.getByRole('button', { name: 'Cancelar', exact: true }).click()
    await expect(page.locator(control.selector)).toHaveCount(0)
    await card.getByRole('button', { name: 'Adicionar adendo', exact: true }).click()
  } else if (control.kind === 'reason') {
    await occurrenceForm(page).getByRole('button', { name: 'Fechar', exact: true }).click()
    await expect(occurrenceForm(page)).toHaveCount(0)
    await page.getByRole('region', { name: 'Calendário dia', exact: true }).getByRole('button', { name: 'Alterar ocorrência de Ana Clara em 2026-10-04 às 15:00–15:50', exact: true }).click()
    await expect(occurrenceForm(page)).toHaveAttribute('data-voice-record', 'series-ana:2026-10-02')
  } else {
    await selectDraft(page, 'draft-other')
    await selectDraft(page, 'draft-ana')
  }
  await expect(page.locator(control.selector)).toBeEnabled()
}

async function preservedLocalNeighbors(page, control, before) {
  if (['demand', 'objectives'].includes(control.kind)) {
    await expect(contextForm(page).getByLabel(control.kind === 'demand' ? 'Objetivos de trabalho' : 'Demanda avaliada', { exact: true })).toHaveValue('')
  } else if (control.kind === 'library') {
    await expect(page.locator('#behavior-title')).toHaveValue(before.behaviors[0].title)
  } else if (control.kind === 'indicator') {
    const original = before.drafts[0]
    for (const [id, key] of [['session-observation', 'observation'], ['session-procedures', 'procedures'], ['session-outcome-decision', 'outcomeDecision'], ['session-referral-closure', 'referralClosure']]) {
      await expect(page.locator('#' + id)).toHaveValue(original[key])
    }
    await expect(page.locator('#indicator-indicator-regulation')).toHaveValue('2')
  } else if (control.kind === 'addendum') {
    await expect(page.locator('li[data-voice-record="session:final-ana"]')).toContainText(before.sessions[0].observation)
    await expect(page.locator('#addendum-final-bia')).toHaveCount(0)
  } else {
    await expect(page.locator('#agenda-new-date')).toHaveValue('2026-10-04')
    await expect(page.locator('#agenda-new-start')).toHaveValue('15:00')
    await expect(page.locator('#agenda-new-end')).toHaveValue('15:50')
  }
}

async function saveExplicit(page, control, value, before) {
  const expectedState = structuredClone(before)
  let expectedWrite
  if (['demand', 'objectives'].includes(control.kind)) {
    const companion = control.kind === 'demand' ? '#case-objectives' : '#case-demand'
    const companionValue = 'Outro campo fictício\nLiteral preservado'
    await page.locator(companion).fill(companionValue)
    const input = { patientId: 'ana', demand: control.kind === 'demand' ? value : companionValue, objectives: control.kind === 'objectives' ? value : companionValue }
    expectedWrite = { command: 'case_context_create', args: input }
    expectedState.contexts.unshift({ id: 'context-new', ...input, recordedAt: '2026-10-04T16:00:00Z' })
    await page.evaluate(() => { window.textareaMultiline.saveAllowed = true })
    await contextForm(page).getByRole('button', { name: 'Salvar nova revisão do contexto', exact: true }).click()
  } else if (control.kind === 'library') {
    const original = before.behaviors[0]
    expectedWrite = { command: 'behavior_update', args: { id: original.id, version: original.version, title: original.title, description: value } }
    Object.assign(expectedState.behaviors[0], { description: value, version: original.version + 1 })
    await page.evaluate(() => { window.textareaMultiline.saveAllowed = true })
    await libraryForm(page).getByRole('button', { name: 'Salvar versão do comportamento', exact: true }).click()
  } else if (control.kind === 'indicator') {
    const original = before.drafts[0]
    const input = { observation: original.observation, procedures: original.procedures, outcomeDecision: original.outcomeDecision, referralClosure: original.referralClosure, behaviorIds: original.behaviorIds, indicators: [{ ...original.indicators[0], note: value }] }
    expectedWrite = { command: 'session_draft_save', args: { id: 'draft-ana', input } }
    Object.assign(expectedState.drafts[0], input)
    await page.evaluate(() => { window.textareaMultiline.saveAllowed = true })
    await draftForm(page).getByRole('button', { name: 'Salvar rascunho', exact: true }).click()
  } else if (control.kind === 'addendum') {
    const input = { sessionId: 'final-ana', patientId: 'ana', content: value }
    expectedWrite = { command: 'session_addendum_create', args: input }
    expectedState.addenda.push({ id: 'addendum-new', ...input, createdAt: '2026-10-04T16:00:00Z' })
    await page.evaluate(() => { window.textareaMultiline.saveAllowed = true })
    await page.locator('li[data-voice-record="session:final-ana"]').getByRole('button', { name: 'Salvar adendo imutável', exact: true }).click()
  } else {
    const input = { date: '2026-10-04', start: '15:00', end: '15:50', reason: value }
    expectedWrite = { command: 'agenda_reschedule', args: { seriesId: 'series-ana', originalDate: '2026-10-02', input } }
    expectedState.history.push({ id: 'move-new', seriesId: 'series-ana', originalDate: '2026-10-02', action: 'reschedule', effectiveDate: input.date, start: input.start, end: input.end, reason: value })
    await occurrenceForm(page).getByRole('button', { name: 'Confirmar remarcação individual', exact: true }).click()
    const dialog = page.getByRole('alertdialog', { name: 'Confirmar ação', exact: true })
    await expect(dialog).toBeVisible()
    expect(await page.evaluate(() => window.textareaMultiline.writes)).toEqual([])
    await page.evaluate(() => { window.textareaMultiline.saveAllowed = true })
    await dialog.getByRole('button', { name: 'Confirmar ação', exact: true }).click()
  }
  await expect.poll(() => page.evaluate(() => window.textareaMultiline.writes)).toEqual([expectedWrite])
  expect(await snapshot(page)).toEqual(expectedState)
  await page.clock.runFor(1200)
  expect(await page.evaluate(() => window.textareaMultiline.writes)).toEqual([expectedWrite])
  expect(await snapshot(page)).toEqual(expectedState)
}

for (const control of controls) {
  test(control.kind + ': reset recusa proposta antiga; novo multiline respeita ' + control.limit + ' e só Save persiste', async ({ page }) => {
    await openApp(page)
    await setupControl(page, control)
    const before = await snapshot(page)
    const target = page.locator(control.selector)
    const original = await target.inputValue()
    await propose(page, request(control, 'PROPOSTA ANTIGA NÃO APLICAR'), 'PROPOSTA ANTIGA NÃO APLICAR')
    await expect(target).toHaveValue(original)
    await unchanged(page, before)
    await resetSameEditor(page, control)
    await confirm(page)
    await expect(target).toHaveValue(original)
    await expectRefused(page)
    await page.clock.runFor(1200)
    await unchanged(page, before)

    const value = boundary(control.limit)
    expect(value.length).toBe(control.limit)
    const overflow = value + 'X'
    await assistant(page).getByLabel('Seu comando').fill(request(control, overflow))
    await assistant(page).getByRole('button', { name: 'Preparar rascunho' }).click()
    await expect(preview(page)).toHaveCount(0)
    await expect(page.locator('.voice-command-error')).toContainText(String(control.limit))
    await expect(target).toHaveValue(original)
    await confirm(page)
    await expect(target).toHaveValue(original)
    await unchanged(page, before)

    // CRLF supplied to the actual composer becomes LF in the browser DOM.
    const raw = value.replace(/\n/g, '\r\n')
    await propose(page, request(control, raw))
    await expect(assistant(page).getByLabel('Seu comando')).toHaveValue(request(control, canonical(raw)))
    expect(await preview(page).textContent()).toContain(value)
    await expect(target).toHaveValue(original)
    await preservedLocalNeighbors(page, control, before)
    await page.clock.runFor(1200)
    await unchanged(page, before)
    await confirm(page)
    await expect(target).toHaveValue(value)
    expect(await target.inputValue()).not.toContain('\r')
    await preservedLocalNeighbors(page, control, before)
    await unchanged(page, before)
    // Indicator generic fill retains ordinary input/autosave semantics: perform
    // explicit Save before its legitimate 600ms deadline. Other editors do not
    // autosave and must retain their local value through 1200ms without writes.
    if (control.kind !== 'indicator') {
      await page.clock.runFor(1200)
      await expect(target).toHaveValue(value)
      await unchanged(page, before)
    }
    await saveExplicit(page, control, value, before)
  })
}

