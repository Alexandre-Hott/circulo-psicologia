import { expect, test } from '@playwright/test'

// Real command-center proposals/confirmation and analytics UI; synthetic IPC only.
// Like desktop-voice-interface, commands enter through "Seu comando" (no STT).
async function openAnalytics(page, baseURL) {
  await page.clock.install({ time: new Date('2026-10-03T15:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-03T15:00:00Z'))
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    return url.origin === new URL(baseURL).origin
      ? route.continue() : route.abort('blockedbyclient')
  })
  await page.addInitScript(() => {
    const patients = [
      { id: 'synthetic-active', name: 'Paciente Ativo Fictício', age: 8, revision: 1, archivedAt: null },
      { id: 'synthetic-archived', name: 'Paciente Arquivado Fictício', age: 9, revision: 1, archivedAt: '2026-09-01' },
    ]
    window.analyticsControlsFixture = { calls: [], unexpected: [], fail: false, empty: false }
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      const fixture = window.analyticsControlsFixture
      fixture.calls.push({ command, args: structuredClone(args) })
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { available: false, dirty: false }
      if (command === 'plugin:updater|check') return null
      if (command === 'patient_list') return patients.filter(patient => args.includeArchived || !patient.archivedAt)
      if (['agenda_occurrences', 'behavior_list', 'indicator_catalog', 'related_party_list', 'agenda_list_series', 'agenda_history', 'session_timeline', 'session_draft_list', 'session_addendum_list', 'case_context_list'].includes(command)) return []
      if (command === 'analytics_overview') {
        if (fixture.fail) throw new Error('Falha sintética de analytics')
        if (fixture.empty || args.patientId === 'synthetic-archived') return { totalCompletedSessions: 0, uniquePatients: 0, dailyCounts: [], monthlyCounts: [], behaviorCounts: [] }
        return {
          totalCompletedSessions: 7, uniquePatients: 2,
          dailyCounts: [{ date: args.from, count: 7 }],
          monthlyCounts: [{ month: args.from.slice(0, 7), count: 7 }],
          behaviorCounts: [{ templateId: 'synthetic-behavior', templateVersion: 1, title: 'Observação sintética anterior', occurrences: 7, uniquePatients: 2 }],
        }
      }
      fixture.unexpected.push(command)
      throw new Error(`Invoke sem fixture: ${command}`)
    } }
  })
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Comando do Círculo' })).toBeVisible()
  await command(page, 'Abrir Análises')
  const analytics = page.getByRole('region', { name: 'Análises', exact: true })
  await expect(analytics).toBeVisible()
  await expect.poll(() => requests(page)).toEqual(initialRequests)
  await expect(analytics.locator('.analytics-summary strong')).toHaveText(['7', '2'])
  return analytics
}

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

const requests = page => page.evaluate(() => window.analyticsControlsFixture.calls.filter(item => item.command === 'analytics_overview').map(item => item.args))
const month = { from: '2026-10-01', to: '2026-10-31', patientId: null }
const year = { from: '2025-11-01', to: '2026-10-31', patientId: null }
// main.jsx uses React StrictMode: mounting analytics invokes its read effect twice.
const initialRequests = [month, month]

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.analyticsControlsFixture?.unexpected || [])).toEqual([])
})

