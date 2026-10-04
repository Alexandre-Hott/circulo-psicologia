import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const captures = JSON.parse(readFileSync(new URL('../fixtures/native-voice-series-20261004.json', import.meta.url), 'utf8'))

const patient = (id = 'ana', name = 'Ana Clara') => ({ id, name, age: 8, archivedAt: null })
const series = (id = 's1', extra = {}) => ({ id, patientId: 'ana', frequency: 'Semanal', weekday: 1, start: '15:00', end: '15:50', startDate: '2026-01-05', endDate: null, modality: 'Presencial', ...extra })
const url = '/test/e2e/fixtures/voice-command-center.html'
const button = page => page.locator('#agenda-host button[aria-label^="Encerrar série de"]')
const form = page => page.getByRole('form', { name: 'Encerrar série recorrente' })
const parse = (page, phrase) => page.evaluate(async text => (await import('/src/voiceInterfaceCommands.js')).parseVoiceInterfaceCommand(text, document), phrase)
const apply = (page, proposal) => page.evaluate(async intent => {
  try { (await import('/src/voiceInterfaceCommands.js')).applyVoiceInterfaceCommand(intent, document); return null }
  catch (error) { return error.message }
}, proposal.intent)
async function unchanged(page) {
  expect(await page.evaluate(() => window.seriesHarness.calls.filter(call => !['patient_list', 'agenda_list_series', 'agenda_occurrences', 'agenda_history'].includes(call.command)))).toEqual([])
  expect(await page.evaluate(() => JSON.stringify(window.seriesHarness.data))).toBe(await page.evaluate(() => window.seriesHarness.initial))
}
async function mount(page, { patients = [patient()], items = [series()], deferred = false } = {}) {
  await page.addInitScript(({ patients, items, deferred }) => {
    const copy = value => JSON.parse(JSON.stringify(value))
    const data = { patients: copy(patients), series: copy(items) }
    window.seriesHarness = { data, initial: JSON.stringify(data), calls: [], confirmations: [], accept: false, allowMutation: false, deferred, pending: [], reads: 0 }
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      const h = window.seriesHarness
      h.calls.push(copy({ command, args }))
      if (command === 'patient_list') return copy(h.data.patients)
      if (command === 'agenda_list_series') {
        h.reads++
        if (h.deferred) await new Promise(resolve => h.pending.push(resolve))
        return copy(h.data.series)
      }
      if (command === 'agenda_occurrences' || command === 'agenda_history') return []
      if (command === 'agenda_end_series' && h.allowMutation) {
        const item = h.data.series.find(value => value.id === args.seriesId)
        if (!item) throw new Error('Série desconhecida')
        item.endDate = new Date(Date.parse(`${args.effectiveDate}T00:00:00Z`) - 86400000).toISOString().slice(0, 10)
        return null
      }
      throw new Error(`IPC inesperada: ${command}`)
    } }
  }, { patients, items, deferred })
  await page.goto(url)
  await page.evaluate(async () => {
    document.getElementById('root').remove()
    const host = document.createElement('div'); host.id = 'agenda-host'; document.body.append(host)
    const ReactModule = await import('/node_modules/.vite/deps/react.js')
    const React = ReactModule.createElement ? ReactModule : ReactModule.default
    const ReactDOM = await import('/node_modules/.vite/deps/react-dom_client.js')
    const createRoot = ReactDOM.createRoot || ReactDOM.default.createRoot
    const { default: DesktopAgenda } = await import('/src/DesktopAgenda.jsx')
    window.agendaRoot = createRoot(host)
    window.agendaMount = () => window.agendaRoot.render(React.createElement(DesktopAgenda, {
      patients: window.seriesHarness.data.patients, onChanged: async () => {}, onStartSession: () => {},
      onConfirm: async message => { window.seriesHarness.confirmations.push(message); return window.seriesHarness.accept },
    }))
    window.agendaMount()
  })
  await expect(page.getByRole('region', { name: 'Agenda persistente de sessões' })).toBeVisible()
  await page.getByRole('button', { name: 'Compromissos persistidos' }).click()
  if (!deferred) await expect.poll(() => button(page).count()).toBe(items.length)
}

