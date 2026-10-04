import { expect, test } from '@playwright/test'

// novo76 pattern: real App/DesktopVault/Agenda, parser, gateway and apply;
// strict IPC boundary only. Transcripts are entered in the editable command
// field: NO audio capture, ASR, injected intents, native profile or real data.
// Unknown IPC (including save/finalize/backup) throws and fails afterEach.
test.describe.configure({ mode: 'default', timeout: 20000 })
const assistant = page => page.getByRole('region', { name: 'Comando do Círculo', exact: true })
const panel = page => page.locator('#agenda-details-panel')
const preview = page => page.locator('.voice-command-preview')
const editor = page => page.getByRole('form', { name: 'Alterar ocorrência individual', exact: true })
const calendar = page => page.getByRole('region', { name: /Calendário (semana|dia)/ })
const event = (page, id) => calendar(page).locator(`button[data-voice-action="agenda:details:${id}"]`)
const action = (page, kind, id = 'z-occurrence') => panel(page).locator(`button[data-voice-action="agenda:${kind}:${id}"]`)
const state = page => page.evaluate(() => structuredClone(window.focusedAppointments.state))
const writes = page => page.evaluate(() => structuredClone(window.focusedAppointments.writes))
const clicks = page => page.evaluate(() => structuredClone(window.focusedAppointments.clicks))

async function openApp(page, { names = ['Ana Clara', 'Ana Clara'], status = 'scheduled', archived = false, recurring = false } = {}) {
  const time = new Date('2026-10-04T15:00:00Z')
  await page.clock.install({ time })
  await page.clock.pauseAt(time) // hold autosave; opening a draft is not saving it
  await page.addInitScript(({ names, status, archived, recurring }) => {
    const clone = value => structuredClone(value)
    const patients = names.map((name, index) => ({ id: index ? 'ana-two' : 'ana-one', name, age: 8 + index, revision: 1, preferredModality: 'Presencial', archivedAt: index && archived ? '2026-10-01T12:00:00Z' : null }))
    const series = patients.map((patient, index) => ({ id: index ? 'series-two' : 'series-one', patientId: patient.id, weekday: 5, start: '15:00', end: '15:50', frequency: 'Avulsa', startDate: index ? '2026-10-02' : '2026-10-01', endDate: index ? '2026-10-02' : '2026-10-01', modality: 'Presencial', meetingLink: null, timeZone: 'America/Sao_Paulo', revision: 1 }))
    if (recurring) Object.assign(series[1], { frequency: 'Semanal', endDate: null })
    // Unsorted IPC, exactly identical displayed name/date/time, distinct IDs
    // and original dates. Option two MUST target the second patient.
    const occurrences = [1, 0].map(index => ({ id: index ? 'z-occurrence' : 'a-occurrence', seriesId: series[index].id, patientId: patients[index].id, originalDate: series[index].startDate, date: '2026-10-04', start: '15:00', end: '15:50', status: index ? status : 'scheduled', frequency: series[index].frequency, modality: 'Presencial', meetingLink: null, wasRescheduled: true }))
    const history = occurrences.map(item => ({ id: 'move-' + item.id, seriesId: item.seriesId, action: 'reschedule', originalDate: item.originalDate, effectiveDate: item.date, start: item.start, end: item.end, reason: 'Remarcação sintética.' }))
    const fixture = window.focusedAppointments = { state: { patients, series, occurrences, history, drafts: [], sessions: [] }, calls: [], writes: [], clicks: [], unexpected: [], catalogReady: false }
    // Capture precedes React handlers and also sees cloneNode buttons, which
    // have no React handler. An unauthorized click must fail even with no IPC
    // or visible effect. Observe only; never forward clicks to another button.
    document.addEventListener('click', event => {
      const button = event.target instanceof Element ? event.target.closest('button[data-voice-action]') : null
      const value = button?.getAttribute('data-voice-action')
      const match = value?.match(/^agenda:(edit|start):(.+)$/)
      if (match) fixture.clicks.push({ action: match[1], id: match[2] })
    }, true)
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
      if (command === 'agenda_occurrences') return clone(occurrences.filter(item => item.date >= args.from && item.date <= args.to))
      if (command === 'session_draft_list') return clone(fixture.state.drafts.filter(item => item.patientId === args.patientId))
      if (command === 'session_timeline') return clone(fixture.state.sessions.filter(item => item.patientId === args.patientId))
      if (command === 'session_addendum_list' || command === 'case_context_list' || command === 'related_party_list') return []
      if (command === 'session_draft_start') {
        fixture.writes.push(clone({ command, args }))
        const occurrence = occurrences.find(item => item.seriesId === args.seriesId && item.originalDate === args.originalDate)
        if (!occurrence || occurrence.status === 'completed' || patients.find(item => item.id === occurrence.patientId)?.archivedAt) {
          fixture.unexpected.push('invalid session_draft_start target')
          throw new Error('Destino sintético inelegível')
        }
        const draft = { id: 'draft-' + occurrence.id, patientId: occurrence.patientId, seriesId: occurrence.seriesId, originalDate: occurrence.originalDate, observation: '', procedures: '', outcomeDecision: '', referralClosure: null, behaviorIds: [], indicators: [] }
        fixture.state.drafts.push(draft)
        return clone(draft)
      }
      fixture.unexpected.push(command)
      if (/(create|update|save|start|cancel|finalize|reschedule|archive|restore|backup)/.test(command)) fixture.writes.push(clone({ command, args }))
      throw new Error('IPC sem fixture: ' + command)
    } }
  }, { names, status, archived, recurring })
  await page.goto('/')
  await expect(assistant(page)).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.focusedAppointments.catalogReady)).toBe(true)
  await page.clock.runFor(32)
  await command(page, 'Abrir Agenda')
  await expect(event(page, 'z-occurrence')).toBeEnabled()
  await expect(event(page, 'z-occurrence')).toHaveAttribute('data-voice-appointment-option', '2')
  await expect(panel(page)).toHaveCount(0)
}

