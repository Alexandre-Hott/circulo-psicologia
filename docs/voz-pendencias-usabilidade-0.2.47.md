# Pendências de usabilidade da voz — após0.2.47

Auditoria independente de fontes/parsers no HEADa88952f, com dados fictícios e sem executar handlers persistentes. Suplementos posteriores da matriz foram considerados: linhas S históricas não são tratadas automaticamente como bugs.

## Texto visível de Adicionar adendo

O botão exibe “Adicionar adendo”, mas o nome de voz contém paciente/data/intervalo. Antes, o comando `Clicar em Adicionar adendo` não o encontrava mesmo com uma única sessão. Corrigido com alias explícito no próprio botão, preservando nome completo, identidade do registro e revalidação normal. Um alvo gera proposta específica; mais de um continua recusado até indicar o registro. Cancelar o formulário não grava.

Dois cenários focados de interface passaram **2/2 em24,1s**, backend simulado: único alvo confirmado/cancelado sem escrita; dois alvos recusados e abertura explícita da sessão da tarde. Revisor confirmou a correção sem novo achado concreto, sem repetir esses testes. Incremento ainda não no instalador0.2.47.

## Biblioteca e contexto: rotas naturais implementadas

`Abrir biblioteca de comportamentos reutilizáveis` abre a gaveta existente em Sessões, preservando o título não salvo mesmo ao retornar de outra área. `Abrir contexto do caso de Ana Clara` seleciona apenas paciente ativo/exato/único e aguarda a consulta antes de abrir o formulário existente. Nenhuma dessas aberturas cria modelo, sessão ou revisão.

Revisão independente reproduziu três falhas de carga atrasada: reutilização do ID da consulta anterior, abertura em área oculta após navegação e pedido antigo sobrevivendo ao fechamento/remontagem. Corrigidas limpando a identidade carregada na troca de paciente, descartando a solicitação ao mudar de área/paciente e limpando-a no fechamento aceito de Sessões, após salvar pendências normalmente. Cinco testes focados passaram em28,2s, com RPC sintético e sem escritas. A primeira execução de quatro testes foi3/4 por um localizador que excluía formulário oculto; a asserção passou a consultar o DOM fechado/ausente. Revisão final sem novo achado no código de produção; pediu tornar determinística a asserção após a segunda consulta do teste de remontagem.

Teste de remontagem fortalecido para esperar a segunda consulta, comprovar o conteúdo carregado e só então verificar a gaveta fechada: **5/5 focados em27,4s**. Regressão do mesmo código de produção: **45/45E2E interface/biblioteca/transições/workflows em3,0min**, **233/233JS**, build/guard/diff aprovados, lint exit0 com cinco avisos (quatro anteriores e um novo set-state-in-effect ao invalidar carga). Build mantém aviso de chunk>500KiB. Não incluído no instalador0.2.47; sem teste de microfone físico/banco nativo ou alteração de perfil.

## Adendo natural: rota implementada e empacotada0.2.48

`Adicionar adendo à sessão de Ana Clara de 03/10/2026 às 15:00` possui parser próprio e não cai no agendamento. Após confirmar, consulta novamente e exige sessão finalizada única/exata do paciente/data/horário; abre formulário existente, não cria compromisso nem adendo. Preserva texto ainda não salvo e invalida pedido antigo ao cancelar/salvar, mudar área/paciente, fechar ou retomar/iniciar rascunho. Troca para outro paciente com editores abertos é recusada até salvar e fechar Sessões. Nenhum savePending nessa nova rota.

As três fricções desta auditoria foram resolvidas e consolidadas no pacote local0.2.48: **234/234JS, 53/53E2E em4,0min e 83Rust release aprovados/1 ignorado**. [Pacote, achados/correções, falha de compilação debug e limites](melhoria-continua-voz.md). Referências anteriores a incrementos não empacotados são históricas; estavam fora da47 e agora estão na48. Senhas e escolha nativa de arquivos continuam manuais; nenhuma melhoria de recovery/legados ou protocolo clínico foi implementada.

Microfone físico e banco nativo não foram usados nesta auditoria. A meta permanece ativa até ampliar os caminhos e sua evidência, sem declarar cobertura universal por existirem alternativas literais.

Regressão histórica do incremento de alias: **29/29 E2E interface/workflows em2,1min**, **232/232JS**, lint/build/guard/diff aprovados com avisos anteriores. Sem novo backend Rust, arquivo de perfil, instalador ou publicação.
