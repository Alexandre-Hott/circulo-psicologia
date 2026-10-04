# Melhoria contínua de voz

## Entrega local0.2.50 — registros por voz sem ambiguidade

Pacote `Círculo_0.2.50_x64-setup.exe`, **135.888.303 bytes**, SHA-256 `91e8ba3648ff72506f31524ac1519bfaaa34844bb934a28eaca7bc680b71ccad`. Build NSIS offline/locked exit0; override temporário de updater removido após término, configuração oficial preservada. Auditoria `%TEMP%\\circulo-0250-audit-20261003.json`: PE0.2.50/x64/NotSigned, hash/tamanho conferidos. Não extraído, instalado ou aberto nesta rodada; instalado verificado permanece0.2.47. Nenhum perfil alterado. Sem `.sig`, assinatura Authenticode, Release ou atualização oferecida pelo GitHub.

Inclui o incremento de alvos/texto descrito abaixo. **243/243JS** reexecutados na versão50 e guard aprovado. **57/57E2E em3,8min** executados no snapshot funcional0212070 antes da mudança somente de versão/empacotamento; não repetidos como jornada do instalador. Sem nova execução Rust/WAV: backend funcional não alterado; compilação Rust release aprovada, avisos LNK4099 de PDB OpenSSL e chunk>500KiB anteriores. Meta permanece ativa; instalador não comprova microfone físico nem cobertura de todas as ações.

**Pendência concreta da revisão de continuidade:** retry de Registrar sessão após sucesso parcial. Fixture de calendário reutiliza rascunho, enquanto `vault/sessions.rs::start_session_draft` ainda pode inserir outro ID para a mesma ocorrência; probe SQLite em memória aceitou dois. `DesktopAgenda.create` também interrompe início/revelação do compromisso se atualização auxiliar falha depois de criar; `DesktopVault.startSessionFromAgenda` pode retornarfalse após sessão criada/aberta se refreshWorkspace falha. Revisão somente leitura:10 unitários e3 probes em memória, sem Playwright/perfil. Cenário de voz proposto: criar fora da semana, falhar refresh uma vez após início, voltar e iniciar novamente; exigir um compromisso/rascunho/ID e conteúdo preservado. A versão50 não corrige essa pendência. Próxima prioridade da meta, não novo recurso nem investigação de recovery/legados.

## Incremento após0.2.49 — alvos e texto dos registros de sessão

Comandos de comportamento e indicador passam a usar título, rótulo e paciente completos do catálogo, inclusive títulos com delimitadores como “para”, “em” e “como” e pontuação final. Todas as interpretações sintáticas são enumeradas antes de verificar a sessão aberta; ambiguidades entre pacientes/modelos/rótulos são recusadas, não resolvidas pela sessão atualmente selecionada. Nomes entre aspas consideram tanto o nome literal cadastrado quanto as aspas como delimitador, recusando quando correspondem a pacientes diferentes.

Observações podem mencionar outro paciente sem mudar o alvo. Aspas pertencentes ao texto, como `Ele disse "sim"`, são preservadas; somente um par envolvendo todo o argumento é removido. Não foram criados campos clínicos novos nem ampliado o escopo de recuperação.

Lógica **243/243 testes aprovada**, lint exit0 com cinco avisos anteriores, build/guard aprovados (chunk>500KiB anterior). Revisão independente:243 testes e135 checks em memória aprovados, sem achado novo na revisão final; E2E do revisor somente estático. Falhas intermediárias: teste de nome entre aspas falhou antes da correção; novo E2E falhou por seletor que não incluía `· v1`, corrigido no teste e aprovado1/1 em18,8s. A revisão também identificou interpretação oculta por `regex1 || regex2`, perda de aspa literal, remoção de aspas escolhendo paciente errado e perda de pontuação de catálogo; todos reproduzidos/cobertos e corrigidos.

Primeira regressão57/57 em3,9min aprovada, mas houve alteração do parser durante essa execução: não usada como prova final do snapshot. Repetição na porta5198 teve timeout30s em page.goto antes do primeiro fluxo, seguida de8 aprovações; encerrada de forma dirigida na árvore do processo Playwright verificada, sem afetar aplicativo/perfil. **Repetição final isolada na porta5197:57/57 E2E em3,8min, exit0**, snapshot estável. Incremento ainda não empacotado: instalador0.2.49 anterior não contém estas alterações; aplicativo instalado continua0.2.47. Microfone físico e janela instalada não validados nesta rodada, captura/RPC dos E2E simulados. Nenhum perfil ou dado real alterado. Meta permanece ativa.

