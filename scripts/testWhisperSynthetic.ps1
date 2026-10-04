param(
    [string]$VoiceDirectory,
    [ValidateSet('core', 'behavior-save', 'occurrence-date')][string]$Scenario = 'core'
)

# Keep the UTF-8 BOM: Windows PowerShell 5.1 otherwise reads Portuguese text as ANSI.

$ErrorActionPreference = 'Stop'
$Scenario = $Scenario.ToLowerInvariant()

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
        'Registrar comportamento Pede ajuda para Ana Clara na sessão.',
        'Criar comportamento Espera a vez.',
        'Abrir agenda.',
        'Clicar em Novo cadastro.',
        'Confirmar comando.',
        'Abrir pacientes.',
        'Abrir sessões de Ana Clara.',
        'Abrir análises deste mês.',
        'Abrir ajustes.',
        'Editar paciente Ana Clara.',
        'Abrir biblioteca de comportamentos reutilizáveis.',
        'Abrir contexto do caso de Ana Clara.',
        'Editar comportamento Pede ajuda.',
        'Adicionar adendo à sessão de Ana Clara de três de outubro de dois mil e vinte e seis às quinze horas.',
        'Mostrar agenda de hoje.'
    )
    if ($Scenario -eq 'behavior-save') {
        $commands = @('Salvar comportamento.', 'Salve o comportamento.', 'Confirmar comando.')
    }
    if ($Scenario -eq 'occurrence-date') {
        $commands = @(
            'Iniciar sessão de Ana Clara em três de outubro de dois mil e vinte e seis às quinze horas.',
            'Remarcar sessão de Ana Clara no dia três de outubro de dois mil e vinte e seis às quinze horas.',
            'Cancelar sessão de Ana Clara em três de outubro de dois mil e vinte e seis às quinze horas.'
        )
    }
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
            Transcript = (Get-Content -LiteralPath $transcriptPath -Raw -Encoding UTF8).Trim()
            InferenceSeconds = [math]::Round($clock.Elapsed.TotalSeconds, 2)
            AudioBytes = (Get-Item -LiteralPath $wav).Length
        }
    }
    $env:CIRCULO_SYNTHETIC_WAV_DIRECTORY = $testDirectory
    $env:CIRCULO_TEST_VOICE_RESOURCES = $sourceVoiceDirectory
    $env:CIRCULO_SYNTHETIC_WAV_COUNT = [string]$commands.Count
    Push-Location (Join-Path $repoRoot 'src-tauri')
    try {
        $nativeStdout = Join-Path $testDirectory 'native-stdout.txt'
        $nativeStderr = Join-Path $testDirectory 'native-stderr.txt'
        $nativeProcess = Start-Process -FilePath 'cargo' -ArgumentList @('test', '--release', '--offline', '--locked', 'native_voice::tests::transcribes_synthetic_wav_through_the_same_local_backend_as_the_app', '--', '--ignored', '--nocapture') -WorkingDirectory (Join-Path $repoRoot 'src-tauri') -WindowStyle Hidden -RedirectStandardOutput $nativeStdout -RedirectStandardError $nativeStderr -Wait -PassThru
        if ($nativeProcess.ExitCode -ne 0) { throw "Integração Rust com áudio sintético falhou (código $($nativeProcess.ExitCode)). $(Get-Content -LiteralPath $nativeStderr -Raw -Encoding UTF8)" }
        $nativeOutput = @(Get-Content -LiteralPath $nativeStdout -Encoding UTF8)
        $marker = 'CIRCULO_SYNTHETIC_RESULT_JSON:'
        $nativeJsonLines = @($nativeOutput | Where-Object { $_.StartsWith($marker, [StringComparison]::Ordinal) })
        if ($nativeJsonLines.Count -ne 1) { throw 'Resultado estruturado nativo ausente ou duplicado.' }
        $nativeResults = $nativeJsonLines[0].Substring($marker.Length) | ConvertFrom-Json
        if ($nativeResults.Count -ne $commands.Count) { throw 'Quantidade de transcrições nativas incompatível com o corpus.' }
        $nativeCases = @($nativeResults | ForEach-Object {
            if ($_.index -lt 0 -or $_.index -ge $commands.Count) { throw 'Índice nativo fora do corpus.' }
            [pscustomobject]@{ Index = $_.index; IntendedCommand = $commands[$_.index]; Transcript = $_.transcript }
        })
        $nativeCasesPath = Join-Path $testDirectory 'native-cases.json'
        [IO.File]::WriteAllText($nativeCasesPath, ($nativeCases | ConvertTo-Json -Depth 4 -Compress), (New-Object Text.UTF8Encoding($false)))
        $semanticStdout = Join-Path $testDirectory 'semantic-stdout.json'
        $semanticStderr = Join-Path $testDirectory 'semantic-stderr.txt'
        $semanticArguments = '"{0}" --input "{1}" --scenario "{2}"' -f (Join-Path $PSScriptRoot 'evaluateSyntheticVoice.js'), $nativeCasesPath, $Scenario
        $semanticProcess = Start-Process -FilePath 'node' -ArgumentList $semanticArguments -WorkingDirectory $repoRoot -WindowStyle Hidden -RedirectStandardOutput $semanticStdout -RedirectStandardError $semanticStderr -Wait -PassThru
        if ($semanticProcess.ExitCode -ne 0) { throw "Falha ao avaliar o resultado semântico nativo. $(Get-Content -LiteralPath $semanticStderr -Raw -Encoding UTF8)" }
        $semantic = Get-Content -LiteralPath $semanticStdout -Raw -Encoding UTF8 | ConvertFrom-Json
    }
    finally {
        Pop-Location
        Remove-Item Env:CIRCULO_SYNTHETIC_WAV_DIRECTORY -ErrorAction SilentlyContinue
        Remove-Item Env:CIRCULO_TEST_VOICE_RESOURCES -ErrorAction SilentlyContinue
        Remove-Item Env:CIRCULO_SYNTHETIC_WAV_COUNT -ErrorAction SilentlyContinue
    }
    [pscustomobject]@{ Scenario = $Scenario; Voice = $voice.Voice.GetDescription(); NetworkUsed = $false; Cases = @($results); NativeCases = $nativeCases; Semantic = $semantic } | ConvertTo-Json -Depth 10 -Compress
    if ($semantic.Failed -gt 0) { throw "$($semantic.Failed) comandos nativos não preservaram a ação e os campos esperados. Transcrição não vazia não significa funcionamento." }
}
finally {
    $resolvedDirectory = [IO.Path]::GetFullPath($testDirectory)
    if ($resolvedDirectory.StartsWith($tempBase + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $resolvedDirectory).StartsWith('circulo-whisper-synthetic-', [StringComparison]::Ordinal)) {
        Remove-Item -LiteralPath $resolvedDirectory -Recurse -Force
    }
}
