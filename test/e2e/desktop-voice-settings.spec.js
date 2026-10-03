import { expect, test } from '@playwright/test'

// UI/voice are real; native file dialogs, updater and storage are synthetic.
async function openApp(page, update = false) {
  const options = typeof update === 'object' ? update : { update }
  await page.clock.install({ time: new Date('2026-10-03T15:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-03T15:00:00Z'))
  await page.addInitScript(({ update = false, checkFailure = false, agendaFailure = false, initiallyLocked = false, initialized = true }) => {
    let unlocked = !initiallyLocked
    let hasVault = initialized
    let downloads = 0
    window.settingsFixture = { calls: [], unexpected: [], checkFailure, agendaFailure, timeline: [], patients: [{ id: 'ana', name: 'Ana Clara', age: 8, revision: 1, archivedAt: null }], backupPreview: null, backupSelectError: '', backupRestoreError: '', backupRestoreResult: true, backupRestorePatients: null }
    const callbacks = new Map()
    window.__TAURI_INTERNALS__ = {
      transformCallback(callback) { const id = callbacks.size + 1; callbacks.set(id, callback); return id },
      unregisterCallback(id) { callbacks.delete(id) },
      invoke: async (command, args = {}) => {
        window.settingsFixture.calls.push({ command, args: structuredClone(args) })
        if (command === 'vault_status') return { initialized: hasVault, unlocked, profileState: hasVault ? 'ready' : 'empty' }
        if (command === 'vault_unlock' || command === 'vault_create') { hasVault = true; unlocked = true; return null }
        if (command === 'vault_lock') { unlocked = false; return null }
        if (command === 'auto_backup_status') return { available: false, dirty: false }
        if (command === 'auto_backup_retry') return { available: true, dirty: false, lastVerifiedAt: 1791039600 }
        if (command === 'recovery_inventory') return { categories: [], eligibleCount: 0, eligibleBytes: 0, cleanupBlocked: false }
        if (command === 'patient_list') return structuredClone(window.settingsFixture.patients.filter(patient => args.includeArchived || patient.archivedAt == null))
        if (command === 'agenda_occurrences' && window.settingsFixture.agendaFailure) throw new Error('Falha sintética da prévia da Agenda')
        if (command === 'session_timeline') return structuredClone(window.settingsFixture.timeline.filter(session => session.patientId === args.patientId))
        if (['behavior_list', 'indicator_catalog', 'agenda_list_series', 'agenda_history', 'agenda_occurrences', 'related_party_list', 'session_timeline', 'session_draft_list', 'session_addendum_list', 'case_context_list'].includes(command)) return []
        if (command === 'record_copy_export' || command === 'backup_create') return false // chooser cancelled; no file
        if (command === 'backup_select') {
          if (window.settingsFixture.backupSelectError) throw new Error(window.settingsFixture.backupSelectError)
          return structuredClone(window.settingsFixture.backupPreview)
        }
        if (command === 'backup_restore') {
          if (window.settingsFixture.backupRestoreError) throw new Error(window.settingsFixture.backupRestoreError)
          if (window.settingsFixture.backupRestoreResult && window.settingsFixture.backupRestorePatients) window.settingsFixture.patients = structuredClone(window.settingsFixture.backupRestorePatients)
          return window.settingsFixture.backupRestoreResult
        }
        if (command === 'plugin:updater|check') {
          if (window.settingsFixture.checkFailure) throw new Error('Falha sintética de verificação')
          return update ? { rid: 1, currentVersion: '0.2.39', version: '0.2.40' } : null
        }
        if (command === 'plugin:resources|close') return null
        if (command === 'plugin:updater|download_and_install') {
          if (++downloads === 1) throw new Error('Falha sintética de download')
          const callback = callbacks.get(args.onEvent.id)
          callback?.({ index: 0, message: { event: 'Finished' } })
          return null
        }
        window.settingsFixture.unexpected.push(command)
        throw new Error(`Invoke sem fixture: ${command}`)
      },
    }
  }, options)
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Comando do Círculo' })).toBeVisible()
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

const calls = (page, command) => page.evaluate(name => window.settingsFixture.calls.filter(item => item.command === name), command)
test.afterEach(async ({ page }) => expect(await page.evaluate(() => window.settingsFixture?.unexpected || [])).toEqual([]))

async function selectSyntheticBackup(page) {
  await command(page, 'Abrir ajustes')
  // Passwords and the file chooser remain manual. No native file is opened here.
  await page.locator('#backup-password').fill('backup-ficticio-2026')
  await page.evaluate(() => { window.settingsFixture.backupPreview = { schemaVersion: 5, createdAt: 1791039600, sizeBytes: 4096, profileState: 'ready', replacesExisting: true } })
  await command(page, 'Clicar em Selecionar e verificar backup')
  await expect(page.getByText(/Backup verificado · formato v1/)).toBeVisible()
}

test('backup por comando: controle desabilitado e chooser cancelado nunca restauram', async ({ page }) => {
  await openApp(page)
  await command(page, 'Abrir ajustes')
  await propose(page, 'Clicar em Selecionar e verificar backup')
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  expect(await calls(page, 'backup_select')).toHaveLength(0)
  await page.locator('#backup-password').fill('backup-ficticio-2026')
  await command(page, 'Clicar em Selecionar e verificar backup')
  await expect(page.getByText('Seleção de backup cancelada.')).toBeVisible()
  expect(await calls(page, 'backup_select')).toEqual([{ command: 'backup_select', args: { password: 'backup-ficticio-2026' } }])
  await expect(page.getByRole('button', { name: 'Confirmar restauração', exact: true })).toHaveCount(0)
  expect(await calls(page, 'backup_restore')).toHaveLength(0)
})

test('backup por comando: erro de seleção remove prévia e nova seleção verifica novamente', async ({ page }) => {
  await openApp(page)
  await selectSyntheticBackup(page)
  await page.evaluate(() => { window.settingsFixture.backupSelectError = 'Falha fictícia de leitura do backup' })
  await command(page, 'Clicar em Selecionar e verificar backup')
  await expect(page.getByRole('alert')).toContainText('Falha fictícia de leitura do backup')
  await expect(page.getByText(/Backup verificado · formato v1/)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Confirmar restauração', exact: true })).toHaveCount(0)
  await page.evaluate(() => { window.settingsFixture.backupSelectError = '' })
  await command(page, 'Clicar em Selecionar e verificar backup')
  await expect(page.getByText(/Backup verificado · formato v1/)).toBeVisible()
  expect(await calls(page, 'backup_select')).toHaveLength(3)
  expect(await calls(page, 'backup_restore')).toHaveLength(0)
})

test('backup por comando: recusa não restaura; aceitar exige senha manual e confirmação explícita', async ({ page }) => {
  await openApp(page)
  await selectSyntheticBackup(page)
  await page.evaluate(() => { window.settingsFixture.backupRestorePatients = [{ id: 'restored-lia', name: 'Lia do Backup Fictício', age: 22, revision: 1, archivedAt: null }] })
  await propose(page, 'Preencher Senha atual do cofre local com local-ficticio-2026')
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  await expect(page.locator('#local-restore-password')).toHaveValue('')
  await page.locator('#local-restore-password').fill('local-ficticio-2026')
  await command(page, 'Clicar em Confirmar restauração')
  await expect(page.getByRole('alertdialog')).toContainText('SUBSTITUIR o único perfil local')
  expect(await calls(page, 'backup_restore')).toHaveLength(0)
  await propose(page, 'voltar')
  await expect(page.locator('#local-restore-password')).toHaveValue('local-ficticio-2026')
  expect(await calls(page, 'backup_restore')).toHaveLength(0)
  expect(await page.evaluate(() => window.settingsFixture.patients.map(patient => patient.id))).toEqual(['ana'])
  await command(page, 'Clicar em Confirmar restauração')
  await propose(page, 'confirmar')
  await expect(page.getByText('Restauração concluída. O cofre local está desbloqueado.')).toBeVisible()
  expect(await calls(page, 'backup_restore')).toEqual([{ command: 'backup_restore', args: { backupPassword: 'backup-ficticio-2026', localPassword: 'local-ficticio-2026', confirmed: true, quarantineConfirmed: false } }])
  await expect(page.locator('#backup-password')).toHaveValue('')
  await expect(page.getByText(/Backup verificado · formato v1/)).toHaveCount(0)
  await command(page, 'Abrir pacientes')
  await expect(page.locator('[data-voice-record="patient:restored-lia"]')).toContainText('Lia do Backup Fictício')
  await expect(page.locator('[data-voice-record="patient:ana"]')).toHaveCount(0)
})

for (const outcome of ['cancelada', 'falhou']) test(`backup por comando: restauração ${outcome} não anuncia sucesso`, async ({ page }) => {
  await openApp(page)
  await selectSyntheticBackup(page)
  await page.locator('#local-restore-password').fill('local-ficticio-2026')
  await page.evaluate(outcome => {
    window.settingsFixture.backupRestoreResult = false
    if (outcome === 'falhou') window.settingsFixture.backupRestoreError = 'Falha fictícia de restauração'
  }, outcome)
  await command(page, 'Clicar em Confirmar restauração')
  await propose(page, 'confirmar')
  if (outcome === 'cancelada') await expect(page.getByText('Restauração cancelada. Nenhum cofre foi criado.')).toBeVisible()
  else await expect(page.getByRole('alert')).toContainText('Falha fictícia de restauração')
  await expect(page.getByText('Restauração concluída. O cofre local está desbloqueado.')).toHaveCount(0)
  expect(await calls(page, 'backup_restore')).toHaveLength(1)
  await command(page, 'Abrir pacientes')
  await expect(page.locator('[data-voice-record="patient:ana"]')).toContainText('Ana Clara')
})

test('Início: retry da prévia e navegação por voz sem mutação', async ({ page }) => {
  await openApp(page, { agendaFailure: true })
  await expect(page.getByText('Não foi possível consultar a agenda agora.')).toBeVisible()
  const before = (await calls(page, 'agenda_occurrences')).length
  await page.evaluate(() => { window.settingsFixture.agendaFailure = false })
  await command(page, 'Clicar em Tentar novamente')
  await expect(page.getByText('Nenhum compromisso para hoje.')).toBeVisible()
  expect((await calls(page, 'agenda_occurrences')).length).toBeGreaterThan(before)
  await command(page, 'Clicar em Ver pacientes')
  await expect(page.getByRole('region', { name: 'Pacientes', exact: true }).getByRole('heading', { name: 'Pacientes', exact: true })).toBeVisible()
  await command(page, 'Clicar em Início')
  await command(page, 'Clicar em Ver agenda')
  await expect(page.getByRole('region', { name: 'Agenda', exact: true })).toBeVisible()
  await command(page, 'Clicar em Início')
  await expect(page.getByText('Nenhum compromisso para hoje.')).toBeVisible()
  expect(await calls(page, 'agenda_create_series')).toHaveLength(0)
  expect(await calls(page, 'session_draft_start')).toHaveLength(0)
})

test('updater: retry da verificação por voz não baixa nem instala', async ({ page }) => {
  await openApp(page, { checkFailure: true })
  await expect(page.getByText('Não foi possível verificar atualizações. Você pode continuar normalmente.')).toBeVisible()
  const before = (await calls(page, 'plugin:updater|check')).length
  await command(page, 'Clicar em Tentar novamente')
  await expect(page.getByText('Não foi possível verificar atualizações. Você pode continuar normalmente.')).toBeVisible()
  expect((await calls(page, 'plugin:updater|check')).length).toBe(before + 1)
  await page.evaluate(() => { window.settingsFixture.checkFailure = false })
  await command(page, 'Clicar em Tentar novamente')
  await expect(page.getByText('Não foi possível verificar atualizações. Você pode continuar normalmente.')).toHaveCount(0)
  expect((await calls(page, 'plugin:updater|check')).length).toBe(before + 2)
  expect(await calls(page, 'plugin:updater|download_and_install')).toHaveLength(0)
})

test('retries distintos por voz atingem o alvo sem navegar; alias curto ambíguo é recusado', async ({ page }) => {
  await openApp(page, { checkFailure: true, agendaFailure: true })
  await expect(page.getByRole('button', { name: 'Recarregar agenda', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Verificar atualizações', exact: true })).toBeVisible()
  const checks = (await calls(page, 'plugin:updater|check')).length
  const agenda = (await calls(page, 'agenda_occurrences')).length
  await propose(page, 'Clicar em Tentar novamente')
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  await expect(page.locator('.voice-command-error')).toContainText('mais de uma opção')
  expect(await calls(page, 'plugin:updater|check')).toHaveLength(checks)
  expect(await calls(page, 'agenda_occurrences')).toHaveLength(agenda)
  await page.evaluate(() => { window.settingsFixture.checkFailure = false })
  await command(page, 'Clicar em Verificar atualizações')
  expect(await calls(page, 'plugin:updater|check')).toHaveLength(checks + 1)
  expect(await calls(page, 'agenda_occurrences')).toHaveLength(agenda)
  await expect(page.getByText('Não foi possível consultar a agenda agora.')).toBeVisible()
  await page.evaluate(() => { window.settingsFixture.agendaFailure = false })
  const beforeRetry = (await calls(page, 'agenda_occurrences')).length
  await command(page, 'Clicar em Recarregar agenda')
  expect(await calls(page, 'plugin:updater|check')).toHaveLength(checks + 1)
  expect((await calls(page, 'agenda_occurrences')).length).toBeGreaterThan(beforeRetry)
  await expect(page.getByText('Nenhum compromisso para hoje.')).toBeVisible()
  expect(await calls(page, 'plugin:updater|download_and_install')).toHaveLength(0)
})

test('ajustes: inspeção, cópia automática, licenças e bloqueio por voz', async ({ page }) => {
  await openApp(page)
  await command(page, 'Abrir ajustes')
  await command(page, 'Clicar em Inspecionar artefatos locais')
  expect(await calls(page, 'recovery_inventory')).toHaveLength(1)
  await expect(page.getByText('Nenhum artefato elegível para limpeza. Itens incertos são preservados.')).toBeVisible()
  await command(page, 'Clicar em Atualizar cópia automática agora')
  expect(await calls(page, 'auto_backup_retry')).toHaveLength(1)
  await command(page, 'Clicar em Licenças de terceiros')
  await expect(page.getByText('SQLite é disponibilizado em domínio público.')).toBeVisible()
  await propose(page, 'Preencher Senha independente do backup com senha-ficticia-1234')
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  await expect(page.locator('#backup-password')).toHaveValue('')
  expect(await calls(page, 'backup_create')).toHaveLength(0)
  // Password entry deliberately remains manual; voice may open the regular chooser.
  await page.locator('#backup-password').fill('senha-ficticia-1234')
  await command(page, 'Clicar em Criar backup cifrado')
  expect(await calls(page, 'backup_create')).toEqual([{ command: 'backup_create', args: { password: 'senha-ficticia-1234' } }])
  await command(page, 'Clicar em Bloquear')
  expect(await calls(page, 'vault_lock')).toHaveLength(1)
  await expect(page.getByRole('region', { name: 'Comando do Círculo' })).toBeVisible()
  await expect(page.getByLabel('Seu comando')).toHaveValue('')
  await expect(page.locator('[data-voice-record="patient:ana"]')).toHaveCount(0)
})

test('cofre bloqueado: comandos visíveis sem dados clínicos; senha manual e desbloqueio normal', async ({ page }) => {
  await openApp(page, { initiallyLocked: true })
  expect(await calls(page, 'patient_list')).toHaveLength(0)
  await propose(page, 'Cadastrar paciente Bia Fictícia com 20 anos')
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  await expect(page.locator('.voice-command-error')).toContainText('Digite sua senha')
  await propose(page, 'Preencher Senha do cofre com senha-ficticia-2026')
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  await expect(page.locator('#vault-password')).toHaveValue('')
  await command(page, 'Clicar em Opções avançadas de backup e restauração')
  await expect(page.locator('#backup-password')).toBeVisible()
  await page.locator('#vault-password').fill('senha-ficticia-2026')
  await command(page, 'Clicar em Desbloquear')
  expect(await calls(page, 'vault_unlock')).toEqual([{ command: 'vault_unlock', args: { password: 'senha-ficticia-2026' } }])
  await command(page, 'Abrir pacientes')
  await expect(page.locator('[data-voice-record="patient:ana"]')).toContainText('Ana Clara')
})

test('cofre novo: comando só cria após senha manual e proposta confirmada', async ({ page }) => {
  await openApp(page, { initiallyLocked: true, initialized: false })
  await command(page, 'Clicar em Criar cofre cifrado')
  expect(await calls(page, 'vault_create')).toHaveLength(0)
  await page.locator('#vault-password').fill('senha-ficticia-2026')
  await propose(page, 'Clicar em Criar cofre cifrado')
  await expect(page.locator('.voice-command-preview')).toBeVisible()
  expect(await calls(page, 'vault_create')).toHaveLength(0)
  await propose(page, 'confirmar')
  await expect.poll(() => calls(page, 'vault_create')).toEqual([{ command: 'vault_create', args: { password: 'senha-ficticia-2026' } }])
  await expect(page.getByRole('navigation', { name: 'Espaços do Círculo' })).toBeVisible()
})

test('exportação por voz: recusar não exporta; confirmar usa o paciente selecionado', async ({ page }) => {
  await openApp(page)
  await command(page, 'Abrir registros de Ana Clara')
  await command(page, 'Clicar em Exportar cópia legível')
  await command(page, 'Clicar em Exportar cópia legível deste paciente')
  await expect(page.getByRole('alertdialog', { name: 'Confirmar ação' })).toBeVisible()
  await propose(page, 'voltar')
  expect(await calls(page, 'record_copy_export')).toHaveLength(0)
  await command(page, 'Clicar em Exportar cópia legível deste paciente')
  await propose(page, 'confirmar')
  await expect.poll(() => calls(page, 'record_copy_export')).toEqual([{ command: 'record_copy_export', args: { patientId: 'ana' } }])
})

test('atualização por voz: recusar, falhar e tentar novamente sem instalar silenciosamente', async ({ page }) => {
  await openApp(page, true)
  await command(page, 'Clicar em Baixar e instalar')
  await propose(page, 'voltar')
  expect(await calls(page, 'plugin:updater|download_and_install')).toHaveLength(0)
  await command(page, 'Clicar em Baixar e instalar')
  await propose(page, 'confirmar')
  await expect(page.getByText('Não foi possível instalar Círculo 0.2.40.')).toBeVisible()
  await command(page, 'Clicar em Verificar e tentar novamente')
  await expect(page.getByText('Atualização disponível: Círculo 0.2.40')).toBeVisible()
  await command(page, 'Clicar em Baixar e instalar')
  await propose(page, 'confirmar')
  await expect(page.getByText('Atualização 0.2.40 instalada. Reinicie o aplicativo para usar a nova versão.')).toBeVisible()
  expect(await calls(page, 'plugin:updater|download_and_install')).toHaveLength(2)
})

for (const editor of ['vínculo', 'Agenda', 'contexto', 'adendo', 'biblioteca']) {
  test(`updater por voz: recusa preserva ${editor}; aceitar descarta sem salvar ou instalar`, async ({ page }) => {
    await openApp(page, true)
    let field
    if (editor === 'vínculo') {
      await command(page, 'Abrir vínculos de Ana Clara')
      field = page.getByLabel('Nome da pessoa ou instituição')
      await command(page, 'Preencher Nome da pessoa ou instituição com Vínculo fictício pendente')
    } else if (editor === 'Agenda') {
      await command(page, 'Abrir agenda')
      await command(page, 'Clicar em Novo compromisso')
      field = page.getByLabel('Horário inicial')
      await command(page, 'Preencher Horário inicial com 10:30')
    } else if (editor === 'biblioteca') {
      await command(page, 'Abrir sessões')
      await command(page, 'Clicar em Biblioteca de comportamentos reutilizáveis')
      field = page.getByLabel('Título descritivo')
      await command(page, 'Preencher Título descritivo com Comportamento fictício pendente')
    } else if (editor === 'contexto') {
      await command(page, 'Abrir registros de Ana Clara')
      await command(page, 'Clicar em Contexto do caso')
      field = page.getByLabel('Demanda avaliada')
      await command(page, 'Preencher Demanda avaliada com Demanda fictícia pendente')
    } else {
      await page.evaluate(() => { window.settingsFixture.timeline = [{ id: 'completed', patientId: 'ana', sessionDate: '2026-10-02', start: '15:00', end: '15:50', modality: 'Presencial', observation: 'Sessão fictícia anterior', procedures: 'Atividade fictícia', outcomeDecision: 'Resultado fictício', referralClosure: '', behaviors: [], indicators: [] }] })
      await command(page, 'Abrir evolução de Ana Clara')
      await command(page, 'Clicar em Adicionar adendo de Ana Clara em 2026-10-02 às 15:00–15:50')
      field = page.getByLabel('Texto do adendo (até 4000 caracteres)')
      await command(page, 'Preencher Texto do adendo com Adendo fictício pendente')
    }
    const value = await field.inputValue()
    expect(value).not.toBe('')
    const before = await page.evaluate(() => window.settingsFixture.calls.length)
    await command(page, 'Clicar em Baixar e instalar')
    await expect(page.getByText('Feche os formulários antes de instalar Círculo 0.2.40.')).toBeVisible()
    await command(page, 'Clicar em Descartar edições e fechar formulários')
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await propose(page, 'voltar')
    await expect(field).toHaveValue(value)
    expect(await calls(page, 'plugin:updater|download_and_install')).toHaveLength(0)
    await command(page, 'Clicar em Descartar edições e fechar formulários')
    await propose(page, 'confirmar')
    await expect(page.getByText('Atualização disponível: Círculo 0.2.40')).toBeVisible()
    if (['contexto', 'biblioteca'].includes(editor)) await expect(field).toHaveValue('')
    else await expect(field).toHaveCount(0)
    const allowed = new Set(['patient_list', 'related_party_list', 'behavior_list', 'indicator_catalog', 'agenda_list_series', 'agenda_history', 'agenda_occurrences', 'session_timeline', 'session_draft_list', 'session_addendum_list', 'case_context_list', 'auto_backup_status', 'plugin:resources|close'])
    const operations = await page.evaluate(start => window.settingsFixture.calls.slice(start).map(call => call.command), before)
    expect(operations.filter(name => !allowed.has(name))).toEqual([])
  })
}

test('atualização não descarta cadastro aberto sem confirmação explícita por voz', async ({ page }) => {
  await openApp(page, true)
  await command(page, 'Cadastrar paciente Bia Fictícia de 9 anos')
  await command(page, 'Clicar em Baixar e instalar')
  await expect(page.getByText('Feche os formulários antes de instalar Círculo 0.2.40.')).toBeVisible()
  await command(page, 'Clicar em Tentar novamente')
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('Bia Fictícia')
  await expect(page.getByText('Feche os formulários antes de instalar Círculo 0.2.40.')).toBeVisible()
  expect(await calls(page, 'plugin:updater|download_and_install')).toHaveLength(0)
  await command(page, 'Clicar em Descartar edições e fechar formulários')
  await propose(page, 'voltar')
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('Bia Fictícia')
  await command(page, 'Clicar em Descartar edições e fechar formulários')
  await propose(page, 'confirmar')
  await expect(page.getByLabel('Nome', { exact: true })).toHaveCount(0)
  expect(await calls(page, 'patient_create')).toHaveLength(0)
  expect(await calls(page, 'plugin:updater|download_and_install')).toHaveLength(0)
  await expect(page.getByText('Atualização disponível: Círculo 0.2.40')).toBeVisible()
})
