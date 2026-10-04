import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const captures = JSON.parse(readFileSync(new URL('../fixtures/native-voice-details-20261004.json', import.meta.url), 'utf8'))

const patient = (id = 'ana', name = 'Ana Clara') => ({ id, name, age: 8, archivedAt: null })
const occurrence = (id = 'o1', extra = {}) => ({ id, patientId: 'ana', seriesId: 's1', originalDate: '2026-10-05', date: '2026-10-05', start: '15:00', end: '15:50', status: 'scheduled', frequency: 'Semanal', modality: 'Presencial', ...extra })
const controls = page => page.locator('#agenda-host button[data-voice-action^="agenda:details:"]')
const panel = page => page.locator('#agenda-details-panel')
const parse = (page, phrase) => page.evaluate(async text => (await import('/src/voiceInterfaceCommands.js')).parseVoiceInterfaceCommand(text, document), phrase)
const apply = (page, proposal) => page.evaluate(async intent => {
  try { (await import('/src/voiceInterfaceCommands.js')).applyVoiceInterfaceCommand(intent, document); return null }
  catch (error) { return error.message }
}, proposal.intent)
async function unchanged(page) {
  expect(await page.evaluate(() => window.detailsHarness.writes)).toEqual([])
  expect(await page.evaluate(() => window.detailsHarness.starts)).toBe(0)
  expect(await page.evaluate(() => JSON.stringify(window.detailsHarness.data))).toBe(await page.evaluate(() => window.detailsHarness.initial))
}
async function mount(page, { patients = [patient()], items = [occurrence()], mode = 'Dia', deferred = false } = {}) {
  await page.clock.setFixedTime(new Date('2026-10-05T12:00:00Z'))
  await page.addInitScript(({ patients, items, deferred }) => {
    const copy = value => JSON.parse(JSON.stringify(value))
    const data = { patients, items }
    window.detailsHarness = { data, initial: JSON.stringify(data), writes: [], calls: [], starts: 0, pending: [], deferred }
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      const h = window.detailsHarness
      h.calls.push(copy({ command, args }))
      if (command === 'patient_list') return copy(h.data.patients)
      if (command === 'agenda_list_series' || command === 'agenda_history') return []
      if (command === 'agenda_occurrences') {
        if (h.deferred) await new Promise(resolve => h.pending.push(resolve))
        return copy(h.data.items.filter(item => item.date >= args.from && item.date <= args.to))
      }
      h.writes.push(copy({ command, args }))
      throw new Error(`IPC inesperada: ${command}`)
    } }
  }, { patients, items, deferred })
  await page.goto('/test/e2e/fixtures/voice-command-center.html')
  await page.evaluate(async () => {
    document.getElementById('root').remove()
    const host = document.createElement('div'); host.id = 'agenda-host'; document.body.append(host)
    const module = await import('/node_modules/.vite/deps/react.js')
    const React = module.createElement ? module : module.default
    const dom = await import('/node_modules/.vite/deps/react-dom_client.js')
    const createRoot = dom.createRoot || dom.default.createRoot
    const { default: Agenda } = await import('/src/DesktopAgenda.jsx')
    window.detailsMount = () => {
      window.agendaRoot = createRoot(host)
      window.agendaRoot.render(React.createElement(Agenda, {
        patients: window.detailsHarness.data.patients,
        onChanged: async () => { window.detailsHarness.writes.push({ command: 'onChanged' }); throw new Error('Alteração inesperada') },
        onStartSession: () => { window.detailsHarness.starts++; throw new Error('Sessão inesperada') },
        onConfirm: async () => { throw new Error('Confirmação de gravação inesperada') },
      }))
    }
    window.detailsMount()
  })
  await expect(page.getByRole('region', { name: 'Agenda persistente de sessões' })).toBeVisible()
  await page.getByRole('button', { name: mode, exact: true }).click()
  if (!deferred) await expect(controls(page)).toHaveCount(items.length)
}

