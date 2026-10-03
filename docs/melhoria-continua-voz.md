# Melhoria contínua de voz

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
