[CmdletBinding()]
<#
.SYNOPSIS
Inspeciona, sem alterar, uma instância instalada do Círculo já em execução.
.DESCRIPTION
Read-only: nunca inicia, encerra, reinicia ou interage com processos. O gate
`passed-limited-smoke` verifica somente hash esperado, ProductVersion/FileVersion
exatamente igual à versão esperada, PE x64 e processo existente responsivo com janela.
O inventário local cobre somente nomes/padrões atuais conhecidos no código:
artefatos de banco/chave, backup manual e nomes de recuperação enumerados no
script. A ausência significa apenas que esses nomes/padrões atuais conhecidos
não foram encontrados no diretório atual do cofre; não cobre nomes arbitrários
desconhecidos ou formatos futuros. EBWebView é runtime/cache, não artefato de cofre.
Falha de enumeração ou ReparsePoint aborta o gate.

O relatório é criado diretamente sob Temp usando nome aleatório gerado internamente,
CreateNew e WriteThrough, o que impede sobrescrever um arquivo existente. Um usuário
adversarial com acesso concorrente ao mesmo Temp ainda pode disputar caminhos/reparse
points; isso não é uma garantia contra esse modelo de ameaça.

Não testa interface, cliques, CRUD, backup/restauração ou desinstalação. O executável
deve estar instalado e já aberto pelo usuário; este script jamais o lança.
.EXAMPLE
.
  .\scripts\installedLifecycleSmoke.ps1 -ExecutablePath 'C:\...\circulo.exe' `
    -ExpectedSha256 '<64 hex>' -ExpectedVersion '0.2.0'
#>
param(
    [Parameter()][ValidateNotNullOrEmpty()][string] $ExecutablePath,
    [Parameter()][ValidatePattern('^[a-fA-F0-9]{64}$')][string] $ExpectedSha256,
    [Parameter()][ValidatePattern('^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$')][string] $ExpectedVersion,
    [ValidateRange(1,15)][int] $ObservationSeconds = 3
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-FullPath([string] $Path) { [IO.Path]::GetFullPath($Path) }

function Assert-NoReparseAncestors([string] $Path, [switch] $AllowMissingLeaf) {
    $full = Get-FullPath $Path
    $root = [IO.Path]::GetPathRoot($full)
    $cursor = $full
    while ($null -ne $cursor -and $cursor.Length -ge $root.Length) {
        $item = Get-Item -LiteralPath $cursor -Force -ErrorAction SilentlyContinue
        if ($null -eq $item) {
            if (-not ($AllowMissingLeaf -and $cursor -eq $full)) { throw 'Um caminho necessário não existe.' }
        } elseif (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw 'Caminho com ReparsePoint não é permitido.'
        }
        if ($cursor.Equals($root, [StringComparison]::OrdinalIgnoreCase)) { break }
        $cursor = Split-Path -Parent $cursor
    }
}

function Test-WithinDirectory([string] $Candidate, [string] $Directory) {
    $base = (Get-FullPath $Directory).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    return (Get-FullPath $Candidate).StartsWith($base, [StringComparison]::OrdinalIgnoreCase)
}

function Write-SmokeReport([string] $TempRoot, [object] $Report) {
    $tempFull = Get-FullPath $TempRoot
    Assert-NoReparseAncestors $tempFull
    $path = Join-Path $tempFull ('circulo-installed-smoke-' + [guid]::NewGuid().ToString('N') + '.json')
    $stream = $null
    try {
        # Recheck immediately before exclusive creation. This is not an atomic defense
        # against an adversarial concurrent user who can mutate the shared Temp folder.
        Assert-NoReparseAncestors $tempFull
        $stream = [IO.FileStream]::new($path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None, 4096, [IO.FileOptions]::WriteThrough)
        $bytes = [Text.UTF8Encoding]::new($false).GetBytes(($Report | ConvertTo-Json -Depth 8))
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Flush($true)
    } finally { if ($null -ne $stream) { $stream.Dispose() } }
    return $path
}

function Get-InstalledLifecycleSmoke {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string] $Executable,
        [Parameter(Mandatory)][string] $HashExpected,
        [Parameter(Mandatory)][string] $VersionExpected,
        [Parameter(Mandatory)][string] $TempRoot,
        [Parameter(Mandatory)][string] $LocalAppDataRoot,
        [ValidateRange(1,15)][int] $ObserveSeconds = 3,
        [scriptblock] $ProcessReader = { param($name) Get-Process -Name $name -ErrorAction SilentlyContinue },
        [scriptblock] $WebViewReader = { param($parentId) Get-CimInstance -ClassName Win32_Process -Filter "ParentProcessId = $parentId" | Select-Object -Property Name, ParentProcessId },
        [scriptblock] $FileVersionReader = { param($p) [Diagnostics.FileVersionInfo]::GetVersionInfo($p) },
        [scriptblock] $HashReader = { param($p) (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant() },
        [scriptblock] $WaitReader = { param($seconds) Start-Sleep -Seconds $seconds },
        [scriptblock] $ClockReader = { [DateTime]::UtcNow },
        [scriptblock] $ReparseChecker = { param($p, $missing) Assert-NoReparseAncestors $p -AllowMissingLeaf:$missing },
        [scriptblock] $ReportWriter = { param($root, $report) Write-SmokeReport $root $report }
    )
    if ($HashExpected -notmatch '^[a-fA-F0-9]{64}$') { throw 'ExpectedSha256 deve conter 64 dígitos hexadecimais.' }
    if ([string]::IsNullOrWhiteSpace($VersionExpected)) { throw 'ExpectedVersion é obrigatório.' }
    foreach ($path in @($Executable, $TempRoot, $LocalAppDataRoot)) { & $ReparseChecker $path $false }
    $exeFull = Get-FullPath $Executable
    if (-not (Test-Path -LiteralPath $exeFull -PathType Leaf)) { throw 'O executável instalado não existe.' }
    if (-not (Test-Path -LiteralPath $TempRoot -PathType Container)) { throw 'Temp precisa ser um diretório existente.' }
    if (-not (Test-Path -LiteralPath $LocalAppDataRoot -PathType Container)) { throw 'A raiz local de dados precisa existir.' }

    $dataRoot = Join-Path $LocalAppDataRoot 'br.circulo.psicologia'
    $dataExists = Test-Path -LiteralPath $dataRoot -PathType Container
    if ($dataExists) { & $ReparseChecker $dataRoot $false }
    $categoryCounts = [ordered]@{ database=0; key=0; backup=0; recovery=0 }
    $webViewDataPresent = $false
    $entryCount = 0
    $knownArtifactCount = 0

    if ($dataExists) {
        # Manual depth-first enumeration: inspect each child before ever recursing into it.
        $pending = [Collections.Generic.Stack[string]]::new()
        $pending.Push($dataRoot)
        while ($pending.Count -gt 0) {
            $directory = $pending.Pop()
            & $ReparseChecker $directory $false
            try { $children = @(Get-ChildItem -LiteralPath $directory -Force -ErrorAction Stop) }
            catch { throw 'Não foi possível completar o inventário local com segurança.' }
            foreach ($entry in $children) {
                & $ReparseChecker $entry.FullName $false
                $entryCount++
                $relative = [IO.Path]::GetRelativePath($dataRoot, $entry.FullName).Replace('\','/')
                if ($relative -match '(^|/)EBWebView(/|$)') { $webViewDataPresent = $true }
                $name = [IO.Path]::GetFileName($entry.FullName)
                $category = $null
                switch -Regex ($name) {
                    '^(circulo\.db|auto-backup\.db|auto-backup\.previous\.db|previous-db-.*|pre-auto-restore-.*|pre-migration-.*\.db)$' { $category='database'; break }
                    '^vault\.key$' { $category='key'; break }
                    '^[^/]+\.circulo-backup$' { $category='backup'; break }
                    '^(restore\.pending|restore-db|restore-db-.*|restore-key-.*|restore-stage-.*|auto-restore-stage-.*|quarantine-.*)$' { $category='recovery'; break }
                }
                if ($null -ne $category) {
                    $categoryCounts[$category]++
                    $knownArtifactCount++
                }
                if ($entry.PSIsContainer) { $pending.Push($entry.FullName) }
            }
        }
    }

    $hash = (Get-FileHash -LiteralPath $exeFull -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($hash -ne $HashExpected.ToLowerInvariant()) { throw 'SHA-256 do executável não corresponde ao esperado.' }
    $version = & $FileVersionReader $exeFull
    $productVersion = [string]$version.ProductVersion
    $fileVersion = [string]$version.FileVersion

    $stream = [IO.File]::Open($exeFull, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    $reader = $null
    try {
        $reader = [IO.BinaryReader]::new($stream)
        if ($stream.Length -lt 64 -or $reader.ReadUInt16() -ne 0x5A4D) { throw 'Arquivo não contém cabeçalho PE válido.' }
        $stream.Position = 0x3C
        $peOffset = $reader.ReadInt32()
        if ($peOffset -lt 64 -or $peOffset -gt ($stream.Length - 24)) { throw 'Cabeçalho PE fora dos limites do arquivo.' }
        $stream.Position = $peOffset
        if ($reader.ReadUInt32() -ne 0x00004550) { throw 'Assinatura PE inválida.' }
        $machine = $reader.ReadUInt16(); $sections = $reader.ReadUInt16()
        $optionalHeaderOffset = $peOffset + 24
        $stream.Position = $peOffset + 20
        $optionalSize = $reader.ReadUInt16()
        if ($optionalHeaderOffset + $optionalSize -gt $stream.Length) { throw 'Cabeçalho opcional PE truncado.' }
        $stream.Position = $optionalHeaderOffset
        $magic = $reader.ReadUInt16()
        if ($sections -lt 1 -or $optionalSize -lt 2 -or @(@(0x10B,0x20B) | Where-Object { $_ -eq $magic }).Count -ne 1) { throw 'Metadados PE não reconhecidos.' }
        $architecture = switch ($machine) { 0x014c { 'x86' } 0x8664 { 'x64' } 0xAA64 { 'arm64' } default { 'unknown' } }
    } finally { if ($null -ne $reader) { $reader.Dispose() } else { $stream.Dispose() } }

    $processes = @(& $ProcessReader 'circulo')
    $target = @($processes | Where-Object {
        try { [IO.Path]::GetFullPath($_.Path).Equals($exeFull, [StringComparison]::OrdinalIgnoreCase) } catch { $false }
    }) | Select-Object -First 1
    $processStatus = 'not-running'; $webViewCount = 0
    if ($null -ne $target) {
        $before = [bool]$target.Responding
        & $WaitReader $ObserveSeconds
        try { $target.Refresh() } catch { }
        $after = [bool]$target.Responding
        $hasWindow = [bool]($target.MainWindowHandle -ne 0)
        $processStatus = if ($before -and $after -and $hasWindow) { 'responsive-with-window' } else { 'not-fully-responsive-or-no-window' }
        $targetId = [int]$target.Id
        $webViewCount = @(& $WebViewReader $targetId | Where-Object { $_.Name -match '^msedgewebview2\.exe$' -and [int]$_.ParentProcessId -eq $targetId }).Count
    }

    $hashMatches = $hash -eq $HashExpected.ToLowerInvariant()
    $productMatches = $productVersion -ceq $VersionExpected
    $fileMatches = $fileVersion -ceq $VersionExpected
    $versionMatches = $productMatches -and $fileMatches
    $architectureMatches = $architecture -ceq 'x64'
    $processMatches = $null -ne $target -and $processStatus -eq 'responsive-with-window'
    $artifactsAbsent = $knownArtifactCount -eq 0
    $passed = $hashMatches -and $versionMatches -and $architectureMatches -and $processMatches -and $artifactsAbsent
    $report = [ordered]@{
        reportVersion=2; createdAtUtc=(& $ClockReader).ToString('o')
        status=if ($passed) { 'passed-limited-smoke' } else { 'failed-or-incomplete' }
        checks=[ordered]@{
            executableHashMatchesExpected=$hashMatches
            productVersionMatchesExpected=$productMatches
            fileVersionMatchesExpected=$fileMatches
            peArchitectureIsX64=$architectureMatches
            installedProcessAlreadyRunning=($null -ne $target)
            processResponsiveAndHasWindow=$processMatches
            knownCurrentAppArtifactsAbsent=$artifactsAbsent
        }
        expectedVersion=$VersionExpected
        executable=[ordered]@{ sha256=$hash; expectedSha256=$HashExpected.ToLowerInvariant(); productVersion=$productVersion; fileVersion=$fileVersion; peArchitecture=$architecture }
        existingProcess=[ordered]@{ status=$processStatus; webView2ChildrenByParentPid=$webViewCount; observationSeconds=$ObserveSeconds; action='observed-only; no process started, stopped, restarted, or interacted with' }
        localDataInventory=[ordered]@{
            rootExists=$dataExists; ebWebViewPresent=$webViewDataPresent; entriesTotal=$entryCount
            knownCurrentAppArtifactCount=$knownArtifactCount; knownCurrentAppArtifactCategories=$categoryCounts
            scope='Only current code-known names/patterns: circulo.db; vault.key; auto-backup.db; auto-backup.previous.db; previous-db-*; pre-auto-restore-*; quarantine-*; pre-restore-*.circulo-backup; pre-migration-*.db; restore.pending; restore-db; restore-db-*; restore-key-*; restore-stage-*; auto-restore-stage-*; and *.circulo-backup. Unknown arbitrary names and future formats are outside this inventory.'
        }
        notTested=@('UI','clicks','CRUD','backup','restore','uninstallation')
        privacyBoundary='No command lines, file contents, passwords, names, arbitrary relative paths, or PII are recorded. Only EBWebView presence and counts of known current-app artifact names are summarized.'
        executionBoundary='Read-only process/file metadata inspection. Never launches, terminates, restarts, or interacts with executables. UI/clicks/CRUD/backup/restore/uninstallation were not tested.'
        reportPathRaceLimit='Random internally generated Temp filename, CreateNew and WriteThrough prevent overwriting existing files; an adversarial concurrent user able to mutate the same Temp folder may still race path/reparse checks.'
    }
    $writtenPath = & $ReportWriter $TempRoot $report
    if (-not $artifactsAbsent) { throw "Artefatos conhecidos do app encontrados; relatório redigido: $writtenPath" }
    return $report
}

if ($MyInvocation.InvocationName -ne '.' -and $PSCommandPath -eq $MyInvocation.MyCommand.Path) {
    try {
        if ([string]::IsNullOrWhiteSpace($ExecutablePath) -or [string]::IsNullOrWhiteSpace($ExpectedSha256) -or [string]::IsNullOrWhiteSpace($ExpectedVersion)) { throw 'Informe -ExecutablePath, -ExpectedSha256 e -ExpectedVersion explicitamente.' }
        $result = Get-InstalledLifecycleSmoke -Executable $ExecutablePath -HashExpected $ExpectedSha256 -VersionExpected $ExpectedVersion -TempRoot $env:TEMP -LocalAppDataRoot $env:LOCALAPPDATA -ObserveSeconds $ObservationSeconds
        Write-Output "Status: $($result.status); UI/cliques/CRUD/backup/restore/desinstalação: não testados."
        if ($result.status -eq 'passed-limited-smoke') { exit 0 }
        exit 2
    } catch { Write-Error $_; exit 1 }
}
