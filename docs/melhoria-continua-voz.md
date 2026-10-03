# Melhoria contínua de voz

## Cobertura após a entrega0.2.44: descarte por voz do updater

12/12 E2E settings em1,0min, com cinco novos casos de vínculo, Agenda, contexto, adendo e biblioteca. Recusar mantém conteúdo; aceitar descarta pelo handler normal, sem gravar nem instalar, verificado por lista de operações permitidas. 229/229JS e lint aprovados (avisos anteriores). Sem mudanças de produção ou novo instalador, perfil/dados reais não tocados. [Matriz atualizada](voz-cobertura-interface.md). Microfone e instalação real não testados nesta rodada; meta ativa.

## Entrega instalada 0.2.44 — 03/10/2026

[Pacote e evidência](validacao-voz-0.2.44.md). Consolidou retries explícitos e cabeçalhos semanal/diário. 229/229 JS e guard aprovados novamente; build offline/locked, audit e consistência do pacote. Instalaçãoexit0, versão44 e quatro arquivos principais do perfil preservados, snapshot0244 verificado. Sem nova abertura/microfone humano, Release ou assinatura updater. Referências abaixo a incrementos não empacotados são histórico agora incluído na44; meta continua ativa.

## Incremento após 0.2.43: navegação e gavetas administrativas

Cabeçalhos semanal/diário da Agenda usam Ver dia AAAA-MM-DD como o mensal, sem alterar layout/handlers. 28/28 E2E conjuntos em 2,3 min e 229/229 JS aprovados; lint/guard/build aprovados com avisos anteriores. Comprovados seleção de dia, Voltar do encerramento sem escrita, recolher gavetas administrativas e Fechar vínculos. [Matriz](voz-cobertura-interface.md). Mudança de cabeçalhos ainda não no instalador0.2.43; consolidar com retries explícitos no próximo pacote. Sem nova prova nativa/microfone; meta ativa.

## Incremento após 0.2.43: retries com alvo explícito

[Implementação e provas](voz-retries-explicitos.md). Recarregar agenda/análises, Verificar atualizações e Tentar instalação novamente identificam a operação na tela e na voz; não exige navegar quando dois erros aparecem juntos. Aliases antigos continuam válidos só quando únicos. 20/20 E2E conjuntos em 58,2 s e 229/229 JS aprovados; lint/guard/build também, com avisos anteriores. Ainda não empacotado no NSIS instalado 0.2.43. Meta ativa.

## Entrega instalada 0.2.43 — 03/10/2026

Cobertura adicional de Início/updater: **7/7 E2E em 38,6 s**, **229/229 JS** e lint aprovados. Retry da prévia, Ver pacientes/Ver agenda/Início, retry de verificação (falha/sucesso sem instalar) e retry com cadastro aberto preservado. Dois retries visíveis recusam comando ambíguo; navegação delimita o alvo sem efeito indevido, mas ainda é uma fricção a melhorar. [Matriz](voz-cobertura-interface.md). Sem alteração de produção ou novo pacote; sem instalação/ditado humano nesta rodada.

Rodada posterior apenas de cobertura: **19/19 E2E de interface em 1,3 min** e **229/229 JS** aprovados. Três provas novas cobrem o CTA de evolução sem rascunho/com rascunho disponível/com ativo, todas as âncoras de etapas, foco nos comportamentos, biblioteca vazia e consulta de paciente arquivado sem escrita. Percurso inicial corrigido para abrir a gaveta antes de acionar seu botão oculto; produção não mudou. [Matriz atualizada](voz-cobertura-interface.md). Sem novo instalador ou repetição nativa/microfone.

[Pacote e evidência](validacao-voz-0.2.43.md). O incremento de datas/horários abaixo agora está empacotado no NSIS 0.2.43. Build offline/locked e auditoria aprovados; instalação silenciosa exit0, versão conferida e quatro arquivos principais do perfil preservados, snapshot0243 verificado. Sem nova abertura/microfone humano, Release ou assinatura updater. 229/229 JS passaram novamente na versão43. Meta ativa; referências abaixo a “ainda não incluído” são histórico anterior ao empacotamento.

## Incremento de código após o instalador 0.2.42 — datas e horários

