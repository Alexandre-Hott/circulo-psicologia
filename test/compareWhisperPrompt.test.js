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

// Only the two MAIN-confirmed response helpers are loaded below. In particular,
// no top-level diagnostic staging, Start-Process, model/WAV access or inference
// is invoked. Path grammar below follows MAIN's final confirmed author contract.
const responseScript = fileURLToPath(new URL('../scripts/compareWhisperPrompt.ps1', import.meta.url))
const quotePowerShell = value => `'${value.replaceAll("'", "''")}'`
const responseArguments = (prompt, input = '../input-0.wav', output = '../transcription-A-0') => [
  '-m', 'ggml-base.bin', '-f', input, '-l', 'pt', '--prompt', prompt,
  '-ng', '-nt', '-otxt', '-of', output,
]

function withResponseHelpers(body, prepare, inspect) {
  const temp = mkdtempSync(path.join(tmpdir(), 'circulo-whisper-response-unit-'))
  try {
    prepare?.(temp)
    const command = `
      $ErrorActionPreference = 'Stop'
      [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
      $tokens = $null; $errors = $null
      $ast = [Management.Automation.Language.Parser]::ParseFile(${quotePowerShell(responseScript)}, [ref]$tokens, [ref]$errors)
      if ($errors.Count) { throw 'Script parse errors' }
      $names = @('Get-WhisperResponseArguments', 'Write-WhisperResponseArguments')
      $functions = @($ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -in $names }, $true))
      if ($functions.Count -ne 2) { throw 'Expected exactly two isolated response helpers' }
      foreach ($function in $functions) { . ([ScriptBlock]::Create($function.Extent.Text)) }
      $root = ${quotePowerShell(temp)}
      ${body}
    `
    const child = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      encoding: 'utf8', windowsHide: true, timeout: 10_000, maxBuffer: 128 * 1024,
      env: Object.fromEntries(Object.entries(globalThis.process.env).filter(([key]) => key.toLowerCase() !== 'psmodulepath')),
    })
    assert.equal(child.error, undefined)
    assert.equal(child.status, 0, child.stderr)
    const result = JSON.parse(child.stdout.trim())
    inspect(result, temp)
  } finally {
    // Exclusively this test's newly allocated directory; never capture/recovery.
    rmSync(temp, { recursive: true, force: true })
  }
}

test('response helpers retain the two confirmed parameter signatures', () => {
  withResponseHelpers(`
    $signatures = @($functions | ForEach-Object {
      $parameters = if ($null -ne $_.Parameters) { $_.Parameters } else { $_.Body.ParamBlock.Parameters }
      [pscustomobject]@{ Name=$_.Name; Parameters=@($parameters | ForEach-Object { $_.Name.VariablePath.UserPath }) }
    })
    ConvertTo-Json -InputObject $signatures -Depth 4 -Compress
  `, null, result => {
    const signatures = Object.fromEntries(result.map(item => [item.Name, item.Parameters]))
    assert.deepEqual(signatures['Get-WhisperResponseArguments'], ['Prompt', 'InputName', 'OutputName'])
    assert.deepEqual(signatures['Write-WhisperResponseArguments'], ['Path', 'Arguments'])
  })
})

test('response builder returns exactly 13 strings with unchanged prompt and per-call relative ASCII paths', () => {
  const prompt = '  José Fictício. Texto "entre aspas" com  dois espaços?!  '
  withResponseHelpers(`
    $inputCases = Get-Content -LiteralPath (Join-Path $root 'inputs.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $results = @($inputCases | ForEach-Object {
      $arguments = @(Get-WhisperResponseArguments -Prompt ([string]$_.Prompt) -InputName ([string]$_.InputName) -OutputName ([string]$_.OutputName))
      [pscustomobject]@{ Arguments=$arguments; AllStrings=(@($arguments | Where-Object { $_ -isnot [string] }).Count -eq 0) }
    })
    ConvertTo-Json -InputObject $results -Depth 5 -Compress
  `, temp => {
    const inputs = ['A', 'B'].flatMap(variant => Array.from({ length: 5 }, (_, index) => ({
      Prompt: prompt, InputName: `../input-${index}.wav`, OutputName: `../transcription-${variant}-${index}`,
    })))
    writeFileSync(path.join(temp, 'inputs.json'), JSON.stringify(inputs))
  }, result => {
    assert.equal(result.length, 10)
    result.forEach((item, offset) => {
      const variant = offset < 5 ? 'A' : 'B'
      const index = offset % 5
      assert.equal(item.AllStrings, true)
      assert.deepEqual(item.Arguments, responseArguments(prompt, `../input-${index}.wav`, `../transcription-${variant}-${index}`))
      for (const pathIndex of [1, 3, 12]) {
        const value = item.Arguments[pathIndex]
        assert.ok(value.length > 0 && [...value].every(character => character.codePointAt(0) <= 0x7f))
        assert.equal(path.win32.isAbsolute(value), false)
        assert.equal(value.includes('"'), false, 'Response paths are literal values, not shell quoting wrappers')
      }
    })
  })
})

