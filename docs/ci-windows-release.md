# CI para instalador Windows

O workflow `.github/workflows/windows-release.yml` valida o frontend em todo tag `v*`, mas **não publica** instaladores. A produção só pode iniciar manualmente com `release=true`, variável protegida `PRODUCTION_RELEASES_ENABLED=true` e ambiente GitHub `production` com aprovação.

Pré-requisitos antes de habilitar a etapa de produção:

- Rust/Cargo, Windows SDK e Tauri compatíveis com `windows-latest`;
- certificado de assinatura Windows (Azure Trusted Signing ou equivalente);
- segredo `WINDOWS_SIGNING_CONFIG` e demais credenciais no cofre de GitHub Actions, nunca no código;
- chave privada do updater em segredo separado, se/quando o updater for habilitado;
- revisão de dependências, testes, build e validação do instalador em computador limpo.

O repositório deve conter somente código e artefatos de aplicativo. Bancos de pacientes, backups, chaves e arquivos de configuração local permanecem proibidos por `.gitignore` e por revisão de PR. A publicação de uma release privada é uma decisão posterior; não há passo de upload neste workflow.
