# Áudio sintético offline — 03/10/2026

## Gavetas — complemento ao pacote0.2.61,04/10/2026

Novo cenário `interface-drawer`:3WAVs SAPI Microsoft Maria Desktop Português Brasil, rate-2. Recursos locais da instalação59; teste opt-in do backend Rust real atual, sem rede, exit0. Transcrições preservadas sem reparar palavras em `test/fixtures/native-voice-drawer-20261004.json`: “Abrir novo compromisso.”, “Recolher detalhes e ações.”, “Confirmar comando.”. CLI produziu as mesmas frases em2,07s/2,04s/2,04s; áudios159290/173396/135590bytes. O evaluator central retorna0Passed/0Failed/3NotEvaluated intencionalmente: não é aprovação de interface/confirmar. Unidade259/259 verifica esse contrato e recusa corpus incompleto/transcrição vazia.

Replay novo usa os textos reais sem alteração: abrir Novo compromisso propõe sem abrir; segundo áudio confirma; recolher Detalhes e ações propõe mantendo detalhes visíveis; segundo áudio confirma fechamento, preservando formulário e Horário inicial15:00, quatro chamadas de transcrição e zero gravações. Mídia/captura/IPC simulados. Regresso113/113 em8,6min, terminal exit0. Revisão independente pediu checkpoints de preservação imediatamente após abrir e enquanto recolher aguarda confirmar; adicionados, replay reforçado1/1 em18,5s, exit0. Suíte Rust release offline/locked86passaram/0falhas/1ignorado em11,90s; opt-in de WAV executado pelo harness separado. Não prova microfone físico nem uma cadeia nativa ininterrupta. Não houve mudança de produção, versão/instalador61 ou perfil instalado59 nesta rodada; não gerar pacote idêntico por testes adicionais. BOMUTF8 do harness preservado.

## Vínculos e papel administrativo —0.2.60

Cenário `interface-party`,3WAVs SAPI Microsoft Maria Brasil, rate-2, recursos instalados59 e backend Rust real sem rede. Saídas nativas preservadas em `native-voice-party-20261004.json`: Abrir vínculos de Ana Clara; Marcar **contrato** administrativo; Confirmar comando. CLI3inferências2,06s/2,02s/2,04s, áudio173934/192718/135590bytes. Avaliador central1Passed/0Failed/2NotEvaluated: confere paciente/destino links, mas não aprova o checkbox nem confirmar. Harnessexit0 não prova o papel selecionável.

Replay mostrou falha real no checkbox (red0/1): a saída contrato não encontrava Contato administrativo. Alias exato somente para o checkbox Contato administrativo dentro do formulário de vínculos, sem substituir palavras de nomes, relações ou notas. Após patch2/2 em21,6s: abrir vínculo/confirmar/marcar papel/confirmar usa4transcrições, cria nenhuma pessoa e grava nada. Campo de nome vazio no replay; o caso complementar mantém nome literal “contrato administrativo”, recusa negação/texto extra e desmarca apenas o papel após confirmar.

Setup/mídia/RPC simulados nos replays; os textos são saídas reais e inalteradas do reconhecedor local. Não valida captura física nem cadeia ininterrupta no instalado. Novo teste de erro tardio no painel preserva proposta nova digitada durante captura; painel13/13 em25,2s. Regressão95/95 em4,7min e probes DOM de isolamento5/5 em22,7s, exit0. JS258/258; instalador60 gerado/auditado, não instalado/publicado. Instalado59 não alterado nesta rodada. Suíte Rust completa não repetida; harness usou o reconhecedor Rust real. BOMUTF8 do harness preservado.

## Dias da semana — complemento ao pacote0.2.58

