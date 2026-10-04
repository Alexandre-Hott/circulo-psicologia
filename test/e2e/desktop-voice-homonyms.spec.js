import { expect, test } from '@playwright/test'

// Real desktop UI and voice router; synthetic records only at the Tauri boundary.
async function openApp(page) {
  await page.clock.install({ time: new Date('2026-10-03T15:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-03T15:00:00Z'))
  await page.addInitScript(() => {
    const clone = value => structuredClone(value)
    const patients = [
      { id: 'ana1', revision: 4, name: 'Ana Fictícia', age: 8, lifeCycle: 'Criança', birthDate: '2018-01-02', selfRequester: 'yes', preferredModality: 'Presencial', archivedAt: null },
      { id: 'ana2', revision: 7, name: 'Ana Fictícia', age: 17, lifeCycle: 'Adolescente', birthDate: null, selfRequester: 'no', preferredModality: 'Online', archivedAt: null },
      { id: 'caio', revision: 2, name: 'Caio Fictício', age: 9, lifeCycle: 'Criança', birthDate: null, selfRequester: null, preferredModality: '', archivedAt: null },
    ]
    const parties = [
      { id: 'maria-first', patientId: 'ana2', revision: 3, name: 'Maria Fictícia', relation: 'Mãe', roles: { requester: true, legalGuardian: true, administrativeContact: false }, archivedAt: null },
      { id: 'maria-second', patientId: 'ana2', revision: 6, name: 'Maria Fictícia', relation: 'Outro', roles: { requester: false, legalGuardian: false, administrativeContact: true }, archivedAt: null },
      { id: 'other-patient-party', patientId: 'ana1', revision: 9, name: 'Maria Fictícia', relation: 'Responsável legal', roles: { requester: false, legalGuardian: true, administrativeContact: false }, archivedAt: null },
    ]
    window.homonymWorkflow = { patients, parties, writes: [], calls: [], unexpected: [] }
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      const state = window.homonymWorkflow
      state.calls.push(clone({ command, args }))
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { available: false, dirty: false }
      if (command === 'plugin:updater|check') return null
      if (command === 'patient_list') return clone(patients.filter(item => args.includeArchived || item.archivedAt == null).sort((a, b) => a.name.localeCompare(b.name)))
      if (['behavior_list', 'indicator_catalog', 'agenda_occurrences', 'agenda_list_series', 'agenda_history', 'session_draft_list', 'session_timeline', 'session_addendum_list', 'case_context_list'].includes(command)) return []
      if (command === 'analytics_overview') return { totalCompletedSessions: 0, uniquePatients: 0, dailyCounts: [], monthlyCounts: [], behaviorCounts: [] }
      if (command === 'related_party_list') return clone(parties.filter(item => item.patientId === args.patientId && (args.includeArchived || item.archivedAt == null)))
      if (command === 'patient_update') {
        const item = patients.find(patient => patient.id === args.id && patient.archivedAt == null)
        if (!item || item.revision !== args.revision) throw new Error('Conflito de revisão sintético')
        const input = args.input
        if (!input.name.trim() || !['Criança', 'Adolescente', 'Adulto', 'Idoso', 'Não informado'].includes(input.lifeCycle)
          || (input.age !== null && (!Number.isSafeInteger(input.age) || input.age < 0))
          || !['yes', 'no', null].includes(input.selfRequester) || !['', 'Online', 'Presencial'].includes(input.preferredModality)) throw new Error('Payload de paciente sintético inválido')
        Object.assign(item, clone(input), { revision: item.revision + 1 })
        state.writes.push(clone({ command, args }))
        return clone(item)
      }
      if (command === 'related_party_update') {
        const item = parties.find(party => party.id === args.id && party.patientId === args.patientId && party.archivedAt == null)
        if (!item || item.revision !== args.revision || !patients.some(patient => patient.id === args.patientId)) throw new Error('Conflito de vínculo sintético')
        const input = args.input
        if (!input.name.trim() || !['Mãe', 'Pai', 'Responsável legal', 'Escola', 'Instituição', 'Outro'].includes(input.relation)
          || Object.keys(input.roles).sort().join(',') !== 'administrativeContact,legalGuardian,requester'
          || !Object.values(input.roles).every(value => typeof value === 'boolean') || !Object.values(input.roles).some(Boolean)) throw new Error('Payload de vínculo sintético inválido')
        Object.assign(item, clone(input), { revision: item.revision + 1 })
        state.writes.push(clone({ command, args }))
        return clone(item)
      }
      state.unexpected.push(command)
      throw new Error(`Invoke sem fixture: ${command}`)
    } }
  })
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Comando do Círculo' })).toBeVisible()
  await command(page, 'Abrir pacientes')
}

