import { expect, test } from '@playwright/test'

const assistant = page => page.getByRole('region', { name: 'Comando do Círculo' })
const endingForm = page => page.getByRole('form', { name: 'Encerrar série recorrente', exact: true })
const panel = page => page.locator('#agenda-persisted-panel')
const seriesButton = (page, id) => panel(page).locator('button[data-voice-action^="agenda:end-series:"][data-voice-record$=":' + id + '"]')
const snapshot = page => page.evaluate(() => structuredClone(window.seriesOptions.state))
const writes = page => page.evaluate(() => structuredClone(window.seriesOptions.writes))

// App/DesktopVault/Agenda and the gateway/parser are real. Cloned IPC fixtures
// alone replace persistence. No injected intents, ASR, capture or real profile.
async function openApp(page, { homonyms = true, endDate = null, inactiveFirst = false, many = false, allowEnd = false, secondTime = '15:00' } = {}) {
  const time = new Date('2026-10-04T15:00:00Z')
  await page.clock.install({ time })
  await page.clock.pauseAt(time)
  await page.addInitScript(({ homonyms, endDate, inactiveFirst, many, allowEnd, secondTime }) => {
    const clone = value => structuredClone(value)
    const patients = [
      { id: 'ana-one', name: 'Ana Clara', age: 8, revision: 1, preferredModality: 'Presencial', archivedAt: null },
      { id: 'ana-two', name: homonyms ? 'Ána Clára' : 'Bia Fictícia', age: 9, revision: 1, preferredModality: 'Online', archivedAt: null },
    ]
    const template = { weekday: 1, start: '15:00', end: '15:50', frequency: 'Semanal', startDate: '2026-09-28', endDate, modality: 'Presencial', meetingLink: null, timeZone: 'America/Sao_Paulo', revision: 1 }
    const series = [
      { ...template, id: 'series-first', patientId: 'ana-one' },
      { ...template, id: 'one-off-decoy', patientId: 'ana-one', frequency: 'Avulsa', startDate: '2026-10-04', endDate: '2026-10-04', weekday: 0 },
      { ...template, id: 'series-second', patientId: 'ana-two', start: secondTime },
    ]
    if (inactiveFirst) series.unshift({ ...template, id: 'series-ended', patientId: 'ana-one', endDate: '2026-09-30' })
    if (many) {
      for (let option = 3; option <= 11; option++) series.push({ ...template, id: 'series-option-' + option, patientId: 'ana-one' })
    }
    const history = [{ id: 'history-preserved', seriesId: 'series-first', action: 'reschedule', originalDate: '2026-09-28', effectiveDate: '2026-09-29', start: '15:00', end: '15:50', reason: 'Ajuste fictício anterior.' }]
    const drafts = [{ id: 'draft-preserved', patientId: 'ana-two', seriesId: 'series-second', originalDate: '2026-09-21', observation: 'Rascunho fictício intacto.', procedures: '', outcomeDecision: '', referralClosure: '', behaviorIds: [], indicators: [] }]
    const sessions = [{ id: 'session-preserved', patientId: 'ana-one', seriesId: 'series-first', originalDate: '2026-09-14', observation: 'Sessão fictícia intacta.' }]
    const fixture = window.seriesOptions = { state: { patients, series, history, drafts, sessions }, calls: [], writes: [], unexpected: [], catalogReady: false }
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
      if (command === 'agenda_history') return clone(history.slice().reverse())
      if (command === 'agenda_occurrences') return []
      if (command === 'session_draft_list') return clone(drafts.filter(item => item.patientId === args.patientId))
      if (command === 'session_timeline') return clone(sessions.filter(item => item.patientId === args.patientId))
      if (command === 'session_addendum_list' || command === 'case_context_list') return []
      if (command === 'agenda_end_series' && allowEnd && args.seriesId === 'series-second' && args.effectiveDate === '2026-10-19') {
        const item = series.find(item => item.id === args.seriesId)
        fixture.writes.push(clone({ command, args }))
        item.endDate = '2026-10-18'
        return clone(item)
      }
      fixture.unexpected.push(command)
      if (/(?:create|update|save|start|cancel|finalize|archive|restore|end_series)/.test(command)) fixture.writes.push(clone({ command, args }))
      throw new Error('IPC sem fixture: ' + command)
    } }
  }, { homonyms, endDate, inactiveFirst, many, allowEnd, secondTime })
  await page.goto('/')
  await expect(assistant(page)).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.seriesOptions.catalogReady)).toBe(true)
  await expect(page.locator('.vault-home-preview')).toContainText('Ana Clara')
  await command(page, 'Abrir Agenda')
  await expect(page.getByRole('region', { name: 'Calendário semana', exact: true })).toBeVisible()
  await expect(page.getByText('Carregando Agenda...', { exact: true })).toHaveCount(0)
  await command(page, 'Abrir Compromissos persistidos')
  await expect(panel(page)).toBeVisible()
  await expect(seriesButton(page, 'series-first')).toBeEnabled()
  await expect(seriesButton(page, 'series-second')).toBeEnabled()
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
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
}

