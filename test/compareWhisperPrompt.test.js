import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { evaluateSyntheticVoice } from '../scripts/evaluateSyntheticVoice.js'

test('diagnostic PowerShell parses and only its file readers validate UTF-8 and plain JSON', () => {
  const script = fileURLToPath(new URL('../scripts/compareWhisperPrompt.ps1', import.meta.url))
  const temp = mkdtempSync(path.join(tmpdir(), 'circulo-whisper-reader-test-'))
  const raw = ' Acrescentar observação da sessão de Ana Clara com  pediu ajuda.\r\n'
  const goodBytes = Buffer.from(raw, 'utf8')
  const badBytes = Buffer.from([0x73, 0x65, 0x73, 0x73, 0xe3, 0x6f])
  writeFileSync(path.join(temp, 'good.txt'), goodBytes)
  writeFileSync(path.join(temp, 'bad.txt'), badBytes)
  writeFileSync(path.join(temp, 'empty.txt'), '')
  const psQuote = value => `'${value.replaceAll("'", "''")}'`
  // Parse the complete script, then load only these two function definitions.
  // Never dot-source or invoke the diagnostic's top-level inference workflow.
  const command = `
    $ErrorActionPreference = 'Stop'
    [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
    $tokens = $null; $errors = $null
    $ast = [Management.Automation.Language.Parser]::ParseFile(${psQuote(script)}, [ref]$tokens, [ref]$errors)
    if ($errors.Count) { throw 'Script parse errors' }
    $names = @('Read-WhisperRawTranscript', 'ConvertTo-WhisperEvaluationCase')
    $functions = @($ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -in $names }, $true))
    if ($functions.Count -ne 2) { throw 'Expected two isolated readers' }
    foreach ($function in $functions) { . ([ScriptBlock]::Create($function.Extent.Text)) }
    $root = ${psQuote(temp)}
    $good = Read-WhisperRawTranscript (Join-Path $root 'good.txt')
    $bad = Read-WhisperRawTranscript (Join-Path $root 'bad.txt')
    $empty = Read-WhisperRawTranscript (Join-Path $root 'empty.txt')
    $missing = Read-WhisperRawTranscript (Join-Path $root 'missing.txt')
    $validCase = ConvertTo-WhisperEvaluationCase ([pscustomobject]@{ Index=0; Transcript=$good.Transcript; Utf8Valid=$good.Utf8Valid })
    $invalidCase = ConvertTo-WhisperEvaluationCase ([pscustomobject]@{ Index=1; Transcript=$bad.Transcript; Utf8Valid=$bad.Utf8Valid })
    [pscustomobject]@{ Good=$good; Bad=$bad; Empty=$empty; Missing=$missing; ValidCase=$validCase; InvalidCase=$invalidCase; PlainString=($good.Transcript -is [string]) } | ConvertTo-Json -Depth 5 -Compress
  `
  try {
    const process = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      encoding: 'utf8', windowsHide: true, timeout: 10_000, maxBuffer: 64 * 1024,
      // Let Windows PowerShell find its own 5.1 modules, rather than inheriting
      // a parent pwsh runtime's module paths.
      env: Object.fromEntries(Object.entries(globalThis.process.env).filter(([key]) => key.toLowerCase() !== 'psmodulepath')),
    })
    assert.equal(process.error, undefined)
    assert.equal(process.status, 0, process.stderr)
    const result = JSON.parse(process.stdout.trim())
    assert.equal(result.PlainString, true)
    assert.equal(typeof result.Good.Transcript, 'string')
    assert.equal(result.Good.Transcript, raw)
    assert.equal(result.Good.Utf8Valid, true)
    assert.equal(result.Good.RawSHA256.toLowerCase(), createHash('sha256').update(goodBytes).digest('hex'))
    assert.equal(result.ValidCase.Transcript, raw.trim())
    assert.ok(result.ValidCase.Transcript.includes('com  pediu ajuda.'))
    assert.equal(result.Bad.Utf8Valid, false)
    assert.equal(result.Bad.ReadError, 'invalid-utf8')
    assert.equal(result.Bad.Transcript, null)
    assert.equal(result.Bad.RawSHA256.toLowerCase(), createHash('sha256').update(badBytes).digest('hex'))
    assert.equal(result.InvalidCase.Transcript, null)
    assert.equal(result.Empty.Transcript, null)
    assert.equal(result.Empty.Utf8Valid, true)
    assert.equal(result.Empty.ReadError, 'empty-transcript')
    assert.equal(result.Missing.Transcript, null)
    assert.equal(result.Missing.ReadError, 'missing-transcript')
    assert.deepEqual(readFileSync(path.join(temp, 'good.txt')), goodBytes)
    assert.deepEqual(readFileSync(path.join(temp, 'bad.txt')), badBytes)
    assert.throws(() => evaluateSyntheticVoice([
      result.ValidCase, result.InvalidCase, { Index: 2, Transcript: 'x' },
      { Index: 3, Transcript: 'x' }, { Index: 4, Transcript: 'Confirmar comando.' },
    ], { scenario: 'clinical-append' }), /Índice\/transcrição inválido/)
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})