## Entrega local0.2.49 — compreensão do áudio nativo

Pacote local `Círculo_0.2.49_x64-setup.exe`, **135.877.292 bytes**, SHA-256 `cb4aea88e3459b3462fac7d4f0fc27e2aa01a519222aa48e5f291754fb4b6033`. Build NSIS offline/locked exit0; override temporário removido após terminal, configuração oficial updater preservada. Auditoria `%TEMP%\\circulo-0249-audit-20261003.json`: PE0.2.49/x64/NotSigned, tamanho/hash conferidos. Não instalado nem aberto nesta rodada; instalado permanece0.2.47. Sem Release, assinatura updater/Authenticode ou alteração de perfil.

Áudio: corpus expandido de12 para17 frases SAPI, testado no `native_voice::transcribe` (subprocesso Whisper local usado pelo app). Novo avaliador consome JSON das transcrições Rust e exige a intent inteira esperada, não apenas texto não vazio ou subconjunto de campos. Primeira avaliação13Passed/2Failed/2NotEvaluated; corrigidas a biblioteca transcrita como `comportamentos, utilizáveis` e a data do adendo por extenso. Nova execuçãoexit0: **17 capturados, 15Passed, 0Failed, 2NotEvaluated**. Os dois exigem UI/proposta; E2E separado faz replay dos textos nativos `Clicar em Novo cadastro` e `Confirmar comando`, além de biblioteca/adendo, com captura/RPC simulados. Isso não transforma NotEvaluated do parser central em aprovação de fala física. [Corpus, tentativas e limites](voz-audio-sintetico-20261003.md).

A data exige dia/mês/ano explícitos, válidos e interpretação única; paciente continua exato. Registro de comportamento agora recusa títulos/pacientes excedentes, modelos arquivados/duplicados e sessão incompatível; não seleciona `Pede ajuda` para `Pede ajuda inexistente`. Não foram reescritos nomes/textos clínicos ou alterados prompt/modelo.

**240/240JS**, **56/56E2E interface/biblioteca/transições/workflows em3,9min**, **83Rust release aprovados, 1 opt-in ignorado em9,93s**; lint exit0 (cinco avisos anteriores), build/guard/diff aprovados. Opt-in com17 WAVs foi executado separadamente e terminouexit0. Revisor independente final sem novo bloqueador, estático. Vite mantém aviso de chunk>500KiB; linker mantém PDB OpenSSL LNK4099. Debug não repetido após falha de compilação documentada na48.

O avaliador tolera grafia (caixa/acento/espaços/pontuação terminal) somente nos campos de exibição; IDs/tipos/datas/horários são exatos e chaves adicionais reprovam. Essa aprovação é semântica, não preservação literal da grafia. `InferenceSeconds` refere-se à CLI de comparação, não à execução Rust; `NetworkUsed=false` é declaração do roteiro local/offline, não medição de tráfego. Microfone humano, ruído, sotaques e jornada instalada permanecem sem validação nova. Não houve dados reais, limpeza de recovery ou compatibilidade antiga. Meta ativa, sem alegação de cobertura universal.

## Entrega local0.2.48 — adendo natural e acessos da biblioteca/contexto

Pacote local `Círculo_0.2.48_x64-setup.exe`, **135.881.324 bytes**, SHA-256 `a6297c0fe761c7a0dbd3318c5451d65425c025f2840d151aca6573de02e93b95`. Build Tauri NSIS offline/locked exit0; override temporário de artifacts updater removido depois do terminal. Metadados auditados em `%TEMP%\\circulo-0248-audit-20261003.json`: PE0.2.48/x64/NotSigned, tamanho/hash conferidos. Sem extração, instalação ou abertura nesta rodada. Instalado local permanece0.2.47; pacote não publicado em Release e sem assinatura updater/Authenticode. Configuração oficial do updater preservada.

Inclui alias do botão Adicionar adendo, biblioteca/contexto naturais e `Adicionar adendo à sessão de Ana Clara de 03/10/2026 às 15:00`. A nova rota não usa agendamento nem savePending; após confirmar consulta a timeline novamente, exige paciente/data/start únicos/exatos e abre somente o formulário existente. Recusa ausência/duplicidade/paciente incompatível. Mantém texto no mesmo editor; outro adendo com conteúdo exige Salvar/Cancelar. Ao trocar de paciente com editores/rascunho abertos, exige salvá-los e fechar Sessões antes; não descarta nem salva automaticamente pela nova rota. Respostas antigas são invalidadas por área/paciente, Cancelar/Salvar, fechamento ou remontagem por rascunho/Agenda.

