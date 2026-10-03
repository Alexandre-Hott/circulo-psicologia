import { test, expect } from '@playwright/test'

const answerConfirmation = async (page, message, accept = true) => {
  const dialog = page.getByRole('alertdialog', { name: 'Confirmar ação', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText(message)
  await dialog.getByRole('button', { name: accept ? 'Confirmar ação' : 'Voltar', exact: true }).click()
  await expect(dialog).toBeHidden()
}

const mockDesktop = (page, update, unlocked = false) => page.addInitScript(({ update, unlocked }) => {
  const calls = []
  const callbacks = new Map()
  window.updaterProbe = () => calls
  window.__TAURI_INTERNALS__ = {
    transformCallback(callback) { const id = callbacks.size + 1; callbacks.set(id, callback); return id },
    unregisterCallback(id) { callbacks.delete(id) },
    invoke: async (command, args = {}) => {
      calls.push({ command, args: command.startsWith('plugin:updater') ? {} : args })
      if (command === 'plugin:updater|check') {
        if (update === 'offline') throw new Error('offline')
        if (update === 'offline-then-delayed') {
          const count = calls.filter(call => call.command === 'plugin:updater|check').length
          if (count <= 2) throw new Error('offline')
          return new Promise(resolve => { window.updaterResolveCheck = () => resolve({ rid: 77, currentVersion: '0.2.17', version: '0.2.18' }) })
        }
        return update ? { rid: calls.filter(call => call.command === 'plugin:updater|check').length, currentVersion: '0.2.17', version: '0.2.18' } : null
      }
      if (command === 'plugin:updater|download_and_install') {
        if (update === 'fail-install') throw new Error('Falha sintética')
        const callback = callbacks.get(args.onEvent.id)
        callback({ index: 0, message: { event: 'Started', data: { contentLength: 100 } } })
        callback({ index: 1, message: { event: 'Progress', data: { chunkLength: 50 } } })
        await new Promise(resolve => setTimeout(resolve, 150))
        callback({ index: 2, message: { event: 'Finished' } })
        return null
      }
      if (command === 'vault_status') return { initialized: true, unlocked, profileState: 'ready' }
      if (command === 'patient_list') return [{ id: 'p1', name: 'Paciente fictício', age: 8, archivedAt: null }]
      if (command === 'session_timeline') return [{ id: 's1', patientId: 'p1', sessionDate: '2026-09-28', start: '10:00', end: '11:00', modality: 'Presencial', observation: 'Fictícia', behaviors: [], indicators: [] }]
      if (command === 'related_party_list' || command.startsWith('agenda_') || command === 'session_draft_list' || command === 'session_addendum_list' || command === 'case_context_list' || command === 'behavior_list' || command === 'indicator_catalog') return []
      if (command === 'auto_backup_status') return { dirty: false, available: false }
      return null
    },
  }
}, { update, unlocked })

test('0.2.17 oferece 0.2.18 e só instala após clique e confirmação', async ({ page }) => {
  await mockDesktop(page, true)
  await page.goto('/')
  await expect(page.getByText('Atualização disponível: Círculo 0.2.18')).toBeVisible()
  expect(await page.evaluate(() => window.updaterProbe().filter(call => call.command === 'plugin:updater|download_and_install').length)).toBe(0)
  await page.getByRole('button', { name: 'Baixar e instalar' }).click()
  await expect(page.getByRole('alertdialog', { name: 'Confirmar ação', exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.updaterProbe().filter(call => call.command === 'plugin:updater|download_and_install').length)).toBe(0)
  await answerConfirmation(page, 'Instalar Círculo 0.2.18?', false)
  expect(await page.evaluate(() => window.updaterProbe().filter(call => call.command === 'plugin:updater|download_and_install').length)).toBe(0)
  await page.getByRole('button', { name: 'Baixar e instalar' }).click()
  await answerConfirmation(page, 'Instalar Círculo 0.2.18?')
  await expect(page.getByRole('progressbar', { name: 'Progresso do download' })).toHaveAttribute('value', '50')
  await expect(page.getByText('Atualização 0.2.18 instalada.')).toBeVisible()
  expect(await page.evaluate(() => window.updaterProbe().filter(call => call.command === 'plugin:updater|download_and_install').length)).toBe(1)
})

test('bloqueia instalação com cadastro, vínculo e Agenda abertos, sem descartar silenciosamente', async ({ page }) => {
  await mockDesktop(page, true, true)
  await page.goto('/')
  await expect(page.getByText('Atualização disponível: Círculo 0.2.18')).toBeVisible()
  await page.getByRole('button', { name: 'Pacientes', exact: true }).click()
  await page.getByRole('button', { name: 'Novo cadastro' }).click()
  await page.getByLabel('Nome', { exact: true }).fill('Rascunho sintético')
  await page.getByRole('button', { name: 'Baixar e instalar' }).click()
  await expect(page.getByText('Feche os formulários antes de instalar')).toBeVisible()
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('Rascunho sintético')
  await page.getByRole('button', { name: 'Descartar edições e fechar formulários' }).click()
  await answerConfirmation(page, 'Fechar cadastro, vínculo e Agenda e descartar', false)
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('Rascunho sintético')
  await page.getByRole('button', { name: 'Tentar novamente' }).click()
  expect(await page.evaluate(() => window.updaterProbe().filter(call => call.command === 'plugin:updater|download_and_install').length)).toBe(0)
  await page.getByRole('button', { name: 'Descartar edições e fechar formulários' }).click()
  await answerConfirmation(page, 'Fechar cadastro, vínculo e Agenda e descartar')
  await page.getByRole('button', { name: 'Pessoas vinculadas' }).click()
  await page.getByLabel('Nome da pessoa ou instituição').fill('Vínculo fictício')
  await page.getByRole('button', { name: 'Baixar e instalar' }).click()
  await expect(page.getByText('Feche os formulários antes de instalar')).toBeVisible()
  await expect(page.getByLabel('Nome da pessoa ou instituição')).toHaveValue('Vínculo fictício')
  await page.getByRole('button', { name: 'Descartar edições e fechar formulários' }).click()
  await answerConfirmation(page, 'Fechar cadastro, vínculo e Agenda e descartar')
  await page.getByRole('button', { name: 'Abrir Agenda' }).click()
  await page.getByRole('region', { name: 'Novo compromisso' }).getByRole('button', { name: 'Novo compromisso' }).click()
  await page.getByLabel('Horário inicial').fill('10:30')
  await page.getByRole('button', { name: 'Baixar e instalar' }).click()
  await expect(page.getByText('Feche os formulários antes de instalar')).toBeVisible()
  await expect(page.getByLabel('Horário inicial')).toHaveValue('10:30')
  expect(await page.evaluate(() => window.updaterProbe().filter(call => call.command === 'plugin:updater|download_and_install').length)).toBe(0)
})

test('fecha recurso após falha e verifica novo recurso no retry', async ({ page }) => {
  await mockDesktop(page, 'fail-install')
  await page.goto('/')
  await expect(page.getByText('Atualização disponível: Círculo 0.2.18')).toBeVisible()
  await page.getByRole('button', { name: 'Baixar e instalar' }).click()
  await answerConfirmation(page, 'Instalar Círculo 0.2.18?')
  await expect(page.getByText('Não foi possível instalar Círculo 0.2.18.')).toBeVisible()
  expect(await page.evaluate(() => window.updaterProbe().filter(call => call.command === 'plugin:resources|close').length)).toBeGreaterThanOrEqual(1)
  const checksBeforeRetry = await page.evaluate(() => window.updaterProbe().filter(call => call.command === 'plugin:updater|check').length)
  await page.getByRole('button', { name: 'Verificar e tentar novamente' }).click()
  await expect(page.getByText('Atualização disponível: Círculo 0.2.18')).toBeVisible()
  expect(await page.evaluate(() => window.updaterProbe().filter(call => call.command === 'plugin:updater|check').length)).toBe(checksBeforeRetry + 1)
})

for (const editor of ['contexto', 'adendo', 'comportamento']) {
  test(`bloqueia updater com ${editor} de Sessões pendente`, async ({ page }) => {
    await mockDesktop(page, true, true)
    await page.goto('/')
    await expect(page.getByText('Atualização disponível: Círculo 0.2.18')).toBeVisible()
    await page.getByRole('button', { name: 'Abrir sessões' }).click()
    if (editor !== 'comportamento') await page.getByLabel('Paciente para evolução e sessões').selectOption('p1')
    if (editor === 'contexto') {
      await page.getByText('Contexto do caso', { exact: true }).click()
      await page.getByLabel('Demanda avaliada').fill('Demanda fictícia pendente')
    } else if (editor === 'adendo') {
      await page.getByText('Evolução e escalas registradas · Adicionar adendo').click()
      await page.getByRole('button', { name: 'Adicionar adendo' }).click()
      await page.getByLabel('Texto do adendo (até 4000 caracteres)').fill('Adendo fictício pendente')
    } else {
      await page.getByText('Biblioteca de comportamentos reutilizáveis').click()
      await page.getByLabel('Título descritivo').fill('Comportamento fictício pendente')
    }
    await page.getByRole('button', { name: 'Baixar e instalar' }).click()
    await expect(page.getByText('Feche os formulários antes de instalar')).toBeVisible()
    expect(await page.evaluate(() => window.updaterProbe().filter(call => call.command === 'plugin:updater|download_and_install').length)).toBe(0)
    const field = editor === 'contexto' ? page.getByLabel('Demanda avaliada') : editor === 'adendo' ? page.getByLabel('Texto do adendo (até 4000 caracteres)') : page.getByLabel('Título descritivo')
    await expect(field).toHaveValue(editor === 'adendo' ? 'Adendo fictício pendente' : editor === 'contexto' ? 'Demanda fictícia pendente' : 'Comportamento fictício pendente')
  })
}

test('retry tardio libera recurso após pagehide sem mostrar atualização', async ({ page }) => {
  await mockDesktop(page, 'offline-then-delayed')
  await page.goto('/')
  await expect(page.getByText('Não foi possível verificar atualizações.')).toBeVisible()
  await page.getByRole('button', { name: 'Tentar novamente' }).click()
  await page.waitForFunction(() => typeof window.updaterResolveCheck === 'function')
  await page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); window.updaterResolveCheck() })
  await expect.poll(() => page.evaluate(() => window.updaterProbe().filter(call => call.command === 'plugin:resources|close' && call.args.rid === 77).length)).toBe(1)
  await expect(page.getByText('Atualização disponível: Círculo 0.2.18')).toHaveCount(0)
})

test('offline mantém o cofre acessível e oferece retry', async ({ page }) => {
  await mockDesktop(page, 'offline')
  await page.goto('/')
  await expect(page.getByText('Não foi possível verificar atualizações.')).toBeVisible()
  await expect(page.getByLabel('Senha do cofre')).toBeVisible()
  await page.getByRole('button', { name: 'Tentar novamente' }).click()
  await expect(page.getByText('Não foi possível verificar atualizações.')).toBeVisible()
})
