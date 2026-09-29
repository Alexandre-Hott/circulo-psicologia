# Validação local do release 0.2.6 — 27/09/2026

Instalador Windows NSIS x64: `release/Círculo_0.2.6_x64-setup.exe` (4.200.884 bytes). SHA-256: `7C33BFC2F0C997B2C6F2DF87E17100D1CD82CB4CC7C8536DBFDC534AAF1A6DAA`. Versão PE 0.2.6; Authenticode `NotSigned`.

## Preparação e evidência

- `package.json`, `package-lock.json` e `src-tauri/tauri.conf.json` foram atualizados de 0.2.5 para 0.2.6. A versão interna do crate Rust permanece 0.1.0.
- `npm exec tauri build -- --bundles nsis` passou com `CARGO_TARGET_DIR=C:\Users\alexandre\Documents\Codex\build-circulo-023` e `CARGO_NET_OFFLINE=true`. O frontend Vite compilou. O linker emitiu warning `LNK4099` sobre PDB ausente do OpenSSL; o build terminou com código 0.
- Uma primeira tentativa sem o target cache indicado foi interrompida durante o script de build do OpenSSL; ela não produziu instalador. Antes disso, uma invocação com `--offline` como argumento do Tauri falhou porque a CLI não aceita essa opção.
- O instalador produzido em `C:\Users\alexandre\Documents\Codex\build-circulo-023\release\bundle\nsis\Círculo_0.2.6_x64-setup.exe` foi copiado para `release/` sem sobrescrever o 0.2.5.
- A auditoria `scripts/auditWindowsInstaller.js` passou para a cópia em `release/`: versão PE 0.2.6, assinatura `NotSigned`, alvo x64, tamanho e SHA-256 acima. Manifest: `%TEMP%\circulo-026-audit-3f8337c8baf04818b4e893d794a746a8.json`. A auditoria não inspeciona o conteúdo interno do NSIS.
- Main informou que **15/15 E2E desktop** e os **testes Rust do adendo** passaram. Esta preparação não repetiu essas suítes; contagens ou logs adicionais de Rust não foram fornecidos aqui.

## Verificação pós-instalação informada por main

- O instalador foi executado com `/S` e terminou com código **0**. O executável instalado apresentou versão **0.2.6** e SHA-256 `4E6556D3E9E9F8968F0D729A7CF393EA1180A01FAFF53E75B8D75114B2D846D6`. Esse hash é do executável instalado; o SHA-256 no início desta nota pertence ao instalador NSIS.
- Os hashes dos três arquivos centrais cifrados do perfil sintético original permaneceram iguais. Ao repor o perfil original, uma pasta transitória de cache `EBWebView` não pôde ser movida integralmente; os três arquivos centrais foram restaurados individualmente e seus hashes continuaram idênticos aos originais.
- Na tela instalada com perfil novo, o controle **“Restore existing backup”** estava visível. O clique pelo controle Windows falhou por indisponibilidade da geometria de entrada por coordenadas, e a captura da tela expirou por timeout. Assim, a restauração pela interface instalada **não foi testada**.
- Um revisor independente apontou um problema **P2**: ao abrir a restauração em perfil novo, controles de estado desbloqueado podem aparecer antes de o cofre ser inicializado. A correção está prevista apenas para a próxima versão. **A 0.2.6 não deve ser liberada para uso real.**

## Limites

O resultado `/S`, a versão instalada e os hashes centrais foram verificados conforme informado acima. A presença visual do controle de restauração não comprova seu funcionamento; a restauração pela interface instalada permanece sem teste. O problema P2 impede liberar esta versão para uso real. O pacote não foi enviado ao GitHub. Não há validação para dados clínicos reais ou atendimento. O instalador não está assinado.
