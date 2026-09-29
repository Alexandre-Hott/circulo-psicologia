Describe 'preflight do smoke test instalado (somente metadata)' {
    $script:SourcePath = Join-Path $PSScriptRoot '..\scripts\preflightInstalledSmokeTest.ps1'
    . $script:SourcePath
    $script:TempRoot = Join-Path ([IO.Path]::GetTempPath()) ('circulo-preflight-tests-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $script:TempRoot | Out-Null
    $script:Installer = Join-Path $script:TempRoot 'synthetic-installer.exe'
    [IO.File]::WriteAllBytes($script:Installer, [byte[]](1, 2, 3, 4))
    $script:Hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    $script:VersionReader = { param($p) [pscustomobject]@{ ProductVersion = '0.2.0'; FileVersion = '0.2.0' } }
    $script:SignatureReader = { param($p) [pscustomobject]@{ Status = 'NotSigned' } }
    $script:HashReader = { param($p) $script:Hash }

    It 'registra hash divergente como falha sem alterar status not-run' {
        $report = Join-Path $script:TempRoot 'hash-diverge.json'
        $result = Invoke-InstallerPreflight -Installer $script:Installer -OutputReport $report -HashExpected ('b' * 64) -TempRoot $script:TempRoot -HashReader $script:HashReader -VersionReader $script:VersionReader -SignatureReader $script:SignatureReader
        if ($result.checks.metadataMatchesPinnedArtifact) { throw 'hash divergente foi aceito' }
        if ($result.preflightStatus -ne 'not-run') { throw 'status deve permanecer not-run' }
        if ((Get-Content $report -Raw | ConvertFrom-Json).preflightStatus -ne 'not-run') { throw 'relatorio deve permanecer not-run' }
    }

    It 'registra instalador ausente sem consultar hash, versao ou assinatura' {
        $readerCalls = 0
        $reader = { param($p) $readerCalls++; throw 'nao deveria consultar' }.GetNewClosure()
        $result = Invoke-InstallerPreflight -Installer (Join-Path $script:TempRoot 'missing.exe') -OutputReport (Join-Path $script:TempRoot 'ausente.json') -TempRoot $script:TempRoot -HashReader $reader -VersionReader $reader -SignatureReader $reader
        if ($result.checks.filePresent) { throw 'arquivo ausente foi marcado presente' }
        if ($result.preflightStatus -ne 'not-run') { throw 'status deve permanecer not-run' }
    }

    It 'registra divergencia de versao e assinatura' {
        $version = { param($p) [pscustomobject]@{ ProductVersion = '9.9.9'; FileVersion = '9.9.9' } }
        $signature = { param($p) [pscustomobject]@{ Status = 'Valid' } }
        $result = Invoke-InstallerPreflight -Installer $script:Installer -OutputReport (Join-Path $script:TempRoot 'metadata-diverge.json') -TempRoot $script:TempRoot -HashReader $script:HashReader -VersionReader $version -SignatureReader $signature
        if ($result.checks.versionIs020) { throw 'versao divergente foi aceita' }
        if ($result.checks.signatureIsNotSigned) { throw 'assinatura divergente foi aceita' }
        if ($result.preflightStatus -ne 'not-run') { throw 'status deve permanecer not-run' }
    }

    It 'rejeita caminho de relatorio fora do Temp' {
        $thrown = $false
        try { Invoke-InstallerPreflight -Installer $script:Installer -OutputReport (Join-Path $PSScriptRoot 'forbidden.json') -TempRoot $script:TempRoot | Out-Null }
        catch { $thrown = $_.Exception.Message -like '*filho direto*' }
        if (-not $thrown) { throw 'caminho de saida fora de Temp nao foi rejeitado' }
    }

    It 'rejeita subdiretorio mesmo que esteja dentro de Temp' {
        $nested = Join-Path $script:TempRoot 'nested'
        New-Item -ItemType Directory -Path $nested | Out-Null
        try {
            Invoke-InstallerPreflight -Installer $script:Installer -OutputReport (Join-Path $nested 'report.json') -TempRoot $script:TempRoot | Out-Null
            throw 'subdiretorio deveria ser rejeitado'
        } catch { if ($_.Exception.Message -notlike '*filho direto*') { throw } }
    }

    It 'não trunca relatório preexistente quando CreateNew encontra colisão' {
        $report = Join-Path $script:TempRoot 'preexisting.json'
        [IO.File]::WriteAllText($report, 'keep-this-content')
        try {
            Invoke-InstallerPreflight -Installer $script:Installer -OutputReport $report -TempRoot $script:TempRoot | Out-Null
            throw 'arquivo preexistente deveria causar falha'
        } catch { if ($_.Exception.Message -notlike '*já existe*') { throw } }
        if ([IO.File]::ReadAllText($report) -ne 'keep-this-content') { throw 'arquivo preexistente foi alterado' }
    }

    It 'não aceita override de hash na interface operacional da CLI' {
        $tokens = $null; $errors = $null
        $ast = [Management.Automation.Language.Parser]::ParseFile($script:SourcePath, [ref]$tokens, [ref]$errors)
        $paramBlock = $ast.ParamBlock.Extent.Text
        if ($paramBlock -match 'ExpectedSha256') { throw 'CLI expõe ExpectedSha256' }
        $command = Get-Command $script:SourcePath
        if ($command.Parameters.ContainsKey('ExpectedSha256')) { throw 'CLI publica ExpectedSha256' }
        if ($script:PinnedSha256 -ne 'f38cb9ab5a00f1d5394317aeddf48ec18090303098bcf3ba41b2c79ba202b16f') { throw 'hash operacional não está fixado' }
    }

    It 'rejeita ReparsePoint no instalador antes de chamar leitores' {
        $reader = { param($p) throw 'leitor não deveria ser chamado' }
        $thrown = $false
        try { Invoke-InstallerPreflight -Installer $script:Installer -OutputReport (Join-Path $script:TempRoot 'reparse.json') -TempRoot $script:TempRoot -HashReader $reader -VersionReader $reader -SignatureReader $reader -ReparsePointChecker { param($p, $description) if ($p -eq $script:Installer) { throw 'mock ReparsePoint' }; Assert-NoReparsePoint $p $description } }
        catch { $thrown = $_.Exception.Message -like '*ReparsePoint*' }
        if (-not $thrown) { throw 'ReparsePoint mock não foi rejeitado' }
    }

    It 'marca toda etapa de instalacao, persistencia, backup, atalhos e remocao como not-run' {
        $result = Invoke-InstallerPreflight -Installer $script:Installer -OutputReport (Join-Path $script:TempRoot 'all-not-run.json') -TempRoot $script:TempRoot -HashReader $script:HashReader -VersionReader $script:VersionReader -SignatureReader $script:SignatureReader
        if ($result.preflightStatus -ne 'not-run') { throw 'status deve permanecer not-run' }
        if (@($result.futureVmChecklist.Values | Where-Object { $_ -ne 'not-run' }).Count -ne 0) { throw 'etapa futura foi marcada como executada' }
        if ($result.executionBoundary -notmatch 'nao provam autenticidade, origem, conteudo nem uso') { throw 'limitação de confiança ausente' }
        if (-not $result.checks.Contains('metadataMatchesPinnedArtifact')) { throw 'rótulo de metadados coincidentes ausente' }
    }

    AfterAll {
        Remove-Item -LiteralPath $script:TempRoot -Recurse -Force
    }
}
