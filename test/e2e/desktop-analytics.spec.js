import { expect, test } from '@playwright/test'

test('Análises: acesso, agregados, filtros, tabelas e período', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-05T12:00:00Z') })
  await page.addInitScript(() => {
    window.analyticsCalls = []
    window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { available: false, dirty: false }
      if (command === 'patient_list') return args?.includeArchived ? [{ id: 'p1', name: 'Paciente A', archivedAt: null }, { id: 'p2', name: 'Paciente B', archivedAt: '2026-09-01' }] : [{ id: 'p1', name: 'Paciente A', archivedAt: null }]
      if (command === 'agenda_occurrences') return []
      if (command === 'analytics_overview') {
        window.analyticsCalls.push(args)
        return args.patientId === 'p2' ? { totalCompletedSessions: 0, uniquePatients: 0, dailyCounts: [], monthlyCounts: [], behaviorCounts: [] } : { totalCompletedSessions: 3, uniquePatients: 2, dailyCounts: [{ date: '2026-10-02', count: 2 }, { date: '2026-10-03', count: 1 }], monthlyCounts: [{ month: '2026-10', count: 3 }], behaviorCounts: [{ templateId: 'behavior-a', templateVersion: 2, title: 'Observação A', occurrences: 2, uniquePatients: 1 }, { templateId: 'behavior-b', templateVersion: 2, title: 'Observação A', occurrences: 1, uniquePatients: 1 }, { templateId: 'behavior-a', templateVersion: 3, title: 'Observação A', occurrences: 1, uniquePatients: 1 }] }
      }
      if (command === 'plugin:updater|check') return null
      return null
    } }
  })
  await page.goto('/')
  await page.getByRole('region', { name: 'Início' }).getByRole('button', { name: /Análises/ }).click()
  const analytics = page.getByRole('region', { name: 'Análises' })
  await expect(analytics).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Análises' })).toHaveAttribute('aria-current', 'page')
  await expect(analytics.getByText('Sessões finalizadas no período').locator('..')).toContainText('3')
  await expect(analytics.getByRole('table', { name: 'Sessões por dia em números' })).toContainText('02/10/2026')
  await expect(analytics.getByRole('table', { name: 'Evolução mensal em números' })).toContainText('10/2026')
  const behaviorTable = analytics.getByRole('table', { name: 'Comportamentos observados em números' })
  await expect(behaviorTable.getByRole('rowheader', { name: 'Observação A · v2 · modelo behavior-a', exact: true })).toBeVisible()
  await expect(behaviorTable.getByRole('rowheader', { name: 'Observação A · v2 · modelo behavior-b', exact: true })).toBeVisible()
  await expect(behaviorTable.getByRole('rowheader', { name: 'Observação A · v3 · modelo behavior', exact: true })).toBeVisible()
  await expect(analytics.locator('.analytics-bars').last().getByText('Observação A · v2 · modelo behavior-a')).toBeVisible()
  await expect(analytics.getByText(/Não indicam traços estáveis nem diagnóstico/)).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.analyticsCalls[0])).toEqual({ from: '2026-10-01', to: '2026-10-31', patientId: null })
  await analytics.getByLabel('Paciente').selectOption('p2')
  await expect(analytics.getByText('Nenhuma sessão finalizada neste período.')).toBeVisible()
  await expect(analytics.getByLabel('Paciente')).toContainText('Paciente B (arquivado)')
  await expect.poll(() => page.evaluate(() => window.analyticsCalls.at(-1)?.patientId)).toBe('p2')
  await analytics.getByRole('button', { name: 'Hoje' }).click()
  await expect.poll(() => page.evaluate(() => window.analyticsCalls.at(-1))).toEqual({ from: '2026-10-05', to: '2026-10-05', patientId: 'p2' })
  await analytics.getByRole('textbox', { name: 'De' }).fill('2020-01-01')
  await expect(analytics.getByRole('alert')).toContainText('até cinco anos')
})

test('Análises: erro e tentativa novamente sem dados antigos', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-05T12:00:00Z') })
  await page.addInitScript(() => {
    window.analyticsFail = true
    window.__TAURI_INTERNALS__ = { invoke: async command => {
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { available: false, dirty: false }
      if (command === 'patient_list' || command === 'agenda_occurrences') return []
      if (command === 'analytics_overview') { if (window.analyticsFail) throw new Error('offline'); return { totalCompletedSessions: 0, uniquePatients: 0, dailyCounts: [], monthlyCounts: [], behaviorCounts: [] } }
      return null
    } }
  })
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Análises' }).click()
  const analytics = page.getByRole('region', { name: 'Análises' })
  await expect(analytics.getByRole('alert')).toContainText('Não foi possível carregar')
  await page.evaluate(() => { window.analyticsFail = false })
  await analytics.getByRole('button', { name: 'Tentar novamente' }).click()
  await expect(analytics.getByText('Nenhuma sessão finalizada neste período.')).toBeVisible()
  await expect(analytics.getByRole('table')).toHaveCount(0)
})