test('Dia: clicar em detalhes propõe sem abrir; confirmação abre apenas o alvo', async ({ page }) => {
  await mount(page)
  const proposal = await parse(page, 'Clicar em Detalhes de Ana Clara')
  expect(proposal.status).toBe('draft')
  await expect(panel(page)).toHaveCount(0)
  await unchanged(page)
  expect(await apply(page, proposal)).toBeNull()
  await expect(page.locator('#agenda-detail-o1')).toBeVisible()
  await unchanged(page)
  await page.getByRole('button', { name: 'Fechar detalhes', exact: true }).click()
  await expect(panel(page)).toHaveCount(0)
  await unchanged(page)
})

for (const mode of ['Dia', 'Semana', 'Mês']) {
  test(`${mode}: diretos, nomes exatos, legado e recusa de extras`, async ({ page }) => {
    await mount(page, { mode })
    for (const phrase of ['Detalhes de Ana Clara', 'Abrir detalhes de Ana Clara', 'Ver detalhes de Ana Clara', 'Clicar em Ver ações de Ana Clara em 2026-10-05 às 15:00–15:50']) expect((await parse(page, phrase)).status, phrase).toBe('draft')
    for (const phrase of ['Abrir detalhes de Ana', 'Ver detalhes de Ana Cla', 'Abrir detalhes de Ana Clara agora', 'Não abrir detalhes de Ana Clara', 'Abrir detalhes de Ana Clara em cinco de outubro às quinze horas']) expect((await parse(page, phrase))?.status, phrase).toBe('clarification')
    expect(await apply(page, await parse(page, 'Ver detalhes de Ana Clara'))).toBeNull()
    await expect(page.locator('#agenda-detail-o1')).toBeVisible()
    await unchanged(page)
  })
}

test('múltiplos: data civil completa e horário falado, nunca primeira', async ({ page }) => {
  await mount(page, { mode: 'Semana', items: [occurrence(), occurrence('o2', { start: '16:00', end: '16:50' }), occurrence('o3', { date: '2026-10-06', originalDate: '2026-10-06' })] })
  for (const phrase of ['Abrir detalhes de Ana Clara', 'Clicar em Detalhes de Ana Clara', 'Ver detalhes de Ana Clara em 05/10/2026', 'Ver detalhes de Ana Clara em 05/10/2026 às três horas']) expect((await parse(page, phrase)).status, phrase).toBe('clarification')
  for (const [phrase, id] of [['Abrir detalhes de Ana Clara em cinco de outubro de dois mil e vinte e seis às dezesseis horas', 'o2'], ['Ver detalhes de Ana Clara em 06/10/2026 às quinze horas', 'o3'], ['Clicar em Detalhes de Ana Clara em 2026-10-05 às três da tarde', 'o1']]) {
    const proposal = await parse(page, phrase)
    expect(proposal.status, phrase).toBe('draft')
    expect(proposal.intent.target.action).toBe(`agenda:details:${id}`)
  }
  expect(await apply(page, await parse(page, 'Ver detalhes de Ana Clara em 06/10/2026 às quinze horas'))).toBeNull()
  await expect(page.locator('#agenda-detail-o3')).toBeVisible()
  await expect(page.locator('#agenda-detail-o1')).toHaveCount(0)
  await unchanged(page)
})

