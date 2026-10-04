export const PREFERRED_CAPTURE_RATE = 22_050
export const LOCAL_VOICE_MAX_MS = 12_000

export async function captureCommandAudio({ signal, maxDurationMs = LOCAL_VOICE_MAX_MS, mediaDevices = globalThis.navigator?.mediaDevices, AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext } = {}) {
  if (!mediaDevices?.getUserMedia || !AudioContextClass) throw new Error('Este aplicativo não oferece captura local de áudio. Use o campo de texto.')
  if (signal?.aborted) throw new DOMException('Captura cancelada.', 'AbortError')
  const durationLimitMs = Math.max(1, Math.min(Number.isFinite(maxDurationMs) ? maxDurationMs : LOCAL_VOICE_MAX_MS, LOCAL_VOICE_MAX_MS))
  let stream
  let context
  let source
  let processor
  let timer
  let abortHandler
  const chunks = []
  let startedAt = 0
  let speechStartedAt = 0
  let lastSpeechAt = 0
  let frameCount = 0
  let stopped = false

  const stopTracks = () => stream?.getTracks().forEach(track => track.stop())
  const teardown = async () => {
    if (timer) clearInterval(timer)
    if (signal && abortHandler) signal.removeEventListener('abort', abortHandler)
    if (processor) {
      processor.onaudioprocess = null
      try { processor.disconnect() } catch {}
    }
    if (source) { try { source.disconnect() } catch {} }
    stopTracks()
    if (context && context.state !== 'closed') { try { await context.close() } catch {} }
  }

  try {
    stream = await mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    if (signal?.aborted) throw new DOMException('Captura cancelada.', 'AbortError')
    try { context = new AudioContextClass({ sampleRate: PREFERRED_CAPTURE_RATE }) }
    catch { context = new AudioContextClass() }
    source = context.createMediaStreamSource(stream)
    processor = context.createScriptProcessor(4096, 1, 1)
    source.connect(processor)
    processor.connect(context.destination)
    startedAt = Date.now()
    const sampleLimit = Math.floor(context.sampleRate * durationLimitMs / 1000)
    const capture = new Promise((resolve, reject) => {
      const finish = async (error = null) => {
        if (stopped) return
        stopped = true
        const sampleRate = context.sampleRate
        await teardown()
        const sampleCount = chunks.reduce((total, item) => total + item.length, 0)
        const merged = new Float32Array(sampleCount)
        let offset = 0
        for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; chunk.fill(0) }
        chunks.length = 0
        if (error) { merged.fill(0); reject(error); return }
        if (!speechStartedAt) { merged.fill(0); reject(new Error('Nenhuma fala detectada. Tente novamente ou digite o comando.')); return }
        resolve({ samples: merged, sampleRate })
      }
      processor.onaudioprocess = event => {
        const input = event.inputBuffer.getChannelData(0)
        let squareSum = 0
        for (const sample of input) squareSum += sample * sample
        const rms = Math.sqrt(squareSum / input.length)
        const now = Date.now()
        const frameLength = Math.min(input.length, sampleLimit - frameCount)
        const frame = new Float32Array(Math.max(0, frameLength))
        if (frameLength > 0) frame.set(input.subarray(0, frameLength))
        frameCount += frameLength
        if (rms > 0.012) { speechStartedAt ||= now; lastSpeechAt = now }
        if (speechStartedAt && lastSpeechAt && now - lastSpeechAt > 1_100) { frame.fill(0); void finish(); return }
        if (frame.length) chunks.push(frame)
        event.outputBuffer.getChannelData(0).fill(0)
        if (frameCount >= sampleLimit) void finish()
      }
      timer = setInterval(() => {
        if (Date.now() - startedAt >= durationLimitMs) void finish()
      }, 200)
      if (signal) {
        abortHandler = () => void finish(new DOMException('Captura cancelada.', 'AbortError'))
        signal.addEventListener('abort', abortHandler, { once: true })
      }
      context.resume().catch(finish)
    })
    return await capture
  } catch (reason) {
    if (!stopped) { stopped = true; await teardown() }
    if (reason?.name === 'NotAllowedError' || reason?.name === 'SecurityError') throw new Error('O acesso ao microfone foi bloqueado. Permita o microfone para o Círculo nas configurações de privacidade do Windows ou digite o comando.')
    if (reason?.name === 'NotFoundError' || reason?.name === 'DevicesNotFoundError') throw new Error('Nenhum microfone foi encontrado. Conecte um microfone ou digite o comando.')
    throw reason
  }
}