test.beforeEach(async ({ page, baseURL }) => {
  const unexpected = []
  page.on('dialog', async dialog => { unexpected.push(dialog.type()); await dialog.dismiss() })
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) await route.continue()
    else { unexpected.push(route.request().url()); await route.abort() }
  })
  page.seriesOptionsBoundary = unexpected
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.seriesOptions?.unexpected || [])).toEqual([])
  expect(page.seriesOptionsBoundary).toEqual([])
})

test('cartões homônimos exibem opções globais e dia completo sem numerar avulsa', async ({ page }, testInfo) => {
  await openApp(page)
  const before = await snapshot(page)
  for (const [id, patientId, name, option] of [
    ['series-first', 'ana-one', 'Ana Clara', '1'],
    ['series-second', 'ana-two', 'Ána Clára', '2'],
  ]) {
    const button = seriesButton(page, id)
    await expect(button).toHaveAttribute('data-voice-series-option', option)
    await expect(button).toHaveAttribute('data-voice-series-patient-id', patientId)
    await expect(button).toHaveAttribute('data-voice-series-id', id)
    await expect(button).toHaveAttribute('data-voice-series-patient', name)
    await expect(button).toHaveAttribute('data-voice-series-kind', 'end')
    await expect(button).toHaveAttribute('data-voice-series-weekday', '1')
    await expect(button).toHaveAttribute('data-voice-series-time', '15:00')
    await expect(button).toHaveAttribute('data-voice-series-ambiguous', 'true')
    await expect(button).toHaveAttribute('data-voice-action', 'agenda:end-series:' + patientId + ':' + id)
    await expect(button).toHaveAttribute('data-voice-record', 'series:' + patientId + ':' + id)
    await expect(button).toHaveAttribute('data-voice-epoch', /.+/)
    const card = panel(page).getByRole('listitem').filter({ has: page.locator('button[data-voice-series-id="' + id + '"]') })
    await expect(card).toContainText('Série · opção ' + option)
    await expect(card).toContainText(/segunda-feira/i)
  }
  const oneOff = panel(page).getByRole('listitem').filter({ hasText: 'Avulsa' })
  await expect(oneOff).toHaveCount(1)
  await expect(oneOff).not.toContainText(/opção/u)
  await expect(oneOff.locator('[data-voice-series-option]')).toHaveCount(0)
  await expect(endingForm(page)).toHaveCount(0)
  await unchanged(page, before)
  await page.screenshot({ path: testInfo.outputPath('series-homonimas-opcoes-ficticias.png'), fullPage: true })
})