**234/234JS**, **53/53E2E interface/biblioteca/transições/workflows em4,0min**, lint exit0 (cinco avisos anteriores), guard/build/diff aprovados. Oito novos cenários de adendo incluem proposta/confirmar, foco no textarea correto, duas sessões do mesmo dia, Salvar explícito com payload exato, recusa/preservação e respostas atrasadas. Sete focados passaram7/7 em39,6s antes de acrescentar Agenda e asserção de foco; ambos passaram na regressão53. Revisão independente final sem novo achado concreto, apenas estática.

Falhas intermediárias registradas: teste de texto digitado durante consulta reproduziu perda de editor (0/1), corrigida lendo ref atual no retorno; rodada6cenários5/6 porque autosave normal de600ms interferiu na prova de ausência de save da rota, corrigido pausando relógio antes do fill. Revisor apontou também remontagem/Cancelamento, cobertos pelos cenários finais.

Rust debug offline/locked **não executou testes**: compilação do OpenSSL falhou em arquivo build.info ausente na árvore debug. Alternativa `cargo test --release --offline --locked`: **83 aprovados, 0 falhas, 1 ignorado opt-in de áudio**, execução8,48s. Não foi repetido teste de WAV/transcrição nativa. Build/teste release mantêm warning LNK4099 de PDB OpenSSL; Vite mantém chunk>500KiB. Sem alteração de backend Rust funcional.

Limites: testes de comando/captura/RPC sintéticos não validam microfone humano, ruído, sotaque ou jornada instalada. Senhas/seletores nativos de arquivos manuais. Nenhum perfil/dado real alterado; nenhuma limpeza de recovery ou compatibilidade antiga implementada. Três fricções da auditoria após47 resolvidas no código e incluídas neste pacote; isso não comprova cobertura universal de fala. Meta permanece ativa para ampliar evidência e comandos restantes.

## Incremento após0.2.47: biblioteca e contexto por pedido natural

`Abrir biblioteca de comportamentos reutilizáveis` abre a gaveta existente e preserva edição não salva. `Abrir contexto do caso de Ana Clara` exige paciente ativo/exato/único e consulta concluída. A revisão independente reproduziu três falhas de pedido atrasado: ID antigo reutilizado, abertura em área oculta e sobrevivência ao fechamento de Sessões. Corrigidas com invalidação da carga e do pedido nas respectivas transições; nenhum novo achado de produção na revisão final. Teste de remontagem fortalecido para aguardar a segunda consulta e comprovar o conteúdo carregado antes da asserção de gaveta fechada.

**233/233JS**, **45/45E2E interface/biblioteca/transições/workflows em3,0min**, seguidos de **5/5 focados em27,4s** após fortalecer somente a asserção de remontagem. Build/guard/diff aprovados; lint exit0 com cinco avisos (quatro anteriores e um novo set-state-in-effect na invalidação de carga); build mantém aviso de chunk>500KiB. Evidência sintética de componentes/RPC, sem microfone físico, banco nativo, mudança de perfil ou novo instalador. A versão instalada0.2.47 não inclui este incremento nem o alias de adendo anterior. Pedido natural de adendo com paciente/data/horário continua pendente. Meta ativa.

## Incremento após0.2.47: texto visível para Adicionar adendo

Auditoria independente identificou três fricções concretas de acesso natural, não bugs de persistência. [Pendências e prioridade](voz-pendencias-usabilidade-0.2.47.md). Corrigida primeira parte: `Clicar em Adicionar adendo` usa alias explícito, único alvo mostra registro completo/abre após confirmar; dois alvos recusam e exigem rótulo específico. Cancelar não grava.2/2 específicos em24,1s; regressão **29/29 E2E interface/workflows em2,1min**, **232/232JS**, lint/build/guard/diff aprovados (avisos anteriores). Revisor confirmou alias sem escolha arbitrária, sem achado novo. Rotas naturais de biblioteca, contexto e adendo com paciente/data ainda pendentes. Nenhum dado real/banco/Rust/microfone físico ou novo instalador; instalado47 não contém alias. Meta ativa.

