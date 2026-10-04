param(
    [string]$VoiceDirectory,
    [ValidateSet('core', 'behavior-save', 'behavior-remove', 'indicator-value', 'clinical-append', 'occurrence-date', 'occurrence-minutes', 'analytics-range', 'interface-fields', 'interface-weekday', 'interface-party', 'interface-drawer', 'interface-series', 'interface-details', 'interface-draft-resume', 'interface-draft-continue', 'interface-draft-choice')][string]$Scenario = 'core',
    [switch]$KeepArtifacts
)

# Keep the UTF-8 BOM: Windows PowerShell 5.1 otherwise reads Portuguese text as ANSI.

$ErrorActionPreference = 'Stop'
$Scenario = $Scenario.ToLowerInvariant()
$strictUtf8 = New-Object Text.UTF8Encoding($false, $true)

$repoRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($VoiceDirectory)) {
    $sourceVoiceDirectory = Join-Path $repoRoot 'src-tauri\resources\voice'
} else {
    $sourceVoiceDirectory = [IO.Path]::GetFullPath($VoiceDirectory)
}
foreach ($path in @((Join-Path $sourceVoiceDirectory 'whisper-cli.exe'), (Join-Path $sourceVoiceDirectory 'ggml-small-q5_1.bin'))) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Recurso ausente: $path" }
}

# Match the app's current prompt and the opt-in Rust harness's fixed synthetic names.
$nativeSource = [IO.File]::ReadAllText((Join-Path $repoRoot 'src-tauri\src\native_voice.rs'), $strictUtf8)
$promptMatch = [regex]::Match($nativeSource, 'const INITIAL_PROMPT: &str = "([^"\r\n]*)";')
if (-not $promptMatch.Success) { throw 'Production INITIAL_PROMPT is missing.' }
$patientNames = @('Ana Clara', 'Bia Fictícia')
$prompt = $promptMatch.Groups[1].Value
foreach ($patientName in $patientNames) { $prompt += ' ' + $patientName + '.' }
if ($strictUtf8.GetByteCount($prompt) -gt 1000 -or $prompt -match '[\r\n\x00]') { throw 'Invalid bounded production prompt.' }