[Formatos e limites](voz-datas-horarios.md). Campos de data/hora aceitam datas completas faladas e horários explícitos em português; a proposta mostra o valor convertido e mantém confirmação/eventos normais. Textos livres não são reescritos. Revisão encontrou e corrigiu separação errada de “vinte horas e três” e rejeição de horas compostas; preservados formatos numéricos com segundos quando o campo permite. 229/229 JS aprovados. Rodada de 24 E2E passou antes dos ajustes finais da revisão; teste específico ampliado está sendo reexecutado. Lint/guard/build passaram, com avisos anteriores.

Após a revisão, o teste específico ampliado passou em 20,8 s, verificando também 20:03 e 21:30 no formulário. Ainda não incluído no NSIS 0.2.42; próximo empacotamento deve consolidar este incremento. Microfone humano e persistência nativa não foram testados nesta rodada. Meta continua ativa.

## Estado atual: instalado 0.2.42 — 03/10/2026

[Evidência atual](validacao-voz-0.2.42.md). Pacientes e vínculos homônimos têm opções distintas e identidade/revisão; seletores de paciente nas três áreas usam o mesmo helper. Pode dizer “opção dois”, sem ponto separador. Seleção confirmada revalida valor/rótulo disponível. 225 JS, 20 E2E de regressão/seleção e quatro E2E de homônimos passaram. NSIS instalado, perfil preservado e smoke de processo aprovado. Sem Release/updater assinado nem teste de microfone humano.

Rodada de cobertura sem alterações de produção: **7/7 E2E em 46,7 s** para navegação do calendário, início de sessão com falha/retry sem duplicação, encaminhamento e recusa da finalização, filtros diretos de Análises e erro/retry sem dados antigos. **225/225 JS** aprovados. [Matriz consolidada e lacunas](voz-cobertura-interface.md). Instalador permanece 0.2.42; não houve novo teste de microfone humano, Rust ou instalação nesta rodada.

Rodada adicional: **7/7 E2E de Agenda em 56,1 s**, incluindo três provas novas de selects diretos, comando local com escolha de ID homônimo e troca da ação cancelar/remarcar seguida de fechamento sem gravação. **225/225 JS** e lint aprovados. Expectativa de data inicial da série na fixture corrigida conforme contrato do parser; sem mudança de produção ou novo instalador.

Próximos pontos: controles restantes de navegação, evolução e retries do Início/updater; datas/horas faladas em campos. Meta ativa; seções seguintes são histórico. Não investigar limpeza de recovery ou compatibilidade de backups antigos.

## Estado atual: instalado 0.2.41 — 03/10/2026

[Evidência atual](validacao-voz-0.2.41.md). Concluídas as provas pendentes da 0.2.40 para payload completo de pacientes/solicitante/busca e edição/cancelamento da biblioteca. Corrigido rótulo iniciado por “O”; comportamentos homônimos têm opções explícitas e identidade/versão; proposta antiga não atravessa troca de editor ou rascunho. 23/23 E2E conjuntos e 223/223 JS passaram. Instalador local auditado/instalado, perfil preservado e smoke de processo aprovado. Sem Release/updater assinado ou validação do microfone humano.

Próximos pontos: pacientes/vínculos homônimos, datas/horas faladas em campos genéricos e matriz consolidada das ações visíveis. A meta permanece ativa; senha/diálogos de arquivos são manuais, cofre bloqueado não oferece assistente e recovery desabilitado permanece fora da investigação. As seções seguintes são histórico, não o estado do instalador atual.

## Estado atual: instalado 0.2.40 — 03/10/2026

Os trechos abaixo que dizem “ainda não incluído no instalador 0.2.39” são histórico de implementação: esses incrementos agora estão consolidados na 0.2.40. [Evidência e limites atuais](validacao-voz-0.2.40.md).

Nesta rodada passaram 223 testes JS e 12 E2E conjuntos de voz para agenda, ajustes, exportação, updater, vínculos, indicadores, contexto e adendos. Correção nova: modalidade após horário numérico em série recorrente; modalidades conflitantes recusadas. Instalador gerado, auditado, instalado com perfil preservado e smoke de processo aprovado; sem Release nem assinatura updater. O microfone humano não foi validado.

