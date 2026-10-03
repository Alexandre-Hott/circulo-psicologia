import { expect, test } from '@playwright/test'

async function openApp(page, { emptyLibrary = false, archivedPatient = false } = {}) {
  await page.clock.install({ time: new Date('2026-10-03T15:00:00Z') })
  await page.addInitScript(({ emptyLibrary, archivedPatient }) => {
    window.writes = []
    window.voiceTranscript = ''
    window.analyticsRequests = []
    window.voiceNativeCalls = []
    const patients = [{ id: 'ana', name: 'Ana Clara', age: 8, revision: 1, preferredModality: 'Presencial', archivedAt: null }]
    const behaviors = [{ id: 'help', title: 'Pede ajuda', description: '', version: 1 }]
    if (emptyLibrary) behaviors.length = 0
    if (archivedPatient) patients.push({ id: 'archived', name: 'Bia Arquivada', age: 30, revision: 1, preferredModality: 'Online', archivedAt: '2026-09-01' })
    const occurrence = { id: 'occ', seriesId: 'series', patientId: 'ana', date: '2026-10-03', originalDate: '2026-10-03', start: '15:00', end: '15:50', frequency: 'Avulsa', modality: 'Presencial', status: 'scheduled' }
    let draft = { id: 'draft', patientId: 'ana', originalDate: '2026-10-03', observation: '', procedures: '', outcomeDecision: '', referralClosure: '', behaviorIds: [], indicators: [] }
    class SyntheticAudioContext {
      constructor() { this.sampleRate = 8_000; this.state = 'running'; this.destination = {} }
      createMediaStreamSource() { return { connect() {}, disconnect() {} } }
      createScriptProcessor() {
        const processor = { onaudioprocess: null, disconnect() {} }
        processor.connect = () => queueMicrotask(() => {
          const emit = () => {
            if (!processor.onaudioprocess) return
            processor.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(4096).fill(0.1) }, outputBuffer: { getChannelData: () => new Float32Array(4096) } })
            if (processor.onaudioprocess) setTimeout(emit, 0)
          }
          emit()
        })
        return processor
      }
      resume() { return Promise.resolve() }
      close() { this.state = 'closed'; return Promise.resolve() }
    }
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: SyntheticAudioContext })
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } })
    window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
      window.voiceNativeCalls.push({ command, args })
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { available: false, dirty: false }
      if (command === 'patient_list') return patients.filter(patient => args?.includeArchived || patient.archivedAt == null)
      if (command === 'related_party_list') return []
      if (command === 'behavior_list') return behaviors
      if (command === 'indicator_catalog') return []
      if (command === 'voice_transcribe') return window.deferVoice ? await new Promise(resolve => { window.resolveVoice = resolve }) : window.voiceTranscript
      if (command === 'agenda_occurrences') return (window.voiceOccurrences || [occurrence]).filter(item => item.date >= args.from && item.date <= args.to)
      if (command === 'session_draft_start') return draft
      if (command === 'session_timeline') return window.voiceTimeline || []
      if (command === 'session_draft_list') return window.voiceDrafts || []
      if (command === 'session_draft_cancel') { window.writes.push({ command, args }); window.voiceDrafts = (window.voiceDrafts || []).filter(item => item.id !== args.id); return null }
      if (['agenda_list_series', 'agenda_history', 'session_timeline', 'session_addendum_list', 'case_context_list', 'session_draft_list'].includes(command)) return []
      if (command === 'patient_create') { const saved = { id: 'bia', revision: 1, archivedAt: null, ...args.input }; patients.push(saved); window.writes.push({ command, args }); return saved }
      if (command === 'patient_update') { const index = patients.findIndex(item => item.id === args.id); patients[index] = { ...patients[index], ...args.input, revision: patients[index].revision + 1 }; window.writes.push({ command, args }); return patients[index] }
      if (command === 'patient_archive' || command === 'patient_restore') { const patient = patients.find(item => item.id === args.id); patient.archivedAt = command === 'patient_archive' ? '2026-10-03' : null; patient.revision++; window.writes.push({ command, args }); return { ...patient } }
      if (command === 'behavior_create') { const saved = { id: 'wait', title: args.title, description: args.description, version: 1 }; behaviors.push(saved); window.writes.push({ command, args }); return saved }
      if (command === 'behavior_update') { const saved = behaviors.find(item => item.id === args.id); Object.assign(saved, args, { version: saved.version + 1 }); window.writes.push({ command, args }); return saved }
      if (command === 'session_draft_save') { draft = { ...draft, ...args.input }; window.writes.push({ command, args }); return draft }
      if (command === 'session_finalize') { window.writes.push({ command, args }); return null }
      if (command === 'agenda_create_series') { window.writes.push({ command, args }); return { id: 'series-2', ...args.input } }
      if (command === 'analytics_overview') { window.analyticsRequests.push(args); return { totalCompletedSessions: 0, uniquePatients: 0, dailyCounts: [], monthlyCounts: [], behaviorCounts: [] } }
      if (command === 'plugin:updater|check') return null
      return null
    } }
  }, { emptyLibrary, archivedPatient })
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
  await expect(page.locator('.voice-command-preview')).toBeVisible()
  await propose(page, 'confirmar')
}

