# Validação do assistente de voz 0.2.72

Esta rodada corrige o transporte dos argumentos em português para o reconhecimento local no Windows. Não acrescenta comandos, troca o modelo ou corrige o conteúdo transcrito. O prompt A, os limites de captura, o parser, a interface e o cofre permanecem iguais à 0.2.71.

## Transporte implementado

O processo recebe somente `@args.txt`. Um arquivo temporário UTF-8 sem BOM entrega os argumentos, um por linha LF, ao [CLI oficial Whisper 1.9.1](https://github.com/ggml-org/whisper.cpp/blob/v1.9.1/examples/cli/cli.cpp#L899-L938). Modelo, WAV e saída usam caminhos relativos ASCII; o diretório de trabalho é passado pelo Windows como Path. Isso evita transportar o prompt pelo argv narrow CP1252 identificado no diagnóstico anterior.

O writer valida todos os argumentos contra CR, LF e NUL antes de criar o arquivo e usa create_new, sem sobrescrever arquivos existentes. Espaços e aspas são literais. O arquivo fecha antes do spawn. Ordem das flags, prompt A, nomes fictícios limitados, stdio null, CREATE_NO_WINDOW e timeout de 60 segundos são preservados. Não há conversão dos bytes da transcrição, alteração global de code page ou adoção do vocabulário experimental B.

## Testes executados

Os 16 testes novos primeiro produziram RED de compilação E0432, pela ausência dos três helpers; não foram 16 falhas de execução. Após implementar: Rust release/offline/locked passou 102 testes, zero falhas e um opt-in ignorado, em 8,62 s. JS passou 773/773. Lint teve zero erros e os oito avisos anteriores. Repository guard e diff check passaram; revisão independente aprovou o contrato.

A regressão selecionada de interface passou 16/16 em 1,1 min, Edge headless, worker único, sem retries: quatro replays históricos, seis casos de ciclo de editor e seis de textarea. IPC e captura são simulados nessa camada; não é reconhecimento físico nem regressão integral.

Uma única rodada nativa posterior executou os cinco WAVs fictícios preservados pelo backend Rust real. Cargo exit0, um opt-in aprovado em 9,06 s; processo observado em 9,8475 s. TEMP e TMP foram alterados somente no ambiente do filho para uma pasta com acentos. Os cinco workspaces temporários, modelo, CLI, argumentos e entradas foram observados; os cinco workspaces foram removidos no término normal. Cinco transcrições UTF-8 completas chegaram ao marcador Rust, sem erro de codificação. Fonte e WAVs originais mantiveram seus hashes.

A avaliação semântica existente, sem reparos, teve **2 aprovados, 2 falhos e 1 não avaliado**: procedimentos e resultado passaram; observação teve `compidiu` sem delimitador e foi recusada; encaminhamento transcreveu `próxima seção semanal.` em vez de sessão. Confirmar depende de proposta/interface e não foi avaliado pelo parser. O evaluator exit0 significa avaliação executada, não cinco comandos corretos. Não houve melhora comprovada de precisão nem teste do prompt B.

O preflight diagnóstico inicial falhou antes de despachar Cargo, por assumir fmt16/cabeçalho44 quando os WAVs preservados têm fmt18/PCM46. Só essa verificação foi corrigida. Depois da rodada nativa, o collector PowerShell falhou ao contar o array JSON; seu exit1 original foi preservado. Node recuperou literalmente o marcador completo, mapeando apenas chaves index/transcript para Index/Transcript, e executou o evaluator. Nenhuma inferência foi repetida. O MAIN confirmou separadamente as contagens 2/2/1 no mesmo corpus.

## Evidências e limites

Evidência local externa: `C:/Users/alexandre/AppData/Local/Temp/circulo-native72-unicode-1791106654368-06f8a86a/`, com preflight-terminal.json, terminal.json, recovery-summary.json, native-cases.json e stdout/stderr brutos. Leituras concorrentes encontraram nove erros de acesso durante escrita; snapshots de transcrição não cobrem todas as chamadas. O marcador bruto completo é a referência. Janelas de observação não são tempos individuais exatos de inferência, e códigos numéricos individuais dos subprocessos não foram emitidos.

O reader opt-in preexistente lê PCM desde offset44; os WAVs preservados começam em46. Ele foi mantido para esta comparação; corrigir seu decoder é pendência, sem alegação de equivalência perfeita da entrada decodificada. Nomes de contexto nesta rodada: Ana Clara e Bia Fictícia; não é A/B idêntico ao diagnóstico anterior com somente Ana Clara.

Microfone físico, todos os comandos, instalação e persistência desta versão continuam sem nova validação. Limpeza após falha de kill/crash não é garantida pelo caminho preexistente, e remoção normal não é apagamento seguro. Limpeza de recovery e compatibilidade com backups antigos continuam fora do escopo. A instalação local permanece 0.2.61; nenhum perfil clínico foi usado ou modificado por esta rodada. Meta ativa.

SHA-256 da fonte congelada native_voice.rs: `B64C5BBE7B90FD83CE3D918D36461F200865BFA09F07C70D45B3BFABF7028B74`. Frontend não alterado. Rust e interface foram testados antes do incremento mecânico dos cinco metadados de versão para 0.2.72. JS foi repetido depois do incremento e passou novamente 773/773. Build, auditoria e consistência de versão passaram nos metadados finais.

## Instalador para teste local

[Instalador Windows x64](../src-tauri/target/release/bundle/nsis/Círculo_0.2.72_x64-setup.exe): 135.895.792 bytes, SHA-256 `b4b8303b60f1387bcd46842874602838824c948fa1cbf8a2c7fa9894c29a9987`. Build NSIS offline/locked exit0; compilação Rust em 44,28 s. Aviso anterior de OpenSSL sem PDB permanece. Override temporário externo removido após o build; configuração oficial do updater preservada.

Auditoria de metadados exit0: PE 0.2.72, x64, NotSigned. Manifest: C:/Users/alexandre/AppData/Local/Temp/circulo-0272-audit-20261004.json. Conteúdo interno não extraído; pacote não instalado ou executado. Sem assinatura updater/Authenticode e sem publicação de Release. Entrega local para teste com dados fictícios, não atualização nova já disponível no GitHub.
