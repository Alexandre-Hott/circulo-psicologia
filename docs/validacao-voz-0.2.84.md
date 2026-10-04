# Validação de voz do Círculo 0.2.84

Esta entrega inclui a [correção da confirmação digitada](voz-confirmacao-digitada.md): “Confirmar.” não apaga a proposta antes da aplicação explícita. O [instalador para Windows x64](../src-tauri/target/release/bundle/nsis/Círculo_0.2.84_x64-setup.exe) foi gerado para teste local com dados fictícios. Tem 187.080.647 bytes e SHA-256 `280fed1625ece9ddbb91f9b77dfa91cc6c6be57ac90e64e1903dcb87efb1bdcb`. Não foi instalado, executado, assinado ou publicado. O fechamento funcional das oito áreas e seus limites estão registrados abaixo.

## Reconhecimento de quatro pedidos

Uma rodada opt-in pelo backend Rust real transcreveu os quatro WAVs fictícios novos, sem retries. O processo supervisionado do principal usou count4, recursos locais explícitos, release/offline/locked, captura de stdout/stderr por bytes e limite global de 600 s, com 60 s por chamada no backend. Terminou com código zero em 31,443 s; compilação 12,74 s e teste 18,34 s. Uma tentativa anterior de abrir o processo foi rejeitada por diretório de trabalho inválido antes de executar o script ou criar o claim; não houve rodada nativa anterior ou repetida.

| Pedido pretendido | Texto Rust bruto | Resultado estrito |
| --- | --- | --- |
| Criar comportamento Espera a vez | Criar comportamento. Espera a vez. | Falha literal: o título criado seria “Espera a vez.”, com ponto |
| Editar comportamento Pede ajuda | Editar comportamento pede ajuda. | Intent completo correto, ID help único |
| Abrir análises | Abrir análises. | Intent completo correto, destino analytics |
| Clicar em Registrar sessão | Clicar em Registrar Sessão. | Não avaliado pelo parser puro; replay posterior abriu somente o formulário rápido |

O harness passou, mas isso não equivale a quatro ações corretas. A avaliação pura estrita deu dois aprovados, um falho e um não avaliado, decisão semântica 2; a chamada PowerShell retornou código 1. O ponto no título foi preservado, não removido para obter acerto. Um avaliador preliminar que normalizava nomes/títulos foi rejeitado e não executado; permanece como artefato histórico. O novo usa igualdade profunda de todas as chaves/valores dos três intents, confere bytes com o único marker e só tolera caixa/pontuação terminal na comparação textual do quarto comando.

Os textos Unicode/codepoints foram registrados antes da síntese. A geração anterior teve quatro Speak, zero retries e sinal PCM22050 mono16 não zero, com durações 2,30 a 3,69 s. A auditoria independente confirmou os 43 pins antes/depois: cinco fontes, 19 recursos, três referências e oito históricos nas duas localizações. O principal conferiu novamente fontes, recursos e WAVs antes/depois da inferência. A mudança posterior de metadados para 84 não alterou essas fontes funcionais. Não há latência por caso nem logs internos Whisper.

Artefatos em `C:\Users\alexandre\AppData\Local\Temp\circulo-trusted4-short-d9e220c93018447387a8e0424a348ce5\results`: stdout `A8BCC868616134CB8416F4E64D1ABFC827877652291D3F86E8C08C33D7FF4AA9`, stderr `65523252DC695ACAA878E5D97C480A68A0018EAE69F21884D1723F26628F9DFC` e relatório estrito `DE49F084E3DDBE2A78CE7F55126B7B7F76E71A812942DA8C59A6FCCEBCCC97A7`. Entrada extraída do marker `6127189F601815D2429612E3225745CA456E8AE17B7227DB827241085E2184DE`; avaliador estrito `286E6EC331DB45192DA3AD024AEFFFF58C9B47688D902C96FC23DA1AF1382B0A`.

## Replay dos textos na interface