test('controles por voz: 12 meses, Este mês, paciente arquivado e Todos os pacientes', async ({ page, baseURL }) => {
  const analytics = await openAnalytics(page, baseURL)
  await command(page, 'Clicar em 12 meses')
  await expect(analytics.getByRole('button', { name: '12 meses', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(analytics.getByLabel('De', { exact: true })).toHaveValue(year.from)
  await expect(analytics.getByLabel('Até', { exact: true })).toHaveValue(year.to)
  await expect.poll(() => requests(page)).toEqual([...initialRequests, year])

  await command(page, 'Clicar em Este mês')
  await expect(analytics.getByRole('button', { name: 'Este mês', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(analytics.getByRole('button', { name: '12 meses', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(analytics.getByLabel('De', { exact: true })).toHaveValue(month.from)
  await expect(analytics.getByLabel('Até', { exact: true })).toHaveValue(month.to)
  await expect.poll(() => requests(page)).toEqual([...initialRequests, year, month])

  await command(page, 'Selecionar Paciente como Paciente Arquivado Fictício (arquivado)')
  await expect(analytics.getByLabel('Paciente', { exact: true })).toHaveValue('synthetic-archived')
  await expect.poll(() => requests(page)).toEqual([...initialRequests, year, month, { ...month, patientId: 'synthetic-archived' }])
  await expect(analytics.locator('.analytics-summary strong')).toHaveText(['0', '0'])
  await expect(analytics.getByRole('table')).toHaveCount(0)

  await command(page, 'Selecionar Paciente como Todos os pacientes')
  await expect(analytics.getByLabel('Paciente', { exact: true })).toHaveValue('')
  await expect.poll(() => requests(page)).toEqual([...initialRequests, year, month, { ...month, patientId: 'synthetic-archived' }, month])
  await expect(analytics.locator('.analytics-summary strong')).toHaveText(['7', '2'])
  expect(await page.evaluate(() => window.analyticsControlsFixture.calls.filter(item => item.command === 'patient_list').some(item => item.args.includeArchived === true))).toBe(true)
})

test('datas por voz: De/Até válidos, datas impossíveis e intervalo inválido sem consulta', async ({ page, baseURL }) => {
  const analytics = await openAnalytics(page, baseURL)
  await command(page, 'Preencher De com 01/09/2026')
  await expect(analytics.getByLabel('De', { exact: true })).toHaveValue('2026-09-01')
  await expect.poll(() => requests(page)).toEqual([...initialRequests, { ...month, from: '2026-09-01' }])
  await command(page, 'Preencher Até com 30/09/2026')
  const september = { from: '2026-09-01', to: '2026-09-30', patientId: null }
  await expect(analytics.getByLabel('Até', { exact: true })).toHaveValue(september.to)
  await expect.poll(() => requests(page)).toEqual([...initialRequests, { ...month, from: september.from }, september])
  await expect(analytics.getByRole('button', { name: 'Este mês', exact: true })).toHaveAttribute('aria-pressed', 'false')

  const validRequests = await requests(page)
  for (const [field, value] of [['De', '31/02/2026'], ['Até', '99/99/2026']]) {
    await propose(page, `Preencher ${field} com ${value}`)
    await expect(page.locator('.voice-command-error')).toContainText(`Valor inválido para “${field}”`)
    await expect(page.locator('.voice-command-preview')).toHaveCount(0)
    await page.clock.runFor(32)
    await expect(analytics.getByLabel('De', { exact: true })).toHaveValue(september.from)
    await expect(analytics.getByLabel('Até', { exact: true })).toHaveValue(september.to)
    expect(await requests(page)).toEqual(validRequests)
  }

  // Each date is valid on its own; analytics must reject the reversed range.
  await command(page, 'Preencher Até com 31/08/2026')
  await expect(analytics.getByLabel('Até', { exact: true })).toHaveValue('2026-08-31')
  await expect(analytics.getByRole('alert')).toContainText('ordem cronológica')
  await expect(analytics.locator('.analytics-summary')).toHaveCount(0)
  await expect(analytics.getByRole('table')).toHaveCount(0)
  expect(await requests(page)).toEqual(validRequests)

  await command(page, 'Preencher Até com 30/09/2026')
  await expect(analytics.getByRole('alert')).toHaveCount(0)
  await expect.poll(() => requests(page)).toEqual([...validRequests, september])
  await command(page, 'Preencher De com 01/01/2020')
  await expect(analytics.getByRole('alert')).toContainText('até cinco anos')
  await expect(analytics.locator('.analytics-summary')).toHaveCount(0)
  await expect(analytics.getByRole('table')).toHaveCount(0)
  expect(await requests(page)).toEqual([...validRequests, september])
})

test('erro de backend remove agregados anteriores; Tentar novamente por voz consulta os mesmos filtros', async ({ page, baseURL }) => {
  const analytics = await openAnalytics(page, baseURL)
  await expect(analytics.getByRole('table', { name: 'Comportamentos observados em números' })).toContainText('Observação sintética anterior')
  await expect(analytics.getByRole('table')).toHaveCount(3)
  await page.evaluate(() => { window.analyticsControlsFixture.fail = true })
  await command(page, 'Clicar em 12 meses')
  await expect.poll(() => requests(page)).toEqual([...initialRequests, year])
  await expect(analytics.getByRole('alert')).toContainText('Não foi possível carregar as análises')
  await expect(analytics.locator('.analytics-summary')).toHaveCount(0)
  await expect(analytics.getByRole('table')).toHaveCount(0)
  await expect(analytics.locator('.analytics-bars')).toHaveCount(0)
  await expect(analytics.getByText('Observação sintética anterior', { exact: true })).toHaveCount(0)

  await command(page, 'Clicar em Recarregar análises')
  await expect.poll(() => requests(page)).toEqual([...initialRequests, year, year])
  await expect(analytics.getByRole('alert')).toContainText('Não foi possível carregar')
  await expect(analytics.locator('.analytics-summary')).toHaveCount(0)
  await expect(analytics.getByRole('table')).toHaveCount(0)

  await page.evaluate(() => { window.analyticsControlsFixture.fail = false; window.analyticsControlsFixture.empty = true })
  await command(page, 'Clicar em Tentar novamente')
  await expect.poll(() => requests(page)).toEqual([...initialRequests, year, year, year])
  await expect(analytics.getByRole('alert')).toHaveCount(0)
  await expect(analytics.locator('.analytics-summary strong')).toHaveText(['0', '0'])
  await expect(analytics.getByText('Nenhuma sessão finalizada neste período. Ajuste as datas ou o paciente.', { exact: true })).toBeVisible()
  await expect(analytics.getByRole('table')).toHaveCount(0)
  await expect(analytics.locator('.analytics-bars')).toHaveCount(0)
  await expect(analytics.getByText('Observação sintética anterior', { exact: true })).toHaveCount(0)
  await expect(analytics.getByRole('button', { name: 'Recarregar análises', exact: true })).toHaveCount(0)
})
