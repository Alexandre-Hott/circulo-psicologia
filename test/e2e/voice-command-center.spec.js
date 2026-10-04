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

test('microphone only fills editable transcript; interpretation requires explicit click', async ({ page }) => {
  await page.getByRole('button', { name: 'Ouvir comando' }).click()
  await expect.poll(() => page.evaluate(() => window.__transcribePatientNames)).toEqual(['Ana Clara', 'Caio Fictício'])
  await expect.poll(() => page.evaluate(() => window.__transcribePatientNamesReference)).toEqual(['', ''])
  const command = page.getByLabel('Seu comando')
  await expect(command).toHaveValue('Ajendar seçao semanal para Ana Clara toda quinta às 15:00')
  await expect(page.locator('.voice-command-preview')).toContainText('Nada foi interpretado ou salvo')
  await expect(page.getByLabel('Intent emitted')).toBeEmpty()
  await page.getByRole('button', { name: 'Preparar rascunho' }).click()
  await expect(page.locator('.voice-command-error')).toContainText('Ainda não reconheço esse comando')
  await expect(page.getByLabel('Intent emitted')).toBeEmpty()
  await command.fill('Adicionar uma sessão semanal para Ana Clara toda quinta às 15:00')
  await page.getByRole('button', { name: 'Preparar rascunho' }).click()
  await expect(page.locator('.voice-command-preview')).toContainText('Ana Clara')
  await expect(page.getByLabel('Intent emitted')).toContainText('appointment.recurring.create')
  await expect(page.getByLabel('Intent emitted')).toContainText('15:00')
})

test('microphone permission error is explained and typed fallback remains usable', async ({ page }) => {
  await page.goto('/test/e2e/fixtures/voice-command-center.html?voiceFail=permission')
  await page.getByRole('button', { name: 'Ouvir comando' }).click()
  await expect(page.locator('.voice-command-error')).toContainText('O acesso ao microfone foi bloqueado')
  await expect.poll(() => page.evaluate(() => window.__transcribePatientNamesReference)).toEqual(['', ''])
  const command = page.getByLabel('Seu comando')
  await expect(command).toBeEditable()
  await command.fill('Cadastrar paciente Bia de Teste com 8 anos')
  await page.getByRole('button', { name: 'Preparar rascunho' }).click()
  await expect(page.locator('.voice-command-preview')).toContainText('Bia de Teste')
})

test('transcription with a pause after patient prepares an editable patient draft', async ({ page }) => {
  await page.goto('/test/e2e/fixtures/voice-command-center.html?voiceTranscript=patient-pause')
  await page.getByRole('button', { name: 'Ouvir comando' }).click()
  const command = page.getByLabel('Seu comando')
  await expect(command).toHaveValue('Cadastrar paciente. Bia Fictância com 9 anos.')
  await page.getByRole('button', { name: 'Preparar rascunho' }).click()
  await expect(page.getByLabel('Intent emitted')).toContainText('patient.create')
  await expect(page.getByLabel('Intent emitted')).toContainText('Bia Fictância')
  await expect(page.getByText('Nada foi salvo nem alterado.')).toBeVisible()
})

test('session behavior is targeted to the active patient and session draft', async ({ page }) => {
  await page.getByLabel('Seu comando').fill('Marcar comportamento Pede ajuda para Ana Clara na sessão')
  await page.getByRole('button', { name: 'Preparar rascunho' }).click()
  await expect(page.getByLabel('Intent emitted')).toContainText('synthetic-draft-1')
  await expect(page.getByLabel('Intent emitted')).toContainText('synthetic-ana')
  await expect(page.locator('.voice-command-preview')).toContainText('não define o paciente')
})

test('recovers observed speech variants for recording a behavior without saving it', async ({ page }) => {
  await page.getByLabel('Seu comando').fill('Registrar comportamento, pede ajuda para Ana Clara na sesalibra-o')
  await page.getByRole('button', { name: 'Preparar rascunho' }).click()
  await expect(page.locator('.voice-command-preview')).toContainText('Pede ajuda')
  await expect(page.locator('.voice-command-preview')).toContainText('apenas nesta sessão')
  await expect(page.getByLabel('Intent emitted')).toContainText('session.draft.update')
})

