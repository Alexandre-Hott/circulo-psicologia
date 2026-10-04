# Comparação de vocabulário de voz — 04/10/2026

O vocabulário experimental B foi rejeitado. Não houve mudança do prompt de produção, nova versão ou novo instalador: a entrega local continua 0.2.73.

## Execução e resultado

Uma rodada executou dez inferências: os mesmos cinco WAVs sintéticos preservados, uma vez com A e uma vez com B. A usa o prompt atual e o contexto Ana Clara; B acrescenta quatro cabeçalhos de comandos de sessão, sem inserir o conteúdo esperado. Todos os processos terminaram com código zero, sem timeout, erro de leitura ou UTF-8 inválido. Isso comprova execução e transporte, não fidelidade do reconhecimento.

| Pedido | A atual | B experimental |
| --- | --- | --- |
| Acrescentar observação | Falhou: “compidiu ajuda” | Falhou: “compidiu ajuda” |
| Acrescentar procedimentos | Passou | Falhou: perdeu paciente e conteúdo |
| Acrescentar resultado | Passou | Passou |
| Acrescentar encaminhamento | Falhou: “próxima seção semanal” | Falhou: perdeu paciente e conteúdo |
| Confirmar comando | Não avaliado sem proposta/contexto de interface | Não avaliado sem proposta/contexto de interface |

A teve dois aprovados, dois falhos e um não avaliado. B teve um aprovado, três falhos e um não avaliado. A grafia de alguns cabeçalhos melhorou em B, mas não trouxe ganho semântico. Não corrigimos nem reconstruímos o conteúdo reconhecido. O resultado é específico desse corpus; não estima precisão geral nem valida o microfone físico.

## Diagnóstico corrigido

O script de comparação passou a enviar os argumentos por response file UTF-8 sem BOM, com uma linha por argumento, e caminhos relativos ASCII para áudio e saída. A fonte PowerShell conserva seu BOM. Rejeita quebras de linha/NUL e UTF-16 inválido antes de criar o arquivo; não sobrescreve arquivo existente. O processo recebe somente `@arquivo`, com diretório de trabalho definido e janela oculta.

Os cinco WAVs foram copiados sem alteração; o script conferiu os hashes da origem e da cópia antes da inferência. O coordenador conferiu novamente os hashes dos originais após a rodada, sem mudança. Esta comparação usa o CLI diretamente; não exercita o decoder cfg(test) corrigido na 0.2.73. Não houve nova gravação, síntese ou resampling. A avaliação das transcrições foi repetida sem repetir inferências.

Os testes diagnósticos passaram 12/12; o conjunto JS passou 794/794. Esses números são posteriores à entrega 0.2.73 e não substituem seus resultados originais de 783 testes JS, Rust e interface. Nenhum novo teste Rust ou smoke instalado foi executado nesta investigação.

## Evidência local e próximo passo

Artefatos brutos e resumo: `C:\Users\alexandre\AppData\Local\Temp\circulo-whisper-prompt-ab-a4dafae93cc548b88482b0b6aa4d7deb`. Log: `C:\Users\alexandre\AppData\Local\Temp\circulo-prompt-response-ab-20261004.log`. São evidências locais temporárias, não arquivos publicados no repositório.

O próximo incremento aprovado é ditado direcionado aos quatro campos de texto da sessão: escolher o destino, falar somente o conteúdo, revisar e confirmar o acréscimo. A proposta preserva os contratos existentes de rascunho e salvamento. Ainda não há implementação validada nem medida de reconhecimento desse fluxo.

Senhas, seleção de arquivos, microfone físico e validação instalada continuam com suas limitações já registradas. Limpeza de recovery e compatibilidade com backups antigos permanecem fora do escopo. Não foram usados dados reais nem alterado o perfil instalado.
