# Controles de comando e ditado do assistente

Este registro documenta a entrega local 0.2.78: controles de comando e ditado separados, com confirmação e conteúdo literal. A rodada final passou209/209 casos de interface, sem retries, em24,6min; os testes usam mídia e IPC sintéticos e não comprovam precisão de reconhecimento nativo ou microfone físico. A meta geral das oito áreas continua ativa.

## Dois canais explícitos

Ouvir comando está disponível nos dois modos e trata apenas instruções. Ouvir trecho exige um campo válido e mantém todo o áudio como conteúdo literal, inclusive palavras como confirmar e descartar. A finalidade é fixada ao iniciar a captura; o retorno nunca é reinterpretado no outro canal.

Ctrl+Shift+Espaço mantém a captura contextual existente. Ctrl+Alt+M inicia a captura de comando nos dois modos. Nenhum canal escuta continuamente. Senhas, escolha de arquivos e salvamento final do rascunho permanecem nos fluxos existentes.

## Pedidos locais

- Ditar neste campo entra no modo de ditado.
- Selecionar campo seguido do rótulo completo escolhe um dos quatro campos de sessão.
- Preparar trecho revisa o acréscimo literal, sem aplicar ou salvar.
- Confirmar acréscimo, ou Confirmar dentro do modo de ditado, aplica somente uma proposta local válida.
- Descartar trecho remove proposta e destino, mantendo o corpo editável.
- Usar comandos sai do modo de ditado.

Os rótulos oficiais são Observações descritivas, Procedimentos realizados, Resultado e decisão e Encaminhamento ou encerramento (opcional). Para o último campo, também serão aceitos Encaminhamento ou encerramento e Encaminhamento ou encerramento opcional: a indicação de preenchimento opcional não exige ditar parênteses. Não serão aceitos nomes abreviados ou aproximações. Pedidos locais são tratados antes das confirmações genéricas. Dentro do modo de ditado, pedido inválido não pode cair no parser externo. Fora dele, Confirmar mantém o comportamento externo anterior.

Editar o comando ou iniciar sua captura preserva proposta local, corpo e seleção. Alterar corpo, destino ou contexto invalida o acréscimo. Erro ou transcrição vazia no canal de comando deve apresentar diagnóstico separado, sem apagar a proposta. O caso obrigatório de interface é preparar um corpo válido, digitar Confirmar acréscimo e aplicar exatamente uma vez.

## Aplicação e captura

A confirmação exige a flag local de proposta pendente, seleção e snapshot válidos. O intent externo continua sendo session.draft.update com operação append e dictationSelection; não se cria outro formato de intenção. A proposta só acrescenta ao formulário; salvar continua explícito.

As guardas incluem paciente, rascunho, campo, ciclo da interface, revisão, época e texto-base. Uma mudança seguida de retorno ao mesmo destino não revive uma proposta antiga. O limite de 4000 unidades UTF-16 inclui texto anterior e separador; não se normaliza, corta ou sobrescreve texto clínico.

Um owner/token compartilhado entre canais deve ser adquirido sincronamente antes de chamar a transcrição. Uma segunda captura não inicia em paralelo. Somente o owner atual pode publicar resposta ou erro e liberar seu estado; respostas obsoletas não podem apagar propostas ou liberar outra captura.

Ao atingir 12 segundos, um comando fica editável e exige revisão e preparo explícitos, sem execução automática, inclusive se disser confirmar. O trecho cortado continua literal e revisável. Não haverá captura física, troca de modelo ou nova inferência nativa nesta rodada.

## Testes e revisão

Os agentes devem produzir testes unitários do parser puro e testes de interface com componentes reais e dados sintéticos antes da implementação. O RED de interface precisa demonstrar uma funcionalidade ausente no código 0.2.77, não apenas módulo inexistente ou seletor errado. Depois do congelamento e da revisão dos testes, será autorizada a implementação em VoiceCommandCenter.jsx e no novo voiceDictationControls.js.

