# Jornadas do assistente e qualidade do reconhecimento

Este registro documenta a entrega local0.2.79 para teste. As correções preservam o corpo literal dos textos elegíveis e invalidam confirmação de recuperação após editar a senha manual. A rodada de35 jornadas/replays e a regressão separada de29 casos passaram, sem retries. O pacote atualizado foi gerado e auditado, sem instalação ou publicação. Reconhecimento nativo segue com3 pedidos corretos/4 falhas/1 não avaliado em oito WAVs fictícios; não há homologação do microfone físico. A meta geral continua ativa.

## Primeira execução das jornadas

As situações pendentes nesta seção descrevem a sequência histórica de diagnóstico. O estado mais recente consta em Validação atual.

Os27 casos de recuperação automática, jornadas principais e secundárias terminaram com20 aprovados e7 falhos em2,5min, saída1, um worker e zero retries. Artefatos em test-results-5234.

Três casos reproduziram confirmação antiga de Verificar cópia automática local após editar a senha manual, inclusive A→B→A. Foi autorizada uma correção restrita ao ciclo de vida do controle alcançável na tela bloqueada, sem colocar segredo em atributos ou alterar backend. Os testes permanecem intactos.

Duas jornadas de agenda usaram Mostrar agenda do dia com data ISO, quando esse comando aceita DD/MM/AAAA. Foi autorizado ajustar somente essas duas transcrições do teste; datas dos payloads continuam ISO. As etapas seguintes ainda não foram comprovadas.

Contexto e adendo perderam o ponto final do corpo single-line. Não será convertido para multiline apenas para esconder a falha. Um novo teste unitário com parser/executor reais reproduziu15 aprovados e24 falhos entre39 casos, saída1 em125,15ms na repetição do coordenador. Também detectou aceitação indevida de4001 caracteres após remover pontuação. O plano separa normalização da instrução e preservação do corpo de textareas elegíveis; produção ainda aguardando revisão.

Após revisão dos testes, foram incluídos controles negativos de elegibilidade, espaço terminal e emoji contado em UTF-16. O conjunto congelado passou a97 casos; a repetição do coordenador obteve63 aprovados/34 falhos, saída1 em224,31ms. A revisão independente aprovou os testes e o plano; a implementação restrita foi autorizada, ainda sem resultado final.

A correção do ciclo de vida de recuperação foi implementada e revisada por inspeção. A repetição separada dos17 casos de recuperação e5 de jornadas principais terminou com20 aprovados/2 falhos entre22, saída1 em2,2min, sem retries. Todos os17 casos de recuperação passaram, inclusive edição de senha e A→B→A. As duas jornadas de agenda avançaram após corrigir o formato de data, mas falharam ao renderizar a sessão finalizada: o double de IPC forneceu indicador sem labels. A causa e o contrato desse fixture estão em análise; não há alegação de jornada finalizada aprovada.

O contrato Rust foi conferido: a sessão finalizada recebe snapshots completos do catálogo em indicators e é retornada pelo IPC. O fixture foi alinhado somente a esse retorno, sem mudar assertions ou payloads de salvamento. A correção de texto single-line foi implementada separadamente em voiceInterfaceCommands.js; o coordenador repetiu os97 unitários, todos aprovados em150,67ms, saída0. Isso ainda não substitui a revisão final e a repetição das jornadas.

A revisão encontrou fallback silencioso para comandos com cabeçalho entre aspas. Doze testes novos reproduziram a perda do corpo:97 aprovados/12 falhos entre109 antes da correção, saída1 em157,51ms na execução do agente. A produção agora exige correspondência literal única ou recusa, sem alterar o conteúdo. O coordenador repetiu109/109 aprovados, saída0 em150,94ms. Revisão final e nova rodada de interface ainda pendentes.

## Reconhecimento nativo de oito áudios fictícios