async function propose(page, text) {
  // Existing textarea shortcut calls the same interpret(command) as Prepare.
  // Keyboard input avoids mouse geometry during Agenda's smooth scroll; this
  // spec covers parser/gateway/apply, not the physical Prepare button click.
  const field = assistant(page).getByLabel('Seu comando')
  await field.fill(text)
  await field.press('Control+Enter')
}
async function confirm(page) { await propose(page, 'Confirmar'); await page.clock.runFor(32) }
async function command(page, text) {
  const beforeClicks = await clicks(page)
  await propose(page, text)
  await expect(preview(page)).toBeVisible()
  expect(await clicks(page)).toEqual(beforeClicks)
  await confirm(page)
  await expect(preview(page)).toHaveCount(0)
}
async function focus(page, option = 2) {
  await command(page, 'Clicar em Detalhes de Ana Clara opção ' + option)
  await expect(panel(page).locator('.agenda-detail-list > li')).toHaveCount(1)
  await expect(panel(page).locator('#agenda-detail-' + (option === 2 ? 'z-occurrence' : 'a-occurrence'))).toBeVisible()
}
async function untouched(page, before) {
  expect(await state(page)).toEqual(before)
  expect(await writes(page)).toEqual([])
  await expect(page.getByRole('form', { name: 'Rascunho de sessão', exact: true })).toHaveCount(0)
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
}
async function prepareAction(page, kind, id = 'z-occurrence') {
  expect(await clicks(page)).toEqual([])
  const before = await state(page)
  const occurrence = before.occurrences.find(item => item.id === id)
  const patient = before.patients.find(item => item.id === occurrence.patientId)
  const button = action(page, kind, id)
  await expect(button).toBeEnabled()
  // Ancestor markers may live on the section or inner panel. Both must bind
  // the same actual button; do not assume a global first match.
  const markers = await button.evaluate(element => {
    const scope = element.closest('[data-voice-focused-occurrence]')
    const lifecycle = []
    for (let current = element; current; current = current.parentElement) {
      if (current.hasAttribute('data-voice-lifecycle')) lifecycle.push(current.getAttribute('data-voice-lifecycle'))
    }
    return { occurrence: scope?.getAttribute('data-voice-focused-occurrence'), patient: scope?.getAttribute('data-voice-focused-patient'), lifecycle }
  })
  expect(markers.occurrence).toBe(id)
  expect(markers.patient).toBe(patient.id)
  expect(markers.lifecycle.length).toBeGreaterThan(0)
  for (const [key, value] of Object.entries({ action: kind, id, 'patient-id': patient.id, patient: patient.name, 'series-id': occurrence.seriesId ?? '', 'original-date': occurrence.originalDate, date: occurrence.date, start: occurrence.start, end: occurrence.end })) {
    await expect(button).toHaveAttribute('data-voice-focused-appointment-' + key, value)
  }
  await expect(button).toHaveAttribute('data-voice-record', JSON.stringify(['occurrence', id, patient.id, occurrence.seriesId ?? null, occurrence.originalDate]))
  await expect(button).toHaveAttribute('data-voice-epoch', /.+:.+:.+/)
  await expect(button).not.toHaveAttribute('data-voice-appointment-details')
  await expect(button).toHaveAttribute('aria-label', `${kind === 'edit' ? 'Alterar ocorrência' : 'Iniciar sessão'} de ${patient.name} em ${occurrence.date} às ${occurrence.start}–${occurrence.end}`)
  await propose(page, kind === 'edit' ? 'Clicar em Alterar' : 'Clicar em Iniciar sessão')
  await expect(preview(page)).toBeVisible()
  for (const text of [patient.name, occurrence.start, occurrence.end]) await expect(preview(page)).toContainText(text)
  await expect(preview(page)).toContainText(/2026-10-04|04\/10\/2026/)
  await expect(preview(page)).toContainText(kind === 'edit' ? /Alterar/i : /Iniciar sessão/i)
  for (const text of [...before.patients, ...before.series, ...before.occurrences].map(item => item.id)) await expect(preview(page)).not.toContainText(text)
  await expect(editor(page)).toHaveCount(0)
  await untouched(page, before)
  expect(await clicks(page)).toEqual([])
  return before
}
async function refuse(page, text) {
  const before = await state(page)
  const beforeClicks = await clicks(page)
  await propose(page, text)
  await expect(preview(page)).toHaveCount(0)
  await expect(page.locator('.voice-command-error')).toBeVisible()
  await untouched(page, before)
  expect(await clicks(page)).toEqual(beforeClicks)
}
async function reloadRange(page) {
  const calls = await page.evaluate(() => window.focusedAppointments.calls.filter(item => item.command === 'agenda_occurrences').length)
  await page.getByRole('group', { name: 'Visualização da Agenda', exact: true }).getByRole('button', { name: 'Dia', exact: true }).click()
  await page.clock.runFor(32)
  await expect.poll(() => page.evaluate(() => window.focusedAppointments.calls.filter(item => item.command === 'agenda_occurrences').length)).toBeGreaterThan(calls)
  await expect(page.getByText('Carregando Agenda...', { exact: true })).toHaveCount(0)
}

