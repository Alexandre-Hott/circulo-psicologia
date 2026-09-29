Describe 'smoke read-only do ciclo instalado' {
    BeforeAll {
    $script:SourcePath = Join-Path $PSScriptRoot '..\scripts\installedLifecycleSmoke.ps1'
    . $script:SourcePath
    function Invoke-TestSmoke([string]$Report, [scriptblock]$Processes = $script:NoProcesses, [scriptblock]$VersionReader = $script:Version, [scriptblock]$ReparseChecker = $script:Reparse) {
        Get-InstalledLifecycleSmoke -Executable $script:Exe -HashExpected $script:Expected -VersionExpected '0.2.0' -TempRoot $script:Temp -LocalAppDataRoot $script:Local -ObserveSeconds 1 -ProcessReader $Processes -WebViewReader { param($id) @() } -FileVersionReader $VersionReader -WaitReader $script:NoWait -ReparseChecker $ReparseChecker -ReportWriter $script:Writer
    }
    function New-ResponsiveProcess {
        $exePath=$script:Exe
        return { param($n) @([pscustomobject]@{ Path=$exePath; Id=71; Responding=$true; MainWindowHandle=99; Refresh={} }) }.GetNewClosure()
    }
    }

    BeforeEach {
    $script:Root = Join-Path ([IO.Path]::GetTempPath()) ('circulo-installed-smoke-' + [guid]::NewGuid().ToString('N'))
    $script:Temp = Join-Path $script:Root 'temp'
    $script:Local = Join-Path $script:Root 'local'
    $script:Data = Join-Path $script:Local 'br.circulo.psicologia'
    New-Item -ItemType Directory -Path $script:Temp,$script:Local,$script:Data -Force | Out-Null
    $script:Exe = Join-Path $script:Root 'circulo.exe'
    $bytes = [byte[]]::new(512)
    $bytes[0]=0x4D; $bytes[1]=0x5A; $bytes[0x3C]=0x80; $bytes[0x80]=0x50; $bytes[0x81]=0x45
    $bytes[0x84]=0x64; $bytes[0x85]=0x86; $bytes[0x86]=1; $bytes[0x94]=0xF0; $bytes[0x98]=0x0B; $bytes[0x99]=2
    [IO.File]::WriteAllBytes($script:Exe,$bytes)
    $script:Expected = (Get-FileHash $script:Exe -Algorithm SHA256).Hash.ToLowerInvariant()
    $script:Version = { param($p) [pscustomobject]@{ ProductVersion='0.2.0'; FileVersion='0.2.0' } }
    $script:NoProcesses = { param($n) @() }
    $script:NoWait = { param($s) }
    $script:Reparse = { param($p,$missing) }
    $script:LastReportHolder = Join-Path $script:Root 'last-report-path.txt'
    $global:CirculoSmokeTestLastReportHolder = $script:LastReportHolder
    $script:Writer = { param($root,$report) $path=Join-Path $root ('fake-' + [guid]::NewGuid().ToString('N') + '.json'); [IO.File]::WriteAllText($path,($report | ConvertTo-Json -Depth 8)); [IO.File]::WriteAllText($global:CirculoSmokeTestLastReportHolder,$path); $path }
    }

    It 'PE valido, processo ausente e limites de smoke explícitos' {
        $r=Invoke-TestSmoke 'unused'
        if (-not $r.checks.peArchitectureIsX64 -or $r.existingProcess.status -ne 'not-running') { throw 'resultado inesperado' }
        if ($r.status -ne 'failed-or-incomplete' -or $r.localDataInventory.scope -notmatch 'Only current code-known names/patterns' -or $r.localDataInventory.scope -notmatch 'Unknown arbitrary names and future formats are outside this inventory') { throw 'gate ou escopo inválido' }
        if (@('UI','clicks','CRUD','backup','restore','uninstallation' | Where-Object { $_ -notin $r.notTested }).Count) { throw 'limites não declarados' }
    }

    It 'correlaciona processo pelo caminho e WebView2 por parent PID' {
        $process=New-ResponsiveProcess
        $children={ param($id) @([pscustomobject]@{ Name='msedgewebview2.exe'; ParentProcessId=71 },[pscustomobject]@{ Name='msedgewebview2.exe'; ParentProcessId=999 }) }
        $r=Get-InstalledLifecycleSmoke -Executable $script:Exe -HashExpected $script:Expected -VersionExpected '0.2.0' -TempRoot $script:Temp -LocalAppDataRoot $script:Local -ObserveSeconds 1 -ProcessReader $process -WebViewReader $children -FileVersionReader $script:Version -WaitReader $script:NoWait -ReparseChecker $script:Reparse -ReportWriter $script:Writer
        if ($r.existingProcess.webView2ChildrenByParentPid -ne 1 -or $r.existingProcess.status -ne 'responsive-with-window') { throw 'correlação de processo incorreta' }
    }

    It 'aprova explicitamente o gate completo com hash, versões 0.2.0, PE x64 e processo responsivo' {
        $process=New-ResponsiveProcess
        $r=Get-InstalledLifecycleSmoke -Executable $script:Exe -HashExpected $script:Expected -VersionExpected '0.2.0' -TempRoot $script:Temp -LocalAppDataRoot $script:Local -ObserveSeconds 1 -ProcessReader $process -WebViewReader { param($id) @() } -FileVersionReader $script:Version -WaitReader $script:NoWait -ReparseChecker $script:Reparse -ReportWriter $script:Writer

        if ($r.status -cne 'passed-limited-smoke' -or
            -not $r.checks.executableHashMatchesExpected -or
            -not $r.checks.productVersionMatchesExpected -or
            -not $r.checks.fileVersionMatchesExpected -or
            -not $r.checks.peArchitectureIsX64 -or
            -not $r.checks.installedProcessAlreadyRunning -or
            -not $r.checks.processResponsiveAndHasWindow -or
            -not $r.checks.knownCurrentAppArtifactsAbsent -or
            $r.executable.productVersion -cne '0.2.0' -or
            $r.executable.fileVersion -cne '0.2.0' -or
            $r.executable.peArchitecture -cne 'x64' -or
            $r.existingProcess.status -cne 'responsive-with-window' -or
            $r.executable.sha256 -cne $script:Expected) { throw 'O gate completo de aprovação não corresponde aos critérios esperados.' }
    }

    It 'rejeita hash divergente e PE inválido' {
        $thrown=$false
        try { Get-InstalledLifecycleSmoke -Executable $script:Exe -HashExpected ('a'*64) -VersionExpected '0.2.0' -TempRoot $script:Temp -LocalAppDataRoot $script:Local -ReparseChecker $script:Reparse | Out-Null } catch { $thrown=$_.Exception.Message -like '*SHA-256*' }
        if (-not $thrown) { throw 'hash divergente aceito' }
        $bad=Join-Path $script:Root 'bad.exe'; [IO.File]::WriteAllBytes($bad,[byte[]](1,2,3))
        $thrown=$false
        try { Get-InstalledLifecycleSmoke -Executable $bad -HashExpected $script:Expected -VersionExpected '0.2.0' -TempRoot $script:Temp -LocalAppDataRoot $script:Local -ReparseChecker $script:Reparse | Out-Null } catch { $thrown=$_.Exception.Message -like '*PE*' }
        if (-not $thrown) { throw 'PE inválido aceito' }
    }

    It 'exige ProductVersion e FileVersion exatamente iguais à esperada' {
        $process=New-ResponsiveProcess
        foreach ($badVersion in @(
            [pscustomobject]@{ ProductVersion='0.2.1'; FileVersion='0.2.0' },
            [pscustomobject]@{ ProductVersion='0.2.0'; FileVersion='0.2.1' }
        )) {
            $reader={ param($p) $badVersion }.GetNewClosure()
            $r=Get-InstalledLifecycleSmoke -Executable $script:Exe -HashExpected $script:Expected -VersionExpected '0.2.0' -TempRoot $script:Temp -LocalAppDataRoot $script:Local -ProcessReader $process -FileVersionReader $reader -WaitReader $script:NoWait -ReparseChecker $script:Reparse -ReportWriter $script:Writer
            if ($r.status -eq 'passed-limited-smoke') { throw 'versão divergente passou' }
        }
    }

    It 'não aprova arquitetura PE desconhecida' {
        $unknown=Join-Path $script:Root 'unknown.exe'
        $pe=[IO.File]::ReadAllBytes($script:Exe); $pe[0x84]=0x34; $pe[0x85]=0x12; [IO.File]::WriteAllBytes($unknown,$pe)
        $hash=(Get-FileHash $unknown -Algorithm SHA256).Hash
        $path=$script:Exe; $process={ param($n) @([pscustomobject]@{ Path=$path; Id=72; Responding=$true; MainWindowHandle=1; Refresh={} }) }.GetNewClosure()
        $r=Get-InstalledLifecycleSmoke -Executable $unknown -HashExpected $hash -VersionExpected '0.2.0' -TempRoot $script:Temp -LocalAppDataRoot $script:Local -ProcessReader $process -FileVersionReader $script:Version -WaitReader $script:NoWait -ReparseChecker $script:Reparse -ReportWriter $script:Writer
        if ($r.executable.peArchitecture -ne 'unknown' -or $r.status -eq 'passed-limited-smoke') { throw 'arquitetura desconhecida aprovada' }
    }

    It 'detecta todas as famílias conhecidas, agrega e redige nomes/caminhos/conteúdo e limpa fixtures' {
        $fixtures=@(
            @{ Name='restore.pending'; Category='recovery'; Directory=$false },
            @{ Name='restore-db'; Category='recovery'; Directory=$false },
            @{ Name='restore-db-synthetic'; Category='recovery'; Directory=$false },
            @{ Name='restore-key-synthetic'; Category='recovery'; Directory=$false },
            @{ Name='restore-stage-synthetic'; Category='recovery'; Directory=$true },
            @{ Name='auto-restore-stage-synthetic'; Category='recovery'; Directory=$false },
            @{ Name='circulo.db'; Category='database'; Directory=$false },
            @{ Name='vault.key'; Category='key'; Directory=$false },
            @{ Name='auto-backup.db'; Category='database'; Directory=$false },
            @{ Name='auto-backup.previous.db'; Category='database'; Directory=$false },
            @{ Name='previous-db-synthetic'; Category='database'; Directory=$false },
            @{ Name='pre-auto-restore-synthetic'; Category='database'; Directory=$false },
            @{ Name='quarantine-synthetic'; Category='recovery'; Directory=$true },
            @{ Name='pre-restore-synthetic.circulo-backup'; Category='backup'; Directory=$false },
            @{ Name='pre-migration-synthetic.db'; Category='database'; Directory=$false },
            @{ Name='synthetic.circulo-backup'; Category='backup'; Directory=$false }
        )
        foreach ($fixture in $fixtures) {
            $path=Join-Path $script:Data $fixture.Name
            try {
                if ($fixture.Directory) {
                    New-Item -ItemType Directory -Path $path -Force | Out-Null
                    [IO.File]::WriteAllText((Join-Path $path 'synthetic-secret.bin'),'synthetic secret')
                } else { [IO.File]::WriteAllText($path,'synthetic secret') }
                $thrown=$false
                try { Invoke-TestSmoke 'unused' | Out-Null } catch { $thrown=$_.Exception.Message -like '*Artefatos conhecidos*' }
                if (-not $thrown) { throw 'Uma fixture conhecida não bloqueou o gate.' }
                $reportPath=[IO.File]::ReadAllText($script:LastReportHolder)
                $json=[IO.File]::ReadAllText($reportPath)
                $parsed=ConvertFrom-Json $json
                $fixtureNameIsSpecific=$fixture.Name -notin @('restore.pending','restore-db','circulo.db','vault.key','auto-backup.db','auto-backup.previous.db')
                if (($fixtureNameIsSpecific -and $json -match [regex]::Escape($fixture.Name)) -or $json -match 'synthetic secret|synthetic-secret\.bin' -or $json -match [regex]::Escape($script:Data) -or [int]$parsed.localDataInventory.knownCurrentAppArtifactCount -ne 1 -or [int]$parsed.localDataInventory.knownCurrentAppArtifactCategories.($fixture.Category) -ne 1) { throw "Relatório não agregado/redigido ou categoria incorreta para fixture $($fixture.Name)." }
            } finally {
                Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction SilentlyContinue
            }
            if (Test-Path -LiteralPath $path) { throw 'Limpeza do fixture deixou artefatos no diretório temporário.' }
        }
        $remaining=@(Get-ChildItem -LiteralPath $script:Data -Force)
        if ($remaining.Count -ne 0) { throw 'A limpeza dos fixtures deixou itens no diretório de dados.' }
        New-Item -ItemType Directory -Path (Join-Path $script:Data 'EBWebView\Default') -Force | Out-Null
        [IO.File]::WriteAllText((Join-Path $script:Data 'arbitrary-private-name.txt'),'no content')
        $unknownExe=Join-Path $script:Root 'unknown.exe'
        $pe=[IO.File]::ReadAllBytes($script:Exe); $pe[0x84]=0x34; $pe[0x85]=0x12; [IO.File]::WriteAllBytes($unknownExe,$pe)
        $unknownHash=(Get-FileHash $unknownExe -Algorithm SHA256).Hash
        $unknownProcessPath=$unknownExe
        $unknownProcess={ param($n) @([pscustomobject]@{ Path=$unknownProcessPath; Id=73; Responding=$true; MainWindowHandle=1; Refresh={} }) }.GetNewClosure()
        $r=Get-InstalledLifecycleSmoke -Executable $unknownExe -HashExpected $unknownHash -VersionExpected '0.2.0' -TempRoot $script:Temp -LocalAppDataRoot $script:Local -ProcessReader $unknownProcess -FileVersionReader $script:Version -WaitReader $script:NoWait -ReparseChecker $script:Reparse -ReportWriter $script:Writer
        if (-not $r.localDataInventory.ebWebViewPresent -or $r.status -ne 'failed-or-incomplete' -or [int]$r.localDataInventory.knownCurrentAppArtifactCount -ne 0) { throw 'runtime/cache ou nome arbitrário confundido com artefato conhecido' }
        $json=[IO.File]::ReadAllText([IO.File]::ReadAllText($script:LastReportHolder))
        if ($json -match 'arbitrary-private-name|Default') { throw 'inventário expôs nome arbitrário' }
    }

    It 'falha fechado em reparse point filho ou ancestral e não segue diretório filho' {
        $checked=[Collections.Generic.List[string]]::new()
        $checker={ param($p,$missing) $checked.Add([string]$p); if ([string]$p -match 'reparse-child|reparse-parent') { throw 'ReparsePoint detectado' } }.GetNewClosure()
        New-Item -ItemType Directory -Path (Join-Path $script:Data 'reparse-child\must-not-enter') -Force | Out-Null
        foreach ($needle in @('reparse-child','reparse-parent')) {
            $localPath=$script:Local
            $exe=$script:Exe
            $custom={ param($p,$missing) & $checker $p $missing; if ($needle -eq 'reparse-parent' -and [string]$p -eq $localPath) { throw 'ReparsePoint ancestral detectado' } }.GetNewClosure()
            $thrown=$false
            try { Get-InstalledLifecycleSmoke -Executable $exe -HashExpected $script:Expected -VersionExpected '0.2.0' -TempRoot $script:Temp -LocalAppDataRoot $script:Local -ReparseChecker $custom -ReportWriter $script:Writer | Out-Null } catch { $thrown=$true }
            if (-not $thrown) { throw "$needle não bloqueou inventário" }
        }
        if ($checked | Where-Object { $_ -like '*reparse-child\must-not-enter*' }) { throw 'recursão entrou no descendente antes da validação do diretório' }
        Remove-Item -LiteralPath (Join-Path $script:Data 'reparse-child') -Recurse -Force
    }

    It 'Assert-NoReparseAncestors rejeita junction real temporária quando o sistema permite' {
        $junctionTarget=Join-Path $script:Root 'junction-target'
        $junctionPath=Join-Path $script:Root 'junction-real'
        New-Item -ItemType Directory -Path $junctionTarget | Out-Null
        try {
            try {
                New-Item -ItemType Junction -Path $junctionPath -Target $junctionTarget -ErrorAction Stop | Out-Null
            } catch {
                Set-ItResult -Skipped -Because "Windows não permitiu criar junction temporária sem elevação: $($_.Exception.Message)"
                return
            }

            $thrown=$false
            try { Assert-NoReparseAncestors $junctionPath } catch { $thrown=$_.Exception.Message -like '*ReparsePoint*' }
            if (-not $thrown) { throw 'Uma junction real é um ReparsePoint e deve ser rejeitada.' }
        } finally {
            if (Test-Path -LiteralPath $junctionPath) { Remove-Item -LiteralPath $junctionPath -Force }
        }
    }

    It 'não desce em child reparse point real durante inventário quando o sistema permite junction' {
        $outsideTarget=Join-Path $script:Data 'junction-target-sibling'
        $outsideMarker=Join-Path $outsideTarget 'must-not-enumerate.txt'
        $junction=Join-Path $script:Data 'real-junction-child'
        New-Item -ItemType Directory -Path $outsideTarget | Out-Null
        [IO.File]::WriteAllText($outsideMarker,'synthetic marker')
        try {
            try {
                New-Item -ItemType Junction -Path $junction -Target $outsideTarget -ErrorAction Stop | Out-Null
            } catch {
                Set-ItResult -Skipped -Because "Windows não permitiu criar junction temporária sem elevação: $($_.Exception.Message)"
                return
            }

            $visited=[Collections.Generic.List[string]]::new()
            $realChecker={ param($p,$missing) $visited.Add([string]$p); Assert-NoReparseAncestors $p -AllowMissingLeaf:$missing }.GetNewClosure()
            $thrown=$false
            try {
                Get-InstalledLifecycleSmoke -Executable $script:Exe -HashExpected $script:Expected -VersionExpected '0.2.0' -TempRoot $script:Temp -LocalAppDataRoot $script:Local -ReparseChecker $realChecker -ReportWriter $script:Writer | Out-Null
            } catch { $failureMessage=$_.Exception.Message; $thrown=$true }

            if (-not $thrown) { throw "O inventário deveria falhar ao encontrar a junction antes de percorrê-la (exception='$failureMessage', checked=$($visited -join '|'))." }
            if ($visited -contains $outsideMarker) { throw 'O checker inspecionou o conteúdo sob a junction.' }
            if ($visited -contains $outsideTarget) { throw 'A rotina percorreu o alvo da junction.' }
            if (-not (Test-Path -LiteralPath $outsideMarker)) { throw 'O marcador externo deveria permanecer intacto.' }
        } finally {
            if (Test-Path -LiteralPath $junction) { Remove-Item -LiteralPath $junction -Force }
            Remove-Item -LiteralPath $outsideTarget -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    It 'aleatoriza nome de relatório e informa honestamente o limite de corrida' {
        Remove-Item -LiteralPath (Join-Path $script:Data 'EBWebView') -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath (Join-Path $script:Data 'arbitrary-private-name.txt') -Force -ErrorAction SilentlyContinue
        $r=Invoke-TestSmoke 'ignored-report-path'
        if ($r.reportPathRaceLimit -notmatch 'adversarial concurrent user' -or $r.reportPathRaceLimit -notmatch 'CreateNew') { throw 'limite do caminho não documentado' }
        $first=Write-SmokeReport $script:Temp ([ordered]@{ test=1 })
        $second=Write-SmokeReport $script:Temp ([ordered]@{ test=2 })
        if ($first -eq $second -or -not (Test-Path $first) -or -not (Test-Path $second)) { throw 'nomes aleatórios não distintos' }
    }

    AfterEach {
        Remove-Item -LiteralPath $script:Root -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Variable CirculoSmokeTestLastReportHolder -Scope Global -ErrorAction SilentlyContinue
    }
}
