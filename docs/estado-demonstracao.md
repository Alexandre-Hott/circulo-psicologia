# Estado da demonstração

O navegador executa apenas um MVP com dados fictícios. Perfis, séries, exceções, mudanças de série, sessões finalizadas, biblioteca e rascunhos são mantidos no estado React, em memória. Nenhum desses registros é gravado em `localStorage`, IndexedDB, arquivo ou backend. O botão de guardar rascunho apenas o mantém durante a sessão atual da página.

Ao recarregar a página, o estado volta aos exemplos fictícios iniciais; alterações feitas pelo avaliador não são restauradas. O cabeçalho, a lista de pacientes e Ajustes avisam isso explicitamente. Ajustes mostra as contagens atuais de cada coleção temporária.

Ao sair de uma sessão sem conteúdo, a navegação é direta. Se houver conteúdo, tanto o botão de saída quanto o menu lateral abrem um diálogo. Sem cópia salva, é possível continuar, manter ou descartar o rascunho corrente. Com uma cópia já guardada, “descartar alterações recentes” preserva essa versão exatamente como foi salva; excluí-la por completo exige outra opção e confirmação com paciente, ID e data/origem, sem conteúdo clínico, anotação privada ou link. Cancelar mantém a cópia salva. Iniciar uma sessão de outro paciente por meio do menu passa pela mesma decisão. Finalizar uma sessão usa sua confirmação própria e não exibe o aviso de descarte.

A finalização é uma atualização síncrona do estado em memória, não uma operação de rede. Uma trava de execução impede duplo clique ou Enter repetido de criarem dois registros. Cancelar a confirmação ou corrigir uma data inválida libera uma nova tentativa; após sucesso, a tela deixa o formulário. Não há etapa artificial de “processamento” ou promessa de persistência.

A linha do tempo filtra estritamente pelo paciente selecionado e ordena uma cópia das sessões pela data civil da sessão, mais recente primeiro. Empates usam a data de criação e depois o ID; datas inválidas ficam no fim com indicação explícita, sem impedir a visualização dos demais registros.

O perfil mostra indicadores descritivos apenas da sessão mais recente daquele paciente. Cada sessão finalizada guarda uma cópia do nome e da escala dos indicadores usados; o resumo usa essa cópia, não um rótulo atual presumido. Valores ausentes, fora da escala ou sem snapshot aparecem como “Sem registro”, sem carregar um valor de sessão anterior nem inferir classificação.

No rascunho, cada indicador pode ser limpo explicitamente após uma seleção acidental. Isso restaura a ausência de valor sem apagar a nota contextual nem outros indicadores. A ausência aparece como “Sem registro”; a opção 0 (“Ainda não observado”) continua sendo uma escolha descritiva distinta.

Na Biblioteca, a busca por nome ou categoria não altera os itens: consultas sem resultado mostram uma mensagem explícita, e limpar a busca restaura o catálogo e o foco no campo. Uma biblioteca vazia também é indicada sem desativar a criação de itens fictícios.

Editar um item ativo da Biblioteca permite mudar somente nome, categoria, descrição e unidade já existentes, com nome e categoria obrigatórios. Mudanças reais incrementam a versão do catálogo mantendo seu ID; salvar os mesmos valores não cria versão. Ocorrências anteriores continuam com a versão e os quatro campos copiados quando foram aplicadas, inclusive após arquivamento ou restauração.

No passo Observações, a busca rápida mostra apenas comportamentos ativos e informa quando não há correspondência. Limpar a busca devolve o foco ao campo; pesquisar ou limpar nunca cria uma ocorrência clínica. Somente a escolha explícita de um item o aplica ao rascunho.

Cada sessão finalizada no histórico do perfil pode expandir seus detalhes textuais preenchidos (chegada, observações, contexto, atividades, estratégias, pontos de atenção e próximos passos) e os comentários de indicadores com nome/versão da escala registrada. Campos vazios são omitidos; o texto multilinha é preservado. A anotação privada não é exibida no perfil nem na evolução.

