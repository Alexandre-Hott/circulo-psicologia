# Melhoria contínua de voz

## Consolidação instalada0.2.61 —04/10/2026

[Registro nativo e limites](validacao-voz-0.2.61.md). Instalação NSIS exit0, versão61, quatro arquivos locais preservados por cópia/hash antes/depois/reabertura e18recursos de voz conferidos. Executável instalado igual ao build em todos os bytes exceto3do marcador Tauri esperado UNK→NSS, conferido na dependência2.10.0. App reaberto/entrada pedindo senha lida por acessibilidade. Tab falhou na ativação duas vezes, com nova seleção da janela entre tentativas; não houve comando aplicado/senha automatizada. Não é validação de microfone ou jornada clínica instalada. Estados abaixo de instalado59 são históricos. Pacote61 anterior mantido, sem novo build/Release/assinatura ou alteração de dados. Meta ativa.

## Consolidação de áudio das gavetas — pacote0.2.61,04/10/2026

[Corpus e limites](voz-audio-sintetico-20261003.md). Três WAVs SAPI transcritos pelo backend Rust real sem rede, exit0; Abrir novo compromisso/Recolher detalhes e ações/Confirmar comando corretos e não editados. Avaliação central0aprovados/0falhos/3nãoavaliados, pois estes pedidos exigem UI/proposta. Replay novo aprovado em3,6s na regressão, com confirmação por segundo áudio, preservação do formulário/horário e zero gravações. Unidade259/259. Execução integral corrigida113/113 em8,6min, terminal exit0, incluindo o seletor corrigido da Agenda. Revisão independente confirmou fixture/evaluator e pediu dois checkpoints de preservação; acrescentados após esse replay na rodada integral. Repetição final do replay reforçado1/1 em18,5s, exit0: detalhes mantidos após abrir formulário e formulário/horário mantidos enquanto recolher aguarda confirmação. Suíte Rust release offline/locked86aprovados/0falhas/1ignorado em11,90s; opt-in de WAV executado separadamente pelo harness. Lint sem erros/avisos anteriores, guard/diff e consistência do pacote aprovados. Nenhuma mudança funcional ou novo instalador: pacote61 anterior permanece, instalado59. Sem microfone físico, captura nativa ininterrupta ou escrita instalada comprovados. Meta ativa. Os resultados anteriores111com falha/3focados são históricos, não a última regressão.

## Entrega0.2.61 — gavetas por pedido natural,04/10/2026

[Instalador Windows x64](../src-tauri/target/release/bundle/nsis/Círculo_0.2.61_x64-setup.exe): 135.882.040 bytes, SHA-256 `e948147d7279c7d5a7e89e5446cbe00400d8bc15353c80f0c7e324a5a37c131a`. Build NSIS offline/locked exit0, Rust release1m08s; frontend aprovado com aviso chunk>500KiB e linker com aviso anterior OpenSSL/PDB. Auditoria PE61/x64/hash aprovada; conteúdo interno não extraído. Sem instalação61, assinatura updater/Authenticode ou Release; instalado59. Nenhum perfil/dado real alterado.

“Abrir Novo compromisso”, “Recolher Detalhes e ações” e “Fechar Compromissos persistidos” preparam o estado desejado e exigem confirmação. Só summaries de details ou botões com aria-expanded/aria-controls são elegíveis. Repetir abrir não fecha; recolher não abre. Caption exata, sem correspondência parcial; visibilidade, duplicatas, record/epoch e destino da gaveta revalidados. O clique tradicional continua alternando normalmente. Agenda preserva campos ao recolher.

Revisão independente encontrou rótulo dinâmico invalidando mudança manual inofensiva e navegação de sessão pendente reabrindo gaveta. Corrigidos fingerprint por caption estável/destino e cancelamento explícito da navegação correspondente após recolher confirmado. Primeira estratégia de cancelar toda troca de commandId causou perda de foco do adendo; removida e substituída por invalidação explícita somente no fechamento. Teste focado de adendo voltou a passar. Dois seletores novos também foram corrigidos: contexto oculto exige includeHidden e evolução usa o título real da gaveta. Rodada4 teve3aprovados/1timeout em page.goto, antes da interação; rodada111 teve seletor ambíguo entre atalho e toggle de Novo compromisso, corrigido para aria-controls. Não representam prova de captura humana.

DOM inicial: red0/1 antes da implementação, green7/7; teste adicional verifica troca de aria-controls. Unidade final258/258, lint sem erros/cinco avisos anteriores e guard aprovados. Regresso inicial104 teve102aprovados/2falhas de foco com a estratégia de invalidação depois removida. Regresso111 terminal:110aprovados/1falha em7,4min, exclusivamente o seletor ambíguo já descrito; contexto/adendo atrasados, foco normal e todos os demais cenários passaram. Após corrigir o seletor, rodada final de gavetas3/3 em32,1s, exit0, sem processos E2E concorrentes: mudanças manuais entre proposta/confirmação, repetição idempotente, preservação do horário e áudio sintético de proposta/confirmar. Esse teste de áudio foi adicionado após iniciar a rodada111; não está incluído nela. As rodadas focadas anteriores também tiveram timeout em page.goto, antes da interação, não escondido por aumento de timeout/retries. Não houve outra execução integral de111/112 depois da correção do seletor; não anunciar suíte integral verde. Build/auditoria/consistência e diff check passaram. Revisão estática final sem novos achados; não executou os testes. Sem nova suíte Rust completa ou transcrição SAPI/Rust, pois backend funcional não mudou. Áudio nos novos testes é simulado, sem prova de microfone físico ou persistência instalada. Meta continua ativa.

## Entrega0.2.60 —04/10/2026

[Instalador Windows x64](../src-tauri/target/release/bundle/nsis/Círculo_0.2.60_x64-setup.exe): 135.891.421 bytes, SHA-256 `781781cd0ae6f910c3941763a14543895e091557605aac83aa394d707b5cf246`. Build NSIS offline/locked exit0; auditoria PE60/x64 e hash conferidos. Conteúdo interno não extraído; sem assinatura Authenticode/updater, instalação60 ou Release. Instalado permanece59. Nenhum dado real utilizado.

