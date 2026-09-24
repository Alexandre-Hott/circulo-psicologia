# Matriz de QA — MVP e desktop futuro

Usar somente perfis e textos `DEMO — não clínico`.

| Área | Caso positivo | Caso negativo | Evidência esperada |
| --- | --- | --- | --- |
| Catálogo | Aplicar item reutilizável | Editar/arquivar depois | Ocorrência mantém snapshot/versão |
| Modelos | Aplicar modelo compatível | Modelo de ciclo/modalidade incompatível | Campos e pré-seleções locais; base intacta |
| Ciclo de vida | Criar cada ciclo válido | Valor não informado/inválido | Rótulo neutro; infantil apenas Criança |
| Modalidade | Online com URL fictícia | Link em presencial | Link textual; validação rejeita presencial |
| Agenda diária | Consultar horários ordenados | Horário sem ocorrência | Sem cópia de série e estado vazio claro |
| Agenda semanal/mensal | Derivar sessões da série | Data fora do intervalo | Ocorrência aparece/some corretamente |
| Recorrência | Série semanal | Conflito de horário | Série fonte de verdade; conflito recusado |
| Cancelamento | Motivo registrado | Motivo vazio | Exceção histórica / erro claro |
| Remarcação | Nova data/hora opcional | Alterar série por engano | Exceção preserva série original |
| Backup demo | Abrir configurações | Tentar usar como backup real | UI informa dependência Tauri/Rust |
| Backup desktop | Exportar/restaurar cifrado | Senha errada/pacote adulterado | Falha genérica; banco original preservado |
| Migração desktop | Restaurar em máquina limpa | Migração interrompida | Validação + troca atômica/rollback |
| Guard | Workspace sintético | Inserir arquivo proibido em cópia de teste | Guard falha antes de commit/CI |
| Não produção | Revisar auditoria | Tentar piloto com dados reais | Gate bloqueia até requisitos nativos/revisões |

## Evidência mínima

- MVP atual: resultado de `npm run guard:repository`, `npm test`, `npm run lint` e `npm run build`.
- Desktop futuro: logs sem conteúdo clínico, instalador assinado, testes em máquina limpa, teste de recuperação e aprovação clínica/segurança.
