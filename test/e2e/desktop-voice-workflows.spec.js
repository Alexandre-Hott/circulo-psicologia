import { expect, test } from '@playwright/test'

// Real desktop components and voice router; only the Tauri boundary is synthetic.
async function openApp(page) {
  await page.clock.install({ time: new Date('2026-10-03T15:00:00Z') })
  // Hold autosave timers so each persistence assertion belongs to an explicit save.
  await page.clock.pauseAt(new Date('2026-10-03T15:00:00Z'))
  await page.addInitScript(() => {
    const clone = value => structuredClone(value)
    const patients = ['ana', 'caio'].map((id, index) => ({ id, name: index ? 'Caio Fictício' : 'Ana Clara', age: 8, revision: 1, preferredModality: 'Presencial', archivedAt: null }))
    const occurrence = { id: 'occ-ana', seriesId: 'series-ana', patientId: 'ana', date: '2026-10-03', originalDate: '2026-10-03', start: '15:00', end: '15:50', frequency: 'Avulsa', modality: 'Presencial', status: 'scheduled' }
    const catalog = [{ id: 'participacao', name: 'Participação sintética', version: 1, definition: 'Escala fictícia para testar o formulário.', labels: ['Sem participação', 'Com apoio', 'Autônoma'] }]
    const timeline = ['morning', 'afternoon'].map((id, index) => ({ id, patientId: 'ana', sessionDate: '2026-10-02', start: index ? '15:00' : '09:00', end: index ? '15:50' : '09:50', modality: 'Presencial', wasRescheduled: false, observation: `Observação original ${id}`, procedures: 'Procedimento sintético', outcomeDecision: 'Decisão sintética', referralClosure: null, behaviors: [], indicators: [], author: null, recordedAt: '2026-10-02T19:00:00Z' }))
    const state = { parties: [{ id: 'party-caio', patientId: 'caio', revision: 1, name: 'Pessoa de Caio', relation: 'Pai', roles: { requester: true, legalGuardian: false, administrativeContact: false }, archivedAt: null }], contexts: [], addenda: [], drafts: [], timeline }
    window.workflow = { state, writes: [], calls: [], unexpected: [] }
    const save = (command, args, value) => { window.workflow.writes.push(clone({ command, args })); return clone(value) }
    const patientExists = patientId => { if (!patients.some(patient => patient.id === patientId)) throw new Error('Paciente sintético ausente') }
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      window.workflow.calls.push(clone({ command, args }))
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { available: false, dirty: false }
      if (command === 'plugin:updater|check') return null
      if (command === 'patient_list') return clone(patients)
      if (command === 'behavior_list') return []
      if (command === 'indicator_catalog') return clone(catalog)
      if (command === 'agenda_list_series' || command === 'agenda_history') return []
      if (command === 'agenda_occurrences') return clone([occurrence].filter(item => item.date >= args.from && item.date <= args.to))
      if (command === 'related_party_list') return clone(state.parties.filter(item => item.patientId === args.patientId && (args.includeArchived || item.archivedAt == null)))
      if (command === 'related_party_create' || command === 'related_party_update') {
        patientExists(args.patientId)
        if (!args.input.name.trim() || !Object.values(args.input.roles).some(Boolean)) throw new Error('Vínculo inválido')
        let item
        if (command === 'related_party_create') {
          item = { id: 'party-ana', patientId: args.patientId, revision: 1, ...clone(args.input), archivedAt: null }
          state.parties.push(item)
        } else {
          item = state.parties.find(party => party.id === args.id && party.patientId === args.patientId)
          if (!item || item.revision !== args.revision) throw new Error('Conflito de revisão')
          Object.assign(item, clone(args.input), { revision: item.revision + 1 })
        }
        return save(command, args, item)
      }
      if (command === 'related_party_archive' || command === 'related_party_restore') {
        const item = state.parties.find(party => party.id === args.id && party.patientId === args.patientId)
        if (!item || item.revision !== args.revision) throw new Error('Conflito de revisão')
        item.archivedAt = command === 'related_party_archive' ? '2026-10-03T15:00:00Z' : null
        item.revision++
        return save(command, args, item)
      }
      if (command === 'session_draft_start') {
        if (args.seriesId !== occurrence.seriesId || args.originalDate !== occurrence.originalDate) throw new Error('Ocorrência ausente')
        const draft = { id: 'draft-ana', patientId: 'ana', seriesId: args.seriesId, originalDate: args.originalDate, observation: '', procedures: '', outcomeDecision: '', referralClosure: null, behaviorIds: [], indicators: [] }
        state.drafts.push(draft)
        return save(command, args, draft)
      }
      if (command === 'session_draft_list') return clone(state.drafts.filter(item => item.patientId === args.patientId))
      if (command === 'session_draft_save') {
        const draft = state.drafts.find(item => item.id === args.id)
        if (!draft) throw new Error('Rascunho ausente')
        for (const entry of args.input.indicators) {
          const definition = catalog.find(item => item.id === entry.id)
          if (!definition || (entry.value !== null && (!Number.isInteger(entry.value) || entry.value < 0 || entry.value >= definition.labels.length))) throw new Error('Indicador inválido')
        }
        Object.assign(draft, clone(args.input))
        return save(command, args, draft)
      }
      if (command === 'session_timeline') return clone(state.timeline.filter(item => item.patientId === args.patientId))
      if (command === 'case_context_list') return clone(state.contexts.filter(item => item.patientId === args.patientId).slice().reverse())
      if (command === 'case_context_create') {
        patientExists(args.patientId)
        if (!args.demand.trim() || !args.objectives.trim()) throw new Error('Contexto inválido')
        const item = { id: `context-${state.contexts.length + 1}`, patientId: args.patientId, demand: args.demand.trim(), objectives: args.objectives.trim(), recordedAt: `2026-10-03T15:00:0${state.contexts.length}Z`, author: null }
        state.contexts.push(item)
        return save(command, args, item)
      }
      if (command === 'session_addendum_list') return clone(state.addenda.filter(item => item.patientId === args.patientId))
      if (command === 'session_addendum_create') {
        if (!state.timeline.some(item => item.id === args.sessionId && item.patientId === args.patientId) || !args.content.trim()) throw new Error('Sessão finalizada ou conteúdo inválido')
        const item = { id: `addendum-${state.addenda.length + 1}`, sessionId: args.sessionId, patientId: args.patientId, content: args.content.trim(), createdAt: '2026-10-03T15:00:00Z' }
        state.addenda.push(item)
        return save(command, args, item)
      }
      window.workflow.unexpected.push(command)
      throw new Error(`Invoke sem fixture: ${command}`)
    } }
  })
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Comando do Círculo' })).toBeVisible()
}

