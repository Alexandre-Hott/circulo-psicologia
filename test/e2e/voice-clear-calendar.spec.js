import { expect, test } from '@playwright/test'

// Browser DOM probes use the actual gateway; the Agenda tests also exercise
// React state and the voice review flow, with synthetic native IPC only.
for (const [type, required] of [['date', false], ['date', true], ['time', false], ['time', true]]) {
  test(`DOM: limpar ${type} ${required ? 'required' : 'opcional'} preserva revisão e validação`, async ({ page }) => {
    await page.goto('/test/e2e/fixtures/voice-command-center.html')
    const result = await page.evaluate(async ({ type, required }) => {
      const { parseVoiceInterfaceCommand: parse, applyVoiceInterfaceCommand: apply } = await import('/src/voiceInterfaceCommands.js')
      const form = document.createElement('form')
      form.innerHTML = `<label>Término opcional (inclusivo)<input type="${type}" ${required ? 'required' : ''}></label>`
      document.body.append(form)
      const input = form.querySelector('input')
      input.value = type === 'date' ? '2026-11-30' : '16:00'
      const events = []
      let submits = 0
      form.addEventListener('submit', event => { event.preventDefault(); submits++ })
      for (const name of ['input', 'change']) input.addEventListener(name, event => events.push({ type: event.type, bubbles: event.bubbles, value: input.value }))
      const prepared = parse('Limpar Término opcional (inclusivo)', form)
      const before = { value: input.value, events: [...events], valid: form.checkValidity() }
      if (prepared.status === 'draft') apply(prepared.intent, form)
      const after = { value: input.value, events, valid: form.checkValidity(), missing: input.validity.valueMissing, submits }
      const invalid = parse(`Preencher Término opcional (inclusivo) com ${type === 'date' ? '31/02/2026' : '25:00'}`, form)
      const valid = parse(`Preencher Término opcional (inclusivo) com ${type === 'date' ? '30/11/2026' : 'quatro da tarde'}`, form)
      form.remove()
      return { prepared, before, after, invalid, normalized: valid.intent?.value }
    }, { type, required })
    expect(result.prepared.status).toBe('draft')
    expect(result.prepared.intent).toMatchObject({ operation: 'fill', value: '' })
    expect(result.before).toEqual({ value: type === 'date' ? '2026-11-30' : '16:00', events: [], valid: true })
    expect(result.after).toEqual({ value: '', events: [{ type: 'input', bubbles: true, value: '' }, { type: 'change', bubbles: true, value: '' }], valid: !required, missing: required, submits: 0 })
    expect(result.invalid.status).toBe('clarification')
    expect(result.invalid.intent).toBeUndefined()
    expect(result.normalized).toBe(type === 'date' ? '2026-11-30' : '16:00')
  })
}

test('DOM: limpeza recusa ocultos, ambíguos, select, readonly, password e file', async ({ page }) => {
  await page.goto('/test/e2e/fixtures/voice-command-center.html')
  const results = await page.evaluate(async () => {
    const { parseVoiceInterfaceCommand: parse } = await import('/src/voiceInterfaceCommands.js')
    const fixtures = [
      '<label hidden>Alvo<input type="date" value="2026-11-30"></label>',
      '<label style="display:none">Alvo<input type="date" value="2026-11-30"></label>',
      '<label>Alvo<input type="hidden" value="sintético"></label>',
      '<label>Alvo<input type="date" value="2026-11-30"></label><label>Alvo<input type="date" value="2026-12-30"></label>',
      '<label>Alvo<select><option value="a">Sintético</option><option value="">Vazio</option></select></label>',
      '<label>Alvo<input type="date" readonly value="2026-11-30"></label>',
      '<label>Alvo<input type="password" value="senha-sintética"></label>',
      '<label>Alvo<input type="file"></label>',
    ]
    return fixtures.map(html => {
      const root = document.createElement('section')
      root.innerHTML = html
      document.body.append(root)
      const values = () => [...root.querySelectorAll('input, select')].map(input => input.value)
      const before = values()
      const proposal = parse('Limpar Alvo', root)
      const after = values()
      root.remove()
      return { status: proposal.status, hasIntent: Boolean(proposal.intent), unchanged: JSON.stringify(before) === JSON.stringify(after) }
    })
  })
  expect(results).toEqual(Array.from({ length: 8 }, () => ({ status: 'clarification', hasIntent: false, unchanged: true })))
})

