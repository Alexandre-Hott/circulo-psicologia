import { expect, test } from '@playwright/test'

// Real desktop forms/router; synthetic data and persistence only at the Tauri boundary.
async function openApp(page) {
  await page.clock.install({ time: new Date('2026-10-03T15:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-03T15:00:00Z'))
  await page.addInitScript(() => {
    const clone = value => structuredClone(value)
    const patients = [
      { id: 'ana', revision: 4, name: 'Ana Fictícia', age: 8, lifeCycle: 'Criança', birthDate: '2018-01-02', selfRequester: 'yes', preferredModality: 'Presencial', archivedAt: null },
      { id: 'caio', revision: 2, name: 'Caio Fictício', age: 17, lifeCycle: 'Adolescente', birthDate: null, selfRequester: 'no', preferredModality: 'Online', archivedAt: null },
      { id: 'bia', revision: 3, name: 'Bia Fictícia', age: null, lifeCycle: 'Não informado', birthDate: null, selfRequester: null, preferredModality: '', archivedAt: null },
      { id: 'archived', revision: 5, name: 'Arquivo Fictício', age: 65, lifeCycle: 'Idoso', birthDate: null, selfRequester: null, preferredModality: '', archivedAt: '2026-10-02T15:00:00Z' },
    ]
    window.patientWorkflow = { patients, writes: [], calls: [], unexpected: [] }
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      window.patientWorkflow.calls.push(clone({ command, args }))
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { available: false, dirty: false }
      if (command === 'plugin:updater|check') return null
      if (command === 'patient_list') return clone(patients.filter(item => args.includeArchived || item.archivedAt == null).sort((a, b) => a.name.localeCompare(b.name)))
      if (['behavior_list', 'indicator_catalog', 'agenda_occurrences', 'agenda_list_series', 'agenda_history'].includes(command)) return []
      if (command === 'patient_create' || command === 'patient_update') {
        const input = args.input
        if (!input.name.trim() || !['Criança', 'Adolescente', 'Adulto', 'Idoso', 'Não informado'].includes(input.lifeCycle)
          || (input.age !== null && (!Number.isSafeInteger(input.age) || input.age < 0))
          || !['yes', 'no', null].includes(input.selfRequester) || !['', 'Online', 'Presencial'].includes(input.preferredModality)) throw new Error('Payload sintético inválido')
        let item
        if (command === 'patient_create') {
          item = { id: `created-${patients.length}`, revision: 1, birthDate: null, archivedAt: null, ...clone(input) }
          patients.push(item)
        } else {
          item = patients.find(patient => patient.id === args.id && patient.archivedAt == null)
          if (!item || item.revision !== args.revision) throw new Error('Conflito de revisão')
          // Omitted birthDate is preserved, as in the native PatientInput model.
          Object.assign(item, clone(input), { revision: item.revision + 1 })
        }
        window.patientWorkflow.writes.push(clone({ command, args }))
        return clone(item)
      }
      window.patientWorkflow.unexpected.push(command)
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

async function writes(page) {
  return page.evaluate(() => window.patientWorkflow.writes)
}

async function command(page, text) {
  const before = await writes(page)
  await propose(page, text)
  await expect(page.locator('.voice-command-preview'), `Proposta para: ${text}`).toBeVisible()
  expect(await writes(page)).toEqual(before)
  await propose(page, 'confirmar')
  await page.clock.runFor(32)
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
}

const requesterLabel = 'O próprio paciente solicitou o atendimento?'

async function fields(page, { name, age, requester, modality }) {
  await command(page, `Preencher Nome com ${name}`)
  await command(page, age === null ? 'Limpar o campo Idade em anos (opcional)' : `Preencher Idade em anos (opcional) com ${age}`)
  await command(page, `Selecionar ${requesterLabel} como ${requester}`)
  await command(page, `Selecionar Modalidade como ${modality}`)
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue(name)
  await expect(page.getByLabel('Idade em anos (opcional)')).toHaveValue(age === null ? '' : String(age))
  await expect(page.getByLabel(requesterLabel)).toHaveValue({ Sim: 'yes', Não: 'no', 'Não informado': '' }[requester])
  await expect(page.getByLabel('Modalidade', { exact: true })).toHaveValue(modality === 'Não informada' ? '' : modality)
}

test.beforeEach(async ({ page, baseURL }) => {
  const unexpected = []
  page.on('dialog', async dialog => { unexpected.push(`native dialog: ${dialog.type()}`); await dialog.dismiss() })
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) await route.continue()
    else { unexpected.push(route.request().url()); await route.abort() }
  })
  page.unexpectedPatientBoundary = unexpected
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.patientWorkflow?.unexpected || [])).toEqual([])
  expect(page.unexpectedPatientBoundary).toEqual([])
})

