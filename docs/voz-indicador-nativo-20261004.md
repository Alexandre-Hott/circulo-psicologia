# Valor de indicador por voz — 04/10/2026

Produção 0.2.67 preservada. Cenário sintético `indicator-value`, SAPI em velocidade 0, reconhecimento offline pelo CLI e backend Rust; uma execução, sem retries. Nenhum dado real, perfil instalado ou código funcional foi alterado.

## Captura concluída

Corpus exato: `test/fixtures/native-voice-indicator-value-20261004.json`. CLI e Rust produziram as mesmas três transcrições, incluindo a grafia reconhecida “seção”. Não foram corrigidos nomes ou valores por inferência.

| Pedido | WAV | Bytes | Tempo CLI | Resultado central |
| --- | --- | --- | --- | --- |
| Regulação emocional: Com algum apoio | 7,358 s | 324528 | 3,10 s | Paciente `ana`, rascunho `synthetic-draft`, indicador `indicator-regulation`, valor 2 |
| Regulação emocional: Com autonomia | 7,189 s | 317080 | 2,04 s | Mesmo destino, valor 3 |
| Confirmar comando | 2,458 s | 108450 | 2,03 s | Não avaliado pelo parser: depende da proposta na interface |

Avaliação: **2 passaram, 0 falharam, 1 não avaliado**. Rust: 6,46 s; harness: 12,02 s; CLI, Rust, evaluator e wrapper terminaram com exit 0. Os três WAVs ficaram abaixo do limite de 12 segundos. Logs e áudio preservados em `C:/Users/alexandre/AppData/Local/Temp/circulo-whisper-synthetic-92ad3ff04ab64078a9cc4daccfc1dfaa`.

## Aplicação na interface

`test/e2e/desktop-voice-indicator-native-value-replay.spec.js`: **2/2 passaram em 25,0 segundos**, porta 5207, Edge headless, worker único, sem retry. Cada caso reproduz a transcrição nativa de um valor seguida da transcrição “Confirmar comando”. Usa catálogo `indicator-regulation`, paciente `ana`, rascunho `synthetic-draft` e um segundo paciente/rascunho fictício concorrente.

Provas: valor anterior preservado antes da confirmação; valores 2/3 aplicados somente após o segundo áudio; nota literal e outros campos preservados; destino exato; snapshot persistido de ambos os pacientes/rascunhos intacto; zero writes, inclusive após espera de 1200 ms. Alteração confirmada fica explicitamente ainda não salva. Parser, shell e handlers reais; mídia e IPC simulados. Isso não comprova salvamento instalado nem nova transcrição Rust durante o replay.

## Verificações adicionais e limites

`node --test test/evaluateSyntheticVoice.test.js`: 28/28 passaram. `npm test`: 347/347 passaram. Lint sem erros, com oito avisos preexistentes; guard do repositório e `git diff --check` passaram.

O contexto com quatro rótulos existe apenas no cenário de teste; não modifica o contexto dos cenários anteriores. A confirmação não recebe aprovação sem interface. Isso é voz sintética, não homologação do microfone físico, ruído ambiente, pronúncias arbitrárias ou todos os valores de todas as escalas.
