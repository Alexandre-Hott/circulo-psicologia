$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$sourceVoiceDirectory = Join-Path $repoRoot 'src-tauri\resources\voice'
$whisperSource = Join-Path $sourceVoiceDirectory 'whisper-cli.exe'
$modelSource = Join-Path $sourceVoiceDirectory 'ggml-base.bin'
foreach ($path in @($whisperSource, $modelSource)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Recurso ausente: $path" }
}
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
$testDirectory = Join-Path $tempBase ('circulo-whisper-beam-synthetic-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testDirectory | Out-Null
$voiceDirectory = Join-Path $testDirectory 'voice'
New-Item -ItemType Directory -Path $voiceDirectory | Out-Null
Get-ChildItem -LiteralPath $sourceVoiceDirectory -File | ForEach-Object {
    New-Item -ItemType HardLink -Path (Join-Path $voiceDirectory $_.Name) -Target $_.FullName | Out-Null
}
$whisper = Join-Path $voiceDirectory 'whisper-cli.exe'
$model = Join-Path $voiceDirectory 'ggml-base.bin'

function Write-LinearResampledWave([string]$InputPath, [string]$OutputPath, [uint32]$TargetRate) {
    $bytes = [IO.File]::ReadAllBytes($InputPath)
    if ($bytes.Length -lt 44 -or [Text.Encoding]::ASCII.GetString($bytes, 0, 4) -ne 'RIFF' -or [Text.Encoding]::ASCII.GetString($bytes, 8, 4) -ne 'WAVE') {
        throw 'Cabeçalho WAV sintético inválido.'
    }
    $sourceRate = [BitConverter]::ToUInt32($bytes, 24)
    $samples = [Collections.Generic.List[int16]]::new()
    for ($offset = 44; $offset + 1 -lt $bytes.Length; $offset += 2) { $samples.Add([BitConverter]::ToInt16($bytes, $offset)) }
    $outputCount = [int][math]::Floor(($samples.Count * [double]$TargetRate + $sourceRate / 2.0) / $sourceRate)
    $outputSamples = [Collections.Generic.List[int16]]::new()
    for ($index = 0; $index -lt $outputCount; $index++) {
        $position = $index * [double]$sourceRate / $TargetRate
        $left = [math]::Min([int][math]::Floor($position), $samples.Count - 1)
        $right = [math]::Min($left + 1, $samples.Count - 1)
        $fraction = [single]($position - $left)
        if ($fraction -lt 0) { $fraction = 0 }
        if ($fraction -gt 1) { $fraction = 1 }
        $value = [single]$samples[$left] + ([single]$samples[$right] - [single]$samples[$left]) * $fraction
        if ($value -lt -32768) { $value = -32768 }
        if ($value -gt 32767) { $value = 32767 }
        $outputSamples.Add([int16][math]::Round($value, [MidpointRounding]::AwayFromZero))
    }
    $dataBytes = $outputSamples.Count * 2
    $stream = [IO.File]::Create($OutputPath)
    $writer = [IO.BinaryWriter]::new($stream)
    try {
        $writer.Write([Text.Encoding]::ASCII.GetBytes('RIFF')); $writer.Write([uint32](36 + $dataBytes)); $writer.Write([Text.Encoding]::ASCII.GetBytes('WAVE'))
        $writer.Write([Text.Encoding]::ASCII.GetBytes('fmt ')); $writer.Write([uint32]16); $writer.Write([uint16]1); $writer.Write([uint16]1)
        $writer.Write($TargetRate); $writer.Write([uint32]($TargetRate * 2)); $writer.Write([uint16]2); $writer.Write([uint16]16)
        $writer.Write([Text.Encoding]::ASCII.GetBytes('data')); $writer.Write([uint32]$dataBytes)
        foreach ($sample in $outputSamples) { $writer.Write($sample) }
    }
    finally { $writer.Dispose(); $stream.Dispose() }
}
try {
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
        $nativeWav = Join-Path $testDirectory "synthetic-command-$index-16khz.wav"
        Write-LinearResampledWave $wav $nativeWav 16000
        $attempts = foreach ($variant in @(@{ Name = '22.05kHz-original'; Path = $wav }, @{ Name = '16kHz-native-linear'; Path = $nativeWav })) {
          foreach ($beam in @(5, 8)) {
            $outputBase = Join-Path $testDirectory "transcription-$index-$($variant.Name)-beam-$beam"
            $stdoutPath = "$outputBase.stdout.txt"
            $stderrPath = "$outputBase.stderr.txt"
            $arguments = '-m "{0}" -f "{1}" -l pt -ng -nt -bs {2} --prompt "{3}" -otxt -of "{4}"' -f $model, $variant.Path, $beam, 'Agenda de sessões. Cadastrar paciente. Sessão semanal. Registrar comportamento na sessão. Observação, evolução e indicador. Ana Clara. Bia Fictícia.', $outputBase
            $clock = [Diagnostics.Stopwatch]::StartNew()
            $process = Start-Process -FilePath $whisper -ArgumentList $arguments -WorkingDirectory $voiceDirectory -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -Wait -PassThru
            $clock.Stop()
            if ($process.ExitCode -ne 0) { throw "whisper.cpp falhou para beam size ${beam}: $(Get-Content -LiteralPath $stderrPath -Raw)" }
            [pscustomobject]@{ Input = $variant.Name; BeamSize = $beam; Transcript = (Get-Content -LiteralPath "$outputBase.txt" -Raw).Trim(); InferenceSeconds = [math]::Round($clock.Elapsed.TotalSeconds, 2) }
          }
        }
        [pscustomobject]@{ IntendedCommand = $commands[$index]; Attempts = @($attempts) }
    }
    [pscustomobject]@{ Voice = $voice.Voice.GetDescription(); NetworkUsedForRecognition = $false; Cases = @($results) } | ConvertTo-Json -Depth 5 -Compress
}
finally {
    $resolvedDirectory = [IO.Path]::GetFullPath($testDirectory)
    if ($resolvedDirectory.StartsWith($tempBase + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $resolvedDirectory).StartsWith('circulo-whisper-beam-synthetic-', [StringComparison]::Ordinal)) {
        Remove-Item -LiteralPath $resolvedDirectory -Recurse -Force
    }
}
