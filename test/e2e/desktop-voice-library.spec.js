import { expect, test } from '@playwright/test'

async function openApp(page, multipleDrafts = false, pcm = false) {
  await page.clock.install({ time: new Date('2026-10-03T15:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-03T15:00:00Z'))
  await page.addInitScript(({ multipleDrafts, pcm }) => {
    const clone = value => structuredClone(value)
    const patients = [{ id: 'ana', name: 'Ana Clara', age: 8, revision: 1, archivedAt: null }]
    const behaviors = ['first', 'second'].map(id => ({ id, title: 'Pede ajuda', description: `Descrição ${id}`, version: 1 }))
    const draft = { id: 'draft-ana', patientId: 'ana', originalDate: '2026-10-03', observation: '', procedures: '', outcomeDecision: '', referralClosure: '', behaviorIds: [], indicators: [] }
    const drafts = multipleDrafts ? [draft, { ...clone(draft), id: 'draft-other', originalDate: '2026-10-04' }] : [draft]
    const timeline = [{ id: 'finished', patientId: 'ana', sessionDate: '2026-10-02', start: '15:00', end: '15:50', modality: 'Presencial', observation: 'Observação preservada', procedures: 'Procedimento sintético', outcomeDecision: 'Resultado sintético', behaviors: [{ templateId: 'second', templateVersion: 1, title: 'Pede ajuda', description: 'Descrição second' }], indicators: [], recordedAt: '2026-10-02T19:00:00Z' }]
    const fixture = window.libraryFixture = { patients, behaviors, draft, drafts, timeline, writes: [], unexpected: [] }
    if (pcm) {
      fixture.pcm = { transcripts: [], captures: [], refs: [], mediaRequests: 0, trackStops: 0, contextCloses: 0, sourceDisconnects: 0, processorDisconnects: 0 }
      const media = fixture.pcm
      class SyntheticAudioContext {
        constructor() { this.sampleRate = 8000; this.state = 'running'; this.destination = {} }
        createMediaStreamSource() { return { connect() {}, disconnect() { media.sourceDisconnects++ } } }
        createScriptProcessor() {
          const processor = { onaudioprocess: null, disconnect() { media.processorDisconnects++ } }
          processor.connect = () => queueMicrotask(() => {
            let frames = 0
            const emit = () => {
              if (!processor.onaudioprocess) return
              const amplitude = frames++ < 2 ? 0.1 : 0
              processor.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(4096).fill(amplitude) }, outputBuffer: { getChannelData: () => new Float32Array(4096) } })
              if (processor.onaudioprocess) setTimeout(emit, 200)
            }
            emit()
          })
          return processor
        }
        resume() { return Promise.resolve() }
        close() { this.state = 'closed'; media.contextCloses++; return Promise.resolve() }
      }
      Object.defineProperty(window, 'AudioContext', { configurable: true, value: SyntheticAudioContext })
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
        media.mediaRequests++
        return { getTracks: () => [{ stop() { media.trackStops++ } }] }
      } } })
    }
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      if (pcm && command === 'voice_transcribe') {
        const media = fixture.pcm
        if (Object.keys(args).sort().join('|') !== 'patientNames|sampleRate|samples'
          || args.sampleRate !== 8000 || !Array.isArray(args.samples) || !args.samples.length
          || args.samples.length / args.sampleRate >= 12 || !args.samples.every(Number.isFinite)
          || !args.samples.some(value => value !== 0) || !args.samples.some(value => value === 0)
          || JSON.stringify(args.patientNames) !== JSON.stringify(patients.map(item => item.name))) {
          fixture.unexpected.push('Invalid PCM payload'); throw new Error('Invalid PCM payload')
        }
        const transcript = media.transcripts.shift()
        if (typeof transcript !== 'string' || !transcript.trim()) {
          fixture.unexpected.push('Missing fixed transcript'); throw new Error('Missing fixed transcript')
        }
        media.captures.push({ transcript, sampleCount: args.samples.length, sampleRate: args.sampleRate })
        media.refs.push(args)
        return transcript
      }
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { available: false, dirty: false }
      if (command === 'plugin:updater|check') return null
      if (command === 'patient_list') return clone(patients)
      if (command === 'behavior_list') return clone(behaviors)
      if (['indicator_catalog', 'agenda_list_series', 'agenda_occurrences', 'agenda_history', 'related_party_list', 'session_addendum_list', 'case_context_list'].includes(command)) return []
      if (command === 'session_timeline') return clone(timeline)
      if (command === 'session_draft_list') return clone(drafts)
      if (command === 'session_draft_save') {
        const selected = drafts.find(item => item.id === args.id)
        if (!selected) throw new Error('Rascunho incorreto')
        Object.assign(selected, clone(args.input)); window.libraryFixture.writes.push(clone({ command, args })); return clone(selected)
      }
      if (command === 'behavior_create') {
        const item = { id: `created-${behaviors.length}`, title: args.title, description: args.description, version: 1 }
        behaviors.push(item); window.libraryFixture.writes.push(clone({ command, args })); return clone(item)
      }
      if (command === 'behavior_update') {
        if (pcm && Object.keys(args).sort().join('|') !== 'description|id|title|version') {
          fixture.unexpected.push('Invalid behavior_update keys'); throw new Error('Invalid behavior_update keys')
        }
        const item = behaviors.find(item => item.id === args.id)
        if (!item || item.version !== args.version) throw new Error('Conflito de versão')
        Object.assign(item, { title: args.title, description: args.description, version: item.version + 1 })
        window.libraryFixture.writes.push(clone({ command, args })); return clone(item)
      }
      window.libraryFixture.unexpected.push(command)
      throw new Error(`Invoke sem fixture: ${command}`)
    } }
  }, { multipleDrafts, pcm })
  await page.goto('/')
  await command(page, 'Abrir registros de Ana Clara')
  await command(page, 'Clicar em Biblioteca de comportamentos reutilizáveis')
}

