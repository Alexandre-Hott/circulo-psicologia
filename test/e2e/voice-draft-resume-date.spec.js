import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const nativeChoices = JSON.parse(readFileSync(new URL('../fixtures/native-voice-draft-choice-20261004.json', import.meta.url), 'utf8'))

const spoken = 'três de outubro de dois mil e vinte e seis'
const draft = (id = 'd1', extra = {}) => ({ id, patientId: 'ana', seriesId: `series-${id}`, originalDate: '2026-10-03', observation: `Texto preservado ${id}`, procedures: '', outcomeDecision: '', referralClosure: '', behaviorIds: [], indicators: [], ...extra })
const buttons = page => page.locator('#sessions-host button[data-voice-draft-resume]')
const parse = (page, text) => page.evaluate(async text => (await import('/src/voiceInterfaceCommands.js')).parseVoiceInterfaceCommand(text, document), text)
const apply = (page, proposal) => page.evaluate(async intent => {
  try { (await import('/src/voiceInterfaceCommands.js')).applyVoiceInterfaceCommand(intent, document); return null }
  catch (error) { return error.message }
}, proposal.intent)

async function dom(page, items = [draft()]) {
  await page.goto('/test/e2e/fixtures/voice-command-center.html')
  await page.setContent('<main id="sessions-host"></main>')
  await page.evaluate(items => {
    window.resumed = []
    for (const [index, item] of items.entries()) {
      const option = String(index + 1)
      const button = document.createElement('button')
      button.textContent = `Retomar rascunho ${item.originalDate}${option ? ` · opção ${option}` : ''}`
      for (const [key, value] of Object.entries({
        'data-voice-draft-resume': 'true', 'data-voice-resume-patient': item.patientId,
        'data-voice-resume-draft': item.id, 'data-voice-resume-date': item.originalDate,
        'data-voice-resume-option': option, 'data-voice-action': `sessions:resume:${item.patientId}:${item.id}`,
        'data-voice-resume-needs-option': items.filter(other => other.originalDate === item.originalDate).length > 1 ? 'true' : 'false',
        'data-voice-record': `draft:${item.id}`, 'data-voice-epoch': 'instance:1',
      })) button.setAttribute(key, value)
      button.onclick = () => window.resumed.push(item.id)
      document.getElementById('sessions-host').append(button)
    }
  }, items)
}

async function mount(page, { items = [draft()], deferred = false } = {}) {
  await page.addInitScript(({ items, deferred }) => {
    const copy = value => JSON.parse(JSON.stringify(value))
    const data = { patients: [patientData('ana', 'Ana Clara'), patientData('bia', 'Bia')], drafts: items }
    function patientData(id, name) { return { id, name, age: 8, archivedAt: null } }
    window.resumeHarness = { data, initial: JSON.stringify(data), calls: [], writes: [], selections: [], deferred, pending: [] }
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      const h = window.resumeHarness
      h.calls.push(copy({ command, args }))
      if (command === 'patient_list') return copy(h.data.patients)
      if (['behavior_list', 'indicator_catalog', 'session_timeline', 'session_addendum_list', 'case_context_list'].includes(command)) return []
      if (command === 'session_draft_list') {
        if (h.deferred) await new Promise(resolve => h.pending.push(resolve))
        return copy(h.data.drafts.filter(item => item.patientId === args.patientId))
      }
      h.writes.push(copy({ command, args }))
      throw new Error(`IPC inesperada: ${command}`)
    } }
  }, { items, deferred })
  await page.goto('/test/e2e/fixtures/voice-command-center.html')
  await page.evaluate(async () => {
    document.getElementById('root').remove()
    const host = document.createElement('div'); host.id = 'sessions-host'; document.body.append(host)
    const module = await import('/node_modules/.vite/deps/react.js')
    const React = module.createElement ? module : module.default
    const dom = await import('/node_modules/.vite/deps/react-dom_client.js')
    const createRoot = dom.createRoot || dom.default.createRoot
    const { default: Sessions } = await import('/src/DesktopSessions.jsx')
    const h = window.resumeHarness
    h.props = { patientId: 'ana', activeDraft: null, workspaceActive: true }
    window.sessionsRoot = createRoot(host)
    // The harness itself has no hooks: DesktopSessions uses its own Vite React
    // dependency, just as in the existing Agenda component fixtures.
    window.sessionsMount = () => window.sessionsRoot.render(React.createElement(Sessions, {
        key: h.props.activeDraft?.id || 'timeline', ...h.props,
        onPatientChange: value => h.setPatient(value),
        onDraftChange: value => { h.selections.push(value?.id || null); h.setDraft(value) },
        onChanged: async () => { window.resumeHarness.writes.push({ command: 'onChanged' }); throw new Error('Gravação inesperada') },
        onStartRecord: () => { window.resumeHarness.writes.push({ command: 'onStartRecord' }); throw new Error('Criação inesperada') },
        onConfirm: async () => { window.resumeHarness.writes.push({ command: 'onConfirm' }); throw new Error('Confirmação de gravação inesperada') },
      }))
    h.setPatient = value => { h.props.patientId = value; window.sessionsMount() }
    h.setWorkspace = value => { h.props.workspaceActive = value; window.sessionsMount() }
    h.setDraft = value => { h.props.activeDraft = value; window.sessionsMount() }
    window.sessionsMount()
  })
  await expect(page.getByLabel('Paciente para evolução e sessões')).toHaveValue('ana')
  await expect(page.getByLabel('Paciente para evolução e sessões').getByRole('option')).toHaveCount(3)
  if (!deferred) await expect(buttons(page)).toHaveCount(items.filter(item => item.patientId === 'ana').length)
  await page.locator('#session-other-drafts > summary').click()
}