O fixture antigo de ditado omite dictationSelection embora o retorno real o inclua. Se necessário, esse double será alinhado minimamente após o RED, sem enfraquecer guardas de produção. As consultas de mídia antigas também precisam distinguir os dois canais explícitos. Recuperação automática por voz permanece uma lacuna de teste separada; limpeza de recovery e compatibilidade com backups antigos não entram neste incremento.

## Evidência antes da implementação

A primeira versão dos testes unitários tinha 306 casos. O coordenador repetiu a execução: zero aprovados, uma falha e 305 ignorados, saída 1 em 199,34 ms. Após incluir as duas formas faladas do último campo, o conjunto tem 349 casos: zero aprovados, uma falha e 348 ignorados, saída 1 em 189,79 ms. A única falha é o módulo de produção ausente; isso não é evidência de falha funcional. O conjunto congelado, SHA-256 `e98142d07347f82c6a6e881e748ef48d55adad8c9016d508bd286fce4c45c825`, foi aprovado por inspeção no escopo do parser puro; não comprova estado React ou captura.

O primeiro cenário de interface abriu o rascunho real com IPC sintético e encontrou zero controles Ouvir comando, quando esperava um. O coordenador observou essa falha em 19,3 segundos, saída 1, um worker e zero retries; o agente observou separadamente a mesma falha em 18,5 segundos. O componente de produção permaneceu inalterado. Isso comprova a ausência do novo controle, não os demais cenários de comportamento.

A revisão dos 19 cenários iniciais pediu cobertura adicional de proposta preparada seguida de troca de rascunho e retorno, e de edição do corpo durante uma transcrição pendente. Esses casos foram incluídos. A revisão também corrigiu um falso positivo: cada teste das variantes faladas deve selecionar outro campo antes do áudio e exigir a transição ao campo pretendido, não apenas conservar uma seleção anterior.

O conjunto final de interface tem 21 cenários, SHA-256 `9b8ba9aad8380066b677a2fcb8e3eeffa0eedf4f7b65ca8add4022051ffc294b`, aprovado por inspeção. O coordenador repetiu somente o primeiro cenário no conjunto final: uma falha em 19,4 segundos, saída 1, novamente pela ausência de Ouvir comando. Uma repetição intermediária teve a mesma falha em 21,7 segundos. O hash do componente permaneceu `0a0d95e6e1c7c95965e7b5d9c1e9fe1842ad021ae54c4282348241b5419fccc1` até a autorização de implementação. Esses resultados não comprovam os outros 20 cenários.

Com esses testes congelados e revisados, foi autorizada a implementação nos dois arquivos de produção previstos. Os testes antigos foram alinhados apenas aos dois nomes de captura e ao retorno real com dictationSelection do fixture de ditado. O diff de 15 arquivos foi revisado por inspeção: 52 referências de comando, seis de trecho e uma inclusão da seleção no retorno do fixture, sem mudar corpus, payloads esperados, tempos, mídia ou assertions.

## Primeira validação da implementação

O componente congelado tem SHA-256 `6177a2823eda369d0e3ee90e938752f16a1285ddcc8f0796cf5bb29ccdd62633`; o parser puro, `75c905cd480b86a27656562c28b37ab319882a4edbb7a578c699ef9bab6f79c8`. O coordenador executou os 349 testes novos: todos passaram, zero ignorados, saída 0 em 198,28 ms, com hash do parser igual antes e depois. O agente também observou 349/349 numa execução separada.

Separadamente, o conjunto padrão ainda com metadados 0.2.77 passou 1417/1417 em 6150,34 ms, saída 0. O script padrão ainda não inclui o módulo novo. Lint completo saiu 0 com oito avisos; esses resultados não aprovam a interface ou o pacote.