async function prepareSeries(page, phrase, id, before) {
  await propose(page, phrase)
  const preview = page.locator('.voice-command-preview')
  await expect(preview).toBeVisible()
  if (/\bopção\s/iu.test(phrase)) {
    const expectedSeries = before.series.find(item => item.id === id)
    expect(expectedSeries).toBeDefined()
    const patient = before.patients.find(item => item.id === expectedSeries.patientId)
    expect(patient).toBeDefined()
    const recurring = before.series.filter(item => item.frequency !== 'Avulsa')
    const option = String(recurring.findIndex(item => item.id === id) + 1)
    const button = seriesButton(page, id)
    await expect(button).toHaveAttribute('data-voice-series-option', option)
    await expect(button).toHaveAttribute('data-voice-series-patient-id', patient.id)
    await expect(button).toHaveAttribute('data-voice-series-id', id)
    await expect(preview).toContainText(expectedSeries.endDate ? 'Antecipar término' : 'Encerrar série')
    await expect(preview).toContainText(patient.name)
    await expect(preview).toContainText('· opção ' + option + ' ·')
    await expect(preview).toContainText(['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'][expectedSeries.weekday])
    await expect(preview).toContainText(expectedSeries.start)
    for (const item of before.series) await expect(preview).not.toContainText(item.id)
  } else {
    // Existing ID-bearing route keeps its technical preview contract.
    await expect(preview).toContainText(id)
  }
  await expect(endingForm(page)).toHaveCount(0)
  await unchanged(page, before)
}

async function expectExactForm(page, patientName, id) {
  await expect(endingForm(page)).toBeVisible()
  await expect(endingForm(page).getByRole('heading')).toHaveText('Encerrar série de ' + patientName + ' · ' + id)
  await expect(endingForm(page).getByLabel('Primeira data excluída')).toHaveValue('2026-10-04')
}

async function cancelForm(page, before) {
  await endingForm(page).getByRole('button', { name: 'Voltar', exact: true }).click()
  await expect(endingForm(page)).toHaveCount(0)
  await unchanged(page, before)
}

async function refuse(page, phrase, before) {
  await propose(page, phrase)
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  await expect(page.locator('.voice-command-error')).toBeVisible()
  await expect(endingForm(page)).toHaveCount(0)
  await unchanged(page, before)
}

async function refuseOld(page, before, { discarded = false } = {}) {
  if (discarded) {
    // Changing workspace proactively discards the pending proposal in Vault.
    await expect(page.locator('.voice-command-preview')).toHaveCount(0)
    await expect(page.locator('.vault-voice-review')).toHaveCount(0)
  }
  await confirm(page)
  await expect(endingForm(page)).toHaveCount(0)
  if (discarded) {
    await expect(assistant(page).getByRole('status')).toHaveText('Não encontrei “Confirmar ação” disponível nesta tela. Abra a área correspondente e diga o texto do botão ou campo.')
    await expect(page.locator('.voice-command-preview')).toHaveCount(0)
    await expect(page.locator('.vault-voice-review')).toHaveCount(0)
  } else {
    await expect(page.getByText(/A tela mudou|Prepare.*novamente/u)).toBeVisible()
  }
  await unchanged(page, before)
}

async function reloadAgenda(page) {
  const scope = page.getByRole('region', { name: 'Agenda persistente de sessões', exact: true })
  const count = await page.evaluate(() => window.seriesOptions.calls.filter(call => call.command === 'agenda_list_series').length)
  await scope.getByRole('button', { name: 'Próximo', exact: true }).click()
  await page.clock.runFor(32)
  await expect.poll(() => page.evaluate(() => window.seriesOptions.calls.filter(call => call.command === 'agenda_list_series').length)).toBeGreaterThan(count)
  await expect(page.getByText('Carregando Agenda...', { exact: true })).toHaveCount(0)
}

