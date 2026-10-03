import { expect, test } from '@playwright/test'

// UI/voice are real; native file dialogs, updater and storage are synthetic.
async function openApp(page, update = false) {
  const options = typeof update === 'object' ? update : { update }
  await page.clock.install({ time: new Date('2026-10-03T15:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-03T15:00:00Z'))
  await page.addInitScript(({ update = false, checkFailure = false, agendaFailure = false }) => {
    let unlocked = true
    let downloads = 0
    window.settingsFixture = { calls: [], unexpected: [], checkFailure, agendaFailure, timeline: [] }
    const callbacks = new Map()
    window.__TAURI_INTERNALS__ = {
      transformCallback(callback) { const id = callbacks.size + 1; callbacks.set(id, callback); return id },
      unregisterCallback(id) { callbacks.delete(id) },
      invoke: async (command, args = {}) => {
        window.settingsFixture.calls.push({ command, args: structuredClone(args) })
        if (command === 'vault_status') return { initialized: true, unlocked, profileState: 'ready' }
        if (command === 'vault_lock') { unlocked = false; return null }
        if (command === 'auto_backup_status') return { available: false, dirty: false }
        if (command === 'auto_backup_retry') return { available: true, dirty: false, lastVerifiedAt: 1791039600 }
        if (command === 'recovery_inventory') return { categories: [], eligibleCount: 0, eligibleBytes: 0, cleanupBlocked: false }
        if (command === 'patient_list') return [{ id: 'ana', name: 'Ana Clara', age: 8, revision: 1, archivedAt: null }]
        if (command === 'agenda_occurrences' && window.settingsFixture.agendaFailure) throw new Error('Falha sintética da prévia da Agenda')
        if (command === 'session_timeline') return structuredClone(window.settingsFixture.timeline.filter(session => session.patientId === args.patientId))
        if (['behavior_list', 'indicator_catalog', 'agenda_list_series', 'agenda_history', 'agenda_occurrences', 'related_party_list', 'session_timeline', 'session_draft_list', 'session_addendum_list', 'case_context_list'].includes(command)) return []
        if (command === 'record_copy_export' || command === 'backup_create') return false // chooser cancelled; no file
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
  await expect(page.getByRole('region', { name: 'Comando do Círculo' })).toHaveCount(0)
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