$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
$testDirectory = Join-Path $tempBase ('circulo-whisper-synthetic-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testDirectory | Out-Null
$voiceDirectory = Join-Path $testDirectory 'voice'
New-Item -ItemType Directory -Path $voiceDirectory | Out-Null
Get-ChildItem -LiteralPath $sourceVoiceDirectory -File | ForEach-Object {
    New-Item -ItemType HardLink -Path (Join-Path $voiceDirectory $_.Name) -Target $_.FullName | Out-Null
}
$whisper = Join-Path $voiceDirectory 'whisper-cli.exe'
$model = Join-Path $voiceDirectory 'ggml-small-q5_1.bin'

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
    if ($Scenario -eq 'behavior-remove') {
        $commands = @('Retirar comportamento Pede ajuda da sessão de Ana Clara.', 'Remover comportamento Pede ajuda da sessão de Ana Clara.', 'Confirmar comando.')
    }
    if ($Scenario -eq 'occurrence-date') {
        $commands = @(
            'Iniciar sessão de Ana Clara em três de outubro de dois mil e vinte e seis às quinze horas.',
            'Remarcar sessão de Ana Clara no dia três de outubro de dois mil e vinte e seis às quinze horas.',
            'Cancelar sessão de Ana Clara em três de outubro de dois mil e vinte e seis às quinze horas.'
        )
    }
    if ($Scenario -eq 'analytics-range') {
        # These longer ranges must fit the app's existing 12-second audio limit.
        # Normal SAPI speed, not the deliberately slow core corpus (-2).
        $voice.Rate = 0
        $commands = @(
            'Mostrar análises de Ana Clara de um de setembro de 2026 até trinta de setembro de 2026.',
            'Mostrar análises de um de setembro de 2026 até trinta de setembro de 2026.'
        )
    }
    if ($Scenario -eq 'interface-fields') {
        $commands = @(
            'Preencher idade com nove.',
            'Preencher nota contextual de Regulação emocional com Participou com apoio.',
            'Limpar nota contextual de Regulação emocional.'
        )
    }
    if ($Scenario -eq 'interface-weekday') {
        $commands = @(
            'Selecionar Dia da semana como quinta-feira.',
            'Selecionar Dia da semana como terça-feira.',
            'Confirmar comando.'
        )
    }
    if ($Scenario -eq 'interface-party') {
        $commands = @(
            'Abrir vínculos de Ana Clara.',
            'Marcar Contato administrativo.',
            'Confirmar comando.'
        )
    }
    if ($Scenario -eq 'interface-drawer') {
        $commands = @('Abrir Novo compromisso.', 'Recolher Detalhes e ações.', 'Confirmar comando.')
    }
    if ($Scenario -eq 'interface-series') {
        $commands = @(
            'Encerrar série de Ana Clara na segunda às quinze horas.',
            'Antecipar término de Ana Clara na segunda às quinze horas.',
            'Confirmar comando.'
        )
    }
    if ($Scenario -eq 'interface-details') {
        $commands = @(
            'Abrir detalhes de Ana Clara.',
            'Ver detalhes de Ana Clara em quatro de outubro de dois mil e vinte e seis às quinze horas.',
            'Confirmar comando.'
        )
    }
    if ($Scenario -eq 'interface-draft-resume') {
        $commands = @(
            'Retomar rascunho três de outubro de dois mil e vinte e seis.',
            'Retomar rascunho três de outubro de dois mil e vinte e seis opção dois.',
            'Confirmar comando.'
        )
    }
    if ($Scenario -eq 'interface-draft-continue') {
        $commands = @(
            'Continuar sessão em três de outubro de dois mil e vinte e seis.',
            'Continuar sessão em três de outubro de dois mil e vinte e seis opção dois.',
            'Confirmar comando.'
        )
    }
    if ($Scenario -eq 'interface-draft-choice') {
        $commands = @(
            'Continuar sessão opção um.',
            'Continuar sessão opção dois.',
            'Confirmar comando.'
        )
    }
    if ($Scenario -eq 'occurrence-minutes') {
        # The absolute-date addendum exceeds 12 seconds at the core rate (-2).
        $voice.Rate = 0
        $commands = @(
            'Iniciar sessão de Ana Clara hoje às quinze horas e quarenta e cinco minutos.',
            'Remarcar sessão de Ana Clara hoje às quinze horas e quarenta e cinco minutos.',
            'Cancelar sessão de Ana Clara hoje às quinze horas e quarenta e cinco minutos.',
            'Abrir adendo da sessão de Ana Clara em três de outubro de 2026 às quinze horas e quarenta e cinco minutos.',
            'Confirmar comando.'
        )
    }
    if ($Scenario -eq 'indicator-value') {
        $voice.Rate = 0
        $commands = @(
            'Registrar indicador Regulação emocional como Com algum apoio na sessão de Ana Clara.',
            'Registrar indicador Regulação emocional como Com autonomia na sessão de Ana Clara.',
            'Confirmar comando.'
        )
    }
    if ($Scenario -eq 'clinical-append') {
        $voice.Rate = 0
        $commands = @(
            'Acrescentar observação da sessão de Ana Clara com pediu ajuda.',
            'Acrescentar procedimentos da sessão de Ana Clara com fez jogo de turnos.',
            'Acrescentar resultado da sessão de Ana Clara com manteve atenção.',
            'Acrescentar encaminhamento da sessão de Ana Clara com próxima sessão semanal.',
            'Confirmar comando.'
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
        # Only the response filename reaches argv; all file arguments stay relative ASCII.
        $responseName = "args-$index.txt"
        $responsePath = Join-Path $voiceDirectory $responseName
        $arguments = @('-m', [IO.Path]::GetFileName($model), '-f', "../synthetic-command-$index.wav", '-l', 'pt', '--prompt', $prompt, '-ng', '-nt', '-otxt', '-of', "../transcription-$index", '--beam-size', '8')
        foreach ($argument in $arguments) {
            if ($argument -match '[\r\n\x00]') { throw 'Invalid response argument.' }
        }
        $responseBytes = $strictUtf8.GetBytes(($arguments -join "`n") + "`n")
        $responseStream = [IO.File]::Open($responsePath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
        try { $responseStream.Write($responseBytes, 0, $responseBytes.Length) }
        finally { $responseStream.Dispose() }
        $clock = [Diagnostics.Stopwatch]::StartNew()
        $process = Start-Process -FilePath $whisper -ArgumentList ("@" + $responseName) -WorkingDirectory $voiceDirectory -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
        [void]$process.Handle
        if (-not $process.WaitForExit(60000)) {
            $process.Kill()
            $process.WaitForExit()
            throw 'Synthetic CLI inference exceeded 60 seconds; no retry.'
        }
        $clock.Stop()
        if ($process.ExitCode -ne 0) {
            $details = if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw } else { '' }
            throw "whisper.cpp terminou com código $($process.ExitCode). $details"
        }
        $transcriptPath = "$outputBase.txt"
        if (-not (Test-Path -LiteralPath $transcriptPath -PathType Leaf)) { throw 'whisper.cpp não produziu uma transcrição.' }
        $rawTranscript = $strictUtf8.GetString([IO.File]::ReadAllBytes($transcriptPath))
        if ([string]::IsNullOrWhiteSpace($rawTranscript)) { throw 'Empty synthetic transcript.' }
        [pscustomobject]@{
            IntendedCommand = $commands[$index]
            RawTranscript = $rawTranscript
            Transcript = $rawTranscript.Trim()
            InferenceSeconds = [math]::Round($clock.Elapsed.TotalSeconds, 2)
            AudioBytes = (Get-Item -LiteralPath $wav).Length
            ExitCode = $process.ExitCode
        }
    }
    $env:CIRCULO_SYNTHETIC_WAV_DIRECTORY = $testDirectory
    $env:CIRCULO_TEST_VOICE_RESOURCES = $sourceVoiceDirectory
    $env:CIRCULO_SYNTHETIC_WAV_COUNT = [string]$commands.Count
    Push-Location (Join-Path $repoRoot 'src-tauri')
    try {
        $nativeStdout = Join-Path $testDirectory 'native-stdout.txt'
        $nativeStderr = Join-Path $testDirectory 'native-stderr.txt'
        $nativeClock = [Diagnostics.Stopwatch]::StartNew()
        $nativeProcess = Start-Process -FilePath 'cargo' -ArgumentList @('test', '--release', '--offline', '--locked', 'native_voice::tests::transcribes_synthetic_wav_through_the_same_local_backend_as_the_app', '--', '--exact', '--ignored', '--nocapture', '--test-threads=1') -WorkingDirectory (Join-Path $repoRoot 'src-tauri') -WindowStyle Hidden -RedirectStandardOutput $nativeStdout -RedirectStandardError $nativeStderr -PassThru
        # Wait for cargo itself, avoiding PowerShell 5.1's descendant-job wait.
        [void]$nativeProcess.Handle # Retain the handle so ExitCode remains available.
        $nativeProcess.WaitForExit()
        $nativeClock.Stop()
        if ($nativeProcess.ExitCode -ne 0) { throw "Integração Rust com áudio sintético falhou (código $($nativeProcess.ExitCode)). $(Get-Content -LiteralPath $nativeStderr -Raw -Encoding UTF8)" }
        $nativeOutput = @([IO.File]::ReadAllLines($nativeStdout, $strictUtf8))
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
        $semantic = [IO.File]::ReadAllText($semanticStdout, $strictUtf8) | ConvertFrom-Json
    }
    finally {
        Pop-Location
        Remove-Item Env:CIRCULO_SYNTHETIC_WAV_DIRECTORY -ErrorAction SilentlyContinue
        Remove-Item Env:CIRCULO_TEST_VOICE_RESOURCES -ErrorAction SilentlyContinue
        Remove-Item Env:CIRCULO_SYNTHETIC_WAV_COUNT -ErrorAction SilentlyContinue
    }
    [pscustomobject]@{ Scenario = $Scenario; Voice = $voice.Voice.GetDescription(); NetworkUsed = $false; ArtifactDirectory = $testDirectory; ArtifactsPreserved = [bool]$KeepArtifacts; Cases = @($results); NativeCases = $nativeCases; NativeHarnessSeconds = [math]::Round($nativeClock.Elapsed.TotalSeconds, 2); NativeExitCode = $nativeProcess.ExitCode; SemanticExitCode = $semanticProcess.ExitCode; Semantic = $semantic } | ConvertTo-Json -Depth 10 -Compress
    if ($semantic.Failed -gt 0) { throw "$($semantic.Failed) comandos nativos não preservaram a ação e os campos esperados. Transcrição não vazia não significa funcionamento." }
}
finally {
    $resolvedDirectory = [IO.Path]::GetFullPath($testDirectory)
    if (-not $KeepArtifacts -and $resolvedDirectory.StartsWith($tempBase + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $resolvedDirectory).StartsWith('circulo-whisper-synthetic-', [StringComparison]::Ordinal)) {
        Remove-Item -LiteralPath $resolvedDirectory -Recurse -Force
    }
}