Após o build, os quatro textos Rust intactos passaram4/4 na UI do autor em23,9s e4/4 na conferência do principal em23,7s. Rodadas separadas, um worker e zero retries, portas5263/5264. A proposta só abre formulário ou espaço depois do segundo áudio “Confirmar comando.”, reutilizado da rodada Rust fresca anterior de oito áudios; isso não é outra inferência. O formulário de criação conserva literalmente “Espera a vez.”, a edição abre somente help/v1, Análises consulta os filtros exatos e Registrar sessão abre somente Novo compromisso/Avulsa. Catálogo, pacientes e rascunhos concorrentes ficam iguais, sem Save ou outra gravação. Recursos e buffers da captura foram encerrados/zerados; não houve tráfego externo inesperado ou janela nativa.

A primeira rodada do autor passou três casos e falhou na expectativa de uma única leitura analítica; a aplicação fez duas consultas idênticas. Somente o teste foi ajustado para exigir ao menos uma consulta e validar cada payload integralmente. Revisão estática independente aprovou fixture, leitura das props atuais sem callbacks e os quatro cenários. O replay passou, mas não transforma a divergência literal do reconhecimento em acerto; o relatório puro original2/1/1 permanece intacto. Não houve mudança de produção ou outro build por esse replay.

- Fixture de transcrições: `07FF18B9C6405EA68352BAA4AE14A683981681300A2FF32B9A8562C0AB895C7C`.
- Replay da interface: `C9672580C62CA86ED4C0E97C6D0E58D65AE4D7D540895B280FCE22DE629EBD13`.

## Correção explícita do título

Uma prova adicional usa o formulário aberto pelo texto Rust bruto “Criar comportamento. Espera a vez.”. Digitar “Preencher Título descritivo com Espera a vez” e preparar mantém o título original com ponto. Confirmar altera somente o campo para “Espera a vez”, sem salvar ou escrever no catálogo. Descrição, pacientes e rascunhos concorrentes permanecem iguais. A correção é digitada pelo usuário; não é nova inferência nem reparo automático do corpus.

O caso focal passou 1/1 no autor em 19,4 s. A conferência independente do principal passou os cinco casos do arquivo em 24,7 s, com um worker e zero retries. Revisão estática aprovada; fixture de transcrições intacta. O arquivo de teste após a adição tem SHA-256 `1320CF4C5DE580AE0F6F1AFAF1DB66C81C200B2519DBF9AE46BA528A04A52D88`; o hash anterior acima identifica a prova original de quatro casos. Cleanup de captura e ausência de escrita foram exigidos. Sem mudança de produção, novo build, acesso ao perfil instalado ou nova ASR. O relatório estrito original continua dois aprovados, um falho e um não avaliado.

## Testes e pacote

### Comando falado de correção

Uma nova amostra independente disse “Preencher Título descritivo com Espera a vez”. Houve uma síntese Maria/rate0 e uma inferência pelo backend Rust real, sem retries. Texto, codepoints e hash foram conferidos antes de Speak; o WAV PCM22050 mono16 tem 4,584 s e sinal não zero. O processo nativo terminou com código zero em 6,165 s, incluindo compilação de 0,77 s e teste de 5,27 s. Usou release/offline/locked, count1, recursos locais explícitos, captura dos logs por bytes e limite externo de 120 s. Os 26 pins de fontes, recursos e referências permaneceram iguais antes/depois.

A transcrição bruta foi “Preencher título descritivo com espera a vez.”. O comando resolve o campo correto e prepara o valor literal “espera a vez”. A rota funcional passou, mas a fidelidade literal ao valor pretendido “Espera a vez” falhou pela inicial minúscula; não houve reparo ou normalização para declarar acerto. O replay exige que preparar conserve “Espera a vez.” e que um quarto áudio de confirmação altere somente o campo. As confirmações são da referência nativa anterior, não novas inferências. Zero Save ou IPC de escrita, descrição e registros concorrentes preservados.

