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
  assert.equal(captured.endedBy, 'max-duration')
  assert.equal(captured.maxDurationMs, 1_000)
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
  assert.equal(captured.endedBy, 'max-duration')
  assert.equal(captured.maxDurationMs, 600)
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

// Deterministic capture-only doubles: timer/sample cap metadata, not ASR.
// Date starts above zero because speech detection uses zero as its sentinel.
async function controlledCapture(t, options = {}) {
  const state = { now: 10_000, timer: null, cleared: false, stopped: false, closed: false, zeroed: [] }
  t.mock.method(Date, 'now', () => state.now)
  t.mock.method(globalThis, 'setInterval', callback => { state.timer = callback; return 73 })
  t.mock.method(globalThis, 'clearInterval', id => { assert.equal(id, 73); state.cleared = true })
  const originalFill = Float32Array.prototype.fill
  t.mock.method(Float32Array.prototype, 'fill', function (value, ...args) {
    if (value === 0) state.zeroed.push(this)
    return originalFill.call(this, value, ...args)
  })
  let ready
  const readyPromise = new Promise(resolve => { ready = resolve })
  class AudioContextDouble {
    constructor() { this.sampleRate = 8_000; this.state = 'running'; this.destination = {} }
    createMediaStreamSource() { return { connect() {}, disconnect() {} } }
    createScriptProcessor() { state.processor = { connect() {}, disconnect() {}, onaudioprocess: null }; ready(); return state.processor }
    resume() { return Promise.resolve() }
    close() { this.state = 'closed'; state.closed = true; return Promise.resolve() }
  }
  const promise = captureCommandAudio({
    ...options, AudioContextClass: AudioContextDouble,
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() { state.stopped = true } }] }) },
  })
  await readyPromise
  state.emit = (value = 0.1, length = 4096) => {
    const input = new Float32Array(length).fill(value)
    state.processor.onaudioprocess({ inputBuffer: { getChannelData: () => input }, outputBuffer: { getChannelData: () => new Float32Array(length) } })
  }
  return { state, promise }
}

function released(state) {
  assert.equal(state.stopped, true)
  assert.equal(state.closed, true)
  assert.equal(state.cleared, true)
  assert.equal(state.processor.onaudioprocess, null)
  assert.ok(state.zeroed.length > 0)
  assert.ok(state.zeroed.every(buffer => buffer.every(sample => sample === 0)))
}

test('sample cap reports max-duration at exactly 12 seconds and clears intermediate buffers', async t => {
  const { state, promise } = await controlledCapture(t)
  for (let index = 0; index < 24; index++) state.emit()
  const captured = await promise
  assert.equal(captured.endedBy, 'max-duration')
  assert.equal(captured.maxDurationMs, 12_000)
  assert.equal(captured.sampleRate, 8_000)
  assert.equal(captured.samples.length, 96_000)
  assert.ok(captured.samples.some(sample => sample > 0))
  released(state)
  captured.samples.fill(0)
})

test('wall timer reports max-duration even when fewer than the sample cap were delivered', async t => {
  const { state, promise } = await controlledCapture(t, { maxDurationMs: 1000 })
  state.emit(0.1, 128)
  state.now += 999
  state.timer()
  assert.equal(state.stopped, false)
  state.now++
  state.timer()
  const captured = await promise
  assert.equal(captured.endedBy, 'max-duration')
  assert.equal(captured.maxDurationMs, 1000)
  assert.equal(captured.samples.length, 128)
  released(state)
  captured.samples.fill(0)
})

test('ordinary trailing silence reports silence, not a truncated capture', async t => {
  const { state, promise } = await controlledCapture(t)
  state.emit(0.1, 128)
  state.now += 1101
  state.emit(0, 128)
  const captured = await promise
  assert.equal(captured.endedBy, 'silence')
  assert.equal(captured.maxDurationMs, 12_000)
  assert.equal(captured.samples.length, 128)
  assert.ok(captured.samples.some(sample => sample > 0))
  released(state)
  captured.samples.fill(0)
})

for (const [requested, clamped] of [[20_000, 12_000], [Infinity, 12_000], [NaN, 12_000], [0, 1], [-100, 1]]) {
  test(`duration metadata is clamped: ${requested} → ${clamped}, backend ceiling unchanged`, async t => {
    const { state, promise } = await controlledCapture(t, { maxDurationMs: requested })
    state.emit(0.1, 1)
    state.now += clamped
    state.timer()
    const captured = await promise
    assert.equal(captured.endedBy, 'max-duration')
    assert.equal(captured.maxDurationMs, clamped)
    assert.ok(captured.samples.length <= Math.floor(8000 * clamped / 1000))
    released(state)
    captured.samples.fill(0)
  })
}

test('abort with buffered speech rejects AbortError and zeroes every intermediate/merged buffer', async t => {
  const controller = new AbortController()
  const { state, promise } = await controlledCapture(t, { signal: controller.signal })
  state.emit(0.1, 128)
  controller.abort()
  await assert.rejects(promise, error => error.name === 'AbortError')
  released(state)
  assert.ok(state.zeroed.some(buffer => buffer.length === 128))
})

test('timer without speech still rejects and cleans up instead of returning cutoff metadata', async t => {
  const { state, promise } = await controlledCapture(t)
  state.emit(0, 128)
  state.now += 12_000
  state.timer()
  await assert.rejects(promise, /Nenhuma fala detectada/u)
  released(state)
})