test('evolução por voz sem rascunho abre Agenda para o paciente sem criar dados', async ({ page }) => {
  await openApp(page)
  await command(page, 'Abrir evolução de Ana Clara')
  await command(page, 'Clicar em Registrar nova sessão ou continuar rascunho')
  const form = page.getByRole('form', { name: 'Novo compromisso', exact: true })
  await expect(form).toBeVisible()
  await expect(form.getByLabel('Paciente', { exact: true })).toHaveValue('ana')
  await expect(form.getByLabel('Tipo', { exact: true })).toHaveValue('Avulsa')
  await expect(form.getByLabel('Tipo', { exact: true })).toBeDisabled()
  expect(await page.evaluate(() => window.writes)).toEqual([])
  expect(await page.evaluate(() => window.voiceNativeCalls.filter(call => call.command === 'session_draft_start'))).toEqual([])
})

test('evolução por voz retoma rascunho e âncoras não criam nem gravam outra sessão', async ({ page }) => {
  await openApp(page)
  await page.evaluate(() => { window.voiceDrafts = [{ id: 'resume', patientId: 'ana', seriesId: 'resume-series', originalDate: '2026-10-02', observation: 'Observação fictícia preservada', procedures: '', outcomeDecision: '', referralClosure: '', behaviorIds: [], indicators: [] }] })
  await command(page, 'Abrir evolução de Ana Clara')
  await command(page, 'Clicar em Registrar nova sessão ou continuar rascunho')
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toHaveAttribute('data-voice-record', 'resume')
  await expect(page.getByLabel('Observações descritivas')).toHaveValue('Observação fictícia preservada')
  for (const [label, hash] of [['Comportamentos', 'draft-behaviors'], ['Indicadores e escalas', 'draft-indicators'], ['Salvar ou finalizar', 'draft-actions'], ['Evolução descritiva', 'session-observation']]) {
    await command(page, `Clicar em ${label}`)
    await expect(page).toHaveURL(new RegExp(`#${hash}$`))
  }
  await command(page, 'Clicar em Escolher comportamentos desta sessão')
  await expect(page.locator('#draft-behaviors')).toBeFocused()
  // Retaking a draft remounts the session workspace, closing secondary drawers.
  // Voice must open the drawer before targeting its hidden action.
  await command(page, 'Clicar em Evolução e escalas registradas · Adicionar adendo')
  await page.evaluate(() => {
    window.voiceScrolledIds = []
    const scroll = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (...args) { window.voiceScrolledIds.push(this.id); return scroll.apply(this, args) }
  })
  await command(page, 'Clicar em Registrar nova sessão ou continuar rascunho')
  expect(await page.evaluate(() => window.voiceScrolledIds)).toContain('session-draft')
  expect(await page.evaluate(() => window.writes)).toEqual([])
  expect(await page.evaluate(() => window.voiceNativeCalls.filter(call => call.command === 'session_draft_start'))).toEqual([])
})

