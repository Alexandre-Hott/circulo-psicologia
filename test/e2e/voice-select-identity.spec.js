import { expect, test } from '@playwright/test'

// Focused gateway proof: do not apply a previously reviewed choice after its
// options are removed, disabled, renamed or relabeled to identify another item.
for (const change of ['removed', 'disabled', 'renamed']) {
  test(`seleção por voz recusa opção ${change} após preparar proposta`, async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async change => {
      const { parseVoiceInterfaceCommand, applyVoiceInterfaceCommand } = await import('/src/voiceInterfaceCommands.js')
      const fixture = document.createElement('section')
      fixture.innerHTML = '<label>Paciente <select><option value="a">Ana · opção 1</option><option value="b">Ana · opção 2</option></select></label>'
      document.body.append(fixture)
      const prepared = parseVoiceInterfaceCommand('Selecionar Paciente como Ana opção dois', fixture)
      const selected = fixture.querySelector('option[value="b"]')
      if (change === 'removed') selected.remove()
      else if (change === 'disabled') selected.disabled = true
      else selected.textContent = 'Outra pessoa'
      let error = ''
      try { applyVoiceInterfaceCommand(prepared.intent, fixture) } catch (reason) { error = reason.message }
      const value = fixture.querySelector('select').value
      fixture.remove()
      return { error, value }
    }, change)
    expect(result.error).toContain('As opções mudaram')
    expect(result.value).toBe('a')
  })
}

test('reordenar opções mantendo ID e rótulo não muda o alvo', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { parseVoiceInterfaceCommand, applyVoiceInterfaceCommand } = await import('/src/voiceInterfaceCommands.js')
    const fixture = document.createElement('section')
    fixture.innerHTML = '<label>Paciente <select><option value="a">Ana · opção 1</option><option value="b">Ana · opção 2</option></select></label>'
    document.body.append(fixture)
    const prepared = parseVoiceInterfaceCommand('Selecionar Paciente como Ana opção 2', fixture)
    const select = fixture.querySelector('select')
    select.prepend(select.querySelector('option[value="b"]'))
    applyVoiceInterfaceCommand(prepared.intent, fixture)
    const value = select.value
    fixture.remove()
    return value
  })
  expect(result).toBe('b')
})