for (const action of ['Encerrar série', 'Antecipar término']) {
  for (const click of [false, true]) {
    test(action + (click ? ' via Clicar em' : ' direto') + ': opção dois escolhe paciente e série exatos sem UUID', async ({ page }) => {
      await openApp(page, { endDate: action === 'Antecipar término' ? '2026-11-30' : null })
      const before = await snapshot(page)
      const phrase = (click ? 'Clicar em ' : '') + action + ' de Ana Clara na segunda às quinze horas opção dois'
      await prepareSeries(page, phrase, 'series-second', before)
      await confirm(page)
      await expectExactForm(page, 'Ána Clára', 'series-second')
      await unchanged(page, before)
      await cancelForm(page, before)
      const short = (click ? 'Clicar em ' : '') + action + ' de Ana Clara opção 2'
      await prepareSeries(page, short, 'series-second', before)
      await confirm(page)
      await expectExactForm(page, 'Ána Clára', 'series-second')
      await unchanged(page, before)
      await cancelForm(page, before)
    })
  }
}

test('fullmatch recusa nome parcial, número ausente/inexistente/não canônico, qualificadores e extras', async ({ page }) => {
  await openApp(page)
  const before = await snapshot(page)
  for (const phrase of [
    'Encerrar série de Ana Clara',
    'Clicar em Encerrar série de Ana Clara na segunda às quinze horas',
    'Encerrar série de Ana opção dois',
    'Encerrar série de Ana Cla opção dois',
    'Encerrar série de Ana Clara opção zero',
    'Encerrar série de Ana Clara opção 3',
    'Encerrar série de Ana Clara opção 02',
    'Encerrar série de Ana Clara opção -2',
    'Encerrar série de Ana Clara opção dois por favor',
    'Encerrar série de Ana Clara opção dois e abrir Agenda',
    'Encerrar série de Ana Clara na terça às quinze horas opção dois',
    'Encerrar série de Ana Clara na segunda às dezesseis horas opção dois',
    'Antecipar término de Ana Clara opção dois',
  ]) await refuse(page, phrase, before)
  await propose(page, 'confirmar')
  await expect(endingForm(page)).toHaveCount(0)
  await unchanged(page, before)
})

test('homônimo sem opção continua recusado mesmo com horário único', async ({ page }) => {
  await openApp(page, { secondTime: '16:00' })
  const before = await snapshot(page)
  await refuse(page, 'Encerrar série de Ana Clara na segunda às quinze horas', before)
  await refuse(page, 'Clicar em Encerrar série de Ana Clara na segunda às dezesseis horas', before)
  await prepareSeries(page, 'Encerrar série de Ana Clara na segunda às dezesseis horas opção dois', 'series-second', before)
  await confirm(page)
  await expectExactForm(page, 'Ána Clára', 'series-second')
  await unchanged(page, before)
  await cancelForm(page, before)
})

test('sem homônimos rota amigável atual permanece sem opção', async ({ page }) => {
  await openApp(page, { homonyms: false })
  const before = await snapshot(page)
  for (const phrase of ['Encerrar série de Ana Clara', 'Clicar em Encerrar série de Bia Fictícia na segunda às quinze horas']) {
    const first = phrase.includes('Ana Clara')
    await prepareSeries(page, phrase, first ? 'series-first' : 'series-second', before)
    await confirm(page)
    await expectExactForm(page, first ? 'Ana Clara' : 'Bia Fictícia', first ? 'series-first' : 'series-second')
    await unchanged(page, before)
    await cancelForm(page, before)
  }
})

test('ID legado continua desambiguando homônimos para end e advance', async ({ page }) => {
  await openApp(page, { endDate: '2026-11-30' })
  const before = await snapshot(page)
  // Existing accessible ID-bearing route is deliberately preserved, including
  // the historical "Encerrar série" label on an advance control.
  await prepareSeries(page, 'Clicar em Encerrar série de Ána Clára · série series-second', 'series-second', before)
  await confirm(page)
  await expectExactForm(page, 'Ána Clára', 'series-second')
  await unchanged(page, before)
  await cancelForm(page, before)
})

