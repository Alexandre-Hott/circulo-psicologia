# Confirmação digitada no assistente de voz

“Confirmar.” e “Confirmar comando.” agora preservam a proposta até a interpretação explícita. Antes, a edição do campo a apagava, embora o interpretador já aceitasse essa pontuação. A correção alinha somente a normalização da palavra de controle em onChange à já usada por interpret. O texto original, os prefixos aceitos, as guardas de destino e o corpo clínico permanecem intactos. Nenhum alias foi criado.

## Provas

A primeira rodada do principal teve cinco casos: dois passaram e três falharam. Duas falhas eram funcionais; a terceira era uma expectativa incorreta do teste, que exigia aria-current no botão Fechar Agenda. Após corrigir somente essa expectativa, o RED congelado passou três casos e falhou nos dois pedidos pontuados em 37,4 s. O código de produção estava inalterado. Depois do patch de uma linha, o autor passou os cinco casos em 24,3 s. O principal conferiu 25/25 no arquivo de roteamento e no componente do assistente em 45,8 s, incluindo os cinco novos casos. Porta 5261, um worker e zero retries.

A rodada separada do principal de controles locais e ditado clínico passou 26/26 em 1,2 min, na porta 5262, com um worker e zero retries. Conferiu os quatro campos, corpo literal, confirmação local, preservação frente a respostas tardias, limites e mudança de rascunho. A suíte JavaScript passou 1891/1891 em 5,46 s. Lint sem erros, com oito avisos anteriores; guard e diff aprovados. Revisão independente estática aprovou o patch e os cinco novos testes.

- Fonte: SHA-256 `2423351D7B4440CBB22DDEC9DEB1E505AF5336AB585E7979F5BAB0A814CEBEFC`.
- Testes de roteamento: SHA-256 `4A2200FC368FFA3EB0D0B69C6D57648BD003B850274699D2E91DA1B0B700C2F1`.

Os cenários são de interface com mídia e IPC simulados, não reconhecimento real ou validação da janela instalada. Trocar de comando invalida a proposta; mudar de espaço impede sua aplicação antiga. Digitar a confirmação não executa nada antes de interpretar. Não houve novo instalador nesta correção: o pacote 83 anterior não a contém. Backend Rust, dados instalados e atualização publicada não foram alterados.

## Próxima medição de reconhecimento

Quatro áudios fictícios novos foram gerados uma única vez com Maria, taxa zero, PCM22050 mono16: criar comportamento Espera a vez, editar comportamento Pede ajuda, abrir análises e clicar em Registrar sessão. Antes de cada Speak foram registrados texto Unicode, codepoints e hash. O processo oculto do principal terminou com código zero, com limite externo de 30 s, quatro chamadas e zero retries. As durações foram 2,30 a 3,69 s; os pins antes/depois e os literais conferiram. Manifesto dos WAVs: `660F8CD2F2AE216A023613FC41B06BCCA985A0118548ADAD295EC6F507C33F2B`.

Artefatos em `C:\Users\alexandre\AppData\Local\Temp\circulo-trusted4-short-d9e220c93018447387a8e0424a348ce5`. Esses quatro áudios ainda não passaram por inferência nesta etapa. A revisão independente dos WAVs e o plano de quatro chamadas Rust estão em preparação; síntese não comprova reconhecimento. O quarto pedido exige ainda avaliação no contexto da interface. Microfone físico permanece sem homologação.