O novo caso focal passou 1/1 no autor em 18,7 s. O principal conferiu os seis casos do arquivo em 28,4 s, todos aprovados, com um worker e zero retries. Revisão estática aprovada. Fixture nova `D7BF08877009C8B92919437BC10353D9AC76349A3F22B05E9A69CE6B3173AF06`; arquivo de replay após a adição `196ED603099DBFA25574BA536A79A24348D29DD7E7D524DFD32945CAC25A3DE0`. Corpus e relatório originais de quatro pedidos continuam intactos. Sem mudança de produção, novo build, acesso ao perfil instalado ou prova de microfone físico.

Artefatos da amostra em `C:\Users\alexandre\AppData\Local\Temp\circulo-trusted1-title-correction-9adc56aa09f544c1bfba33940a368270`: WAV `4D7FF90FFD4CC750DCA95BF0C0FB7F6F66CF6942E2D74753E2C20CAB2A8691C5`, stdout bruto `E8D2EC8FDB21210EAC1C10AB9BC2D96DF36084642437391C81CFBCE164734B19` e stderr `FE5ABFDB9EDDE6AF265027228E57CA15FAB07BAB03482FD81E0DD080F2D677B1`. A síntese supervisionada terminou com código zero em 2,150 s, sob limite externo de 30 s, sem erro de cleanup.

### Pacote e regressões anteriores

Com metadados 84, JavaScript passou 1891/1891 em 5,47 s; Rust release/offline/locked passou 138 testes e ignorou o opt-in, em 11,57 s. Esse opt-in foi executado separadamente na rodada de quatro áudios descrita acima, antes da atualização mecânica. A confirmação foi previamente conferida em 25/25 de assistente e 26/26 de ditado, em rodadas separadas; o fluxo rápido de sessão passou14/14 no arquivo de calendário. Esses testes usam mídia/IPC simulados, não nova inferência.

Build Tauri/NSIS release/offline/locked terminou com código zero e compilação release em 56,38 s. Usou --no-sign e override temporário externo para desativar somente os artefatos assinados do updater; o override foi removido. A configuração oficial do updater, endpoint e chave pública permanecem iguais; nenhuma chave privada foi acessada. Avisos anteriores de tamanho do bundle e PDB OpenSSL permanecem.

Auditoria de metadados em `C:\Users\alexandre\AppData\Local\Temp\circulo-0284-audit-20261004.json`: PE0.2.84, Authenticode NotSigned, alvo declarado do aplicativo x64. O stub NSIS é distinto do executável do aplicativo; o conteúdo interno não foi inspecionado. Sem instalação, execução, desinstalação ou publicação em Releases desta versão. Perfil e aplicativo instalados preservados.

## Fechamento funcional das oito áreas

A expansão das ações existentes usa pedidos naturais, comandos sobre controles visíveis e o dispatcher do ditado, em português. A auditoria de fonte confrontou os controles habilitados com essas rotas; a execução conferiu identidade, conteúdo, confirmação e preservação dos registros concorrentes. Não se conclui cobertura só pela existência de testes ou pela ausência de uma lacuna estática.

O principal executou 40 casos selecionados de nove arquivos: todos passaram em 5,6 min, com um worker e zero retries. Os hashes dos 73 arquivos de fonte e dos nove arquivos de teste permaneceram iguais antes/depois, comparados por caminho e hash. A primeira comparação por ordem da enumeração diferiu; a conferência por caminho confirmou zero arquivos adicionados, removidos ou alterados. A tabela relaciona os requisitos às provas executadas e aos mecanismos existentes, não a todas as combinações de estados ou frases.

| Área | Ações conferidas nas jornadas e provas específicas |
| --- | --- |
| Assistente e navegação | Preparar, confirmar, invalidar proposta antiga, escolher destinos, separar comando e trecho, limitar conteúdo e liberar captura |
| Pacientes e vínculos | Cadastro, edição, busca, arquivamento/restauração, vínculos e seleção de homônimos com ID/revisão exatos |
| Agenda | Compromisso avulso e recorrente, detalhe correto, criação/início rápido, remarcação, cancelamento e encerramento de série |
| Sessões | Iniciar/retomar, quatro campos literais, salvar/finalizar, cancelar e preservar os demais rascunhos |
| Biblioteca e indicadores | Criar/editar comportamento reutilizável, selecionar/desmarcar, registrar/limpar valor e nota, manter versão e concorrentes |
| Contexto e evolução | Revisão do paciente correto, adendo, consulta/âncoras e exportação após aviso explícito |
| Análises | Paciente, datas, presets e retry com filtros exatos, sem escrita clínica |
| Cofre e Ajustes | Criação/desbloqueio com senha manual, bloqueio, cópia automática, backup portátil, recuperação e updater com confirmação |

