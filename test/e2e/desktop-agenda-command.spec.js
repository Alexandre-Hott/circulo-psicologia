import { expect, test } from '@playwright/test'

const setup = async (page, speech = 'unsupported') => {
  await page.clock.install({ time: new Date('2026-10-05T12:00:00Z') })
  await page.addInitScript(mode => {
    window.createdSeries = 0
    window.voiceStarts = 0
    window.voiceAborts = 0
    if (mode === 'fake') {
      window.SpeechRecognition = class {
        start() { window.voiceStarts++; window.mockRecognition = this }
        abort() { window.voiceAborts++ }
      }
    } else {
      window.SpeechRecognition = undefined
      window.webkitSpeechRecognition = undefined
    }
    const patients = [{ id: 'p1', name: 'Ana Clara', archivedAt: null }, { id: 'p2', name: 'João Silva', archivedAt: null }, { id: 'p3', name: 'João Silva', archivedAt: null }]
    window.__TAURI_INTERNALS__ = { invoke: async (command) => {
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { available: false, dirty: false }
      if (command === 'patient_list') return patients
      if (command === 'agenda_list_series' || command === 'agenda_occurrences' || command === 'agenda_history') return []
      if (command === 'agenda_create_series') { window.createdSeries++; return { id: 'created' } }
      if (command === 'plugin:updater|check') return null
      return null
    } }
  }, speech)
  await page.goto('/')
  await page.getByRole('button', { name: 'Abrir Agenda' }).click()
  await page.getByRole('region', { name: 'Novo compromisso' }).getByRole('button', { name: 'Novo compromisso' }).click()
}

test('texto interpreta, preenche e exige envio explícito', async ({ page }) => {
  await setup(page)
  const form = page.getByRole('form', { name: 'Novo compromisso' })
  const command = page.getByRole('region', { name: 'Comando de agendamento' })
  await expect(command.getByText(/pode enviar áudio para reconhecimento/)).toBeVisible()
  await command.getByRole('textbox', { name: 'Comando de agendamento' }).fill('Marcar toda quinta para Ana Clara às 15')
  await command.getByRole('button', { name: 'Interpretar comando' }).click()
  await expect(form.getByLabel('Tipo')).toHaveValue('Recorrente')
  await expect(form.getByLabel('Paciente')).toHaveValue('p1')
  await expect(form.getByLabel('Dia da semana')).toHaveValue('4')
  await expect(form.getByLabel('Horário inicial')).toHaveValue('15:00')
  await expect(form.getByLabel('Horário final')).toHaveValue('15:50')
  await expect(command.getByRole('status')).toContainText('Confira antes de salvar')
  await expect.poll(() => page.evaluate(() => window.createdSeries)).toBe(0)
  await command.getByRole('textbox', { name: 'Comando de agendamento' }).fill('Abrir agenda')
  await command.getByRole('button', { name: 'Interpretar comando' }).click()
  await expect(command.getByRole('alert')).toContainText('Comando não reconhecido')
  await expect(form.getByLabel('Horário inicial')).toHaveValue('15:00')
  await command.getByRole('textbox', { name: 'Comando de agendamento' }).fill('Marcar quinzenal para Ana Clara quinta às 15')
  await command.getByRole('button', { name: 'Interpretar comando' }).click()
  await expect(command.getByRole('alert')).toContainText('Recorrência quinzenal não é interpretada')
  await expect(form.getByLabel('Horário inicial')).toHaveValue('15:00')
  await command.getByRole('textbox', { name: 'Comando de agendamento' }).fill('Marcar para Ana Clara dia 06/10/2026 às 16 não')
  await command.getByRole('button', { name: 'Interpretar comando' }).click()
  await expect(command.getByRole('alert')).toContainText('Comando negado')
  await expect(form.getByLabel('Horário inicial')).toHaveValue('15:00')
  await command.getByRole('textbox', { name: 'Comando de agendamento' }).fill('Marcar para Ana Clara dia 06/10/2026 às 3')
  await command.getByRole('button', { name: 'Interpretar comando' }).click()
  await expect(form.getByLabel('Horário inicial')).toHaveValue('')
  await expect(command.getByRole('status')).toContainText('Horário de 1 a 12 é ambíguo')
  await expect.poll(() => page.evaluate(() => window.createdSeries)).toBe(0)
})

