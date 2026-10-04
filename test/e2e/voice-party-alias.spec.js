import { expect, test } from '@playwright/test'

const role = '<label><input type="checkbox">Contato administrativo</label>'
const party = content => `<form data-voice-record="party:ana:new" data-voice-epoch="0">${content}</form>`
async function setup(page, html) {
  await page.goto('/test/e2e/fixtures/voice-command-center.html')
  await page.setContent(html)
}
async function parse(page, text) {
  return page.evaluate(async value => (await import('/src/voiceInterfaceCommands.js')).parseVoiceInterfaceCommand(value), text)
}

for (const [name, html] of [
  ['fora dos vínculos', `<form>${role}</form>`],
  ['duplicatas nos vínculos', party(role + role)],
  ['opção desabilitada', party('<label><input type="checkbox" disabled>Contato administrativo</label>')],
  ['nome literal concorrente', party(role) + '<label><input type="checkbox">Contrato administrativo</label>'],
]) test(`alias administrativo recusa ${name}`, async ({ page }) => {
  await setup(page, html)
  expect((await parse(page, 'Marcar contrato administrativo')).status).toBe('clarification')
  await expect(page.locator('input:checked')).toHaveCount(0)
})

test('alias administrativo fica limitado ao checkbox e revalida revisão', async ({ page }) => {
  await setup(page, party(role + '<label>Nome<input type="text"></label>'))
  const proposed = await parse(page, 'Marcar contrato administrativo')
  expect(proposed.status).toBe('draft')
  expect(proposed.preview).toContain('Contato administrativo')
  await expect(page.locator('input:checked')).toHaveCount(0)
  await page.locator('form').evaluate(form => { form.dataset.voiceEpoch = '1' })
  const error = await page.evaluate(async intent => {
    try { (await import('/src/voiceInterfaceCommands.js')).applyVoiceInterfaceCommand(intent); return null }
    catch (reason) { return reason.message }
  }, proposed.intent)
  expect(error).toContain('A tela mudou')
  await expect(page.locator('input:checked')).toHaveCount(0)
  const literal = await parse(page, 'Preencher Nome com contrato administrativo')
  expect(literal.intent.value).toBe('contrato administrativo')
  expect((await parse(page, 'Não marcar contrato administrativo')).status).toBe('clarification')
})
