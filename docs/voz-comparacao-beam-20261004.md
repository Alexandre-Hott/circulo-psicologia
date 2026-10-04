# Comparação da configuração de voz em 4 de outubro de 2026

A configuração candidata produziu a intenção esperada em seis dos sete pedidos avaliáveis, contra cinco da configuração atual. Corrigiu a observação de sessão sem perder os cinco acertos anteriores e com aumento de aproximadamente4,8% na mediana de resposta. O agendamento recorrente ainda falhou. O resultado permite testar a integração, não afirma que o aplicativo ou o instalador0.2.81 já tenham essa melhora.

## Método e resultado

Foram16 chamadas seriais à CLI local, sem retries, usando os mesmos oito WAVs fictícios preservados. A manteve os argumentos atuais; B acrescentou somente `--beam-size 8`. A ajuda do executável local confirmou o padrão5. Modelo small Q5, executável, DLLs, prompt, nomes, áudio e transporte UTF-8 permaneceram iguais, exceto os nomes necessários dos arquivos de entrada e saída. Não houve síntese, download, microfone físico, perfil instalado ou alteração de código funcional.

| Medida neste corpus | A atual | B candidata |
| --- | --- | --- |
| Pedidos com intenção e destino corretos | 5 de7 | 6 de7 |
| Pedidos falhos | 2 | 1 |
| Corpos clínicos literalmente corretos | 3 de4 | 4 de4 |
| Mediana por inferência | 4,6245s | 4,8445s |
| Maior duração por inferência | 4,824s | 5,166s |

A reproduziu os oito textos e resultados anteriores, sem divergência. B preservou cadastro, registro de comportamento, procedimentos, resultado e encaminhamento. Na observação, A retornou “compediu ajuda.”; B retornou a instrução completa com o corpo literal “pediu ajuda.”. O parser não corrigiu ou reconstruiu nenhuma fala. O pedido recorrente permaneceu recusado nos dois braços. “Confirmar comando.” foi reconhecido textualmente em ambos, mas não é contado como execução funcional: não havia proposta de interface para confirmar.

Todos os16 processos nativos terminaram com código0, saída UTF-8 válida e sem timeout. O runner terminou com código0 em80,152s; o avaliador aprovou os gates definidos antes da execução: corrigir pelo menos uma falha, preservar os cinco acertos, mediana B até1,5vezes A, máximo B até12s e confirmação textual correta. Não interpretar o sucesso dos processos como oito pedidos corretos.

## Integridade e limites

O runner exige oito pares A/B, com16 resultados únicos e ordenados, oito por braço. Compara intents completos, IDs, datas, horários, snapshot e corpo clínico exatos; a normalização restrita dos rótulos de nomes não altera conteúdo clínico. Os argumentos foram escritos em response files UTF-8, e a execução tem claim exclusivo, limite16,60s por processo e600s global, com parada no primeiro erro de execução ou integridade. Um segundo lote não foi autorizado.

Foram conferidos79 arquivos de fontes/configuração atuais,19 recursos e oito WAVs antes e depois. O staging contém somente CLI, small Q5 e14 DLLs; o base histórico não foi utilizado. Artefatos preservados em `C:\Users\alexandre\AppData\Local\Temp\circulo-beam8-ab8-16e803d4e4ab4909be35af374af41ca5\results`, incluindo textos brutos, argumentos, logs, latência por caso, avaliação semântica e hashes. Runner congelado: SHA-256 `6855C5A0844C1CA135A4B7660D62890B52E6D3373BD415C98480A7B06EA15025`,142 linhas,12.871 bytes.

A preparação anterior falhou ao montar a chamada JavaScript por conflito com um backtick PowerShell, antes de gravar ou executar o runner. Após corrigir a gravação, AST e preflight sem `-Run` passaram; não houve claim ou inferência nessas tentativas. A rodada registrada acima foi a única execução autorizada.

Esta prova usa a CLI e o parser atuais, não o novo argumento integrado ao backend Rust ou aplicado na interface. Ainda faltam aprovação com entrada confiável, contratos de integração aprovados, prova Rust com os áudios, confirmação e revisão pela interface e pacote atualizado. Não houve novo instalador, assinatura, publicação ou alteração do aplicativo instalado. A amostra sintética não estima precisão geral nem homologa microfone físico. Senhas e seletores continuam manuais; limpeza de recovery e compatibilidade com backups antigos não foram investigadas.

Os contratos candidatos foram preparados como testes em andamento, sem modificar produção. A execução Node teve sete aprovados e dois falhos entre nove; a rodada Rust filtrada teve13 aprovados e seis falhos entre19. As falhas exigem os15 argumentos candidatos, enquanto o backend e o script atuais ainda têm os13 originais. Uma execução focal Node confirmou `13 !== 15`, com um aprovado, dois falhos e seis ignorados pelo filtro. Essas rodadas não executaram reconhecimento e não são regressões novas no instalador81; a mudança candidata permanece pendente, sem autorização de produção.

A origem da pronúncia estranha dos três áudios mais antigos ainda é incerta. O relatório original contém corrupção na leitura ou captura de texto, mas o histórico revela uma falha independente possível antes do SAPI: o script do commit `d1ecb1c` não tinha BOM UTF-8 e lia transcrições sem encoding explícito; `52b92b6` corrige ambos. Se o primeiro script foi lido como ANSI/CP1252 pelo PS5.1, o literal “sessão” poderia chegar à síntese com caracteres indevidos, incluindo o símbolo de libra. Os WAVs precedem o primeiro commit; falta snapshot contemporâneo do script/host e do texto pré-`Speak()`, portanto essa origem é plausível, não comprovada. A observação corrigida pertence a outro lote, posterior.

A comparação permanece válida entre os mesmos bytes preservados, mas não comprova precisão sobre fala portuguesa corretamente sintetizada. Uma validação futura de entrada confiável deverá registrar texto/codepoints pré-`Speak()`, BOM/hash do script e host/encoding. Não deve substituir retroativamente este corpus ou apresentar resultados novos como melhoria medida nestes mesmos áudios. Os WAVs antigos não foram corrigidos ou regenerados para melhorar o resultado.
