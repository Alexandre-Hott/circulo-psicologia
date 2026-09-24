# Preflight Windows

Execute `npm run preflight:windows`. O script é somente leitura: verifica Node/npm, Rust/Cargo, CLI Tauri e NSIS, sem instalar nada.

- **Pronto para scaffold** requer Node, npm, Rust, Cargo e CLI Tauri.
- **Pronto para release assinada** também requer NSIS e `WINDOWS_SIGNING_CONFIG` fornecida somente por cofre de segredos/CI. Nunca definir essa variável em arquivo versionado.

Se o scaffold estiver bloqueado, instalar os pré-requisitos listados em `tauri-scaffold-windows.md`. Se apenas a release estiver bloqueada, não distribuir instalador: configurar assinatura, CI protegido e teste em máquina limpa primeiro.