async function propose(page, text) {
  const assistant = page.getByRole('region', { name: 'Comando do Círculo' })
  await assistant.getByLabel('Seu comando').fill(text)
  await assistant.getByRole('button', { name: 'Preparar rascunho' }).click()
}

async function command(page, text) {
  await propose(page, text)
  await expect(page.locator('.voice-command-preview'), text).toBeVisible()
  await propose(page, 'confirmar')
  await page.clock.runFor(32)
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
}

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.libraryFixture?.unexpected || [])).toEqual([])
  if (page.libraryPCMBoundary) {
    expect(page.libraryPCMBoundary).toEqual([])
    const status = await page.evaluate(() => {
      const media = window.libraryFixture.pcm
      return { queued: media.transcripts, count: media.captures.length,
        releases: [media.mediaRequests, media.trackStops, media.contextCloses, media.sourceDisconnects, media.processorDisconnects],
        cleared: media.refs.every(args => args.samples.every(sample => sample === 0) && args.patientNames.every(name => name === '')) }
    })
    expect(status.queued).toEqual([])
    expect(status.releases).toEqual(Array(5).fill(status.count))
    expect(status.cleared).toBe(true)
  }
})

async function libraryAudio(page, text) {
  const assistant = page.getByRole('region', { name: 'Comando do Círculo', exact: true })
  const before = await page.evaluate(() => window.libraryFixture.pcm.captures.length)
  await page.evaluate(transcript => window.libraryFixture.pcm.transcripts.push(transcript), text)
  const listen = assistant.getByRole('button', { name: 'Ouvir comando', exact: true })
  await expect(listen).toBeEnabled()
  await listen.click()
  await expect(listen).toBeDisabled()
  await page.clock.runFor(1600)
  await expect(listen).toBeEnabled()
  await expect.poll(() => page.evaluate(() => window.libraryFixture.pcm.captures.length)).toBe(before + 1)
  await expect(assistant.getByLabel('Seu comando')).toHaveValue(text)
  await expect(assistant).not.toContainText('pode estar incompleta')
}