## Incremento0.2.60 — reconhecimento do papel administrativo nos vínculos

NativeSAPI/Rust encontrou “Marcar contrato administrativo” em vez de Contato administrativo. Saída preservada sem editar a palavra. Avaliador1aprovado/2nãoavaliados; o replay de interface falhou0/1 no papel, demonstrando que transcrição não vazia/exit0 do harness não bastam. Corrigido alias exato no match, só checkbox Contato administrativo em `form[data-voice-record^="party:"]`. Duplicatas continuam competindo, negados/desabilitados/ocultos são recusados e identidade/revisão é revalidada na confirmação. Nenhum nome/valor textual reparado.

Replay e caso literal/negativo2/2 em21,6s; abrir Ana e marcar papel exige4áudios, nenhum dado salvo. Revisão estática independente sem achados, nodecheck aprovado; não executou DOM/browser. Teste novo de erro antigo durante captura preserva proposta nova, painel13/13 em25,2s. JS258/258 após versionamento. Regressão final95/95 em4,7min, exit0; mais5/5 probes DOM em22,7s: alias fora de vínculos, duplicatas, desabilitado, concorrência de rótulo literal e revisão alterada. Os testes focados estão incluídos na regressão, não são somados novamente. Lint sem erros/cinco avisos anteriores. Fonte funcional Rust/captura/persistência não mudou; não foi repetida a suíte Rust completa. Reconhecedor Rust foi exercitado no harness sintético. Sem microfone físico ou interface instalada nova nesta rodada. Instalado59; meta ativa. [Detalhes](voz-audio-sintetico-20261003.md).

## Consolidação instalada0.2.59 —04/10/2026

[Registro nativo e limites](validacao-voz-0.2.59.md). Instalaçãoexit0, ProductVersion59, quatro arquivos do perfil preservados por hash/cópia local e18recursos de voz conferidos. Aplicativo reaberto, entrada lida por acessibilidade; comando de teste limpo sem aplicar ação. Referências anteriores a não instalado/instalado52 são históricas. Cliques/captura falharam: sem geometria, FrameArrived timeout e retry window capture timeout. Nenhuma senha, permissão ou dado real automatizado. Não comprova microfone/jornada clínica instalada nem publica atualização. Sem fonte funcional/build novos nesta rodada; meta ativa.

## Entrega local0.2.59 — limpeza da proposta após erro de voz

Pacote `Círculo_0.2.59_x64-setup.exe`, **135.879.789 bytes**, SHA-256 `3ee3f5dd104ad277dbe0900b387b4dac571f10e96fc9089dd3de1f34b8a0ce09`. Build NSIS offline/locked exit0, release Rust55,51s; aviso anterior OpenSSL/PDB LNK4099. Override temporário updater removido após término, configuração oficial intacta. Manifest `%TEMP%\\circulo-0259-audit-20261004.json`: PE0.2.59/x64/NotSigned. Consistência de versão/tamanho/hash/docs aprovada. Conteúdo interno não extraído; não instalado/aberto, perfil/instalado52 não alterados. Sem `.sig`, Authenticode, Release ou oferta automática no GitHub. Regressão86/86 em3,8min; sem microfone físico ou nova transcrição real nesta rodada. Meta ativa.

## Incremento0.2.59 — falha de transcrição não deixa proposta antiga aplicável

Reproduzido no componente: após proposta de cadastro, áudio vazio/erro de permissão/novo transcript no modo manual substituíam a mensagem, mas não descartavam a intenção enviada ao host. Red0/3, green3/3 em20,3s. Agora `onDraft(null)` acompanha esses três caminhos, somente após a verificação de geração. Sucesso com interpretação automática continua passando pela mesma proposta/confirmar; áudio antigo não limpa uma proposta nova. Texto digitado permanece disponível para preparar novamente.

Revisão independente estática sem achado acionável; registrou que testes isolados não provam retorno de `pendingIntent` do host nem corridas da confirmação automática. Acrescentados dois testes de integração para vazio/erro nativo, remoção do botão de revisão, confirmação antiga recusada, retry abrindo o paciente correto e nenhuma escrita. Regressão final interface/painel/transição de bloqueio/autosave86/86 em3,8min, exit0; inclui os dois testes novos e confirmação por segundo áudio dos corpora anteriores. JS257/257 após versão; lint sem erro/cinco avisos anteriores, guard/diff aprovados. Mídia/RPC/armazenamento sintéticos, componentes reais; não valida erro físico do reconhecedor. Nenhuma alteração funcional Rust/captura/reconhecedor/perfil; suíte Rust não reexecutada nesta rodada. Sem microfone físico, nova transcrição real ou jornada instalada validada nesta rodada. Meta ativa.

## Validação nativa complementar ao0.2.58 — sem mudança de produção

Reconhecedor local/Rust opt-in executou3WAVs fictícios para quinta-feira, terça-feira e confirmar: exit0, textos corretos preservados no corpusweekday. Replay2/2 em26,7s com primeiro áudio apenas proposta, segundo aplicação ao dia correto e zero escrita. Regressão21/21 em1,4min; unidade257/257, guard/diff/lint aprovados (cinco avisos anteriores). Cenário core17 repetido exit0, com quinze intents avaliadas e duas dependentes de interface não avaliadas pelo parser central, conforme contrato do harness. [Detalhes e limites](voz-audio-sintetico-20261003.md).

Não exigiu novo build/versão: somente ferramentas, fixture e testes mudaram; instalador58 existente conferido novamente por versão/tamanho/hash/docs. Instalado52 e perfil não alterados, sem rede, gravação ambiente, microfone físico ou jornada instalada validada. Sem Release/assinatura nova. Meta ativa; não substituir evidência nativa de captura/persistência por esse replay simulado.

## Entrega local0.2.58 — dias completos da semana

