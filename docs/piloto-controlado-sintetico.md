# Plano de piloto controlado com dados sintéticos

## Preparação

- Executar somente cópia local do MVP; não usar nomes, datas, links, relatos ou documentos reais.
- Criar perfis fictícios identificados como `DEMO — não clínico` para criança, adolescente, adulto, idoso e não informado.
- Registrar duração máxima de 45 minutos por avaliador e coletar feedback sem conteúdo clínico.
- Confirmar `npm run guard:repository`, testes, lint e build antes da sessão.

## Casos manuais

| Área | Cenário | Aceite |
| --- | --- | --- |
| Pacientes | Criar/consultar perfis de todos os ciclos | Rótulos neutros; modo infantil só para Criança |
| Modelos | Aplicar avaliação, acompanhamento e personalizado | Snapshot, versão e ajustes locais preservados |
| Comportamentos | Buscar item, aplicar ocorrência e ajustar medidas | Catálogo-base não muda; ocorrência mostra contexto/origem |
| Agenda | Criar série semanal sintética presencial e online | Ocorrências derivadas, modalidade visível, conflito recusado |
| Cancelamento | Cancelar uma ocorrência com motivo | Exceção histórica preserva a série |
| Remarcação | Registrar nova data/hora opcional | Série original não é reescrita |
| Modalidade | Registrar sessão online com URL fictícia | Link é referência textual, nunca abre automaticamente |
| Backup | Acionar telas demonstrativas de exportar/restaurar | UI declara dependência nativa; nenhum arquivo real é gerado |
| Migração | Revisar contrato e simular pacote inválido | Falha é clara e não promete recuperação inexistente |

## Checklist de revisão clínica

- Linguagem descreve observações e não faz diagnóstico/inferência automática.
- Escalas, campos e modelos são editáveis e apresentados como não prescritivos.
- Origem de informação é distinguível.
- Anotação privada permanece separada visualmente.
- Interface infantil é opcional, acompanhada pelo profissional e não é exibida para outros ciclos por padrão.

## Checklist de segurança

- Guard de repositório passa; não há dados, backups, `.env`, bancos ou chaves reais.
- Nenhuma integração, telemetria, e-mail, upload ou videoconferência foi ativada.
- Participantes reconhecem que backup, autenticação e criptografia são apenas contratos/UX até a camada Tauri/Rust existir.
- Relatar falhas sem capturar conteúdo clínico.

## Saída do piloto

Registrar somente: cenário, resultado, tempo, dificuldade, observação de UX, gravidade e decisão. Avançar para implementação nativa somente se não houver risco clínico/segurança bloqueador e se a revisão aprovar o escopo.
