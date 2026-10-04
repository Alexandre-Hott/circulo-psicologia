# Áudio sintético offline — 03/10/2026

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