test('unsupported command is refused and emits no intent', async ({ page }) => {
  await page.getByLabel('Seu comando').fill('Faça qualquer coisa que achar melhor')
  await page.getByRole('button', { name: 'Preparar rascunho' }).click()
  await expect(page.locator('.voice-command-error')).toContainText('Ainda não reconheço esse comando')
  await expect(page.getByLabel('Intent emitted')).toBeEmpty()
})

test('changing a prepared command discards its previous draft', async ({ page }) => {
  const command = page.getByLabel('Seu comando')
  await command.fill('Cadastrar paciente Bia de Teste com 8 anos')
  await page.getByRole('button', { name: 'Preparar rascunho' }).click()
  await expect(page.getByLabel('Intent emitted')).toContainText('patient.create')
  await command.fill('Faça qualquer coisa que achar melhor')
  await expect(page.getByLabel('Intent emitted')).toBeEmpty()
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  await page.getByRole('button', { name: 'Preparar rascunho' }).click()
  await expect(page.locator('.voice-command-error')).toContainText('Ainda não reconheço esse comando')
  await expect(page.getByLabel('Intent emitted')).toBeEmpty()
})

test('a late transcription cannot overwrite text typed during capture', async ({ page }) => {
  await page.goto('/test/e2e/fixtures/voice-command-center.html?voiceTranscript=deferred')
  await page.getByRole('button', { name: 'Ouvir comando' }).click()
  await expect.poll(() => page.evaluate(() => typeof window.__resolveVoiceTranscript)).toBe('function')
  const command = page.getByLabel('Seu comando')
  await command.fill('Cadastrar paciente Bia de Teste com 8 anos')
  await page.evaluate(() => window.__resolveVoiceTranscript('Marcar sessão semanal para Ana Clara toda quinta às 15:00'))
  await expect(page.getByRole('button', { name: 'Ouvir comando' })).toBeEnabled()
  await expect(command).toHaveValue('Cadastrar paciente Bia de Teste com 8 anos')
  await expect(page.getByLabel('Intent emitted')).toBeEmpty()
})

for (const mode of ['empty', 'permission', 'transcript']) test(`nova transcrição ${mode} descarta intenção anterior antes de mostrar outro resultado`, async ({ page }) => {
  await page.goto(`/test/e2e/fixtures/voice-command-center.html?${mode === 'permission' ? 'voiceFail=permission' : mode === 'empty' ? 'voiceTranscript=deferred' : ''}`)
  await page.getByLabel('Seu comando').fill('Cadastrar paciente Bia de Teste com 8 anos')
  await page.getByRole('button', { name: 'Preparar rascunho' }).click()
  await expect(page.getByLabel('Intent emitted')).toContainText('patient.create')
  await page.getByRole('button', { name: 'Ouvir comando' }).click()
  if (mode === 'empty') {
    await expect.poll(() => page.evaluate(() => typeof window.__resolveVoiceTranscript)).toBe('function')
    await page.evaluate(() => window.__resolveVoiceTranscript(''))
  }
  await expect(page.getByRole('button', { name: 'Ouvir comando' })).toBeEnabled()
  await expect(mode === 'transcript' ? page.locator('.voice-command-preview') : page.locator('.voice-command-error')).toBeVisible()
  await expect(page.getByLabel('Intent emitted')).toBeEmpty()
})

test('erro tardio de áudio não descarta proposta nova digitada durante a captura', async ({ page }) => {
  await page.goto('/test/e2e/fixtures/voice-command-center.html?voiceTranscript=deferred')
  await page.getByRole('button', { name: 'Ouvir comando' }).click()
  await expect.poll(() => page.evaluate(() => typeof window.__rejectVoiceTranscript)).toBe('function')
  await page.getByLabel('Seu comando').fill('Cadastrar paciente Bia de Teste com 8 anos')
  await page.getByRole('button', { name: 'Preparar rascunho' }).click()
  const before = await page.getByLabel('Intent emitted').textContent()
  await page.evaluate(() => window.__rejectVoiceTranscript(new Error('Erro antigo fictício')))
  await expect(page.getByRole('button', { name: 'Ouvir comando' })).toBeEnabled()
  await expect(page.getByLabel('Intent emitted')).toHaveText(before)
  await expect(page.locator('.voice-command-preview')).toContainText('Bia de Teste')
  await expect(page.locator('.voice-command-error')).toHaveCount(0)
})