async function propose(page, text) {
  const assistant = page.getByRole('region', { name: 'Comando do Círculo' })
  await assistant.getByLabel('Seu comando').fill(text)
  await assistant.getByRole('button', { name: 'Preparar rascunho' }).click()
}

async function command(page, text, persistenceCommand = null) {
  const before = persistenceCommand ? await writes(page, persistenceCommand) : null
  await propose(page, text)
  await expect(page.locator('.voice-command-preview'), `Proposta para: ${text}`).toBeVisible()
  if (persistenceCommand) expect(await writes(page, persistenceCommand)).toEqual(before)
  await propose(page, 'confirmar')
  // Flush UI effects without advancing the 600 ms autosave delay per action.
  await page.clock.runFor(32)
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
}

async function writes(page, name) {
  return page.evaluate(commandName => window.workflow.writes.filter(item => item.command === commandName), name)
}

async function openRecords(page) {
  await command(page, 'Abrir registros de Ana Clara')
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue('ana')
}

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.workflow?.unexpected || [])).toEqual([])
})

test('vínculo: criar, editar, arquivar e restaurar por voz', async ({ page }) => {
  await openApp(page)
  await command(page, 'Abrir vínculos de Ana Clara')
  const region = page.getByRole('region', { name: 'Pessoas vinculadas ao paciente' })
  await expect(region.getByRole('heading', { name: 'Vínculos de Ana Clara' })).toBeVisible()
  await expect(region.getByText('Pessoa de Caio', { exact: true })).toHaveCount(0)
  await command(page, 'Preencher Nome da pessoa ou instituição com Maria Fictícia')
  await command(page, 'Selecionar Relação com o paciente como Mãe')
  await expect(region.getByRole('button', { name: 'Adicionar vínculo', exact: true })).toBeDisabled()
  await propose(page, 'Clicar em Adicionar vínculo')
  await expect(page.locator('.voice-command-error')).toContainText('Não encontrei')
  expect(await writes(page, 'related_party_create')).toEqual([])
  for (const role of ['Solicitante', 'Responsável legal', 'Contato administrativo']) await command(page, `Marcar ${role}`)
  await command(page, 'Clicar em Adicionar vínculo', 'related_party_create')
  await expect.poll(() => writes(page, 'related_party_create')).toEqual([{ command: 'related_party_create', args: { patientId: 'ana', input: { name: 'Maria Fictícia', relation: 'Mãe', roles: { requester: true, legalGuardian: true, administrativeContact: true } } } }])
  await expect(region.getByLabel('Nome da pessoa ou instituição')).toHaveValue('')
  await command(page, 'Clicar em Editar vínculo de Maria Fictícia')
  await expect(region.getByLabel('Nome da pessoa ou instituição')).toHaveValue('Maria Fictícia')
  await command(page, 'Preencher Nome da pessoa ou instituição com Escola Fictícia')
  await command(page, 'Selecionar Relação com o paciente como Escola')
  await command(page, 'Desmarcar Responsável legal')
  await command(page, 'Desmarcar Contato administrativo')
  await command(page, 'Clicar em Salvar vínculo', 'related_party_update')
  await expect.poll(() => writes(page, 'related_party_update')).toEqual([{ command: 'related_party_update', args: { patientId: 'ana', id: 'party-ana', revision: 1, input: { name: 'Escola Fictícia', relation: 'Escola', roles: { requester: true, legalGuardian: false, administrativeContact: false } } } }])
  await command(page, 'Clicar em Arquivar vínculo de Escola Fictícia')
  await expect(page.getByRole('alertdialog')).toContainText('Arquivar o vínculo de Escola Fictícia?')
  expect(await writes(page, 'related_party_archive')).toEqual([])
  await propose(page, 'voltar')
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  expect(await writes(page, 'related_party_archive')).toEqual([])
  await command(page, 'Clicar em Arquivar vínculo de Escola Fictícia')
  await propose(page, 'confirmar')
  await expect.poll(() => writes(page, 'related_party_archive')).toEqual([{ command: 'related_party_archive', args: { patientId: 'ana', id: 'party-ana', revision: 2 } }])
  await expect(region.getByText('Escola Fictícia', { exact: true })).toHaveCount(0)
  await command(page, 'Marcar Mostrar vínculos arquivados')
  await expect(region.getByText('Escola Fictícia', { exact: true })).toBeVisible()
  await command(page, 'Clicar em Restaurar vínculo de Escola Fictícia')
  await expect(page.getByRole('alertdialog')).toContainText('Restaurar o vínculo de Escola Fictícia?')
  expect(await writes(page, 'related_party_restore')).toEqual([])
  await propose(page, 'confirmar')
  await expect.poll(() => writes(page, 'related_party_restore')).toEqual([{ command: 'related_party_restore', args: { patientId: 'ana', id: 'party-ana', revision: 3 } }])
  await command(page, 'Desmarcar Mostrar vínculos arquivados')
  await expect(region.getByText('Escola Fictícia', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.workflow.state.parties)).toEqual([
    { id: 'party-caio', patientId: 'caio', revision: 1, name: 'Pessoa de Caio', relation: 'Pai', roles: { requester: true, legalGuardian: false, administrativeContact: false }, archivedAt: null },
    { id: 'party-ana', patientId: 'ana', revision: 4, name: 'Escola Fictícia', relation: 'Escola', roles: { requester: true, legalGuardian: false, administrativeContact: false }, archivedAt: null },
  ])
})

