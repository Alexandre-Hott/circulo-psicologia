import { expect, test } from '@playwright/test'

// Real App/DesktopVault/voice gateway and DOM handlers. IPC/storage below are
// synthetic: no native profile, file chooser, microphone, ASR or disk recovery.
// This proves UI authorization/IPC boundaries, not Rust cleanup/compatibility.
const password = 'senha-local-sintetica-79'
const editedPassword = 'senha-editada-sintetica-79'
const verifyLabel = 'Verificar cópia automática local'
const restoreLabel = 'Recuperar cópia automática local'
const passwordLabel = 'Senha local para verificar cópia automática'
const verifyCommand = `Clicar em ${verifyLabel}`
const restoreCommand = `Clicar em ${restoreLabel}`

async function openApp(page, options = {}) {
  await page.clock.install({ time: new Date('2026-10-04T15:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-04T15:00:00Z'))
  await page.addInitScript(({ validation = 'success', restore = 'success', present = true, keyEnvelopePresent = true, deferValidation = false, initiallyUnlocked = false }) => {
    let unlocked = initiallyUnlocked
    let validatedPassword = null
    const originalPatient = { id: 'original-synthetic-79', name: 'Paciente Original Fictício', age: 9, revision: 1, archivedAt: null }
    const restoredPatient = { id: 'restored-synthetic-79', name: 'Paciente Restaurado Fictício', age: 10, revision: 1, archivedAt: null }
    const fixture = window.autoRecoveryFixture = {
      calls: [], unexpected: [], clicks: [], mediaRequests: 0,
      validationPending: false, resolveValidation: null,
      database: 'original-synthetic', patients: [originalPatient],
    }
    document.addEventListener('click', event => {
      const button = event.target instanceof Element ? event.target.closest('button') : null
      const name = button?.textContent.trim()
      if (['Verificar cópia automática local', 'Recuperar cópia automática local'].includes(name)) fixture.clicks.push(name)
    }, true)
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: async () => { fixture.mediaRequests++; throw new Error('Microfone nativo proibido neste teste sintético') },
    } })
    const callbacks = new Map()
    let callbackId = 0
    window.__TAURI_INTERNALS__ = {
      transformCallback(callback) { const id = ++callbackId; callbacks.set(id, callback); return id },
      unregisterCallback(id) { callbacks.delete(id) },
      invoke: async (command, args = {}) => {
        fixture.calls.push({ command, args: structuredClone(args) })
        const rejectUnexpected = () => {
          fixture.unexpected.push({ command, args: structuredClone(args) })
          throw new Error(`IPC não autorizado pela fixture estrita: ${command}`)
        }
        if (command === 'vault_status') return { initialized: true, unlocked, profileState: 'ready' }
        if (command === 'auto_backup_status') return { present, keyEnvelopePresent, available: unlocked, dirty: false, lastVerifiedAt: null }
        if (command === 'plugin:updater|check') return null
        if (command === 'auto_backup_validate') {
          if (!present || !keyEnvelopePresent || Object.keys(args).join(',') !== 'password' || typeof args.password !== 'string' || !args.password) return rejectUnexpected()
          validatedPassword = null
          if (deferValidation) await new Promise(resolve => {
            fixture.validationPending = true
            fixture.resolveValidation = () => {
              fixture.validationPending = false
              fixture.resolveValidation = null
              resolve()
            }
          })
          if (validation === 'error') throw new Error('Erro sintético de verificação local 79')
          if (validation === 'false') return false
          validatedPassword = args.password
          return true
        }
        if (command === 'auto_backup_restore') {
          if (Object.keys(args).sort().join(',') !== 'confirmed,password' || args.confirmed !== true || args.password !== validatedPassword || !validatedPassword) return rejectUnexpected()
          if (restore === 'error') throw new Error('Recuperação local recusada sintética 79')
          fixture.database = 'restored-synthetic'
          fixture.patients = [restoredPatient]
          unlocked = true
          return null // Existing native command is awaited; no invented false-result contract.
        }
        if (unlocked && command === 'patient_list') return structuredClone(fixture.patients)
        if (unlocked && ['behavior_list', 'indicator_catalog', 'agenda_occurrences'].includes(command)) return []
        return rejectUnexpected()
      },
    }
  }, options)
  page.on('dialog', async dialog => {
    await dialog.dismiss()
    await page.evaluate(() => window.autoRecoveryFixture.unexpected.push({ command: 'native-dialog' }))
  })
  await page.goto('/')
  await expect(assistant(page)).toBeVisible()
  if (options.initiallyUnlocked) {
    await expect(page.getByRole('navigation', { name: 'Espaços do Círculo' })).toBeVisible()
    await applyCommand(page, 'Abrir ajustes')
    await expect(page.getByRole('button', { name: 'Ajustes', exact: true })).toHaveAttribute('aria-current', 'page')
  } else {
    await applyCommand(page, 'Clicar em Opções avançadas de backup e restauração')
    await expect(page.getByRole('navigation', { name: 'Espaços do Círculo' })).toHaveCount(0)
  }
  await expect(page.getByRole('region', { name: 'Backup e restauração' })).toBeVisible()
}