Novo cenário `interface-weekday`,3WAVs SAPI Microsoft Maria Português Brasil emrate-2. Recursos locais da instalação52; backend Rust real atual, sem rede/áudio ambiente. Quinta-feira, terça-feira e Confirmar comando transcritos corretamente e preservados em `test/fixtures/native-voice-weekday-20261004.json`. CLI fez inferências3,06s/2,03s/2,04s; corpus233694/236424/135590bytes. Harness/Rust opt-in exit0; avaliador central0aprovados/0falhos/3nãoavaliados intencionalmente, pois selecionar/confirmar exige interface visível/proposta. Replay com esses textos2/2 em26,7s: primeiro áudio prepara sem mudar Sábado, segundo confirma Quinta/Terça, exatamente2invokes de transcrição e nenhuma gravação de série. Mídia/IPC simulados, formulário real; setup digitado. Regressão selecionada de replays/dias21/21 em1,4min; unidade257/257, lint sem erro/cinco avisos anteriores, guard/diff e consistência do pacote58 aprovados. Primeiro filtro de teste não encontrou casos e foi corrigido; não houve falha funcional no replay. Não é homologação de microfone físico ou salvamento instalado. Produção/instalador58 não alterados: testes adicionais apenas, sem gerar outra versão idêntica.

Repetido também cenário padrão core17 com o mesmo backend/modelo locais, exit0. Pelo contrato do harness, quinze intents completas são avaliadas e duas ações de interface/confirmar ficam não avaliadas no parser central; qualquer divergência avaliada encerra com erro. Não confundir saídas CLI legadas (com erros como “Abri-se pacientes”) com os resultados Rust usados na avaliação. Nenhuma fixture core anterior foi sobrescrita por essa repetição. É prova do reconhecedor e parser no contexto fictício fixo, não cadeia ininterrupta no app instalado nem persistência das dezessete ações.

## Campos e tentativas de reconhecimento — 0.2.57

Harness aceita `-Scenario interface-fields`,3WAVs SAPI Microsoft Maria, recursos instalados52. Frases originais finais emrate-2: preencher idade/note contextual/limpar. `native-voice-fields-20261004.json` preserva exatamente a saída Rust, incluindo prefixos `Prinscheridade` e `Princher`; replay exige proposta e segundo áudio de confirmar, aplica só o campo certo e preserva escala. Red1/3, green3/3 em24,7s. Captura/getUserMedia/IPC simulados no replay, não microfone físico.

Primeiro áudio rate0 falhou semanticamente em dois pedidos; `native-voice-fields-failed-20261004.json` preserva textos sem reparo. Alternativa `Definir idade` ainda distorcida, nota com Definir correta: corpus `native-voice-fields-alternative-20261004.json`. “O campo idade” também distorcido; prompt maior não corrigiu conteúdo e foi revertido. O gateway só normaliza dois prefixos finais observados; não corrige `Nov`, não supõe nove e não reescreve palavras da nota.

Avaliação central **Passed0/Failed0/NotEvaluated3**, exit0 do harness: esse retorno valida execução/transcrição, não sucesso funcional. Aprovação de campos pertence ao replayE2E. JS verifica que o evaluator não aprova esse corpus, inclusive índice/transcrição inválidos. Nenhum dado real, rede ou gravação ambiente. Outros erros de transcrição seguem como limitação explícita.

## Intervalo de análises — 04/10/2026 UTC

`-Scenario analytics-range` gera dois WAVs fictícios de pedido global/por paciente, com recursos de voz da instalação52. Primeira tentativa SAPI rate-2 com frase extensa foi recusada pelo backend: excedia12s. Segunda tentativa usa frases mais curtas, SAPI rate0, preservando limite12s da produção. Resultado **Passed2/Failed0/NotEvaluated0**, exit0. As transcrições reais e não editadas estão em `test/fixtures/native-voice-analytics-20261004.json`; avaliam paciente e datas exatos, sem inferir ano. Fluxo Rust opt-in real de áudio, mas sem microfone físico, execução de consulta instalada ou consentimento/confirmar nativo. Comandos maiores precisam ser divididos; nenhuma captura ambiente feita.

## Cenário de data verbal na ocorrência — 04/10/2026 UTC

Mesmo harness com `-Scenario occurrence-date`:3WAVs SAPI Microsoft Maria Portuguese(Brazil), iniciar/remarcar/cancelar sessão de Ana Clara em/no dia três de outubro de dois mil e vinte e seis às quinze horas. Recursos da instalação52, backend Rust opt-in, exit0. Corpus em `test/fixtures/native-voice-occurrence-20261004.json`: dia transcrito como3; remarcação/cancelamento transcritos “seção”. Parser normaliza a variante já existente e converte a data completa. Avaliador exige ação/paciente/data/horário exatos: **Passed3/Failed0/NotEvaluated0**.

