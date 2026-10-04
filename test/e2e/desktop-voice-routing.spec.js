import { expect, test } from '@playwright/test'

const openHome = async (page, withSession = false, withMicrophone = false) => {
  await page.clock.install({ time: new Date('2026-10-05T12:00:00Z') })
  await page.addInitScript(({ enableSession, enableMicrophone }) => {
    window.voiceSavedWrites = 0
    window.voiceSavedPatch = null
    window.voiceVaultLocks = 0
    window.voiceTranscribePayload = null
    window.voiceMicrophoneTrackStops = 0
    window.voiceAudioContextCloses = 0
    if (enableMicrophone) {
      class SyntheticAudioContext {
        constructor() { this.sampleRate = 8_000; this.state = 'running'; this.destination = {} }
        createMediaStreamSource() { return { connect() {}, disconnect() {} } }
        createScriptProcessor() {
          const processor = { onaudioprocess: null, disconnect() {} }
          processor.connect = () => queueMicrotask(() => {
            const event = {
              inputBuffer: { getChannelData: () => new Float32Array(4096).fill(0.1) },
              outputBuffer: { getChannelData: () => new Float32Array(4096) },
            }
            const emit = () => {
              if (!processor.onaudioprocess) return
              processor.onaudioprocess(event)
              if (processor.onaudioprocess) setTimeout(emit, 0)
            }
            emit()
          })
          return processor
        }
        resume() { return Promise.resolve() }
        close() { this.state = 'closed'; window.voiceAudioContextCloses++; return Promise.resolve() }
      }
      Object.defineProperty(window, 'AudioContext', { configurable: true, value: SyntheticAudioContext })
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
        getUserMedia: async constraints => {
          window.voiceMicrophoneConstraints = constraints
          return { getTracks: () => [{ stop() { window.voiceMicrophoneTrackStops++ } }] }
        },
      } })
    }
    const patients = [{ id: 'patient-ana', name: 'Ana Clara', age: 8, archivedAt: null }]
    const occurrence = { id: 'occ-ana', seriesId: 'series-ana', patientId: 'patient-ana', date: '2026-10-05', originalDate: '2026-10-05', start: '15:00', end: '15:50', frequency: 'Semanal', modality: 'Presencial', status: 'scheduled', wasRescheduled: false }
    const sessionDraft = { id: 'draft-ana', patientId: 'patient-ana', originalDate: '2026-10-05', observation: '', procedures: '', outcomeDecision: '', referralClosure: '', behaviorIds: [], indicators: [] }
    window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
      if (command === 'vault_status') return { initialized: true, unlocked: true, profileState: 'ready' }
      if (command === 'auto_backup_status') return { available: false, dirty: false }
      if (command === 'patient_list') return patients
      if (command === 'voice_transcribe') { window.voiceTranscribePayload = args; return 'Cadastrar paciente Bia de Teste com 8 anos' }
      if (command === 'behavior_list') return enableSession ? [{ id: 'behavior-help', title: 'Pede ajuda', archivedAt: null }] : []
      if (command === 'indicator_catalog') return []
      if (command === 'agenda_list_series' || command === 'agenda_history') return []
      if (command === 'agenda_occurrences') return enableSession ? [occurrence] : []
      if (command === 'session_draft_start') return sessionDraft
      if (['session_draft_list', 'session_timeline', 'session_addendum_list', 'case_context_list'].includes(command)) return []
      if (command === 'session_draft_save') { window.voiceSavedWrites++; window.voiceSavedPatch = args?.input; return { ...sessionDraft, ...args?.input } }
      if (command === 'vault_lock') { window.voiceVaultLocks++; return null }
      if (command === 'patient_create' || command === 'agenda_create_series') { window.voiceSavedWrites++; return {} }
      if (command === 'plugin:updater|check') return null
      return null
    } }
  }, { enableSession: withSession, enableMicrophone: withMicrophone })
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Comando do Círculo' })).toBeVisible()
}