Uma execução opt-in do teste Rust existente utilizou oito WAVs PCM16 mono de22.050Hz já preservados, sem gerar fala nova, baixar modelo ou modificar fontes. Executou serialmente com limite de60s por inferência e10min global, sem retries. Terminou com saída0 em33,103s: compilação15,32s e um teste Rust aprovado em17,20s, com oito resultados.

A avaliação semântica obteve3 corretos,4 falhas e1 não avaliado. Comportamento, procedimentos e resultado corresponderam aos pedidos; recorrência foi recusada, nome cadastrado ficou divergente, observação foi recusada e texto de encaminhamento ficou diferente. Confirmar comando foi transcrito, mas sua execução depende de proposta válida na interface. O subconjunto clínico permanece2 corretos/2 falhos/1 não avaliado.

Executar o backend sem erro não prova utilidade de todos os pedidos. Nenhum nome, data ou corpo clínico foi reparado automaticamente. O lote não comprova microfone físico, transporte IPC nativo, confirmação na interface ou precisão geral.

Manifesto, stdout, stderr, resultado JSON e relatório semântico preservados em:

`C:/Users/alexandre/AppData/Local/Temp/circulo-asr79-bounded8-457d64838c914d4eb1223ec0b0aeb57f`

## Validação atual

As duas correções de produção e os testes foram aprovados por revisão independente. A rodada única de35 casos terminou com35 aprovados, saída0 em2,9min, um worker e zero retries. Inclui17 de recuperação,5 jornadas principais,5 secundárias e8 replays das transcrições nativas reais. Nenhuma assertion clínica ou confirmação foi enfraquecida. Contexto/adendo preservaram os pontos finais; as jornadas avulsa e semanal chegaram ao salvamento e finalização.

O conjunto padrão antes da atualização de metadados passou1766/1766 em5210,62ms, saída0; os109 novos unitários foram executados separadamente. Com os109 incluídos no script padrão e metadados0.2.79, passou1875/1875 em4557,63ms, saída0. Rust release/offline/locked passou135 casos, zero falhos e1 ignorado, em13,17s. Lint completo terminou sem erros, com oito avisos. A regressão separada de29 casos de multiline e transição de bloqueio terminou com29 aprovados, saída0 em1,3min, um worker e zero retries. As duas rodadas de35 e29 são resultados distintos, não uma única execução64.

Os8 replays aprovados verificam comportamento da interface diante dos textos efetivamente reconhecidos, inclusive erros visíveis e recusas; não melhoram a qualidade nativa3 corretos/4 falhas/1 não avaliado. Estudar a precisão separadamente, sem criar aliases para esconder texto mal reconhecido. Senhas, seleção de arquivos e início do microfone continuam manuais.

## Instalador local e limitações

Círculo_0.2.79_x64-setup.exe tem135.902.649 bytes e SHA-256 `91c2303b3cc9f88ab149ead63e3d8742a1af63c83560619bd635d8e243690202`. O build NSIS terminou com saída0, mantendo os avisos conhecidos de chunk frontend acima de500KiB e PDB do OpenSSL. A auditoria confirmou PE0.2.79, x64 e Authenticode NotSigned. Não extraiu o conteúdo interno nem testou instalação, execução ou desinstalação.

A configuração temporária desativou somente os artefatos de atualização assinados e foi removida após o build. A configuração oficial, chave pública e endpoints do updater permanecem intactos. Nenhuma chave privada foi lida, nenhum artefato assinado e nenhuma Release publicada. A versão instalada0.2.61 e o perfil não foram alterados. O pacote está disponível para teste local, não como atualização automática publicada.

Ainda falta a matriz residual por captura, incluindo controles secundários de pacientes/vínculos, mutações administrativas da Agenda, cancelamentos/limpezas e recuperação bloqueada. Os17 testes de recuperação desta rodada usam comandos digitados; o caso de Ajustes usa mídia sintética. Precisão geral, microfone físico e fluxos instalados não estão homologados. Limpeza de recovery e compatibilidade com backups antigos permanecem fora do escopo desta entrega.