Pacote `Círculo_0.2.58_x64-setup.exe`, **135.885.060 bytes**, SHA-256 `0d35da610025b857ebe695006471673a1691f2f60577e0b185960c9d1f93751b`. Build NSIS offline/locked exit0, release Rust58,90s; aviso anterior OpenSSL/PDB LNK4099. Override temporário removido após término; configuração oficial updater preservada. Manifest `%TEMP%\\circulo-0258-audit-20261004.json`: PE0.2.58/x64/NotSigned. Conteúdo interno não extraído; não instalado/aberto. Instalado52/perfil não alterados. Sem `.sig`, Authenticode ou Release; link local não oferece atualização pelo GitHub. Consistência de versão/tamanho/hash/docs aprovada; regressão66/66 em3,3min, sem transcrição/microfone físico novos. Meta ativa.

## Incremento 0.2.58 — dia da semana com nome completo

No formulário recorrente, “Selecionar Dia da semana como quinta-feira” deve selecionar a opção Quinta pela mesma proposta/confirmar do assistente. Normalização restrita ao select marcado como weekday; nomes/textos livres não mudam. Domingo/Sábado e dias úteis curtos/com -feira ou espaço feira são exatos. Datas relativas, alternativas e sufixos extras são recusados. Opções ausentes/desabilitadas/duplicadas continuam sujeitas às mesmas validações; fingerprint inclui o tipo do campo.

Unidade256/256 após versionamento; revisão independente6/6 e verificações de literalidade sem achado acionável. Teste E2E sem marcação reproduziu ausência da proposta Quinta (0/1); marcação corrigida, grupo final11/11 em1,1min. Confere todos os dias/variantes/números, proposta antes de aplicar, nenhuma escrita antes do salvamento explícito e payload exato da série, recusas, Nome literal e fingerprint alterado. Primeira invocação de filtro inglês não encontrou testes e não é evidência de aprovação/falha funcional. Regressão final interface/identidade de seleção66/66 em3,3min, exit0. Lint sem erros/cinco avisos anteriores; guard/diff aprovados. Não há teste novo de transcrição nativa ou microfone físico nem suíte Rust nova (backend funcional não mudou). Perfil/aplicativo instalado não alterado; sem publicação de Release ou assinatura nesta etapa. Meta ativa.

## Entrega local0.2.57 — ajuda e prefixos locais

Pacote final `Círculo_0.2.57_x64-setup.exe`, **135.888.988 bytes**, SHA-256 `feb92dcc168f6d293a5062d40f00d05cb2cf56ac434e30624372f52b85642a04`. Build NSIS offline/locked exit0, release Rust42,12s, aviso anterior OpenSSL/PDB LNK4099. Pacote anterior regenerado após isolamento do teste Rust. Override temporário updater removido após término; configuração oficial intacta. Manifest `%TEMP%\\circulo-0257-audit-20261004-final.json`: PE0.2.57/x64/NotSigned. Conteúdo interno não extraído, não instalado/aberto, instalado52. Nenhum perfil/senha alterado. Sem `.sig`, Authenticode, Release ou oferta automática pelo GitHub. Regressão final192/192 e Rust86 aprovados/1 ignorado; detalhes e primeira falha registrados abaixo. Meta ativa.

## Incremento 0.2.57 — auditoria geral, ajuda e prefixos reconhecidos

Auditoria read-only das telas/roteador/testes identificou ajuda “O que posso pedir?” como único controle habilitado sem rota localizado, além das exclusões assumidas de senha/arquivo/limpeza desabilitada. Corrigida exceção estreita: somente `summary[data-voice-help]` pode ser inventariado dentro do assistente. Não libera campo de comando, botões de gravação ou outras ações do próprio assistente. Abrir/recolher ajuda passa pela mesma proposta e confirmação, bloqueado ou desbloqueado, sem IPC. E2E red0/2, green2/2 em19,9s.

Regressão inicial geral **146/146 em7,8min** antes dessas correções, com14 arquivos de voz. Auditoria notou que demonstração por comando está em `desktop-vault-shell`, fora do filtro de nome “voice”; execução final inclui esse arquivo e os novos casos: **192/192 aprovados em9,5min**, exit0. Não transforma ausência de achados de fonte em prova de execução nativa. Instalado52, não alterado nesta rodada.

Suíte Rust completa inicialmente: **85 aprovados, 1 falhou, 1 ignorado**. O teste de instância única disputava o mutex de produção com o aplicativo instalado aberto. Isolado somente o teste com namespace privado PID/tempo, transmitido ao subprocesso por `Command.env`; produção mantém identidade SID:br.circulo.psicologia e exclusão global idênticas, sem override de ambiente. Teste focado **2/2**, suíte completa repetida `cargo test --release --offline --locked`: **86 aprovados, 0 falhas, 1 ignorado em7,53s**, exit0. Aplicativo instalado não foi fechado nem perfil alterado. Instalador regenerado depois dessa alteração.

Reconhecimento nativo com3WAVs SAPI fictícios e recursos instalados52 expôs erros. Rate0: `Prinscheridade com nove.` e `Prie encher… compartilciou…`; limpar foi reconhecido. Alternativa rate-2 “Definir idade” virou `Definilidade`; a nota com Definir saiu correta. “Definir o campo idade” virou `Definir o campo e idade`. Tentativa de ampliar prompt melhorou só o verbo, mantendo `Nov`/nota distorcida: descartada, prompt Rust voltou integralmente ao original. Nenhum ajuste de dados ou números baseado em adivinhação.

Repetição com frases originais rate-2 gerou corpus real em `native-voice-fields-20261004.json`: `Prinscheridade…`, `Princher nota… com participou com apoio.`, limpar correto. Gateway agora reconhece apenas esses dois prefixos completos/ancorados. Nunca altera conteúdo, números ou nomes; campo precisa existir visível/único e confirmar. Replay com captura/IPC simulados: red1/3, green3/3 em24,7s, primeiro áudio apenas proposta, segundo áudio de confirmação aplica idade9/nota literal/limpeza na sessão correta, escala2 preservada e zero escrita. Avaliador central marca0passados/3nãoavaliados intencionalmente: ações de interface exigem replay, não aprovação pelo parser central. Os corpora de tentativas mal reconhecidas foram preservados sem edição das transcrições.

