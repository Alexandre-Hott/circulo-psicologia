import { expect, test } from '@playwright/test'

const fields = [
  { key: 'observation', label: 'Observações descritivas', noun: 'observação' },
  { key: 'procedures', label: 'Procedimentos realizados', noun: 'procedimentos' },
  { key: 'outcomeDecision', label: 'Resultado e decisão', noun: 'resultado' },
  { key: 'referralClosure', label: 'Encaminhamento ou encerramento (opcional)', noun: 'encaminhamento' },
]
const assistant = page => page.getByRole('region', { name: 'Comando do Círculo' })
const form = page => page.getByRole('form', { name: 'Rascunho de sessão', exact: true })
const fieldControl = (page, field = fields[0]) => form(page).getByLabel(field.label, { exact: true })
const snapshot = page => page.evaluate(() => structuredClone(window.clinicalMultiline.state))
const writes = page => page.evaluate(() => structuredClone(window.clinicalMultiline.writes))

// Real app entrypoint, both command routing and Sessions apply handlers. Only
// IPC is mocked: no injected intents/snapshots, no real vault/profile or media.
async function openApp(page, { allowSave = false, observation } = {}) {
  const time = new Date('2026-10-04T15:00:00Z')
  await page.clock.install({ time })
  await page.clock.pauseAt(time)
  await page.addInitScript(({ allowSave, observation }) => {
    const clone = value => structuredClone(value)
    const patients = [
      { id: 'ana', name: 'Ana Clara', age: 8, revision: 1, preferredModality: 'Presencial', archivedAt: null },
      { id: 'bia', name: 'Bia Fictícia', age: 9, revision: 1, preferredModality: 'Online', archivedAt: null },
    ]
    const drafts = [
      { id: 'draft-ana', patientId: 'ana', seriesId: 'series-ana', originalDate: '2026-10-04', observation: observation ?? 'Base literal: “Ána”  com apoio.  ', procedures: 'Procedimentos fictícios anteriores.  ', outcomeDecision: 'Resultado fictício anterior.  ', referralClosure: 'Encaminhamento fictício anterior.  ', behaviorIds: [], indicators: [] },
      { id: 'draft-ana-other', patientId: 'ana', seriesId: 'series-ana-other', originalDate: '2026-10-03', observation: 'Outro rascunho de Ana intacto.', procedures: 'Procedimentos concorrentes.', outcomeDecision: 'Resultado concorrente.', referralClosure: 'Encaminhamento concorrente.', behaviorIds: [], indicators: [] },
      { id: 'draft-bia', patientId: 'bia', seriesId: 'series-bia', originalDate: '2026-10-04', observation: 'Rascunho fictício de Bia intacto.', procedures: 'Procedimentos de Bia.', outcomeDecision: 'Resultado de Bia.', referralClosure: 'Encaminhamento de Bia.', behaviorIds: [], indicators: [] },
    ]
    const fixture = window.clinicalMultiline = { state: { patients, drafts }, calls: [], writes: [], unexpected: [], catalogReady: false }
    const reads = new Set()
    const catalog = (command, result) => {
      reads.add(command)
      fixture.catalogReady = ['patient_list', 'behavior_list', 'indicator_catalog'].every(name => reads.has(name))
      return clone(result)
    }
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      fixture.calls.push(clone({ command, args }))
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { available: false, dirty: false }
      if (command === 'plugin:updater|check') return null
      if (command === 'patient_list') return catalog(command, patients)
      if (command === 'behavior_list' || command === 'indicator_catalog') return catalog(command, [])
      if (command === 'session_draft_list') return clone(drafts.filter(item => item.patientId === args.patientId))
      if (['agenda_occurrences', 'agenda_list_series', 'agenda_history', 'session_timeline', 'session_addendum_list', 'case_context_list'].includes(command)) return []
      if (command === 'session_draft_save' && allowSave && args.id === 'draft-ana') {
        fixture.writes.push(clone({ command, args }))
        const index = drafts.findIndex(item => item.id === args.id)
        drafts[index] = { ...drafts[index], ...clone(args.input) }
        return clone(drafts[index])
      }
      fixture.unexpected.push(command)
      if (/(?:create|update|save|start|cancel|finalize|archive|restore)/.test(command)) fixture.writes.push(clone({ command, args }))
      throw new Error(`IPC sem fixture: ${command}`)
    } }
  }, { allowSave, observation })
  await page.goto('/')
  await expect(assistant(page)).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.clinicalMultiline.catalogReady)).toBe(true)
  await expect(page.locator('.vault-home-preview')).toContainText('Ana Clara')
  await page.clock.runFor(32)
  await command(page, 'Abrir registros de Ana Clara')
  await selectDraft(page, 'draft-ana')
}

