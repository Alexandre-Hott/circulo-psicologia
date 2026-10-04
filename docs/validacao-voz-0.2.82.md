# Validação de voz do Círculo 0.2.82

Esta entrega integra `--beam-size 8`, que corrigiu a observação de sessão na amostra sintética sem perder os outros acertos. [Instalador Windows x64](../src-tauri/target/release/bundle/nsis/Círculo_0.2.82_x64-setup.exe): 187.068.721 bytes, SHA-256 `7155b69363532217d2d56837092e4cc685db725ffe99d84ea2d0e1a4d844c777`. Gerado e auditado por metadados; não instalado, executado, assinado ou publicado. Disponível para teste local com dados fictícios. A meta continua ativa.

## Reconhecimento nativo

A [comparação separada](voz-comparacao-beam-20261004.md) em oito áudios novos com texto e codepoints pré-síntese conferidos produziu sete pedidos corretos em sete na candidata, contra seis na configuração anterior. A mediana passou de 4,4715 s para 4,846 s. O diff funcional acrescenta somente o par final nos vetores Rust e do script sintético, preservando os 13 argumentos anteriores, prompt, modelo small Q5, parser, textos clínicos e transporte UTF-8.

Depois da integração, uma única rodada opt-in pelo backend Rust real processou os mesmos oito WAVs, sem retries. Sete intents completos e quatro corpos clínicos passaram literalmente; “Confirmar comando.” permaneceu apenas uma conferência textual, pois o harness não tinha proposta de interface. Os oito textos coincidiram exatamente com o braço CLI beam8. O principal conferiu os pins antes e depois; a revisão independente confirmou fontes, recursos, WAVs, textos e configuração.

A execução Cargo terminou com código 0 em 40,421 s, com 0,69 s de compilação e 39,60 s de teste. O harness não fornece latência por caso nem preserva os logs internos do Whisper; os logs Cargo brutos UTF-8 foram preservados. Artefatos em `C:\Users\alexandre\AppData\Local\Temp\circulo-trusted8-native-plan-29c3e881f3024d0fb482d9fbbd5f9885\results`. O arquivo `freeze-before` identifica explicitamente sua reconstrução dos pins verificados antes da execução, não uma captura gravada no início do processo. A inferência precedeu somente a atualização mecânica de versão; o hash funcional permaneceu igual até depois do build.

## Interface e regressão

O replay dos textos Rust na interface real, com mídia e IPC simulados, passou 8/8 na primeira rodada do autor em 32,9 s e 8/8 na conferência do principal em 55,8 s. Cada rodada usou um worker e zero retries. Recorrência e cadastro só abriram o formulário exato após o segundo áudio; comportamento e quatro acréscimos ficaram no rascunho correto. Foram conferidos IDs, conteúdo literal, campos concorrentes, limpeza da captura, confirmação isolada, troca de paciente A→B→A, recusa de proposta antiga e ausência de duplicação ou gravação implícita.

A regressão selecionada do principal passou 14/14 em 2,3 min, separadamente: oito replays históricos e seis jornadas principais. Inclui cadastro/edição, paciente novo até sua primeira sessão, biblioteca, compromissos avulsos e semanais, indicadores, salvamento, finalização e pacientes homônimos. Os históricos não foram substituídos pelos novos acertos. Não é uma suíte integral de interface nem uma única rodada de 22 testes.

Com metadados 82, JavaScript passou 1884/1884 em 5,16 s e Rust release/offline/locked passou 138 testes, com um opt-in ignorado, em 10,30 s. Os contratos focais 9/9 JavaScript e 19/19 Rust foram conferidos antes da atualização de versão. Lint terminou sem erros e com oito avisos anteriores; guard e diff aprovados. A falha debug/OpenSSL anterior do autor está preservada no [registro de integração](voz-comparacao-beam-20261004.md), sem ser apresentada como regressão funcional.

Hashes funcionais e provas mantidos até depois do build:

- Backend: `9D77FFC63102BFF47DFC2CE40F2B2907A533954ADF4FC69B3CC7D232F5AF7CE5`.
- Script sintético: `28B83FB832A70ADF9D8CB9DD55163533B3AA478E0933A5741DA246BBB57D437D`.
- Fixture Rust fresca: `8016585AE8C6B174A155DFFFC06631CFEAC3915C7ABAF9F35E5E8378E44C8803`.
- Replay fresco: `1118566B1EF2F0B3FA007F4FE50678A80273CD597BDA09A51268CB0F2BF82BFF`.

## Pacote e limites

Build Tauri/NSIS release/offline/locked terminou com código 0, com compilação release em 46,94 s. O override temporário externo desativou somente os artefatos assinados do updater para esse build local, com `--no-sign` explícito, e foi removido após o build. A configuração oficial, endpoint e chave pública permanecem preservados; nenhuma chave privada foi acessada. Avisos OpenSSL/PDB permanecem.

Auditoria em `C:\Users\alexandre\AppData\Local\Temp\circulo-0282-audit-20261004.json`: versão PE 0.2.82 e Authenticode NotSigned; tamanho/hash conferidos. O executável do instalador é um stub NSIS PE32/x86, enquanto o alvo declarado do aplicativo é x64. A leitura separada do cabeçalho de `target/release/circulo.exe` confirmou x64; a arquitetura do payload dentro do instalador não foi inspecionada. O conteúdo interno não foi extraído, e instalação, desinstalação e execução desse pacote não foram testadas. Aplicativo e perfil instalados preservados; não há Release nova nem atualização automática publicada desta versão.

A amostra sintética não mede precisão geral, nomes arbitrários, microfone físico ou a cadeia ininterrupta da janela instalada. Reconhecimento nativo e replay de interface são provas separadas. Senhas, seletores de arquivos e início explícito da captura permanecem manuais. Não se afirma paridade com a demonstração web; limpeza de recovery e compatibilidade com backups antigos ficaram fora da etapa. O próximo teste funcional proposto verifica edição por áudio de apenas um entre dois comportamentos homônimos; ainda não foi implementado ou executado nesta entrega.