ReplayE2E inicial3/3 em22,3s: primeiro áudio só prévia; áudio de confirmação coletado no cenário de salvamento autoriza abertura. Iniciar exige `seriesId:series/originalDate:2026-10-03`; remarcação/cancelamento não chamam escrita da Agenda. Alvo no formulário foi fortalecido após revisão, regressão final60/60 em4,3min aprovada. Não é microfone físico nem reconhecimento nativo durante o E2E. Parser incluído no pacote53, instalado permanece52; não confundir recursos instalados de reconhecimento com parser instalado atualizado.

## Cenário de salvamento de comportamento — 04/10/2026 UTC

`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/testWhisperSynthetic.ps1 -VoiceDirectory "$env:LOCALAPPDATA\Círculo\voice" -Scenario behavior-save` gera três WAVs separados: “Salvar comportamento.”, “Salve o comportamento.” e “Confirmar comando.”. Recursos da instalação0.2.52, SAPI Microsoft Maria Desktop Portuguese(Brazil), sem rede. Backend Rust transcreveu exatamente essas três frases; fixture em `test/fixtures/native-voice-save-20261004.json`. Script exit0. Reexecução com `-Scenario Behavior-Save` também exit0, após normalização de caixa, com resultados idênticos.

Evaluator retorna **Passed0/Failed0/NotEvaluated3**: todas dependem da interface e NÃO recebem aprovação por transcrição apenas. ReplayE2E em `desktop-voice-interface.spec.js`: **2/2 em25,6s**, criação e edição de versão, primeira transcrição sem escrita, segundo áudio de confirmação gera exatamente um invoke com argumentos completos. Mídia/RPC simulados no E2E; ele usa texto efetivamente capturado pelo backend, não executa novamente reconhecimento nativo. Não é prova de microfone físico nem da cadeia ininterrupta no aplicativo instalado. Setup dos formulários é digitado, não falado. Produção instalada continua0.2.52; só ferramentas/testes mudaram.

Core17 permanece cenário padrão, com expectativas/fixture anteriores inalteradas. Novo modo tem contagem/índices/cenário estritos, BOMUTF8 preservado; 247 testesJS finais aprovados e revisão estática final sem achados novos. Limitações preexistentes do harness: hardlinks antes do `try/finally` podem deixar temporário se essa etapa falha; variáveis de ambiente são removidas sem restaurar valores anteriores; CLI do evaluator exige que consumidores leiam `Failed` (wrapper verifica). Nenhuma dessas melhorias foi implementada nesta etapa; sem investigação de recovery/legados.

## Avaliação semântica nativa de17 frases — consolidação0.2.49

`npm run voice:test-synthetic` gera17 WAVs SAPI Microsoft Maria Desktop Portuguese(Brazil), executa a CLI com prompt legado para comparação e o teste opt-in Rust pelo mesmo `native_voice::transcribe` do aplicativo. A inferência nativa também executa `whisper-cli.exe`; não é um motor embutido. O Rust emite17 registros JSON indexados; `evaluateSyntheticVoice.js` compara as transcrições **nativas**, não `Cases` CLI, contra intents fictícias esperadas completas. Campos/chaves adicionais, IDs, tipos, datas e horários divergentes reprovam. Apenas nomes/títulos/labels de exibição toleram caixa, acento, espaços e pontuação terminal; isso não preserva grafia literal nem reescreve o cadastro. Revise o texto proposto.

Execução anterior à correção: **13Passed / 2Failed / 2NotEvaluated**, exit1. Falhas observadas: `Abrir biblioteca de comportamentos, utilizáveis.` e `Adicionar adendo a sessão de Ana Clara de 3 de outubro de dois mil e vinte e seis às quinze horas.`. Corrigidos o sufixo limitado da rota biblioteca e a data completa por extenso usando o conversor civil existente, sem inferir ano/paciente/horário. Após corrigir, nova execução dos17 WAVs terminou **exit0: 15Passed / 0Failed / 2NotEvaluated**. Teste unitário faz replay integral de `test/fixtures/native-voice-20261003.json`, as transcrições realmente coletadas, sem inventar saída do reconhecedor.

