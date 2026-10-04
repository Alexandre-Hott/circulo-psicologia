import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Source/configuration contract only. Never run preparation, build, TTS, CLI,
// inference, package installation, or a native profile from this suite.
const read = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8').replace(/^\uFEFF/, '')
const model = 'ggml-small-q5_1.bin'
const modelHash = 'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb'
const dlls = [
  'ggml-base.dll', 'ggml-cpu-alderlake.dll', 'ggml-cpu-cannonlake.dll',
  'ggml-cpu-cascadelake.dll', 'ggml-cpu-haswell.dll', 'ggml-cpu-icelake.dll',
  'ggml-cpu-sandybridge.dll', 'ggml-cpu-skylakex.dll', 'ggml-cpu-sse42.dll',
  'ggml-cpu-x64.dll', 'ggml.dll', 'parakeet.dll', 'SDL2.dll', 'whisper.dll',
]
const expectedBundle = [model, 'whisper-cli.exe', ...dlls, 'THIRD-PARTY-NOTICES.txt']

function psLiteral(source, variable) {
  const match = source.match(new RegExp(`\\$${variable}\\s*=\\s*'([^']*)'`))
  assert.ok(match, `pinned ${variable} literal must exist`)
  return match[1]
}

test('candidate preparation pins actual small Q5 source and digest, unchanged CLI release', () => {
  const source = read('scripts/prepareWhisperWindows.ps1')
  assert.equal(psLiteral(source, 'modelUrl'), `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${model}`)
  assert.equal(psLiteral(source, 'modelSha256').toLowerCase(), modelHash)
  assert.equal(psLiteral(source, 'archiveUrl'), 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.1/whisper-bin-x64.zip')
  assert.equal(psLiteral(source, 'archiveSha256').toLowerCase(), '7d8be46ecd31828e1eb7a2ecdd0d6b314feafd82163038ab6092594b0a063539')
  assert.ok(source.includes(`'${model}'`), 'prepare the candidate under its own filename, never rename it as base')
  assert.doesNotMatch(source, /Copy-Item[^\r\n]*-Destination[^\r\n]*'ggml-base\.bin'/, 'historical base must not be overwritten')
  assert.match(source, /Assert-Sha256\s+\$model\s+\$modelSha256/, 'verify downloaded model before resource placement')
})

test('candidate native readiness requires its real filename without base fallback', () => {
  const source = read('src-tauri/src/native_voice.rs')
  const readiness = source.match(/if\s+!resources\.join\("whisper-cli\.exe"\)[\s\S]*?\{([\s\S]*?)\n\s*\}/)?.[0]
  assert.ok(readiness, 'existing transcribe readiness gate must remain inspectable')
  assert.ok(readiness.includes(`resources.join("${model}").is_file()`), 'small resource, not old base, must authorize readiness')
  assert.ok(!readiness.includes('ggml-base.bin'), 'no silent base requirement/fallback')
  assert.match(readiness, /voice:prepare/, 'missing resource remains an explicit setup refusal')
})

test('candidate Windows build readiness aligns required model and retains licenses', () => {
  const source = read('src-tauri/build.rs')
  const required = source.match(/for required in\s*\[([\s\S]*?)\]/)?.[1]
  assert.ok(required, 'existing required-resource gate must remain')
  const names = [...required.matchAll(/"([^"]+)"/g)].map(match => match[1])
  assert.ok(names.includes(model), 'build must require the selected small model')
  assert.ok(!names.includes('ggml-base.bin'), 'historical base is not a build prerequisite')
  for (const name of ['whisper-cli.exe', 'ggml.dll', 'ggml-base.dll', 'ggml-cpu-x64.dll', 'whisper.dll', 'THIRD-PARTY-NOTICES.txt']) assert.ok(names.includes(name), `preserve required ${name}`)
})

test('candidate bundle has explicit selected-model runtime and license whitelist only', () => {
  const config = JSON.parse(read('src-tauri/tauri.conf.json'))
  const resources = config.bundle.resources
  assert.ok(resources && !Array.isArray(resources) && typeof resources === 'object')
  assert.deepEqual(Object.keys(resources).sort(), expectedBundle.map(name => `resources/voice/${name}`).sort(), 'no directory wildcard, second model, diagnostic, or unexpected resource')
  for (const name of expectedBundle) assert.equal(resources[`resources/voice/${name}`], `voice/${name}`, `installed lookup must retain ${name}`)
})

test('candidate default synthetic script checks and invokes the same selected model', () => {
  const script = read('scripts/testWhisperSynthetic.ps1')
  const defaults = script.slice(0, script.indexOf('$tempBase'))
  assert.ok(defaults.includes(`'${model}'`), 'default resource preflight must require small Q5')
  assert.ok(!defaults.includes("'ggml-base.bin'"), 'old base must not gate candidate synthetic test')
  assert.match(script, /\$model\s*=\s*Join-Path\s+\$voiceDirectory\s+'ggml-small-q5_1\.bin'/)
  assert.match(script, /INITIAL_PROMPT/, 'read current production prompt, not historical diagnostic prompt')
  const pkg = JSON.parse(read('package.json'))
  assert.match(pkg.scripts['voice:test-synthetic'], /scripts\/testWhisperSynthetic\.ps1/)
  assert.match(script, /transcribes_synthetic_wav_through_the_same_local_backend_as_the_app/, 'retain actual Rust integration, not only direct CLI output')
})

test('candidate notices and resource instructions identify small quantized model explicitly', () => {
  const instructions = read('src-tauri/resources/voice/README.md')
  const notices = read('src-tauri/resources/voice/THIRD-PARTY-NOTICES.txt')
  assert.ok(instructions.includes(model))
  assert.match(notices, /small/i)
  assert.match(notices, /q5_1/i)
  assert.match(notices, /MIT License/)
  assert.match(notices, /zlib/i)
  assert.match(instructions, /SHA-256/)
})

test('candidate integration keeps eight existing WAV harness and authoritative names opt-in', () => {
  const source = read('src-tauri/src/native_voice.rs')
  assert.match(source, /#\[ignore[^\]]*\][\s\S]*?fn transcribes_synthetic_wav_through_the_same_local_backend_as_the_app/)
  assert.match(source, /CIRCULO_SYNTHETIC_WAV_DIRECTORY/)
  assert.match(source, /CIRCULO_TEST_VOICE_RESOURCES/)
  assert.match(source, /CIRCULO_SYNTHETIC_WAV_COUNT/)
  assert.match(source, /&\["Ana Clara"\.into\(\), "Bia Fictícia"\.into\(\)\]/)
  assert.match(source, /CIRCULO_SYNTHETIC_RESULT_JSON:/)
  assert.match(source, /Duration::from_secs\(60\)/)
  // No inference here: full IDs/literal quality and UI apply require the later
  // measured Rust batch and replay of its actual transcripts, not this gate.
})
