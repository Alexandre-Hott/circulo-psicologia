# Validação dos comandos do compromisso focado 0.2.77

Esta rodada amplia a seleção de compromissos da 0.2.76. Depois de selecionar um compromisso no calendário, pode pedir `Clicar em Alterar` ou `Clicar em Iniciar sessão`, usando os nomes dos botões visíveis. A implementação congelada foi revisada por inspeção e passou os testes JavaScript, Rust e a rodada selecionada de interface com metadados 0.2.77. Esses resultados não comprovam microfone físico nem todas as ações das oito áreas; a meta continua ativa.

## Fluxo esperado

Abra os detalhes do compromisso desejado, por clique ou pelo comando com a opção exibida no calendário. Prepare um dos dois pedidos curtos, confira paciente, data efetiva e intervalo na prévia e confirme. Alterar deve abrir o formulário existente, sem gravar. Iniciar sessão deve chamar o fluxo existente de criação ou retomada do rascunho; não finaliza a sessão.

Os pedidos curtos não devem escolher um compromisso na lista geral de detalhes nem nos botões soltos do calendário. São exclusivos do detalhe focado em uma ocorrência. As condições atuais de disponibilidade dos botões continuam valendo, incluindo sessão concluída, paciente arquivado e operação em andamento. Um editor de ocorrência ou encerramento de série aberto impede os atalhos. O drawer de novo compromisso, sozinho, não os impede.

## Critérios de aceitação

- Preparar não clica nem escreve. Confirmar usa somente o botão e o handler existentes do destino conferido.
- Identidade da ocorrência, paciente, série, data original, data efetiva, intervalo, ação, record e ciclos da interface devem ser coerentes desde o preparo e novamente na aplicação.
- Dois pacientes com o mesmo nome e horário devem continuar distinguíveis pelo compromisso explicitamente focado.
- Duplicatas marcadas devem provocar recusa antes da deduplicação do inventário. Outros botões ou aliases visíveis que correspondam ao pedido curto também competem; não se escolhe o primeiro.
- Fechar e reabrir os mesmos detalhes, mudar o foco, atualizar a lista, mudar o período ou sair e retornar à área invalida a proposta antiga, mesmo que o destino final volte a ser o mesmo.
- Rótulos completos anteriores continuam funcionando. Os comandos curtos não alteram autorizações de cancelamento, remarcação, salvamento ou finalização.

## Falhas iniciais e correções dos testes

Os testes unitários usam o parser e o executor reais, com um modelo mínimo de DOM. Contra a 0.2.76, a primeira observação do coordenador teve 193 casos: 104 passaram e 89 falharam. O arquivo ainda recebeu novos casos; esse resultado não descreve o conjunto final. Depois do congelamento, o coordenador repetiu os 223 casos: 118 passaram e 105 falharam, com código de saída 1 em 274,80 ms. O agente de testes observou os mesmos totais em sua execução separada. As falhas incluem a ausência de resolução dos dois pedidos curtos e a falta das novas guardas de identidade dos controles marcados; não provam falha de captura física.

Após revisão independente, o conjunto foi ampliado para cobrir as mesmas matrizes de coerência e identidade tanto nos pedidos curtos quanto nos rótulos completos marcados, incluindo a duplicata anterior do calendário. O novo arquivo congelado tem SHA-256 `6548c343d966194cbb26a8437142b52857d5e3a2b7c8639f8c557fb0bb7beb3f`. O coordenador repetiu os 457 casos contra o parser 0.2.76, cujo hash permaneceu inalterado antes e depois da execução: 132 passaram e 325 falharam, saída 1 em 425,82 ms. O agente observou separadamente os mesmos totais. Não são testes aprovados da implementação nova.

A interface também teve uma falha inicial legítima: o primeiro cenário encontrou o botão do detalhe correto, mas faltava a marcação de ocorrência focada. O coordenador repetiu esse único caso, que falhou em 18,2 s, saída 1; o agente observou a mesma falha em uma execução separada de 17,7 s. Uma seleção anterior de teste pelo coordenador não encontrou casos e não conta como evidência de falha de produção.

A suíte de interface usa componentes React e o gateway reais. Os 19 casos novos usam IPC simulado e comandos digitados, sem captura de mídia; a mídia simulada pertence aos replays da regressão anterior. A revisão pediu contagem direta de cliques para detectar aplicação indevida em clones sem handlers React e nos concorrentes exact/alias, além de matrizes de invalidação para ambas as ações. Os ajustes foram aplicados, e o conjunto tem 19 casos. Sua primeira execução no código congelado terminou com 18 aprovados e um falho, saída 1 em 1,6 min, sem retries. No caso falho, o editor correto já havia sido aberto; depois, o clique em Preparar rascunho para testar uma recusa excedeu o limite de 20 segundos, com o elemento instável no ambiente com relógio pausado. Essa rodada não é considerada aprovada.

Um ajuste preliminar do helper tentou estabilizar a geometria avançando frames, mas sua execução terminou com três aprovados e 16 falhos em 1,5 min, saída 1. As 16 falhas ocorreram na nova asserção de geometria, não em payloads ou destinos. Essa tentativa foi removida. O preparo agora usa o atalho Ctrl+Enter existente no campo Seu comando, que chama o mesmo `interpret(command)` do botão Preparar, sem injetar intents nem usar cliques forçados. As verificações de cliques, identidade, efeitos e invalidação foram preservadas. O spec congelado tem SHA-256 `a3f82a0ef6c8c8b37e127dcf9605c0f963589c6b131b80a4c4cccc1635aa4f15`. A revisão independente aprovou esse delta por inspeção; os 19 casos novos não provam o acionamento físico do botão Preparar por mouse.

## Validação do código congelado