for (const name of ['Ana C.', 'Ana em Clara', 'Ana às quinze horas', 'Ana em 05/10/2026 às quinze horas', 'Ana C. Silva']) {
  test(`nome literal com pontuação/separadores: ${JSON.stringify(name)}`, async ({ page }) => {
    await mount(page, { patients: [patient('ana', name)], items: [occurrence(), occurrence('o2', { start: '16:00', end: '16:50' })] })
    expect((await parse(page, `Detalhes de ${name}`)).status).toBe('clarification')
    for (const [prefix, time, id] of [['Ver detalhes', 'quinze horas', 'o1'], ['Detalhes', 'dezesseis horas', 'o2'], ['Clicar em Detalhes', 'quinze horas', 'o1']]) {
      const proposal = await parse(page, `${prefix} de ${name} em 05/10/2026 às ${time}`)
      expect(proposal.status).toBe('draft')
      expect(proposal.intent.target.action).toBe(`agenda:details:${id}`)
    }
    for (const phrase of [`Ver detalhes de Ana em 05/10/2026 às quinze horas`, `Ver detalhes de ${name.replace(/[./]/g, '')} em 05/10/2026 às quinze horas`, `Ver detalhes de ${name} em 05/10/2026 às quinze horas agora`]) {
      if (phrase === `Ver detalhes de ${name} em 05/10/2026 às quinze horas`) continue
      expect((await parse(page, phrase)).status, phrase).toBe('clarification')
    }
    expect(await apply(page, await parse(page, `Ver detalhes de ${name} em 05/10/2026 às quinze horas`))).toBeNull()
    await expect(page.locator('#agenda-detail-o1')).toBeVisible()
    await expect(page.locator('#agenda-detail-o2')).toHaveCount(0)
    await unchanged(page)
  })
}

for (const name of ['Ana Clara', 'ANA CLARA', ' Ána   Clara ']) {
  test(`homônimos normalizados recusam: ${JSON.stringify(name)}`, async ({ page }) => {
    await mount(page, { patients: [patient(), patient('ana2', name)] })
    for (const phrase of ['Abrir detalhes de Ana Clara', 'Clicar em Detalhes de Ana Clara em 05/10/2026 às quinze horas']) expect((await parse(page, phrase)).status).toBe('clarification')
    await unchanged(page)
  })
}

test('ocorrências com mesma data/hora não colapsam por action/name nem record', async ({ page }) => {
  await mount(page, { items: [occurrence(), occurrence('o2', { seriesId: 's2' })] })
  await controls(page).nth(1).evaluate(element => element.setAttribute('data-voice-action', 'agenda:details:o1'))
  for (const phrase of ['Abrir detalhes de Ana Clara', 'Ver detalhes de Ana Clara em 05/10/2026 às quinze horas', 'Clicar em Ver ações de Ana Clara em 2026-10-05 às 15:00–15:50']) expect((await parse(page, phrase)).status).toBe('clarification')
  await unchanged(page)
})

for (const extra of [{ status: 'completed' }, { wasRescheduled: true, originalDate: '2026-09-28' }]) {
  test(`detalhes de concluída/remarcada: ${JSON.stringify(extra)}`, async ({ page }) => {
    await mount(page, { items: [occurrence('o1', extra)] })
    const proposal = await parse(page, 'Abrir detalhes de Ana Clara em 05/10/2026 às quinze horas')
    expect(proposal.status).toBe('draft')
    expect(await apply(page, proposal)).toBeNull()
    await expect(page.locator('#agenda-detail-o1')).toBeVisible()
    await unchanged(page)
  })
}

test('diretos competem com todos os aliases antes de exigir papel detalhes', async ({ page }) => {
  await mount(page)
  for (const phrase of ['Abrir detalhes de Ana Clara', 'Ver detalhes de Ana Clara', 'Detalhes de Ana Clara', 'Verdetales de Ana Clara']) {
    await page.evaluate(text => { const button = document.createElement('button'); button.id = 'competitor'; button.setAttribute('data-voice-alias', text); button.textContent = 'Outro controle'; document.body.append(button) }, phrase)
    expect((await parse(page, phrase)).status).toBe('clarification')
    if (phrase === 'Detalhes de Ana Clara') expect((await parse(page, `Clicar em ${phrase}`)).status).toBe('clarification')
    await page.locator('#competitor').evaluate(element => element.remove())
  }
  await controls(page).evaluateAll(elements => elements.forEach(element => element.remove()))
  await page.evaluate(() => { const button = document.createElement('button'); button.textContent = 'Abrir detalhes de Ana Clara'; document.body.append(button) })
  expect((await parse(page, 'Abrir detalhes de Ana Clara')).status).toBe('clarification')
  await unchanged(page)
})