test('numeração global inclui série encerrada, exclui avulsa e não muda ao ocultar painel', async ({ page }) => {
  await openApp(page, { inactiveFirst: true })
  const before = await snapshot(page)
  await expect(seriesButton(page, 'series-ended')).toHaveCount(0)
  await expect(seriesButton(page, 'series-first')).toHaveAttribute('data-voice-series-option', '2')
  await expect(seriesButton(page, 'series-second')).toHaveAttribute('data-voice-series-option', '3')
  const toggle = page.getByRole('region', { name: 'Compromissos persistidos', exact: true }).getByRole('button', { name: 'Compromissos persistidos' })
  await toggle.click()
  await expect(panel(page)).toHaveCount(0)
  await toggle.click()
  await expect(seriesButton(page, 'series-first')).toHaveAttribute('data-voice-series-option', '2')
  await expect(seriesButton(page, 'series-second')).toHaveAttribute('data-voice-series-option', '3')
  await refuse(page, 'Encerrar série de Ana Clara opção um', before)
  await prepareSeries(page, 'Encerrar série de Ana Clara opção três', 'series-second', before)
  await confirm(page)
  await expectExactForm(page, 'Ána Clára', 'series-second')
  await unchanged(page, before)
  await cancelForm(page, before)
})

test('numeral canônico 11 só resolve opção exibida; palavra onze e opção ausente recusam', async ({ page }) => {
  await openApp(page, { many: true })
  const before = await snapshot(page)
  await expect(seriesButton(page, 'series-option-11')).toHaveAttribute('data-voice-series-option', '11')
  const card = panel(page).getByRole('listitem').filter({ has: page.locator('button[data-voice-series-id="series-option-11"]') })
  await expect(card).toContainText('Série · opção 11')
  await refuse(page, 'Encerrar série de Ana Clara opção onze', before)
  await refuse(page, 'Encerrar série de Ana Clara opção 12', before)
  await prepareSeries(page, 'Encerrar série de Ana Clara opção 11', 'series-option-11', before)
  await confirm(page)
  await expectExactForm(page, 'Ana Clara', 'series-option-11')
  await unchanged(page, before)
  await cancelForm(page, before)
})

for (const change of ['reload', 'renumber', 'availability', 'space-return']) {
  test('proposta antiga após ' + change + ' não abre formulário nem grava; nova consulta usa lista atual', async ({ page }) => {
    await openApp(page)
    const original = await snapshot(page)
    await prepareSeries(page, 'Encerrar série de Ana Clara opção dois', 'series-second', original)
    if (change === 'renumber') {
      // Modify only the isolated read fixture, then let real Agenda load/render
      // it. Never mutate a proposal or bypass gateway re-resolution.
      await page.evaluate(() => window.seriesOptions.state.series.reverse())
      await reloadAgenda(page)
      await expect(seriesButton(page, 'series-second')).toHaveAttribute('data-voice-series-option', '1')
      await expect(seriesButton(page, 'series-first')).toHaveAttribute('data-voice-series-option', '2')
    } else if (change === 'availability') {
      await page.evaluate(() => { window.seriesOptions.state.series.find(item => item.id === 'series-second').endDate = '2026-09-30' })
      await reloadAgenda(page)
      await expect(seriesButton(page, 'series-second')).toHaveCount(0)
    } else if (change === 'space-return') {
      // Agenda remains mounted, but the shell's ancestor lifecycle changes
      // with space. Vault also discards the pending proposal before returning.
      await page.getByRole('button', { name: 'Fechar Agenda', exact: true }).click()
      await expect(panel(page)).toHaveCount(1)
      await expect(panel(page)).toBeHidden()
      await expect(endingForm(page)).toHaveCount(0)
      await unchanged(page, original)
      await page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Abrir Agenda', exact: true }).click()
      await page.clock.runFor(32)
      await expect(panel(page)).toBeVisible()
      await expect(seriesButton(page, 'series-first')).toHaveAttribute('data-voice-series-option', '1')
      await expect(seriesButton(page, 'series-second')).toHaveAttribute('data-voice-series-option', '2')
      await expect(seriesButton(page, 'series-second')).toBeEnabled()
    } else {
      const oldEpoch = await seriesButton(page, 'series-second').getAttribute('data-voice-epoch')
      await reloadAgenda(page)
      await expect(seriesButton(page, 'series-second')).not.toHaveAttribute('data-voice-epoch', oldEpoch)
    }
    const current = await snapshot(page)
    await refuseOld(page, current, { discarded: change === 'space-return' })
    if (change === 'availability') await refuse(page, 'Encerrar série de Ana Clara opção dois', current)
    else {
      const changed = change === 'renumber'
      await prepareSeries(page, 'Encerrar série de Ana Clara opção dois', changed ? 'series-first' : 'series-second', current)
      await confirm(page)
      await expectExactForm(page, changed ? 'Ana Clara' : 'Ána Clára', changed ? 'series-first' : 'series-second')
      await unchanged(page, current)
      await cancelForm(page, current)
    }
  })
}