async function prepare(page, text) {
  const assistant = page.getByRole('region', { name: 'Comando do Círculo' })
  await assistant.getByLabel('Seu comando').fill(text)
  await assistant.getByRole('button', { name: 'Preparar rascunho' }).click()
}

async function writes(page) {
  return page.evaluate(() => window.homonymWorkflow.writes)
}

async function command(page, text) {
  const before = await writes(page)
  await prepare(page, text)
  await expect(page.locator('.voice-command-preview'), `Proposta para: ${text}`).toBeVisible()
  expect(await writes(page)).toEqual(before)
  await prepare(page, 'confirmar')
  await page.clock.runFor(32)
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
}

async function refuseAmbiguous(page, text) {
  const before = await writes(page)
  await prepare(page, text)
  await expect(page.locator('.voice-command-error')).toContainText('mais de uma opção')
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  expect(await writes(page)).toEqual(before)
}

async function openParties(page) {
  await command(page, 'Clicar em Pessoas vinculadas de Ana Fictícia · opção 2')
  const region = page.getByRole('region', { name: 'Pessoas vinculadas ao paciente' })
  await expect(region.getByRole('heading', { name: 'Vínculos de Ana Fictícia', exact: true })).toBeVisible()
  await expect(region.getByRole('form', { name: 'Novo vínculo', exact: true })).toHaveAttribute('data-voice-record', 'party:ana2:new')
  await expect(region.getByRole('form', { name: 'Novo vínculo', exact: true })).toHaveAttribute('data-voice-epoch', '0')
  return region
}

test.beforeEach(async ({ page, baseURL }) => {
  const unexpected = []
  page.on('dialog', async dialog => { unexpected.push(`native dialog: ${dialog.type()}`); await dialog.dismiss() })
  page.on('pageerror', error => unexpected.push(`page error: ${error.message}`))
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) await route.continue()
    else { unexpected.push(route.request().url()); await route.abort() }
  })
  page.unexpectedHomonymBoundary = unexpected
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.homonymWorkflow?.unexpected || [])).toEqual([])
  expect(page.unexpectedHomonymBoundary).toEqual([])
})