A rodada dos 21 cenários novos terminou com 19 aprovados e dois falhos, saída 1 em 1,0 min, um worker e zero retries. Falharam o campo Encaminhamento ou encerramento e a sequência de selecionar/preparar por áudio: Confirmar acréscimo estava habilitado, mas o helper de leitura de props do React encontrou a intenção pendente nula. Uma inspeção posterior do estado React comprometido encontrou a intenção correta. A consulta pelo caminho antigo do nó DOM lia uma árvore obsoleta; o helper foi corrigido para localizar o nó na raiz atual, sem chamar callbacks nem injetar estado. As assertions e os dois cenários foram preservados. O conjunto passou a ter SHA-256 `36178918bbc48cb8db76b555b019601e3076d4f8abe2df759664c921a33000d8`; os dois casos antes falhos passaram numa execução focada do agente, saída 0 em 29,5 segundos. Esse resultado não substitui a repetição integral pelo coordenador.

## Compatibilidade e validação atual

A primeira rodada do coordenador com seis arquivos antigos terminou com 49 aprovados e seis falhos entre 55 casos, saída 1 em 2,5 minutos. Quatro falhas exigiam ausência do campo Seu comando, contrariando o novo contrato de dois canais. Esses testes passaram a exigir o campo de comando visível e editável, separado do corpo literal e com os dois botões de captura. As verificações de conteúdo, destino e salvamento foram mantidas.

As outras duas falhas revelaram regressões de compatibilidade: o aviso de transcrição ainda não interpretada deixara de aparecer na prévia esperada, e o botão de preparar o comando digitado ficava indisponível durante uma captura pendente. A produção foi corrigida somente nesses dois pontos; preparar o texto invalida a resposta tardia, sem permitir uma segunda captura concorrente. Os dois casos antigos passaram na execução focada do agente, saída 0 em 19,4 segundos. A revisão confirmou que o componente final, SHA-256 `4fa32bde89f0285ae46870e56605dff8575bc27d11e474e0c16e1eb94d2fde6b`, difere da versão anterior apenas nessas correções. O parser puro permaneceu inalterado.

Com os metadados 0.2.78 e o módulo novo incluído no script padrão, o coordenador observou 1766 testes JavaScript aprovados, zero falhos ou ignorados, saída 0 em 4489,18 ms. Os 349 casos novos estão incluídos nesse total. Lint completo saiu 0 com oito avisos. Os testes Rust em release, offline e com lockfile passaram: 135 aprovados, zero falhos e um ignorado, saída 0 em 8,47 segundos.

A rodada integral de interface com 209 casos, 15 arquivos, um worker e zero retries terminou com 185 aprovados e 24 falhos, saída 1 em 12,7 minutos. Todos os 21 casos novos passaram nessa execução. As falhas ocorreram em 22 replays de desktop-voice-interface.spec.js e dois de voice-draft-resume-assistant.spec.js. Os erros registrados mostram o aviso de captura atingindo 12 segundos em vez da interpretação automática esperada. Os dois simuladores emitem fala sem interrupção com timer de zero milissegundos. Foi autorizada uma correção de mídia sintética nesses arquivos, preservando corpus, transcrições, confirmação em segundo áudio, destinos e payloads. A proteção de corte da produção não será removida para satisfazer os testes. A repetição integral ainda está pendente.

Não houve nova inferência ASR, captura física ou teste nativo instalado. A validação da interface ainda não está aprovada, e a meta permanece ativa.

A repetição integral após o ajuste dos simuladores terminou com 208 aprovados e um falho entre 209 casos, saída 1 em 13,5 minutos, sem retries. Os 24 casos antes afetados pelo corte passaram, assim como os 21 novos. A falha restante é de produção: descartar uma proposta enquanto a confirmação de áudio está pendente ainda permitiu que a resposta tardia abrisse Novo cadastro. Não houve salvamento do cadastro. A revisão confirmou que a remoção da intenção externa não invalidava a geração da captura normal, permitindo reutilizar a closure antiga. Foi autorizada uma correção restrita dessa invalidação, mantendo o owner até o término da operação e preservando as limpezas internas do ditado. O teste e suas assertions não serão enfraquecidos. Ainda é necessário repetir os testes no novo código e reconstruir o pacote.

