# Validação local 0.2.16 — 28/09/2026

Instalador NSIS x64: `release/Círculo_0.2.16_x64-setup.exe` (4.258.383 bytes); SHA-256 `9c553bbb98a8ec9d9c5c0ca8fec8adb43a7dd1a8645ff2bcbc94182b41cc43de`. Bundle original em `C:\Users\alexandre\Documents\Codex\build-circulo-024\release\bundle\nsis\Círculo_0.2.16_x64-setup.exe`, com hash idêntico. PE 0.2.16, x64, Authenticode `NotSigned`.

- Escopo: UI final com dia compacto na Agenda; versões npm, crate Rust e Tauri alinhadas em 0.2.16. Backend inalterado neste release; instaladores antigos preservados.
- Executados nesta preparação: `npm run lint`, `npm run build`, `npm test` (148/148), `npm exec tauri build -- --bundles nsis` com `CARGO_TARGET_DIR=C:\Users\alexandre\Documents\Codex\build-circulo-024` e `CARGO_NET_OFFLINE=true` (saída 0). O linker emitiu LNK4099 por PDB ausente do OpenSSL, sem impedir o bundle.
- Smoke nativo opt-in: `cargo build --release --offline --features native-smoke-test` no mesmo target, seguido de `circulo.exe --self-test` aguardado com saída 0. Essa recompilação ocorreu após o bundle e não alterou o NSIS.
- Resultados informados pelo usuário, não repetidos nesta preparação: E2E completo 141/141 **antes dos dois últimos ajustes de texto da UI**; E2E focado 39/39 **após os ajustes**; Rust anterior 66 aprovados, 2 filtrados. Como o backend não mudou, o resultado Rust é evidência da fonte anterior, não uma nova execução de 0.2.16.
- Auditoria: `scripts/auditWindowsInstaller.js` confirmou tamanho, SHA-256, PE 0.2.16, x64 e `NotSigned`. Manifesto em `%TEMP%\circulo-0216-audit-20260928.json`. O conteúdo interno do NSIS não foi extraído nem inspecionado.

Na preparação acima, o instalador não foi executado ou instalado; o perfil instalado não foi acessado e não houve push. Os fluxos da versão instalada não haviam sido verificados naquela etapa. Somente dados sintéticos foram usados; o pacote **não está liberado para dados clínicos reais**.

## Instalação local sobre 0.2.15

- Antes da instalação, confirmei o processo `circulo.exe` PID 25596 em `C:\Users\alexandre\AppData\Local\Círculo\circulo.exe`, ProductVersion 0.2.15, com janela principal `Círculo`. Solicitei o fechamento normal da janela e o processo terminou; não houve encerramento forçado.
- Criei a cópia binária integral do perfil `C:\Users\alexandre\AppData\Local\br.circulo.psicologia` em um novo diretório, `C:\Users\alexandre\Documents\Codex\circulo-profile-backup-before-0216-20260928`. Os 297 arquivos copiados, incluindo banco, envelope de chave, cópia automática e cache DPAPI, coincidiram por nome, tamanho e SHA-256 com a origem. A origem permaneceu idêntica durante a cópia; nenhum conteúdo do cofre foi aberto ou interpretado.
- Executei `release/Círculo_0.2.16_x64-setup.exe /S`, com saída 0. O executável instalado apresenta ProductVersion e FileVersion 0.2.16, SHA-256 `1e94b430940fd84a8d787d17b09c1355d2bcb54ee85c66574dfe28bb82881f6e`.
- Antes de reabrir o aplicativo, comparei novamente o perfil com a cópia: 297 arquivos, nenhuma diferença de nome, tamanho ou SHA-256. Reabri a versão instalada: processo PID 14848 ativo, janela principal intitulada `Círculo` e ProductVersion 0.2.16.

Limitações: não naveguei no cofre nem validei visualmente seus fluxos internos. A cópia é recuperável como conjunto binário, mas sua restauração não foi ensaiada. Não houve seed, restauração, limpeza, desinstalação ou push.