test('DOM real: friendly direto e clicar, horário falado, colisão exata', async ({ page }) => {
  await page.goto(url)
  await page.setContent('<button data-voice-series-patient="Ana Clara" data-voice-series-weekday="1" data-voice-series-time="15:00" data-voice-series-kind="end" data-voice-action="agenda:end:s1" data-voice-record="series:s1" data-voice-epoch="1" aria-label="Encerrar série de Ana Clara · série s1">Encerrar série</button>')
  for (const phrase of ['Encerrar série de Ana Clara', 'Clicar em Encerrar série de Ana Clara', 'Encerrar série de Ana Clara na segunda-feira às três da tarde']) {
    const result = await parse(page, phrase)
    expect(result.status, phrase).toBe('draft')
    expect(result.intent.type).toBe('interface.control')
  }
  await page.evaluate(() => { const twin = document.createElement('button'); twin.textContent = 'Encerrar série de Ana Clara'; document.body.append(twin) })
  expect((await parse(page, 'Clicar em Encerrar série de Ana Clara')).status).toBe('clarification')
  expect((await parse(page, 'Encerrar série de Ana Clara')).status).toBe('clarification')
})

test('captura Rust Anticipar termino resolve somente série advance', async ({ page }) => {
  await mount(page, { items: [series('future', { endDate: '2026-12-31' })] })
  expect(captures[1].Transcript).toBe('Anticipar termino de Ana Clara na segunda às 15 horas.')
  const proposal = await parse(page, captures[1].Transcript)
  expect(proposal.status).toBe('draft')
  expect(proposal.intent.target.record).toBe('series:ana:future')
  await unchanged(page)
})

test('Agenda montada: proposta abre formulário existente sem persistir', async ({ page }) => {
  await mount(page)
  const proposal = await parse(page, 'Encerrar série de Ana Clara')
  expect(proposal.status).toBe('draft')
  await unchanged(page)
  expect(await apply(page, proposal)).toBeNull()
  await expect(form(page)).toBeVisible()
  expect((await parse(page, 'Encerrar série de Ana Clara')).status).toBe('clarification')
  await unchanged(page)
  await form(page).getByRole('button', { name: 'Voltar' }).click()
  await expect(form(page)).toHaveCount(0)
  await unchanged(page)
})

test('dias e horários falados resolvem múltiplas séries sem inferir AM/PM', async ({ page }) => {
  await mount(page, { items: [series('s1'), series('s2', { start: '15:30', end: '16:20' }), series('s3', { endDate: '2026-12-31', start: '16:00' })] })
  for (const phrase of ['Encerrar série de Ana Clara', 'Clicar em Encerrar série de Ana Clara', 'Encerrar série de Ana Clara na segunda às três horas']) expect((await parse(page, phrase)).status).toBe('clarification')
  for (const [phrase, id, time] of [
    ['Encerrar série de Ana Clara na segunda às quinze horas', 's1', '15:00'],
    ['Clicar em Encerrar série de Ana Clara na segunda-feira às três da tarde', 's1', '15:00'],
    ['Encerrar série de Ana Clara na segunda às quinze horas e trinta', 's2', '15:30'],
    ['Antecipar término de Ana Clara na segunda às dezesseis horas', 's3', '16:00'],
    ['Clicar em Antecipar término de Ana Clara na segunda às dezesseis horas', 's3', '16:00'],
  ]) {
    const result = await parse(page, phrase)
    expect(result.status, phrase).toBe('draft')
    expect(result.intent.target.record, phrase).toBe(`series:ana:${id}`)
    expect(result.preview, phrase).toContain(time)
  }
  for (const phrase of ['Encerrar série de Ana', 'Encerrar série de Ana Cla', 'Encerrar série de Ana Clara título errado', 'Antecipar término de Ana Clara na segunda às quinze horas']) expect((await parse(page, phrase)).status).toBe('clarification')
  expect((await parse(page, 'Clicar em Encerrar série de Ana Clara · série s2')).status).toBe('draft')
  expect((await parse(page, 'Clicar em Encerrar série de Ana Clara · série s3')).status).toBe('draft')
  await unchanged(page)
})

for (const otherName of ['Ana Clara', 'ANA CLARA', ' Ána   Clara ']) {
  test(`homônimos recusam friendly: ${JSON.stringify(otherName)}`, async ({ page }) => {
    await mount(page, { patients: [patient(), patient('ana2', otherName)] })
    await expect(button(page)).toHaveAttribute('data-voice-series-ambiguous', 'true')
    expect((await parse(page, 'Encerrar série de Ana Clara')).status, otherName).toBe('clarification')
    expect((await parse(page, 'Clicar em Encerrar série de Ana Clara')).status, otherName).toBe('clarification')
    expect((await parse(page, 'Clicar em Encerrar série de Ana Clara · série s1')).status, otherName).toBe('draft')
    await unchanged(page)
  })
}

