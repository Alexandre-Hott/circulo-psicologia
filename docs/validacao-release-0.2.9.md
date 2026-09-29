# Validação local do release de teste 0.2.9 — 28/09/2026

Instalador Windows NSIS x64: `release/Círculo_0.2.9_x64-setup.exe` (4.223.590 bytes). SHA-256: `019fe8d3df043623c4c5583c5f1a2268ab23d830f19970526c639859d36819f5`. Versão PE 0.2.9; Authenticode `NotSigned`.

## Fonte e empacotamento

- A fonte inclui procedimentos essenciais da sessão, resultado/decisão, encaminhamento/encerramento, autosave, finalização atômica e indicador explícito de ausência de registro. A revisão independente informada pelo main aprovou somente uso e testes sintéticos; não é aprovação clínica.
- `package.json`, `package-lock.json` e `src-tauri/tauri.conf.json` foram atualizados para 0.2.9. A versão interna do crate Rust permanece 0.1.0.
- Main informou Rust release offline **53/53**, npm **142/142**, E2E completo **120/120**, lint, build e preflight verdes para a fonte. Essas suítes não foram repetidas nesta preparação; são resultados informados.
- `npm exec tauri build -- --bundles nsis` passou com `CARGO_TARGET_DIR=C:\Users\alexandre\Documents\Codex\build-circulo-023` e `CARGO_NET_OFFLINE=true`. O Vite compilou. O linker emitiu avisos `LNK4099` de PDB do OpenSSL ausente; o build terminou com código 0.
- O NSIS foi copiado do target para `release/` sem substituir arquivo existente. A auditoria `scripts/auditWindowsInstaller.js` da cópia passou para PE 0.2.9, alvo x64, `NotSigned`, tamanho e SHA-256 acima. Manifest: `%TEMP%\circulo-029-audit-20260928.json`. A auditoria inspeciona metadados, não o conteúdo interno do NSIS.

## Smoke nativo após o NSIS

Após o empacotamento de produção, `cargo build --release --offline --features native-smoke-test` passou no cache compartilhado `build-circulo-023`. O binário opt-in `build-circulo-023\release\circulo.exe --self-test`, executado com espera explícita do processo, terminou com código **0**, stderr vazio e confirmou self-test entre processos, da cópia automática local e nativo. Usa somente fixtures e perfis sintéticos temporários; não valida interface instalada. Esse binário de feature foi compilado **depois** do NSIS e não integra o instalador de produção.

## Limites

## Evidência pós-instalação informada pelo usuário

- O NSIS 0.2.9 foi executado com `/S` e terminou com código **0**. O executável instalado apresentou ProductVersion e FileVersion **0.2.9**, PE x64 e SHA-256 `090924A9EA169BD228CC5F3C970AC9D421451B078052B840207D892C8963F433`. Esse hash é do executável instalado, não do instalador NSIS.
- Os hashes de `auto-backup.db`, `circulo.db` e `vault.key` do perfil sintético permaneceram iguais aos observados na 0.2.8. Essa comparação byte a byte não demonstra restauração nem leitura do conteúdo.
- O aplicativo instalado foi iniciado; sua árvore de acessibilidade mostrou a tela bloqueada com campo de senha. Não houve desbloqueio ou teste dos fluxos clínicos pela interface.
- O relatório `C:\Users\alexandre\AppData\Local\Temp\circulo-installed-smoke-95fcdfce2d3e4e15977fcb8c9152d3ec.json` confirmou hash, ProductVersion, FileVersion, PE x64 e processo responsivo com janela. O status global `failed-or-incomplete` decorre dos três artefatos cifrados existentes, que violam o gate de perfil limpo. O relatório fez inspeção somente de metadados; não interagiu com a UI.

## Limites

As observações pós-instalação acima foram informadas pelo usuário; o relatório de metadados foi conferido nesta atualização documental. Desbloqueio, restauração pela interface instalada, bloqueio por inatividade no app instalado, exportação pela UI instalada, CRUD, backup pela UI e desinstalação permanecem sem validação para 0.2.9. Uma queda durante exportação TXT pode deixar `.circulo-record-*.tmp` em texto puro no diretório escolhido, inclusive pasta sincronizada. O instalador não está assinado. Não foram usados dados reais nem houve publicação no GitHub nesta preparação. Não há prontidão ou liberação para uso clínico real.