async function unchanged(page) {
  expect(await page.evaluate(() => window.resumeHarness.writes)).toEqual([])
  expect(await page.evaluate(() => JSON.stringify(window.resumeHarness.data))).toBe(await page.evaluate(() => window.resumeHarness.initial))
}

test('DOM: pedido direto/clique, data falada e formatos existentes só propõem', async ({ page }) => {
  await dom(page)
  for (const phrase of [`Retomar rascunho ${spoken}`, `Clicar em Retomar rascunho ${spoken}`, `Continuar sessão em ${spoken}`, 'Continuar sessão opção um', 'Retomar rascunho 03/10/2026', 'Clicar em Retomar rascunho 2026-10-03']) {
    const proposal = await parse(page, phrase)
    expect(proposal.status, phrase).toBe('draft')
    expect(proposal.intent.target.record).toBe('draft:d1')
    expect(proposal.intent.target.resume).toContain('2026-10-03')
  }
  expect(await page.evaluate(() => window.resumed)).toEqual([])
  expect(await apply(page, await parse(page, `Retomar rascunho ${spoken}`))).toBeNull()
  expect(await page.evaluate(() => window.resumed)).toEqual(['d1'])
})

test('DOM: datas repetidas exigem opção visível; mantém ISO/opção legados', async ({ page }) => {
  await dom(page, [draft(), draft('d2')])
  for (const phrase of [`Retomar rascunho ${spoken}`, `Continuar sessão em ${spoken}`, 'Clicar em Retomar rascunho 2026-10-03']) expect((await parse(page, phrase)).status).toBe('clarification')
  for (const phrase of [`Retomar rascunho ${spoken} opção dois`, `Continuar sessão em ${spoken} opção dois`, 'Continuar sessão opção dois', `Clicar em Retomar rascunho ${spoken} · opção 2`, 'Clicar em Retomar rascunho 2026-10-03 · opção 2']) {
    const proposal = await parse(page, phrase)
    expect(proposal.status).toBe('draft')
    expect(proposal.intent.target.record).toBe('draft:d2')
  }
  await buttons(page).first().evaluate(element => { element.disabled = true })
  expect((await parse(page, `Retomar rascunho ${spoken}`)).status).toBe('clarification')
  expect((await parse(page, `Retomar rascunho ${spoken} opção três`)).status).toBe('clarification')
  expect(await apply(page, await parse(page, `Retomar rascunho ${spoken} opção dois`))).toBeNull()
  expect(await page.evaluate(() => window.resumed)).toEqual(['d2'])
})

test('DOM: todas as aliases competem e controle sem papel não é aceito', async ({ page }) => {
  await dom(page)
  for (const phrase of [`Retomar rascunho ${spoken}`, `Continuar sessão em ${spoken}`, 'Continuar sessão opção um', 'Continuar seção opção 1', 'Retomar rascunho 2026-10-03']) {
    const proposal = await parse(page, phrase)
    expect(proposal.status).toBe('draft')
    await page.evaluate(text => { const button = document.createElement('button'); button.id = 'competitor'; button.textContent = 'Outro'; button.setAttribute('data-voice-alias', text); document.body.append(button) }, phrase)
    expect((await parse(page, phrase)).status).toBe('clarification')
    expect((await parse(page, `Clicar em ${phrase}`)).status).toBe('clarification')
    expect(await apply(page, proposal)).toContain('A tela mudou')
    await page.locator('#competitor').evaluate(element => element.remove())
  }
  await buttons(page).evaluateAll(elements => elements.forEach(element => element.remove()))
  await page.evaluate(text => { const button = document.createElement('button'); button.textContent = text; document.body.append(button) }, `Retomar rascunho ${spoken}`)
  expect((await parse(page, `Retomar rascunho ${spoken}`)).status).toBe('clarification')
  await page.locator('body > button').evaluate(element => { element.textContent = 'Continuar sessão em três de outubro de dois mil e vinte e seis' })
  expect((await parse(page, `Continuar sessão em ${spoken}`)).status).toBe('clarification')
  await page.locator('body > button').evaluate(element => { element.textContent = 'Continuar seção opção 1' })
  expect((await parse(page, 'Continuar seção opção 1')).status).toBe('clarification')
  expect(await page.evaluate(() => window.resumed)).toEqual([])
})