O coordenador executou juntos os 457 casos novos, os 95 casos de opções de ocorrências e os 59 casos de opções de séries: 611/611 passaram, saída 0 em 482,15 ms. Separadamente, na fase com metadados 0.2.76, o `npm test` passou 960/960 em 5684,01 ms, saída 0. Naquela fase o script ainda não incluía o módulo novo; não se deve somar 611 e 960 como se fossem casos distintos, pois os 154 casos anteriores aparecem nos dois conjuntos. Uma execução preliminar de 611/611 ocorreu enquanto o hash de produção mudava; ela não é usada como prova do congelamento.

Depois, o módulo novo foi incluído no script padrão e os cinco arquivos de metadados foram atualizados para 0.2.77. O coordenador executou `npm test`: 1417/1417 passaram, saída 0 em 5015,29 ms. Esse é o resultado do conjunto padrão ampliado; os resultados de 611 e 960 acima são fases anteriores sobrepostas, não testes adicionais a somar. Rust release/offline/locked passou 135 testes, zero falhas e um ignorado em 7,66 s. Não houve alteração funcional Rust; o aviso anterior de PDB do OpenSSL permaneceu.

Os hashes congelados são `e494e2bc5f3bba67b6fdc671cf67e6264225764bec60156d8ca615c7e0b07731` para `src/DesktopAgenda.jsx` e `178c33c2c08e6476820e32ddde845dfef9990bd6f414a7212765417190fba409` para `src/voiceInterfaceCommands.js`. O agente de implementação executou separadamente 457/457 e lint direcionado sem erros, com dois avisos anteriores. A revisão independente conferiu os hashes de produção e não encontrou P1/P2 concreto por inspeção; não executou os testes. Lint completo do coordenador passou com oito avisos anteriores; build frontend passou com aviso de chunk acima de 500 KiB.

A primeira regressão selecionada de 98 casos em seis arquivos terminou com 94 aprovados e quatro falhos, saída 1 em 7,4 min, sem retries. Os quatro replays de `voice-occurrence-minutes-assistant.spec.js` emitiam fala não silenciosa continuamente em intervalo de zero ms: atingiam o limite correto de 12 segundos, mas esperavam proposta automática. O aviso de corte substituiu a proposta esperada. A simulação agora emite fala curta seguida de silêncio em cadência de 200 ms, com avanço de replay de 1600 ms, e verifica cleanup, PCM abaixo de 12 segundos e ausência de aviso de corte. Corpus, transcrições, segundo áudio de confirmação, destinos e payloads foram preservados; a produção não foi alterada para resolver essas falhas. O spec atualizado tem SHA-256 `b3e405818a2aac2f60894651d1b4038aed2ce2f4de7a983901be091c320fc275` e foi revisado por inspeção.

A rodada final conjunta dos 19 cenários novos e dos 98 anteriores terminou com 117/117 aprovados, saída 0 em 8,5 min: sete arquivos, um worker e zero retries. Os quatro replays corrigidos passaram nessa mesma execução. Nenhuma dessas suítes é uma validação integral das oito áreas.

Esta rodada não captura áudio físico, não troca o modelo de reconhecimento, não acessa o perfil instalado e não comprova instalação nativa. Senhas e seleção de arquivos permanecem manuais. Limpeza de recovery e compatibilidade com backups antigos seguem fora do escopo. Uma auditoria separada da cobertura atual das oito áreas deverá orientar os próximos incrementos; estes dois atalhos não encerram a meta geral.

## Instalador local

O build NSIS terminou com saída 0, mantendo os avisos conhecidos de chunk frontend acima de 500 KiB e PDB do OpenSSL. O [Círculo_0.2.77_x64-setup.exe](../src-tauri/target/release/bundle/nsis/Círculo_0.2.77_x64-setup.exe) tem versão PE 0.2.77, 135.895.108 bytes e SHA-256 `881e7d87cb53fcb59a81da88078d5974975eed7eaec8c0ab64ccc291404968f0`. A auditoria confirmou metadados x64 e estado Authenticode NotSigned; não extraiu o conteúdo interno nem testou instalação, execução ou desinstalação.

O pacote foi gerado localmente com uma configuração temporária que desativa apenas a geração de artefatos de atualização assinados. Essa configuração foi removida após o build; a configuração oficial de updater, chave pública e endpoints permaneceu inalterada. Não houve leitura da chave privada, assinatura, publicação de Release nem instalação sobre o aplicativo existente. A versão instalada 0.2.61 e o perfil não foram alterados. O link acima é local, não um download publicado no GitHub.

## Próximas lacunas identificadas

A auditoria estática atual das oito áreas encontrou uma falta funcional no ditado direcionado: os controles internos do assistente são excluídos do inventário em `src/voiceInterfaceCommands.js`, e o modo de ditado em `src/VoiceCommandCenter.jsx` exige cliques para selecionar o campo, preparar, confirmar ou descartar o trecho. O áudio nesse modo é texto literal; falar confirmar não pode ser interpretado silenciosamente como autorização. A próxima solução precisa separar explicitamente áudio de comando e conteúdo ditado, preservando o texto e a revisão.

Também falta um teste específico de recuperação de cópia automática por comando de voz: o controle existe em `src/DesktopVault.jsx`, mas os testes de voz de Ajustes não demonstram esse caminho. Isso é uma lacuna de prova, não justificativa para alterar a recuperação ou investigar limpeza de arquivos.

Nas outras áreas, a revisão encontrou rotas e casos existentes, mas apenas leu fontes: não executou uma validação integral da cobertura. Esses achados orientam o trabalho e não constituem aprovação universal. Captura física, acústica do computador do cliente e execução do instalador continuam sem nova homologação nesta rodada.