test('Home captura áudio, chama o backend local, mostra texto editável e limpa buffers sem salvar', async ({ page }) => {
  await openHome(page, false, true)
  const command = page.getByRole('region', { name: 'Comando do Círculo' })
  await command.getByRole('button', { name: 'Ouvir e transcrever' }).click()
  const input = command.getByRole('textbox', { name: 'Seu comando' })
  await expect(input).toHaveValue('Cadastrar paciente Bia de Teste com 8 anos')
  await expect(command.getByText('A captura atingiu 12 segundos e pode estar incompleta. Confira ou complete o texto e clique em Preparar rascunho.', { exact: true })).toBeVisible()
  await expect(command.getByText('Confira a proposta', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Revisar no formulário' })).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.voiceTranscribePayload?.sampleRate)).toBe(8_000)
  await expect.poll(() => page.evaluate(() => window.voiceTranscribePayload?.samples?.length)).toBe(96_000)
  await expect.poll(() => page.evaluate(() => window.voiceTranscribePayload?.samples?.every(sample => sample === 0))).toBe(true)
  await expect.poll(() => page.evaluate(() => window.voiceMicrophoneTrackStops)).toBe(1)
  await expect.poll(() => page.evaluate(() => window.voiceAudioContextCloses)).toBe(1)
  await expect.poll(() => page.evaluate(() => window.voiceSavedWrites)).toBe(0)

  await command.getByRole('button', { name: 'Preparar rascunho' }).click()
  await expect(command.getByRole('status').filter({ hasText: 'Confira a proposta' })).toContainText('Bia de Teste')
  await expect.poll(() => page.evaluate(() => window.voiceSavedWrites)).toBe(0)
  await page.getByRole('button', { name: 'Revisar no formulário' }).click()
  await expect(page.getByRole('form', { name: 'Novo cadastro' }).getByLabel('Nome')).toHaveValue('Bia de Teste')
  await expect.poll(() => page.evaluate(() => window.voiceSavedWrites)).toBe(0)
})

test('pedido natural consulta dia, semana e mês da Agenda sem gravar dados', async ({ page }) => {
  await openHome(page)
  const command = page.getByRole('region', { name: 'Comando do Círculo' })
  for (const [text, mode, date] of [
    ['Mostrar agenda de hoje', 'Dia', '2026-10-05'],
    ['Abrir agenda de amanhã', 'Dia', '2026-10-06'],
    ['Mostrar agenda desta semana', 'Semana', '2026-10-05'],
    ['Mostrar agenda deste mês', 'Mês', '2026-10-05'],
    ['Mostrar agenda do dia 10/10/2026', 'Dia', '2026-10-10'],
  ]) {
    await command.getByRole('textbox', { name: 'Seu comando' }).fill(text)
    await command.getByRole('button', { name: 'Preparar rascunho' }).click()
    await page.getByRole('button', { name: 'Revisar no formulário' }).click()
    await expect(page.getByLabel('Data de referência')).toHaveValue(date)
    await expect(page.getByRole('group', { name: 'Visualização da Agenda' }).getByRole('button', { name: mode, exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => page.evaluate(() => window.voiceSavedWrites)).toBe(0)
  }
})

test('demonstração web explica que ditado offline exige o aplicativo Windows', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('complementary', { name: 'Demonstração no navegador' }))
    .toContainText('ditado offline no aplicativo Windows')
})

test('Home prepara paciente, abre formulário preenchido e não salva sem clique explícito', async ({ page }) => {
  await openHome(page)
  const command = page.getByRole('region', { name: 'Comando do Círculo' })
  await command.getByRole('textbox', { name: 'Seu comando' }).fill('Cadastrar paciente Bia de Teste com 8 anos')
  await command.getByRole('button', { name: 'Preparar rascunho' }).click()
  await expect(command.getByRole('status')).toContainText('Bia de Teste')
  await page.getByRole('button', { name: 'Revisar no formulário' }).click()
  const form = page.getByRole('form', { name: 'Novo cadastro' })
  await expect(form.getByLabel('Nome')).toHaveValue('Bia de Teste')
  await expect(form.getByLabel('Nome')).toBeFocused()
  await expect(form.getByLabel('Idade em anos (opcional)')).toHaveValue('8')
  await expect.poll(() => page.evaluate(() => window.voiceSavedWrites)).toBe(0)
})

test('Home remove o botão de revisão quando o pedido preparado é alterado', async ({ page }) => {
  await openHome(page)
  const command = page.getByRole('region', { name: 'Comando do Círculo' })
  const input = command.getByRole('textbox', { name: 'Seu comando' })
  await input.fill('Cadastrar paciente Bia de Teste com 8 anos')
  await command.getByRole('button', { name: 'Preparar rascunho' }).click()
  await expect(page.getByRole('button', { name: 'Revisar no formulário' })).toBeVisible()

  await input.fill('Faça qualquer coisa que achar melhor')
  await expect(page.getByRole('button', { name: 'Revisar no formulário' })).toHaveCount(0)
  await command.getByRole('button', { name: 'Preparar rascunho' }).click()
  await expect(command.getByRole('status')).toContainText('Ainda não reconheço esse comando')
  await expect.poll(() => page.evaluate(() => window.voiceSavedWrites)).toBe(0)
})

test('Home prepara horário semanal e abre Agenda com campos revisáveis sem salvar', async ({ page }) => {
  await openHome(page)
  const command = page.getByRole('region', { name: 'Comando do Círculo' })
  await command.getByRole('textbox', { name: 'Seu comando' }).fill('Marcar sessão semanal para Ana Clara toda quinta às 15 horas')
  await command.getByRole('button', { name: 'Preparar rascunho' }).click()
  await expect(command.getByRole('status')).toContainText('15:00–15:50')
  await page.getByRole('button', { name: 'Revisar no formulário' }).click()
  const form = page.getByRole('form', { name: 'Novo compromisso' })
  await expect(form).toBeFocused()
  await expect(form.getByLabel('Paciente')).toHaveValue('patient-ana')
  await expect(form.getByLabel('Dia da semana')).toHaveValue('4')
  await expect(form.getByLabel('Frequência')).toHaveValue('Semanal')
  await expect(form.getByLabel('Horário inicial')).toHaveValue('15:00')
  await expect(form.getByLabel('Horário final')).toHaveValue('15:50')
  await expect.poll(() => page.evaluate(() => window.voiceSavedWrites)).toBe(0)
})

test('comportamento por voz fica ligado à sessão certa e só aplica após revisão', async ({ page }) => {
  await openHome(page, true)
  const nav = page.getByRole('navigation', { name: 'Espaços do Círculo' })
  await nav.getByRole('button', { name: 'Agenda' }).click()
  await page.getByRole('button', { name: 'Detalhes e ações' }).click()
  await page.getByRole('button', { name: /Iniciar sessão de Ana Clara/u }).click()
  await expect(page.getByRole('form', { name: 'Rascunho de sessão' })).toBeVisible()
  await nav.getByRole('button', { name: 'Início' }).click()

  const command = page.getByRole('region', { name: 'Comando do Círculo' })
  await command.getByRole('textbox', { name: 'Seu comando' }).fill('Marcar comportamento Pede ajuda para Ana Clara na sessão')
  await command.getByRole('button', { name: 'Preparar rascunho' }).click()
  await expect(command.getByRole('status')).toContainText('apenas nesta sessão')
  await page.getByRole('button', { name: 'Revisar no formulário' }).click()

  const behavior = page.getByRole('checkbox', { name: /Pede ajuda/u })
  await expect(behavior).toBeChecked()
  await expect(page.locator('#draft-behaviors')).toBeFocused()
  await page.waitForTimeout(750)
  await expect.poll(() => page.evaluate(() => window.voiceSavedWrites)).toBe(0)
  await expect(page.getByRole('status').filter({ hasText: 'Alteração de voz ainda não salva' })).toBeVisible()
  await page.getByRole('button', { name: 'Bloquear' }).click()
  await expect(page.getByRole('alert')).toContainText('Há uma alteração de voz não salva')
  await expect.poll(() => page.evaluate(() => window.voiceVaultLocks)).toBe(0)
  await expect.poll(() => page.evaluate(() => window.voiceSavedWrites)).toBe(0)
  const sessionForm = page.getByRole('form', { name: 'Rascunho de sessão' })
  await sessionForm.getByRole('button', { name: 'Salvar rascunho' }).click()
  await expect.poll(() => page.evaluate(() => window.voiceSavedWrites)).toBe(1)
  await expect.poll(() => page.evaluate(() => window.voiceSavedPatch?.behaviorIds)).toEqual(['behavior-help'])
})