## Entrega instalada0.2.47 — 03/10/2026

[Pacote e evidência](validacao-voz-0.2.47.md). Consolidadas aberturas de edição natural de paciente/comportamento.232/232JS e guard repetidos; build NSIS offline/locked, auditoria e instalaçãoexit0. Versão47, recursos de voz e quatro arquivos de perfil preservados conferidos; snapshot0247 verificado. Sem abertura visual/microfone humano/Release/assinatura updater; app fechado. Referências abaixo a incrementos ainda não empacotados agora são históricas: incluídos na47. Meta ativa.

## Incremento após0.2.46: abrir edição de comportamento pelo título

`Editar comportamento Pede ajuda` prepara `behavior.edit.open`; confirmar abre o modelo atual da biblioteca, sem criar comportamento, versão ou registro em sessão. Formulário normal preserva título/descrição/versão; Cancelar edição não grava, Salvar versão permanece separado. Biblioteca é consultada novamente e modelo ausente/arquivado/versão inválida não é aberto. Parser recusa homônimos, título parcial e arquivados, preserva título literal contendo “para”. **232/232JS**, **28/28E2E interface/biblioteca em1,9min**, lint/build/guard/diff aprovados (avisos anteriores). Revisor independente Ampere não encontrou achado concreto no escopo. Tentativa inicial1/2: erro nativo simulado era mostrado com prefixo Error; ajustada somente asserção para alert/contém mensagem. Sem nova prova Rust/microfone humano/banco ou novo instalador. Pacote46 não contém esta abertura nem a abertura de paciente anterior; consolidar no próximo pacote. Meta ativa.

## Incremento após0.2.46: abrir edição do paciente sem ditar alterações

Pedido natural `Editar paciente Ana Clara` prepara `patient.edit.open`, confirma a abertura e reutiliza formulário/validações/gravação normais. Pausa transcrita como ponto/vírgula após `paciente` é aceita apenas no prefixo; nome continua exato. Arquivados, homônimos e nomes parciais são recusados. **231/231JS**, **22/22E2E interface em1,5min**, lint/build/guard/diff aprovados com avisos anteriores. Novo E2E usa captura/transcrição simulada para abrir Ana por ID, preservar campos, preencher idade e gravar uma única atualização somente após Salvar alterações. Primeira execução falhou na expectativa incompleta do payload (ciclo de vida derivado e solicitante null); conferido handler normal e corrigida asserção, sem mudar a normalização. Sem banco/microfone físico/Rust/novo instalador nesta rodada; pacote46 não contém este incremento. Meta ativa.

## Pacote Windows0.2.46 — 03/10/2026

[Instalador e limites](validacao-voz-0.2.46.md). Consolidados prompt/variantes de navegação e limpeza de proposta antiga após desbloqueio.230/230JS e guard repetidos; build NSIS offline/locked e auditoria PE/hash aprovados, avisos anteriores. Sem instalação/abertura/perfil alterado nesta rodada: instalado permanece0.2.45. Sem Release ou assinatura updater. Referências abaixo a não empacotado são histórico incluído agora na46. Meta ativa, captura humana ainda não homologada.

## Incremento após0.2.45: reconhecimento de comandos de navegação

Prompt nativo ampliado com ações existentes. Repetição do corpus português corrigido: Rust1/1,12 WAVs,20,60s; melhoraram Novo cadastro, Abrir pacientes e o título de comportamento sem “e” extra. Parser aceita `seções` apenas no substantivo de navegação e `análise` singular, sem correção de nomes/textos. Novo teste de IDs/período/recusa/preservação literal; **230/230JS**, **13/13Rust de voz**, **21/21E2E interface em1,4min**, lint/build/guard/diff aprovados (avisos anteriores). [Evidências e pendências](voz-audio-sintetico-20261003.md). Edição sem atributos continua recusada e não homologada. Sem microfone humano/perfil real/novo instalador; próximo pacote deve consolidar este incremento e a limpeza de proposta anterior. Meta ativa.

## Áudio sintético offline: corpus de doze frases

[Resultados e falhas](voz-audio-sintetico-20261003.md). Corrigida leitura ANSI do roteiro português no PowerShell5.1; teste nativo expandido de três para doze WAVs. Reexecução Rust1/1,12 transcrições não vazias em20,44s; JS229/229 e guard aprovados. Avaliação dos textos pelo parser revelou navegação recusada e título de comportamento divergente: transporte verde não significa compreensão verde. Sem microfone humano, persistência ou novo instalador. Meta ativa: próxima correção deve atacar entendimento do áudio, não apenas aumentar testes de comandos digitados.

