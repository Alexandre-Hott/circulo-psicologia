# Validação local do release de teste 0.2.11 — 28/09/2026

Instalador Windows NSIS x64: `release/Círculo_0.2.11_x64-setup.exe` (4.245.777 bytes). SHA-256: `d1015db6ff7f0524080059af83b11eab5a96ae87c64afe85d677500fa33a8d58`. Versão PE 0.2.11; Authenticode `NotSigned`. Bundle original: `C:\Users\alexandre\Documents\Codex\build-circulo-023\release\bundle\nsis\Círculo_0.2.11_x64-setup.exe`. Cópia e original têm o mesmo SHA-256.

## Fonte, testes e build

- A única mudança de fonte em relação a 0.2.10 foi `src-tauri/src/vault/export.rs`: TXT acessível com data de nascimento opcional e indicação sim/não de que o solicitante é o paciente. Pessoas relacionadas continuam fora do TXT. A revisão independente aprovou essa alteração, segundo resultado informado pelo solicitante.
- Quatro testes de exportação passaram; a suíte Rust release teve **58 aprovados, um filtrado** (`single_instance`, em conflito com o aplicativo instalado aberto). Resultados informados pelo solicitante; estas suítes não foram repetidas nesta preparação. Não há alegação de novo resultado npm, E2E ou validação da UI.
- `package.json`, `package-lock.json` e `src-tauri/tauri.conf.json` estão em 0.2.11. O crate Rust permanece em 0.1.0.
- `npm exec tauri build -- --bundles nsis`, com `CARGO_TARGET_DIR=C:\Users\alexandre\Documents\Codex\build-circulo-023` e `CARGO_NET_OFFLINE=true`, terminou com código 0. O Vite compilou. O linker emitiu avisos `LNK4099` por PDB ausente do OpenSSL; o pacote foi concluído.
- Auditoria de metadados da cópia: `%TEMP%\circulo-0211-audit-920387852dc449f3a58778b66d7dd224.json`. Confirmou nome, tamanho, SHA-256, versão PE, alvo x64 e `NotSigned`. Não extraiu ou executou o NSIS nem inspecionou seu conteúdo interno.

## Smoke nativo posterior ao bundle

`cargo build --release --offline --features native-smoke-test` passou no target compartilhado após o bundle. O binário opt-in `build-circulo-023\release\circulo.exe --self-test` terminou com código **0** e informou sucesso no self-test entre processos, da cópia automática local e nativo. Usa dados sintéticos temporários; não valida a interface instalada. A compilação com feature ocorreu **depois** da criação do NSIS, portanto esse binário de teste não integra o instalador de produção.

## Pendências e limites

O instalador 0.2.11 não foi instalado ou executado; o aplicativo instalado preexistente e o perfil do usuário não foram alterados. Não houve validação da UI 0.2.11, desbloqueio, CRUD, exportação pela interface, backup/restauração CBK1 pela interface, bloqueio automático, atualização instalada ou desinstalação. A cópia TXT legível é sem criptografia e uma queda durante a exportação pode deixar `.circulo-record-*.tmp` em texto puro no diretório escolhido. A adequação da cópia, inclusive a exclusão de pessoas relacionadas, ainda exige revisão profissional. Não houve publicação no GitHub. O pacote não está assinado e não há prontidão ou liberação para uso clínico real.