test('indicador: selecionar, anotar, limpar e salvar por voz', async ({ page }) => {
  await openApp(page)
  await command(page, 'Iniciar sessão de Ana Clara hoje às 15 horas', 'session_draft_start')
  const form = page.getByRole('form', { name: 'Rascunho de sessão' })
  await expect(form).toBeVisible()
  await expect.poll(() => writes(page, 'session_draft_start')).toEqual([{ command: 'session_draft_start', args: { seriesId: 'series-ana', originalDate: '2026-10-03' } }])
  await expect(form.getByLabel('Participação sintética · v1', { exact: true }).getByRole('option')).toHaveCount(4)
  await command(page, 'Selecionar Participação sintética como Com apoio')
  await command(page, 'Preencher Nota contextual opcional · Participação sintética com Apoio durante jogo fictício')
  await expect(form.getByLabel('Participação sintética · v1', { exact: true })).toHaveValue('1')
  await expect(form.getByLabel('Nota contextual opcional · Participação sintética')).toHaveValue('Apoio durante jogo fictício')
  expect(await writes(page, 'session_draft_save')).toEqual([])
  await command(page, 'Salvar rascunho', 'session_draft_save')
  const payload = indicators => ({ command: 'session_draft_save', args: { id: 'draft-ana', input: { observation: '', procedures: '', outcomeDecision: '', referralClosure: '', behaviorIds: [], indicators } } })
  await expect.poll(() => writes(page, 'session_draft_save')).toEqual([payload([{ id: 'participacao', value: 1, note: 'Apoio durante jogo fictício' }])])
  await command(page, 'Clicar em Limpar Participação sintética')
  await expect(form.getByLabel('Participação sintética · v1', { exact: true })).toHaveValue('')
  await expect(form.getByLabel('Nota contextual opcional · Participação sintética')).toHaveValue('')
  await command(page, 'Salvar rascunho', 'session_draft_save')
  await expect.poll(() => writes(page, 'session_draft_save')).toEqual([payload([{ id: 'participacao', value: 1, note: 'Apoio durante jogo fictício' }]), payload([{ id: 'participacao', value: null, note: null }])])
  await command(page, 'Selecionar Participação sintética como Autônoma')
  await command(page, 'Preencher Nota contextual opcional · Participação sintética com Registro sintético final')
  await command(page, 'Salvar rascunho', 'session_draft_save')
  await expect.poll(async () => (await writes(page, 'session_draft_save')).at(-1)).toEqual(payload([{ id: 'participacao', value: 2, note: 'Registro sintético final' }]))
  expect(await page.evaluate(() => window.workflow.state.drafts[0].patientId)).toBe('ana')
})

