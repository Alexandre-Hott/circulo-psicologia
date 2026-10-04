import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const corpus = JSON.parse(readFileSync(new URL('../fixtures/native-voice-clinical-append-20261004.json', import.meta.url), 'utf8'))
const transcript = corpus.find(item => item.Index === 1).Transcript
const audioConfirmation = corpus.find(item => item.Index === 4).Transcript
const warning = 'A captura atingiu 12 segundos e pode estar incompleta. Confira ou complete o texto e clique em Preparar rascunho.'
const guidance = 'Fale um trecho de até 12 segundos'
const center = page => page.locator('#cutoff-host').getByRole('region', { name: 'Comando do Círculo' })
const input = page => center(page).getByLabel('Seu comando')
const prepare = page => center(page).getByRole('button', { name: 'Preparar rascunho', exact: true })
const listen = page => center(page).getByRole('button', { name: 'Ouvir comando' })
const proposal = page => center(page).getByText('Confira a proposta', { exact: true })
const state = page => page.evaluate(() => structuredClone(window.cutoffHarness))

// Real component and parser. Host results/metadata are seeded, not live ASR,
// WAV replay, native IPC or microphone evidence. No vault or persistence exists.
async function mount(page, autoInterpret) {
  await page.goto('/test/e2e/fixtures/voice-command-cutoff-warning.html?autoInterpret=' + autoInterpret)
  await expect(center(page)).toBeVisible()
}

async function capture(page, result) {
  await listen(page).click()
  await expect.poll(() => page.evaluate(() => typeof window.resolveCutoff)).toBe('function')
  await page.evaluate(result => {
    const resolve = window.resolveCutoff
    delete window.resolveCutoff
    resolve(result)
  }, result)
  await expect(listen(page)).toBeEnabled()
}

async function noApplication(page) {
  const current = await state(page)
  expect(current.applies).toEqual([])
  expect(current.writes).toEqual([])
}

for (const autoInterpret of [true, false]) {
  test('cutoff autoInterpret=' + autoInterpret + ': limpa proposta antiga, mantém literal editável e exige Preparar manual', async ({ page }) => {
    await mount(page, autoInterpret)
    const guidanceBeforeCapture = (await center(page).innerText()).includes(guidance)
    await input(page).fill('Abrir Agenda')
    await prepare(page).click()
    await expect(proposal(page)).toBeVisible()
    expect((await state(page)).pending.type).toBe('workspace.open')
    const baselineCalls = (await state(page)).parserCalls.length
    await listen(page).click()
    await expect.poll(() => page.evaluate(() => typeof window.resolveCutoff)).toBe('function')
    const guidanceDuringCapture = (await center(page).innerText()).includes(guidance)
    await page.evaluate(transcript => {
      const resolve = window.resolveCutoff
      delete window.resolveCutoff
      resolve({ transcript, endedBy: 'max-duration', maxDurationMs: 12_000 })
    }, transcript)
    await expect(listen(page)).toBeEnabled()
    await expect(input(page)).toHaveValue(transcript)
    await expect(input(page)).toBeEditable()
    await expect(center(page).getByText(warning, { exact: true })).toBeVisible()
    await expect(proposal(page)).toHaveCount(0)
    const cutoff = await state(page)
    expect(cutoff.pending).toBeNull()
    expect(cutoff.parserCalls).toHaveLength(baselineCalls)
    expect(cutoff.transcribeCalls).toEqual([['Ana Clara']])
    await noApplication(page)
    // Check guidance only after reaching the functional cutoff contract, so a
    // missing hint cannot mask the actual RED behavior under investigation.
    expect(guidanceBeforeCapture).toBe(true)
    expect(guidanceDuringCapture).toBe(true)

    // A separate captured "Confirmar comando." must not apply the OLD draft.
    await capture(page, { transcript: audioConfirmation, endedBy: 'silence', maxDurationMs: 12_000 })
    await noApplication(page)
    expect((await state(page)).pending).toBeNull()
    const edited = 'Preencher procedimentos da sessão de Ana Clara com Texto fictício completado\nLinha manual preservada'
    await input(page).fill(edited)
    await expect(proposal(page)).toHaveCount(0)
    await noApplication(page)
    const beforePrepare = (await state(page)).parserCalls.length
    await prepare(page).click()
    await expect(proposal(page)).toBeVisible()
    const prepared = await state(page)
    expect(prepared.parserCalls).toHaveLength(beforePrepare + 1)
    expect(prepared.parserCalls.at(-1).text).toBe(edited)
    expect(prepared.pending.patch).toEqual({ field: 'procedures', operation: 'replace', value: 'Texto fictício completado\nLinha manual preservada' })
    expect(JSON.stringify(prepared.pending)).not.toContain(warning)
    await noApplication(page)
    await input(page).fill('confirmar')
    await prepare(page).click()
    await expect.poll(() => page.evaluate(() => window.cutoffHarness.applies.length)).toBe(1)
    expect((await state(page)).applies).toEqual([prepared.pending])
    expect((await state(page)).writes).toEqual([])
  })
}

for (const representation of ['legacy-string', 'silence-object']) {
  for (const autoInterpret of [true, false]) {
    test(representation + ' autoInterpret=' + autoInterpret + ': comportamento anterior sem aviso de cutoff', async ({ page }) => {
      await mount(page, autoInterpret)
      const result = representation === 'legacy-string' ? transcript : { transcript, endedBy: 'silence', maxDurationMs: 12_000 }
      await capture(page, result)
      await expect(input(page)).toHaveValue(transcript)
      await expect(center(page).getByText(warning, { exact: true })).toHaveCount(0)
      const captured = await state(page)
      expect(captured.transcribeCalls).toEqual([['Ana Clara']])
      await noApplication(page)
      if (autoInterpret) {
        await expect(proposal(page)).toBeVisible()
        expect(captured.parserCalls).toHaveLength(1)
        expect(captured.parserCalls[0].text).toBe(transcript)
        expect(captured.pending.patch.value).toBe('fez jogo de turnos.')
      } else {
        await expect(proposal(page)).toHaveCount(0)
        expect(captured.parserCalls).toEqual([])
        expect(captured.pending).toBeNull()
        await expect(input(page)).toBeEditable()
        await prepare(page).click()
        await expect(proposal(page)).toBeVisible()
        expect((await state(page)).pending.patch.value).toBe('fez jogo de turnos.')
      }
      await noApplication(page)
    })
  }
}