test('response writer emits exact ordered UTF-8 without BOM, LF only and literal quotes/spaces', () => {
  const prompt = '  José Fictício. Texto "entre aspas" com  dois espaços?!  '
  const args = responseArguments(prompt, '../input-4.wav', '../transcription-B-4')
  withResponseHelpers(`
    $inputCase = Get-Content -LiteralPath (Join-Path $root 'input.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $arguments = @(Get-WhisperResponseArguments -Prompt ([string]$inputCase.Prompt) -InputName '../input-4.wav' -OutputName '../transcription-B-4')
    [void](Write-WhisperResponseArguments -Path (Join-Path $root 'args-B-4.txt') -Arguments $arguments)
    [pscustomobject]@{ Count=$arguments.Count; Prompt=[string]$arguments[7] } | ConvertTo-Json -Compress
  `, temp => writeFileSync(path.join(temp, 'input.json'), JSON.stringify({ Prompt: prompt })), (result, temp) => {
    const actual = readFileSync(path.join(temp, 'args-B-4.txt'))
    const expected = Buffer.from(args.join('\n') + '\n', 'utf8')
    assert.equal(result.Count, 13)
    assert.equal(result.Prompt, prompt)
    assert.deepEqual(actual, expected)
    assert.equal(actual.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false)
    assert.equal(actual.includes(0x0d), false)
    assert.equal(actual.includes(0), false)
    assert.equal(actual.toString('utf8').split('\n')[7], prompt)
    assert.equal(actual.toString('utf8').includes('\\"'), false)
  })
})

for (const [name, control] of [['CR', '\r'], ['LF', '\n'], ['NUL', '\0']]) {
  test(`response writer rejects ${name} at every argument before file creation and preserves existing raw bytes`, () => {
    const sentinel = Buffer.from([0x72, 0x61, 0x77, 0xff, 0, 0x0d, 0x0a])
    withResponseHelpers(`
      $cases = Get-Content -LiteralPath (Join-Path $root 'invalid.json') -Raw -Encoding UTF8 | ConvertFrom-Json
      $results = @($cases | ForEach-Object {
        $absent = Join-Path $root $_.Absent
        $existing = Join-Path $root $_.Existing
        $absentRejected = $false; $existingRejected = $false
        try { [void](Write-WhisperResponseArguments -Path $absent -Arguments ([string[]]$_.Arguments)) } catch { $absentRejected=$true }
        try { [void](Write-WhisperResponseArguments -Path $existing -Arguments ([string[]]$_.Arguments)) } catch { $existingRejected=$true }
        [pscustomobject]@{ Index=$_.Index; AbsentRejected=$absentRejected; ExistingRejected=$existingRejected; AbsentExists=(Test-Path -LiteralPath $absent) }
      })
      ConvertTo-Json -InputObject $results -Depth 4 -Compress
    `, temp => {
      const baseline = responseArguments('José Fictício.')
      const cases = baseline.map((value, index) => {
        const args = [...baseline]
        args[index] = value + control + '--help'
        const existing = `existing-${index}.txt`
        writeFileSync(path.join(temp, existing), sentinel)
        return { Index: index, Arguments: args, Absent: `absent-${index}.txt`, Existing: existing }
      })
      writeFileSync(path.join(temp, 'invalid.json'), JSON.stringify(cases))
    }, (result, temp) => {
      assert.equal(result.length, 13)
      result.forEach((item, index) => {
        assert.equal(item.Index, index)
        assert.equal(item.AbsentRejected, true)
        assert.equal(item.ExistingRejected, true)
        assert.equal(item.AbsentExists, false)
        assert.deepEqual(readFileSync(path.join(temp, `existing-${index}.txt`)), sentinel)
      })
    })
  })
}

