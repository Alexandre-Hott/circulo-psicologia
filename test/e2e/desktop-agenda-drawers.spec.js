import { expect, test } from '@playwright/test'

for (const width of [1100, 390]) {
  test(`Agenda abre o detalhe correto por ID e restaura foco em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.clock.install({ time: new Date('2026-10-05T12:00:00Z') })
    await page.addInitScript(() => {
      const patients = [
        { id: 'p1', name: 'Nome Repetido', archivedAt: null },
        { id: 'p2', name: 'Nome Repetido', archivedAt: '2026-09-01' },
      ]
      const occurrences = [
        { id: 'first', patientId: 'p1', date: '2026-10-05', start: '09:00', end: '09:50', status: 'scheduled', modality: 'Presencial' },
        { id: 'second', patientId: 'p2', date: '2026-10-05', start: '11:00', end: '11:50', status: 'completed', modality: 'Online', meetingLink: 'https://example.invalid/sintetico', wasRescheduled: true, originalDate: '2026-10-04' },
        { id: 'third', patientId: 'p2', date: '2026-10-05', start: '15:00', end: '15:50', status: 'scheduled', modality: 'Presencial' },
      ].map(item => ({ ...item, originalDate: item.originalDate || item.date, seriesId: item.id, frequency: 'Avulsa' }))
      window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
        if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
        if (command === 'auto_backup_status') return { available: false, dirty: false }
        if (command === 'patient_list') return patients
        if (command === 'agenda_list_series') return [{ id: 'series-1', patientId: 'p1', frequency: 'Semanal', start: '09:00', end: '09:50', startDate: '2026-10-01', endDate: null, modality: 'Presencial' }]
        if (command === 'agenda_history') return []
        if (command === 'agenda_occurrences') return occurrences.filter(item => item.date >= args.from && item.date <= args.to)
        if (command === 'plugin:updater|check') return null
        return null
      } }
    })
    await page.goto('/')
    await page.getByRole('button', { name: 'Abrir Agenda' }).click()
    await expect(page.getByRole('region', { name: 'Calendário semana' })).toBeVisible()
    const createToggle = page.getByRole('region', { name: 'Novo compromisso' }).getByRole('button', { name: 'Novo compromisso' })
    await expect(createToggle).toHaveAttribute('aria-expanded', 'false')
    await createToggle.click()
    await expect(page.getByRole('form', { name: 'Novo compromisso' })).toBeVisible()
    await expect(page.getByText('Recolher ou trocar de espaço mantém este rascunho')).toBeVisible()
    await page.getByLabel('Data do compromisso').fill('2026-10-09')
    await page.getByLabel('Horário inicial').fill('10:30')
    await expect(page.getByRole('region', { name: 'Calendário semana' })).toBeVisible()
    await createToggle.click()
    await createToggle.click()
    await expect(page.getByLabel('Data do compromisso')).toHaveValue('2026-10-09')
    await expect(page.getByLabel('Horário inicial')).toHaveValue('10:30')
    await page.getByRole('button', { name: 'Início' }).click()
    await page.getByRole('button', { name: 'Abrir Agenda' }).click()
    await expect(page.getByLabel('Data do compromisso')).toHaveValue('2026-10-09')
    await createToggle.click()
    const detailsToggle = page.getByRole('button', { name: 'Detalhes e ações' })
    await expect(detailsToggle).toHaveAttribute('aria-expanded', 'false')
    await detailsToggle.click()
    await expect(page.locator('#agenda-detail-first')).toBeFocused()
    await page.getByRole('button', { name: 'Fechar detalhes' }).click()
    await expect(detailsToggle).toBeFocused()
    await expect(page.getByRole('button', { name: 'Compromissos persistidos' })).toHaveAttribute('aria-expanded', 'false')
    const historyToggle = page.getByRole('region', { name: 'Histórico administrativo' }).getByRole('button', { name: 'Histórico administrativo' })
    await expect(historyToggle).toHaveAttribute('aria-expanded', 'false')
    await historyToggle.click()
    await expect(historyToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByText('Nenhuma ação registrada.')).toBeVisible()
    await historyToggle.click()
    const completed = page.getByRole('region', { name: 'Calendário semana' }).getByRole('button', { name: 'Ver ações de Nome Repetido em 2026-10-05 às 11:00–11:50' })
    await completed.click()
    const detail = page.locator('#agenda-detail-second')
    await expect(detail).toBeFocused()
    await expect(detail).toContainText('11:00–11:50')
    await expect(detail).toContainText('Realizada · Online · Remarcada')
    await expect(detail).toContainText('Data original: 2026-10-04')
    await expect(detail).toContainText('https://example.invalid/sintetico')
    await expect(detail.getByRole('button', { name: /Alterar|Iniciar/ })).toHaveCount(0)
    await page.getByRole('button', { name: 'Fechar detalhes' }).click()
    await expect(completed).toBeFocused()
    const archived = page.getByRole('region', { name: 'Calendário semana' }).getByRole('button', { name: 'Ver ações de Nome Repetido em 2026-10-05 às 15:00–15:50' })
    await archived.click()
    await expect(page.locator('#agenda-detail-third')).toBeFocused()
    await expect(page.locator('#agenda-detail-third').getByRole('button', { name: /Iniciar/ })).toHaveCount(0)
    await expect(page.locator('#agenda-detail-third').getByRole('button', { name: /Alterar/ })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Calendário semana' })).toBeVisible()
    await page.getByRole('button', { name: 'Fechar detalhes' }).click()
    await page.getByRole('group', { name: 'Visualização da Agenda' }).getByRole('button', { name: 'Dia' }).click()
    const dayEvent = page.getByRole('region', { name: 'Calendário dia' }).getByRole('button', { name: 'Ver ações de Nome Repetido em 2026-10-05 às 09:00–09:50' })
    await dayEvent.click()
    await expect(page.locator('#agenda-detail-first')).toBeFocused()
    await page.getByRole('button', { name: 'Fechar detalhes' }).click()
    await expect(dayEvent).toBeFocused()
    await page.getByRole('region', { name: 'Calendário dia' }).getByRole('button', { name: 'Alterar ocorrência de Nome Repetido em 2026-10-05 às 09:00–09:50' }).click()
    await expect(page.getByRole('form', { name: 'Alterar ocorrência individual' })).toBeVisible()
    await expect(detailsToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(detailsToggle).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Fechar detalhes' })).toBeDisabled()
    await page.getByRole('form', { name: 'Alterar ocorrência individual' }).getByRole('button', { name: 'Fechar' }).click()
    await expect(detailsToggle).toBeEnabled()
    const persistedToggle = page.getByRole('button', { name: 'Compromissos persistidos' })
    await persistedToggle.click()
    await page.getByRole('button', { name: 'Encerrar série de Nome Repetido · série series-1' }).click()
    await expect(page.getByRole('form', { name: 'Encerrar série recorrente' })).toBeVisible()
    await expect(persistedToggle).toBeDisabled()
    await page.getByRole('form', { name: 'Encerrar série recorrente' }).getByRole('button', { name: 'Voltar' }).click()
    await expect(persistedToggle).toBeEnabled()
  })
}