Revisão independente read-only:25probes DOM/Edge aprovados, incluindo alvos duplicados, negação, payload literal, epoch antigo, exclusão de outros controles do assistente e toggle da ajuda. Sem achado acionável. JS255/255 após versionamento; lint sem erros/cinco avisos anteriores, guard/diff aprovados. Comportamento Rust de produção inalterado; teste de mutex isolado como descrito acima. Sem microfone físico, captura ambiente ou perfil real. Demais erros de transcrição não reconhecidos continuam podendo exigir digitar/corrigir o comando. Meta ativa; jornada instalada com microfone/persistência ainda não comprovada.

## Entrega local 0.2.56 — nota contextual por comando natural

Pacote final `Círculo_0.2.56_x64-setup.exe`, **135.890.282 bytes**, SHA-256 `3daf1b1b6b84f4b2628503bf0170ed410c442a97b9e303061ac79b4d11e78c4d`. Build NSIS offline/locked exit0, release Rust54,83s; aviso anterior OpenSSL/PDB LNK4099. Pacote inicial não entregue: regenerado após ajustar ajuda ao nome do catálogo nativo. Override temporário updater removido após término, configuração oficial preservada. Manifest `%TEMP%\\circulo-0256-audit-20261004.json`: PE0.2.56/x64/NotSigned; conteúdo interno não extraído. Não instalado/aberto, instalado52 conferido; perfil/senhas não alterados. Sem `.sig`, Authenticode, Release ou oferta automática pelo GitHub. Novo comando validado em componente real/RPC sintético, não transcrição deste pedido nem microfone físico. Meta ativa.

## Incremento 0.2.56 — nota contextual sem ditar pontuação

O campo “Nota contextual opcional · nome do indicador” mantém o rótulo visível e agora aceita `Preencher Nota contextual de nome do indicador com texto` e `Limpar Nota contextual de nome do indicador`. Alias ligado ao próprio textarea; mesmos gateway/fingerprint/formulário e confirmação. Não elimina seleção da escala, não cria observação nova fora da sessão e não grava imediatamente. Exemplo incluído apenas na ajuda recolhida.

Agente de testes alterou somente `desktop-voice-workflows.spec.js`, com dois cenários: nota original preservada antes de confirmar; após aplicar, só nota muda, valor1 da escala permanece; nenhuma chamada de salvamento anterior; `Salvar rascunho` tem ID/payload exatos. Execução focada **2/2 em36,3s**, porta5197. Primeira tentativa teve duas falhas durante troca de produção; não é red isolado e não sustenta alegação de erro persistente. JS254/254 após versionamento, lint sem erro/cinco avisos anteriores, guard aprovado. Regressão combinada final **53/53 em3,2min**, exit0. Ajuda usa Regulação emocional, conferido no catálogo Rust; pacote regenerado após corrigir o exemplo sintético indisponível no catálogo padrão.

Comandos digitados no assistente e RPC/armazenamento sintéticos; não comprovam captura física, transcrição deste alias ou persistência instalada. Backend Rust e contrato de dados não alterados. Instalação atual conferida por ProductVersion:52, nenhum perfil modificado. Meta ativa.

## Entrega local 0.2.55 — idade no formulário por fala

Pacote final `Círculo_0.2.55_x64-setup.exe`, **135.881.924 bytes**, SHA-256 `4f26798742181808fed08026f4bd29286c85e84a3ff2b8e47960d8b9e0e90672`. Build NSIS offline/locked exit0, release Rust40,42s; aviso anterior OpenSSL/PDB LNK4099. Build inicial concluído, mas não entregue: regenerado após correção da variante “cento e dezassete”. Override temporário updater removido somente após término; configuração oficial preservada. Manifest `%TEMP%\\circulo-0255-audit-20261004.json`: PE0.2.55/x64/NotSigned. Conteúdo interno não extraído; não instalado/aberto nesta rodada. Nenhum perfil alterado, instalado permanece52. Sem `.sig`, Authenticode, Release ou oferta automática no GitHub. Pacote local para teste, não homologação de microfone.

## Incremento 0.2.55 — idade falada no formulário existente

Falha reproduzida por teste E2E: “Preencher Idade com nove” preparava a palavra `nove`, incompatível com o salvamento do cadastro. Corrigido apenas o campo explicitamente marcado `data-voice-value-type="age"`: número cardinal completo de0a120 vira dígitos na proposta, sem reescrever nomes ou textos livres. Mantidos formulário, confirmação e salvamento separados. Limpar preserva idade opcional vazia; aproximações, alternativas, frações e valores fora do intervalo são recusados antes de aplicar. Fingerprint inclui o marcador de tipo para recusar uma proposta se o campo mudar.

Unidade inicial4/5, E2E específico inicial0/1 (prévia mostrava“nove”). Após correção JS254/254 final, lint sem erro com cinco avisos anteriores, guard/diff aprovados. Regressão interface/pacientes **51/51 em3,1min**. Revisão independente encontrou “cento e dezassete” recusado, embora o parser natural o aceitasse; corrigido, unidade5/5 e E2E de preenchimento/salvamento final1/1. Teste novo de marcador alterado falhou apenas por procurar classe de erro do assistente: snapshot mostrou alerta correto e idade8 preservada, sem escrita; corrigida a asserção para rolealert. Repetição final de pacientes **5/5 em53,9s**, incluindo variante117, prévia9 antes de aplicar, campos livres preservados, rejeição sem escrita e fingerprint alterado. Backend Rust funcional e captura/transcrição não alterados; nenhum novo teste de áudio físico/nativo nesta rodada. Não converter esta prova de comandos digitados em homologação do microfone.

