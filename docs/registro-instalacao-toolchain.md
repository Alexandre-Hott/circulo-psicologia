# Registro de instalação de toolchain

Data: 2026-09-22. Ambiente local de build autorizado; nenhuma publicação, GitHub ou dado clínico foi usado.

- `winget install Rustlang.Rustup` iniciou, com hash verificado.
- `rustup default stable` encontrou instalação existente, mas `rustc --version` retorna: `missing manifest in toolchain 'stable-x86_64-pc-windows-msvc'`; a própria ferramenta indica instalação interrompida/reinstalação necessária.
- `cargo --version` respondeu `cargo 1.98.1`.
- Instalação de NSIS iniciou e teve hash verificado, mas `makensis` ainda não ficou disponível no PATH.
- `npx tauri --version` falhou porque a CLI não está instalada.

Resultado: não foi possível validar/buildar Tauri nem gerar instalador. Próxima ação segura: reparar/reinstalar a toolchain Rust stable e concluir NSIS em sessão administrativa/interativa se necessário; depois executar `npm run preflight:windows`, instalar a CLI Tauri como dependência de desenvolvimento e só então tentar `npx tauri build`.