test('voz cria pacientes com payload completo e solicitante yes/no/null', async ({ page }) => {
  test.setTimeout(60000)
  await openApp(page)
  await command(page, 'Cadastrar paciente Nova Fictícia com 8 anos presencial')
  // Both the visible label verbatim and an explicit field prefix must work.
  await command(page, `Selecionar o campo ${requesterLabel} como Sim`)
  await expect(page.getByLabel(requesterLabel)).toHaveValue('yes')
  expect(await writes(page)).toEqual([])
  const cases = [
    { name: 'Nova Fictícia', age: 0, requester: 'Sim', modality: 'Presencial', lifeCycle: 'Criança', selfRequester: 'yes', preferredModality: 'Presencial' },
    { name: 'Novo Fictício', age: 17, requester: 'Não', modality: 'Online', lifeCycle: 'Adolescente', selfRequester: 'no', preferredModality: 'Online' },
    { name: 'Outro Fictício', age: null, requester: 'Não informado', modality: 'Não informada', lifeCycle: 'Não informado', selfRequester: null, preferredModality: '' },
  ]
  const expected = []
  for (const spec of cases) {
    await expect(page.getByRole('form', { name: 'Novo cadastro', exact: true })).toBeVisible()
    await fields(page, spec)
    expect(await writes(page)).toEqual(expected)
    await command(page, 'Salvar paciente')
    const { name, age, lifeCycle, selfRequester, preferredModality } = spec
    expected.push({ command: 'patient_create', args: { input: { name, age, lifeCycle, selfRequester, preferredModality } } })
    await expect.poll(() => writes(page)).toEqual(expected)
    await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('')
    await expect(page.getByLabel(requesterLabel)).toHaveValue('')
    await expect(page.getByLabel('Modalidade', { exact: true })).toHaveValue('')
    await expect(page.getByRole('region', { name: 'Pacientes', exact: true }).getByText(name, { exact: true })).toBeVisible()
  }
  expect(await page.evaluate(() => window.patientWorkflow.patients.filter(item => item.id.startsWith('created-')))).toEqual(cases.map((spec, index) => ({ id: `created-${4 + index}`, revision: 1, birthDate: null, archivedAt: null, name: spec.name, age: spec.age, lifeCycle: spec.lifeCycle, selfRequester: spec.selfRequester, preferredModality: spec.preferredModality })))
})

test('idade falada vira número antes de salvar, sem alterar texto livre', async ({ page }) => {
  await openApp(page)
  await command(page, 'Cadastrar paciente Nova Fictícia com 8 anos')
  await propose(page, 'Preencher Idade com nove')
  await expect(page.locator('.voice-command-preview')).toContainText(': 9')
  await expect(page.getByLabel('Idade em anos (opcional)')).toHaveValue('8')
  expect(await writes(page)).toEqual([])
  await propose(page, 'confirmar')
  await page.clock.runFor(32)
  await expect(page.getByLabel('Idade em anos (opcional)')).toHaveValue('9')
  await command(page, 'Preencher Idade com cento e dezassete')
  await expect(page.getByLabel('Idade em anos (opcional)')).toHaveValue('117')
  await command(page, 'Preencher Idade com nove')
  await command(page, 'Preencher Nome com Nove Fictício')
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('Nove Fictício')
  for (const invalid of ['nove ou dez', 'mais ou menos nove', 'cento e vinte e um', 'nove e meio', '-1']) {
    await propose(page, `Preencher Idade com ${invalid}`)
    await expect(page.locator('.voice-command-error')).toBeVisible()
    await expect(page.locator('.voice-command-preview')).toHaveCount(0)
    await expect(page.getByLabel('Idade em anos (opcional)')).toHaveValue('9')
    expect(await writes(page)).toEqual([])
  }
  await command(page, 'Salvar paciente')
  await expect.poll(() => writes(page)).toEqual([{ command: 'patient_create', args: { input: {
    name: 'Nove Fictício', age: 9, lifeCycle: 'Criança', selfRequester: null, preferredModality: '',
  } } }])
})

test('marcador de idade alterado invalida proposta antiga', async ({ page }) => {
  await openApp(page)
  await command(page, 'Cadastrar paciente Nova Fictícia com 8 anos')
  await propose(page, 'Preencher Idade com nove')
  await expect(page.locator('.voice-command-preview')).toContainText(': 9')
  await page.getByLabel('Idade em anos (opcional)').evaluate(element => element.removeAttribute('data-voice-value-type'))
  await propose(page, 'confirmar')
  await expect(page.getByRole('alert')).toContainText('A tela mudou')
  await expect(page.getByLabel('Idade em anos (opcional)')).toHaveValue('8')
  expect(await writes(page)).toEqual([])
})