const assistant = page => page.getByRole('region', { name: 'Comando do Círculo' })
const preview = page => page.locator('.voice-command-preview')
const calls = (page, command) => page.evaluate(name => window.autoRecoveryFixture.calls.filter(call => call.command === name), command)
const clicks = page => page.evaluate(() => window.autoRecoveryFixture.clicks)

async function propose(page, text) {
  const field = assistant(page).getByLabel('Seu comando')
  await field.fill(text)
  await field.press('Control+Enter') // Existing UI route; no injected intent/callback, force or mouse-stability workaround.
  await page.clock.runFor(32)
}

async function applyCommand(page, text) {
  await propose(page, text)
  await expect(preview(page), text).toBeVisible()
  await propose(page, 'Confirmar')
  await expect(preview(page)).toHaveCount(0)
}

async function noRecovery(page) {
  expect(await calls(page, 'auto_backup_restore')).toEqual([])
  expect(await page.evaluate(() => window.autoRecoveryFixture.database)).toBe('original-synthetic')
  await expect(page.getByRole('navigation', { name: 'Espaços do Círculo' })).toHaveCount(0)
}

async function validate(page) {
  await page.getByLabel(passwordLabel, { exact: true }).fill(password)
  await propose(page, verifyCommand)
  await expect(preview(page)).toContainText(verifyLabel)
  await expect(preview(page)).not.toContainText(password)
  expect(await calls(page, 'auto_backup_validate')).toEqual([])
  expect(await clicks(page)).toEqual([])
  await noRecovery(page)
  await propose(page, 'Confirmar')
  await expect(page.getByText('Cópia automática local validada.', { exact: true })).toBeVisible()
  expect(await calls(page, 'auto_backup_validate')).toEqual([{ command: 'auto_backup_validate', args: { password } }])
  expect(await clicks(page)).toEqual([verifyLabel])
  await noRecovery(page)
}

async function openRecoveryConfirmation(page) {
  await propose(page, restoreCommand)
  await expect(preview(page)).toContainText(restoreLabel)
  await expect(preview(page)).not.toContainText(password)
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  expect(await clicks(page)).toEqual([verifyLabel])
  await noRecovery(page)
  await propose(page, 'Confirmar')
  await expect(page.getByRole('alertdialog', { name: 'Confirmar ação' })).toContainText('Substituir o banco local pela última cópia automática cifrada?')
  expect(await clicks(page)).toEqual([verifyLabel, restoreLabel])
  await noRecovery(page)
}

test.afterEach(async ({ page }) => {
  const diagnostics = await page.evaluate(() => ({ unexpected: window.autoRecoveryFixture?.unexpected ?? [], mediaRequests: window.autoRecoveryFixture?.mediaRequests ?? 0 }))
  expect(diagnostics.unexpected).toEqual([])
  expect(diagnostics.mediaRequests).toBe(0)
})

test('verificação automática local: preparar não clica; Confirmar verifica senha manual exata', async ({ page }) => {
  await openApp(page)
  await validate(page)
  await expect(page.getByRole('button', { name: restoreLabel, exact: true })).toBeEnabled()
  await expect(page.getByLabel(passwordLabel, { exact: true })).toHaveValue(password)
  await expect(preview(page)).toHaveCount(0)
})