test.beforeEach(async ({ page, baseURL }) => {
  page.focusedBoundary = []
  page.on('dialog', async dialog => { page.focusedBoundary.push(dialog.type()); await dialog.dismiss() })
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) await route.continue()
    else { page.focusedBoundary.push(route.request().url()); await route.abort() }
  })
})
test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.focusedAppointments?.unexpected || [])).toEqual([])
  expect(page.focusedBoundary).toEqual([])
})

test('calendário opção dois → Alterar curto abre editor exato; nomes/horários iguais e zero writes', async ({ page }) => {
  await openApp(page)
  await reloadRange(page) // Day also renders edit/start calendar duplicates
  await expect(calendar(page).locator('button[data-voice-action="agenda:edit:z-occurrence"]')).toBeVisible()
  await expect(calendar(page).locator('[data-voice-focused-appointment-action]')).toHaveCount(0)
  await focus(page)
  // Creating a new appointment is a drawer, not another occurrence editor.
  await page.locator('button[aria-controls="agenda-create-panel"]').click()
  await expect(page.getByRole('form', { name: 'Novo compromisso', exact: true })).toBeVisible()
  const before = await prepareAction(page, 'edit')
  await confirm(page)
  await expect(editor(page)).toBeVisible()
  await expect(editor(page)).toHaveAttribute('data-voice-record', 'series-two:2026-10-02')
  await expect(editor(page).getByLabel('Nova data efetiva')).toHaveValue('2026-10-04')
  await expect(editor(page).getByLabel('Novo início')).toHaveValue('15:00')
  await expect(editor(page).getByLabel('Novo fim')).toHaveValue('15:50')
  await untouched(page, before)
  expect(await clicks(page)).toEqual([{ action: 'edit', id: 'z-occurrence' }])
  await expect(panel(page).locator('[data-voice-focused-appointment-action]')).toHaveCount(0)
  for (const text of ['Clicar em Alterar', 'Clicar em Iniciar sessão']) await refuse(page, text)
  await expect(editor(page)).toHaveAttribute('data-voice-record', 'series-two:2026-10-02')
  expect(await clicks(page)).toEqual([{ action: 'edit', id: 'z-occurrence' }])
})