Instalado permanece52, nenhum perfil ou senha alterado. Meta ativa; validação instalada e cobertura final completa continuam pendentes.

## Entrega local 0.2.54 — intervalo de análises falado

Pacote `Círculo_0.2.54_x64-setup.exe`, **135.880.128 bytes**, SHA-256 `d6ab8038b3bf848ba348c1d516289165d8853750332f68cbbbe02c1213006ea3`. Build NSIS offline/locked exit0, release Rust46,24s; aviso anterior OpenSSL/PDB LNK4099. Primeira invocação de build recusou flags fora do separador; corrigida para argumentos Cargo após `--`, compilação/pacote concluídos. Override temporário de updater removido ao final, configuração oficial preservada. Manifest `%TEMP%\\circulo-0254-audit-20261004.json`: PE0.2.54/x64/NotSigned, sem extração interna/instalação/execução. Instalado permanece52. Sem alteração do perfil, `.sig`, Authenticode, Release ou oferta automática pelo GitHub. Arquivo local disponível para teste.

## Incremento 0.2.54 — intervalo de análises por fala

“Mostrar análises de Ana Clara de um de setembro de 2026 até trinta de setembro de 2026” prepara os filtros existentes de paciente e período; sem paciente, mostra todos. Aceita datas completas por extenso ou intervalo misto verbal/numérico, sem inferir o ano. Exige confirmar antes da consulta; intervalo inválido, invertido ou superior a cinco anos é recusado. Preservada navegação de paciente cujo nome contém “até”; colisão real entre nome e intervalo exige seleção separada. Revisão encontrou essa regressão, corrigida e coberta por teste.

JS final **253/253**, build web/guard/diff aprovados; lint sem erros, cinco avisos anteriores. E2E de análises com IPC sintético: quatro casos, incluindo prévia sem consulta, confirmação com filtros exatos, consulta global, datas inválidas e recarga. Primeira execução4/4; repetição final após correção do nome **4/4 em30,5s**, exit0. Não é validação do host instalado nem do microfone físico.

Harness `analytics-range`: primeira tentativa com fala SAPI lenta (-2) falhou no backend Rust, que recusou áudio acima de12s. Limite do aplicativo não alterado. Segunda tentativa com frases menores e velocidade SAPI normal(0), recursos de voz instalados52: **2/2 intents completos**, nenhum não-avaliado, exit0. Corpus real salvo em `test/fixtures/native-voice-analytics-20261004.json`, com paciente/datas comparados exatamente. Comandos longos ainda devem ser divididos em preenchimentos separados de De/Até; não confundir sintético com microfone humano.

Backend Rust funcional não alterado. Instalação local permanece52; nenhuma senha ou perfil alterado. Meta ativa, sem ampliação de recovery/backup legado.

## Entrega local 0.2.53 — data verbal nas ações de ocorrência

Pacote `Círculo_0.2.53_x64-setup.exe`, **135.881.152 bytes**, SHA-256 `54ac9e18825eb40749202a899153a5207c8f98d625b3e66cc951b1bcf8d18949`. Build NSIS offline/locked exit0; Rust release compilado em1m15s, aviso anterior LNK4099/PDB OpenSSL. Override temporário de updater removido após término, configuração oficial preservada. Auditoria `%TEMP%\\circulo-0253-audit-20261004.json`: PE0.2.53/x64/NotSigned. Sem extração interna, instalação, abertura ou microfone físico nesta rodada; instalado permanece52. Nenhum perfil alterado. Sem `.sig`, Authenticode, Release ou atualização publicada pelo GitHub.

Inclui o incremento abaixo. **250/250JS** após versionamento, **60/60E2E interface/calendário finais em4,3min**, incluindo asserções fortalecidas do alvo de remarcação/cancelamento. **3WAVs nativos/3intents completos** e replay inicial3/3 aprovados. Build/lint/guard/diff aprovados, avisos anteriores de lint/chunk. Backend Rust funcional não mudou; teste opt-in de3WAVs executado separadamente, suíte completa Rust anterior86 aprovados/1 ignorado não reexecutada nesta rodada. Componente/RPC sintético não é jornada de instalador. Meta ativa.

## Incremento após 0.2.52 — data falada nas ações de ocorrência

Iniciar/remarcar/cancelar sessão existente passam a aceitar “em/no dia três de outubro de dois mil e vinte e seis”, inclusive dia transcrito como3. Reaproveitado conversor de data completa, sem inferir ano. Gramática relativa/numericamente explícita é preservada; fallback verbal testa separadores completos e nome exato. Não agenda nem cancela automaticamente: proposta/confirmar são exigidos, e remarcação/cancelamento apenas abrem o formulário existente.

Teste novo red0/1 antes da correção; primeira implementação falhou247/248 porque fallback também aceitava1/10/2026. Fallback restringido a `dia de mês de ano`, mantendo ISO/números com um dígito recusados nas ações de ocorrência. **250/250 JS finais** aprovados, build/lint/guard/diff aprovados (avisos anteriores). Revisão independente:79 testes,234probes,36comparações com HEAD aprovados, sem achado bloqueante; asserções de ISO/dígitos acrescidas pelo principal. Limite conservador: nome com palavra isolada `as` recusa o fallback para não absorver trecho anterior de horário/ação; permanece acesso via formulário/gateway já existente.

Novo cenário `occurrence-date` gera3WAVs fictícios com recursos da instalação52. Teste Rust de transcrição exit0, **3 intents completos correspondentes/0falhos/0nãoavaliados** no evaluator. Fixture `native-voice-occurrence-20261004.json` contém textos efetivamente coletados, inclusive “seção” e dia3. ReplayE2E inicial **3/3 em22,3s**: prévia sem efeito, segundo áudio de confirmar, início com série/data exatos; remarcação/cancelamento só abrem formulário sem RPC de escrita. Revisão estática sugeriu verificar alvo no formulário; adicionados registro/paciente/data/horário. Regressão ampliada final **60/60 em4,3min** aprovada.