Respostas emocionais explícitas “Não sei” e “Não quero responder” permanecem associadas à sessão no perfil e na evolução; não são convertidas em “Sem registro”. Uma sessão sem escolha nem resposta explícita mostra ausência de registro. As opções de emoção e intensidade expõem nome e estado selecionado à tecnologia assistiva.

Trocar uma ou mais emoções já escolhidas por uma resposta explícita exige confirmação da quantidade de seleções/intensidades que serão substituídas, sem repetir seus nomes ou valores. O caminho inverso, da resposta explícita para uma emoção, também pede confirmação sem repetir a resposta. Cancelar conserva exatamente o rascunho; a primeira escolha e o desmarcar da opção atual não pedem confirmação.

A modalidade da sessão finalizada é registrada em snapshot próprio. Um link externo opcional só é aceito para modalidade Online com URL HTTP/HTTPS válida e aparece no histórico apenas nessa modalidade; ele nunca é aberto automaticamente. Ao voltar de Online para Presencial com link preenchido, a interface pede confirmação antes de descartá-lo.

Na nova série recorrente, um link externo Online opcional é validado pelo mesmo contrato HTTP/HTTPS. Trocar o paciente ou mudar para Presencial com link preenchido pede confirmação antes de descartá-lo. Cada ocorrência Online leva essa referência para o rascunho iniciado pela Agenda e preserva uma cópia na origem histórica do compromisso; ocorrências presenciais nunca recebem link. O profissional pode ajustar explicitamente a referência da sessão, sem reescrever a origem da Agenda. Nenhuma dessas ações abre ou inicia videoconferência.

Uma nova série pode ter data final opcional. A data precisa ser igual ou posterior à primeira ocorrência possível para o dia da semana escolhido. Uma ocorrência elegível no dia final é incluída; datas posteriores ficam fora. Campo vazio significa sem data final definida, não um término presumido. O limite não altera sessões ou exceções anteriores; o encerramento manual prospectivo permanece uma operação distinta.

O diálogo de ocorrência da Agenda mostra a referência Online cadastrada como texto não clicável, tanto antes quanto depois de realizar a sessão. Compromissos presenciais e compromissos Online sem referência não exibem esse texto. Consultar o diálogo não altera horário, link ou snapshot.

A tela Evolução lista, para cada indicador, os valores de cada sessão em ordem de data civil com nome, rótulo e versão da escala copiados na ocasião. Um gráfico de pontos por sessão representa somente a posição ordinal registrada na escala histórica daquela sessão, sem unidade clínica e sem ligar pontos entre sessões. A tabela textual equivalente explicita a escala completa e a posição selecionada. Sessões sem valor válido aparecem como “Sem registro” e não têm ponto preenchido; zero é valor registrado distinto. A mensagem de ausência só aparece quando o paciente não tem sessões finalizadas; não há tendência calculada, diagnóstico ou interpretação clínica automática.

Em Ajustes, **Limpar demonstração** abre uma confirmação. **Cancelar** conserva todas as coleções; **Confirmar limpeza** zera perfis, séries e suas exceções/histórico, sessões, biblioteca e rascunhos em memória, sem gerar backup. A interface permanece navegável e permite criar novos perfis fictícios. Recarregar depois da limpeza volta aos exemplos iniciais — a limpeza não é persistente, assim como nenhuma outra alteração deste MVP.

Não inserir dados clínicos reais até haver armazenamento cifrado, auditoria, backup e políticas de acesso implementados e validados.

## Testes integrados locais

Rode `npm test`, `npm run test:e2e`, `npm run lint` e `npm run build` a partir da raiz do MVP. `test:e2e` inicia um Vite temporário em `127.0.0.1:5189` e usa Microsoft Edge instalado localmente em modo headless; não depende de nuvem ou serviço externo. A suíte usa apenas nomes e operações fictícias, em contexto de navegador isolado por teste. Em outro ambiente, defina `E2E_BROWSER_CHANNEL` com um canal Playwright disponível (por exemplo `chrome` ou `chromium`); para `chromium`, instale previamente o navegador correspondente do Playwright. Resultados e traces de falha ficam em `test-results/`, excluído do controle de versão.