test('nome ambíguo exige escolha por ID; campos ausentes não herdam padrões', async ({ page }) => {
  await setup(page)
  const form = page.getByRole('form', { name: 'Novo compromisso' })
  const command = page.getByRole('region', { name: 'Comando de agendamento' })
  await command.getByRole('textbox', { name: 'Comando de agendamento' }).fill('Marcar semanal para João Silva quinta às 15')
  await command.getByRole('button', { name: 'Interpretar comando' }).click()
  await expect(form.getByLabel('Paciente')).toHaveValue('')
  await expect(command.getByRole('button', { name: 'João Silva · ID p2' })).toBeVisible()
  await expect(command.getByRole('button', { name: 'João Silva · ID p3' })).toBeVisible()
  await command.getByRole('button', { name: 'João Silva · ID p3' }).click()
  await expect(form.getByLabel('Paciente')).toHaveValue('p3')
  await command.getByRole('textbox', { name: 'Comando de agendamento' }).fill('adiciona uma sessão aí semanal pra Ana Clara')
  await command.getByRole('button', { name: 'Interpretar comando' }).click()
  await expect(form.getByLabel('Paciente')).toHaveValue('p1')
  await expect(form.getByLabel('Dia da semana')).toHaveValue('')
  await expect(form.getByLabel('Horário inicial')).toHaveValue('')
  await expect(form.getByLabel('Horário final')).toHaveValue('')
  await expect(command.getByRole('status')).toContainText('dia da semana, horário')
  await expect.poll(() => page.evaluate(() => window.createdSeries)).toBe(0)
})

test('microfone indisponível e erro de permissão são claros; escuta termina ao recolher', async ({ page }) => {
  await setup(page)
  const command = page.getByRole('region', { name: 'Comando de agendamento' })
  await command.getByRole('button', { name: 'Ditar comando de agendamento' }).click()
  await expect(command.getByRole('alert')).toContainText('não oferece reconhecimento de voz')
  await page.evaluate(() => {
    window.SpeechRecognition = class {
      start() { window.voiceStarts++; window.mockRecognition = this }
      abort() { window.voiceAborts++ }
    }
  })
  await command.getByRole('button', { name: 'Ditar comando de agendamento' }).click()
  await expect(command.getByRole('button', { name: 'Ditar comando de agendamento' })).toBeDisabled()
  await expect.poll(() => page.evaluate(() => window.voiceStarts)).toBe(1)
  await page.evaluate(() => window.mockRecognition.onerror({ error: 'not-allowed' }))
  await expect(command.getByRole('alert')).toContainText('Microfone não autorizado')
  await command.getByRole('button', { name: 'Ditar comando de agendamento' }).click()
  await page.evaluate(() => window.mockRecognition.onerror({ error: 'network' }))
  await expect(command.getByRole('alert')).toContainText('indisponível pela rede')
  await command.getByRole('button', { name: 'Ditar comando de agendamento' }).click()
  await page.evaluate(() => window.mockRecognition.onresult({ results: [[{ transcript: 'Marcar pra Ana Clara dia 06/10/2026 às 15' }]] }))
  await expect(command.getByRole('textbox', { name: 'Comando de agendamento' })).toHaveValue('Marcar pra Ana Clara dia 06/10/2026 às 15')
  await expect(page.getByRole('form', { name: 'Novo compromisso' }).getByLabel('Data do compromisso')).toHaveValue('2026-10-06')
  await page.getByRole('region', { name: 'Novo compromisso' }).getByRole('button', { name: 'Novo compromisso' }).click()
  await expect.poll(() => page.evaluate(() => window.voiceAborts)).toBe(3)
  await expect.poll(() => page.evaluate(() => window.createdSeries)).toBe(0)
  await page.getByRole('region', { name: 'Novo compromisso' }).getByRole('button', { name: 'Novo compromisso' }).click()
  await command.getByRole('button', { name: 'Ditar comando de agendamento' }).click()
  await page.getByRole('button', { name: 'Bloquear' }).click()
  await expect.poll(() => page.evaluate(() => window.voiceAborts)).toBe(4)
})

test('sair da Agenda aborta microfone e ignora resultado tardio', async ({ page }) => {
  await setup(page, 'fake')
  const command = page.getByRole('region', { name: 'Comando de agendamento' })
  await command.getByRole('button', { name: 'Ditar comando de agendamento' }).click()
  await page.evaluate(() => { window.lateVoiceResult = window.mockRecognition.onresult })
  await page.getByRole('navigation', { name: 'Espaços do Círculo' }).getByRole('button', { name: 'Pacientes' }).click()
  await expect.poll(() => page.evaluate(() => window.voiceAborts)).toBe(1)
  await page.evaluate(() => window.lateVoiceResult({ results: [[{ transcript: 'Marcar para Ana Clara dia 06/10/2026 às 15' }]] }))
  await page.getByRole('button', { name: 'Abrir Agenda' }).click()
  await expect(command.getByRole('textbox', { name: 'Comando de agendamento' })).toHaveValue('')
  await expect(page.getByRole('form', { name: 'Novo compromisso' }).getByLabel('Horário inicial')).toHaveValue('14:00')
  await expect(command.getByRole('button', { name: 'Ditar comando de agendamento' })).toBeEnabled()
  await expect.poll(() => page.evaluate(() => window.createdSeries)).toBe(0)
})
