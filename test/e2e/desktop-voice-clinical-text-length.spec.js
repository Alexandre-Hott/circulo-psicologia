import { expect, test } from '@playwright/test'

const assistant = page => page.getByRole('region', { name: 'Comando do Círculo' })
const composer = page => assistant(page).getByLabel('Seu comando')
const form = page => page.getByRole('form', { name: 'Rascunho de sessão', exact: true })
const snapshot = page => page.evaluate(() => structuredClone(window.clinicalLengths.state))
const clinicalFields = [
  { key: 'observation', label: 'Observações descritivas', natural: 'observação' },
  { key: 'procedures', label: 'Procedimentos realizados', natural: 'procedimentos' },
  { key: 'outcomeDecision', label: 'Resultado e decisão', natural: 'resultado' },
  { key: 'referralClosure', label: 'Encaminhamento ou encerramento (opcional)', natural: 'encaminhamento' },
]

function literalText(length) {
  const beginning = 'Texto fictício literal: ação, "com apoio"; seção e NÃO inferir. '
  const ending = ' FIM_LITERAL'
  const result = beginning + 'á'.repeat(length - beginning.length - ending.length) + ending
  expect(result.length).toBe(length)
  return result
}

// Real app shell and both actual parsers. Only native IPC is simulated; cloned
// data never touches a real vault/profile, and every unknown command throws.
async function openApp(page) {
  const time = new Date('2026-10-04T15:00:00Z')
  await page.clock.install({ time })
  await page.clock.pauseAt(time)
  await page.addInitScript(() => {
    const clone = value => structuredClone(value)
    const patients = [
      { id: 'ana', name: 'Ana Clara', age: 8, revision: 1, preferredModality: 'Presencial', archivedAt: null },
      { id: 'bia', name: 'Bia Fictícia', age: 9, revision: 1, preferredModality: 'Online', archivedAt: null },
    ]
    const indicators = [{ id: 'indicator-regulation', name: 'Regulação emocional', definition: 'Definição fictícia da escala.', version: 1, labels: ['Ainda não observado', 'Com muito apoio', 'Com algum apoio', 'Com autonomia'] }]
    const drafts = patients.map(patient => ({
      id: patient.id === 'ana' ? 'synthetic-draft' : 'synthetic-draft-bia', patientId: patient.id, seriesId: `series-${patient.id}`, originalDate: '2026-10-04',
      observation: `Observação fictícia original de ${patient.id}.`, procedures: `Procedimentos fictícios de ${patient.id}.`, outcomeDecision: `Resultado fictício de ${patient.id}.`, referralClosure: `Encaminhamento fictício de ${patient.id}.`, behaviorIds: [],
      indicators: [{ id: 'indicator-regulation', value: 1, note: `Nota fictícia literal de ${patient.id}.` }],
    }))
    const fixture = window.clinicalLengths = { state: { patients, indicators, drafts }, calls: [], writes: [], unexpected: [], catalogReady: false }
    const catalogReads = new Set()
    const catalog = (command, value) => {
      catalogReads.add(command)
      fixture.catalogReady = ['patient_list', 'behavior_list', 'indicator_catalog'].every(name => catalogReads.has(name))
      return clone(value)
    }
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      fixture.calls.push(clone({ command, args }))
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { available: false, dirty: false }
      if (command === 'plugin:updater|check') return null
      if (command === 'patient_list') return catalog(command, patients)
      if (command === 'behavior_list') return catalog(command, [])
      if (command === 'indicator_catalog') return catalog(command, indicators)
      if (command === 'session_draft_list') return clone(drafts.filter(item => item.patientId === args.patientId))
      if (['agenda_occurrences', 'agenda_list_series', 'agenda_history', 'session_timeline', 'session_addendum_list', 'case_context_list'].includes(command)) return []
      fixture.unexpected.push(command)
      if (/(?:create|update|save|start|cancel|finalize|archive|restore)/.test(command)) fixture.writes.push(clone({ command, args }))
      throw new Error(`IPC sem fixture: ${command}`)
    } }
  })
  await page.goto('/')
  await expect(assistant(page)).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.clinicalLengths.catalogReady)).toBe(true)
  await expect(page.locator('.vault-home-preview')).toContainText('Ana Clara')
  await page.clock.runFor(32)
  await command(page, 'Abrir registros de Ana Clara')
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue('ana')
  await command(page, 'Abrir Outros rascunhos do paciente')
  const resume = page.locator('#session-other-drafts button[data-voice-record="draft:synthetic-draft"]')
  await expect(resume).toBeEnabled()
  await resume.click()
  await expect(form(page)).toHaveAttribute('data-voice-record', 'synthetic-draft')
  await expect(form(page).getByLabel('Observações descritivas', { exact: true })).toBeEnabled()
  await expect(composer(page)).toHaveAttribute('maxlength', '4600')
}