test('voz edita payload completo com revisão e cancelar não grava', async ({ page }) => {
  test.setTimeout(60000)
  await openApp(page)
  await command(page, 'Abrir pacientes')
  const original = await page.evaluate(() => window.patientWorkflow.patients)
  await command(page, 'Clicar em Editar de Ana Fictícia')
  await expect(page.getByRole('form', { name: 'Editar cadastro' })).toBeVisible()
  await expect(page.getByLabel(requesterLabel)).toHaveValue('yes')
  await fields(page, { name: 'Edição Descartada', age: 90, requester: 'Não', modality: 'Online' })
  await command(page, 'Clicar em Cancelar edição')
  await expect(page.getByRole('form', { name: 'Editar cadastro' })).toHaveCount(0)
  expect(await writes(page)).toEqual([])
  expect(await page.evaluate(() => window.patientWorkflow.patients)).toEqual(original)
  const cases = [
    { id: 'ana', revision: 4, target: 'Ana Fictícia', name: 'Ana Revisada', age: 24, requester: 'Não', modality: 'Online', lifeCycle: 'Adulto', selfRequester: 'no', preferredModality: 'Online' },
    { id: 'caio', revision: 2, target: 'Caio Fictício', name: 'Caio Revisado', age: 60, requester: 'Não informado', modality: 'Não informada', lifeCycle: 'Idoso', selfRequester: null, preferredModality: '' },
    { id: 'bia', revision: 3, target: 'Bia Fictícia', name: 'Bia Revisada', age: null, requester: 'Sim', modality: 'Presencial', lifeCycle: 'Não informado', selfRequester: 'yes', preferredModality: 'Presencial' },
  ]
  const expected = []
  for (const spec of cases) {
    await command(page, `Clicar em Editar de ${spec.target}`)
    await expect(page.getByLabel('Nome', { exact: true })).toHaveValue(spec.target)
    await fields(page, spec)
    expect(await writes(page)).toEqual(expected)
    await command(page, 'Salvar alterações')
    const { id, revision, name, age, lifeCycle, selfRequester, preferredModality } = spec
    expected.push({ command: 'patient_update', args: { id, revision, input: { name, age, lifeCycle, selfRequester, preferredModality } } })
    await expect.poll(() => writes(page)).toEqual(expected)
    await expect(page.getByRole('form', { name: 'Editar cadastro' })).toHaveCount(0)
    expect(await page.evaluate(id => window.patientWorkflow.patients.find(item => item.id === id), id)).toEqual({ ...original.find(item => item.id === id), name, age, lifeCycle, selfRequester, preferredModality, revision: revision + 1 })
  }
})

test('voz busca, limpa, inclui arquivados e atualiza lista sem escritas', async ({ page }) => {
  await openApp(page)
  await command(page, 'Abrir pacientes')
  const region = page.getByRole('region', { name: 'Pacientes', exact: true })
  const rows = region.locator(':scope > ul.vault-patients > li')
  await expect(rows).toHaveCount(3)
  await command(page, 'Preencher Buscar cadastro com cAiO')
  await expect(rows).toHaveCount(1)
  await expect(rows).toContainText('Caio Fictício')
  await command(page, 'Preencher Buscar cadastro com Nome Inexistente')
  await expect(rows).toHaveCount(0)
  await expect(region.getByText('Nenhum paciente encontrado.', { exact: true })).toBeVisible()
  await command(page, 'Limpar o campo Buscar cadastro')
  await expect(region.getByLabel('Buscar cadastro')).toHaveValue('')
  await expect(rows).toHaveCount(3)
  await command(page, 'Marcar Mostrar arquivados')
  await expect(region.getByLabel('Mostrar arquivados', { exact: true })).toBeChecked()
  await expect(rows).toHaveCount(4)
  await expect(rows.filter({ hasText: 'Arquivo Fictício' })).toContainText('Arquivado')
  const listCalls = () => page.evaluate(() => window.patientWorkflow.calls.filter(item => item.command === 'patient_list'))
  expect((await listCalls()).at(-1)).toEqual({ command: 'patient_list', args: { includeArchived: true } })
  for (const includeArchived of [true, false]) {
    if (!includeArchived) await command(page, 'Desmarcar Mostrar arquivados')
    const before = (await listCalls()).length
    await command(page, 'Atualizar lista')
    await expect.poll(async () => (await listCalls()).length).toBe(before + 1)
    expect((await listCalls()).at(-1)).toEqual({ command: 'patient_list', args: { includeArchived } })
    await expect(rows).toHaveCount(includeArchived ? 4 : 3)
  }
  await expect(region.getByLabel('Mostrar arquivados', { exact: true })).not.toBeChecked()
  expect(await writes(page)).toEqual([])
})
