# Validação local 0.2.13 — 28/09/2026

Instalador NSIS x64: `release/Círculo_0.2.13_x64-setup.exe` (4.254.804 bytes); SHA-256 `cfba4afb7f3ed168efef4ca4c859e1de1b23be438c434e63e6655807900e9e36`. Bundle original em `C:\Users\alexandre\Documents\Codex\build-circulo-023\release\bundle\nsis\Círculo_0.2.13_x64-setup.exe`; a cópia tem o mesmo hash. Versão PE 0.2.13, x64, Authenticode `NotSigned`.

- Escopo: home desktop com Pacientes, Agenda e criação/início direto de sessão avulsa; prévia derivada da agenda persistente; bloqueio visual imediato na virada do dia. O backend usa cache diário DPAPI vinculado ao usuário Windows e revogação no bloqueio manual. O identificador Tauri e o esquema de dados foram preservados. Versões npm, crate Rust e Tauri alinhadas em 0.2.13; dependências mantidas.
- Verificações nesta rodada: `npm run lint`, `npm run build`, `npm test` (142/142), E2E desktop `test/e2e/desktop-vault-shell.spec.js` (28/28) e `cargo test --release --offline -- --skip single_instance` (65 aprovados, 2 filtrados). O E2E completo 128/128 foi informado pelo usuário antes da última correção frontend e não foi reexecutado nesta rodada. Os testes de instância única foram filtrados para não interferir no aplicativo instalado.
- Build: `npm exec tauri build -- --bundles nsis`, com `CARGO_TARGET_DIR=C:\Users\alexandre\Documents\Codex\build-circulo-023` e `CARGO_NET_OFFLINE=true`, terminou com código 0. O linker emitiu avisos LNK4099 por PDB ausente do OpenSSL, sem falha do bundle.
- Smoke nativo opt-in: `cargo build --release --offline --features native-smoke-test` e `build-circulo-023\release\circulo.exe --self-test` terminaram com código 0 após o bundle. O teste usa arquivos sintéticos temporários; o binário compilado depois do NSIS não altera o instalador já gerado.
- Auditoria: `scripts/auditWindowsInstaller.js` confirmou SHA-256, tamanho, PE 0.2.13, x64 e `NotSigned`. Manifesto: `%TEMP%\circulo-0213-audit-20260928.json`. O verificador de consistência confere o instalador, manifesto, versões npm/Tauri, README e esta nota.

Na preparação do pacote, o instalador não foi executado ou instalado e o perfil local não foi acessado. A auditoria não extraiu o NSIS nem examinou seu conteúdo interno.

## Atualização pós-instalação informada pelo usuário

Depois do empacotamento, o usuário informou que fechou normalmente o aplicativo e fez backup binário de `circulo.db`, `vault.key` e `auto-backup.db` em `C:\Users\alexandre\Documents\Codex\circulo-profile-backup-before-0213-20260928`, conferindo os hashes. Em seguida, executou o instalador 0.2.13 silenciosamente sobre a instalação atual com `/S` (saída 0). O PE instalado informou `ProductVersion` 0.2.13. Os três arquivos do perfil permaneceram inalterados imediatamente após a instalação, conforme os hashes conferidos. O aplicativo foi aberto como PID 35472.

Ainda não foram verificadas a interface instalada, o desbloqueio, a migração funcional, a restauração ou a desinstalação desta versão. A abertura do processo não comprova esses fluxos. O pacote permanece sem assinatura e sem liberação para uso clínico real; usar apenas dados sintéticos. Não houve push ou publicação no GitHub nesta preparação.