Captura/RPC simulados no replay, não microfone físico/host IPC instalado. Backend Rust funcional não mudou. Incremento agora incluído no pacote53, mas não na instalação atual52. Nenhum perfil real acessado nem ampliação de recovery/legados. Meta ativa.

## Áudio sintético para os pedidos curtos de salvamento

Novo cenário separado `behavior-save` no harness, mantendo core17 padrão. Três WAVs SAPI passaram pelo backend Rust com recursos da instalação52: “Salvar comportamento.”, “Salve o comportamento.”, “Confirmar comando.”, transcrições idênticas. Capturas preservadas em fixture. Evaluator declara0passados/0falhos/3nãoavaliados, pois todas as ações exigem UI/proposta; sucesso do script significa coleta concluída, não cobertura funcional total.

Replay dos textos coletados na interface: **2/2 em25,6s** para criar/editar comportamento, dois pedidos de áudio simulados, nenhuma escrita antes de confirmar e exatamente um invoke de gravação com argumentos completos depois. **247/247 JS**, lint/guard/diff aprovados, cinco avisos de lint anteriores. Revisor identificou P2 do nome de cenário com maiúsculas (ValidateSet PowerShell aceita, evaluatorJS recusava); normalizado no início. Reexecução real `Behavior-Save`exit0, mesmas transcrições e contagens; revisão final sem achado concreto. Ferramentas/testes apenas: nenhum novo instalador necessário, produção e instalado52 permanecem idênticos. Microfone físico e host IPC instalado não comprovados. [Comando, corpus e limitações do harness](voz-audio-sintetico-20261003.md). Meta ativa.

## Instalação local e leitura nativa 0.2.52

Instalador `Círculo_0.2.52_x64-setup.exe`, 135.884.912 bytes, SHA-256 `8ad1b0ead57e6b8f6353506eb91abe14afb25e8429720849ff08ba57d6143c26`, conferido antes de executar NSIS `/S` oculto. Círculo estava fechado. Cópia fresca de `circulo.db`, `auto-backup.db`, `vault.key` e `daily-unlock.dpapi` em `%LOCALAPPDATA%\\Círculo-update-backup-20261004-0252`; cópias verificadas por hash, sem sobrescrever backup anterior. Cache EBWebView não copiado. Instalação exit0; executável instalado ProductVersion0.2.52; quatro arquivos do cofre idênticos antes/depois da instalação. Whisper CLI/modelo instalados têm hashes iguais aos recursos empacotados. Nenhum conteúdo clínico ou chave foi lido/exposto.

Habilidade de controle do Windows: pacote `@oai/sky` lançou o aplicativo pré-existente atualizado e selecionou sua única janela retornada. Captura com imagem/texto falhou `FrameArrived timed out: timed out waiting on channel`; após seleção atualizada, observação apenas por acessibilidade funcionou. Árvore confirmou documento `http://tauri.localhost/`, tela de senha e controles do assistente. Não houve entrada de senha, alteração de autenticação ou interação com pacientes. Desbloqueio deixado ao usuário; aplicativo permanece aberto. Abertura/primeira tela não comprovam funcionalidades após desbloqueio nem microfone físico.

O manifest de auditoria do pacote registra a etapa anterior à instalação, com flagsfalse; não foi adulterado para transformar metadados em homologação de execução. As notas “instalado47/não instalado” abaixo são históricas.

`testWhisperSynthetic.ps1 -VoiceDirectory "%LOCALAPPDATA%\\Círculo\\voice"` terminou **exit0**, com voz Microsoft Maria Desktop Portuguese(Brazil) e NetworkUsedfalse. Harness gera17WAVs, testa CLI, passa17WAVs ao teste Rust opt-in que chama `native_voice::transcribe` com os recursos instalados e verifica corpus/intenções pelo avaliador. Processo só aceita divergências semânticas zero. O comando de resumo usou objetos de formas diferentes e a formatação PowerShell ocultou as contagens; não declarar uma contagem agregada como saída observada. Resultado terminal e contrato do harness são evidência da execução, não de microfone físico/host IPC instalado. Arquivos temporários do harness removidos pelo próprio script em diretório GUID validado; nenhuma cópia do perfil apagada. Este corpus17 não inclui o novo alias “salvar comportamento”, validado separadamente nos E2E digitados; dois pedidos do corpus dependem de interface/proposta e não são avaliados pelo parser central. Meta ativa.

## Entrega local 0.2.52

Pacote `Círculo_0.2.52_x64-setup.exe`, **135.884.912 bytes**, SHA-256 `8ad1b0ead57e6b8f6353506eb91abe14afb25e8429720849ff08ba57d6143c26`. Build NSIS offline/locked exit0, Rust release compilado em1m03s; override temporário removido após término e configuração oficial preservada. Auditoria `%TEMP%\\circulo-0252-audit-20261004.json`: PE0.2.52/x64/NotSigned. Sem extração do conteúdo interno, instalação, abertura ou microfone físico nesta rodada. Instalado conferido permanece0.2.47; nenhum perfil alterado. Sem `.sig`, Authenticode, Release ou atualização publicada pelo GitHub.

Inclui o pedido curto de salvamento de comportamento e o alias “em DD/MM/AAAA” nas ações de ocorrência, além das correções anteriores de retomada/bloqueio. **245/245 testes JS** reexecutados após versionamento; **49/49 E2E interface/biblioteca em3,4min** finais aprovados na versão52. Revisão estática sem achado concreto. Backend Rust funcional não mudou, testes Rust anteriores86 aprovados/1 áudio opt-in ignorado não reexecutados nesta rodada. Compilação mantém avisos anteriores LNK4099/PDB OpenSSL e chunk>500KiB. Auditoria/consistência/guard aprovados. Testes de componentes/RPC fictícios não são jornada do instalador. Meta ativa.

## Incremento 0.2.52 — salvar comportamento com pedido curto

