import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/test/e2e/fixtures/voice-command-center.html')
})

test('typed command emits only a preview intent; it does not save or run a command', async ({ page }) => {
  await page.getByLabel('Seu comando').fill('Cadastrar paciente Bia de Teste com 8 anos')
  await page.getByRole('button', { name: 'Preparar rascunho' }).click()
  await expect(page.locator('.voice-command-preview')).toContainText('Bia de Teste')
  await expect(page.getByLabel('Intent emitted')).toContainText('patient.create')
  await expect(page.getByLabel('Intent emitted')).toContainText('Bia de Teste')
  await expect(page.getByText('Nada foi salvo nem alterado.')).toBeVisible()
})

test('microphone button calls the supplied transcription prop and previews its text intent', async ({ page }) => {
  await page.getByRole('button', { name: 'Ditar comando' }).click()
  await expect(page.locator('.voice-command-preview')).toContainText('Ana Clara')
  await expect(page.getByLabel('Intent emitted')).toContainText('appointment.recurring.create')
  await expect(page.getByLabel('Intent emitted')).toContainText('15:00')
})

test('session behavior is targeted to the active patient and session draft', async ({ page }) => {
  await page.getByLabel('Seu comando').fill('Marcar comportamento Pede ajuda para Ana Clara na sessão')
  await page.getByRole('button', { name: 'Preparar rascunho' }).click()
  await expect(page.getByLabel('Intent emitted')).toContainText('synthetic-draft-1')
  await expect(page.getByLabel('Intent emitted')).toContainText('synthetic-ana')
  await expect(page.locator('.voice-command-preview')).toContainText('não define o paciente')
})

test('unsupported command is refused and emits no intent', async ({ page }) => {
  await page.getByLabel('Seu comando').fill('Faça qualquer coisa que achar melhor')
  await page.getByRole('button', { name: 'Preparar rascunho' }).click()
  await expect(page.locator('.voice-command-error')).toContainText('Ainda não reconheço esse comando')
  await expect(page.getByLabel('Intent emitted')).toBeEmpty()
})