test('biblioteca vazia abre pelo atalho de voz e paciente arquivado continua consultável', async ({ page }) => {
  await openApp(page, { emptyLibrary: true, archivedPatient: true })
  await page.evaluate(() => { window.voiceDrafts = [{ id: 'empty-library', patientId: 'ana', originalDate: '2026-10-02', observation: '', procedures: '', outcomeDecision: '', referralClosure: '', behaviorIds: [], indicators: [] }] })
  await command(page, 'Abrir registros de Ana Clara')
  await command(page, 'Clicar em Retomar sessão de 2026-10-02')
  await command(page, 'Clicar em Criar na biblioteca')
  await expect(page.locator('#session-behaviors')).toHaveAttribute('open', '')
  await expect(page.getByLabel('Título descritivo')).toBeVisible()
  await expect(page).toHaveURL(/#session-behaviors$/)
  await command(page, 'Selecionar Paciente para evolução e sessões como Bia Arquivada arquivado')
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue('archived')
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.voiceNativeCalls.filter(call => call.command === 'session_timeline').at(-1)?.args)).toEqual({ patientId: 'archived' })
  expect(await page.evaluate(() => window.writes)).toEqual([])
})

test('cadastro, edição e comportamento usam formulários existentes sem gravação antecipada', async ({ page }) => {
  await openApp(page)
  await command(page, 'Cadastrar paciente Bia Fictícia com 27 anos online')
  const patientForm = page.getByRole('form', { name: 'Novo cadastro' })
  await expect(patientForm.getByLabel('Nome', { exact: true })).toHaveValue('Bia Fictícia')
  await expect(patientForm.getByLabel('Idade em anos (opcional)')).toHaveValue('27')
  await expect.poll(() => page.evaluate(() => window.writes.length)).toBe(0)
  await command(page, 'Clicar em Salvar paciente')
  await expect.poll(() => page.evaluate(() => window.writes.filter(item => item.command === 'patient_create').length)).toBe(1)
  await command(page, 'Editar paciente Bia Fictícia com 28 anos')
  await command(page, 'Clicar em Salvar alterações')
  await expect.poll(() => page.evaluate(() => window.writes.find(item => item.command === 'patient_update')?.args.input.age)).toBe(28)
  await propose(page, 'Clicar em Editar')
  await expect(page.locator('.voice-command-error')).toContainText('Há mais de uma opção')
  await command(page, 'Criar comportamento Espera a vez com descrição Aguarda sua vez no jogo')
  await expect(page.getByLabel('Título descritivo')).toHaveValue('Espera a vez')
  await command(page, 'Criar comportamento reutilizável')
  await expect.poll(() => page.evaluate(() => window.writes.find(item => item.command === 'behavior_create')?.args.title)).toBe('Espera a vez')
  await command(page, 'Editar comportamento Espera a vez com descrição Aguarda em atividades')
  await expect(page.getByLabel('Descrição opcional')).toHaveValue('Aguarda em atividades')
  await command(page, 'Clicar em Salvar versão do comportamento')
  await expect.poll(() => page.evaluate(() => window.writes.find(item => item.command === 'behavior_update')?.args.description)).toBe('Aguarda em atividades')
})