Arquivos da seleção: [jornadas principais](../test/e2e/desktop-voice-primary-journeys.spec.js), [jornadas secundárias](../test/e2e/desktop-voice-secondary-journeys.spec.js), [controles residuais](../test/e2e/desktop-voice-residual-controls.spec.js), [navegação do rascunho](../test/e2e/desktop-voice-draft-navigation-pcm.spec.js), [calendário](../test/e2e/desktop-voice-calendar-controls.spec.js), [ditado local](../test/e2e/voice-dictation-local-controls.spec.js), [updater](../test/e2e/desktop-voice-updater.spec.js), [Ajustes](../test/e2e/desktop-voice-settings.spec.js) e [confirmação](../test/e2e/desktop-voice-routing.spec.js). A seleção executou os quatro primeiros arquivos completos; nos demais, os casos essenciais descritos na tabela. As provas específicas anteriores de datas, opções, homônimos, textareas e lifecycle permanecem complementares.

O backup portátil recebeu uma única jornada PCM nova. Três focais preliminares falharam por semear um paciente depois da carga do catálogo, não redigitar a senha limpa após cancelar a criação e usar “Confirmar comando.” no aviso que exige “Confirmar” ou “Voltar”. Somente o teste foi ajustado; o primeiro focal verde passou 1/1 em 21,3 s. A criação nessa jornada aciona o handler e cancela o chooser: não prova arquivo criado no Windows. Senhas e escolha de arquivo continuam manuais; o mock de restauração é sintético.

A revisão encontrou um P2 na prova: o mock compartilhado permitia efeitos de outras funções. Após os 40 casos, foi acrescentada uma guarda exclusiva do modo PCM que só permite leituras e os três handlers portáteis, rejeitando outros efeitos antes de executá-los. A revisão fechou o P2; focal reforçado 1/1 em 21,9 s no autor, seguido de 26/26 no arquivo completo de Ajustes em 1,7 min no principal. O modo legado permanece intacto. Esses resultados são rodadas separadas: os 40 casos pertencem ao hash anterior de Ajustes `1C3A11C9AA3A922844B1A7E2E01A5390695DDA0E2007F8615375A6278B6AB442`; os 26 ao hash final `50FF887A6B93E03C50224D0B89CA593436AB9738D13C276DDAE77BD739DBB087`. As demais fontes/testes mantiveram seus hashes; o hash final foi conferido antes/depois da rodada de 26.

JavaScript foi novamente executado com código zero, sem nova contagem preservada na saída. Rust release/offline/locked passou 138 testes e ignorou o opt-in, em 8,61 s. Nenhuma nova ASR, síntese, mudança de produção, instalação, acesso ao perfil ou publicação ocorreu neste fechamento. O hash do instalador84 foi revalidado; não há motivo funcional para outro build somente por testes/documentação. A cobertura funcional das ações existentes fica sustentada por esses resultados, pelas provas específicas anteriores e pelos mecanismos N/G/local auditados, com as exceções abaixo.

## Limites da entrega

Os quatro textos Rust foram conferidos na interface; a diferença no título permanece como limitação explícita. Reconhecimento nativo e aplicação UI são provas separadas; não há homologação de microfone físico, precisão geral ou execução de todo botão em todo estado. Senhas, seletores de arquivos e início explícito do áudio permanecem manuais. Limpeza de recovery, backups antigos e novas funcionalidades clínicas ficaram fora do escopo. Instalação física e assinatura/publicação não foram realizadas. Esta entrega permite testar a expansão funcional com dados fictícios; não constitui aprovação para atendimento clínico real ou garantia de transcrição correta. Revise o conteúdo antes de confirmar e salvar.
