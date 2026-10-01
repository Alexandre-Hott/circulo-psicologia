param([string]$VoiceDirectory)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($VoiceDirectory)) {
    $sourceVoiceDirectory = Join-Path $repoRoot 'src-tauri\resources\voice'
} else {
    $sourceVoiceDirectory = [IO.Path]::GetFullPath($VoiceDirectory)
}
foreach ($path in @((Join-Path $sourceVoiceDirectory 'whisper-cli.exe'), (Join-Path $sourceVoiceDirectory 'ggml-base.bin'))) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Recurso ausente: $path" }
}

$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
$testDirectory = Join-Path $tempBase ('circulo-whisper-synthetic-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testDirectory | Out-Null
$voiceDirectory = Join-Path $testDirectory 'voice'
New-Item -ItemType Directory -Path $voiceDirectory | Out-Null
Get-ChildItem -LiteralPath $sourceVoiceDirectory -File | ForEach-Object {
    New-Item -ItemType HardLink -Path (Join-Path $voiceDirectory $_.Name) -Target $_.FullName | Out-Null
}
$whisper = Join-Path $voiceDirectory 'whisper-cli.exe'
$model = Join-Path $voiceDirectory 'ggml-base.bin'

try {
    $voice = New-Object -ComObject SAPI.SpVoice
    $allVoices = $voice.GetVoices()
    $portugueseVoice = $null
    for ($index = 0; $index -lt $allVoices.Count; $index++) {
        $candidate = $allVoices.Item($index)
        if ($candidate.GetDescription() -match 'Portuguese\s*\(Brazil\)') { $portugueseVoice = $candidate; break }
    }
    if (-not $portugueseVoice) { throw 'Não há voz SAPI de português brasileiro instalada para gerar o teste.' }
    $voice.Voice = $portugueseVoice
    $voice.Rate = -2

    $format = New-Object -ComObject SAPI.SpAudioFormat
    $format.Type = 22 # PCM, mono, 22 kHz, 16-bit
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

        $outputBase = Join-Path $testDirectory "transcription-$index"
        $stdoutPath = Join-Path $testDirectory "stdout-$index.txt"
        $stderrPath = Join-Path $testDirectory "stderr-$index.txt"
        $arguments = '-m "{0}" -f "{1}" -l pt -ng -nt --prompt "Agenda de sessões. Cadastrar paciente. Sessão semanal. Registrar comportamento na sessão. Observação, evolução e indicador." -otxt -of "{2}"' -f $model, $wav, $outputBase
        $clock = [Diagnostics.Stopwatch]::StartNew()
        $process = Start-Process -FilePath $whisper -ArgumentList $arguments -WorkingDirectory $voiceDirectory -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -Wait -PassThru
        $clock.Stop()
        if ($process.ExitCode -ne 0) {
            $details = if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw } else { '' }
            throw "whisper.cpp terminou com código $($process.ExitCode). $details"
        }
        $transcriptPath = "$outputBase.txt"
        if (-not (Test-Path -LiteralPath $transcriptPath -PathType Leaf)) { throw 'whisper.cpp não produziu uma transcrição.' }
        [pscustomobject]@{
            IntendedCommand = $commands[$index]
            Transcript = (Get-Content -LiteralPath $transcriptPath -Raw).Trim()
            InferenceSeconds = [math]::Round($clock.Elapsed.TotalSeconds, 2)
            AudioBytes = (Get-Item -LiteralPath $wav).Length
        }
    }
    $env:CIRCULO_SYNTHETIC_WAV_DIRECTORY = $testDirectory
    $env:CIRCULO_TEST_VOICE_RESOURCES = $sourceVoiceDirectory
    Push-Location (Join-Path $repoRoot 'src-tauri')
    try {
        cargo test --release --offline native_voice::tests::transcribes_synthetic_wav_through_the_same_local_backend_as_the_app -- --ignored --nocapture
        if ($LASTEXITCODE -ne 0) { throw "Integração Rust com áudio sintético falhou (código $LASTEXITCODE)." }
    }
    finally {
        Pop-Location
        Remove-Item Env:CIRCULO_SYNTHETIC_WAV_DIRECTORY -ErrorAction SilentlyContinue
        Remove-Item Env:CIRCULO_TEST_VOICE_RESOURCES -ErrorAction SilentlyContinue
    }
    [pscustomobject]@{ Voice = $voice.Voice.GetDescription(); NetworkUsed = $false; Cases = @($results) } | ConvertTo-Json -Depth 4 -Compress
}
finally {
    $resolvedDirectory = [IO.Path]::GetFullPath($testDirectory)
    if ($resolvedDirectory.StartsWith($tempBase + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $resolvedDirectory).StartsWith('circulo-whisper-synthetic-', [StringComparison]::Ordinal)) {
        Remove-Item -LiteralPath $resolvedDirectory -Recurse -Force
    }
}
