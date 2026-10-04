# Validação de voz do Círculo 0.2.81

Esta entrega impede que um comando antigo de descarte continue válido depois de salvar um cadastro e começar outro no mesmo formulário. Também comprova a navegação por captura sintética dentro do rascunho de sessão. [Instalador Windows x64](../src-tauri/target/release/bundle/nsis/Círculo_0.2.81_x64-setup.exe): 187.082.874 bytes, SHA-256 `0693cbfe5c44936a615444889d34d2767c4edb30f341716a5641e8a6228889e8`. Gerado e auditado por metadados; não instalado, executado, assinado ou publicado. A meta continua ativa.

## Correção e diagnóstico

A reprodução usou somente dados fictícios: preparar descarte no cadastro A, salvar A manualmente pelo botão existente, preencher B e confirmar a proposta antiga. O aviso de descarte abria indevidamente para o novo contexto. A rodada anterior à correção teve dois casos aprovados e um falho em55,7s, sem retries. O erro foi a presença do aviso, não uma exclusão silenciosa. Os controles de troca entre editores existentes e de proposta fresca com recusa e dois aceites passaram.

Após um Save bem-sucedido, o aplicativo avança sincronicamente o ciclo de validade dos comandos antes de limpar o formulário, inclusive quando ele permanece aberto para um novo cadastro. Abrir ou fechar o formulário também invalida propostas antigas. Digitar nos campos não invalida a proposta a cada tecla. O diff funcional é de quatro linhas adicionadas e uma substituída em DesktopVault; parser, reconhecimento nativo, handlers de descarte, banco e modelo permanecem iguais.

## Testes executados

Antes da correção, seis testes adicionais de navegação passaram em39,8s. Depois, os mesmos seis mais os nove testes do updater passaram15/15 em2,0min, um worker e sem retries. Os atalhos Comportamentos, Indicadores e escalas, Salvar ou finalizar, Evolução descritiva e Escolher comportamentos desta sessão exigem pedido e confirmação em capturas separadas. Foram verificados destino, hash/foco quando aplicável, paciente, rascunho, conteúdo preservado, recusas de alvo errado/indisponível e encerramento dos recursos de áudio. O teste de descarte permite somente o Save manual exato de A; demais gravações e instalações são recusadas pelas fixtures.

A suíte JavaScript com metadados81 passou1882/1882 em6156,7271ms. Rust release/offline/locked passou138 testes, com um opt-in ignorado, em9,98s de testes. Não houve nova inferência de voz. Lint terminou sem erros e com oito avisos preexistentes; guard do repositório aprovado.

A regressão selecionada passou59/59 em8,5min, um worker e sem retries. Inclui campos de pacientes, jornadas principais/secundárias, controles residuais, bloqueio e ajustes, inclusive confirmação de descarte. São rodadas separadas: não afirmar74 testes em uma única execução. O código funcional permaneceu congelado; a rodada focal15 precedeu somente a atualização mecânica de metadados para81, realizada durante a regressão59.

Hashes das fontes e provas congeladas:

- DesktopVault: `EDE6C3CD70601C818F047E39FBED65F10DEABE442D56A4C49D7B9A634BC5F100`.
- Parser preservado: `F5B818F445879C48EBBD9EDA2184588896A0A396922E57C5D3E2223A0FF025AA`.
- Reconhecimento nativo preservado: `C5457E287964D256A5FEE6736276876A056CD1BD3A7A070A0D310966C64B84C7`.
- Testes do updater: `8BA08F88A9E53C6EA22C90FDEB93B41E83D06CC291389C9F74E175536CCE7E02`.
- Navegação PCM: `2F69FF15AAA2FAB0DD707BC516182EC0DCF92425435504F892396E693E43BB56`.

## Pacote e limites

Build Tauri/NSIS release/offline/locked terminou com código0; compilação release em53,85s. O override temporário fora do projeto desativa somente artefatos assinados do updater para esse build local, com `--no-sign` explícito. Configuração oficial de atualização, endpoint e chave pública permanecem preservados. Nenhuma chave privada foi acessada. Avisos OpenSSL/PDB permanecem.

Auditoria em `C:\Users\alexandre\AppData\Local\Temp\circulo-0281-audit-20261004.json`: PE0.2.81, x64, tamanho/hash acima, Authenticode NotSigned. Conteúdo interno não extraído; instalação, desinstalação e runtime do pacote não testados. O aplicativo e o perfil instalados não foram alterados.

Captura sintética com transcrições controladas não comprova reconhecimento ou microfone físico. A medição nativa da80 continua sendo cinco pedidos corretos, dois falhos e uma confirmação não avaliada; recorrência e observação ainda são falhas conhecidas daquela amostra. Não houve nova medição nesta entrega. Senhas, seleção de arquivos e início explícito do microfone permanecem manuais.

Modelos de sessão pertencem à demonstração web volátil, não à interface Windows atual; não se afirma paridade entre elas. Não foram acrescentadas funcionalidades clínicas para preencher essa diferença. Limpeza de recovery e compatibilidade com backups antigos continuam fora desta etapa. A próxima investigação proposta é uma comparação limitada de configuração do reconhecedor com os mesmos áudios; ela ainda não foi autorizada nem executada e não representa melhoria comprovada.