test('PCM: comportamentos homônimos recusam ambiguidade e salvam somente second versão 1', async ({ page, baseURL }) => {
  page.libraryPCMBoundary = []
  page.on('dialog', async dialog => { page.libraryPCMBoundary.push(`native dialog: ${dialog.type()}`); await dialog.dismiss() })
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) await route.continue()
    else { page.libraryPCMBoundary.push(route.request().url()); await route.abort() }
  })
  await openApp(page, false, true)
  const snapshot = () => page.evaluate(() => {
    const { patients, behaviors, draft, drafts, timeline, writes } = window.libraryFixture
    return structuredClone({ patients, behaviors, draft, drafts, timeline, writes })
  })
  const original = await snapshot()
  const editor = page.getByRole('form', { name: 'Comportamento reutilizável', exact: true })
  const preview = page.locator('.voice-command-preview')
  await libraryAudio(page, 'Editar comportamento Pede ajuda')
  await expect(preview).toHaveCount(0)
  await expect(page.locator('.voice-command-error')).toBeVisible()
  await expect(editor).toHaveAttribute('data-voice-record', 'behavior:new')
  await libraryAudio(page, 'Confirmar')
  await expect(preview).toHaveCount(0)
  await expect(editor).toHaveAttribute('data-voice-record', 'behavior:new')
  expect(await snapshot()).toEqual(original)

  await libraryAudio(page, 'Clicar em Editar comportamento Pede ajuda opção dois')
  await expect(preview).toContainText('Confira a proposta')
  await expect(editor).toHaveAttribute('data-voice-record', 'behavior:new')
  expect(await snapshot()).toEqual(original)
  await libraryAudio(page, 'Confirmar')
  await expect(preview).toHaveCount(0)
  await expect(editor).toHaveAttribute('data-voice-record', 'behavior:second')
  await expect(editor).toHaveAttribute('data-voice-epoch', '1')
  await expect(editor.getByLabel('Título descritivo')).toHaveValue('Pede ajuda')
  await expect(editor.getByLabel('Descrição opcional')).toHaveValue('Descrição second')
  expect(await snapshot()).toEqual(original)

  const description = 'Descrição nova sintética do segundo comportamento'
  await libraryAudio(page, `Preencher Descrição opcional com ${description}`)
  await expect(preview).toContainText(description)
  await expect(editor.getByLabel('Descrição opcional')).toHaveValue('Descrição second')
  expect(await snapshot()).toEqual(original)
  await libraryAudio(page, 'Confirmar')
  await expect(editor.getByLabel('Descrição opcional')).toHaveValue(description)
  await expect(editor).toHaveAttribute('data-voice-record', 'behavior:second')
  expect(await snapshot()).toEqual(original)

  await libraryAudio(page, 'Clicar em Salvar versão do comportamento')
  await expect(preview).toContainText('Confira a proposta')
  expect(await snapshot()).toEqual(original)
  await libraryAudio(page, 'Confirmar')
  await expect(preview).toHaveCount(0)
  const expectedWrite = { command: 'behavior_update', args: { id: 'second', version: 1, title: 'Pede ajuda', description } }
  await expect.poll(snapshot).toEqual({
    ...original, behaviors: [original.behaviors[0], { ...original.behaviors[1], description, version: 2 }], writes: [expectedWrite],
  })
  const second = page.locator('#session-behaviors li[data-voice-record="behavior:second"]')
  await expect(second).toHaveAttribute('data-voice-epoch', '2')
  await expect(second).toContainText('Pede ajuda · v2')
  await expect(second).toContainText(description)
  await expect(page.locator('#session-behaviors li[data-voice-record="behavior:first"]')).toHaveAttribute('data-voice-epoch', '1')
  await command(page, 'Clicar em Evolução e escalas registradas · Adicionar adendo')
  await expect(page.locator('[data-voice-record="session:finished"]')).toContainText('Pede ajuda · v1 · Descrição second')
  expect((await snapshot()).timeline).toEqual(original.timeline)
  expect((await snapshot()).writes).toEqual([expectedWrite])
})

