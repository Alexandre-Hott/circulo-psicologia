# Melhoria contínua de voz

## Incremento após a entrega 0.2.38 — 03/10/2026

Implementado no código, ainda não incluído no instalador 0.2.38:

- Consultas naturais: “mostrar agenda de hoje”, “abrir agenda de amanhã”, “mostrar agenda desta semana”, “mostrar agenda deste mês”, “mostrar agenda do dia 10/10/2026”, “mostrar agenda da semana de 10/10/2026” e “mostrar agenda do mês de 10/10/2026”. A proposta troca apenas a data e a visualização após confirmação; não altera compromissos nem descarta formulários.
- “Limpar Nome”, “Limpar Idade” e “Limpar Descrição opcional” esvaziam campos editáveis após confirmação. Campos obrigatórios continuam sujeitos à validação normal ao salvar. Seleções, senhas e arquivos não são esvaziados por esse comando.

Validação: 41 testes do parser passaram. Os dois arquivos E2E de voz tiveram 15 aprovações; o caso adicional de limpeza passou separadamente. Build frontend, lint (com os avisos anteriores), repository guard e diff check passaram. Nenhuma alteração Rust nesta rodada. Não houve novo teste de microfone humano ou interação visual com a janela instalada.

## Pendências da auditoria de cobertura

Não declarar cobertura completa enquanto persistirem estes pontos:

- “Novo compromisso” tem dois controles com o mesmo nome; o comando genérico fica ambíguo. O pedido natural de agendamento contorna a limitação.
- Ações de uma ocorrência aparecem no calendário diário e na gaveta de detalhes; a duplicação pode tornar o comando ambíguo. Evitar selecionar um registro arbitrariamente.
- Adendos de múltiplas sessões na mesma data precisam de identificação inequívoca por horário ou outro identificador visível.
- Datas e horários falados por extenso não estão disponíveis em todos os campos genéricos.
- Tornar naturais os pedidos de iniciar, remarcar e cancelar uma sessão específica; consultar análises por paciente/período; abrir vínculos de um paciente.
- Senhas e janelas nativas de escolha de arquivos permanecem manuais. A gravação exige botão ou atalho; não há escuta permanente.
- Validar o microfone humano e produzir o próximo instalador depois de consolidar as correções.

A meta permanece ativa. Todas as validações usam dados fictícios e as ações reutilizam os controles e validações existentes.
