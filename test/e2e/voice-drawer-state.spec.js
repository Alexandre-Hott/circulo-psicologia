import { expect, test } from '@playwright/test'

async function setup(page, html) {
  await page.goto('/test/e2e/fixtures/voice-command-center.html')
  await page.setContent(html)
}
async function parse(page, text) {
  return page.evaluate(async value => (await import('/src/voiceInterfaceCommands.js')).parseVoiceInterfaceCommand(value), text)
}
async function apply(page, intent) {
  return page.evaluate(async value => {
    try { (await import('/src/voiceInterfaceCommands.js')).applyVoiceInterfaceCommand(value); return null }
    catch (reason) { return reason.message }
  }, intent)
}
const drawer = '<details data-voice-record="agenda:new" data-voice-epoch="0"><summary>Novo compromisso</summary><label>Nome<input value="Ana Fictícia"></label></details>'

test('abrir e recolher gaveta são propostas idempotentes e preservam formulário', async ({ page }) => {
  await setup(page, drawer)
  const proposal = await parse(page, 'Abrir Novo compromisso')
  expect(proposal.status).toBe('draft')
  expect(proposal.intent.operation).toBe('open')
  await expect(page.locator('details')).not.toHaveAttribute('open', '')
  expect(await apply(page, proposal.intent)).toBeNull()
  await expect(page.locator('details')).toHaveAttribute('open', '')
  expect(await apply(page, proposal.intent)).toBeNull()
  await expect(page.locator('details')).toHaveAttribute('open', '')
  const close = await parse(page, 'Recolher a gaveta Novo compromisso')
  expect(close.status).toBe('draft')
  expect(close.intent.operation).toBe('close')
  await expect(page.locator('details')).toHaveAttribute('open', '')
  expect(await apply(page, close.intent)).toBeNull()
  expect(await apply(page, close.intent)).toBeNull()
  await expect(page.locator('details')).not.toHaveAttribute('open', '')
  await expect(page.locator('input')).toHaveValue('Ana Fictícia')
  const reopen = await parse(page, 'Abrir Novo compromisso')
  await page.locator('details').evaluate(element => { element.open = true })
  expect(await apply(page, reopen.intent)).toBeNull()
  await expect(page.locator('details')).toHaveAttribute('open', '')
  const toggle = await parse(page, 'Clicar em Novo compromisso')
  expect(await apply(page, toggle.intent)).toBeNull()
  await expect(page.locator('details')).not.toHaveAttribute('open', '')
})

test('gaveta revalida destino aria-controls e não aciona botão reconfigurado', async ({ page }) => {
  await setup(page, '<button aria-expanded="false" aria-controls="first">Detalhes e ações</button>')
  const proposal = await parse(page, 'Abrir Detalhes e ações')
  expect(proposal.status).toBe('draft')
  await page.locator('button').evaluate(element => { element.setAttribute('aria-controls', 'other') })
  expect(await apply(page, proposal.intent)).toContain('A tela mudou')
  await expect(page.locator('button')).toHaveAttribute('aria-expanded', 'false')
})

for (const [name, html] of [
  ['botão que não é gaveta', '<button>Novo compromisso</button>'],
  ['gavetas duplicadas', drawer + drawer],
  ['gaveta oculta', `<div hidden>${drawer}</div>`],
  ['gaveta aninhada fechada', `<details><summary>Mais opções</summary>${drawer}</details>`],
  ['gaveta fora da confirmação aberta', drawer + '<section role="alertdialog"><button>Confirmar ação</button></section>'],
]) test(`comando de gaveta recusa ${name}`, async ({ page }) => {
  await setup(page, html)
  expect((await parse(page, 'Abrir Novo compromisso')).status).toBe('clarification')
  await expect(page.locator('details[open]')).toHaveCount(0)
})

test('abrir gaveta recusa negação, texto extra e revisão trocada antes de aplicar', async ({ page }) => {
  await setup(page, drawer)
  expect((await parse(page, 'Não abrir Novo compromisso')).status).toBe('clarification')
  expect((await parse(page, 'Abrir Novo compromisso agora')).status).toBe('clarification')
  const proposal = await parse(page, 'Abra a gaveta Novo compromisso')
  expect(proposal.status).toBe('draft')
  await page.locator('details').evaluate(element => { element.dataset.voiceEpoch = '1' })
  expect(await apply(page, proposal.intent)).toContain('A tela mudou')
  await expect(page.locator('details')).not.toHaveAttribute('open', '')
})
