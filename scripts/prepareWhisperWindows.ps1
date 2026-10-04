$ErrorActionPreference = 'Stop'

$archiveUrl = 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.1/whisper-bin-x64.zip'
$archiveSha256 = '7d8be46ecd31828e1eb7a2ecdd0d6b314feafd82163038ab6092594b0a063539'
$modelUrl = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin'
$modelSha256 = 'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb'
$repoRoot = Split-Path -Parent $PSScriptRoot
$targetDir = Join-Path $repoRoot 'src-tauri\resources\voice'
$notice = Join-Path $targetDir 'THIRD-PARTY-NOTICES.txt'
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('circulo-whisper-prepare-' + [guid]::NewGuid().ToString('N'))

if (-not (Test-Path -LiteralPath $notice -PathType Leaf)) {
    throw "Avisos de licença ausentes: $notice. Restaure o arquivo versionado antes de preparar os recursos de voz."
}

function Assert-Sha256([string]$Path, [string]$Expected, [string]$Label) {
    $sha = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($Path)
    try { $actual = ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $sha.Dispose() }
    if ($actual -ne $Expected) {
        throw "$Label SHA-256 divergente: esperado $Expected, recebido $actual"
    }
}

function Download-File([string]$Url, [string]$Path) {
    & curl.exe --fail --location --retry 3 --silent --show-error --output $Path $Url
    if ($LASTEXITCODE -ne 0) { throw "Download falhou (curl exit $LASTEXITCODE): $Url" }
}

New-Item -ItemType Directory -Path $tempRoot | Out-Null
try {
    $archive = Join-Path $tempRoot 'whisper-bin-x64.zip'
    $model = Join-Path $tempRoot 'ggml-small-q5_1.bin'
    $extractDir = Join-Path $tempRoot 'extract'
    Write-Host 'Baixando whisper.cpp v1.9.1 (Windows x64)...'
    Download-File $archiveUrl $archive
    Assert-Sha256 $archive $archiveSha256 'Pacote whisper.cpp'
    Write-Host 'Baixando modelo candidato multilingue ggml-small-q5_1...'
    Download-File $modelUrl $model
    Assert-Sha256 $model $modelSha256 'Modelo ggml-small-q5_1'

    Expand-Archive -LiteralPath $archive -DestinationPath $extractDir
    $cli = Join-Path $extractDir 'Release\whisper-cli.exe'
    if (-not (Test-Path -LiteralPath $cli -PathType Leaf)) {
        throw 'O pacote validado não contém Release\whisper-cli.exe.'
    }
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
    Copy-Item -LiteralPath $cli -Destination (Join-Path $targetDir 'whisper-cli.exe') -Force
    Get-ChildItem -LiteralPath (Split-Path -Parent $cli) -Filter '*.dll' -File | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $targetDir $_.Name) -Force
    }
    # Keep any historical base model intact; bundle selection is an explicit whitelist.
    Copy-Item -LiteralPath $model -Destination (Join-Path $targetDir 'ggml-small-q5_1.bin') -Force
    Assert-Sha256 (Join-Path $targetDir 'ggml-small-q5_1.bin') $modelSha256 'Modelo preparado ggml-small-q5_1'
    Write-Host "Recursos verificados e preparados em $targetDir"
    foreach ($prepared in @((Join-Path $targetDir 'whisper-cli.exe'), (Join-Path $targetDir 'ggml-small-q5_1.bin'))) {
        $sha = [Security.Cryptography.SHA256]::Create()
        $stream = [IO.File]::OpenRead($prepared)
        try { Write-Host (([IO.Path]::GetFileName($prepared)) + ' SHA-256: ' + ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()) }
        finally { $stream.Dispose(); $sha.Dispose() }
    }
}
finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