for (const change of ['type', 'revision', 'readonly', 'hidden', 'ambiguous']) {
  test(`DOM: revalida limpeza após mudança de ${change}`, async ({ page }) => {
    await page.goto('/test/e2e/fixtures/voice-command-center.html')
    const result = await page.evaluate(async change => {
      const { parseVoiceInterfaceCommand: parse, applyVoiceInterfaceCommand: apply } = await import('/src/voiceInterfaceCommands.js')
      const root = document.createElement('form')
      root.setAttribute('data-voice-epoch', '1')
      root.innerHTML = '<label>Alvo<input type="date" value="2026-11-30"></label>'
      document.body.append(root)
      const input = root.querySelector('input')
      const prepared = parse('Limpar Alvo', root)
      if (change === 'type') input.type = 'text'
      if (change === 'revision') root.setAttribute('data-voice-epoch', '2')
      if (change === 'readonly') input.readOnly = true
      if (change === 'hidden') root.hidden = true
      if (change === 'ambiguous') root.append(input.parentElement.cloneNode(true))
      let events = 0
      root.addEventListener('input', () => events++)
      root.addEventListener('change', () => events++)
      let error = ''
      try { apply(prepared.intent, root) } catch (reason) { error = reason.message }
      const value = input.value
      root.remove()
      return { status: prepared.status, error, value, events }
    }, change)
    expect(result.status).toBe('draft')
    expect(result.error).toContain(change === 'readonly' ? 'Este campo precisa ser preenchido diretamente' : 'A tela mudou')
    expect(result.value).toBe('2026-11-30')
    expect(result.events).toBe(0)
  })
}

async function openAgenda(page) {
  await page.clock.install({ time: new Date('2026-10-03T15:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-03T15:00:00Z'))
  await page.addInitScript(() => {
    window.clearCalendar = { writes: [], unexpected: [], series: [] }
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { available: false, dirty: false }
      if (command === 'plugin:updater|check') return null
      if (command === 'patient_list') return [{ id: 'synthetic-patient', name: 'Paciente Sintético', age: 8, revision: 1, preferredModality: 'Presencial', archivedAt: null }]
      if (command === 'agenda_list_series') return structuredClone(window.clearCalendar.series)
      if (['agenda_history', 'agenda_occurrences', 'behavior_list', 'indicator_catalog'].includes(command)) return []
      if (command === 'agenda_create_series') {
        window.clearCalendar.writes.push(structuredClone({ command, args }))
        const saved = { ...args.input, id: 'synthetic-series', revision: 1 }
        window.clearCalendar.series.push(saved)
        return saved
      }
      window.clearCalendar.unexpected.push(command)
      throw new Error(`IPC sem fixture: ${command}`)
    } }
  })
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Comando do Círculo' })).toBeVisible()
  await command(page, 'Abrir agenda')
  await command(page, 'Clicar em Novo compromisso')
  const form = page.getByRole('form', { name: 'Novo compromisso', exact: true })
  await form.getByLabel('Tipo', { exact: true }).selectOption('Recorrente')
  await form.getByLabel('Paciente', { exact: true }).selectOption('synthetic-patient')
  await form.getByLabel('Dia da semana').selectOption('1')
  await form.getByLabel('Início da série').fill('2026-10-05')
  await form.getByLabel('Término opcional (inclusivo)').fill('2026-11-30')
  await form.getByLabel('Horário inicial').fill('15:00')
  await form.getByLabel('Horário final').fill('15:50')
  return form
}

async function propose(page, text) {
  const center = page.getByRole('region', { name: 'Comando do Círculo' })
  await center.getByLabel('Seu comando').fill(text)
  await center.getByRole('button', { name: 'Preparar rascunho' }).click()
}

async function command(page, text) {
  await propose(page, text)
  await expect(page.locator('.voice-command-preview'), text).toBeVisible()
  await propose(page, 'confirmar')
  await page.clock.runFor(32)
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
}