test('PCM: pausa no header cria e edita ID único sem reparar título ou descrição', async ({ page, baseURL }) => {
  page.libraryPCMBoundary = []
  page.on('dialog', async dialog => { page.libraryPCMBoundary.push(`native dialog: ${dialog.type()}`); await dialog.dismiss() })
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) await route.continue()
    else { page.libraryPCMBoundary.push(route.request().url()); await route.abort() }
  })
  await openApp(page, false, true)
  const snapshot = () => page.evaluate(() => {
    const { patients, behaviors, draft, drafts, timeline, writes } = window.libraryFixture
    return structuredClone({ patients, behaviors, draft, drafts, timeline, writes })
  })
  const original = await snapshot()
  const editor = page.getByRole('form', { name: 'Comportamento reutilizável', exact: true })
  const preview = page.locator('.voice-command-preview')
  const title = 'Solicita, apoio!'
  const description = 'Texto SINTÉTICO: "confirmar", salvar; não interpretar!'
  for (const pause of ['.', ',']) {
    await libraryAudio(page, `Editar comportamento${pause} Pede ajuda`)
    await expect(preview).toHaveCount(0)
    await expect(page.locator('.voice-command-error')).toBeVisible()
    await libraryAudio(page, 'Confirmar')
    await expect(preview).toHaveCount(0)
    await expect(editor).toHaveAttribute('data-voice-record', 'behavior:new')
    expect(await snapshot()).toEqual(original)
  }
  await libraryAudio(page, `Criar comportamento. ${title} com descrição ${description}`)
  await expect(preview).toContainText(title)
  await expect(editor.getByLabel('Título descritivo')).toHaveValue('')
  await expect(editor.getByLabel('Descrição opcional')).toHaveValue('')
  expect(await snapshot()).toEqual(original)
  await libraryAudio(page, 'Confirmar')
  await expect(editor.getByLabel('Título descritivo')).toHaveValue(title)
  await expect(editor.getByLabel('Descrição opcional')).toHaveValue(description)
  expect(await snapshot()).toEqual(original)
  await libraryAudio(page, 'Salvar comportamento')
  await expect(preview).toContainText('Confira a proposta')
  expect(await snapshot()).toEqual(original)
  await libraryAudio(page, 'Confirmar')
  const created = { id: 'created-2', title, description, version: 1 }
  const createWrite = { command: 'behavior_create', args: { title, description } }
  const afterCreate = { ...original, behaviors: [...original.behaviors, created], writes: [createWrite] }
  await expect.poll(snapshot).toEqual(afterCreate)

  await libraryAudio(page, `Editar comportamento. ${title}`)
  await expect(preview).toContainText('Confira a proposta')
  expect(await snapshot()).toEqual(afterCreate)
  await libraryAudio(page, 'Confirmar')
  await expect(editor).toHaveAttribute('data-voice-record', 'behavior:created-2')
  await expect(editor).toHaveAttribute('data-voice-epoch', '1')
  await expect(editor.getByLabel('Título descritivo')).toHaveValue(title)
  await expect(editor.getByLabel('Descrição opcional')).toHaveValue(description)
  const revised = 'Descrição REVISADA: "voltar", confirmar; manter pontuação!'
  await libraryAudio(page, `Editar comportamento, ${title} com descrição ${revised}`)
  await expect(preview).toContainText(title)
  await expect(editor.getByLabel('Descrição opcional')).toHaveValue(description)
  expect(await snapshot()).toEqual(afterCreate)
  await libraryAudio(page, 'Confirmar')
  await expect(page.getByRole('alertdialog', { name: 'Confirmar ação' })).toContainText('Substituir os campos não salvos da biblioteca pelo pedido de voz?')
  await expect(editor.getByLabel('Descrição opcional')).toHaveValue(description)
  expect(await snapshot()).toEqual(afterCreate)
  await libraryAudio(page, 'Confirmar')
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(editor).toHaveAttribute('data-voice-record', 'behavior:created-2')
  await expect(editor.getByLabel('Título descritivo')).toHaveValue(title)
  await expect(editor.getByLabel('Descrição opcional')).toHaveValue(revised)
  expect(await snapshot()).toEqual(afterCreate)
  await libraryAudio(page, 'Salvar comportamento')
  await expect(preview).toContainText('Confira a proposta')
  expect(await snapshot()).toEqual(afterCreate)
  await libraryAudio(page, 'Confirmar')
  await expect.poll(snapshot).toEqual({
    ...original, behaviors: [...original.behaviors, { ...created, description: revised, version: 2 }],
    writes: [createWrite, { command: 'behavior_update', args: { id: created.id, version: 1, title, description: revised } }],
  })
})

test('salvar comportamento recusa modos concorrentes sem escolher o primeiro botão', async ({ page }) => {
  await openApp(page)
  await command(page, 'Criar comportamento Solicita pausa')
  await page.evaluate(() => {
    const extra = document.createElement('button')
    extra.type = 'button'; extra.textContent = 'Salvar versão do comportamento'
    document.querySelector('#session-behaviors form').append(extra)
  })
  await propose(page, 'Salvar comportamento')
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  await expect(page.getByText(/Há mais de uma opção “Salvar comportamento”/u)).toBeVisible()
  expect(await page.evaluate(() => window.libraryFixture.writes)).toEqual([])
})

