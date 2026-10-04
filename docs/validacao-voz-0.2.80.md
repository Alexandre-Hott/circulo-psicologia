# Validação de voz do Círculo 0.2.80

Esta entrega integra o modelo local small Q5 e impede que uma confirmação de voz antiga autorize outro recurso de atualização. [Instalador Windows x64](../src-tauri/target/release/bundle/nsis/Círculo_0.2.80_x64-setup.exe):187.089.918 bytes, SHA-256 `7ee608379765be8c2350bc3e49de83eafa3b53d814ca9624a316e49558f6154c`. Pacote auditado por metadados, sem instalação, extração interna, assinatura ou publicação. A meta permanece ativa: reconhecimento completo de todas as falas não foi comprovado.

## Alterações e contratos preservados

O updater identifica versão, recurso e ciclo de vida antes de preparar a ação. Recheck ou substituição invalida a proposta, inclusive com a mesma versão. O handler captura o recurso e revalida após confirmação e esperas; somente o recurso autorizado pode ser instalado ou fechado. Formulários pendentes e a confirmação adicional continuam protegidos. Não houve download ou instalação reais nos testes.

O backend local passa a exigir `ggml-small-q5_1.bin`. Prompt, nomes, argumentos de reconhecimento, PCM e parser permanecem iguais. Preparação e build exigem o mesmo arquivo, com SHA-256 fixado. O bundle usa whitelist de17 recursos: modelo escolhido, executável,14 DLLs e avisos de terceiros. O base histórico foi preservado localmente, mas não está na whitelist. O build dessa configuração passou; o conteúdo interno do NSIS não foi extraído ou inspecionado.

Senha, seleção de arquivos e início explícito da captura permanecem manuais. Nenhum perfil instalado foi alterado. Não houve uso de dados reais, acesso a chave privada, assinatura ou publicação de Release.

## Testes e diagnóstico

As primeiras17 provas de interface tiveram16 aprovadas e1 falha: confirmar A abria o aviso de B após uma tentativa manual falha e recheck. A rodada seguinte de6 provas teve4 aprovadas e2 falhas, incluindo troca de recurso com a mesma versão. Após a correção e revisão,18/18 passaram em2,2min, uma worker e sem retries. Os12 casos residuais exercitam pacientes/vínculos, comportamento/indicador, remarcação/cancelamento, encerramento de série, rascunho, filtros e recuperação bloqueada por captura simulada.

O primeiro teste residual de12 casos teve10 aprovados e2 falhas de expectativa: desmarcar ou limpar confirmado já autoriza o autosave existente de600ms. Os dois casos passaram a exigir exatamente esse primeiro payload e uma segunda escrita idêntica após Save explícito, sem relaxar a preservação do rascunho concorrente. Não houve mudança de produção para esse ajuste.

Antes da integração, contratos do modelo tiveram1 aprovado/6 falhos em JS e1 aprovado/2 falhos em Rust, por referências ao base. Depois, os contratos JS tiveram6 aprovados/1 falho por omissão do nome da licença zlib no heading de SDL2; o texto integral já existia e foi preservado ao identificar a licença. Os7 contratos passaram, e sua inclusão no comando padrão levou o conjunto JS a1882/1882 em4550,8255ms. Rust release/offline/locked passou138 testes, com1 opt-in ignorado, em24,59s. Essas execuções precedem a atualização de metadados para80.

Após atualizar metadados para80, o conjunto JS passou1882/1882 em4449,8743ms e Rust passou138 testes/1 ignorado em23,90s. Lint terminou sem erros e com8 avisos preexistentes; guard do repositório e diff check aprovados.

A regressão selecionada passou64/64 em4,0min, incluindo jornadas principais/secundárias, recuperação, texto multiline, bloqueio e o corpus histórico79. O replay das oito transcrições reais do small passou8/8 em31,4s, verificando proposta/recusa, nome, IDs, destino, corpo literal, invalidação Ana→Bia→Ana e ausência de Save implícito. São rodadas separadas, cada uma com uma worker e sem retries. Os testes18 e64 precederam somente a mudança de metadados; o código funcional permaneceu congelado. Aprovação do replay não muda a medição nativa5/2/1.

## Reconhecimento nativo medido

Na rodada Rust real com os mesmos oito WAVs fictícios preservados, houve5 pedidos corretos,2 falhos e1 confirmação não avaliada sem proposta de interface. Antes havia3 corretos/4 falhos/1 não avaliado. Os campos procedimentos, resultado e encaminhamento preservaram literalmente o conteúdo esperado. Recorrência e observação perderam partes explícitas do comando e foram recusadas, sem reconstruir a fala.

O teste nativo terminou com código0 e sem timeout:37,47s de teste,11,81s de compilação e51,291s no runner. A avaliação semântica retornou2 devido aos dois pedidos falhos; o comando externo reportou1. Não interpretar o código nativo0 como aprovação de todos os pedidos. O harness não fornece latência por áudio.

A execução preservou76 fontes,19 recursos e8 WAVs, conferidos antes/depois e em auditoria independente. Artefatos temporários: `C:\Users\alexandre\AppData\Local\Temp\circulo-smallq5-rust8-result-837e1347fb8f4b75a4d874bd592f3b09`. Um preflight anterior recusou a ordenação de dicionários do inventário, sem claim ou inferência; a correção ficou restrita à chave explícita de ordenação. O runner usa UTF-8 estrito e uma única rodada,60s por inferência e600s global.

A [comparação direta anterior dos modelos](voz-comparacao-modelos-20261004.md) também mostrou5/7, mas resposta mais lenta. Ela é uma prova separada, não latência medida neste harness Rust. Não houve teste do microfone físico nem jornada instalada nesta etapa.

## Entrega e pendências

Build Tauri/NSIS release/offline/locked terminou com código0; compilação release em41,18s e pacote x64 gerado. Um override temporário fora do projeto desativou somente artefatos assinados de updater nessa compilação local; configuração oficial, chave pública e endpoint permanecem preservados. `--no-sign` foi explícito. Avisos OpenSSL/PDB permaneceram; nenhum certificado ou chave privada foi acessado.

Auditoria local em `C:\Users\alexandre\AppData\Local\Temp\circulo-0280-audit-20261004.json`: PE0.2.80, arquitetura x64, bytes/hash acima e Authenticode NotSigned. Instalação, desinstalação e runtime do pacote não foram testados. A primeira chamada da checagem de consistência omitiu argumentos obrigatórios e recusou a execução; a chamada completa passou, conferindo arquivo, manifestos e referências sem alterar a instalação.

O próximo incremento deve melhorar cobertura e reconhecimento de fala, especialmente os pedidos ainda recusados, sem reconstruir conteúdo clínico ou inventar funcionalidades. Senhas e seletores continuam manuais. Limpeza de recovery, compatibilidade com backups antigos e demais melhorias não foram investigadas ou implementadas nesta rodada.