test('contexto: duas revisões preservam o conteúdo anterior', async ({ page }) => {
  await openApp(page)
  await openRecords(page)
  await command(page, 'Clicar em Contexto do caso')
  const form = page.getByRole('form', { name: 'Nova revisão do contexto do caso' })
  for (const [demand, objectives] of [['Demanda sintética inicial', 'Objetivo sintético inicial'], ['Demanda sintética revisada', 'Objetivo sintético revisado']]) {
    await expect(form.getByRole('button', { name: 'Salvar nova revisão do contexto' })).toBeDisabled()
    await command(page, `Preencher Demanda avaliada com ${demand}`)
    await command(page, `Preencher Objetivos de trabalho com ${objectives}`)
    await command(page, 'Clicar em Salvar nova revisão do contexto', 'case_context_create')
    await expect(form.getByLabel('Demanda avaliada')).toHaveValue('')
    await expect(form.getByLabel('Objetivos de trabalho')).toHaveValue('')
  }
  await expect.poll(() => writes(page, 'case_context_create')).toEqual([
    { command: 'case_context_create', args: { patientId: 'ana', demand: 'Demanda sintética inicial', objectives: 'Objetivo sintético inicial' } },
    { command: 'case_context_create', args: { patientId: 'ana', demand: 'Demanda sintética revisada', objectives: 'Objetivo sintético revisado' } },
  ])
  const context = page.locator('details').filter({ has: page.getByRole('form', { name: 'Nova revisão do contexto do caso' }) })
  await expect(context.locator(':scope > dl')).toContainText('Demanda sintética revisada')
  await expect(context.locator(':scope > dl')).toContainText('Objetivo sintético revisado')
  await expect(context.locator(':scope > ol')).toContainText('Demanda sintética inicial')
  await expect(context.locator(':scope > ol')).toContainText('Objetivo sintético inicial')
  const contexts = await page.evaluate(() => window.workflow.state.contexts)
  expect(contexts.map(item => ({ id: item.id, patientId: item.patientId, demand: item.demand, objectives: item.objectives }))).toEqual([
    { id: 'context-1', patientId: 'ana', demand: 'Demanda sintética inicial', objectives: 'Objetivo sintético inicial' },
    { id: 'context-2', patientId: 'ana', demand: 'Demanda sintética revisada', objectives: 'Objetivo sintético revisado' },
  ])
})