test('DOM: datas inválidas, parciais, relativas, negação e extras recusados', async ({ page }) => {
  await dom(page)
  for (const phrase of ['Retomar rascunho', 'Retomar rascunho hoje', 'Retomar rascunho três de outubro', 'Retomar rascunho 31/02/2026', `Não retomar rascunho ${spoken}`, `Retomar rascunho ${spoken} agora`, `Retomar rascunho ${spoken} e finalizar sessão`, 'Continuar sessão em 3 de outubro de 2022 e 26', 'Continuar sessão em hoje', `Não continuar sessão em ${spoken}`, `Continuar sessão em ${spoken} e iniciar sessão`, 'Continuar sessão opção', 'Continuar sessão opção zero', 'Continuar sessão opção dois', 'Continuar sessão opção um agora', 'Continuar sessão opção um e finalizar sessão', 'Continuar sessão opção um ou dois', 'Não continuar sessão opção um']) expect((await parse(page, phrase)).status, phrase).toBe('clarification')
  for (const phrase of ['Reto marras com o 3 de outubro de dois mil e vinte e seis.', 'Retomar raccunho 3 de outubro de 2022 e 26 opção 2.']) expect((await parse(page, phrase))?.status, phrase).not.toBe('draft')
  for (const phrase of ['Não continuar seção opção 1', 'Continuar seção opção 1 agora', 'Continuar seção opção 1 ou 2', 'Continuar seção opção 2', 'Continuar seção opção 1 e finalizar sessão']) expect((await parse(page, phrase)).status, phrase).toBe('clarification')
  await page.evaluate(() => { const label = document.createElement('label'); label.textContent = 'Nota'; label.append(document.createElement('textarea')); document.body.append(label) })
  const literal = `Retomar rascunho ${spoken}`
  expect((await parse(page, `Preencher Nota com ${literal}`)).intent.value).toBe(literal)
  expect((await parse(page, 'Preencher Nota com Continuar seção opção 1')).intent.value).toBe('Continuar seção opção 1')
  expect(await page.evaluate(() => window.resumed)).toEqual([])
})

test('DOM: replay Rust preserva opções 1/2 e só retoma após aplicar a proposta', async ({ page }) => {
  await dom(page, [draft(), draft('d2', { originalDate: '2026-10-04' })])
  expect(nativeChoices.map(item => item.Transcript)).toEqual(['Continuar seção opção 1.', 'Continuar seção opção 2.', 'Confirmar comando.'])
  for (const [index, id] of [[0, 'd1'], [1, 'd2']]) {
    const proposal = await parse(page, nativeChoices[index].Transcript)
    expect(proposal.status).toBe('draft')
    expect(proposal.intent.target.record).toBe(`draft:${id}`)
  }
  expect(await page.evaluate(() => window.resumed)).toEqual([])
  expect(await apply(page, await parse(page, nativeChoices[1].Transcript))).toBeNull()
  expect(await page.evaluate(() => window.resumed)).toEqual(['d2'])
})

test('DOM: ações/rótulos iguais de records diferentes não são deduplicados', async ({ page }) => {
  await dom(page)
  await buttons(page).evaluate(element => {
    const twin = element.cloneNode(true)
    twin.setAttribute('data-voice-record', 'draft:d2'); twin.setAttribute('data-voice-resume-draft', 'd2')
    element.parentElement.append(twin)
  })
  expect((await parse(page, `Retomar rascunho ${spoken}`)).status).toBe('clarification')
  expect((await parse(page, 'Clicar em Retomar rascunho 2026-10-03')).status).toBe('clarification')
  expect((await parse(page, 'Continuar sessão opção um')).status).toBe('clarification')
})

for (const attribute of ['hidden', 'disabled', 'data-voice-record', 'data-voice-epoch', 'data-voice-resume-patient', 'data-voice-resume-draft', 'data-voice-resume-date', 'data-voice-resume-option', 'data-voice-resume-needs-option']) {
  test(`DOM: revalida proposta após alteração de ${attribute}`, async ({ page }) => {
    await dom(page)
    const proposal = await parse(page, `Retomar rascunho ${spoken}`)
    expect(proposal.status).toBe('draft')
    const optionProposal = await parse(page, 'Continuar sessão opção um')
    expect(optionProposal.status).toBe('draft')
    await buttons(page).evaluate((element, attribute) => element.setAttribute(attribute, ['hidden', 'disabled'].includes(attribute) ? '' : 'changed'), attribute)
    expect(await apply(page, proposal)).toContain('A tela mudou')
    expect(await apply(page, optionProposal)).toContain('A tela mudou')
    expect(await page.evaluate(() => window.resumed)).toEqual([])
  })
}