Próxima rodada de auditoria: payload completo do paciente/solicitante próprio/busca; cancelamento e edição da biblioteca preservando snapshots; propostas contra alvo/tela que mudam. Senhas e arquivos Windows continuam manuais, assistente só após desbloqueio, recovery desabilitado sem investigação. Não declarar que toda ação tem linguagem natural ou que cobertura universal foi comprovada. A meta continua ativa.

## Incremento após a entrega 0.2.38 — 03/10/2026

Implementado no código, ainda não incluído no instalador 0.2.38:

- Consultas naturais: “mostrar agenda de hoje”, “abrir agenda de amanhã”, “mostrar agenda desta semana”, “mostrar agenda deste mês”, “mostrar agenda do dia 10/10/2026”, “mostrar agenda da semana de 10/10/2026” e “mostrar agenda do mês de 10/10/2026”. A proposta troca apenas a data e a visualização após confirmação; não altera compromissos nem descarta formulários.
- “Limpar Nome”, “Limpar Idade” e “Limpar Descrição opcional” esvaziam campos editáveis após confirmação. Campos obrigatórios continuam sujeitos à validação normal ao salvar. Seleções, senhas e arquivos não são esvaziados por esse comando.

Validação: 41 testes do parser passaram. Os dois arquivos E2E de voz tiveram 15 aprovações; o caso adicional de limpeza passou separadamente. Build frontend, lint (com os avisos anteriores), repository guard e diff check passaram. Nenhuma alteração Rust nesta rodada. Não houve novo teste de microfone humano ou interação visual com a janela instalada.

## Consolidação 0.2.39 — 03/10/2026

As consultas de calendário e a limpeza de campos estão incluídas no instalador 0.2.39, junto com:

- “Iniciar sessão de Ana Clara hoje às 15 horas” procura um único compromisso agendado e usa a ação normal para criar ou retomar o rascunho após confirmação.
- “Remarcar sessão de Ana Clara amanhã às três da tarde” e “Cancelar sessão de Ana Clara no dia 10/10/2026 às 15:00” abrem o formulário normal. Não cancelam nem remarcam automaticamente: motivo e confirmação continuam obrigatórios conforme as validações existentes.
- Botões repetidos só são tratados como equivalentes quando têm a mesma ação explícita, nome e ID de ocorrência. Pacientes ou compromissos diferentes nunca são escolhidos por aproximação.
- “Novo compromisso” abre o formulário; “clicar em Recolher novo compromisso” e “clicar em Abrir formulário de novo compromisso” controlam a gaveta sem ambiguidade.
- “Clicar em Adicionar adendo de Ana Clara em 2026-10-03 às 15:00–15:50” distingue sessões pela data e horário e preserva a identidade do registro.
- O parser de campos considera os nomes disponíveis na tela para separar nome e valor: funciona tanto “selecionar Paciente para evolução e sessões como Ana Clara” quanto “preencher Nome para Ana com Silva”.

Validação final do frontend: 48 testes do parser e 20/20 E2E de voz passaram. A suíte unitária geral teve 215 aprovações antes do ajuste de texto da prévia; o teste dessa prévia foi atualizado e o parser completo passou novamente. A execução intermediária E2E teve uma falha porque a fixture passou a filtrar corretamente as datas, enquanto o percurso antigo procurava a ocorrência de hoje na agenda de amanhã; o percurso foi corrigido para navegar para hoje. A revisão encontrou uma regressão de separação dos campos, corrigida e coberta pelos testes finais. Uma suspeita de regressão do botão de compromisso foi retirada após confirmar a existência do botão principal na tela real.

## Pendências atuais da auditoria de cobertura

### Incremento em desenvolvimento após o instalador 0.2.39

No código, ainda não incluído no instalador 0.2.39:

- “Abrir registros de Ana Clara” e “Abrir sessões de Ana Clara” selecionam o paciente no fluxo normal de registros, sem criar uma sessão.
- “Abrir evolução de Ana Clara” também abre e destaca a gaveta de evolução; “Abrir vínculos de Ana Clara” mostra e destaca o formulário normal de vínculos, preservando a confirmação de substituição de campos não salvos.
- “Mostrar análises de Ana Clara neste mês”, “Mostrar análises de Ana Clara hoje”, “Mostrar gráficos dos últimos 12 meses” e “Mostrar análises de Ana Clara de 01/09/2026 até 30/09/2026” selecionam período e paciente. O pedido geral “Mostrar análises deste mês” limpa o filtro de paciente anterior. Não há alteração de registros nem interpretação clínica.
- Pedidos exigem nomes exatos e únicos, paciente ativo e datas válidas. A consulta geral inclui todos os pacientes como já ocorre no filtro normal. Intervalos fora dos limites do sistema são recusados.