test('salvar comportamento preparado para criação não salva o editor aberto depois', async ({ page }) => {
  await openApp(page)
  await command(page, 'Criar comportamento Solicita pausa')
  await propose(page, 'Salvar comportamento')
  await expect(page.locator('.voice-command-preview')).toBeVisible()
  await page.getByRole('button', { name: 'Editar comportamento Pede ajuda · opção 1', exact: true }).click()
  await propose(page, 'confirmar')
  await expect(page.getByText('A tela mudou. Prepare o comando novamente antes de aplicar.')).toBeVisible()
  await expect(page.getByLabel('Título descritivo')).toHaveValue('Pede ajuda')
  expect(await page.evaluate(() => window.libraryFixture.writes)).toEqual([])
})

test('criar e editar comportamento por voz atualiza catálogo e exige salvar a seleção', async ({ page }) => {
  await openApp(page)
  const originalTimeline = await page.evaluate(() => window.libraryFixture.timeline)
  await propose(page, 'Criar comportamento Solicita pausa com descrição Pede um intervalo durante a atividade.')
  await expect(page.locator('.voice-command-preview')).toBeVisible()
  expect(await page.evaluate(() => window.libraryFixture.writes)).toEqual([])
  await propose(page, 'confirmar')
  await expect(page.getByLabel('Título descritivo')).toHaveValue('Solicita pausa')
  await expect(page.getByLabel('Descrição opcional')).toHaveValue('Pede um intervalo durante a atividade.')
  expect(await page.evaluate(() => window.libraryFixture.writes)).toEqual([])
  await command(page, 'Salvar comportamento')
  expect(await page.evaluate(() => window.libraryFixture.writes)).toEqual([{ command: 'behavior_create', args: { title: 'Solicita pausa', description: 'Pede um intervalo durante a atividade.' } }])
  await propose(page, 'Editar comportamento Solicita pausa com descrição Pede um intervalo curto durante a atividade.')
  await expect(page.locator('.voice-command-preview')).toBeVisible()
  expect(await page.evaluate(() => window.libraryFixture.writes)).toHaveLength(1)
  await propose(page, 'confirmar')
  await expect(page.getByLabel('Descrição opcional')).toHaveValue('Pede um intervalo curto durante a atividade.')
  expect(await page.evaluate(() => window.libraryFixture.writes)).toHaveLength(1)
  await command(page, 'Salve o comportamento')
  expect(await page.evaluate(() => window.libraryFixture.writes[1])).toEqual({ command: 'behavior_update', args: { id: 'created-2', version: 1, title: 'Solicita pausa', description: 'Pede um intervalo curto durante a atividade.' } })
  await command(page, 'Clicar em Retomar sessão de 2026-10-03')
  await propose(page, 'Marcar comportamento Solicita pausa para Ana Clara na sessão')
  await expect(page.locator('.voice-command-preview')).toBeVisible()
  await page.clock.runFor(800)
  expect(await page.evaluate(() => window.libraryFixture.writes.map(item => item.command))).toEqual(['behavior_create', 'behavior_update'])
  expect(await page.evaluate(() => window.libraryFixture.draft.behaviorIds)).toEqual([])
  await propose(page, 'confirmar')
  await expect(page.getByRole('checkbox', { name: 'Solicita pausa · v2', exact: true })).toBeChecked()
  await page.clock.runFor(800)
  expect(await page.evaluate(() => window.libraryFixture.writes.filter(item => item.command === 'session_draft_save'))).toEqual([])
  expect(await page.evaluate(() => window.libraryFixture.draft.behaviorIds)).toEqual([])
  await command(page, 'Clicar em Salvar rascunho')
  expect(await page.evaluate(() => window.libraryFixture.draft.behaviorIds)).toEqual(['created-2'])
  expect(await page.evaluate(() => window.libraryFixture.writes.map(item => item.command))).toEqual(['behavior_create', 'behavior_update', 'session_draft_save'])
  await command(page, 'Clicar em Evolução e escalas registradas · Adicionar adendo')
  await expect(page.locator('[data-voice-record="session:finished"]')).toContainText('Pede ajuda · v1 · Descrição second')
  await expect(page.locator('[data-voice-record="session:finished"]')).not.toContainText('Solicita pausa')
  expect(await page.evaluate(() => window.libraryFixture.timeline)).toEqual(originalTimeline)
})

