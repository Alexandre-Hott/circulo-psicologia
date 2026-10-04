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
const snapshot = page => page.evaluate(() => structuredClone(window.clinicalAppend.state))
const writes = page => page.evaluate(() => structuredClone(window.clinicalAppend.writes))
const appendRequest = (field, chunk) => `Acrescentar ${field.noun} da sessão de Ana Clara com ${chunk}`
const joined = (base, chunk) => base ? `${base} ${chunk}` : chunk

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
    const fixture = window.clinicalAppend = { state: { patients, drafts }, calls: [], writes: [], unexpected: [], catalogReady: false }
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
  await expect.poll(() => page.evaluate(() => window.clinicalAppend.catalogReady)).toBe(true)
  await expect(page.locator('.vault-home-preview')).toContainText('Ana Clara')
  await page.clock.runFor(32)
  await command(page, 'Abrir registros de Ana Clara')
  await selectDraft(page, 'draft-ana')
}

async function propose(page, text) {
  expect(text.length).toBeLessThanOrEqual(4600)
  await assistant(page).getByLabel('Seu comando').fill(text)
  await expect(assistant(page).getByLabel('Seu comando')).toHaveValue(text)
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
  expect(await page.evaluate(() => window.clinicalAppend.unexpected)).toEqual([])
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
}

async function proposeAppend(page, field, chunk, before) {
  const base = await fieldControl(page, field).inputValue()
  await propose(page, appendRequest(field, chunk))
  await expect(page.locator('.voice-command-preview')).toBeVisible()
  await expect(page.locator('.voice-command-preview')).toContainText(chunk)
  await expect(fieldControl(page, field)).toHaveValue(base)
  await expectNoWrites(page, before)
  return joined(base, chunk)
}

async function expectNoVoiceAutosave(page, before) {
  await page.clock.runFor(1200)
  await expectNoWrites(page, before)
}

async function expectNoPendingAppendMarker(page) {
  await expect(page.getByText('Alteração de voz ainda não salva. Revise os campos e clique em “Salvar rascunho”.', { exact: true })).toHaveCount(0)
}

test.beforeEach(async ({ page, baseURL }) => {
  const unexpected = []
  page.on('dialog', async dialog => { unexpected.push(`native dialog: ${dialog.type()}`); await dialog.dismiss() })
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) await route.continue()
    else { unexpected.push(route.request().url()); await route.abort() }
  })
  page.clinicalAppendBoundary = unexpected
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.clinicalAppend?.unexpected || [])).toEqual([])
  expect(page.clinicalAppendBoundary).toEqual([])
})

for (const field of fields) {
  test(`${field.noun}: dois appends confirmados usam a base viva não salva e preservam todos os outros campos`, async ({ page }) => {
    await openApp(page)
    const before = await snapshot(page)
    const original = before.drafts[0]
    const first = 'Trecho fictício 1: Ána  Clara; não abrir Agenda.'
    const second = 'Trecho fictício 2: “com apoio”, literal.'
    const combined = await proposeAppend(page, field, first, before)
    await expectValues(page, original)
    await confirm(page)
    await expectValues(page, { ...original, [field.key]: combined })
    await expect(form(page)).toContainText('Alteração de voz ainda não salva')
    await expectNoVoiceAutosave(page, before)
    const combinedAgain = await proposeAppend(page, field, second, before)
    expect(combinedAgain).toBe(joined(combined, second))
    await confirm(page)
    await expectValues(page, { ...original, [field.key]: combinedAgain })
    await expectNoVoiceAutosave(page, before)
  })

  test(`${field.noun}: edição manual não salva antes de preparar integra a base sem perder texto`, async ({ page }) => {
    await openApp(page)
    const before = await snapshot(page)
    const manual = 'Base MANUAL fictícia: Ána  Clara.  '
    await fieldControl(page, field).fill(manual)
    const combined = await proposeAppend(page, field, 'Trecho literal adicional.', before)
    await confirm(page)
    await expectValues(page, { ...before.drafts[0], [field.key]: combined })
    await expectNoVoiceAutosave(page, before)
  })
}