Os dois não avaliados pelo parser central são `Clicar em Novo cadastro.` e `Confirmar comando.`: exigem controle visível/proposta pendente. Cenário E2E `transcrições nativas de botão e confirmação usam a tela visível sem gravar` faz replay desses textos com captura/RPC simulados. Dois outros E2E fazem replay das transcrições de biblioteca/adendo (focados2/2 em19,1s); adendo só abre após confirmar e recebe foco. Isso complementa, mas não altera o estado NotEvaluated do relatório central e não é uma execução da fala real dentro da janela instalada.

Revisão independente corrigiu três limitações do instrumento: comparação parcial podia aprovar modalidade extra (agora objeto completo), corpus unitário de adendo divergia da fala SAPI (agora por extenso) e captura Node pelo console PS5.1 podia corromper UTF-8 (agora stdout em arquivo lido explicitamente como UTF-8). Primeira tentativa do novo harness falhou antes da avaliação por array JSON envolto em array no PowerShell; corrigida e repetida. A baseline unitária primeiro rejeitava o ponto final no título; tolerância de pontuação/caixa/acento foi explicitada apenas nos campos de exibição, mantendo IDs/datas/tipos exatos. Revisão final sem novo bloqueador, estática.

O novo teste negativo revelou seleção indevida de `Pede ajuda inexistente` como `Pede ajuda`. Registro agora exige modelo ativo e paciente capturados exatos, com comando ancorado; desconhecidos, arquivados, duplicados e sessão incompatível são recusados. Não houve mudança no prompt/modelo nem correção automática de nomes clínicos.

`InferenceSeconds` mede só a CLI de `Cases`, não os `NativeCases` Rust. `NetworkUsed=false` é metadado declarativo da execução com recursos locais/cargo offline, não medição de tráfego. WAVs/logs temporários foram removidos pelo script; nenhum banco do perfil ou dado real foi usado. Sem microfone físico, ruído, sotaque humano, captura instalada ou prova universal de comandos. Seções abaixo são resultados históricos dos corpus anteriores de12 frases.

## Execução e correção do instrumento

Executado `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/testWhisperSynthetic.ps1`, voz Microsoft Maria Desktop Portuguese(Brazil), rate -2, PCM mono 22kHz/16-bit. Doze frases passam por Whisper CLI e agora todas passam também pelo `native_voice::transcribe` usado pelo app (antes o teste Rust percorria só três). Nenhum microfone, paciente real ou banco do perfil foi usado. WAVs temporários sintéticos removidos pelo script.

A primeira execução produziu fala corrompida: Windows PowerShell 5.1 interpretava o roteiro UTF-8 sem BOM como ANSI. Adicionado BOM e repetida a execução: teste Rust **1/1**, com doze transcrições não vazias em **20,44s**, exit0. O teste verifica transporte/formato/resultado não vazio, não entendimento correto. Avisos anteriores OpenSSL PDB continuam. Leitura do TXT de saída também foi explicitada como UTF-8 após a segunda execução; essa alteração de leitura ainda não foi reexecutada, e não muda o áudio nem o backend.

## Transcrições observadas no caminho Rust

| Pedido sintetizado | Transcrição nativa |
| --- | --- |
| Marcar sessão semanal para Ana Clara toda quinta às quinze horas | Marcar se são semanal para Ana Clara toda quinta às quinze horas. |
| Cadastrar paciente Bia Fictícia com nove anos | Cadastrar paciente Bia ficticia com 9 anos. |
| Registrar comportamento Pede ajuda para Ana Clara na sessão | Registrar comportamento pede ajuda para Ana Clara na seção. |
| Criar comportamento Espera a vez | Criar comportamento e espera a vez. |
| Abrir agenda | Abrir a agenda. |
| Clicar em Novo cadastro | Flicar em novo cadastro. |
| Confirmar comando | Confirmar comando. |
| Abrir pacientes | Abri-se pacientes. |
| Abrir sessões de Ana Clara | Abri-seções de Ana Clara. |
| Abrir análises deste mês | Abri o análise deste mês. |
| Abrir ajustes | Abrir ajustes. |
| Editar paciente Ana Clara | Editar paciente Ana Clara. |

