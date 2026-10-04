param(
    [Parameter(Mandatory = $true)][string]$InputDirectory,
    [Parameter(Mandatory = $true)][string]$VoiceDirectory
)

# UTF-8 BOM is required for Portuguese literals in Windows PowerShell 5.1.
function Get-WhisperResponseArguments([string]$Prompt, [string]$InputName, [string]$OutputName) {
    # Keep the production72 argument order and ASCII paths relative to engine cwd.
    foreach ($relativeName in @($InputName, $OutputName)) {
        if ($relativeName -cnotmatch '\A\.\./[A-Za-z0-9][A-Za-z0-9._-]*\z') {
            throw 'Diagnostic input/output must be ASCII ../filename paths without additional traversal.'
        }
    }
    return @('-m', 'ggml-base.bin', '-f', $InputName, '-l', 'pt', '--prompt', $Prompt,
        '-ng', '-nt', '-otxt', '-of', $OutputName)
}

function Write-WhisperResponseArguments([string]$Path, [string[]]$Arguments) {
    # Validate the whole vector before creating anything; never quote or repair it.
    foreach ($argument in $Arguments) {
        if ($null -eq $argument -or $argument -match '[\r\n\x00]') {
            throw 'Response arguments cannot contain CR, LF or NUL.'
        }
    }
    $strictUtf8 = New-Object Text.UTF8Encoding($false, $true)
    $bytes = $strictUtf8.GetBytes(($Arguments -join "`n") + "`n")
    $stream = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
        $stream.Write($bytes, 0, $bytes.Length)
    } finally {
        $stream.Dispose()
    }
}