async function propose(page, text) {
  expect(text.length).toBeLessThanOrEqual(4600)
  await composer(page).fill(text)
  // Detect UI truncation of either the command prefix or literal payload.
  await expect(composer(page)).toHaveValue(text)
  await assistant(page).getByRole('button', { name: 'Preparar rascunho' }).click()
  await expect(composer(page)).toHaveValue(text)
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

async function expectNoPersistence(page, before) {
  const current = await snapshot(page)
  expect(current).toEqual(before)
  expect(current.drafts.find(item => item.id === 'synthetic-draft-bia')).toEqual(before.drafts.find(item => item.id === 'synthetic-draft-bia'))
  expect(await page.evaluate(() => window.clinicalLengths.writes)).toEqual([])
  expect(await page.evaluate(() => window.clinicalLengths.unexpected)).toEqual([])
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue('ana')
  await expect(form(page)).toHaveCount(1)
  await expect(form(page)).toHaveAttribute('data-voice-record', 'synthetic-draft')
  await expect(page.locator('form[data-voice-record="synthetic-draft-bia"]')).toHaveCount(0)
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
}

async function expectClinicalValues(page, values) {
  for (const field of clinicalFields) {
    await expect(form(page).getByLabel(field.label, { exact: true })).toHaveValue(values[field.key])
  }
}

test.beforeEach(async ({ page, baseURL }) => {
  const unexpected = []
  page.on('dialog', async dialog => { unexpected.push(`native dialog: ${dialog.type()}`); await dialog.dismiss() })
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) await route.continue()
    else { unexpected.push(route.request().url()); await route.abort() }
  })
  page.clinicalLengthsBoundary = unexpected
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.clinicalLengths?.unexpected || [])).toEqual([])
  expect(page.clinicalLengthsBoundary).toEqual([])
})

for (const field of clinicalFields) {
  for (const parser of ['natural', 'genérico']) {
    test(`${parser}: ${field.label} aceita 4000 literais somente após confirmar e recusa 4001 sem truncar`, async ({ page }) => {
      await openApp(page)
      const before = await snapshot(page)
      const original = before.drafts.find(item => item.id === 'synthetic-draft')
      const target = form(page).getByLabel(field.label, { exact: true })
      await expect(target).toHaveAttribute('maxlength', '4000')
      const payload = literalText(4000)
      const prefix = parser === 'natural'
        ? `Preencher ${field.natural} da sessão de Ana Clara com `
        : `Preencher ${field.label} com `
      await propose(page, prefix + payload)
      await expect(page.locator('.voice-command-preview')).toBeVisible()
      await expect(page.locator('.voice-command-preview')).toContainText('FIM_LITERAL')
      await expectClinicalValues(page, original)
      await expectNoPersistence(page, before)
      await confirm(page)
      await expectClinicalValues(page, { ...original, [field.key]: payload })
      expect((await target.inputValue()).length).toBe(4000)
      await expectNoPersistence(page, before)
      if (parser === 'natural') await expect(form(page)).toContainText('Alteração de voz ainda não salva')
      // Generic fills use the normal local input path. Keep the paused clock
      // below its 600ms autosave deadline; confirmation itself must not save.
      const tooLong = literalText(4001)
      await propose(page, prefix + tooLong)
      await expect(composer(page)).toHaveValue(prefix + tooLong)
      await expect(page.locator('.voice-command-preview')).toHaveCount(0)
      await expect(page.locator('.voice-command-error')).toContainText('4000')
      await expectClinicalValues(page, { ...original, [field.key]: payload })
      await expectNoPersistence(page, before)
      // A rejected request cannot leave a stale proposal to apply.
      await confirm(page)
      await expectClinicalValues(page, { ...original, [field.key]: payload })
      await expectNoPersistence(page, before)
      await expect(form(page).locator('#indicator-note-indicator-regulation')).toHaveValue(original.indicators[0].note)
    })
  }
}

for (const shortField of [
  { label: 'Título descritivo', selector: '#behavior-title', limit: 160, library: true },
  { label: 'Descrição opcional', selector: '#behavior-description', limit: 1000, library: true },
  { label: 'Nota contextual opcional · Regulação emocional', selector: '#indicator-note-indicator-regulation', limit: 500, library: false },
]) {
  test(`campo curto ${shortField.label} mantém ${shortField.limit}, prévia sem alteração e excesso recusado`, async ({ page }) => {
    await openApp(page)
    const before = await snapshot(page)
    if (shortField.library) await page.locator('#session-behaviors > summary').click()
    const target = page.locator(shortField.selector)
    await expect(target).toBeVisible()
    await expect(target).toHaveAttribute('maxlength', String(shortField.limit))
    const originalValue = await target.inputValue()
    const prefix = `Preencher ${shortField.label} com `
    const payload = literalText(shortField.limit)
    await propose(page, prefix + payload)
    await expect(page.locator('.voice-command-preview')).toBeVisible()
    await expect(target).toHaveValue(originalValue)
    await expectNoPersistence(page, before)
    await confirm(page)
    await expect(target).toHaveValue(payload)
    await expectNoPersistence(page, before)
    const tooLong = literalText(shortField.limit + 1)
    await propose(page, prefix + tooLong)
    await expect(page.locator('.voice-command-preview')).toHaveCount(0)
    await expect(page.locator('.voice-command-error')).toContainText(String(shortField.limit))
    await expect(target).toHaveValue(payload)
    await expectNoPersistence(page, before)
    await confirm(page)
    await expect(target).toHaveValue(payload)
    await expectNoPersistence(page, before)
    await expectClinicalValues(page, before.drafts.find(item => item.id === 'synthetic-draft'))
  })
}