test('pacientes homônimos: nome simples recusa; opção 2 edita somente o segundo', async ({ page }) => {
  test.setTimeout(60000)
  await openApp(page)
  const original = await page.evaluate(() => window.homonymWorkflow.patients)
  const region = page.getByRole('region', { name: 'Pacientes', exact: true })
  for (const [index, patient] of original.slice(0, 2).entries()) {
    const row = region.locator(`li[data-voice-record="patient:${patient.id}"]`)
    await expect(row.locator(':scope > strong')).toHaveText(`Ana Fictícia · opção ${index + 1}`)
    await expect(row).toHaveAttribute('data-voice-epoch', String(patient.revision))
    for (const label of ['Editar', 'Pessoas vinculadas', 'Arquivar']) await expect(row.getByRole('button', { name: label, exact: true })).toBeVisible()
  }
  await expect(region.locator('li[data-voice-record="patient:caio"] > strong')).toHaveText('Caio Fictício')
  await refuseAmbiguous(page, 'Clicar em Editar de Ana Fictícia')
  await expect(page.getByRole('form', { name: 'Editar cadastro', exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => window.homonymWorkflow.patients)).toEqual(original)
  await command(page, 'Clicar em Editar de Ana Fictícia opção dois')
  const form = page.getByRole('form', { name: 'Editar cadastro', exact: true })
  await expect(form).toHaveAttribute('data-voice-record', 'ana2')
  await expect(form).toHaveAttribute('data-voice-epoch', '7')
  await expect(form.getByLabel('Nome', { exact: true })).toHaveValue('Ana Fictícia')
  await expect(form.getByLabel('Idade em anos (opcional)')).toHaveValue('17')
  await expect(form.getByLabel('O próprio paciente solicitou o atendimento?')).toHaveValue('no')
  await expect(form.getByLabel('Modalidade', { exact: true })).toHaveValue('Online')
  await command(page, 'Preencher Idade em anos (opcional) com 18')
  expect(await writes(page)).toEqual([])
  await command(page, 'Salvar alterações')
  await expect.poll(() => writes(page)).toEqual([{ command: 'patient_update', args: { id: 'ana2', revision: 7, input: { name: 'Ana Fictícia', age: 18, lifeCycle: 'Adulto', selfRequester: 'no', preferredModality: 'Online' } } }])
  expect(await page.evaluate(() => window.homonymWorkflow.patients)).toEqual([
    original[0], { ...original[1], age: 18, lifeCycle: 'Adulto', revision: 8 }, original[2],
  ])
  await expect(region.locator('li[data-voice-record="patient:ana2"]')).toHaveAttribute('data-voice-epoch', '8')
  await expect(region.locator('li[data-voice-record="patient:ana1"]')).toHaveAttribute('data-voice-epoch', '4')
})

test('vínculos homônimos: opção 2 grava ID/revisão corretos e preserva o primeiro', async ({ page }) => {
  await openApp(page)
  const original = await page.evaluate(() => ({ patients: window.homonymWorkflow.patients, parties: window.homonymWorkflow.parties }))
  const region = await openParties(page)
  await expect(region.locator('li[data-voice-record]')).toHaveCount(2)
  for (const [index, party] of original.parties.slice(0, 2).entries()) {
    const row = region.locator(`li[data-voice-record="party:${party.id}"]`)
    await expect(row.locator(':scope > strong')).toHaveText(`Maria Fictícia · opção ${index + 1}`)
    await expect(row).toHaveAttribute('data-voice-epoch', String(party.revision))
    for (const label of ['Editar vínculo', 'Arquivar vínculo']) await expect(row.getByRole('button', { name: label, exact: true })).toBeVisible()
  }
  await refuseAmbiguous(page, 'Clicar em Editar vínculo de Maria Fictícia')
  await expect(region.getByRole('form', { name: 'Editar vínculo', exact: true })).toHaveCount(0)
  await expect(region.getByLabel('Nome da pessoa ou instituição')).toHaveValue('')
  expect(await page.evaluate(() => window.homonymWorkflow.parties)).toEqual(original.parties)
  await command(page, 'Clicar em Editar vínculo de Maria Fictícia · opção 2')
  const form = region.getByRole('form', { name: 'Editar vínculo', exact: true })
  await expect(form).toHaveAttribute('data-voice-record', 'party:ana2:maria-second')
  await expect(form).toHaveAttribute('data-voice-epoch', '6')
  await expect(form.getByLabel('Nome da pessoa ou instituição')).toHaveValue('Maria Fictícia')
  await expect(form.getByLabel('Relação com o paciente')).toHaveValue('Outro')
  await expect(form.getByLabel('Solicitante', { exact: true })).not.toBeChecked()
  await expect(form.getByLabel('Responsável legal', { exact: true })).not.toBeChecked()
  await expect(form.getByLabel('Contato administrativo', { exact: true })).toBeChecked()
  await command(page, 'Selecionar Relação com o paciente como Instituição')
  await command(page, 'Marcar Solicitante')
  expect(await writes(page)).toEqual([])
  await command(page, 'Clicar em Salvar vínculo')
  const roles = { requester: true, legalGuardian: false, administrativeContact: true }
  await expect.poll(() => writes(page)).toEqual([{ command: 'related_party_update', args: { patientId: 'ana2', id: 'maria-second', revision: 6, input: { name: 'Maria Fictícia', relation: 'Instituição', roles } } }])
  expect(await page.evaluate(() => window.homonymWorkflow.parties)).toEqual([
    original.parties[0], { ...original.parties[1], relation: 'Instituição', roles, revision: 7 }, original.parties[2],
  ])
  expect(await page.evaluate(() => window.homonymWorkflow.patients)).toEqual(original.patients)
  await expect(region.locator('li[data-voice-record="party:maria-second"]')).toHaveAttribute('data-voice-epoch', '7')
  await expect(region.locator('li[data-voice-record="party:maria-first"]')).toHaveAttribute('data-voice-epoch', '3')
  await expect(region.getByRole('form', { name: 'Novo vínculo', exact: true })).toHaveAttribute('data-voice-record', 'party:ana2:new')
})

test('proposta de campo de vínculo recusa após edição direta de outro homônimo', async ({ page }) => {
  await openApp(page)
  const original = await page.evaluate(() => ({ patients: window.homonymWorkflow.patients, parties: window.homonymWorkflow.parties }))
  const region = await openParties(page)
  await command(page, 'Clicar em Editar vínculo de Maria Fictícia · opção 2')
  const form = region.getByRole('form', { name: 'Editar vínculo', exact: true })
  const field = form.getByLabel('Nome da pessoa ou instituição')
  await expect(form).toHaveAttribute('data-voice-record', 'party:ana2:maria-second')
  await prepare(page, 'Preencher Nome da pessoa ou instituição com Proposta Sintética Antiga')
  await expect(page.locator('.voice-command-preview')).toContainText('Proposta Sintética Antiga')
  await expect(field).toHaveValue('Maria Fictícia')
  expect(await writes(page)).toEqual([])
  const originalFieldId = await field.getAttribute('id')
  const originalEpoch = await page.locator('main').getAttribute('data-voice-epoch')
  // Keep the same mounted form, field ID, label and patient; only editingParty changes.
  await region.locator('li[data-voice-record="party:maria-first"]').getByRole('button', { name: 'Editar vínculo', exact: true }).click()
  await page.clock.runFor(32)
  await expect(form).toHaveAttribute('data-voice-record', 'party:ana2:maria-first')
  await expect(form).toHaveAttribute('data-voice-epoch', '3')
  await expect(field).toHaveAttribute('id', originalFieldId)
  await expect(page.locator('main')).toHaveAttribute('data-voice-epoch', originalEpoch)
  await expect(form.getByLabel('Relação com o paciente')).toHaveValue('Mãe')
  await expect(page.locator('.voice-command-preview')).toContainText('Proposta Sintética Antiga')
  await prepare(page, 'confirmar')
  await page.clock.runFor(32)
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  await expect(page.getByRole('alert').filter({ hasText: 'A tela mudou. Prepare o comando novamente antes de aplicar.' })).toBeVisible()
  await expect(field).toHaveValue('Maria Fictícia')
  await expect(form.getByLabel('Responsável legal', { exact: true })).toBeChecked()
  await expect(form.getByLabel('Contato administrativo', { exact: true })).not.toBeChecked()
  expect(await writes(page)).toEqual([])
  expect(await page.evaluate(() => ({ patients: window.homonymWorkflow.patients, parties: window.homonymWorkflow.parties }))).toEqual(original)
  // A newly prepared command still applies to the current first record.
  await command(page, 'Preencher Nome da pessoa ou instituição com Proposta Sintética Nova')
  await expect(field).toHaveValue('Proposta Sintética Nova')
  await command(page, 'Clicar em Cancelar edição do vínculo')
  await expect(region.getByLabel('Nome da pessoa ou instituição')).toHaveValue('')
  expect(await writes(page)).toEqual([])
  expect(await page.evaluate(() => window.homonymWorkflow.parties)).toEqual(original.parties)
})

test('Agenda, Sessões e Análises: nome simples recusa e opção 2 seleciona ana2 por voz', async ({ page }) => {
  test.setTimeout(60000)
  await openApp(page)
  const original = await page.evaluate(() => ({ patients: window.homonymWorkflow.patients, parties: window.homonymWorkflow.parties }))
  const areas = [
    { navigation: 'Abrir agenda', label: 'Paciente', setup: 'Clicar em Novo compromisso', initial: 'ana1' },
    { navigation: 'Abrir sessões', label: 'Paciente para evolução e sessões', initial: '' },
    { navigation: 'Abrir análises', label: 'Paciente', initial: '' },
  ]
  for (const { navigation, label, setup, initial } of areas) {
    await command(page, navigation)
    if (setup) await command(page, setup)
    const select = page.getByRole('combobox', { name: label, exact: true })
    await expect(select).toBeVisible()
    await expect(select).toHaveValue(initial)
    for (const index of [1, 2]) await expect(select.getByRole('option', { name: `Ana Fictícia · opção ${index}`, exact: true })).toHaveAttribute('value', `ana${index}`)
    await prepare(page, `Selecionar ${label} como Ana Fictícia`)
    await expect(page.locator('.voice-command-error')).toContainText('escolha:')
    await expect(page.locator('.voice-command-error')).toContainText('Ana Fictícia · opção 1')
    await expect(page.locator('.voice-command-error')).toContainText('Ana Fictícia · opção 2')
    await expect(page.locator('.voice-command-preview')).toHaveCount(0)
    await expect(select).toHaveValue(initial)
    expect(await writes(page)).toEqual([])
    // Spoken text needs no middle-dot punctuation from the visible option label.
    await prepare(page, `Selecionar ${label} como Ana Fictícia opção 2`)
    await expect(page.locator('.voice-command-preview')).toBeVisible()
    await expect(select).toHaveValue(initial)
    expect(await writes(page)).toEqual([])
    await prepare(page, 'confirmar')
    await page.clock.runFor(32)
    await expect(page.locator('.voice-command-preview')).toHaveCount(0)
    await expect(select).toHaveValue('ana2')
    if (navigation === 'Abrir sessões') {
      for (const name of ['session_draft_list', 'session_timeline', 'session_addendum_list', 'case_context_list']) {
        await expect.poll(() => page.evaluate(commandName => window.homonymWorkflow.calls.filter(item => item.command === commandName).at(-1), name)).toEqual({ command: name, args: { patientId: 'ana2' } })
      }
    }
    if (navigation === 'Abrir análises') {
      await expect.poll(() => page.evaluate(() => window.homonymWorkflow.calls.filter(item => item.command === 'analytics_overview').at(-1))).toEqual({ command: 'analytics_overview', args: { from: '2026-10-01', to: '2026-10-31', patientId: 'ana2' } })
    }
    expect(await writes(page)).toEqual([])
  }
  // Agenda retains the value in the real form state after navigating away and back.
  await command(page, 'Abrir agenda')
  await expect(page.getByRole('form', { name: 'Novo compromisso', exact: true }).getByRole('combobox', { name: 'Paciente', exact: true })).toHaveValue('ana2')
  expect(await writes(page)).toEqual([])
  expect(await page.evaluate(() => ({ patients: window.homonymWorkflow.patients, parties: window.homonymWorkflow.parties }))).toEqual(original)
})