for (const validation of ['false', 'error']) test(`verificação automática local: ${validation} limpa senha e não autoriza recuperação`, async ({ page }) => {
  await openApp(page, { validation })
  await page.getByLabel(passwordLabel, { exact: true }).fill(password)
  await propose(page, verifyCommand)
  await expect(preview(page)).toContainText(verifyLabel)
  expect(await calls(page, 'auto_backup_validate')).toEqual([])
  expect(await clicks(page)).toEqual([])
  await propose(page, 'Confirmar')
  await expect(page.getByText(validation === 'false' ? 'Error: Cópia automática local inválida.' : 'Error: Erro sintético de verificação local 79', { exact: true })).toBeVisible()
  await expect(page.getByLabel(passwordLabel, { exact: true })).toHaveValue('')
  await expect(page.getByRole('button', { name: restoreLabel, exact: true })).toHaveCount(0)
  expect(await calls(page, 'auto_backup_validate')).toEqual([{ command: 'auto_backup_validate', args: { password } }])
  expect(await clicks(page)).toEqual([verifyLabel])
  await noRecovery(page)
  await propose(page, restoreCommand)
  await expect(preview(page)).toHaveCount(0)
  await propose(page, 'Confirmar')
  await noRecovery(page)
  expect(await clicks(page)).toEqual([verifyLabel])
})

