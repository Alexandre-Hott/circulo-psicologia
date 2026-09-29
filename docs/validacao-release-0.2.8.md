# Validação local do release de teste 0.2.8 — 28/09/2026

Instalador Windows NSIS x64: `release/Círculo_0.2.8_x64-setup.exe` (4.215.423 bytes). SHA-256: `467E3EF69FC14D5B144BE0FDA163143F8DF2B28532EF8E8F3633A96C35ACAEB1`. Versão PE 0.2.8; Authenticode `NotSigned`.

## Escopo e evidência

- A fonte deste pacote inclui revisões append-only de demanda/objetivos e exportação explícita de TXT UTF-8 de um paciente por vez, com sessões finalizadas, snapshots e adendos. A cópia é texto puro e exige revisão profissional. Não há dados reais nem exportação automática.
- `package.json`, `package-lock.json` e `src-tauri/tauri.conf.json` foram atualizados para 0.2.8. O crate Rust mantém sua versão interna 0.1.0, como nos pacotes anteriores.
- Main informou para a fonte: Rust release **50/50**, npm **142/142**, E2E **18/18** e lint verde. Estas suítes não foram repetidas nesta preparação; os números são informados, não medidos aqui.
- `npm exec tauri build -- --bundles nsis` passou com `CARGO_TARGET_DIR=C:\Users\alexandre\Documents\Codex\build-circulo-023` e `CARGO_NET_OFFLINE=true`. O Vite compilou. O linker emitiu avisos `LNK4099` de PDB ausente do OpenSSL; o build terminou com código 0.
- O instalador do target foi copiado para `release/` sem substituir outro arquivo. Origem e cópia têm o mesmo tamanho e SHA-256 acima.
- `scripts/auditWindowsInstaller.js` passou na cópia: versão PE 0.2.8, assinatura `NotSigned`, alvo x64, tamanho e SHA-256 acima. Manifest: `%TEMP%\circulo-028-audit-d30716f53b3245d4b74e84af9af17505.json`. A auditoria não extrai nem inspeciona o conteúdo interno do NSIS.

## Smoke nativo opt-in após empacotamento

- Um build inicial em `C:\Users\alexandre\Documents\Codex\build-circulo-028-smoke` foi interrompido porque a compilação separada do OpenSSL não avançava. Nenhum self-test foi executado a partir desse target.
- Em `C:\Users\alexandre\Documents\Codex\build-circulo-023`, `cargo build --release --features native-smoke-test` passou. A primeira execução de `build-circulo-023\release\circulo.exe --self-test` terminou com código **1**, stdout vazio e stderr `Self-test nativo falhou: Configure nome e registro profissional antes de finalizar.` O fixture sintético estava desatualizado.
- O fixture opt-in em `src-tauri/src/native_smoke_test.rs` foi ajustado para cadastrar identidade profissional sintética antes das duas finalizações. Recompilação com o mesmo comando passou; execução repetida de `--self-test` terminou com código **0**, stderr vazio e stdout:

  ```text
  Self-test entre processos concluído com sucesso.
  Self-test da cópia automática local concluído com sucesso.
  Self-test nativo concluído com sucesso.
  ```

- O smoke usa apenas perfis temporários e dados sintéticos; não abre o perfil do aplicativo. O ajuste foi restrito ao módulo compilado somente com `native-smoke-test`, após a criação do NSIS. O `--self-test` **não** foi executado no binário de produção nem no NSIS. O pacote NSIS não foi reconstruído para esse ajuste; seu hash permanece o registrado acima.

## Evidência pós-instalação informada pelo usuário

- O NSIS 0.2.8 foi executado com `/S` e terminou com código **0**. O executável instalado apresentou ProductVersion e FileVersion **0.2.8**, PE x64 e SHA-256 `D5240B98B90D023758D86F3091F4160566D75E64079A7C7C9656665992797F2B`. Esse hash é do executável instalado, não do instalador NSIS.
- Os hashes de `auto-backup.db`, `circulo.db` e `vault.key` do perfil sintético original permaneceram iguais aos valores anteriores conhecidos após a instalação. Esta observação limita-se a esses três arquivos cifrados; não implica validação do conteúdo ou da restauração.
- O aplicativo instalado foi iniciado e sua árvore de acessibilidade mostrou a tela bloqueada com campo de senha. Não houve desbloqueio nem teste das funções pela interface.
- Relatório `C:\Users\alexandre\AppData\Local\Temp\circulo-installed-smoke-6bf64b7e076b4dddb3a3bc2feae12233.json`: verificações de hash, ProductVersion, FileVersion, PE x64 e janela responsiva passaram. O status global `failed-or-incomplete` decorre do requisito de perfil limpo: havia três arquivos cifrados conhecidos (`circulo.db`, `vault.key`, `auto-backup.db`). O relatório fez inspeção somente de metadados; não interagiu com a UI.

## Limites

As observações pós-instalação acima foram informadas pelo usuário e não foram repetidas nesta atualização documental. Desbloqueio, restauração pela interface instalada, fluxos de contexto/exportação TXT, CRUD, backup pela UI e desinstalação permanecem sem teste neste pacote instalado. Uma queda do aplicativo ou de energia durante a exportação pode deixar `.circulo-record-*.tmp` em texto puro no diretório escolhido, inclusive em pasta sincronizada; esta pendência exige revisão antes de qualquer aprovação de uso real. O instalador não está assinado. Não há validação para uso clínico real nem publicação no GitHub.

Revisão independente informada pelo usuário não encontrou P0/P1 na fonte limitada a dados sintéticos; isso não resolve o risco de texto puro residual nem substitui os gates de uso real.