test('campos, opções e gavetas são controláveis de qualquer área; ocultos e ambíguos são recusados', async ({ page }) => {
  await openApp(page)
  await propose(page, 'Clicar em Salvar paciente')
  await expect(page.locator('.voice-command-error')).toContainText('Não encontrei')
  await command(page, 'Abrir Pacientes')
  await command(page, 'Ficarem novo cadastro')
  await command(page, 'Preencher Nome com Joana Fictícia')
  await command(page, 'Preencher Nome para Ana com Silva')
  await expect(page.getByRole('form', { name: 'Novo cadastro' }).getByLabel('Nome', { exact: true })).toHaveValue('Ana com Silva')
  await command(page, 'Preencher Idade com 42')
  await command(page, 'Selecionar Modalidade como Online')
  await expect(page.getByRole('form', { name: 'Novo cadastro' }).getByLabel('Modalidade')).toHaveValue('Online')
  await command(page, 'Abrir Agenda')
  await propose(page, 'Preencher Data de referência com 99/99/2026')
  await expect(page.locator('.voice-command-error')).toContainText('Valor inválido')
  await command(page, 'Clicar em Mês')
  await expect(page.getByRole('button', { name: 'Mês', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await command(page, 'Abrir Análises')
  await command(page, 'Clicar em Hoje')
  await expect(page.getByRole('button', { name: 'Hoje', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('pedidos naturais abrem registros e vínculos do paciente sem criar dados', async ({ page }) => {
  await openApp(page)
  await command(page, 'Abrir registros de Ana Clara')
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue('ana')
  await command(page, 'Abrir evolução de Ana Clara')
  await expect(page.locator('details[aria-label="Evolução descritiva somente leitura"]')).toHaveAttribute('open', '')
  await command(page, 'Abrir vínculos de Ana Clara')
  await expect(page.getByRole('region', { name: 'Pessoas vinculadas ao paciente' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Vínculos de Ana Clara' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.writes.length)).toBe(0)
})

test('pedidos naturais filtram análises por paciente e período e removem filtro anterior', async ({ page }) => {
  await openApp(page)
  for (const [text, from, to, patientId] of [
    ['Mostrar análises de Ana Clara neste mês', '2026-10-01', '2026-10-31', 'ana'],
    ['Mostrar análises de Ana Clara hoje', '2026-10-03', '2026-10-03', 'ana'],
    ['Mostrar gráficos dos últimos 12 meses', '2025-11-01', '2026-10-31', ''],
    ['Mostrar análises de Ana Clara de 01/09/2026 até 30/09/2026', '2026-09-01', '2026-09-30', 'ana'],
    ['Mostrar análises deste mês', '2026-10-01', '2026-10-31', ''],
  ]) {
    await command(page, text)
    const filters = page.locator('.analytics-filters')
    await expect(filters.getByLabel('De', { exact: true })).toHaveValue(from)
    await expect(filters.getByLabel('Até', { exact: true })).toHaveValue(to)
    await expect(filters.getByLabel('Paciente', { exact: true })).toHaveValue(patientId)
    await expect.poll(() => page.evaluate(() => window.analyticsRequests.at(-1))).toEqual({ from, to, patientId: patientId || null })
  }
  await expect.poll(() => page.evaluate(() => window.writes.length)).toBe(0)
})

test('limpar campos por voz altera apenas o formulário e não grava ou escolhe opção', async ({ page }) => {
  await openApp(page)
  await command(page, 'Cadastrar paciente Bia Fictícia com 27 anos online')
  await command(page, 'Limpar Nome')
  await expect(page.getByRole('form', { name: 'Novo cadastro' }).getByLabel('Nome', { exact: true })).toHaveValue('')
  await command(page, 'Limpar Idade')
  await expect(page.getByLabel('Idade em anos (opcional)')).toHaveValue('')
  await expect.poll(() => page.evaluate(() => window.writes.length)).toBe(0)
  await propose(page, 'Limpar Modalidade')
  await expect(page.locator('.voice-command-error')).toContainText('selecionar')
  await expect(page.getByRole('form', { name: 'Novo cadastro' }).getByLabel('Modalidade')).toHaveValue('Online')
  await command(page, 'Criar comportamento Espera a vez com descrição Aguarda no jogo')
  await command(page, 'Limpar Descrição opcional')
  await expect(page.getByLabel('Descrição opcional')).toHaveValue('')
  await expect.poll(() => page.evaluate(() => window.writes.length)).toBe(0)
})

test('voz transcrita prepara cadastro e segundo áudio confirma sem voltar ao início', async ({ page }) => {
  await openApp(page)
  await command(page, 'Abrir Pacientes')
  const assistant = page.getByRole('region', { name: 'Comando do Círculo' })
  await page.evaluate(() => { window.voiceTranscript = 'Cadastrar paciente Bia Fictícia com 9 anos' })
  await assistant.getByRole('button', { name: 'Ouvir e transcrever' }).click()
  await expect(page.locator('.voice-command-preview')).toContainText('Bia Fictícia')
  await page.evaluate(() => { window.voiceTranscript = 'confirmar' })
  await assistant.getByRole('button', { name: 'Ouvir e transcrever' }).click()
  await expect(page.getByRole('form', { name: 'Novo cadastro' }).getByLabel('Nome', { exact: true })).toHaveValue('Bia Fictícia')
  await expect.poll(() => page.evaluate(() => window.writes.length)).toBe(0)
})

test('descartar durante a gravação de confirmação invalida a resposta tardia', async ({ page }) => {
  await openApp(page)
  await propose(page, 'Cadastrar paciente Bia Fictícia com 9 anos')
  await page.evaluate(() => { window.deferVoice = true })
  await page.keyboard.press('Control+Shift+Space')
  await expect.poll(() => page.evaluate(() => typeof window.resolveVoice)).toBe('function')
  await page.getByRole('button', { name: 'Descartar rascunho' }).click()
  await page.evaluate(() => window.resolveVoice('confirmar'))
  await expect(page.getByRole('form', { name: 'Novo cadastro' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Revisar no formulário' })).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.writes.length)).toBe(0)
})

test('um controle substituído por outra sessão não recebe o comando antigo', async ({ page }) => {
  await openApp(page)
  const result = await page.evaluate(async () => {
    const { parseVoiceInterfaceCommand, applyVoiceInterfaceCommand } = await import('/src/voiceInterfaceCommands.js')
    const fixture = document.createElement('section')
    fixture.dataset.voiceRecord = 'session-ana'
    fixture.innerHTML = '<label>Observação <textarea></textarea></label>'
    document.body.append(fixture)
    const prepared = parseVoiceInterfaceCommand('Preencher Observação com Pediu ajuda', fixture)
    fixture.dataset.voiceRecord = 'session-caio'
    let error = ''
    try { applyVoiceInterfaceCommand(prepared.intent, fixture) } catch (reason) { error = reason.message }
    const value = fixture.querySelector('textarea').value
    fixture.remove()
    return { error, value }
  })
  expect(result.error).toContain('A tela mudou')
  expect(result.value).toBe('')
})

test('trocar de área enquanto o backend transcreve descarta o áudio antigo', async ({ page }) => {
  await openApp(page)
  await page.evaluate(() => { window.deferVoice = true })
  await page.keyboard.press('Control+Shift+Space')
  await expect.poll(() => page.evaluate(() => typeof window.resolveVoice)).toBe('function')
  await page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Pacientes', exact: true }).click()
  await page.evaluate(() => window.resolveVoice('Cadastrar paciente Bia Fictícia com 9 anos'))
  await expect(page.getByRole('button', { name: 'Revisar no formulário' })).toHaveCount(0)
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.writes.length)).toBe(0)
})

test('arquivar e restaurar exigem confirmação de voz e preservam a identidade', async ({ page }) => {
  await openApp(page)
  await command(page, 'Arquivar paciente Ana Clara')
  await expect(page.getByRole('alertdialog')).toContainText('Ana Clara')
  await expect.poll(() => page.evaluate(() => window.writes.length)).toBe(0)
  await propose(page, 'voltar')
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await command(page, 'Arquivar paciente Ana Clara')
  await propose(page, 'confirmar')
  await expect.poll(() => page.evaluate(() => window.writes.find(item => item.command === 'patient_archive')?.args.id)).toBe('ana')
  await command(page, 'Abrir Pacientes')
  await command(page, 'Marcar Mostrar arquivados')
  await command(page, 'Restaurar paciente Ana Clara')
  await propose(page, 'confirmar')
  await expect.poll(() => page.evaluate(() => window.writes.find(item => item.command === 'patient_restore')?.args.id)).toBe('ana')
})

test('botões repetidos da mesma ocorrência não tornam a voz ambígua', async ({ page }) => {
  await openApp(page)
  await command(page, 'Abrir Agenda')
  await command(page, 'Novo compromisso')
  await expect(page.getByRole('form', { name: 'Novo compromisso' })).toBeVisible()
  await command(page, 'Clicar em Recolher novo compromisso')
  await expect(page.getByRole('form', { name: 'Novo compromisso' })).toHaveCount(0)
  await command(page, 'Clicar em Abrir formulário de novo compromisso')
  await expect(page.getByRole('form', { name: 'Novo compromisso' })).toBeVisible()
  await command(page, 'Mostrar agenda de hoje')
  await command(page, 'Clicar em Detalhes e ações')
  await expect(page.getByRole('button', { name: 'Iniciar sessão de Ana Clara em 2026-10-03 às 15:00–15:50', exact: true })).toHaveCount(2)
  await command(page, 'Clicar em Iniciar sessão de Ana Clara em 2026-10-03 às 15:00–15:50')
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toBeVisible()
})

test('adendo por voz identifica o horário entre duas sessões no mesmo dia', async ({ page }) => {
  await openApp(page)
  await page.evaluate(() => { window.voiceTimeline = [
    { id: 'morning', patientId: 'ana', sessionDate: '2026-10-03', start: '09:00', end: '09:50', modality: 'Presencial', behaviors: [], indicators: [] },
    { id: 'afternoon', patientId: 'ana', sessionDate: '2026-10-03', start: '15:00', end: '15:50', modality: 'Presencial', behaviors: [], indicators: [] },
  ] })
  await command(page, 'Abrir Sessões')
  await command(page, 'Selecionar Paciente para evolução e sessões como Ana Clara')
  await command(page, 'Clicar em Evolução e escalas registradas · Adicionar adendo')
  await command(page, 'Clicar em Adicionar adendo de Ana Clara em 2026-10-03 às 15:00–15:50')
  await expect(page.locator('#addendum-afternoon')).toBeVisible()
  await expect(page.locator('#addendum-morning')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.writes.length)).toBe(0)
})

test('pedido natural encontra compromisso e abre cancelamento ou remarcação sem gravar', async ({ page }) => {
  await openApp(page)
  await command(page, 'Cancelar sessão de Ana Clara hoje às 15 horas')
  const form = page.getByRole('form', { name: 'Alterar ocorrência individual' })
  await expect(form).toBeVisible()
  await expect(form.getByLabel('Ação explícita')).toHaveValue('cancelar')
  await expect.poll(() => page.evaluate(() => window.writes.length)).toBe(0)
  await command(page, 'Clicar em Fechar')
  await command(page, 'Remarcar sessão de Ana Clara hoje às três da tarde')
  await expect(form.getByLabel('Ação explícita')).toHaveValue('remarcar')
  await expect(form.getByLabel('Novo início')).toHaveValue('15:00')
  await expect.poll(() => page.evaluate(() => window.writes.length)).toBe(0)
  await command(page, 'Clicar em Fechar')
  await command(page, 'Iniciar sessão de Ana Clara hoje às 15 horas')
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toBeVisible()
})

test('pedido natural não inicia compromisso ausente, realizado ou duplicado', async ({ page }) => {
  await openApp(page)
  await command(page, 'Iniciar sessão de Ana Clara amanhã às 15 horas')
  await expect(page.getByRole('alert')).toContainText('Não encontrei esse compromisso')
  await page.evaluate(() => { window.voiceOccurrences = [{ id: 'done', patientId: 'ana', date: '2026-10-03', start: '15:00', status: 'completed' }] })
  await command(page, 'Iniciar sessão de Ana Clara hoje às 15 horas')
  await expect(page.getByRole('alert')).toContainText('não está agendado')
  await page.evaluate(() => { window.voiceOccurrences = ['first', 'second'].map(id => ({ id, patientId: 'ana', date: '2026-10-03', start: '15:00', status: 'scheduled' })) })
  await command(page, 'Iniciar sessão de Ana Clara hoje às 15 horas')
  await expect(page.getByRole('alert')).toContainText('mais de um compromisso')
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.writes.length)).toBe(0)
})

test('retomada distingue dois rascunhos do mesmo dia e cancelamento preserva o outro', async ({ page }) => {
  await openApp(page)
  await page.evaluate(() => { window.voiceDrafts = ['first', 'second'].map(id => ({ id, patientId: 'ana', seriesId: `series-${id}`, originalDate: '2026-10-03', observation: id, procedures: '', outcomeDecision: '', referralClosure: '', behaviorIds: [], indicators: [] })) })
  await command(page, 'Abrir registros de Ana Clara')
  await command(page, 'Clicar em Escolher rascunho para retomar')
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toHaveCount(0)
  await command(page, 'Clicar em Retomar rascunho 2026-10-03 · opção 2')
  await expect(page.getByLabel('Observações descritivas')).toHaveValue('second')
  await command(page, 'Clicar em Evolução descritiva')
  await expect(page).toHaveURL(/#session-observation$/)
  await command(page, 'Cancelar rascunho')
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await propose(page, 'voltar')
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.writes.filter(item => item.command === 'session_draft_cancel').length)).toBe(0)
  await command(page, 'Cancelar rascunho')
  await propose(page, 'confirmar')
  await expect.poll(() => page.evaluate(() => window.writes.filter(item => item.command === 'session_draft_cancel'))).toEqual([{ command: 'session_draft_cancel', args: { id: 'second' } }])
  await expect.poll(() => page.evaluate(() => window.voiceDrafts.map(item => item.id))).toEqual(['first'])
  await expect.poll(() => page.evaluate(() => window.writes.filter(item => item.command === 'session_finalize').length)).toBe(0)
})

test('agenda avulsa e sessão com comportamento podem ser preenchidas e finalizadas por comando', async ({ page }) => {
  await openApp(page)
  await command(page, 'Agendar sessão para Ana Clara amanhã às três da tarde')
  const appointment = page.getByRole('form', { name: 'Novo compromisso' })
  await expect(appointment.getByLabel('Data do compromisso')).toHaveValue('2026-10-04')
  await command(page, 'Clicar em Criar compromisso avulso')
  await expect.poll(() => page.evaluate(() => window.writes.filter(item => item.command === 'agenda_create_series').length)).toBe(1)
  await command(page, 'Mostrar agenda de hoje')
  await command(page, 'Clicar em Detalhes e ações')
  await command(page, 'Clicar em Iniciar sessão de Ana Clara em 2026-10-03 às 15:00–15:50')
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toBeVisible()
  await command(page, 'Marcar Pede ajuda')
  await expect(page.getByRole('checkbox', { name: /Pede ajuda/ })).toBeChecked()
  await command(page, 'Preencher Observações descritivas com Pediu ajuda para concluir o jogo')
  await command(page, 'Preencher Procedimentos realizados com Atividade lúdica')
  await command(page, 'Preencher Resultado e decisão com Continuar acompanhamento')
  await command(page, 'Salvar rascunho')
  await expect.poll(() => page.evaluate(() => window.writes.filter(item => item.command === 'session_draft_save').length)).toBeGreaterThan(0)
  await command(page, 'Finalizar sessão')
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await propose(page, 'confirmar')
  await expect.poll(() => page.evaluate(() => window.writes.filter(item => item.command === 'session_finalize').length)).toBe(1)
})
