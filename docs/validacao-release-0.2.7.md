# Validação local do release de teste 0.2.7 — 27/09/2026

Instalador Windows NSIS x64: `release/Círculo_0.2.7_x64-setup.exe` (4.214.609 bytes). SHA-256: `DF2198EA8CD26A0577711CB4619AF250E91F395024386CF54F24A8CC7D26667F`. Versão PE 0.2.7; Authenticode `NotSigned`.

## Escopo e evidência

- Fonte compartilhada atual: identidade profissional autodeclarada com snapshot, correção P2 da interface de restauração em perfil novo e correção de corrida no lock de operação do cofre. Esta preparação alterou somente os metadados de versão e a documentação de release; não editou fonte do aplicativo.
- `package.json`, `package-lock.json` e `src-tauri/tauri.conf.json` foram atualizados para 0.2.7. O crate Rust mantém a versão interna 0.1.0.
- `npm exec tauri build -- --bundles nsis` passou com `CARGO_TARGET_DIR=C:\Users\alexandre\Documents\Codex\build-circulo-023` e `CARGO_NET_OFFLINE=true`. O Vite compilou. O linker emitiu avisos `LNK4099` de PDB ausente do OpenSSL; o build terminou com código 0.
- O instalador produzido no target acima foi copiado para `release/`; o 0.2.6 permanece preservado. Hashes SHA-256 da origem e da cópia coincidiram.
- `scripts/auditWindowsInstaller.js` passou para a cópia: versão PE 0.2.7, assinatura `NotSigned`, alvo x64, tamanho e SHA-256 acima. Manifest: `%TEMP%\circulo-027-audit-3d3b9358f07f451f801975e3b8f7a88e.json`. A auditoria não inspeciona o conteúdo interno do NSIS.
- Main informou Rust **46/46**, npm **142/142** e E2E desktop **17/17** para a fonte atual. Estas suítes não foram repetidas nesta preparação; os resultados são informados, não medidos aqui.

## Evidência pós-instalação informada

- O instalador com SHA-256 `DF2198EA8CD26A0577711CB4619AF250E91F395024386CF54F24A8CC7D26667F` foi executado com `/S` e terminou com código **0**.
- O executável instalado apresentou ProductVersion **0.2.7** e SHA-256 `01F4DCFEBEAA6CA08EE199A414F163D1CE77982210DDDBE4FB13F83D7A821057`. Este hash pertence ao executável instalado, não ao instalador NSIS.
- Antes da instalação, os três arquivos centrais cifrados do perfil foram copiados para Temp. Os hashes dos três arquivos permaneceram idênticos após a instalação.
- O aplicativo foi reaberto e a tela de senha foi observada por computer-use em modo somente leitura. Não houve desbloqueio nem teste da interface de restauração.

## Limites

As evidências pós-instalação acima foram informadas após o build e não foram repetidas nesta atualização da nota. A restauração pela interface **instalada** permanece sem verificação, inclusive a correção P2 nesse ambiente. Não foram testados desbloqueio, restauração, desinstalação nem fluxos de uso após a tela de senha. A preservação comprovada limita-se aos hashes dos três arquivos centrais cifrados. Identidade profissional é autodeclarada, sem verificação de credenciais. Este release é apenas para teste; **não há prontidão ou validação para uso clínico real**. O instalador não está assinado e não foi enviado ao GitHub.