async function propose(page, text) {
  expect(text.length).toBeLessThanOrEqual(4600)
  await assistant(page).getByLabel('Seu comando').fill(text)
  await expect(assistant(page).getByLabel('Seu comando')).toHaveValue(text.replace(/\r\n?/g, '\n'))
  await assistant(page).getByRole('button', { name: 'Preparar rascunho' }).click()
}

async function confirm(page) {
  await propose(page, 'confirmar')
  await page.clock.runFor(32)
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
}

async function command(page, text) {
  await propose(page, text)
  await expect(page.locator('.voice-command-preview')).toBeVisible()
  await confirm(page)
}

async function selectDraft(page, id) {
  const chooser = page.locator('#session-other-drafts')
  await expect(chooser).toBeVisible()
  if (!await chooser.evaluate(element => element.open)) await chooser.locator('summary').click()
  const button = chooser.locator(`button[data-voice-record="draft:${id}"]`)
  await expect(button).toBeVisible()
  await expect(button).toBeEnabled()
  await button.click()
  await expect(form(page)).toHaveAttribute('data-voice-record', id)
  await expect(fieldControl(page)).toBeEnabled()
}

async function expectValues(page, values, id = 'draft-ana', patientId = 'ana') {
  await expect(form(page)).toHaveCount(1)
  await expect(form(page)).toHaveAttribute('data-voice-record', id)
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue(patientId)
  for (const field of fields) await expect(fieldControl(page, field)).toHaveValue(values[field.key])
}

async function expectNoWrites(page, before) {
  expect(await snapshot(page)).toEqual(before)
  expect(await writes(page)).toEqual([])
  expect(await page.evaluate(() => window.clinicalMultiline.unexpected)).toEqual([])
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
}

async function expectNoVoiceAutosave(page, before) {
  await page.clock.runFor(1200)
  await expectNoWrites(page, before)
}

test.beforeEach(async ({ page, baseURL }) => {
  const unexpected = []
  page.on('dialog', async dialog => { unexpected.push(`native dialog: ${dialog.type()}`); await dialog.dismiss() })
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) await route.continue()
    else { unexpected.push(route.request().url()); await route.abort() }
  })
  page.clinicalMultilineBoundary = unexpected
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.clinicalMultiline?.unexpected || [])).toEqual([])
  expect(page.clinicalMultilineBoundary).toEqual([])
})

const canonical = text => text.replace(/\r\n?/g, '\n')
const pending = page => form(page).getByText('Alteração de voz ainda não salva. Revise os campos e clique em “Salvar rascunho”.', { exact: true })
const request = (mode, field, value) => mode === 'generic'
  ? `Preencher ${field.label} com ${value}`
  : `${mode === 'append' ? 'Acrescentar' : 'Preencher'} ${field.noun} da sessão de Ana Clara com ${value}`

