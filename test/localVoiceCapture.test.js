import test from 'node:test'
import assert from 'node:assert/strict'
import { captureCommandAudio, PREFERRED_CAPTURE_RATE } from '../src/localVoiceCapture.js'

test('prefers Whisper-friendly capture rate but passes the actual AudioContext rate onward', () => {
  assert.equal(PREFERRED_CAPTURE_RATE, 22_050)
})

test('capture preserves original rate, never exceeds the exact duration limit, stops track and closes AudioContext', async () => {
  let processor
  let trackStopped = false
  let contextClosed = false
  let ready
  const readyPromise = new Promise(resolve => { ready = resolve })
  class FakeAudioContext {
    constructor() { this.sampleRate = 48_000; this.state = 'running'; this.destination = {} }
    createMediaStreamSource() { return { connect() {}, disconnect() {} } }
    createScriptProcessor() { processor = { connect() {}, disconnect() {} }; ready(); return processor }
    resume() { return Promise.resolve() }
    close() { this.state = 'closed'; contextClosed = true; return Promise.resolve() }
  }
  const capturePromise = captureCommandAudio({
    maxDurationMs: 1_000,
    AudioContextClass: FakeAudioContext,
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() { trackStopped = true } }] }) },
  })
  await readyPromise
  const frame = new Float32Array(4_096).fill(0.1)
  const event = { inputBuffer: { getChannelData: () => frame }, outputBuffer: { getChannelData: () => new Float32Array(4_096) } }
  for (let index = 0; index < 12; index++) processor.onaudioprocess(event)
  const captured = await capturePromise
  assert.equal(captured.samples.length, 48_000)
  assert.equal(captured.sampleRate, 48_000)
  assert.ok(captured.samples.every(Number.isFinite))
  captured.samples.fill(0)
  assert.equal(trackStopped, true)
  assert.equal(contextClosed, true)
})

test('microphone permission wait does not consume the speech capture time limit', async () => {
  let processor
  let ready
  const readyPromise = new Promise(resolve => { ready = resolve })
  let settled = false
  class FakeAudioContext {
    constructor() { this.sampleRate = 16_000; this.state = 'running'; this.destination = {} }
    createMediaStreamSource() { return { connect() {}, disconnect() {} } }
    createScriptProcessor() { processor = { connect() {}, disconnect() {} }; ready(); return processor }
    resume() { return Promise.resolve() }
    close() { this.state = 'closed'; return Promise.resolve() }
  }
  const capturePromise = captureCommandAudio({
    maxDurationMs: 600,
    AudioContextClass: FakeAudioContext,
    mediaDevices: { getUserMedia: async () => {
      await new Promise(resolve => setTimeout(resolve, 800))
      return { getTracks: () => [{ stop() {} }] }
    } },
  }).finally(() => { settled = true })
  await readyPromise
  const event = { inputBuffer: { getChannelData: () => new Float32Array(4_096).fill(0.1) }, outputBuffer: { getChannelData: () => new Float32Array(4_096) } }
  processor.onaudioprocess(event)
  await new Promise(resolve => setTimeout(resolve, 250))
  assert.equal(settled, false)
  processor.onaudioprocess(event)
  processor.onaudioprocess(event)
  const captured = await capturePromise
  assert.equal(captured.samples.length, 9_600)
  captured.samples.fill(0)
})

test('surfaces microphone permission errors to the caller', async () => {
  await assert.rejects(captureCommandAudio({
    mediaDevices: { getUserMedia: async () => { const error = new Error('blocked'); error.name = 'NotAllowedError'; throw error } },
    AudioContextClass: class {},
  }), /acesso ao microfone foi bloqueado.*digite o comando/iu)
})

test('cancelling during capture releases the microphone and closes the audio context', async () => {
  let processor
  let ready
  const readyPromise = new Promise(resolve => { ready = resolve })
  let trackStopped = false
  let contextClosed = false
  class FakeAudioContext {
    constructor() { this.sampleRate = 16_000; this.state = 'running'; this.destination = {} }
    createMediaStreamSource() { return { connect() {}, disconnect() {} } }
    createScriptProcessor() { processor = { connect() {}, disconnect() {}, onaudioprocess: null }; ready(); return processor }
    resume() { return Promise.resolve() }
    close() { this.state = 'closed'; contextClosed = true; return Promise.resolve() }
  }
  const controller = new AbortController()
  const capturePromise = captureCommandAudio({
    signal: controller.signal,
    AudioContextClass: FakeAudioContext,
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() { trackStopped = true } }] }) },
  })
  await readyPromise
  controller.abort()
  await assert.rejects(capturePromise, error => error.name === 'AbortError')
  assert.equal(trackStopped, true)
  assert.equal(contextClosed, true)
  assert.equal(processor.onaudioprocess, null)
})

test('rejeita áudio sem fala e ainda assim encerra os recursos de captura', async () => {
  let processor
  let ready
  const readyPromise = new Promise(resolve => { ready = resolve })
  let trackStopped = false
  let contextClosed = false
  class FakeAudioContext {
    constructor() { this.sampleRate = 8_000; this.state = 'running'; this.destination = {} }
    createMediaStreamSource() { return { connect() {}, disconnect() {} } }
    createScriptProcessor() { processor = { connect() {}, disconnect() {}, onaudioprocess: null }; ready(); return processor }
    resume() { return Promise.resolve() }
    close() { this.state = 'closed'; contextClosed = true; return Promise.resolve() }
  }
  const capturePromise = captureCommandAudio({
    maxDurationMs: 1_000,
    AudioContextClass: FakeAudioContext,
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() { trackStopped = true } }] }) },
  })
  await readyPromise
  const silence = new Float32Array(4_096)
  const event = { inputBuffer: { getChannelData: () => silence }, outputBuffer: { getChannelData: () => new Float32Array(4_096) } }
  processor.onaudioprocess(event)
  processor.onaudioprocess(event)
  await assert.rejects(capturePromise, /Nenhuma fala detectada/u)
  assert.equal(trackStopped, true)
  assert.equal(contextClosed, true)
  assert.equal(processor.onaudioprocess, null)
})