Estas transcrições vêm de stdout Rust, não do JSON CLI: os dois caminhos usam prompts distintos e produziram resultados diferentes. Não somar acertos entre os caminhos.

## Avaliação sem persistência

As dez frases clínicas/de navegação acima foram entregues literalmente a `parseCentralCommand`, com Ana Clara fictícia, comportamento Pede ajuda, rascunho fictício ativo e data de referência 2026-10-03. Agendamento preservou quinta/15:00/paciente; cadastro preservou idade9; registro selecionou o ID de Pede ajuda no rascunho correto; Abrir agenda/Ajustes produziram os destinos corretos. Não houve execução dos rascunhos.

Falhas/limites observados:

- Abrir pacientes, sessões e análises: as variantes transcritas foram recusadas pelo parser central.
- Criar comportamento: preparou título literal `e espera a vez.` — resultado divergente do pedido. Não remover palavras automaticamente de títulos, nomes ou texto clínico para maquiar o teste; a revisão do rascunho continua necessária.
- Editar paciente sem indicar campo/valor foi recusado por faltar a alteração. Comando genérico de botão depende da tela/gateway, não foi validado nesta avaliação do parser central.
- Novo cadastro e Confirmar comando pertencem ao gateway/painel, não ao parser central; não foram classificados semanticamente aqui.

**Próximo trabalho:** melhorar reconhecimento/navegação com corpus conhecido e comparação de intenção, mantendo confirmação e identidade exata, sem adivinhar nomes. Não declarar cobertura universal da voz por este teste. Microfone humano, ruído, diferentes sotaques e jornada física permanecem não validados.

JavaScript **229/229**, repository guard e diff check aprovados. Não há nova versão/instalador nesta rodada; instalado permanece0.2.45. Não houve limpeza de recovery nem trabalho de compatibilidade de backups antigos.

## Incremento de produção: contexto de comandos e variantes de navegação

O prompt nativo foi ampliado com o vocabulário de navegação, cadastro/edição, biblioteca e confirmação. Não é uma lista de ações a executar: apenas contexto de transcrição. O mesmo corpus SAPI foi repetido pelo caminho Rust: **1/1**, doze transcrições não vazias, **20,60s**, exit0. Na comparação com a execução anterior:

- `Criar comportamento e espera a vez.` passou a `Criar comportamento espera a vez.`;
- `Flicar em novo cadastro.` passou a `Clicar em Novo cadastro.`;
- `Abri-se pacientes.` passou a `Abrir pacientes.`;
- sessões passou a `Abrir seções de Ana Clara.`; análises passou a `Abrir análise deste mes.`;
- agendamento, cadastro, comportamento observado, Agenda, confirmação e Ajustes continuaram transcritos de forma reconhecível;
- edição saiu como `Editar paciente. Ana Clara.`: continua insuficiente para especificar uma alteração e não está homologada como comando de edição.

O parser agora aceita `seções` somente como substantivo da navegação do paciente e `análise` singular na navegação das análises. Não normaliza nomes/títulos para essa finalidade. Novo teste compara IDs/período exatos, recusa nome divergente e múltiplas ações, e preserva nomes/títulos literais. **230/230 JS**, **13/13 Rust de voz**, lint/build aprovados com avisos anteriores. O teste sintético mede uma voz sintetizada e uma execução, não confiabilidade estatística, áudio humano ou execução completa pela interface. O CLI direto mantém o prompt antigo para comparação e seu JSON não deve ser confundido com o resultado nativo atualizado.

Alterações de produção ainda não incluídas no instalador0.2.45: consolidar prompt, variantes e limpeza de proposta pendente no próximo pacote Windows. Senhas e seletores de arquivo continuam manuais.

Regressão dos componentes reais com backend simulado: **21/21 E2E interface em1,4min**. Não substitui teste de captura física nem execução nativa dos comandos transcritos. Guard/diff check aprovados; nenhuma alteração de recovery/legados.