function Read-WhisperRawTranscript([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return [pscustomobject]@{ Transcript = $null; Utf8Valid = $false; RawSHA256 = $null; ReadError = 'missing-transcript' }
    }
    $rawHash = [string](Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
    $rawBytes = [IO.File]::ReadAllBytes($Path)
    if ($rawBytes.Length -eq 0) {
        return [pscustomobject]@{ Transcript = $null; Utf8Valid = $true; RawSHA256 = $rawHash; ReadError = 'empty-transcript' }
    }
    $strictUtf8 = New-Object Text.UTF8Encoding($false, $true)
    try {
        [void]$strictUtf8.GetString($rawBytes)
    } catch [Text.DecoderFallbackException] {
        # Never decode invalid bytes with replacement characters or repair them.
        return [pscustomobject]@{ Transcript = $null; Utf8Valid = $false; RawSHA256 = $rawHash; ReadError = 'invalid-utf8' }
    }
    # Remove PowerShell's extended string metadata before any JSON serialization.
    $plainText = [string](Get-Content -LiteralPath $Path -Raw -Encoding UTF8)
    return [pscustomobject]@{ Transcript = $plainText; Utf8Valid = $true; RawSHA256 = $rawHash; ReadError = $null }
}

function ConvertTo-WhisperEvaluationCase($Result) {
    # Mirror native outer trim only; raw files and result.Transcript stay intact.
    $text = if ($Result.Utf8Valid -and $null -ne $Result.Transcript) { ([string]$Result.Transcript).Trim() } else { $null }
    return [pscustomobject]@{ Index = $Result.Index; Transcript = $text }
}

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$inputRoot = [IO.Path]::GetFullPath($InputDirectory)
$voiceRoot = [IO.Path]::GetFullPath($VoiceDirectory)
$whisper = Join-Path $voiceRoot 'whisper-cli.exe'
$model = Join-Path $voiceRoot 'ggml-base.bin'
foreach ($required in @($whisper, $model)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Missing local resource: $required" }
}
$nativeSource = Get-Content -LiteralPath (Join-Path $repoRoot 'src-tauri/src/native_voice.rs') -Raw -Encoding UTF8
$promptMatch = [regex]::Match($nativeSource, 'const INITIAL_PROMPT: &str = "([^"\r\n]*)";')
if (-not $promptMatch.Success) { throw 'Cannot read the production INITIAL_PROMPT literal.' }
# Match build_initial_prompt's bounds for the one fictional name authorized here.
$patientName = 'Ana Clara'
$productionPrompt = $promptMatch.Groups[1].Value
if ($patientName.Length -gt 80 -or $patientName -match '[\x00-\x1f\x7f]' -or
    [Text.Encoding]::UTF8.GetByteCount($productionPrompt) + [Text.Encoding]::UTF8.GetByteCount($patientName) + 2 -gt 1000) {
    throw 'Fictional patient name exceeds the production prompt bounds.'
}
$promptA = $productionPrompt + ' ' + $patientName + '.'
$vocabulary = 'Acrescentar observação da sessão. Acrescentar procedimentos da sessão. Acrescentar resultado da sessão. Acrescentar encaminhamento da sessão.'
$variants = @(@{ Name = 'A'; Prompt = $promptA }, @{ Name = 'B'; Prompt = $promptA + ' ' + $vocabulary })
foreach ($variant in $variants) {
    if ([Text.Encoding]::UTF8.GetByteCount($variant.Prompt) -gt 1000 -or $variant.Prompt -match '[\r\n\x00]') {
        throw 'Diagnostic prompt exceeds production bounds or contains an invalid response argument.'
    }
}
$audio = @(foreach ($index in 0..4) {
    $wav = Join-Path $inputRoot "synthetic-command-$index.wav"
    if (-not (Test-Path -LiteralPath $wav -PathType Leaf)) { throw "Missing retained WAV: $wav" }
    $bytes = [IO.File]::ReadAllBytes($wav)
    if ($bytes.Length -lt 44 -or [Text.Encoding]::ASCII.GetString($bytes, 0, 4) -ne 'RIFF' -or
        [Text.Encoding]::ASCII.GetString($bytes, 8, 4) -ne 'WAVE') { throw 'Invalid retained WAV.' }
    $offset = 12; $byteRate = 0; $dataBytes = 0; $sampleRate = 0
    while ($offset + 8 -le $bytes.Length) {
        $chunk = [Text.Encoding]::ASCII.GetString($bytes, $offset, 4)
        $length = [BitConverter]::ToUInt32($bytes, $offset + 4)
        if ($offset + 8 + $length -gt $bytes.Length) { throw 'Truncated WAV chunk.' }
        if ($chunk -eq 'fmt ') {
            if ($length -lt 16 -or [BitConverter]::ToUInt16($bytes, $offset + 8) -ne 1 -or
                [BitConverter]::ToUInt16($bytes, $offset + 10) -ne 1 -or
                [BitConverter]::ToUInt16($bytes, $offset + 22) -ne 16) { throw 'Expected mono PCM16 WAV.' }
            $sampleRate = [BitConverter]::ToUInt32($bytes, $offset + 12)
            $byteRate = [BitConverter]::ToUInt32($bytes, $offset + 16)
        }
        if ($chunk -eq 'data') { $dataBytes += $length }
        $offset += 8 + $length + ($length % 2)
    }
    if ($sampleRate -ne 22050 -or $byteRate -ne 44100 -or $dataBytes -le 0) { throw 'Expected original 22050 Hz WAV.' }
    $duration = $dataBytes / [double]$byteRate
    if ($duration -gt 12) { throw 'Retained WAV exceeds 12 seconds; no inference started.' }
    [pscustomobject]@{ Index = $index; Path = $wav; AudioBytes = $bytes.Length; DurationSeconds = $duration; SampleRate = $sampleRate; SHA256 = (Get-FileHash -LiteralPath $wav -Algorithm SHA256).Hash }
})
$outputRoot = Join-Path ([IO.Path]::GetTempPath()) ('circulo-whisper-prompt-ab-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $outputRoot | Out-Null
Write-Output "CIRCULO_PROMPT_AB_ARTIFACT_DIRECTORY:$outputRoot"
# Match production resource staging with a wide OS cwd and ASCII relative args.
$engineRoot = Join-Path $outputRoot 'voice'
New-Item -ItemType Directory -Path $engineRoot | Out-Null
Get-ChildItem -LiteralPath $voiceRoot -File | ForEach-Object {
    New-Item -ItemType HardLink -Path (Join-Path $engineRoot $_.Name) -Target $_.FullName | Out-Null
}
$whisper = Join-Path $engineRoot 'whisper-cli.exe'
$model = Join-Path $engineRoot 'ggml-base.bin'
foreach ($item in $audio) {
    $stagedInput = Join-Path $outputRoot "input-$($item.Index).wav"
    Copy-Item -LiteralPath $item.Path -Destination $stagedInput
    if ((Get-FileHash -LiteralPath $stagedInput -Algorithm SHA256).Hash -ne $item.SHA256) {
        throw 'Retained WAV copy differs; no inference started.'
    }
}
$utf8 = New-Object Text.UTF8Encoding($false)
$manifest = [pscustomobject]@{
    InputDirectory = $inputRoot; VoiceDirectory = $voiceRoot; EngineDirectory = $engineRoot; NetworkUsed = $false; NewAudioGenerated = $false
    Resampled = $false; TimeoutSeconds = 60; PlannedInferenceCount = 10; Audio = $audio
    Prompts = $variants; CLI_SHA256 = (Get-FileHash -LiteralPath $whisper -Algorithm SHA256).Hash
    Model_SHA256 = (Get-FileHash -LiteralPath $model -Algorithm SHA256).Hash
}
[IO.File]::WriteAllText((Join-Path $outputRoot 'manifest.json'), ($manifest | ConvertTo-Json -Depth 8), $utf8)
$results = @(foreach ($item in $audio) {
    foreach ($variant in $variants) {
        $responseName = "args-$($variant.Name)-$($item.Index).txt"
        $responsePath = Join-Path $engineRoot $responseName
        $outputName = "transcription-$($variant.Name)-$($item.Index)"
        Write-WhisperResponseArguments $responsePath (Get-WhisperResponseArguments $variant.Prompt "../input-$($item.Index).wav" "../$outputName")
        $outputBase = Join-Path $outputRoot $outputName
        $stdout = "$outputBase.stdout.txt"; $stderr = "$outputBase.stderr.txt"
        $clock = [Diagnostics.Stopwatch]::StartNew()
        $process = Start-Process -FilePath $whisper -ArgumentList ("@" + $responseName) -WorkingDirectory $engineRoot -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
        [void]$process.Handle
        $timedOut = -not $process.WaitForExit(60000)
        if ($timedOut) { $process.Kill() }
        $process.WaitForExit()
        $clock.Stop()
        $decoded = Read-WhisperRawTranscript "$outputBase.txt"
        # Preserve the entire raw output; the existing evaluator owns parsing.
        $result = [pscustomobject]@{ Variant = $variant.Name; Index = $item.Index; Transcript = $decoded.Transcript; Utf8Valid = $decoded.Utf8Valid; RawSHA256 = $decoded.RawSHA256; ReadError = $decoded.ReadError; ExitCode = $process.ExitCode; TimedOut = $timedOut; ElapsedSeconds = $clock.Elapsed.TotalSeconds; AudioBytes = $item.AudioBytes; DurationSeconds = $item.DurationSeconds; TranscriptPath = "$outputBase.txt"; StdoutPath = $stdout; StderrPath = $stderr }
        [IO.File]::WriteAllText("$outputBase.result.json", ($result | ConvertTo-Json -Depth 4), $utf8)
        $result
    }
})
$evaluations = @(foreach ($variant in $variants) {
    # Mirror parse_generated_transcript's outer trim, retaining raw files/results.
    $cases = @($results | Where-Object { $_.Variant -eq $variant.Name } | ForEach-Object { ConvertTo-WhisperEvaluationCase $_ })
    $casesPath = Join-Path $outputRoot "cases-$($variant.Name).json"
    [IO.File]::WriteAllText($casesPath, ($cases | ConvertTo-Json -Depth 4), $utf8)
    $stdout = Join-Path $outputRoot "semantic-$($variant.Name).json"
    $stderr = Join-Path $outputRoot "semantic-$($variant.Name).stderr.txt"
    $arguments = '"{0}" --input "{1}" --scenario clinical-append' -f (Join-Path $PSScriptRoot 'evaluateSyntheticVoice.js'), $casesPath
    $process = Start-Process -FilePath 'node' -ArgumentList $arguments -WorkingDirectory $repoRoot -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
    [void]$process.Handle
    if (-not $process.WaitForExit(60000)) { $process.Kill(); $process.WaitForExit(); throw 'Evaluator timeout; inference logs retained.' }
    $process.WaitForExit()
    $semantic = if ($process.ExitCode -eq 0) { Get-Content -LiteralPath $stdout -Raw -Encoding UTF8 | ConvertFrom-Json } else { $null }
    [pscustomobject]@{ Variant = $variant.Name; ExitCode = $process.ExitCode; Semantic = $semantic; StdoutPath = $stdout; StderrPath = $stderr }
})
$baseline69Path = Join-Path $inputRoot 'semantic-stdout.json'
$baseline69 = if (Test-Path -LiteralPath $baseline69Path) { Get-Content -LiteralPath $baseline69Path -Raw -Encoding UTF8 | ConvertFrom-Json } else { $null }
$summary = [pscustomobject]@{ ArtifactDirectory = $outputRoot; InferenceCount = $results.Count; Manifest = $manifest; Results = $results; Evaluations = $evaluations; Original69ArchivedEvaluation = $baseline69; Original69EvaluationPath = $baseline69Path }
$summaryPath = Join-Path $outputRoot 'summary.json'
[IO.File]::WriteAllText($summaryPath, ($summary | ConvertTo-Json -Depth 12), $utf8)
Write-Output "CIRCULO_PROMPT_AB_SUMMARY:$summaryPath"
if (@($results | Where-Object { $_.TimedOut -or $_.ExitCode -ne 0 -or -not $_.Utf8Valid -or $null -ne $_.ReadError }).Count -gt 0 -or @($evaluations | Where-Object { $_.ExitCode -ne 0 }).Count -gt 0) { exit 1 }