test('DesktopSessions: proposta não retoma; aplicar usa selectDraft sem gravar/criar/finalizar', async ({ page }) => {
  await mount(page, { items: [draft(), draft('d2', { originalDate: '2026-10-04' })] })
  await expect(buttons(page).first()).toHaveText('Retomar rascunho 2026-10-03 · opção 1')
  await expect(buttons(page).nth(1)).toHaveText('Retomar rascunho 2026-10-04 · opção 2')
  const proposal = await parse(page, `Clicar em Retomar rascunho ${spoken}`)
  expect(proposal.status).toBe('draft')
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toHaveCount(0)
  expect(await page.evaluate(() => window.resumeHarness.selections)).toEqual([])
  await unchanged(page)
  expect(await apply(page, proposal)).toBeNull()
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toHaveAttribute('data-voice-record', 'd1')
  await expect(page.getByLabel('Observações descritivas')).toHaveValue('Texto preservado d1')
  expect(await page.evaluate(() => window.resumeHarness.selections)).toEqual(['d1'])
  await unchanged(page)
})

test('DesktopSessions: data repetida só retoma opção exata, sem persistir', async ({ page }) => {
  await mount(page, { items: [draft(), draft('d2')] })
  expect((await parse(page, `Retomar rascunho ${spoken}`)).status).toBe('clarification')
  const proposal = await parse(page, nativeChoices[1].Transcript)
  expect(proposal.status).toBe('draft')
  expect(await apply(page, proposal)).toBeNull()
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toHaveAttribute('data-voice-record', 'd2')
  await expect(page.getByLabel('Observações descritivas')).toHaveValue('Texto preservado d2')
  await unchanged(page)
})

test('DesktopSessions: gaveta fechada e workspace inativo recusam; retorno invalida epoch', async ({ page }) => {
  await mount(page)
  const proposal = await parse(page, `Retomar rascunho ${spoken}`)
  expect(proposal.status).toBe('draft')
  await page.locator('#session-other-drafts > summary').click()
  expect((await parse(page, `Retomar rascunho ${spoken}`)).status).toBe('clarification')
  expect(await apply(page, proposal)).toContain('A tela mudou')
  await page.locator('#session-other-drafts > summary').click()
  await page.evaluate(() => window.resumeHarness.setWorkspace(false))
  await expect(buttons(page)).toBeDisabled()
  expect((await parse(page, `Retomar rascunho ${spoken}`)).status).toBe('clarification')
  await page.evaluate(() => window.resumeHarness.setWorkspace(true))
  await expect(buttons(page)).toBeEnabled()
  expect(await apply(page, proposal)).toContain('A tela mudou')
  await unchanged(page)
})

test('DesktopSessions: troca/carga/retorno de paciente não aplica proposta antiga', async ({ page }) => {
  await mount(page, { items: [draft(), draft('bia1', { patientId: 'bia', originalDate: '2026-10-04' })] })
  const proposal = await parse(page, `Retomar rascunho ${spoken}`)
  expect(proposal.status).toBe('draft')
  await page.evaluate(() => { window.resumeHarness.deferred = true; window.resumeHarness.setPatient('bia') })
  await expect(buttons(page)).toHaveCount(0)
  expect((await parse(page, `Retomar rascunho ${spoken}`)).status).toBe('clarification')
  expect(await apply(page, proposal)).toContain('A tela mudou')
  await page.evaluate(() => { window.resumeHarness.deferred = false; window.resumeHarness.pending.splice(0).forEach(resolve => resolve()) })
  await expect(buttons(page)).toHaveCount(1)
  await page.evaluate(() => window.resumeHarness.setPatient('ana'))
  await expect(buttons(page)).toHaveAttribute('data-voice-resume-patient', 'ana')
  expect(await apply(page, proposal)).toContain('A tela mudou')
  expect((await parse(page, `Retomar rascunho ${spoken}`)).status).toBe('draft')
  await unchanged(page)
})

test('DesktopSessions: remontagem com mesmo draftID invalida proposta antiga', async ({ page }) => {
  await mount(page)
  const proposal = await parse(page, `Retomar rascunho ${spoken}`)
  expect(proposal.status).toBe('draft')
  await page.evaluate(() => window.resumeHarness.setDraft({ ...window.resumeHarness.data.drafts[0], id: 'active-other' }))
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toHaveAttribute('data-voice-record', 'active-other')
  await page.locator('#session-other-drafts > summary').click()
  expect(await apply(page, proposal)).toContain('A tela mudou')
  await unchanged(page)
})