## Cobertura após0.2.45: restauração inicial pelo assistente

Quatro cenários novos aprovados; regressão de Ajustes e transições **30/30 em1,7min**, JavaScript **229/229**, lint e diff check aprovados (quatro avisos anteriores). Comandos abrem a restauração no perfil vazio; cancelar/voltar não cria cofre; alterar a senha invalida a prévia; recusar não restaura; sucesso simulado abre apenas os pacientes fictícios restaurados; retorno cancelado mantém a entrada vazia. Senhas continuam manuais. [Evidência e limites](voz-cobertura-interface.md). Esta rodada altera somente testes/documentação: nenhum arquivo real, perfil Windows, microfone, backend Rust ou instalador foi testado/alterado. Instalado permanece0.2.45; correção de proposta do incremento anterior ainda aguarda próximo pacote. Meta ativa, sem ampliar para limpeza ou backups antigos.

## Incremento após0.2.45: transições e proposta antiga

35/35 E2E em1,6min e229/229JS, lint/guard/build/diff check aprovados (avisos anteriores). Cenários novos comprovaram RPC de entrada atrasado/falhando sem aceitar transcrição antiga e interrupção de track/AudioContext durante gravação ao bloquear/trocar área, sem reconhecimento. Teste adicional reproduziu botão de proposta antiga persistindo após desbloqueio manual (red0/1); corrigido limpando intenção/aviso na entrada, antes do RPC, green na regressão35/35. [Evidência e limites](voz-cobertura-interface.md). Mídia/RPC/relógio sintéticos, nenhum arquivo de perfil ou dado real acessado. Correção de proposta ainda não no instalado0.2.45; consolidar no próximo pacote junto ao trabalho restante. Meta ativa, sem novas provas nativas/microfone ou alterações de recovery/legados.

## Entrega instalada0.2.45 — 03/10/2026

[Pacote e limites](validacao-voz-0.2.45.md). Incremento da entrada do cofre e invalidação do áudio agora empacotado. 229/229JS e guard repetidos na45; build NSISoffline/locked, audit e instalaçãoexit0. Versão45, quatro arquivos do perfil preservados e snapshot0245 verificado; Whisper/modelo instalados conferidos por hash. Sem abertura/microfone humano/smokeRust/Release/assinatura updater. As referências abaixo a não empacotado são históricas, consolidadas neste instalador. Meta permanece ativa.

## Incremento após0.2.44: assistente na entrada do cofre

Implementado assistente bloqueado/primeira configuração, restrito aos controles visíveis, com contexto vazio e ajuda própria; senha manual e acesso clínico apenas desbloqueado. Criação/desbloqueio usam os formulários normais. Revisor identificou transcrição antiga cruzando desbloqueio; reproduzida em confirmação do updater no Início, corrigida por aborto na entrada/troca de estado e invalidação ao desmontar. Teste red1/2→green2/2 em20,6s; revisor confirmou correção sem novos achados concretos. Regressão final78/78 em4,2min e painel isolado9/9 em21,0s; 229/229JS, lint/guard/build/diff check aprovados, avisos anteriores. [Detalhes, tentativas intermediárias e limites](voz-cobertura-interface.md). Sem alteração de backend/Rust, arquivos de perfil ou atualização real. **Ainda não no instalador instalado0.2.44: próxima etapa consolidar o pacote atualizado.** Microfone humano, RPC de entrada atrasado/falhando, gravação interrompida e controles avançados bloqueados ainda têm lacunas; senha/chooser manuais. Meta ativa.

## Cobertura após0.2.44: backup portátil pelo assistente

17/17 E2E settings em1,3min, 229/229JS, lint/diff check aprovados (quatro avisos anteriores). Cinco novos cenários cobrem seleção desabilitada/cancelada, erro e nova tentativa, senha manual, recusa/aceite explícito e restauração cancelada/falha sem falso sucesso. Na simulação de sucesso, a lista do backup fictício substitui a anterior na interface. [Provas e limites](voz-cobertura-interface.md). Primeiro2/5 por asserção incorreta de heading, corrigida para o cartão do paciente; duas rodadas completas17/17, a última com substituição de pacientes reforçada. Sem arquivo real, alteração do perfil Windows, microfone físico, Rust ou novo instalador; instalado permanece0.2.44. Limpeza/legados continuam fora do escopo. Meta ativa: cobertura nativa e controles sem assistente no cofre bloqueado permanecem incompletos.