test('recuperação automática local: duas confirmações e exatamente um restore com alvo manual', async ({ page }) => {
  await openApp(page)
  await validate(page)
  await openRecoveryConfirmation(page)
  await propose(page, 'Confirmar')
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(page.getByText('Cópia automática local restaurada e verificada.', { exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Espaços do Círculo' })).toBeVisible()
  await expect(page.getByLabel(passwordLabel, { exact: true })).toHaveCount(0)
  expect(await calls(page, 'auto_backup_restore')).toEqual([{ command: 'auto_backup_restore', args: { password, confirmed: true } }])
  expect(await page.evaluate(() => ({ database: window.autoRecoveryFixture.database, ids: window.autoRecoveryFixture.patients.map(patient => patient.id) }))).toEqual({ database: 'restored-synthetic', ids: ['restored-synthetic-79'] })
  expect(await calls(page, 'patient_list')).not.toEqual([])
  await applyCommand(page, 'Abrir pacientes')
  await expect(page.locator('[data-voice-record="patient:restored-synthetic-79"]')).toContainText('Paciente Restaurado Fictício')
  await expect(page.locator('[data-voice-record="patient:original-synthetic-79"]')).toHaveCount(0)
  await propose(page, 'Confirmar')
  expect(await calls(page, 'auto_backup_restore')).toHaveLength(1)
  expect(await clicks(page)).toEqual([verifyLabel, restoreLabel])
})

test('recuperação automática local: Voltar cancela diálogo sem restore e remove validação', async ({ page }) => {
  await openApp(page)
  await validate(page)
  await openRecoveryConfirmation(page)
  await propose(page, 'Voltar')
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(page.getByLabel(passwordLabel, { exact: true })).toHaveValue('')
  await expect(page.getByRole('button', { name: restoreLabel, exact: true })).toHaveCount(0)
  await propose(page, 'Confirmar')
  await noRecovery(page)
  expect(await clicks(page)).toEqual([verifyLabel, restoreLabel])
})

test('recuperação automática local: IPC rejeitado preserva banco sintético e não anuncia sucesso', async ({ page }) => {
  await openApp(page, { restore: 'error' })
  await validate(page)
  await openRecoveryConfirmation(page)
  await propose(page, 'Confirmar')
  await expect(page.getByText('Error: Recuperação local recusada sintética 79', { exact: true })).toBeVisible()
  await expect(page.getByText('Cópia automática local restaurada e verificada.', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel(passwordLabel, { exact: true })).toHaveValue('')
  await expect(page.getByRole('button', { name: restoreLabel, exact: true })).toHaveCount(0)
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  expect(await calls(page, 'auto_backup_restore')).toEqual([{ command: 'auto_backup_restore', args: { password, confirmed: true } }])
  expect(await page.evaluate(() => ({ database: window.autoRecoveryFixture.database, ids: window.autoRecoveryFixture.patients.map(patient => patient.id) }))).toEqual({ database: 'original-synthetic', ids: ['original-synthetic-79'] })
  await expect(page.getByRole('navigation', { name: 'Espaços do Círculo' })).toHaveCount(0)
  await propose(page, 'Confirmar')
  expect(await calls(page, 'auto_backup_restore')).toHaveLength(1)
  expect(await clicks(page)).toEqual([verifyLabel, restoreLabel])
})

test('verificação automática local: editar senha manual não vazia invalida proposta anterior', async ({ page }) => {
  await openApp(page)
  await page.getByLabel(passwordLabel, { exact: true }).fill(password)
  await propose(page, verifyCommand)
  await expect(preview(page)).toContainText(verifyLabel)
  await page.getByLabel(passwordLabel, { exact: true }).fill(editedPassword)
  await expect(page.getByRole('button', { name: verifyLabel, exact: true })).toBeEnabled()
  await propose(page, 'Confirmar')
  expect(await calls(page, 'auto_backup_validate')).toEqual([])
  expect(await clicks(page)).toEqual([])
  await expect(page.getByLabel(passwordLabel, { exact: true })).toHaveValue(editedPassword)
  await expect(page.getByRole('button', { name: restoreLabel, exact: true })).toHaveCount(0)
  await noRecovery(page)
})

test('recuperação automática local: editar senha manual invalida proposta e validação anteriores', async ({ page }) => {
  await openApp(page)
  await validate(page)
  await propose(page, restoreCommand)
  await expect(preview(page)).toContainText(restoreLabel)
  await page.getByLabel(passwordLabel, { exact: true }).fill(editedPassword)
  await expect(page.getByRole('button', { name: restoreLabel, exact: true })).toHaveCount(0)
  await propose(page, 'Confirmar')
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(page.getByLabel(passwordLabel, { exact: true })).toHaveValue(editedPassword)
  expect(await calls(page, 'auto_backup_validate')).toHaveLength(1)
  expect(await clicks(page)).toEqual([verifyLabel])
  await noRecovery(page)
})

test('cópia automática local: controle desabilitado e recuperação ausente não autorizam cliques', async ({ page }) => {
  await openApp(page)
  await expect(page.getByRole('button', { name: verifyLabel, exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: restoreLabel, exact: true })).toHaveCount(0)
  for (const text of [verifyCommand, restoreCommand]) {
    await propose(page, text)
    await expect(preview(page)).toHaveCount(0)
    await propose(page, 'Confirmar')
    expect(await calls(page, 'auto_backup_validate')).toEqual([])
    expect(await clicks(page)).toEqual([])
    await noRecovery(page)
  }
})

test('cópia automática local: validação IPC pendente bloqueia novas tentativas durante busy', async ({ page }) => {
  await openApp(page, { deferValidation: true })
  await page.getByLabel(passwordLabel, { exact: true }).fill(password)
  await propose(page, verifyCommand)
  await expect(preview(page)).toContainText(verifyLabel)
  expect(await calls(page, 'auto_backup_validate')).toEqual([])
  expect(await clicks(page)).toEqual([])
  await propose(page, 'Confirmar')
  await expect.poll(() => page.evaluate(() => window.autoRecoveryFixture.validationPending)).toBe(true)
  await expect(page.getByRole('button', { name: verifyLabel, exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: restoreLabel, exact: true })).toHaveCount(0)

  const expectOnlyPendingValidation = async () => {
    expect(await calls(page, 'auto_backup_validate')).toEqual([{ command: 'auto_backup_validate', args: { password } }])
    expect(await clicks(page)).toEqual([verifyLabel])
    expect(await page.evaluate(() => window.autoRecoveryFixture.validationPending)).toBe(true)
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await noRecovery(page)
  }
  await expectOnlyPendingValidation()
  for (const text of [verifyCommand, restoreCommand]) {
    await propose(page, text)
    await expect(preview(page)).toHaveCount(0)
    await expectOnlyPendingValidation()
    await propose(page, 'Confirmar')
    await expect(preview(page)).toHaveCount(0)
    await expectOnlyPendingValidation()
  }

  // Resolve ONLY synthetic IPC, never a React callback or injected UI intent.
  await page.evaluate(() => window.autoRecoveryFixture.resolveValidation())
  await expect(page.getByText('Cópia automática local validada.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: verifyLabel, exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: restoreLabel, exact: true })).toBeEnabled()
  await expect(page.getByLabel(passwordLabel, { exact: true })).toHaveValue(password)
  expect(await page.evaluate(() => window.autoRecoveryFixture.validationPending)).toBe(false)
  // A refused busy command must not become an authorized proposal on completion.
  await propose(page, 'Confirmar')
  await expect(preview(page)).toHaveCount(0)
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  expect(await calls(page, 'auto_backup_validate')).toEqual([{ command: 'auto_backup_validate', args: { password } }])
  expect(await clicks(page)).toEqual([verifyLabel])
  await noRecovery(page)
})

for (const unavailable of ['copy', 'envelope']) test(`cópia automática local: ${unavailable} ausente recusa comandos sem IPC`, async ({ page }) => {
  await openApp(page, unavailable === 'copy' ? { present: false } : { keyEnvelopePresent: false })
  await expect(page.getByLabel(passwordLabel, { exact: true })).toHaveCount(0)
  for (const text of [verifyCommand, restoreCommand]) {
    await expect(page.getByRole('button', { name: text === verifyCommand ? verifyLabel : restoreLabel, exact: true })).toHaveCount(0)
    await propose(page, text)
    await expect(preview(page)).toHaveCount(0)
    await propose(page, 'Confirmar')
    expect(await calls(page, 'auto_backup_validate')).toEqual([])
    expect(await clicks(page)).toEqual([])
    await noRecovery(page)
  }
})

test('cópia automática local: preencher senha por voz é recusado e mantém valor manual', async ({ page }) => {
  await openApp(page)
  await page.getByLabel(passwordLabel, { exact: true }).fill(password)
  await propose(page, `Preencher ${passwordLabel} com ${editedPassword}`)
  await expect(preview(page)).toHaveCount(0)
  await expect(page.getByLabel(passwordLabel, { exact: true })).toHaveValue(password)
  await propose(page, 'Confirmar')
  await expect(page.getByLabel(passwordLabel, { exact: true })).toHaveValue(password)
  expect(await calls(page, 'auto_backup_validate')).toEqual([])
  expect(await clicks(page)).toEqual([])
  await noRecovery(page)
})

for (const aba of [false, true]) test(`verificação automática local locked: senha ${aba ? 'A→B→A' : 'A→B'} invalida proposta; nova preparação usa senha atual`, async ({ page }) => {
  await openApp(page)
  const field = page.getByLabel(passwordLabel, { exact: true })
  await field.fill(password)
  await propose(page, verifyCommand)
  await expect(preview(page)).toContainText(verifyLabel)
  expect(await calls(page, 'auto_backup_validate')).toEqual([])
  expect(await clicks(page)).toEqual([])
  await field.fill(editedPassword)
  if (aba) await field.fill(password)
  const currentPassword = aba ? password : editedPassword
  await expect(field).toHaveValue(currentPassword)
  await expect(page.getByRole('button', { name: verifyLabel, exact: true })).toBeEnabled()
  await propose(page, 'Confirmar')
  await expect(preview(page)).toHaveCount(0)
  expect(await clicks(page)).toEqual([])
  expect(await calls(page, 'auto_backup_validate')).toEqual([])
  await expect(page.getByRole('button', { name: restoreLabel, exact: true })).toHaveCount(0)
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await noRecovery(page)

  await propose(page, verifyCommand)
  await expect(preview(page)).toContainText(verifyLabel)
  await expect(preview(page)).not.toContainText(password)
  await expect(preview(page)).not.toContainText(editedPassword)
  expect(await clicks(page)).toEqual([])
  expect(await calls(page, 'auto_backup_validate')).toEqual([])
  await noRecovery(page)
  await propose(page, 'Confirmar')
  await expect(page.getByText('Cópia automática local validada.', { exact: true })).toBeVisible()
  await expect(field).toHaveValue(currentPassword)
  await expect(page.getByRole('button', { name: restoreLabel, exact: true })).toBeEnabled()
  expect(await clicks(page)).toEqual([verifyLabel])
  expect(await calls(page, 'auto_backup_validate')).toEqual([{ command: 'auto_backup_validate', args: { password: currentPassword } }])
  await noRecovery(page)
})

for (const label of [verifyLabel, restoreLabel]) test(`Ajustes desbloqueados: ${label} ausente e recusado sem clique ou IPC`, async ({ page }) => {
  await openApp(page, { initiallyUnlocked: true })
  // Settings is reachable while unlocked; its recovery controls require !unlocked.
  // Prove absence, never force that unreachable branch or inject React props.
  await expect(page.getByLabel(passwordLabel, { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: verifyLabel, exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: restoreLabel, exact: true })).toHaveCount(0)
  const before = await page.evaluate(() => ({ database: window.autoRecoveryFixture.database, patients: structuredClone(window.autoRecoveryFixture.patients) }))
  for (const text of [`Clicar em ${label}`, 'Confirmar']) {
    await propose(page, text)
    await expect(preview(page)).toHaveCount(0)
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Ajustes', exact: true })).toHaveAttribute('aria-current', 'page')
    expect(await clicks(page)).toEqual([])
    expect(await calls(page, 'auto_backup_validate')).toEqual([])
    expect(await calls(page, 'auto_backup_restore')).toEqual([])
    expect(await page.evaluate(() => ({ database: window.autoRecoveryFixture.database, patients: structuredClone(window.autoRecoveryFixture.patients) }))).toEqual(before)
  }
})
