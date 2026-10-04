# Comparação dos modelos locais de voz em 4 de outubro de 2026

O modelo small Q5 reconheceu corretamente cinco dos sete pedidos avaliáveis, contra três do base usado na versão 0.2.79. A melhora justifica testar sua integração, mas não demonstra reconhecimento completo: dois pedidos ainda falharam e a resposta ficou mais lenta. O modelo de produção não foi substituído nesta comparação.

## Método e resultados

Executamos 16 inferências seriais com whisper.cpp 1.9.1: os mesmos oito WAVs sintéticos preservados, uma vez por modelo. Prompt, nomes fictícios, argumentos e áudio permaneceram iguais; mudou apenas o modelo e o nome necessário dos arquivos de saída. Não houve nova síntese, download, uso do microfone físico ou acesso ao perfil instalado.

Todos os processos terminaram com código zero e texto UTF-8 válido, sem repetição ou timeout. A rodada levou 59,500 segundos. Sucesso do processo não equivale a reconhecimento correto.

| Medida neste corpus | Base atual | Small Q5 candidato |
| --- | --- | --- |
| Pedidos com intenção e destino corretos | 3 de 7 | 5 de 7 |
| Pedidos falhos | 4 | 2 |
| Conteúdos clínicos literalmente corretos | 2 de 4 | 3 de 4 |
| Mediana por inferência | 1,735 s | 4,6935 s |
| Maior duração por inferência | 2,145 s | 6,220 s |

O candidato acertou o cadastro de Bia Fictícia e o encaminhamento que o base errava, sem piorar os três pedidos anteriormente corretos. Ambos ainda falharam no agendamento recorrente e na observação de sessão. O oitavo áudio, “Confirmar comando”, retornou o texto esperado nos dois modelos, mas não foi contado como pedido correto: confirmação depende de uma proposta e de contexto da interface.

A avaliação exige intenção completa, IDs e destinos corretos. O conteúdo clínico deve ser exato; não corrigimos palavras, completamos frases ou reconstruímos a transcrição. Esta pequena amostra sintética não estima precisão geral nem valida áudio humano ou aplicação de comandos no programa instalado.

## Evidência e limites

Modelo candidato já disponível localmente: `ggml-small-q5_1.bin`, 190085487 bytes, SHA-256 `AE85E4A935D7A567BD102FE55AFC16BB595BDB618E11B2FC7591BC08120411BB`.

Artefatos temporários: `C:\Users\alexandre\AppData\Local\Temp\circulo-model-ab8-95788961905b4c17a52512ae1c83db8e`. Incluem manifesto, saídas brutas, avaliação semântica e 112 hashes conferidos, além dos WAVs preservados. Não são arquivos publicados no repositório.

Os testes prévios de integração demonstraram a diferença esperada: 1 aprovado e 6 falhos nos sete contratos JS; 1 aprovado e 2 falhos nos três novos testes Rust. As falhas mostram referências ao base ainda presentes, não erro de compilação ou inferência. Os contratos JS inspecionam fontes/configuração; não provam execução do reconhecimento.

A integração mínima foi autorizada após esses resultados e a revisão. O caminho Rust real posteriormente confirmou5 pedidos corretos/2 falhos/1 confirmação não avaliada, e o replay das oito transcrições passou8/8 nas verificações da interface. O código nativo0 não elimina as falhas semânticas; o avaliador retornou2. A [entrega local80](validacao-voz-0.2.80.md) inclui o modelo, mas não foi instalada ou homologada com microfone físico. A comparação direta descrita aqui não gerou instalador nem alterou o perfil instalado.

Senhas e seletores de arquivos continuam manuais. Limpeza de recovery e compatibilidade com backups antigos permanecem fora do escopo. Nenhum dado real foi usado.
