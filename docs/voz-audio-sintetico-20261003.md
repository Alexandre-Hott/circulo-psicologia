# Áudio sintético offline — 03/10/2026

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
