import { expect, test } from '@playwright/test'

test('voz aguarda confirmação mesmo com autosave pendente e novo comando durante um save confirmado', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-05T12:00:00Z') })
  await page.addInitScript(() => {
    const patient = { id: 'patient-ana', name: 'Ana Clara', age: 8, archivedAt: null }
    const occurrence = { id: 'occ-ana', seriesId: 'series-ana', patientId: patient.id, date: '2026-10-05', originalDate: '2026-10-05', start: '15:00', end: '15:50', frequency: 'Semanal', modality: 'Presencial', status: 'scheduled', wasRescheduled: false }
    const draft = { id: 'draft-ana', patientId: patient.id, originalDate: '2026-10-05', observation: '', procedures: '', outcomeDecision: '', referralClosure: '', behaviorIds: [], indicators: [] }
    window.sessionSaveCalls = []
    window.resolveSessionSave = {}
    window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { available: false, dirty: false }
      if (command === 'patient_list') return [patient]
      if (command === 'behavior_list') return [{ id: 'behavior-help', title: 'Pede ajuda', archivedAt: null }]
      if (command === 'indicator_catalog') return []
      if (command === 'agenda_list_series' || command === 'agenda_history') return []
      if (command === 'agenda_occurrences') return [occurrence]
      if (command === 'session_draft_start') return draft
      if (['session_draft_list', 'session_timeline', 'session_addendum_list', 'case_context_list'].includes(command)) return []
      if (command === 'session_draft_save') {
        const number = window.sessionSaveCalls.push(structuredClone(args.input))
        if (number <= 2) await new Promise(resolve => { window.resolveSessionSave[number] = resolve })
        return { ...draft, ...args.input }
      }
      if (command === 'plugin:updater|check') return null
      return null
    } }
  })
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Espaços do Círculo' })
  await nav.getByRole('button', { name: 'Agenda' }).click()
  await page.getByRole('button', { name: 'Detalhes e ações' }).click()
  await page.getByRole('button', { name: /Iniciar sessão de Ana Clara/u }).click()
  const session = page.getByRole('form', { name: 'Rascunho de sessão sintética' })
  await expect(session).toBeVisible()
  await session.getByLabel('Observações descritivas').fill('Texto digitado antes da voz')
  await expect.poll(() => page.evaluate(() => window.sessionSaveCalls.length)).toBe(1)
  await expect.poll(() => page.evaluate(() => typeof window.resolveSessionSave[1])).toBe('function')

  const prepare = async command => {
    await nav.getByRole('button', { name: 'Início' }).click()
    const home = page.getByRole('region', { name: 'Comando do Círculo' })
    await home.getByRole('textbox', { name: 'Seu comando' }).fill(command)
    await home.getByRole('button', { name: 'Preparar rascunho' }).click()
    await page.getByRole('button', { name: 'Revisar no formulário' }).click()
    await expect(session).toBeVisible()
  }

  await prepare('Marcar comportamento Pede ajuda para Ana Clara na sessão')
  await expect(session.getByRole('checkbox', { name: /Pede ajuda/u })).toBeChecked()
  await page.evaluate(() => window.resolveSessionSave[1]())
  await page.waitForTimeout(750)
  await expect.poll(() => page.evaluate(() => window.sessionSaveCalls.length)).toBe(1)
  await expect(page.getByRole('status').filter({ hasText: 'Alteração de voz ainda não salva' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.sessionSaveCalls[0].behaviorIds)).toEqual([])

  await session.getByRole('button', { name: 'Salvar rascunho' }).click()
  await expect.poll(() => page.evaluate(() => window.sessionSaveCalls.length)).toBe(2)
  await expect.poll(() => page.evaluate(() => window.sessionSaveCalls[1].behaviorIds)).toEqual(['behavior-help'])
  await prepare('Registrar observação da sessão de Ana Clara com Texto recebido depois do clique anterior')
  await expect(session.getByLabel('Observações descritivas')).toHaveValue('Texto recebido depois do clique anterior')
  await page.evaluate(() => window.resolveSessionSave[2]())
  await page.waitForTimeout(750)
  await expect.poll(() => page.evaluate(() => window.sessionSaveCalls.length)).toBe(2)
  await expect(page.getByRole('status').filter({ hasText: 'Alteração de voz ainda não salva' })).toBeVisible()
  await session.getByRole('button', { name: 'Salvar rascunho' }).click()
  await expect.poll(() => page.evaluate(() => window.sessionSaveCalls.length)).toBe(3)
  await expect.poll(() => page.evaluate(() => window.sessionSaveCalls[2].observation)).toBe('Texto recebido depois do clique anterior')
})
