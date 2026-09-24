# Auditoria de prontidão — aplicativo local Windows

**Estado: demonstração local; não está pronto para uso clínico real ou produção.**

## Evidências concluídas

| Área | Evidência |
| --- | --- |
| Fluxos de produto | pacientes por ciclo de vida, sessões, modelos, catálogo, ocorrências e agenda recorrente demonstrativos |
| Histórico | contratos de snapshots de comportamento, modelo, modalidade e agenda |
| Segurança de repositório | `.gitignore`, checklist e `npm run guard:repository` |
| Backup/migração | contrato de pacote cifrado e UI declaradamente demonstrativa |
| Qualidade | 19 testes, lint e build passam no estado atual |
| Empacotamento | scaffold Tauri e CI gated, sem publicação |

## Bloqueadores para uso clínico

1. Rust, Cargo e Tauri não estão disponíveis neste ambiente; não existe aplicativo desktop instalado.
2. Não há SQLite/SQLCipher, banco local real, migrações transacionais ou persistência confiável.
3. Não há autenticação local, bloqueio por inatividade ou gerenciamento seguro de chave com Argon2id.
4. Backup/restauração/migração são contratos e UX; não cifram nem gravam arquivos de verdade.
5. Não há assinatura de código, certificado, updater assinado, instalador validado ou teste em computador limpo.
6. Não houve revisão clínica, segurança independente, teste de recuperação ou política operacional de senha/perda de equipamento.

## Ordem segura de implementação

1. Preparar ambiente Windows com Rust, Build Tools, WebView2 e Tauri; validar scaffold sem dados clínicos.
2. Implementar SQLCipher, migrações e modelo local, com testes de corrupção e rollback.
3. Implementar primeira execução, Argon2id, desbloqueio, bloqueio automático e auditoria.
4. Implementar backup automático cifrado, restauração atômica e migração em instalação limpa.
5. Testar o fluxo clínico com dados sintéticos, acessibilidade e recuperação de falhas.
6. Adquirir/configurar assinatura Windows, CI protegido e instalador NSIS; validar em máquina limpa.
7. Fazer revisão clínica e de segurança antes de qualquer piloto controlado.

## Regra de decisão

Nenhum banco de paciente, backup, chave, token, certificado ou `.env` real entra no repositório, em release ou em telemetria. A publicação permanece bloqueada até os itens acima serem concluídos e aprovados.
