# Validação local 0.2.15 — 28/09/2026

Instalador NSIS x64: `release/Círculo_0.2.15_x64-setup.exe` (4.257.074 bytes); SHA-256 `ca9140c9dd1f50511ae035a11d656449a919acdc9cf4a9f17006855fc0c856ae`. Bundle original em `C:\Users\alexandre\Documents\Codex\build-circulo-024\release\bundle\nsis\Círculo_0.2.15_x64-setup.exe`, com o mesmo hash. PE 0.2.15, alvo x64, Authenticode `NotSigned`.

- Escopo integrado: semana compacta com sete dias, pré-seleção do paciente ao registrar, acesso a Sessões, CTA para carregar dados fictícios e Home 2×2. Versões npm, crate Rust e Tauri alinhadas em 0.2.15; instaladores anteriores preservados.
- Executados nesta preparação: `npm run lint`, `npm run build`, `npm test` (148/148), `npm exec tauri build -- --bundles nsis` com `CARGO_TARGET_DIR=C:\Users\alexandre\Documents\Codex\build-circulo-024` e `CARGO_NET_OFFLINE=true` (saída 0). O linker emitiu LNK4099 por PDB ausente do OpenSSL, sem falha do bundle.
- Smoke nativo opt-in: `cargo build --release --offline --features native-smoke-test` no mesmo target, seguido de `circulo.exe --self-test` aguardado com saída 0. A recompilação ocorreu após o bundle e não alterou o NSIS.
- Resultados informados pelo usuário, não repetidos nesta preparação: E2E completo 137/137 **antes dos dois últimos ajustes de UI**; E2E desktop 35/35 **após os ajustes**; Rust 66 aprovados, 2 filtrados. O E2E completo não representa a fonte final sem ressalva.
- Auditoria: `scripts/auditWindowsInstaller.js` confirmou tamanho, SHA-256, PE 0.2.15, x64 e `NotSigned`. Manifesto em `%TEMP%\circulo-0215-audit-20260928.json`. O conteúdo interno do NSIS não foi extraído nem inspecionado.

Limitações da preparação acima: o comportamento dos dados fictícios após fechar e reiniciar o aplicativo instalado não foi validado. Naquela etapa, instalação, migração do perfil, restauração, desinstalação e fluxos visuais da 0.2.15 instalada não foram testados; o instalador não foi executado e o perfil instalado não foi acessado. Não houve push. O pacote é sem assinatura e **não está liberado para dados clínicos reais**; use apenas dados sintéticos.

## Instalação local sobre 0.2.14

- Confirmados antes da ação: perfil instalado em `C:\Users\alexandre\AppData\Local\br.circulo.psicologia`; processo `circulo.exe` PID 41172 em `C:\Users\alexandre\AppData\Local\Círculo\circulo.exe`, PE 0.2.14, com janela principal `Círculo`. O processo terminou após solicitação normal de fechamento; não houve encerramento forçado.
- Cópia binária integral criada em `C:\Users\alexandre\Documents\Codex\circulo-profile-backup-before-0215-20260928`, diretório novo. São 296 arquivos, incluindo `circulo.db`, `vault.key`, `auto-backup.db` e `daily-unlock.dpapi`. Nomes, tamanhos e SHA-256 coincidiram arquivo a arquivo com o perfil antes da instalação; a origem não mudou durante a cópia. Nenhum conteúdo clínico foi aberto ou interpretado.
- Executado `release/Círculo_0.2.15_x64-setup.exe /S`; código de saída 0. O executável instalado informa ProductVersion 0.2.15 e SHA-256 `5a0ec3eb5bdada57ecaefd57951d3c00b06aed00b2818cb186547006a964265a`.
- Após a instalação, os mesmos 296 arquivos do perfil conservaram nomes, tamanhos e SHA-256 em relação à cópia, sem entradas alteradas. A versão instalada iniciou como PID 25596 e apresentou processo ativo com janela principal. Não foi feito seed, restauração, desinstalação ou acesso ao conteúdo do cofre.

Limitações desta instalação: a janela foi verificada pela existência de seu handle, sem navegação ou inspeção visual da interface e sem validar fluxos internos com dados do perfil. A cópia do perfil é uma recuperação binária local; o procedimento de restauração dessa cópia não foi exercitado.