for (const attribute of ['hidden', 'disabled', 'data-voice-record', 'data-voice-epoch', 'data-voice-appointment-date', 'data-voice-appointment-start', 'data-voice-appointment-original-date']) {
  test(`proposta revalida controle/metadados: ${attribute}`, async ({ page }) => {
    await mount(page)
    const proposal = await parse(page, 'Abrir detalhes de Ana Clara')
    expect(proposal.status).toBe('draft')
    await controls(page).evaluate((element, attr) => element.setAttribute(attr, ['hidden', 'disabled'].includes(attr) ? '' : 'changed'), attribute)
    expect(await apply(page, proposal)).toContain('A tela mudou')
    await expect(panel(page)).toHaveCount(0)
    if (['hidden', 'disabled'].includes(attribute)) expect((await parse(page, 'Abrir detalhes de Ana Clara')).status).toBe('clarification')
    await unchanged(page)
  })
}

test('loading, navegação e retorno invalidam proposta', async ({ page }) => {
  await mount(page)
  const proposal = await parse(page, 'Abrir detalhes de Ana Clara')
  expect(proposal.status).toBe('draft')
  await page.evaluate(() => { window.detailsHarness.deferred = true })
  await page.getByRole('button', { name: 'Próximo', exact: true }).click()
  expect((await parse(page, 'Abrir detalhes de Ana Clara')).status).toBe('clarification')
  expect(await apply(page, proposal)).toContain('A tela mudou')
  await page.getByRole('button', { name: 'Anterior', exact: true }).click()
  await page.evaluate(() => { window.detailsHarness.deferred = false; window.detailsHarness.pending.splice(0).forEach(resolve => resolve()) })
  await expect(controls(page)).toHaveCount(1)
  expect(await apply(page, proposal)).toContain('A tela mudou')
  expect((await parse(page, 'Abrir detalhes de Ana Clara')).status).toBe('draft')
  await unchanged(page)
})

test('remount com mesmos IDs invalida proposta anterior', async ({ page }) => {
  await mount(page)
  const proposal = await parse(page, 'Abrir detalhes de Ana Clara')
  expect(proposal.status).toBe('draft')
  await page.evaluate(() => { window.agendaRoot.unmount(); window.detailsMount() })
  await expect(controls(page)).toHaveCount(1)
  expect(await apply(page, proposal)).toContain('A tela mudou')
  await unchanged(page)
})

test('captura nativa Verdetales prepara o alvo efetivo sem alterar corpus', async ({ page }) => {
  await mount(page, { mode: 'Semana', items: [occurrence('o1', { date: '2026-10-04', originalDate: '2026-09-27', wasRescheduled: true })] })
  expect(captures[1].Transcript).toBe('Verdetales de Ana Clara em 4 de outubro de dois mil e vinte e seis às quinze horas.')
  const proposal = await parse(page, captures[1].Transcript)
  expect(proposal?.status).toBe('draft')
  expect((await parse(page, captures[0].Transcript)).status).toBe('draft')
  for (const text of ['Não Verdetales de Ana Clara', 'Verdetales de Ana', 'Verdetales de Ana Clara agora']) expect((await parse(page, text)).status).toBe('clarification')
  expect(await apply(page, proposal)).toBeNull()
  await expect(page.locator('#agenda-detail-o1')).toBeVisible()
  await page.evaluate(() => {
    const label = document.createElement('label'); label.textContent = 'Nota'
    label.append(document.createElement('textarea')); document.body.append(label)
  })
  const literal = captures[1].Transcript.replace(/\.$/, '')
  expect((await parse(page, `Preencher Nota com ${literal}`)).intent.value).toBe(literal)
  await controls(page).evaluateAll(elements => elements.forEach(element => element.remove()))
  await page.evaluate(text => { const button = document.createElement('button'); button.textContent = text; document.body.append(button) }, literal)
  expect((await parse(page, literal)).status).toBe('clarification')
  await unchanged(page)
})