test('response create_new refuses existing empty/nonempty files and preserves the first successful write', () => {
  const sentinel = Buffer.from([0xff, 0x72, 0x61, 0x77, 0, 0x0a])
  withResponseHelpers(`
    $arguments = @(Get-WhisperResponseArguments -Prompt 'Fictitious prompt.' -InputName '../input-0.wav' -OutputName '../transcription-A-0')
    $results = @('empty.txt','existing.txt' | ForEach-Object {
      $rejected=$false
      try { [void](Write-WhisperResponseArguments -Path (Join-Path $root $_) -Arguments $arguments) } catch { $rejected=$true }
      [pscustomobject]@{ File=$_; Rejected=$rejected }
    })
    $fresh = Join-Path $root 'fresh.txt'
    [void](Write-WhisperResponseArguments -Path $fresh -Arguments $arguments)
    $secondRejected=$false
    try { [void](Write-WhisperResponseArguments -Path $fresh -Arguments @('--prompt','Different fictitious prompt.')) } catch { $secondRejected=$true }
    [pscustomobject]@{ Results=$results; SecondRejected=$secondRejected } | ConvertTo-Json -Depth 4 -Compress
  `, temp => {
    writeFileSync(path.join(temp, 'empty.txt'), '')
    writeFileSync(path.join(temp, 'existing.txt'), sentinel)
  }, (result, temp) => {
    assert.equal(result.SecondRejected, true)
    assert.deepEqual(result.Results, [{ File: 'empty.txt', Rejected: true }, { File: 'existing.txt', Rejected: true }])
    assert.deepEqual(readFileSync(path.join(temp, 'empty.txt')), Buffer.alloc(0))
    assert.deepEqual(readFileSync(path.join(temp, 'existing.txt')), sentinel)
    assert.deepEqual(readFileSync(path.join(temp, 'fresh.txt')), Buffer.from(responseArguments('Fictitious prompt.').join('\n') + '\n', 'utf8'))
  })
})

test('response builder accepts the confirmed ../ASCII-filename grammar without adding quoting wrappers', () => {
  const names = ['../a', '../Z9', '../input-0.wav', '../transcription-B-4', '../a_b.c-9']
  withResponseHelpers(`
    $names = Get-Content -LiteralPath (Join-Path $root 'names.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $results = @($names | ForEach-Object {
      $arguments = @(Get-WhisperResponseArguments -Prompt 'Fictitious prompt.' -InputName ([string]$_) -OutputName ([string]$_))
      [pscustomobject]@{ Name=[string]$_; Input=[string]$arguments[3]; Output=[string]$arguments[12]; Count=$arguments.Count }
    })
    ConvertTo-Json -InputObject $results -Depth 4 -Compress
  `, temp => writeFileSync(path.join(temp, 'names.json'), JSON.stringify(names)), result => {
    assert.deepEqual(result, names.map(name => ({ Name: name, Input: name, Output: name, Count: 13 })))
  })
})

