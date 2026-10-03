import { expect, test } from '@playwright/test'

async function openApp(page, initiallyLocked, update = false) {
  await page.clock.install({ time: new Date('2026-10-03T15:00:00Z') })
  await page.addInitScript(({ initiallyLocked, update }) => {
    let unlocked = !initiallyLocked
    window.lockVoice = { calls: [], unexpected: [] }
    class SyntheticAudioContext {
      constructor() { this.sampleRate = 8000; this.state = 'running'; this.destination = {} }
      createMediaStreamSource() { return { connect() {}, disconnect() {} } }
      createScriptProcessor() {
        const processor = { onaudioprocess: null, disconnect() {} }
        processor.connect = () => queueMicrotask(() => {
          const emit = () => {
            if (!processor.onaudioprocess) return
            processor.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(4096).fill(0.1) }, outputBuffer: { getChannelData: () => new Float32Array(4096) } })
            if (processor.onaudioprocess) setTimeout(emit, 0)
          }
          emit()
        })
        return processor
      }
      resume() { return Promise.resolve() }
      close() { this.state = 'closed'; return Promise.resolve() }
    }
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: SyntheticAudioContext })
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } })
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      window.lockVoice.calls.push({ command, args: structuredClone(args) })
      if (command === 'vault_status') return { initialized: true, unlocked, profileState: 'ready' }
      if (command === 'vault_unlock') { unlocked = true; return null }
      if (command === 'vault_lock') { unlocked = false; return null }
      if (command === 'voice_transcribe') return new Promise(resolve => { window.lockVoice.resolve = resolve })
      if (command === 'auto_backup_status') return { available: false, dirty: false }
      if (command === 'plugin:updater|check') return update ? { rid: 1, currentVersion: '0.2.44', version: '0.2.45' } : null
      if (command === 'plugin:resources|close') return null
      if (command === 'patient_list' && unlocked) return [{ id: 'ana', name: 'Ana Clara', age: 8, revision: 1, archivedAt: null }]
      if (['behavior_list', 'indicator_catalog', 'agenda_occurrences'].includes(command) && unlocked) return []
      window.lockVoice.unexpected.push(command)
      throw new Error(`Operação inesperada: ${command}`)
    } }
  }, { initiallyLocked, update })
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Comando do Círculo' })).toBeVisible()
}

async function beginAudio(page) {
  await page.evaluate(() => { delete window.lockVoice.resolve })
  await page.getByRole('button', { name: 'Ouvir e transcrever' }).click()
  await page.clock.runFor(256)
  await expect.poll(() => page.evaluate(() => typeof window.lockVoice.resolve)).toBe('function')
}

test.afterEach(async ({ page }) => expect(await page.evaluate(() => window.lockVoice.unexpected)).toEqual([]))

test('áudio iniciado bloqueado não confirma nova instalação depois de desbloquear no mesmo espaço', async ({ page }) => {
  await openApp(page, true, true)
  await beginAudio(page)
  expect(await page.evaluate(() => window.lockVoice.calls.find(call => call.command === 'voice_transcribe').args.patientNames)).toEqual([])
  await page.locator('#vault-password').fill('senha-ficticia-2026')
  await page.getByRole('button', { name: 'Desbloquear', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Espaços do Círculo' })).toBeVisible()
  await page.getByRole('button', { name: 'Baixar e instalar', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.evaluate(() => window.lockVoice.resolve('confirmar'))
  await page.clock.runFor(64)
  await expect(page.getByRole('alertdialog')).toBeVisible()
  expect(await page.evaluate(() => window.lockVoice.calls.filter(call => call.command === 'plugin:updater|download_and_install'))).toEqual([])
  await page.getByRole('button', { name: 'Voltar', exact: true }).click()
})

test('bloquear descarta áudio antigo e a próxima transcrição não recebe nomes de pacientes', async ({ page }) => {
  await openApp(page, false)
  await beginAudio(page)
  await page.getByRole('button', { name: 'Bloquear', exact: true }).click()
  await expect(page.locator('#vault-password')).toBeVisible()
  await page.evaluate(() => window.lockVoice.resolve('Cadastrar paciente Bia Fictícia com 9 anos'))
  await page.clock.runFor(64)
  await expect(page.getByLabel('Seu comando')).toHaveValue('')
  await expect(page.locator('.voice-command-preview')).toHaveCount(0)
  await beginAudio(page)
  expect(await page.evaluate(() => window.lockVoice.calls.filter(call => call.command === 'voice_transcribe').at(-1).args.patientNames)).toEqual([])
  await page.evaluate(() => window.lockVoice.resolve('Clicar em Opções avançadas de backup e restauração'))
  await expect(page.locator('.voice-command-preview')).toBeVisible()
  await expect(page.locator('[data-voice-record="patient:ana"]')).toHaveCount(0)
})
