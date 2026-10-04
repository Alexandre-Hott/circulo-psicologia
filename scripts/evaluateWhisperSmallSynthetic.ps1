$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$sourceVoiceDirectory = Join-Path $repoRoot 'src-tauri\resources\voice'
$whisperSource = Join-Path $sourceVoiceDirectory 'whisper-cli.exe'
foreach ($path in @($whisperSource, (Join-Path $sourceVoiceDirectory 'ggml-base.bin'))) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Recurso ausente: $path" }
}

$smallUrl = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin'
$smallSha256 = 'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb'
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
$testDirectory = Join-Path $tempBase ('circulo-whisper-small-synthetic-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testDirectory | Out-Null
$voiceDirectory = Join-Path $testDirectory 'voice'
New-Item -ItemType Directory -Path $voiceDirectory | Out-Null
Get-ChildItem -LiteralPath $sourceVoiceDirectory -File | ForEach-Object {
    New-Item -ItemType HardLink -Path (Join-Path $voiceDirectory $_.Name) -Target $_.FullName | Out-Null
}
$whisper = Join-Path $voiceDirectory 'whisper-cli.exe'
$baseModel = Join-Path $voiceDirectory 'ggml-base.bin'

function Assert-Sha256([string]$Path, [string]$Expected) {
    $sha = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($Path)
    try { $actual = ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $sha.Dispose() }
    if ($actual -ne $Expected) { throw "SHA-256 divergente para o modelo small quantizado: $actual" }
}

try {
    $smallModel = Join-Path $testDirectory 'ggml-small-q5_1.bin'
    & curl.exe --fail --location --retry 3 --silent --show-error --output $smallModel $smallUrl
    if ($LASTEXITCODE -ne 0) { throw "Download do modelo small falhou (curl exit $LASTEXITCODE)." }
    Assert-Sha256 $smallModel $smallSha256

    $voice = New-Object -ComObject SAPI.SpVoice
    $allVoices = $voice.GetVoices()
    $portugueseVoice = $null
    for ($index = 0; $index -lt $allVoices.Count; $index++) {
        $candidate = $allVoices.Item($index)
        if ($candidate.GetDescription() -match 'Portuguese\s*\(Brazil\)') { $portugueseVoice = $candidate; break }
    }
    if (-not $portugueseVoice) { throw 'Não há voz SAPI de português brasileiro instalada.' }
    $voice.Voice = $portugueseVoice
    $voice.Rate = -2
    $format = New-Object -ComObject SAPI.SpAudioFormat
    $format.Type = 22
    $commands = @(
        'Marcar sessão semanal para Ana Clara toda quinta às quinze horas.',
        'Cadastrar paciente Bia Fictícia com nove anos.',
        'Registrar comportamento Pede ajuda para Ana Clara na sessão.'
    )
    $results = foreach ($index in 0..($commands.Count - 1)) {
        $wav = Join-Path $testDirectory "synthetic-command-$index.wav"
        $stream = New-Object -ComObject SAPI.SpFileStream
        $stream.Format = $format
        $stream.Open($wav, 3, $false)
        $voice.AudioOutputStream = $stream
        [void]$voice.Speak($commands[$index], 0)
        $stream.Close()
        $modelResults = foreach ($model in @(
            @{ Name = 'base-generic'; Path = $baseModel; Prompt = 'Agenda de sessões. Cadastrar paciente. Sessão semanal. Registrar comportamento na sessão. Observação, evolução e indicador.' },
            @{ Name = 'base-names-only'; Path = $baseModel; Prompt = 'Agenda de sessões. Cadastrar paciente. Sessão semanal. Registrar comportamento na sessão. Observação, evolução e indicador. Ana Clara. Bia Fictícia.' },
            @{ Name = 'small-q5_1-generic'; Path = $smallModel; Prompt = 'Agenda de sessões. Cadastrar paciente. Sessão semanal. Registrar comportamento na sessão. Observação, evolução e indicador.' }
        )) {
            $outputBase = Join-Path $testDirectory ("transcription-{0}-{1}" -f $index, $model.Name)
            $stdoutPath = "$outputBase.stdout.txt"
            $stderrPath = "$outputBase.stderr.txt"
            $arguments = '-m "{0}" -f "{1}" -l pt -ng -nt --prompt "{2}" -otxt -of "{3}"' -f $model.Path, $wav, $model.Prompt, $outputBase
            $clock = [Diagnostics.Stopwatch]::StartNew()
            $process = Start-Process -FilePath $whisper -ArgumentList $arguments -WorkingDirectory $voiceDirectory -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -Wait -PassThru
            $clock.Stop()
            if ($process.ExitCode -ne 0) { throw "$($model.Name) falhou: $(Get-Content -LiteralPath $stderrPath -Raw)" }
            [pscustomobject]@{
                Model = $model.Name
                Transcript = (Get-Content -LiteralPath "$outputBase.txt" -Raw).Trim()
                InferenceSeconds = [math]::Round($clock.Elapsed.TotalSeconds, 2)
            }
        }
        [pscustomobject]@{ IntendedCommand = $commands[$index]; Models = @($modelResults) }
    }
    [pscustomobject]@{
        Voice = $voice.Voice.GetDescription()
        NetworkUsedForRecognition = $false
        DownloadedForOneOffComparison = 'ggml-small-q5_1.bin (SHA-256 verified; 190,085,487 bytes)'
        Cases = @($results)
    } | ConvertTo-Json -Depth 5 -Compress
}
finally {
    $resolvedDirectory = [IO.Path]::GetFullPath($testDirectory)
    if ($resolvedDirectory.StartsWith($tempBase + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $resolvedDirectory).StartsWith('circulo-whisper-small-synthetic-', [StringComparison]::Ordinal)) {
        Remove-Item -LiteralPath $resolvedDirectory -Recurse -Force
    }
}