const writes = page => page.evaluate(() => window.clearCalendar.writes)

test.beforeEach(async ({ page, baseURL }) => {
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort())
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.clearCalendar?.unexpected || [])).toEqual([])
})

test('Agenda real: limpar término exige aplicar, cancelar preserva data e criação explícita envia endDate null', async ({ page }) => {
  const form = await openAgenda(page)
  const end = form.getByLabel('Término opcional (inclusivo)')
  await propose(page, 'Limpar Término opcional (inclusivo)')
  await expect(page.locator('.voice-command-preview')).toContainText('Limpar Término opcional (inclusivo).')
  await expect(end).toHaveValue('2026-11-30')
  expect(await writes(page)).toEqual([])
  await propose(page, 'cancelar comando')
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  await expect(end).toHaveValue('2026-11-30')
  await propose(page, 'confirmar')
  await page.clock.runFor(32)
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  await expect(end).toHaveValue('2026-11-30')
  expect(await writes(page)).toEqual([])
  await command(page, 'Limpar Término opcional (inclusivo)')
  await expect(end).toHaveValue('')
  expect(await form.evaluate(element => element.checkValidity())).toBe(true)
  expect(await writes(page)).toEqual([])
  await propose(page, 'Preencher Término opcional (inclusivo) com 31/02/2026')
  await expect(page.locator('.voice-command-error')).toContainText('Valor inválido')
  await expect(end).toHaveValue('')
  await propose(page, 'Clicar em Criar série')
  await expect(page.locator('.voice-command-preview')).toBeVisible()
  expect(await writes(page)).toEqual([])
  await propose(page, 'confirmar')
  await page.clock.runFor(32)
  await expect.poll(() => writes(page)).toEqual([{ command: 'agenda_create_series', args: { input: {
    patientId: 'synthetic-patient', weekday: 1, startDate: '2026-10-05', endDate: null,
    start: '15:00', end: '15:50', frequency: 'Semanal', modality: 'Presencial', meetingLink: null,
  } } }])
})

test('Agenda real: limpar data required e horários só após aplicar mantém validação e impede criação', async ({ page }) => {
  const form = await openAgenda(page)
  const requiredFields = [['Início da série', '2026-10-05'], ['Horário inicial', '15:00'], ['Horário final', '15:50']]
  const validFields = [...requiredFields, ['Término opcional (inclusivo)', '2026-11-30']]
  for (const [label, initial] of requiredFields) {
    expect(await form.evaluate(element => element.checkValidity())).toBe(true)
    for (const [validLabel, value] of validFields) {
      await expect(form.getByLabel(validLabel, { exact: true })).toHaveValue(value)
    }
    const input = form.getByLabel(label, { exact: true })
    await propose(page, `Limpar ${label}`)
    await expect(page.locator('.voice-command-preview')).toBeVisible()
    await expect(input).toHaveValue(initial)
    expect(await writes(page)).toEqual([])
    await propose(page, 'confirmar')
    await page.clock.runFor(32)
    await expect(input).toHaveValue('')
    expect(await input.evaluate(element => element.validity.valueMissing)).toBe(true)
    expect(await form.evaluate(element => element.checkValidity())).toBe(false)
    expect(await form.locator('input:invalid').evaluateAll(inputs => inputs.map(element => element.id))).toEqual([await input.getAttribute('id')])
    await command(page, 'Clicar em Criar série')
    expect(await writes(page)).toEqual([])
    // Restore a valid baseline so each required field blocks submission alone.
    for (const [validLabel, value] of validFields) {
      await form.getByLabel(validLabel, { exact: true }).fill(value)
      await expect(form.getByLabel(validLabel, { exact: true })).toHaveValue(value)
    }
    expect(await form.evaluate(element => element.checkValidity())).toBe(true)
    expect(await writes(page)).toEqual([])
  }
  await propose(page, 'Preencher Horário inicial com 25:00')
  await expect(page.locator('.voice-command-error')).toContainText('Valor inválido')
  await expect(form.getByLabel('Horário inicial')).toHaveValue('15:00')
  expect(await form.evaluate(element => element.checkValidity())).toBe(true)
  expect(await writes(page)).toEqual([])
})