test('biblioteca com títulos iguais: editar opção exata, cancelar e preservar snapshot', async ({ page }) => {
  await openApp(page)
  const originalTimeline = await page.evaluate(() => window.libraryFixture.timeline)
  await propose(page, 'Editar comportamento Pede ajuda')
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  await command(page, 'Clicar em Editar comportamento Pede ajuda · opção 2')
  await expect(page.getByLabel('Descrição opcional')).toHaveValue('Descrição second')
  await command(page, 'Preencher Descrição opcional com Descrição nova sintética')
  await command(page, 'Clicar em Salvar versão do comportamento')
  expect(await page.evaluate(() => window.libraryFixture.writes)).toEqual([{ command: 'behavior_update', args: { id: 'second', version: 1, title: 'Pede ajuda', description: 'Descrição nova sintética' } }])
  await command(page, 'Clicar em Editar comportamento Pede ajuda · opção 1')
  await command(page, 'Preencher Título descritivo com Texto a descartar')
  await command(page, 'Clicar em Cancelar edição')
  await expect(page.getByLabel('Título descritivo')).toHaveValue('')
  expect(await page.evaluate(() => window.libraryFixture.writes)).toHaveLength(1)
  expect(await page.evaluate(() => window.libraryFixture.timeline)).toEqual(originalTimeline)
  expect(await page.evaluate(() => window.libraryFixture.behaviors[0])).toEqual({ id: 'first', title: 'Pede ajuda', description: 'Descrição first', version: 1 })
  await command(page, 'Clicar em Evolução e escalas registradas · Adicionar adendo')
  await expect(page.locator('[data-voice-record="session:finished"]')).toContainText('Pede ajuda · v1 · Descrição second')
})

test('selecionar/desmarcar comportamento repetido grava somente ID da opção escolhida', async ({ page }) => {
  await openApp(page)
  await command(page, 'Clicar em Retomar sessão de 2026-10-03')
  await command(page, 'Marcar Pede ajuda · v1 · opção 2')
  await command(page, 'Clicar em Salvar rascunho')
  expect(await page.evaluate(() => window.libraryFixture.draft.behaviorIds)).toEqual(['second'])
  await command(page, 'Desmarcar Pede ajuda · v1 · opção 2')
  await command(page, 'Marcar Pede ajuda · v1 · opção 1')
  await command(page, 'Clicar em Salvar rascunho')
  expect(await page.evaluate(() => window.libraryFixture.draft.behaviorIds)).toEqual(['first'])
})

test('proposta de campo da biblioteca não muda outro comportamento após troca do editor', async ({ page }) => {
  await openApp(page)
  await command(page, 'Clicar em Editar comportamento Pede ajuda · opção 1')
  await propose(page, 'Preencher Descrição opcional com Não deve ser aplicado')
  await expect(page.locator('.voice-command-preview')).toBeVisible()
  // Deliberate intervening click reproduces a user changing the target before confirming.
  await page.getByRole('button', { name: 'Editar comportamento Pede ajuda · opção 2', exact: true }).click()
  await propose(page, 'confirmar')
  await expect(page.getByLabel('Descrição opcional')).toHaveValue('Descrição second')
  await expect(page.getByText('A tela mudou. Prepare o comando novamente antes de aplicar.')).toBeVisible()
  expect(await page.evaluate(() => window.libraryFixture.writes)).toEqual([])
})

test('proposta de comportamento não atravessa a troca de rascunho', async ({ page }) => {
  await openApp(page, true)
  await command(page, 'Clicar em Outros rascunhos do paciente')
  await command(page, 'Clicar em Retomar rascunho 2026-10-03')
  // The selected draft remounts the workspace, so reopen its collapsed chooser.
  await command(page, 'Clicar em Outros rascunhos do paciente')
  await propose(page, 'Marcar Pede ajuda · v1 · opção 2')
  await expect(page.locator('.voice-command-preview')).toBeVisible()
  await page.getByRole('button', { name: 'Retomar rascunho 2026-10-04 · opção 2', exact: true }).click()
  await propose(page, 'confirmar')
  await expect(page.getByText('A tela mudou. Prepare o comando novamente antes de aplicar.')).toBeVisible()
  await expect(page.getByLabel('Pede ajuda · v1 · opção 2', { exact: true })).not.toBeChecked()
  expect(await page.evaluate(() => window.libraryFixture.drafts.map(item => item.behaviorIds))).toEqual([[], []])
  expect(await page.evaluate(() => window.libraryFixture.writes)).toEqual([])
})