test('Iniciar sessão curto só após Confirmar: payload original exato, rascunho certo, sem save/finalize', async ({ page }) => {
  await openApp(page)
  await focus(page)
  const before = await prepareAction(page, 'start')
  await confirm(page)
  await expect.poll(() => writes(page)).toEqual([{ command: 'session_draft_start', args: { seriesId: 'series-two', originalDate: '2026-10-02' } }])
  await expect(page.getByRole('form', { name: 'Rascunho de sessão', exact: true })).toBeVisible()
  expect(await clicks(page)).toEqual([{ action: 'start', id: 'z-occurrence' }])
  const after = await state(page)
  expect(after.drafts).toEqual([expect.objectContaining({ patientId: 'ana-two', seriesId: 'series-two', originalDate: '2026-10-02', id: 'draft-z-occurrence' })])
  expect({ ...after, drafts: before.drafts }).toEqual(before)
})

test('sem foco, geral e ending recusam curtos; legado completo único funciona sem marcação', async ({ page }) => {
  await openApp(page, { names: ['Ana Clara', 'Bia Fictícia'], recurring: true })
  for (const text of ['Clicar em Alterar', 'Clicar em Iniciar sessão']) await refuse(page, text)
  await page.getByRole('button', { name: /^Detalhes e ações/ }).click()
  await expect(panel(page).locator('.agenda-detail-list > li')).toHaveCount(2)
  await expect(panel(page).locator('[data-voice-focused-appointment-action]')).toHaveCount(0)
  for (const text of ['Clicar em Alterar', 'Clicar em Iniciar sessão']) await refuse(page, text)
  await panel(page).getByRole('button', { name: 'Fechar detalhes', exact: true }).click()
  await event(page, 'z-occurrence').click()
  await expect(action(page, 'edit')).toBeEnabled()
  await page.getByRole('button', { name: /^Compromissos persistidos/ }).click()
  await page.getByRole('button', { name: 'Encerrar série de Bia Fictícia · série series-two', exact: true }).click()
  const ending = page.getByRole('form', { name: 'Encerrar série recorrente', exact: true })
  await expect(ending).toBeVisible()
  for (const text of ['Clicar em Alterar', 'Clicar em Iniciar sessão']) await refuse(page, text)
  await expect(editor(page)).toHaveCount(0)
  await ending.getByRole('button', { name: 'Voltar', exact: true }).click()
  await panel(page).getByRole('button', { name: 'Fechar detalhes', exact: true }).click()
  await page.getByRole('button', { name: /^Detalhes e ações/ }).click()
  const before = await state(page)
  await command(page, 'Clicar em Alterar ocorrência de Bia Fictícia em 2026-10-04 às 15:00–15:50')
  await expect(editor(page)).toHaveAttribute('data-voice-record', 'series-two:2026-10-02')
  await untouched(page, before)
  expect(await clicks(page)).toEqual([{ action: 'edit', id: 'z-occurrence' }])
})

test('completed e disabled respeitam eligibility existente', async ({ page }) => {
  await openApp(page, { status: 'completed' })
  await focus(page)
  for (const text of ['Clicar em Alterar', 'Clicar em Iniciar sessão']) await refuse(page, text)
  await panel(page).getByRole('button', { name: 'Fechar detalhes', exact: true }).click()
  await focus(page, 1)
  await action(page, 'start', 'a-occurrence').evaluate(button => { button.disabled = true })
  await refuse(page, 'Clicar em Iniciar sessão')
})

test('paciente archived não ganha autorização curta de início', async ({ page }) => {
  await openApp(page, { archived: true })
  await focus(page)
  await expect(action(page, 'start')).toHaveCount(0)
  await refuse(page, 'Clicar em Iniciar sessão')
})