## Cobertura após0.2.44: entrada de sessões e demonstração pelo assistente

59/59 E2E interface/shell em2,7min; 229/229JS e lint aprovados (avisos anteriores). Dois CTAs de Sessões abrem o fluxo correto sem gravação antecipada. Demonstração por comando exige proposta/confirmação; recusa preserva todos os registros, aceitar cria três pacientes/dois modelos/três séries/quatro sessões fictícias e repetir no mesmo processo/dia não duplica ou altera registros. Comparações integrais reforçadas e novamente comprovadas em2/2 cenários mouse/comando,20,8s. [Matriz e limites](voz-cobertura-interface.md). Expectativa inicial de paciente vazio corrigida após conferir o padrão `emptyForm`, sem mudança de produção. Nenhum novo instalador, banco nativo ou microfone físico testado; instalado permanece0.2.44, meta ativa. Próxima lacuna: seleção/verificação/restauração de backup pelo assistente, mantendo senhas e seletor nativo manuais e sem limpeza ou backups antigos.

## Cobertura após a entrega0.2.44: descarte por voz do updater

12/12 E2E settings em1,0min, com cinco novos casos de vínculo, Agenda, contexto, adendo e biblioteca. Recusar mantém conteúdo; aceitar descarta pelo handler normal, sem gravar nem instalar, verificado por lista de operações permitidas. 229/229JS e lint aprovados (avisos anteriores). Sem mudanças de produção ou novo instalador, perfil/dados reais não tocados. [Matriz atualizada](voz-cobertura-interface.md). Microfone e instalação real não testados nesta rodada; meta ativa.

## Entrega instalada 0.2.44 — 03/10/2026

[Pacote e evidência](validacao-voz-0.2.44.md). Consolidou retries explícitos e cabeçalhos semanal/diário. 229/229 JS e guard aprovados novamente; build offline/locked, audit e consistência do pacote. Instalaçãoexit0, versão44 e quatro arquivos principais do perfil preservados, snapshot0244 verificado. Sem nova abertura/microfone humano, Release ou assinatura updater. Referências abaixo a incrementos não empacotados são histórico agora incluído na44; meta continua ativa.

## Incremento após 0.2.43: navegação e gavetas administrativas

Cabeçalhos semanal/diário da Agenda usam Ver dia AAAA-MM-DD como o mensal, sem alterar layout/handlers. 28/28 E2E conjuntos em 2,3 min e 229/229 JS aprovados; lint/guard/build aprovados com avisos anteriores. Comprovados seleção de dia, Voltar do encerramento sem escrita, recolher gavetas administrativas e Fechar vínculos. [Matriz](voz-cobertura-interface.md). Mudança de cabeçalhos ainda não no instalador0.2.43; consolidar com retries explícitos no próximo pacote. Sem nova prova nativa/microfone; meta ativa.

## Incremento após 0.2.43: retries com alvo explícito

[Implementação e provas](voz-retries-explicitos.md). Recarregar agenda/análises, Verificar atualizações e Tentar instalação novamente identificam a operação na tela e na voz; não exige navegar quando dois erros aparecem juntos. Aliases antigos continuam válidos só quando únicos. 20/20 E2E conjuntos em 58,2 s e 229/229 JS aprovados; lint/guard/build também, com avisos anteriores. Ainda não empacotado no NSIS instalado 0.2.43. Meta ativa.

## Entrega instalada 0.2.43 — 03/10/2026

Cobertura adicional de Início/updater: **7/7 E2E em 38,6 s**, **229/229 JS** e lint aprovados. Retry da prévia, Ver pacientes/Ver agenda/Início, retry de verificação (falha/sucesso sem instalar) e retry com cadastro aberto preservado. Dois retries visíveis recusam comando ambíguo; navegação delimita o alvo sem efeito indevido, mas ainda é uma fricção a melhorar. [Matriz](voz-cobertura-interface.md). Sem alteração de produção ou novo pacote; sem instalação/ditado humano nesta rodada.