test('alias concorrente visível inserido após proposta é re-resolvido antes da confirmação', async ({ page }) => {
  await openApp(page)
  const before = await snapshot(page)
  await prepareSeries(page, 'Encerrar série de Ana Clara opção dois', 'series-second', before)
  // A synthetic competing visible control exercises the real catalog and
  // full-query collision guard, not an injected parser intent.
  await page.evaluate(() => {
    const button = document.createElement('button')
    button.type = 'button'
    button.id = 'synthetic-series-competitor'
    button.textContent = 'Encerrar série de Ana Clara opção dois'
    document.getElementById('agenda-persisted-panel').append(button)
  })
  await refuseOld(page, before)
  await refuse(page, 'Encerrar série de Ana Clara opção dois', before)
  await page.locator('#synthetic-series-competitor').evaluate(element => element.remove())
  await prepareSeries(page, 'Encerrar série de Ana Clara opção dois', 'series-second', before)
  await confirm(page)
  await expectExactForm(page, 'Ána Clára', 'series-second')
  await unchanged(page, before)
  await cancelForm(page, before)
})

test('fim da série só grava seriesID/data exatos após confirmação final; recusa preserva concorrentes', async ({ page }) => {
  await openApp(page, { allowEnd: true })
  const before = await snapshot(page)
  await prepareSeries(page, 'Encerrar série de Ana Clara opção dois', 'series-second', before)
  await confirm(page)
  await expectExactForm(page, 'Ána Clára', 'series-second')
  await endingForm(page).getByLabel('Primeira data excluída').fill('2026-10-19')
  await endingForm(page).getByRole('button', { name: 'Confirmar encerramento', exact: true }).click()
  const confirmation = page.getByRole('alertdialog', { name: 'Confirmar ação', exact: true })
  await expect(confirmation).toContainText('series-second')
  await expect(confirmation).toContainText('2026-10-19')
  expect(await snapshot(page)).toEqual(before)
  expect(await writes(page)).toEqual([])
  await propose(page, 'voltar')
  await expect(confirmation).toHaveCount(0)
  await expect(endingForm(page)).toBeVisible()
  await unchanged(page, before)
  await endingForm(page).getByRole('button', { name: 'Confirmar encerramento', exact: true }).click()
  await expect(confirmation).toBeVisible()
  expect(await writes(page)).toEqual([])
  await confirm(page)
  await expect.poll(() => writes(page)).toEqual([{ command: 'agenda_end_series', args: { seriesId: 'series-second', effectiveDate: '2026-10-19' } }])
  await expect(endingForm(page)).toHaveCount(0)
  await expect(confirmation).toHaveCount(0)
  expect(await snapshot(page)).toEqual({ ...before, series: before.series.map(item => item.id === 'series-second' ? { ...item, endDate: '2026-10-18' } : item) })
})