for (const restore of [false, true]) {
  test(`editar após proposta${restore ? ' e restaurar o mesmo valor' : ''} invalida revisão antes de marcar append pendente`, async ({ page }) => {
    await openApp(page, { allowSave: true })
    const before = await snapshot(page)
    const base = before.drafts[0].observation
    await proposeAppend(page, fields[0], 'NÃO APLICAR ESTE TRECHO.', before)
    await fieldControl(page).fill('Edição manual fictícia após proposta.')
    if (restore) await fieldControl(page).fill(base)
    const current = await fieldControl(page).inputValue()
    await confirm(page)
    await expectValues(page, { ...before.drafts[0], observation: current })
    await expectNoPendingAppendMarker(page)
    await expectNoWrites(page, before)
    // Rejection must happen before voice-pending markers. Ordinary manual
    // autosave may still run; it can save only the manual value, never append.
    await page.clock.runFor(1200)
    const saved = await writes(page)
    expect(saved.length).toBeLessThanOrEqual(1)
    const manualInput = Object.fromEntries(fields.map(field => [field.key, field.key === 'observation' ? current : before.drafts[0][field.key]]))
    Object.assign(manualInput, { behaviorIds: [], indicators: [] })
    for (const write of saved) expect(write).toEqual({ command: 'session_draft_save', args: { id: 'draft-ana', input: manualInput } })
    expect(await snapshot(page)).toEqual(saved.length ? { ...before, drafts: [{ ...before.drafts[0], observation: current }, ...before.drafts.slice(1)] } : before)
    await expectValues(page, { ...before.drafts[0], observation: current })
    await expectNoPendingAppendMarker(page)
    expect((await fieldControl(page).inputValue())).not.toContain('NÃO APLICAR ESTE TRECHO')
  })
}

for (const destination of ['draft', 'patient', 'area', 'remount']) {
  test(`proposta obsoleta após ${destination} não atravessa identidade, espaço ou montagem nem marca texto pendente`, async ({ page }) => {
    await openApp(page)
    const before = await snapshot(page)
    await proposeAppend(page, fields[0], 'NÃO ATRAVESSAR O DESTINO.', before)
    if (destination === 'draft') {
      await selectDraft(page, 'draft-ana-other')
    } else if (destination === 'patient') {
      await page.getByLabel('Paciente para evolução e sessões').selectOption('bia')
      await expect(form(page)).toHaveCount(0)
      await selectDraft(page, 'draft-bia')
    } else if (destination === 'area') {
      await page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Pacientes', exact: true }).click()
    } else {
      // Return to the same draft/value after real unmount and remount. A new
      // mount epoch must invalidate the old proposal even when IDs match.
      await page.getByRole('button', { name: 'Fechar sessões', exact: true }).click()
      await expect(form(page)).toHaveCount(0)
      await page.getByRole('button', { name: 'Abrir sessões', exact: true }).click()
      await page.getByLabel('Paciente para evolução e sessões').selectOption('ana')
      await selectDraft(page, 'draft-ana')
    }
    await confirm(page)
    await expectNoPendingAppendMarker(page)
    if (destination === 'draft') await expectValues(page, before.drafts[1], 'draft-ana-other')
    else if (destination === 'patient') await expectValues(page, before.drafts[2], 'draft-bia', 'bia')
    else if (destination === 'remount') await expectValues(page, before.drafts[0])
    else {
      await expect(page.getByRole('region', { name: 'Pacientes', exact: true })).toBeVisible()
      await expect(form(page)).toHaveCount(0)
    }
    await expectNoVoiceAutosave(page, before)
  })
}

