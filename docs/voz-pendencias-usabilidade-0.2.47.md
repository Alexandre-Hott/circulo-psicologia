# Pendências de usabilidade da voz — após0.2.47

Auditoria independente de fontes/parsers no HEADa88952f, com dados fictícios e sem executar handlers persistentes. Suplementos posteriores da matriz foram considerados: linhas S históricas não são tratadas automaticamente como bugs.

## Texto visível de Adicionar adendo

O botão exibe “Adicionar adendo”, mas o nome de voz contém paciente/data/intervalo. Antes, o comando `Clicar em Adicionar adendo` não o encontrava mesmo com uma única sessão. Corrigido com alias explícito no próprio botão, preservando nome completo, identidade do registro e revalidação normal. Um alvo gera proposta específica; mais de um continua recusado até indicar o registro. Cancelar o formulário não grava.

Dois cenários focados de interface passaram **2/2 em24,1s**, backend simulado: único alvo confirmado/cancelado sem escrita; dois alvos recusados e abertura explícita da sessão da tarde. Revisor confirmou a correção sem novo achado concreto, sem repetir esses testes. Incremento ainda não no instalador0.2.47.

## Rotas naturais ainda pendentes

1. `Abrir biblioteca de comportamentos reutilizáveis` ainda não abre a gaveta; o caminho atual é abrir Sessões e `Clicar em Biblioteca de comportamentos reutilizáveis`. Implementar abertura pelo pedido natural em qualquer área, sem criar modelo ou sessão.
2. `Abrir contexto do caso de Ana Clara` ainda não possui rota natural; atual caminho abre registros do paciente e depois `Clicar em Contexto do caso`. Reutilizar o formulário existente, com paciente único/ativo/exato e sem salvar revisão ao abrir.
3. `Adicionar adendo à sessão de Ana Clara de 03/10/2026 às 15:00` ainda cai no parser de série recorrente. Deve abrir apenas o formulário do registro finalizado exato; nunca criar compromisso. O alias curto corrigido acima não resolve esse pedido com paciente/data/horário.

As três são fricções de acesso, não falhas de persistência comprovadas. Não acrescentar procedimentos clínicos, limpar recovery ou alterar compatibilidade de backups para resolvê-las. Senhas e escolha nativa de arquivos continuam manuais.

Microfone físico e banco nativo não foram usados nesta auditoria. A meta permanece ativa até ampliar os caminhos e sua evidência, sem declarar cobertura universal por existirem alternativas literais.

Regressão final do incremento: **29/29 E2E interface/workflows em2,1min**, **232/232JS**, lint/build/guard/diff aprovados com avisos anteriores. Sem novo backend Rust, arquivo de perfil, instalador ou publicação.
