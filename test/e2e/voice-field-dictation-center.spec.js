import { expect, test } from '@playwright/test'

const center = page => page.getByRole('region', { name: 'Comando do Círculo' })
const body = page => center(page).locator('textarea:not(#voice-command-text)')
const snapshot = page => page.evaluate(() => structuredClone(window.fieldDictation))

test.beforeEach(async ({ page }) => {
  await page.goto('/test/e2e/fixtures/voice-field-dictation.html')
  await expect(center(page)).toBeVisible()
  await expect(page.getByLabel('Observação fictícia do editor')).toHaveValue('Base fictícia.')
})

async function arm(page, field = 'observation') {
  await center(page).getByRole('button', { name: 'Ditar neste campo', exact: true }).click()
  await center(page).getByLabel('Campo do rascunho', { exact: true }).selectOption(field)
  await expect(body(page)).toHaveCount(1)
  await expect(body(page)).toBeEditable()
}

test('modo disponível: quatro campos clínicos e destino visível sem mutação', async ({ page }) => {
  const before = (await snapshot(page)).live
  await arm(page)
  const picker = center(page).getByLabel('Campo do rascunho', { exact: true })
  expect(await picker.locator('option').evaluateAll(options => options.filter(option => option.value).map(option => option.value))).toEqual(['observation', 'procedures', 'outcomeDecision', 'referralClosure'])
  await expect(center(page)).toContainText('Ana Clara')
  await expect(center(page)).toContainText('draft-ana')
  await expect(center(page)).toContainText('Observações descritivas')
  const current = await snapshot(page)
  expect(current.live).toEqual(before)
  expect(current.parserCalls).toEqual([])
  expect(current.applies).toEqual([])
  expect(current.writes).toEqual([])
})

for (const text of ['não abrir Agenda', 'confirmar']) {
  test('corpo literal ' + JSON.stringify(text) + ' não é comando; só Confirmar acréscimo aplica', async ({ page }) => {
    await arm(page)
    await body(page).fill(text)
    const before = await snapshot(page)
    expect(before.parserCalls).toEqual([])
    expect(before.applies).toEqual([])
    await center(page).getByRole('button', { name: 'Preparar trecho', exact: true }).click()
    await expect(center(page).getByRole('button', { name: 'Confirmar acréscimo', exact: true })).toBeEnabled()
    const prepared = await snapshot(page)
    expect(prepared.preparations.at(-1).body).toBe(text)
    expect(prepared.live).toEqual(before.live)
    expect(prepared.parserCalls).toEqual([])
    expect(prepared.applies).toEqual([])
    expect(prepared.writes).toEqual([])
    await center(page).getByRole('button', { name: 'Confirmar acréscimo', exact: true }).click()
    await expect(page.getByLabel('Observação fictícia do editor')).toHaveValue('Base fictícia. ' + text)
    const applied = await snapshot(page)
    expect(applied.applies).toHaveLength(1)
    expect(applied.applies[0].patch.value).toBe(text)
    expect(applied.parserCalls).toEqual([])
    expect(applied.writes).toEqual([])
    // Consumed selection cannot silently renew its live snapshot for a second
    // body. Re-preparing without explicit selection must never apply again.
    const selections = applied.selections.length
    const prepare = center(page).getByRole('button', { name: 'Preparar trecho', exact: true })
    if (await prepare.isEnabled()) await prepare.click()
    expect((await snapshot(page)).selections).toHaveLength(selections)
    expect((await snapshot(page)).applies).toHaveLength(1)
  })
}

for (const endedBy of ['silence', 'max-duration']) {
  test('captura ' + endedBy + ' mantém corpo editável e nunca prepara automaticamente', async ({ page }) => {
    await arm(page)
    await center(page).getByRole('button', { name: 'Ouvir e transcrever' }).click()
    await expect.poll(() => page.evaluate(() => typeof window.resolveFieldDictation)).toBe('function')
    const text = 'confirmar\nnão abrir Agenda'
    await page.evaluate(({ text, endedBy }) => window.resolveFieldDictation({ transcript: text, endedBy, maxDurationMs: 12000 }), { text, endedBy })
    await expect(center(page).getByRole('button', { name: 'Ouvir e transcrever' })).toBeEnabled()
    await expect(body(page)).toHaveValue(text)
    const current = await snapshot(page)
    expect(current.parserCalls).toEqual([])
    expect(current.preparations).toEqual([])
    expect(current.applies).toEqual([])
    expect(current.writes).toEqual([])
    if (endedBy === 'max-duration') await expect(center(page)).toContainText('pode estar incompleta')
    await body(page).fill(text + '\nComplemento manual fictício')
    await center(page).getByRole('button', { name: 'Preparar trecho', exact: true }).click()
    expect((await snapshot(page)).preparations.at(-1).body).toBe(text + '\nComplemento manual fictício')
    expect((await snapshot(page)).applies).toEqual([])
  })
}