test('séries no mesmo dia/horário recusam friendly', async ({ page }) => {
  await mount(page, { items: [series('s1'), series('s2')] })
  expect((await parse(page, 'Encerrar série de Ana Clara na segunda às quinze horas')).status).toBe('clarification')
  expect((await parse(page, 'Encerrar série de Ana Clara · série s2')).status).toBe('draft')
})

test('término antecipado aceita nome completo sem ID e mantém rótulo antigo', async ({ page }) => {
  await mount(page, { items: [series('future', { endDate: '2026-12-31' })] })
  await expect(button(page)).toHaveAttribute('aria-label', 'Encerrar série de Ana Clara · série future')
  await expect(button(page)).toHaveText('Antecipar término')
  for (const phrase of ['Antecipar término de Ana Clara', 'Clicar em Antecipar término de Ana Clara', 'Clicar em Encerrar série de Ana Clara · série future']) {
    const proposal = await parse(page, phrase)
    expect(proposal.status, phrase).toBe('draft')
    await unchanged(page)
  }
})

test('alias de captura é restrito à ação; texto de nota e nome de paciente ficam literais', async ({ page }) => {
  await page.goto(url)
  await page.setContent('<label>Nota<input type="text"></label><button aria-label="Anticipar termino de Ana Clara na segunda às 15 horas">Outro</button>')
  expect((await parse(page, 'Anticipar termino de Ana Clara na segunda às 15 horas')).status).toBe('clarification')
  expect((await parse(page, 'Clicar em Anticipar termino de Ana Clara na segunda às 15 horas')).status).toBe('clarification')
  const literal = 'Anticipar termino de Ana Clara na segunda às 15 horas'
  const fill = await parse(page, `Preencher Nota com ${literal}`)
  expect(fill.status).toBe('draft')
  expect(fill.intent.value).toBe(literal)
  await mount(page, { patients: [patient('other', 'Anticipar termino de Ana Clara')], items: [series('named', { patientId: 'other', endDate: '2026-12-31' })] })
  const named = await parse(page, 'Anticipar termino de Anticipar termino de Ana Clara na segunda às 15 horas')
  expect(named.status).toBe('draft')
  expect(named.intent.target.record).toBe('series:other:named')
  for (const phrase of ['Não Anticipar termino de Anticipar termino de Ana Clara na segunda às 15 horas', 'Anticipar termino de Anticipar termino de Ana Clara na segunda às 15 horas por favor']) expect((await parse(page, phrase)).status).toBe('clarification')
  await unchanged(page)
})

test('colisão, hidden/inert/disabled e record/epoch obsoletos recusam', async ({ page }) => {
  await mount(page)
  const target = button(page)
  let proposal = await parse(page, 'Encerrar série de Ana Clara')
  await target.evaluate(node => { node.dataset.voiceEpoch = 'obsolete' })
  expect(await apply(page, proposal)).toMatch(/tela mudou/u)
  proposal = await parse(page, 'Encerrar série de Ana Clara')
  await target.evaluate(node => { node.dataset.voiceRecord = 'series:other' })
  expect(await apply(page, proposal)).toMatch(/tela mudou/u)
  for (const change of ['hidden', 'inert', 'disabled']) {
    proposal = await parse(page, 'Encerrar série de Ana Clara')
    await target.evaluate((node, key) => { if (key === 'disabled') node.disabled = true; else node.setAttribute(key, '') }, change)
    expect((await parse(page, 'Encerrar série de Ana Clara')).status).toBe('clarification')
    expect(await apply(page, proposal)).toMatch(/tela mudou/u)
    await target.evaluate((node, key) => { if (key === 'disabled') node.disabled = false; else node.removeAttribute(key) }, change)
  }
  await page.evaluate(() => { const twin = document.createElement('button'); twin.textContent = 'Encerrar série de Ana Clara'; document.body.append(twin) })
  expect((await parse(page, 'Clicar em Encerrar série de Ana Clara')).status).toBe('clarification')
  await unchanged(page)
})

