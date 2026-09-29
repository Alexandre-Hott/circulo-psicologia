# Validação do release Windows 0.2.1

Estado consolidado em 27/09/2026 (America/Sao_Paulo). Este registro separa evidência de instalação/inicialização de testes funcionais sintéticos. Não foram usados dados clínicos reais.

## Artefato e instalação

- NSIS 0.2.1 x64: `%TEMP%\circulo-target-nsis-20260926-8c2e7a4f\release\bundle\nsis\Círculo_0.2.1_x64-setup.exe`.
- SHA-256: `b872fd6b0fd28c174721e99878a3d99cdc80e33daf7598088158e7ff3a627150`; tamanho: 4.187.555 bytes; Authenticode: `NotSigned`.
- O instalador foi aberto e executado em modo silencioso (`/S`), com código de saída 0. Instalou/atualizou `%LOCALAPPDATA%\Círculo\circulo.exe`, cuja ProductVersion e FileVersion são 0.2.1; PE x64.
- O aplicativo instalado abriu: houve processo responsivo, janela e um WebView2. O `installedLifecycleSmoke` passou nas verificações de hash, versão, PE x64, processo e ausência de artefatos conhecidos de cofre no perfil. Nenhum cofre, paciente ou dado sintético foi criado no perfil real.
- A auditoria de metadados do NSIS está em `%TEMP%\circulo-0.2.1-empty-restore-audit-8c2e7a4f.json`. O campo `contentInspection: not-performed` registra que o conteúdo interno do bundle não foi inspecionado; a execução posterior do instalador não muda esse alcance da auditoria.

## Guarda manual de consistência

O comando abaixo compara versões do projeto e do manifesto, nome/arquitetura do NSIS, tamanho e SHA-256 recalculados, além das referências no README e nesta nota. Todos os caminhos são explícitos. Ele é somente leitura e **não** altera os campos antigos `installationTested`, `appRuntimeTested` ou `uninstallationTested` do manifesto, que descrevem apenas o alcance da auditoria original.

```powershell
node scripts/verifyReleaseConsistency.js `
  --expected-version 0.2.1 `
  --package .\package.json `
  --tauri-config .\src-tauri\tauri.conf.json `
  --manifest "$env:TEMP\circulo-0.2.1-empty-restore-audit-8c2e7a4f.json" `
  --installer "$env:TEMP\circulo-target-nsis-20260926-8c2e7a4f\release\bundle\nsis\Círculo_0.2.1_x64-setup.exe" `
  --readme .\README.md `
  --release-note .\docs\validacao-release-0.2.1.md
```

Os testes automatizados dessa guarda usam somente fixtures sintéticas e não exigem o NSIS local.

## Testes funcionais em ambiente sintético

- Rust: 30/30 testes na configuração padrão e 30/30 com a feature `native-smoke-test`.
- Self-test nativo release: passou com código 0. Exercita cofre, paciente, Agenda remarcada, sessão/indicador e roundtrip CBK1 v5 para segundo perfil temporário vazio com nova senha local. Não usa o perfil do aplicativo instalado.
- JavaScript: 132/132 testes passaram, incluindo a guarda de consistência e sua integração Windows com alias 8.3 real (executada neste host sem skip; em ambiente sem alias distinto, esse teste é marcado como skipped). Cinco E2E focados passaram; eles simulam comandos Tauri e não comprovam a interface do executável instalado.

## Limites e pendências

- O smoke instalado confirma apenas instalação/atualização e inicialização básica. Cliques da UI, CRUD, backup/restauração visual, bloqueio automático, transferência entre computadores, desinstalação e uso real não foram testados no aplicativo instalado.
- O pacote não tem assinatura digital. Nem o smoke de processo nem os testes sintéticos equivalem à validação funcional ou à aprovação para atendimento real.
- CBK1 v1–v4 e bancos legados continuam sem migração validada e são recusados. Perfil local incompleto ou ocupado não é destino da restauração v5 em perfil vazio.
- Limpeza genérica de recovery continua fora de escopo. Interrupção abrupta antes da publicação da restauração pode deixar staging cifrado em pasta irmã, sem limpeza automática; preserve o CBK1 original.