for (const empty of [false, true]) {
  test(`limite combinado ${empty ? 'base vazia' : 'base com whitespace'}: 4000 aceita literal, 4001 recusa sem truncar`, async ({ page }) => {
    const base = empty ? '' : 'Á'.repeat(3988) + '  '
    await openApp(page, { observation: base })
    const before = await snapshot(page)
    const accepted = empty ? 'B'.repeat(3999) + '.' : 'B'.repeat(8) + '.'
    const refused = accepted + 'X'
    expect(joined(base, accepted).length).toBe(4000)
    expect(joined(base, refused).length).toBe(4001)
    // Refuse overflow before accepting the exact boundary, proving the parser
    // sees the combined live base and includes its literal separator/whitespace.
    await propose(page, appendRequest(fields[0], refused))
    await expect(page.locator('.voice-command-preview')).toHaveCount(0)
    await expect(page.locator('.voice-command-error')).toContainText('4000')
    await expect(fieldControl(page)).toHaveValue(base)
    await expectNoPendingAppendMarker(page)
    await confirm(page)
    await expect(fieldControl(page)).toHaveValue(base)
    await expectNoVoiceAutosave(page, before)
    const combined = await proposeAppend(page, fields[0], accepted, before)
    await confirm(page)
    await expect(fieldControl(page)).toHaveValue(combined)
    expect((await fieldControl(page).inputValue()).length).toBe(4000)
    await expectNoVoiceAutosave(page, before)
  })
}

test('Salvar rascunho explícito grava exatamente os appends locais e preserva outros drafts', async ({ page }) => {
  await openApp(page, { allowSave: true })
  const before = await snapshot(page)
  const expected = { ...before.drafts[0] }
  for (const field of fields) {
    expected[field.key] = await proposeAppend(page, field, `Trecho fictício salvo de ${field.noun}.`, before)
    await confirm(page)
  }
  await expectValues(page, expected)
  await expectNoVoiceAutosave(page, before)
  const input = Object.fromEntries(fields.map(field => [field.key, expected[field.key]]))
  Object.assign(input, { behaviorIds: [], indicators: [] })
  await form(page).getByRole('button', { name: 'Salvar rascunho', exact: true }).click()
  await expect.poll(() => writes(page)).toEqual([{ command: 'session_draft_save', args: { id: 'draft-ana', input } }])
  await expectNoPendingAppendMarker(page)
  await expectValues(page, expected)
  const after = await snapshot(page)
  expect(after).toEqual({ ...before, drafts: [expected, ...before.drafts.slice(1)] })
  await page.clock.runFor(1200)
  expect(await writes(page)).toEqual([{ command: 'session_draft_save', args: { id: 'draft-ana', input } }])
})

test('cancelar comando descarta append e confirmar depois não reaplica prévia antiga', async ({ page }) => {
  await openApp(page)
  const before = await snapshot(page)
  await proposeAppend(page, fields[0], 'TRECHO DESCARTADO.', before)
  await propose(page, 'Cancelar comando')
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  await expectValues(page, before.drafts[0])
  await confirm(page)
  await expectValues(page, before.drafts[0])
  await expectNoPendingAppendMarker(page)
  await expectNoVoiceAutosave(page, before)
})

test('Preencher continua replace nos quatro campos após append, sem concatenar base antiga', async ({ page }) => {
  await openApp(page)
  const before = await snapshot(page)
  const expected = { ...before.drafts[0] }
  for (const field of fields) {
    await proposeAppend(page, field, 'TRECHO ANTES DO REPLACE.', before)
    await confirm(page)
    expected[field.key] = `Novo texto fictício exclusivo de ${field.noun}.`
    await propose(page, `Preencher ${field.noun} da sessão de Ana Clara com ${expected[field.key]}`)
    await expect(page.locator('.voice-command-preview')).toBeVisible()
    await confirm(page)
    await expect(fieldControl(page, field)).toHaveValue(expected[field.key])
  }
  await expectValues(page, expected)
  await expectNoVoiceAutosave(page, before)
})
