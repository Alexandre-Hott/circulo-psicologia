# Esquema local e migrações

Envelope local versionado: `schemaVersion`, `patients`, `sessions`, `catalog`, `occurrences`, `series`, `templates`, `backupSettings`.

- `patients`: identidade clínica mínima, ciclo de vida e status.
- `sessions`: paciente, data, modalidade, conteúdo e `templateSnapshot` quando aplicável.
- `catalog`: itens-base e versões; arquivamento não apaga registros.
- `occurrences`: paciente, sessão, data, medidas/contexto/origem e `itemSnapshot` obrigatório.
- `series`: sessão recorrente; exceções por data para presença, cancelamento e remarcação.
- `templates`: modelos editáveis e versionados; sessões preservam snapshot.
- `backupSettings`: frequência, retenção e destino lógico; credenciais não pertencem ao esquema.

Migrações são somente aditivas, transacionais e auditadas. Antes de uma migração real: backup cifrado, validação, aplicação em cópia temporária e troca atômica. Nunca reescrever snapshots, excluir catálogo arquivado ou converter exceções em cópias de série.
