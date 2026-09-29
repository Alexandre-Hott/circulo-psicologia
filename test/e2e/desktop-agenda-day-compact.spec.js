import { expect, test } from '@playwright/test'

for (const width of [1100, 390]) {
  test(`dia compacto mantém ordem, ações e estado vazio em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.addInitScript(() => {
      const patient = { id: 'patient-day', name: 'Paciente Fictício', archivedAt: null, revision: 1 }
      const appointments = [
        { id: 'late', date: '2026-10-05', start: '16:00', end: '16:50', status: 'completed' },
        { id: 'early', date: '2026-10-05', start: '09:00', end: '09:50', status: 'scheduled' },
        { id: 'middle', date: '2026-10-05', start: '14:00', end: '14:50', status: 'scheduled', wasRescheduled: true },
      ].map(item => ({ ...item, seriesId: item.id, originalDate: item.date, patientId: patient.id, frequency: 'Avulsa', modality: 'Presencial' }))
      window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
        if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
        if (command === 'auto_backup_status') return { available: true, keyEnvelopePresent: true, dirty: false, error: null }
        if (command === 'patient_list') return [patient]
        if (command === 'agenda_list_series' || command === 'agenda_history') return []
        if (command === 'agenda_occurrences') return appointments.filter(item => item.date >= args.from && item.date <= args.to)
        throw new Error(`Comando inesperado: ${command}`)
      } }
    })
    await page.goto('/')
    await page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Abrir Agenda' }).click()
    await page.getByRole('group', { name: 'Visualização da Agenda' }).getByRole('button', { name: 'Dia' }).click()
    await page.getByLabel('Data de referência').fill('2026-10-05')

    const calendar = page.getByRole('region', { name: 'Calendário dia' })
    const items = calendar.locator('.agenda-day-list li')
    await expect(items).toHaveCount(3)
    await expect(calendar.locator('.agenda-time-rail')).toHaveCount(0)
    await expect(items.nth(0)).toContainText('09:00–09:50')
    await expect(items.nth(1)).toContainText('14:00–14:50')
    await expect(items.nth(1)).toContainText('Remarcada')
    await expect(items.nth(2)).toContainText('Realizada')
    await expect(items.nth(2).getByRole('button', { name: /Alterar|Iniciar/ })).toHaveCount(0)

    const alter = items.nth(0).getByRole('button', { name: /Alterar ocorrência/ })
    await alter.click()
    const form = page.getByRole('form', { name: 'Alterar ocorrência individual' })
    await expect(form).toBeFocused()
    await form.getByRole('button', { name: 'Fechar' }).click()
    await expect(alter).toBeFocused()

    await page.getByLabel('Data de referência').fill('2026-10-06')
    await expect(calendar.locator('.agenda-day-list li')).toHaveCount(0)
    await expect(calendar.getByText('Nenhum compromisso neste período.')).toBeVisible()
  })
}