Rodada posterior apenas de cobertura: **19/19 E2E de interface em 1,3 min** e **229/229 JS** aprovados. Três provas novas cobrem o CTA de evolução sem rascunho/com rascunho disponível/com ativo, todas as âncoras de etapas, foco nos comportamentos, biblioteca vazia e consulta de paciente arquivado sem escrita. Percurso inicial corrigido para abrir a gaveta antes de acionar seu botão oculto; produção não mudou. [Matriz atualizada](voz-cobertura-interface.md). Sem novo instalador ou repetição nativa/microfone.

[Pacote e evidência](validacao-voz-0.2.43.md). O incremento de datas/horários abaixo agora está empacotado no NSIS 0.2.43. Build offline/locked e auditoria aprovados; instalação silenciosa exit0, versão conferida e quatro arquivos principais do perfil preservados, snapshot0243 verificado. Sem nova abertura/microfone humano, Release ou assinatura updater. 229/229 JS passaram novamente na versão43. Meta ativa; referências abaixo a “ainda não incluído” são histórico anterior ao empacotamento.

## Incremento de código após o instalador 0.2.42 — datas e horários

[Formatos e limites](voz-datas-horarios.md). Campos de data/hora aceitam datas completas faladas e horários explícitos em português; a proposta mostra o valor convertido e mantém confirmação/eventos normais. Textos livres não são reescritos. Revisão encontrou e corrigiu separação errada de “vinte horas e três” e rejeição de horas compostas; preservados formatos numéricos com segundos quando o campo permite. 229/229 JS aprovados. Rodada de 24 E2E passou antes dos ajustes finais da revisão; teste específico ampliado está sendo reexecutado. Lint/guard/build passaram, com avisos anteriores.

Após a revisão, o teste específico ampliado passou em 20,8 s, verificando também 20:03 e 21:30 no formulário. Ainda não incluído no NSIS 0.2.42; próximo empacotamento deve consolidar este incremento. Microfone humano e persistência nativa não foram testados nesta rodada. Meta continua ativa.

## Estado atual: instalado 0.2.42 — 03/10/2026

[Evidência atual](validacao-voz-0.2.42.md). Pacientes e vínculos homônimos têm opções distintas e identidade/revisão; seletores de paciente nas três áreas usam o mesmo helper. Pode dizer “opção dois”, sem ponto separador. Seleção confirmada revalida valor/rótulo disponível. 225 JS, 20 E2E de regressão/seleção e quatro E2E de homônimos passaram. NSIS instalado, perfil preservado e smoke de processo aprovado. Sem Release/updater assinado nem teste de microfone humano.

Rodada de cobertura sem alterações de produção: **7/7 E2E em 46,7 s** para navegação do calendário, início de sessão com falha/retry sem duplicação, encaminhamento e recusa da finalização, filtros diretos de Análises e erro/retry sem dados antigos. **225/225 JS** aprovados. [Matriz consolidada e lacunas](voz-cobertura-interface.md). Instalador permanece 0.2.42; não houve novo teste de microfone humano, Rust ou instalação nesta rodada.

Rodada adicional: **7/7 E2E de Agenda em 56,1 s**, incluindo três provas novas de selects diretos, comando local com escolha de ID homônimo e troca da ação cancelar/remarcar seguida de fechamento sem gravação. **225/225 JS** e lint aprovados. Expectativa de data inicial da série na fixture corrigida conforme contrato do parser; sem mudança de produção ou novo instalador.

Próximos pontos: controles restantes de navegação, evolução e retries do Início/updater; datas/horas faladas em campos. Meta ativa; seções seguintes são histórico. Não investigar limpeza de recovery ou compatibilidade de backups antigos.

## Estado atual: instalado 0.2.41 — 03/10/2026

[Evidência atual](validacao-voz-0.2.41.md). Concluídas as provas pendentes da 0.2.40 para payload completo de pacientes/solicitante/busca e edição/cancelamento da biblioteca. Corrigido rótulo iniciado por “O”; comportamentos homônimos têm opções explícitas e identidade/versão; proposta antiga não atravessa troca de editor ou rascunho. 23/23 E2E conjuntos e 223/223 JS passaram. Instalador local auditado/instalado, perfil preservado e smoke de processo aprovado. Sem Release/updater assinado ou validação do microfone humano.

Próximos pontos: pacientes/vínculos homônimos, datas/horas faladas em campos genéricos e matriz consolidada das ações visíveis. A meta permanece ativa; senha/diálogos de arquivos são manuais, cofre bloqueado não oferece assistente e recovery desabilitado permanece fora da investigação. As seções seguintes são histórico, não o estado do instalador atual.

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