// Twelve cases: all four clinical targets through the two natural operations
// and the real generic interface parser. CRLF is normalized by the browser's
// composer textarea, not asserted as raw CR surviving a DOM round trip.
for (const field of fields) {
  for (const mode of ['replace', 'append', 'generic']) {
    test(`${field.noun} ${mode}: multiline literal só muda o destino após confirmação`, async ({ page }) => {
      await openApp(page)
      const before = await snapshot(page)
      const original = before.drafts[0]
      const manual = 'Base MANUAL fictícia\nLinha anterior  preservada'
      const initial = { ...original }
      if (mode === 'append') {
        await fieldControl(page, field).fill(manual)
        initial[field.key] = manual
      }
      const supplied = mode === 'generic'
        ? 'Ána  com apoio\r\nnão abrir Agenda\r\nFIM_LITERAL'
        : 'Ána  com apoio\nnão abrir Agenda\nFIM_LITERAL'
      const value = canonical(supplied)
      const text = request(mode, field, supplied)
      await propose(page, text)
      const preview = page.locator('.voice-command-preview')
      await expect(preview).toBeVisible()
      // textContent, rather than whitespace-normalizing text matching, checks LF.
      expect(await preview.textContent()).toContain(value)
      await expectValues(page, initial)
      await expect(pending(page)).toHaveCount(0)
      await expectNoWrites(page, before)
      await confirm(page)
      const expected = { ...initial, [field.key]: mode === 'append' ? manual + ' ' + value : value }
      await expectValues(page, expected)
      expect(await fieldControl(page, field).inputValue()).not.toContain('\r')
      await expectNoWrites(page, before)
      await expect(page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Abrir sessões', exact: true })).toHaveAttribute('aria-current', 'page')
      // Natural writes are explicitly voice-pending; generic fill follows the
      // ordinary local input path, whose legitimate 600ms autosave is not frozen
      // by pretending it is a voice append. Stay below that deadline here.
      if (mode !== 'generic') {
        await expect(pending(page)).toBeVisible()
        await expectNoVoiceAutosave(page, before)
        await expectValues(page, expected)
      }
      await expect(page.getByRole('region', { name: 'Agenda', exact: true })).toHaveCount(0)
    })
  }
}

test('Salvar explícito envia os quatro payloads LF exatos e preserva os rascunhos concorrentes', async ({ page }) => {
  await openApp(page, { allowSave: true })
  const before = await snapshot(page)
  const expected = { ...before.drafts[0] }
  for (const field of fields) {
    const raw = `Texto fictício ${field.noun}\r\nnão abrir Agenda\r\nFIM`
    expected[field.key] = canonical(raw)
    await propose(page, request('replace', field, raw))
    await expect(page.locator('.voice-command-preview')).toBeVisible()
    await expect(fieldControl(page, field)).toHaveValue(before.drafts[0][field.key])
    await expectNoWrites(page, before)
    await confirm(page)
    await expect(fieldControl(page, field)).toHaveValue(expected[field.key])
  }
  await expectValues(page, expected)
  await expect(pending(page)).toBeVisible()
  await expectNoVoiceAutosave(page, before)
  const input = Object.fromEntries(fields.map(field => [field.key, expected[field.key]]))
  Object.assign(input, { behaviorIds: [], indicators: [] })
  await form(page).getByRole('button', { name: 'Salvar rascunho', exact: true }).click()
  await expect.poll(() => writes(page)).toEqual([{ command: 'session_draft_save', args: { id: 'draft-ana', input } }])
  expect(await snapshot(page)).toEqual({ ...before, drafts: [expected, ...before.drafts.slice(1)] })
  await expectValues(page, expected)
  await expect(pending(page)).toHaveCount(0)
  await page.clock.runFor(1200)
  expect(await writes(page)).toEqual([{ command: 'session_draft_save', args: { id: 'draft-ana', input } }])
})

test('append multiline fica stale após editar/restaurar a base LF sem marcar pendência de voz', async ({ page }) => {
  await openApp(page, { allowSave: true, observation: 'Base fictícia\nSegunda linha' })
  const before = await snapshot(page)
  const original = before.drafts[0]
  await propose(page, request('append', fields[0], 'TRECHO NÃO APLICAR\nFIM'))
  await expect(page.locator('.voice-command-preview')).toBeVisible()
  await expectValues(page, original)
  await expectNoWrites(page, before)
  await fieldControl(page).fill('Edição manual\nTemporária')
  await fieldControl(page).fill(original.observation)
  await confirm(page)
  await expectValues(page, original)
  await expect(pending(page)).toHaveCount(0)
  await expectNoWrites(page, before)
  // The manual edit is allowed to schedule its existing autosave, but never
  // save the rejected proposed chunk or create a voice-pending marker.
  await page.clock.runFor(1200)
  const saved = await writes(page)
  expect(saved.length).toBeLessThanOrEqual(1)
  const input = Object.fromEntries(fields.map(field => [field.key, original[field.key]]))
  Object.assign(input, { behaviorIds: [], indicators: [] })
  for (const entry of saved) expect(entry).toEqual({ command: 'session_draft_save', args: { id: 'draft-ana', input } })
  expect(await snapshot(page)).toEqual(before)
  await expectValues(page, original)
  await expect(pending(page)).toHaveCount(0)
})

test('LF no cabeçalho/nome/query e ação composta fora do payload são recusados sem efeitos', async ({ page }) => {
  await openApp(page)
  const before = await snapshot(page)
  for (const text of [
    'Preencher observação da sessão de Ana\nClara com Texto fictício',
    'Acrescentar observação da sessão de Ana\nClara com Texto fictício',
    'Preencher\nobservação da sessão de Ana Clara com Texto fictício',
    'Preencher Observações\ndescritivas com Texto fictício',
    'Abrir Agenda\nPreencher observação da sessão de Ana Clara com Texto fictício',
  ]) {
    await propose(page, text)
    await expect(page.locator('.voice-command-preview')).toHaveCount(0)
    await expect(page.locator('.voice-command-error')).toBeVisible()
    await expectValues(page, before.drafts[0])
    await expectNoWrites(page, before)
    await confirm(page)
    await expectValues(page, before.drafts[0])
    await expect(pending(page)).toHaveCount(0)
  }
  await expectNoVoiceAutosave(page, before)
})

test('biblioteca: título INPUT recusa multiline e descrição aceita literal somente após confirmar sem writes', async ({ page }) => {
  await openApp(page)
  const before = await snapshot(page)
  await page.locator('#session-behaviors > summary').click()
  const title = page.locator('#behavior-title')
  const description = page.locator('#behavior-description')
  await expect(title).toBeVisible()
  await expect(description).toBeVisible()
  const originalTitle = await title.inputValue()
  const originalDescription = await description.inputValue()
  const literal = 'Texto fictício\nnão abrir Agenda\nSegunda linha'

  await propose(page, `Preencher Título descritivo com ${literal}`)
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  await expect(page.locator('.voice-command-error')).toBeVisible()
  await expect(title).toHaveValue(originalTitle)
  await expect(description).toHaveValue(originalDescription)
  await expectNoWrites(page, before)
  await confirm(page)
  await expect(title).toHaveValue(originalTitle)
  await expect(description).toHaveValue(originalDescription)
  await expectValues(page, before.drafts[0])
  await expect(pending(page)).toHaveCount(0)
  await expectNoVoiceAutosave(page, before)

  await propose(page, `Preencher Descrição opcional com ${literal}`)
  await expect(page.locator('.voice-command-preview')).toBeVisible()
  expect(await page.locator('.voice-command-preview').textContent()).toContain(literal)
  await expect(description).toHaveValue(originalDescription)
  await expect(title).toHaveValue(originalTitle)
  await expectValues(page, before.drafts[0])
  await expect(pending(page)).toHaveCount(0)
  await expectNoWrites(page, before)
  await confirm(page)
  await expect(description).toHaveValue(literal)
  await expect(title).toHaveValue(originalTitle)
  await expectValues(page, before.drafts[0])
  await expect(pending(page)).toHaveCount(0)
  await expectNoVoiceAutosave(page, before)
  await expect(description).toHaveValue(literal)
  await expect(title).toHaveValue(originalTitle)
  await expectValues(page, before.drafts[0])
})

