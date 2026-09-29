# Handoff operacional — próximos passos do usuário

Nenhuma senha, token, certificado ou chave deve ser enviada em chat, salva em arquivo do projeto ou commitada.

## Ações de validação do instalador

O preflight local é somente leitura do EXE e grava um relatório novo em `%TEMP%`; não instala nem inicia o aplicativo. Execute a auditoria Node e o checklist PowerShell com o instalador 0.2.0 disponível localmente:

```powershell
$installer = 'C:\caminho\local\Círculo_0.2.0_x64-setup.exe'
node scripts/auditWindowsInstaller.js --installer $installer --expected-version 0.2.0 --manifest (Join-Path $env:TEMP 'circulo-nsis-audit-recheck.json') --signature unsigned
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/preflightInstalledSmokeTest.ps1 -InstallerPath $installer -ReportPath (Join-Path $env:TEMP 'circulo-nsis-smoke-preflight.json')
```

O hash esperado fica fixado no script ao SHA-256 do NSIS 0.2.0 registrado em `plano-desktop-windows.md`. As etapas do preflight permanecem `not-run`; as flags do manifesto registram o snapshot de auditoria anterior à instalação. Para completar o checklist, preparar uma VM Windows descartável com snapshot, sem instalação anterior do Círculo; usar exclusivamente dados sintéticos e inspecionar persistência, backup/restauração, atalhos e desinstalação dentro dessa VM. O teste automatizado PowerShell requer Pester e usa mocks/EXE sintético: `Invoke-Pester ./test/preflightInstalledSmokeTest.Tests.ps1`.

### Estado posterior observado — 26/09/2026

Após autorização, o NSIS 0.2.0 foi iniciado e instalado no perfil atual (`C:\Users\alexandre\AppData\Local\Círculo`), sem VM isolada. Foram vistos o registro HKCU `DisplayName=Círculo`, versão `0.2.0`, e o atalho no menu Iniciar. `circulo.exe` continuou `Responding`, com título de janela `Círculo`. O helper `@oai/sky` falhou duas vezes ao capturar a janela (`FrameArrived timed out: timed out waiting on channel`; recuperação `window capture timed out...`), então nenhum formulário ou fluxo visual foi operado/validado. Em `%LOCALAPPDATA%\br.circulo.psicologia`, observou-se somente `EBWebView`; nenhum cadastro ou dado sintético foi inserido. O app segue instalado e aberto; desinstalação não realizada. Persistência, fluxos visuais, backup/restauração e desinstalação continuam pendentes, e não há validação funcional end-to-end. As flags históricas do manifesto continuam representando corretamente a auditoria anterior à instalação.

### Smoke somente leitura do processo instalado — 26/09/2026

O script `scripts/installedLifecycleSmoke.ps1` e Pester 11/11 passaram. Uma execução read-only no aplicativo já aberto confirmou hash SHA-256 `a64da64e7e501c782e191a5bde5b79ed23dab981a20f7fddd3a6c39ec6972e1d`, produto/arquivo `0.2.0`, PE x64, processo com janela responsiva durante 3 segundos, e um processo WebView2 associado por PID pai. A enumeração resumiu 342 itens locais, com `EBWebView` presente e zero dos nomes/padrões atuais conhecidos do cofre, backup e recuperação. O relatório foi salvo em `%TEMP%` com nome aleatório; não contém nomes ou conteúdo de arquivos.

Este resultado comprova somente metadados do executável, observação do processo/janela e ausência dos artefatos cujos nomes/padrões atuais estão no inventário do script. Não comprova instalação em VM limpa, conteúdo completo do perfil, criação/desbloqueio de cofre, cadastros, salvamento/reabertura, backup/restauração, UI, desinstalação ou uso clínico. A captura fornecida mostra a tela inicial de criação do cofre, mas o controle de UI foi interrompido pelo Escape; nenhuma senha foi digitada e nenhum dado foi criado.

## Ações que dependem do usuário, nesta ordem

1. Instalar Rust stable/Cargo, Visual Studio Build Tools com C++ e Windows SDK, WebView2 Runtime e NSIS no computador de build Windows.
2. Executar `npm run preflight:windows` até obter pronto para scaffold; a CLI Tauri será adicionada apenas na etapa de scaffold aprovada.
3. Escolher a estratégia de assinatura Windows: Azure Trusted Signing ou certificado comercial equivalente. Criar conta/cofre de segredos fora do projeto.
4. Decidir quem terá acesso administrativo ao repositório e à assinatura.
5. Autenticar-se no GitHub pelo fluxo normal da plataforma e criar repositório **privado**; não enviar dados clínicos, backups, chaves ou `.env`.
6. Configurar ambiente GitHub `production`, aprovações obrigatórias e segredos diretamente no cofre da plataforma, nunca no código.

## O que os agentes farão depois

- Reexecutar o preflight e ativar/validar o scaffold Tauri local.
- Implementar banco SQLCipher, migrações e autenticação local em etapas testáveis.
- Implementar backup automático cifrado, restauração atômica e migração entre computadores.
- Produzir instalador de teste não publicado, depois configurar assinatura e CI gated.
- Executar checklist de piloto sintético, revisão clínica e revisão de segurança antes de qualquer uso real.

## Gate de segurança

Não avançar para dados reais, piloto clínico, release ou distribuição enquanto o documento `auditoria-prontidao-windows.md` listar bloqueadores críticos.