“Salvar comportamento”, “salve comportamento” e “salve o comportamento” preparam clique no botão disponível de criação ou de salvamento de versão da biblioteca. “Clicar em Salvar comportamento” também usa o alias. Continua exigida confirmação; duas ações correspondentes visíveis recusam ambiguidade. Fingerprint mantém o texto/registro/versão do botão real, não o alias: proposta feita em criação é recusada se o editor mudar antes da confirmação. Não há novo endpoint ou salvamento automático.

Jornada anterior adaptada para os pedidos curtos: reprodução antes da mudança falhou1/1 por ausência da prévia; após correção **7/7 testes de biblioteca em47,0s** aprovados, depois **49/49 interface/biblioteca em3,4min** após versionamento. Inclui concorrência de botões, troca de editor e criação/edição/seleção/salvamento pelo ID correto. **245/245 JS**, lint/build/guard/diff aprovados (cinco avisos de lint e chunk>500KiB anteriores). Revisão independente estática sem achado concreto; nenhum teste executado pelo revisor. Backend/captura fictícios, sem comprovar microfone físico. Incluído no pacote52 auditado acima, não instalado/publicado.

## Homologação após 0.2.51 — criar, editar e registrar comportamento na mesma jornada

Novo teste integrado atravessa criação natural do comportamento, confirmação da proposta sem escrita, salvamento pelo botão existente via voz, edição natural do item recém-criado, confirmação sem escrita e salvamento de versão. A retomada de sessão carrega v2; marcar pelo título resolve o ID recém-criado. Antes e depois de confirmar a seleção, o relógio avança800ms e exige nenhuma gravação do rascunho; “Clicar em Salvar rascunho” confirmado grava o ID. O histórico renderizado de outra sessão conserva o comportamento anterior e não recebe o novo item.

Não houve alteração funcional de produção nesta rodada. O fixture retorna cópias nas consultas: criação não modifica automaticamente os catálogos React, e a edição natural subsequente exige atualização do catálogo do router. Retomar a sessão remonta o componente e consulta novamente; não prova isoladamente refresh do editor anterior. Histórico fictício é de outro comportamento: não equivale a validar snapshots nativos do mesmo modelo após edição.

Tentativas: novo teste inicial1/1 em19,7s; ampliado com edição5/5 em40,2s. Fortalecimento que pressupunha autosave após confirmar seleção falhou1/5 (esperava1save, recebeu0), expondo expectativa incompatível com `voiceConfirmationPending`: o contrato pede salvamento explícito. Corrigida a expectativa no teste, não a produção. **Resultado final5/5 em40,0s**, revisão independente final sem achado impeditivo; 245/245 testes JS aprovados, guard/diff aprovados. RPC/relógio em memória, sem áudio capturado, instalação, banco nativo ou acesso a perfil. Meta ativa.

## Incremento após 0.2.51 — data com “em” na ocorrência

Iniciar, remarcar e cancelar uma sessão existente aceitam tanto “em DD/MM/AAAA” quanto “no dia DD/MM/AAAA”. O nome completo permanece exigido; datas incompletas/impossíveis, pacientes homônimos e conteúdo extra são recusados. Nomes cadastrados que incluem literalmente “em DD/MM/AAAA” não são truncados. O pedido continua sendo uma proposta: iniciar exige confirmação; remarcação/cancelamento apenas abrem seus formulários normais, sem salvar antecipadamente.

Teste novo reproduziu recusa antes da alteração (0/1), passou após a correção (1/1); suíte lógica final **245/245** aprovada. Build, lint e guard aprovados, com cinco avisos de lint e chunk>500KiB anteriores. Teste integrado novo verifica prévia, ausência de `session_draft_start` antes da confirmação, ocorrência exata após confirmar e ausência de criação de compromisso. Arquivo calendário **13/13 em1,1min** antes da correção de revisão; teste integrado novo reexecutado no snapshot final **1/1 em16,3s**. Não declarar nova regressão completa de 13 no snapshot final. Backend em memória; não equivale a teste do microfone físico. Incremento posterior ao instalador 0.2.51, ainda não empacotado. Nenhum perfil/dado real alterado. Meta ativa.

Revisão independente inicialmente encontrou que uma captura greedy absorvia alternativas, negações e segunda ação em nomes artificiais contendo comandos completos. Mantida a captura lazy original, com teste de recusa dos três casos e contrato completo do nome literal com data. Revisão final: dois testes focados aprovados e nenhum achado novo no diff restrito. As 546 probes e oito testes anteriores do revisor pertencem ao snapshot intermediário, não à revisão final. Sem ampliação de recovery ou compatibilidade.

## Entrega local 0.2.51 — retomada e bloqueio

Pacote `Círculo_0.2.51_x64-setup.exe`, **135.872.833 bytes**, SHA-256 `41a28cbfa5e30a5622e9135c933e97316fe9e5dd4ae00ffbc1f27d5b810f08a5`. Build NSIS offline/locked exit0; override temporário de updater removido após término e configuração oficial preservada. Auditoria `%TEMP%\\circulo-0251-audit-20261004.json`: PE0.2.51/x64/NotSigned. Conteúdo interno não extraído, pacote não instalado nem aberto nesta rodada; instalado permanece 0.2.47. Sem `.sig`, assinatura Authenticode, Release ou atualização publicada pelo GitHub.

Inclui os dois incrementos descritos abaixo: reutilização nativa do rascunho de uma ocorrência e invalidação das continuações antigas após bloqueio. **243/243 testes JS** e guard aprovados após mudança de versão. Regressão funcional final anterior: **59/59 E2E** e **86 Rust aprovados/1 áudio opt-in ignorado**; não reexecutados como jornada do instalador. Build Vite/Rust/NSIS aprovado, com avisos anteriores de chunk>500KiB e PDB OpenSSL LNK4099. Nenhum perfil alterado.

A habilidade de controle do Windows foi usada para verificar disponibilidade: importação de `@oai/sky` e listagem de janelas funcionaram; o Círculo não estava aberto. Não houve entrada de senha, controle de formulários ou captura física de áudio. Esta conexão não substitui validação do aplicativo instalado. Limitações de recovery/legados mantidas fora do escopo. Meta de melhoria contínua permanece ativa.

