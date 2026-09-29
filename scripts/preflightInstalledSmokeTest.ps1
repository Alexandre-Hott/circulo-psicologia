[CmdletBinding()]
param(
    [Parameter()]
    [string] $InstallerPath,

    [Parameter()]
    [string] $ReportPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:PinnedSha256 = 'f38cb9ab5a00f1d5394317aeddf48ec18090303098bcf3ba41b2c79ba202b16f'

function Get-CanonicalPath([string] $Path) {
    [IO.Path]::GetFullPath($Path)
}

function Test-PathWithin([string] $Candidate, [string] $Parent) {
    $candidateFull = (Get-CanonicalPath $Candidate).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
    $parentFull = (Get-CanonicalPath $Parent).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
    return $candidateFull.Equals($parentFull, [StringComparison]::OrdinalIgnoreCase) -or
        $candidateFull.StartsWith($parentFull + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
}

function Assert-NoReparsePoint([string] $Path, [string] $Description) {
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "$Description não pode ser ReparsePoint."
    }
}

function Invoke-InstallerPreflight {
    param(
        [string] $Installer,
        [string] $OutputReport,
        [string] $HashExpected = $script:PinnedSha256,
        [scriptblock] $SignatureReader = { param($p) Get-AuthenticodeSignature -LiteralPath $p },
        [scriptblock] $VersionReader = { param($p) [Diagnostics.FileVersionInfo]::GetVersionInfo($p) },
        [scriptblock] $HashReader = { param($p) (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant() },
        [string] $TempRoot = $env:TEMP,
        [scriptblock] $ReparsePointChecker = { param($p, $description) Assert-NoReparsePoint $p $description }
    )
    if ($HashExpected -notmatch '^[a-fA-F0-9]{64}$') { throw 'O hash sintético/fixado deve conter exatamente 64 dígitos hexadecimais.' }
    if ([string]::IsNullOrWhiteSpace($TempRoot) -or -not (Test-Path -LiteralPath $TempRoot -PathType Container)) {
        throw 'TEMP precisa apontar para um diretório existente.'
    }
    $tempFull = Get-CanonicalPath $TempRoot
    $root = [IO.Path]::GetPathRoot($tempFull)
    $cursor = $tempFull
    while ($true) {
        & $ReparsePointChecker $cursor 'TempRoot e seus ancestrais'
        if ($cursor.Equals($root, [StringComparison]::OrdinalIgnoreCase)) { break }
        $cursor = Split-Path -Parent $cursor
    }
    $reportFull = Get-CanonicalPath $OutputReport
    if (-not ([IO.Path]::GetDirectoryName($reportFull)).Equals($tempFull.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar), [StringComparison]::OrdinalIgnoreCase)) {
        throw 'ReportPath precisa ser um arquivo filho direto do diretório Temp do sistema.'
    }
    if ([IO.Path]::GetExtension($reportFull) -ne '.json') { throw 'ReportPath precisa terminar em .json.' }
    if (Test-Path -LiteralPath $reportFull) {
        & $ReparsePointChecker $reportFull 'O destino do relatório'
        throw 'ReportPath já existe; escolha um arquivo novo em Temp.'
    }
    if (Test-Path -LiteralPath $Installer) { & $ReparsePointChecker $Installer 'O instalador de entrada' }

    $metadata = [ordered]@{
        installerPath = [IO.Path]::GetFullPath($Installer)
        exists = $false
        sizeBytes = $null
        sha256 = $null
        pinnedSha256 = $HashExpected.ToLowerInvariant()
        metadataMatchesPinnedArtifact = $false
        productVersion = $null
        fileVersion = $null
        signatureStatus = $null
    }
    if (Test-Path -LiteralPath $Installer -PathType Leaf) {
        $item = Get-Item -LiteralPath $Installer
        $metadata.exists = $true
        $metadata.sizeBytes = $item.Length
        if ($item.Length -gt 0) {
            $metadata.sha256 = & $HashReader $Installer
            $metadata.metadataMatchesPinnedArtifact = $metadata.sha256 -eq $metadata.pinnedSha256
            $version = & $VersionReader $Installer
            $metadata.productVersion = $version.ProductVersion
            $metadata.fileVersion = $version.FileVersion
            $signature = & $SignatureReader $Installer
            $metadata.signatureStatus = [string]$signature.Status
        }
    }

    $checks = [ordered]@{
        filePresent = [bool]$metadata.exists
        nonEmpty = [bool]($metadata.sizeBytes -gt 0)
        metadataMatchesPinnedArtifact = [bool]$metadata.metadataMatchesPinnedArtifact
        versionIs020 = [bool]($metadata.productVersion -eq '0.2.0' -or $metadata.fileVersion -eq '0.2.0')
        signatureIsNotSigned = [bool]($metadata.signatureStatus -eq 'NotSigned')
    }
    $report = [ordered]@{
        reportVersion = 1
        preflightStatus = 'not-run'
        createdAtUtc = [DateTime]::UtcNow.ToString('o')
        checks = $checks
        installer = $metadata
        futureVmChecklist = [ordered]@{
            disposableVmRequired = 'not-run'
            vmHasNoPriorInstall = 'not-run'
            useSyntheticDataOnly = 'not-run'
            installFromMatchingMetadataArtifact = 'not-run'
            launchInstalledApplication = 'not-run'
            verifyCreateCloseReopenPersistence = 'not-run'
            createAndRestoreEncryptedBackup = 'not-run'
            verifyStartMenuAndDesktopShortcuts = 'not-run'
            uninstallFromWindowsSettings = 'not-run'
            inspectRemainingUserDataAndBackups = 'not-run'
        }
        signatureInterpretation = 'NotSigned registra apenas o estado esperado; nao e fator de confianca.'
        executionBoundary = 'Este script somente le metadata; nunca executa, extrai, instala ou desinstala EXE e nao acessa registro, atalhos ou perfil do usuario. Metadados coincidentes nao provam autenticidade, origem, conteudo nem uso do artefato. NotSigned registra apenas o estado esperado e nao e fator de confianca.'
    }
    $json = $report | ConvertTo-Json -Depth 8
    $stream = $null
    try {
        $stream = [IO.File]::Open($reportFull, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        $bytes = [Text.UTF8Encoding]::new($false).GetBytes($json)
        $stream.Write($bytes, 0, $bytes.Length)
    } finally {
        if ($null -ne $stream) { $stream.Dispose() }
    }
    return $report
}

if ($MyInvocation.InvocationName -ne '.') {
    try {
        $result = Invoke-InstallerPreflight -Installer $InstallerPath -OutputReport $ReportPath
        Write-Output "Relatorio preflight: $([IO.Path]::GetFullPath($ReportPath))"
        Write-Output "Status: $($result.preflightStatus); instalacao/execucao: not-run. Metadados coincidentes nao provam autenticidade, origem, conteudo nem uso; NotSigned e somente o estado esperado."
        if (-not ($result.checks.Values -contains $false)) { exit 0 }
        exit 2
    } catch {
        Write-Error $_
        exit 1
    }
}