O parser completo passou 55/55 testes. Lint, build frontend e repository guard passaram. A rodada inicial E2E revelou que o rótulo acessível do seletor de paciente incluía os textos das opções; foi adicionado `aria-label="Paciente"`. A rodada final passou 24/24 testes de voz e análises, incluindo abertura direta da gaveta de evolução, vínculos, filtros gerais e por paciente, datas, erro e nova tentativa de consulta. Não houve novo build Windows ou teste de microfone humano neste incremento.

Não declarar cobertura completa enquanto persistirem estes pontos:

- Registros realmente indistinguíveis pelo nome, data e horário continuam exigindo identificação adicional na interface; não escolher arbitrariamente.
- Datas e horários falados por extenso não estão disponíveis em todos os campos genéricos.
- Empacotar os novos pedidos naturais de análises, evolução e vínculos no próximo instalador após a conferência de cobertura.
- Senhas e janelas nativas de escolha de arquivos permanecem manuais. A gravação exige botão ou atalho; não há escuta permanente.
- Validar o microfone humano. A evidência automatizada não substitui uma demonstração de ditado humano na instalação final.

A meta permanece ativa. Todas as validações usam dados fictícios e as ações reutilizam os controles e validações existentes.

## Auditoria de paridade e correções de retomada

A auditoria de código separou ações com prova E2E de voz das que apenas parecem alcançáveis pelo gateway genérico. Prioridades restantes: CRUD de vínculos, catálogo não vazio de indicadores, contexto do caso, persistência de adendos, alterações de ocorrências/séries e ajustes/backup/updater. Abertura de uma tela não prova o salvamento correto de seu formulário.

Correções no código após 0.2.39: rascunhos da mesma data exibem opções distintas e identidade de registro; com vários rascunhos, os botões principais mostram a escolha em vez de retomar arbitrariamente o primeiro. Teste específico passou: escolheu opção 2, navegou pelo atalho interno de evolução, recusou o primeiro cancelamento e confirmou o segundo; apenas o rascunho selecionado foi removido e nenhuma sessão finalizada foi criada. O gateway também aceita os links internos `href="#…"` das etapas e biblioteca; links externos não fazem parte desse inventário.

Limites de paridade a manter explícitos: senha e escolha de arquivos Windows são manuais; o assistente só fica disponível com o cofre desbloqueado, portanto não cobre criação/desbloqueio/restauração na tela bloqueada. Controles desabilitados não são acionados: é preciso preencher seus pré-requisitos; a limpeza de recovery continua desabilitada por projeto. Registros finalizados e históricos são leitura, sem ação de editar. Nomes duplicados sem identificação distinta continuam exigindo escolha inequívoca.

Não há novo instalador dessas últimas correções ainda. A versão distribuível segue 0.2.39 até consolidar os testes e gerar o próximo pacote.

Novas provas de fluxo: quatro testes em `desktop-voice-workflows.spec.js` passaram com respostas Tauri sintéticas. Vínculos: criação/edição/arquivamento/restauração, três papéis, bloqueio de envio sem papel e isolamento entre dois pacientes. Indicadores: catálogo não vazio, valor e nota contextual, limpar e salvar/reset com conferência de payload. Contexto: duas revisões preservando a anterior. Adendos: salvar na sessão selecionada e cancelar outro texto, mantendo o registro original intacto. O teste avança frames explicitamente sem depender do autosave para comprovar a ação de salvamento.

Regressão de voz: 22 casos passaram numa rodada de 23; o outro terminou com `ENOENT` ao fechar o contexto porque execuções paralelas compartilhavam a pasta de traces, não por falha de ação. Esse caso de cadastro/edição/comportamento passou isoladamente. A configuração agora separa resultados pela porta de execução (ou `E2E_OUTPUT_DIR`), mantendo a pasta padrão na porta padrão. O campo de adendo também aceita o nome sem repetir a instrução de limite “até N caracteres”; o limite real do campo continua validado.