## Incremento após0.2.50 — continuação invalidada por bloqueio

P2 de lifecycle reproduzido com componentes reais/RPC fictício: Registrar sessão cria compromisso e aguarda refresh; backend informa bloqueado pelo evento focus; usuário desbloqueia manualmente; resolver ou rejeitar a consulta antiga fazia abrir Sessões e iniciar um rascunho sem nova confirmação. Testes integrados **0/2 antes**, ambos na asserção de manter Início após liberar consulta antiga.

Agenda guarda geração de montagem da criação e a invalida no cleanup; verifica depois de criar/atualizar/carregar e antes de iniciar. Isso mantém a criação já salva, mas não aplica continuação de componente desmontado. O início no Vault verifica geração/desbloqueio após savePending, RPC e refresh; resultados e erros antigos não reabrem editor, não anunciam sucesso e não liberam busy de operação nova. Limpeza do contexto libera busy do contexto invalidado para permitir desbloqueio novo sem esperar RPC antigo.

**2/2 focados após correção em20,6s;243/243JS**, build/lint/guard/diff aprovados com avisos anteriores. Quatro testes novos cobrem refresh resolvido/rejeitado após novo desbloqueio e RPC de início bem-sucedido/com erro após novo desbloqueio. **Regressão55/55 em2,5min** (calendário10, transições de voz7 e shell38). Após adicionar teste de busy durante desbloqueio novo, **cinco focados finais5/5 em27s** (busy+quatro lifecycle). Não declarar56/56 numa única rodada. Sem mudança Rust, perfil, microfone físico ou limpeza de recovery. Ainda posterior ao instalador50 e instalado47. Meta ativa.

Revisão identificou dois pontos adicionais: finally do chamador natural também liberava busy antigo; clearUnlockedState liberava busy durante confirmação/recuperação de restauração. Corrigidos com guard de geração no chamador e opção preserveBusy somente nos dois caminhos de restauração. Testes extras verificam pedido natural durante unlock pendente e controles desabilitados enquanto confirmação/status ou lista de pacientes da restauração aguardam. Primeiro focused4:3/4, pedido natural usava “em DD/MM” e foi recusado pelo vocabulário suportado; corrigido teste para “no dia DD/MM”, sem ampliar o parser. **Focused final4/4 em21,7s**, 243JS/guard reexecutados; revisão independente final sem achados nos dois pontos (seis probes de handlers, sem Playwright). **Regressão final59/59 em2,5min, exit0**, código estável (calendário12, transições7, shell40). Captura/RPC simulados, senha fictícia digitada manualmente. Nenhum arquivo de perfil acessado. A pendência histórica P2 deste fluxo está reproduzida e corrigida no código, não apenas encerrada por revisão estática. Consolidar com o retry nativo anterior no próximo pacote Windows.

## Incremento após0.2.50 — retomar após sucesso parcial

`draft_start` consulta os rascunhos da ocorrência antes de inserir. Um existente compatível é retornado sem alterar ID/conteúdo; dois existentes ou paciente incompatível são recusados, sem limpeza nem escolha automática. Sessão finalizada continua recusada. O fluxo público permanece dentro da transação e do mutex de operação do Vault. Teste nativo adicional usa banco cifrado em TempDir: duas chamadas por threads ao mesmo Vault retornam mesmo ID; salvar/bloquear/descartar instância/reabrir/desbloquear/iniciar novamente preserva ID/texto e uma linha.

Agenda passa a separar criação confirmada das atualizações auxiliares/calendário; o compromisso salvo é revelado e o início continua mesmo quando o refresh falha. Depois de obter rascunho e abrir Sessões, `startSessionFromAgenda` retorna sucesso mesmo se atualização auxiliar falhar, com aviso específico. Não são novas funções: correção do fluxo de voz/clique existente.

**243/243JS**, build/guard/lint exit0 (cinco avisos anteriores), **86Rust release aprovados/1 opt-in de áudio ignorado** em8,86s. Antes do teste cifrado adicional,85Rust/1ignored em8,93s; dois novos testes locais2/2 e cifrado1/1. Primeiro compile dos testes novos falhou porque unwrap_err exigia Debug em SessionDraft; corrigido somente na asserção (`err().unwrap()`), sem adicionar Debug ao tipo.

E2E iniciais de retry2/2 em26,3s; asserção fortalecida exige aviso do parent para provar que a falha atingiu refreshWorkspace, não apenas consulta child. Rodada ampliada **101/102 em5,7min**, um cenárioafter-start falhou nessa asserção. Armar falha somente após auto_backup_status ainda dependia de qual consulta child/parent chegava antes: repetição5/6 em52,2s. Fixture final rejeita todas as consultas indicator_catalog após armar até o teste observar o aviso do parent e liberar a falha. **Dois focados finais2/2 em26,2s; arquivo completo final6/6 em49,8s, exit0**. Não é uma rodada102/102: os outros arquivos foram aprovados na rodada ampla, sem mudança posterior de produção; só fixture de calendário e teste Rust adicional mudaram. Fixture de reutilização tem agora suporte equivalente confirmado pelos novos testes Rust; não é prova de GUI instalada/microfone físico. Incremento ainda não incluído no instalador50 nem no instalado47; nenhum perfil real alterado. Meta ativa.

Revisão independente não identificou bloqueio de atomicidade/corrupção. **P2 candidato de lifecycle**, próxima verificação: create/start não carregam a geração original por todos os awaits; um probe isolado invalidando contexto durante refresh rejeitado observou continuação antiga ou retorno/aviso de sucesso desatualizados. Navegação sozinha não prova cancelamento; bloqueio/desbloqueio pela UI ainda não reproduzido. Não é alegação de perda de dados, nem motivo para limpar registros. Exigir reprodução integrada antes de ampliar a correção. Revisão não executou Playwright nem alterou perfil/arquivos.

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