test('adendo: salvar e cancelar na sessão finalizada correta', async ({ page }) => {
  await openApp(page)
  const original = await page.evaluate(() => window.workflow.state.timeline)
  await openRecords(page)
  await command(page, 'Clicar em Evolução e escalas registradas · Adicionar adendo')
  await command(page, 'Clicar em Adicionar adendo de Ana Clara em 2026-10-02 às 15:00–15:50')
  await expect(page.locator('#addendum-afternoon')).toBeVisible()
  await expect(page.locator('#addendum-morning')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Salvar adendo imutável' })).toBeDisabled()
  await command(page, 'Preencher Texto do adendo com Complemento sintético da tarde')
  await expect(page.locator('#addendum-afternoon')).toHaveValue('Complemento sintético da tarde')
  expect(await writes(page, 'session_addendum_create')).toEqual([])
  await command(page, 'Clicar em Salvar adendo imutável', 'session_addendum_create')
  await expect.poll(() => writes(page, 'session_addendum_create')).toEqual([{ command: 'session_addendum_create', args: { sessionId: 'afternoon', patientId: 'ana', content: 'Complemento sintético da tarde' } }])
  const afternoon = page.locator('[data-voice-record="session:afternoon"]')
  const morning = page.locator('[data-voice-record="session:morning"]')
  await expect(afternoon).toContainText('Complemento sintético da tarde')
  await expect(morning).not.toContainText('Complemento sintético da tarde')
  await command(page, 'Clicar em Adicionar adendo de Ana Clara em 2026-10-02 às 15:00–15:50')
  await command(page, 'Preencher Texto do adendo (até 4000 caracteres) com Complemento a descartar')
  await command(page, 'Clicar em Cancelar')
  await expect(page.locator('#addendum-afternoon')).toHaveCount(0)
  expect(await writes(page, 'session_addendum_create')).toHaveLength(1)
  await expect(afternoon).not.toContainText('Complemento a descartar')
  await command(page, 'Clicar em Adicionar adendo de Ana Clara em 2026-10-02 às 15:00–15:50')
  await expect(page.locator('#addendum-afternoon')).toHaveValue('')
  await command(page, 'Clicar em Cancelar')
  expect(await page.evaluate(() => window.workflow.state.timeline)).toEqual(original)
})