test('período ida/volta e remount invalidam proposta com mesmo ID/rótulo', async ({ page }) => {
  await mount(page)
  const first = await parse(page, 'Encerrar série de Ana Clara')
  await page.getByRole('button', { name: 'Próximo', exact: true }).click()
  expect(await apply(page, first)).toMatch(/tela mudou/u)
  await page.getByRole('button', { name: 'Anterior', exact: true }).click()
  await expect.poll(() => button(page).first().isEnabled()).toBe(true)
  expect(await apply(page, first)).toMatch(/tela mudou/u)
  const second = await parse(page, 'Encerrar série de Ana Clara')
  await page.evaluate(() => window.agendaRoot.unmount())
  await page.evaluate(async () => {
    const ReactModule = await import('/node_modules/.vite/deps/react.js')
    const React = ReactModule.createElement ? ReactModule : ReactModule.default
    const ReactDOM = await import('/node_modules/.vite/deps/react-dom_client.js')
    const createRoot = ReactDOM.createRoot || ReactDOM.default.createRoot
    const { default: DesktopAgenda } = await import('/src/DesktopAgenda.jsx')
    window.agendaRoot = createRoot(document.getElementById('agenda-host'))
    window.agendaRoot.render(React.createElement(DesktopAgenda, { patients: window.seriesHarness.data.patients, onChanged: async () => {}, onStartSession: () => {}, onConfirm: async () => false }))
  })
  await page.getByRole('button', { name: 'Compromissos persistidos' }).click()
  await expect.poll(() => button(page).count()).toBe(1)
  expect(await apply(page, second)).toMatch(/tela mudou/u)
  await unchanged(page)
})

test('carga inicial e retorno de período recusam controle antigo enquanto IPC está pendente', async ({ page }) => {
  await mount(page, { deferred: true })
  expect((await parse(page, 'Encerrar série de Ana Clara')).status).toBe('clarification')
  await page.evaluate(() => { window.seriesHarness.deferred = false; window.seriesHarness.pending.splice(0).forEach(resolve => resolve()) })
  await expect.poll(() => button(page).count()).toBe(1)
  const old = await parse(page, 'Encerrar série de Ana Clara')
  await page.evaluate(() => { window.seriesHarness.deferred = true })
  await page.getByRole('button', { name: 'Próximo', exact: true }).click()
  await page.getByRole('button', { name: 'Anterior', exact: true }).click()
  await expect(button(page)).toBeDisabled()
  expect((await parse(page, 'Encerrar série de Ana Clara')).status).toBe('clarification')
  expect(await apply(page, old)).toMatch(/tela mudou/u)
  await page.evaluate(() => { window.seriesHarness.deferred = false; window.seriesHarness.pending.splice(0).forEach(resolve => resolve()) })
  await expect(button(page)).toBeEnabled()
  expect(await apply(page, old)).toMatch(/tela mudou/u)
  await unchanged(page)
})

test('somente botão de série marcado aceita pedido direto; troca de série invalida registro', async ({ page }) => {
  await page.goto(url)
  await page.setContent('<button aria-label="Encerrar série de Ana Clara">Outro controle</button>')
  expect((await parse(page, 'Encerrar série de Ana Clara')).status).toBe('clarification')
  expect((await parse(page, 'Clicar em Encerrar série de Ana Clara')).status).toBe('draft')
  await mount(page, { items: [series('s1'), series('s2', { start: '16:00' })] })
  const proposal = await parse(page, 'Encerrar série de Ana Clara na segunda às quinze horas')
  expect(proposal.status).toBe('draft')
  await button(page).first().evaluate(node => {
    const other = node.parentElement.nextElementSibling.querySelector('button')
    node.remove()
    other.setAttribute('aria-label', 'Encerrar série de Ana Clara · série s1')
  })
  expect(await apply(page, proposal)).toMatch(/tela mudou/u)
  await unchanged(page)
})

test('data escolhida só persiste após confirmação final aceita', async ({ page }) => {
  await mount(page)
  const beforeReload = await parse(page, 'Clicar em Encerrar série de Ana Clara')
  expect(await apply(page, beforeReload)).toBeNull()
  const ending = form(page)
  await ending.getByLabel('Primeira data excluída').fill('2026-10-12')
  await ending.getByRole('button', { name: 'Confirmar encerramento' }).click()
  await expect.poll(() => page.evaluate(() => window.seriesHarness.confirmations.length)).toBe(1)
  await unchanged(page)
  await page.evaluate(() => { window.seriesHarness.accept = true; window.seriesHarness.allowMutation = true })
  await ending.getByRole('button', { name: 'Confirmar encerramento' }).click()
  await expect.poll(() => page.evaluate(() => window.seriesHarness.calls.filter(call => call.command === 'agenda_end_series'))).toEqual([{ command: 'agenda_end_series', args: { seriesId: 's1', effectiveDate: '2026-10-12' } }])
  expect(await page.evaluate(() => window.seriesHarness.data.series[0].endDate)).toBe('2026-10-11')
  await expect(form(page)).toHaveCount(0)
  expect(await apply(page, beforeReload)).toMatch(/tela mudou/u)
})
