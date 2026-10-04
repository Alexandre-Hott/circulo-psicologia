# Validação do assistente de voz 0.2.71

Esta rodada amplia o preenchimento por comando aos campos de texto já existentes e impede que uma proposta pendente seja aplicada depois de trocar ou reabrir o editor. Usa somente dados fictícios; não modifica o backend, o cofre, o modelo de reconhecimento ou os handlers de salvamento.

## Campos e confirmação

O comando genérico `Preencher nome do campo com texto` aceita conteúdo multilinha na descrição do comportamento (1000 unidades UTF-16), demanda e objetivos do contexto (4000 cada), nota do indicador (500), adendo (4000) e motivo administrativo (240). Os quatro textos do rascunho de sessão continuam disponíveis. Os limites existentes não foram ampliados. Cabeçalho e nome do campo precisam ocupar uma linha; o conteúdo é literal. O navegador converte CRLF para LF no composer e nos textareas.

Preparar mostra a proposta; confirmar aplica ao formulário atual. O salvamento segue o fluxo existente. A nota genérica de indicador mantém o autosave existente de 600 ms após a confirmação; não deve ser apresentada como um campo sem autosave. Nos demais novos editores, aplicar não salva automaticamente. Senhas e seleção de arquivos continuam manuais.

## Identidade do editor

A aplicação compara a cadeia `data-voice-lifecycle` dos ancestrais, além do record e da versão existentes. Os ciclos identificam troca de área ou paciente, fechamento, reabertura, cancelamento, reinicialização e recarga do mesmo paciente. A versão da biblioteca não oculta o ciclo do pai. O contexto fica desabilitado enquanto os dados do paciente estão carregando. Uma proposta antiga exige novo preparo; não é reaplicada ao retornar ao mesmo ID.

## Testes executados

Antes da implementação, a suíte unitária nova teve 200 aprovados e 81 falhos em 281 casos: os seis campos ainda eram recusados pelo gate dos quatro textos clínicos. O teste de interface reproduziu preenchimento indevido após Ana → Bia → Ana, cancelamento/reabertura do mesmo comportamento e cancelamento/reabertura do mesmo adendo. O controle direto Ana → Bia passou. O caso inicial de agenda falhou no seletor duplicado do teste; após limitar o seletor ao calendário do dia, uma execução separada reproduziu o preenchimento indevido do motivo após fechar/reabrir o mesmo compromisso. Essa falha de seletor não foi atribuída à produção.

Após a primeira correção: 11/11 testes de interface passaram em 49,5 s, Edge headless, worker único, sem retries. A revisão seguinte apontou que a recarga do mesmo paciente precisava invalidar também o ciclo de Sessões. Esse caminho foi corrigido e ganhou um teste adicional; os 11 casos anteriores não comprovavam esse caminho.

No código final congelado: `npm test` passou 773/773; Rust release/offline/locked passou 86 testes, com zero falhas e um opt-in ignorado, em 11,44 s. Lint passou sem erros e com os oito avisos anteriores, sem avisos novos. Revisão estática independente aprovou os guards.

A regressão selecionada terminou com 147 aprovados e um falho em 148 casos, em 14,7 min, Edge headless, worker único, sem retries. A única falha foi a expectativa antiga de recusar multiline na descrição da biblioteca, agora elegível por requisito desta rodada. Apenas esse caso foi ajustado: título INPUT recusado e descrição literal somente após confirmar, sem writes. A repetição focal final passou 28/28 em 1,4 min, sem alterar produção; inclui os 16 casos clínicos multilinha, seis de lifecycle e seis novos textareas. São duas execuções separadas, não uma rodada de 175 casos nem uma regressão integral.

O teste adicional de reload do mesmo paciente passou na rodada ampla e na focal; não foi reproduzido como RED antes da correção. Os quatro arquivos de produção permaneceram com os mesmos hashes durante os testes e o build. Hashes SHA-256: gateway `27BFC3A5BC5DE18CCE120C8B96BFEB388CBB57E62D451402FDF702C6D37899F1`; DesktopVault `5A47E9F3DF05EC03E04EB6CF690873E384A36B65A522D390FBBEDBA6A5DEA8B5`; DesktopSessions `7B01D14805916E7925F739BC28FBA7CC37A4BE40F2CD27D17EFA26F7793C5DC0`; DesktopAgenda `9F4F228C0273F24DAF4D7AE1BCC7EA976BBD69CBAC4F19588D5C10F886ECFBFB`.

## Limitações da evidência

Os testes de interface usam a aplicação e os editores reais com IPC simulado. Não comprovam microfone físico, instalação, persistência no perfil instalado ou reconhecimento correto de todas as frases. Não houve nova inferência nativa nesta rodada. As falhas de reconhecimento sintético e de codificação do diagnóstico anterior permanecem registradas na validação 0.2.70; o vocabulário experimental não foi adotado.

Um probe separado, sem inferência nem novos áudios, comparou PowerShell e Rust com o mesmo prompt fictício. Ambos terminaram com exit0 e preservaram os mesmos 448 bytes UTF-8 na command line Unicode; a entrada narrow do probe recebeu 433 bytes CP1252, incluindo E3 isolado em “sessão”. O CLI local usa a mesma família de APIs UCRT narrow-argv e não declara activeCodePage UTF-8 no manifesto. Isso sustenta uma hipótese de transporte para a saída inválida anterior, mas não observa a tokenização do Whisper nem prova causalidade na ASR. Evidência local: C:/Users/alexandre/AppData/Local/Temp/circulo-argv-probe-1791104530127-58221a55/audit-evidence.json. Nenhuma conversão dos bytes da transcrição, mudança global do Windows ou troca de modelo foi feita.

A [fonte oficial do CLI 1.9.1](https://github.com/ggml-org/whisper.cpp/blob/v1.9.1/examples/cli/cli.cpp#L899-L938) oferece leitura de argumentos por arquivo, uma linha por argumento. É uma alternativa a verificar para transportar o prompt UTF-8 sem passar os acentos pelo argv narrow. Essa alternativa ainda não foi implementada no aplicativo e não é resultado de ASR.

O pacote instalado continua na 0.2.61 e o perfil cifrado não foi alterado. Limpeza de recovery e compatibilidade com backups antigos continuam fora desta etapa. A meta completa permanece ativa: esta rodada não declara cobertura universal nem publicação de Release ou assinatura de atualização.

## Instalador para teste local

[Instalador Windows x64](../src-tauri/target/release/bundle/nsis/Círculo_0.2.71_x64-setup.exe): 135.877.711 bytes, SHA-256 `da0f5b71b1079f3e4f074f2cc87071b3aa51989f7bf909f5c68a4d6c4d09bc6e`. Build NSIS offline/locked exit0; compilação Rust em 1 min 01 s. Aviso anterior de OpenSSL sem PDB permanece. O override externo temporário foi removido após o build terminar; configuração oficial do updater preservada.

Auditoria de metadados aprovada: PE 0.2.71, x64, NotSigned. Manifest local: C:/Users/alexandre/AppData/Local/Temp/circulo-0271-audit-20261004.json. Conteúdo interno não extraído; instalador não executado ou instalado. Sem assinatura de updater/Authenticode e sem publicação de Release. É uma entrega local para teste com dados fictícios, não download novo no GitHub nem homologação do microfone.