A correção foi aplicada e revisada: somente o predicado da invalidação mudou. O componente final tem SHA-256 `901ab6d97d0a9c14c09827faa4f49554dbadec6a4c90d9a3d27477d69bcfc438`; o parser permanece `75c905cd480b86a27656562c28b37ab319882a4edbb7a578c699ef9bab6f79c8`. O agente repetiu o único teste de descarte que falhava: 1/1 aprovado, saída 0 em 20,1 segundos, com caso de 10,8 segundos, sem alterar assertions. Repetiu também os 349 casos novos, todos aprovados, saída 0 em 228,24 ms. O coordenador executou novamente o conjunto padrão: 1766/1766 aprovados em 4966,91 ms, saída 0; lint completo saiu 0 com oito avisos. Esses resultados separados não equivalem a uma execução de 209 testes integralmente aprovada no código final. A auditoria do pacote reconstruído foi concluída; a repetição integral de interface continua pendente.

## Validação final e pacote local

O primeiro build NSIS terminou com saída 0, mantendo os avisos conhecidos de chunk frontend acima de 500 KiB e PDB do OpenSSL. O primeiro candidato desta versão tinha 135.893.123 bytes e SHA-256 `400a555624b58820819046889b0832ad6cf0f8940380541933a683f25bbc2131`. A auditoria confirmou versão PE 0.2.78, x64 e estado Authenticode NotSigned; não extraiu o conteúdo interno nem testou instalação, execução ou desinstalação. Esse candidato foi substituído, pois antecedia a correção de descarte. A entrega validada anterior continua sendo a 0.2.77.

O pacote reconstruído Círculo_0.2.78_x64-setup.exe tem 135.895.632 bytes e SHA-256 `b32da37729c12b76041b66d51ad9d002fad8c1f7e65665b8d0c457593c21ee07`. O rebuild terminou com saída 0 sobre o componente final 901ab6d9; a nova auditoria confirmou PE 0.2.78, x64 e NotSigned, sem inspeção interna ou teste instalado. A repetição integral no código final terminou com209/209 aprovados, saída0, em24,6min, um worker e zero retries. Inclui os21 cenários novos e o descarte externo durante confirmação pendente. O pacote está disponível para teste local, não publicado como Release.

As rodadas falhas descritas acima são histórico do diagnóstico, não o estado final dos209 casos. A aprovação se restringe aos cenários selecionados: não cobre universalmente todas as ações nem reconhecimento acústico. A próxima rodada separada verifica jornadas completas e recuperação automática com senha manual. Limpeza de recovery e compatibilidade com backups antigos permanecem fora do escopo; microfone físico e fluxos instalados não foram homologados nesta entrega.

Foi usada uma configuração temporária para desativar somente os artefatos de atualização assinados. Ela foi removida após o build; a configuração oficial do updater, chave pública e endpoints permaneceram inalterados. Não houve leitura da chave privada, assinatura, publicação de Release nem instalação sobre o aplicativo existente. A versão instalada 0.2.61 e o perfil foram preservados.

## Jornadas adicionais após a validação dos controles

A rodada separada dos27 casos de recuperação automática e jornadas principais/secundárias terminou com20 aprovados e7 falhos, saída1 em2,5min, um worker e zero retries. Três falhas confirmam proposta de verificação ainda utilizável após editar a senha manual, inclusive A→B→A. Duas jornadas de agenda não encontraram prévia para Mostrar agenda do dia com data ISO; a causa ainda está em análise. Contexto e adendo perderam o ponto final do texto literal; também estão em diagnóstico. Os testes e conteúdo esperado não foram enfraquecidos.

Essas falhas não pertencem aos209 casos aprovados e limitam esta entrega. Não há aprovação universal das jornadas; evitar confirmação por voz da verificação de cópia após editar senha até a correção. A medição nativa com oito WAVs fictícios é uma execução separada, ainda sem resultado neste registro.