test('response builder refuses absolute, nested, non-ASCII, wrapped and malformed paths for both parameters', () => {
  const invalid = [
    '', '../', 'input-0.wav', './input-0.wav', '/input-0.wav', 'C:/input-0.wav', 'C:\\input-0.wav',
    '//server/share/input.wav', '../../input.wav', '../nested/input.wav', '../nested\\input.wav',
    '../..', '../.hidden', '../_input.wav', '../-input.wav', '../José.wav',
    '"../input.wav"', "'../input.wav'", '../input file.wav', ' ../input.wav', '../input.wav ',
    '../input:stream', '../input?.wav', '../input*.wav', '../input\r.wav', '../input\n.wav', '../input\0.wav',
  ]
  withResponseHelpers(`
    $names = Get-Content -LiteralPath (Join-Path $root 'invalid-paths.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $results = @($names | ForEach-Object {
      $bad=[string]$_; $inputRejected=$false; $outputRejected=$false
      try { [void](Get-WhisperResponseArguments -Prompt 'Fictitious prompt.' -InputName $bad -OutputName '../transcription-A-0') } catch { $inputRejected=$true }
      try { [void](Get-WhisperResponseArguments -Prompt 'Fictitious prompt.' -InputName '../input-0.wav' -OutputName $bad) } catch { $outputRejected=$true }
      [pscustomobject]@{ Name=$bad; InputRejected=$inputRejected; OutputRejected=$outputRejected }
    })
    ConvertTo-Json -InputObject $results -Depth 4 -Compress
  `, temp => writeFileSync(path.join(temp, 'invalid-paths.json'), JSON.stringify(invalid)), result => {
    assert.deepEqual(result, invalid.map(name => ({ Name: name, InputRejected: true, OutputRejected: true })))
  })
})

test('response writer rejects unpaired UTF-16 surrogates before creating or overwriting files', () => {
  const sentinel = Buffer.from([0xff, 0, 0x72, 0x61, 0x77])
  withResponseHelpers(`
    $results = @(foreach ($code in @(0xd800,0xdc00)) {
      $invalid='Fictitious ' + [string][char]$code + ' prompt.'
      $baseline=@('-m','ggml-base.bin','-f','../input-0.wav','-l','pt','--prompt','Valid prompt.','-ng','-nt','-otxt','-of','../transcription-A-0')
      foreach ($index in 0..12) {
        $arguments=[string[]]$baseline.Clone(); $arguments[$index]=$invalid
        $absent=Join-Path $root ("invalid-unicode-"+$code+"-"+$index+".txt")
        $absentRejected=$false; $existingRejected=$false
        try { [void](Write-WhisperResponseArguments -Path $absent -Arguments $arguments) } catch { $absentRejected=$true }
        try { [void](Write-WhisperResponseArguments -Path (Join-Path $root 'existing.txt') -Arguments $arguments) } catch { $existingRejected=$true }
        [pscustomobject]@{ Code=$code; Index=$index; AbsentRejected=$absentRejected; ExistingRejected=$existingRejected; AbsentExists=(Test-Path -LiteralPath $absent) }
      }
    })
    ConvertTo-Json -InputObject $results -Depth 4 -Compress
  `, temp => writeFileSync(path.join(temp, 'existing.txt'), sentinel), (result, temp) => {
    assert.equal(result.length, 26)
    result.forEach(item => {
      assert.equal(item.AbsentRejected, true)
      assert.equal(item.ExistingRejected, true)
      assert.equal(item.AbsentExists, false)
    })
    assert.deepEqual(readFileSync(path.join(temp, 'existing.txt')), sentinel)
  })
})

test('AST-only review wires Whisper to one relative @response argument, engine cwd and hidden window', () => {
  withResponseHelpers(`
    $commands = @($ast.FindAll({ param($node)
      $node -is [Management.Automation.Language.CommandAst] -and $node.GetCommandName() -eq 'Start-Process'
    }, $true) | Where-Object { @($_.CommandElements | Where-Object { $_.Extent.Text -eq '$whisper' }).Count -gt 0 })
    if ($commands.Count -ne 1) { throw 'Expected exactly one Whisper spawn expression' }
    $elements=@($commands[0].CommandElements | ForEach-Object { $_.Extent.Text })
    ConvertTo-Json -InputObject $elements -Compress
  `, null, elements => {
    const argument = elements[elements.indexOf('-ArgumentList') + 1]
    assert.equal(argument.replace(/\s+/gu, ''), '("@"+$responseName)')
    assert.equal(elements[elements.indexOf('-WorkingDirectory') + 1], '$engineRoot')
    assert.equal(elements[elements.indexOf('-WindowStyle') + 1], 'Hidden')
    assert.equal(elements[elements.indexOf('-FilePath') + 1], '$whisper')
    // This inspects AST only: no spawn, response-file expansion or ASR is run.
  })
})
