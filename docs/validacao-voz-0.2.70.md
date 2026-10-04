# Validação de voz 0.2.70 — 04/10/2026

## Escopo

Paridade de conteúdo multilinha nos quatro textos de sessão: observação, procedimentos, resultado e encaminhamento. Rota natural para preencher/acrescentar e rota genérica para o textarea real do rascunho. Sem comando de “nova linha”, sem ampliação de outros campos, banco ou cofre. Cabeçalho, nome do paciente e consulta de campo precisam ocupar uma única linha; quebras dentro do texto são literais.

O parser conserva LF/CRLF; textarea/composer no navegador converte CRLF para LF conforme o comportamento nativo. Confirmação, identificação do rascunho e salvamento continuam separados.

## Evidência intermediária

Reprodução executada no parser da 0.2.69: uma observação com espaço entre frases prepara append; o mesmo payload com LF é recusado. RED inicial50: 1 aprovado, 49 falhos. Depois o mock genérico foi alinhado aos IDs reais e ao form#session-draft com record, e cinco guardas extras foram acrescentadas.

Focal executado pelo principal: 183/183 aprovados (55 multiline + 85 central + 25 append + 18 limites). npm test 0.2.70: 448/448 aprovados. Rust release/offline/locked: 86 aprovados, 0 falhos, 1 ignorado, 8,64 s. O opt-in ignorado não é comprovação do microfone físico.

Regressão intermediária selecionada: **136/136 passaram em13,9min, exit0**, porta5215, Edge headless, worker único, sem retry. Handle principal34886 terminal. Inclui multiline16, append19, replay sintético4, limites11, autosave1 e interface85. Não é a suíte E2E integral nem a rodada final depois do ajuste de orçamento. Hashes de produção permaneceram: router1DB4BE9CCB63B4529C404D91D33E770A7B2D0893B672B9819AAE353F2DD5538C e gatewayFC85BD42D2F6D3F1F9E4CAA5BE53C4AA4BC626C92E1286C4FF915AC0FA537E00.

Revisão identificou pendência real: a guarda de4600 descontava whitespace final do payload literal ao usar trim. RED de orçamento18: 10 aprovados/8 falhos, confirmado pelo principal. Reproduzível com Ana Clara, espaços horizontais válidos no cabeçalho, payload menor ou igual4000 e término LF mais dois espaços: 4601 unidades consumidas viravam4598 após trim. Após a saída136, uma linha foi corrigida para medir rawText.length; trim externo unilinear mantido. Budget18/18 e npm test final467/467 passaram. Revisão independente estática aprovou o ajuste. Não houve inferência ou truncamento de texto para caber.

Rodada focal final: **51/51 passaram em2,9min, exit0**, porta5216, handle21239 terminal, no código congelado: multiline16, append19, replay4, limites11 e autosave1. Hashes finais conferidos após testes/build: router9E11688E7BE40981DB8472BCE0EC930073DAF6B6867581B2470D67D005CE8966; gatewayFC85BD42D2F6D3F1F9E4CAA5BE53C4AA4BC626C92E1286C4FF915AC0FA537E00. São duas rodadas separadas:136 intermediários e51 finais, não uma única execução de187 nem regressão E2E integral.

Lint final exit0 com oito avisos anteriores, sem novos; guard do repositório, diff-check e sintaxe do novo E2E aprovados. Depois da saída51 foram retiradas somente duas constantes sem uso do teste, sem alterar asserções ou produção. Consistência do instalador/documentação aprovada pelo verifier; ele não confirma instalação ou conteúdo interno.

## Comparação de vocabulário Whisper

Experimento A/B apenas diagnóstico; fonte Rust e modelo mantidos. Mesmos cinco WAVs SAPI fictícios preservados da69, sem novos áudios. A usa prompt atual com Ana Clara; B adiciona somente vocabulário de acrescentar observação/procedimentos/resultado/encaminhamento.

Primeira rodada: dez chamadas encerraram com0xC0000409 sem transcrição. Caminho acentuado dos recursos foi fator suspeito; registros preservados em C:/Users/alexandre/AppData/Local/Temp/circulo-whisper-prompt-ab-1f95458572d948a0be663820beac0638. O harness foi ajustado para hardlinks ASCII, como o backend existente.

Segunda rodada: dez chamadas CLI exit0, sem timeout, originais intactos. A levou7,995s; B8,480s. O wrapper não produziu avaliação automática válida: PowerShell serializou metadata da string e gerou resumo excessivo; foi encerrado somente após todas as dez inferências. Resumo recuperado: C:/Users/alexandre/AppData/Local/Temp/circulo-whisper-prompt-ab-aadf3b4451f143ad8921fe7aaa98582e/recovery-summary.json.

Contra as intenções clínicas originais, A com trim externo nativo dá2 aprovados/2 falhos/1 não avaliado. B contém bytes UTF-8 inválidos nos arquivos1,2,3; o backend Rust recusaria esses arquivos ao ler string UTF-8. U+FFFD no resumo é visualização dos bytes inválidos, não reparo clínico. Portanto B não demonstra melhoria utilizável e não será colocado em produção nesta etapa. Nenhuma rodada adicional de inferência autorizada.

Diagnóstico foi corrigido depois das duas rodadas, sem reexecutar inferência: JSON com strings simples, leitura UTF-8 estrita e hashes dos arquivos brutos. Unidade do leitor/sintaxe passou1/1 no principal. Não é teste completo do diagnóstico corrigido nem nova transcrição. Avaliações recuperadas e falhas dos wrappers continuam preservadas; script não modifica os WAVs nem o perfil.

## Pendências da meta completa

Esta etapa cobre os quatro textos da sessão, não universalmente todos os textareas. Inspeção atual encontrou outros campos que permitem multiline pela interface mas ainda ficam fora do gate genérico: descrição de comportamento (1000), demanda/objetivos do contexto (4000), nota do indicador (500), adendo (4000) e motivo administrativo (240). O próximo incremento deve estender a paridade sem alterar limites ou handlers de persistência.

Mudança direta Ana→Bia é protegida pelo epoch ancestral do main. A revisão estática aponta uma pendência distinta a reproduzir: preparar preenchimento de contexto para Ana, selecionar Bia, voltar a Ana e aplicar a proposta antiga. O epoch textual pode voltar ao valor anterior, sem representar o novo ciclo de carregamento. Não é evidência de gravação em Bia nem foi executado na UI. Identidade/epoch de ciclo dos editores precisa de teste concreto antes de implementação.

## Entrega local

[Instalador Windows x64](../src-tauri/target/release/bundle/nsis/Círculo_0.2.70_x64-setup.exe):135.882.543 bytes, SHA-256 `a309ceeea91a4304398b293b92f8b8511b9cd59a2a4ccdfa9dddcd0c95277c17`. Build NSIS offline/locked exit0; compilação Rust1m13s. Override externo temporário foi retirado após a saída terminal; configuração oficial do updater preservada. Avisos anteriores de chunk maior que500KiB e OpenSSL-PDB presentes.

Auditoria de metadados: PE0.2.70, x64, NotSigned, manifest C:/Users/alexandre/AppData/Local/Temp/circulo-0270-audit-20261004.json. Conteúdo interno não extraído. Pacote não instalado/executado nem publicado como Release; sem assinatura updater/Authenticode. Instalado permanece0.2.61 e perfil cifrado preservado. Meta ativa. Microfone físico e jornada instalada permanecem sem validação nova.
