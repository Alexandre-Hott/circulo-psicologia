# Validação do assistente local — 0.2.36 (01/10/2026)

## Escopo da revisão

O comando na tela inicial continua disponível por voz offline ou texto. Ele prepara campos para revisão, sem salvar automaticamente. Esta revisão impede que um pedido com dois pacientes escolha silenciosamente um deles; exige um clique próprio em “Salvar rascunho” para alterações de sessão feitas por voz, mesmo se outro autosave já estiver em andamento; e transfere o foco de teclado ao formulário de destino. O backend de voz copia recursos se Windows informar volumes diferentes (o modelo tem cerca de 148 MB) e interrompe uma inferência após 60 segundos.

## Evidências

- `npm test`: 190 passaram, 0 falharam. `npm run test:e2e`: 172 passaram, 0 falharam, incluindo testes de foco, ambiguidade, confirmação de salvamento e regressão de autosave. O E2E simula o backend, não o microfone físico.
- `cargo test --release --offline --locked`: 83 passaram, 0 falharam, 1 teste opt-in de WAVs SAPI ignorado. A primeira execução da suíte falhou apenas no teste de instância única porque a instalação 0.2.35 estava aberta. Após fechá-la normalmente, a suíte passou. Os 13 testes ativos de `native_voice` passaram. A tentativa de teste em modo debug falhou na compilação do OpenSSL por caminho longo; o release foi compilado, testado e empacotado.
- `npm run lint`, `npm run build` e `npm run guard:repository` passaram. O lint mantém o aviso anterior de pureza de `Date` em `src/App.jsx:103`.
- Build Tauri/NSIS concluído com artefatos de updater desativados somente para este build local, pois a chave privada de assinatura não está configurada. Instalador [Círculo_0.2.36_x64-setup.exe](../src-tauri/target/release/bundle/nsis/Círculo_0.2.36_x64-setup.exe): 135.870.477 bytes, SHA-256 `db0cf13feb0fd0a8c812c64701c051de1173cf200b9276a62cff90f475d10a5e`, PE x64 versão 0.2.36, Authenticode `NotSigned`. Auditoria local: `%TEMP%\circulo-0236-audit-20261001.json`; ela não inspeciona o conteúdo interno do NSIS.
- Antes de instalar, os quatro arquivos cifrados do perfil foram copiados com hashes iguais para `%LOCALAPPDATA%\Círculo-update-backup-20261001-0236`. O instalador silencioso retornou 0; versão instalada 0.2.36, modelo, motor e avisos de licença presentes. O perfil original permaneceu byte a byte igual até a primeira abertura. O executável instalado abriu uma janela `Círculo` responsiva, que foi fechada normalmente após o smoke test.

## Limites

A ferramenta de controle da janela Windows não inicializou neste ambiente. Portanto, não foram validados visualmente os cliques no aplicativo instalado, a permissão do microfone físico, a qualidade de áudio real, nem ditado em dois volumes físicos distintos. O caminho de cópia entre volumes e o timeout foram testados com erros/processos sintéticos. O reconhecimento pode trocar nomes próprios; transcrição e formulário exigem revisão humana.

O CLI Whisper usa WAV/TXT temporários e até 40 nomes de pacientes na linha de comando local; ainda não há garantia de apagamento seguro desses temporários. O instalador não é assinado e não foi publicado como GitHub Release. A atualização automática do GitHub não está ativa nesta versão. O workflow de release assinado ainda exige configuração real da chave do updater e assinatura Windows antes de publicar. Use somente dados fictícios; não há validação para prontuários reais.
