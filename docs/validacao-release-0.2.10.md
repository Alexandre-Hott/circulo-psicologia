# Validação local do release de teste 0.2.10 — 28/09/2026

Instalador Windows NSIS x64: `release/Círculo_0.2.10_x64-setup.exe` (4.246.314 bytes). SHA-256: `7d0a163f9d91cc6ecfd265e794425228914efb6338e042d3f29b6412e5e891ea`. Versão PE 0.2.10; Authenticode `NotSigned`.

## Fonte e empacotamento

- A fonte acrescenta data de nascimento opcional, indicação de solicitação pelo próprio paciente e zero ou mais papéis de pessoas relacionadas, com migração e interface. Corrige corridas de resposta e regressão da restauração. A revisão independente identificou P2 na cópia TXT acessível: `src-tauri/src/vault/export.rs` não escreve nenhum desses três dados, apesar de presentes no cadastro/UI. A adequação da cópia acessível, da identificação e da demanda depende de revisão profissional; não há aprovação clínica.
- `package.json`, `package-lock.json` e `src-tauri/tauri.conf.json` estão em 0.2.10. A versão interna do crate Rust permanece 0.1.0.
- Main informou Rust release offline **57/57**, npm **142/142**, E2E completo **123/123**, lint e build verdes para a fonte. Essas suítes não foram repetidas nesta preparação; são resultados informados.
- `npm exec tauri build -- --bundles nsis` passou com `CARGO_TARGET_DIR=C:\Users\alexandre\Documents\Codex\build-circulo-023` e `CARGO_NET_OFFLINE=true`. O Vite compilou. O linker emitiu avisos `LNK4099` sobre PDB ausente do OpenSSL; o build terminou com código 0.
- O NSIS foi copiado do target para `release/` sem substituir arquivo existente. A auditoria `scripts/auditWindowsInstaller.js` da cópia confirmou versão PE 0.2.10, alvo x64, `NotSigned`, tamanho e SHA-256 acima. Manifest: `%TEMP%\circulo-0210-audit-20260928.json`. A auditoria inspeciona metadados; não extrai nem executa o NSIS.

## Smoke nativo após o bundle

Após o empacotamento de produção, `cargo build --release --offline --features native-smoke-test` passou no cache compartilhado. O binário opt-in `build-circulo-023\release\circulo.exe --self-test`, executado com espera explícita do processo, terminou com código **0**, stderr vazio e confirmou self-test entre processos, da cópia automática local e nativo. Usa somente fixtures e perfis sintéticos temporários; não valida interface instalada. Esse binário de feature foi compilado **depois** do NSIS e não integra o instalador de produção.

## Evidência pós-instalação

- O NSIS 0.2.10 foi executado com `/S` e terminou com código **0**. O executável instalado apresentou ProductVersion e FileVersion **0.2.10** e SHA-256 `D8071DB655E72F2100CC6149B74452086F8BE3E70A645F2BC30A216ABBE76708`. Esse hash é do executável instalado, não do instalador NSIS.
- Os hashes dos artefatos cifrados foram iguais antes e depois da instalação: `circulo.db` `983682016D01493F2E6E802FF62F634FC82D983781541EB972170723D6C63021`; `vault.key` `8BA663505A74BA642C0CD7D5ACFE5815888A365D544DE0BA727358DAA52E198F`; `auto-backup.db` `3C2096B723CC75F66ABA1477CB73370AB077D9D3CFD7D70F5947C759E3390B2D`. Essa comparação byte a byte não demonstra leitura nem restauração do conteúdo.
- A leitura da árvore de acessibilidade mostrou o cofre desbloqueado, o paciente fictício Horizonte e as telas Agenda e Sessões abertas. Cliques e captura pela ferramenta falharam globalmente, inclusive no Notepad; o usuário dispensou a validação por tela. Essas observações não demonstram operações de CRUD nem os demais fluxos instalados.
- `scripts/installedLifecycleSmoke.ps1` confirmou hash, versões, PE x64 e processo responsivo. O status global `failed-or-incomplete` decorre apenas dos três artefatos cifrados preexistentes, que não atendem ao gate de perfil limpo. Relatório: `%TEMP%\circulo-installed-smoke-4b13fd692b1342e8bcc39c0a0f6cfb6e.json`.

## Limites

Esta atualização documental registra a instalação e as observações pós-instalação acima; não repetiu a instalação, não abriu os artefatos cifrados e não acessou dados do perfil. A leitura de acessibilidade do cofre desbloqueado não constitui validação do fluxo de desbloqueio. Desbloqueio, restauração CBK1 pela interface instalada, bloqueio automático no app instalado, exportação pela UI instalada, CRUD, backup pela UI e desinstalação permanecem sem validação para 0.2.10. O TXT acessível omite data de nascimento, indicação de solicitação pelo próprio paciente e pessoas relacionadas; a exclusão destas últimas foi deliberada, e a decisão sobre a adequação das três omissões permanece pendente de revisão profissional da cópia acessível, da identificação e da demanda. Uma queda durante exportação TXT pode deixar `.circulo-record-*.tmp` em texto puro no diretório escolhido, inclusive pasta sincronizada. O instalador não está assinado. Não foram usados dados reais nem houve publicação no GitHub nesta preparação. Não há prontidão ou liberação para uso clínico real.