for (const kind of ['edit', 'start']) {
for (const change of ['focus', 'close-general', 'ABA-same-detail', 'reload', 'renumber', 'space']) {
  test(kind + ': pedido pendente invalida em ' + change + ' sem clicar nem escrever', async ({ page }) => {
    await openApp(page)
    await focus(page)
    await prepareAction(page, kind)
    const oldEpoch = await action(page, kind).getAttribute('data-voice-epoch')
    if (change === 'focus') await event(page, 'a-occurrence').click()
    else if (change === 'close-general') {
      await panel(page).getByRole('button', { name: 'Fechar detalhes', exact: true }).click()
      await page.getByRole('button', { name: /^Detalhes e ações/ }).click()
    } else if (change === 'ABA-same-detail') {
      await panel(page).getByRole('button', { name: 'Fechar detalhes', exact: true }).click()
      // Native UI clicks preserve the original pending command; using command()
      // here would replace it and would NOT test ABA revalidation on apply.
      await event(page, 'z-occurrence').click()
      await expect(panel(page).locator('#agenda-detail-z-occurrence')).toBeVisible()
      await expect(action(page, kind)).not.toHaveAttribute('data-voice-epoch', oldEpoch)
    } else if (change === 'space') {
      await page.getByRole('button', { name: 'Fechar Agenda', exact: true }).click()
      await page.getByRole('navigation', { name: 'Espaços do Círculo', exact: true }).getByRole('button', { name: 'Abrir Agenda', exact: true }).click()
    } else {
      if (change === 'renumber') await page.evaluate(() => {
        const items = window.focusedAppointments.state.occurrences
        items.push({ ...items[0], id: 'new-earlier', start: '14:00', end: '14:50' })
      })
      await reloadRange(page)
      if (change === 'renumber') await expect(event(page, 'z-occurrence')).toHaveAttribute('data-voice-appointment-option', '3')
    }
    await page.clock.runFor(32)
    const before = await state(page)
    await confirm(page)
    await expect(editor(page)).toHaveCount(0)
    await expect(preview(page)).toHaveCount(0)
    await untouched(page, before)
    expect(await clicks(page)).toEqual([])
  })
}
}

// Synthetic DOM competitors only, following novo76. No handler/intent bypass:
// real candidates, lifecycle fingerprint, parser and apply must reject them.
for (const kind of ['edit', 'start']) {
test(kind + ': conflitos raw idêntico/exact/alias/metadata/lifecycle/record/painel recusam antes de dedupe e no apply', async ({ page }) => {
  await openApp(page)
  await focus(page)
  for (const conflict of ['raw-identical', 'exact', 'alias', 'metadata', 'lifecycle', 'record', 'panel']) {
    const before = await prepareAction(page, kind)
    const initial = await action(page, kind).evaluate(button => ({ record: button.getAttribute('data-voice-record'), patient: button.closest('[data-voice-focused-occurrence]').getAttribute('data-voice-focused-patient') }))
    await action(page, kind).evaluate((original, { conflict, kind }) => {
      const host = document.createElement('section')
      host.id = 'synthetic-focused-competitor'
      if (conflict === 'exact' || conflict === 'alias') {
        const button = document.createElement('button')
        button.type = 'button'
        // Capture any wrong click even though this competitor has no handler.
        button.setAttribute('data-voice-action', `agenda:${kind}:synthetic-competitor`)
        const label = kind === 'edit' ? 'Alterar' : 'Iniciar sessão'
        button.textContent = conflict === 'exact' ? label : 'Controle sintético concorrente'
        if (conflict === 'alias') button.setAttribute('data-voice-alias', label)
        host.append(button)
      } else if (conflict === 'panel') {
        original.closest('[data-voice-focused-occurrence]').setAttribute('data-voice-focused-patient', 'ana-one')
      } else if (conflict === 'record') {
        original.setAttribute('data-voice-record', JSON.stringify(['occurrence', 'z-occurrence', 'ana-one', 'series-two', '2026-10-02']))
      } else {
        const clone = original.cloneNode(true)
        if (conflict === 'metadata') clone.setAttribute('data-voice-focused-appointment-original-date', '2026-10-01')
        if (conflict === 'lifecycle') host.setAttribute('data-voice-lifecycle', 'synthetic-conflicting-lifecycle')
        host.append(clone)
      }
      original.parentElement.append(host)
    }, { conflict, kind })
    if (conflict === 'raw-identical') {
      // The two raw eligible buttons have identical name, action, record,
      // metadata, epoch and lifecycle chain; they MUST still compete.
      await expect(action(page, kind)).toHaveCount(2)
      for (const button of await action(page, kind).all()) await expect(button).toBeEnabled()
    }
    await confirm(page)
    await expect(editor(page)).toHaveCount(0)
    await expect(preview(page)).toHaveCount(0)
    await untouched(page, before)
    expect(await clicks(page)).toEqual([])
    await refuse(page, kind === 'edit' ? 'Clicar em Alterar' : 'Clicar em Iniciar sessão')
    expect(await clicks(page)).toEqual([])
    await action(page, kind).first().evaluate((button, initial) => {
      document.getElementById('synthetic-focused-competitor').remove()
      button.setAttribute('data-voice-record', initial.record)
      button.closest('[data-voice-focused-occurrence]').setAttribute('data-voice-focused-patient', initial.patient)
    }, initial)
  }
})
}
