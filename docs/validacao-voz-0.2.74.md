# Validação do ditado por campo 0.2.74

A entrega acrescenta um modo de ditar somente o conteúdo dos quatro textos do rascunho de sessão. O usuário escolhe o destino, fala ou escreve um trecho, revisa o acréscimo e confirma. Os comandos anteriores continuam disponíveis. A redução de cabeçalhos repetidos simplifica a entrada, mas ainda não há medida de melhora na precisão do reconhecimento.

## Como usar

Abra Sessões, escolha o paciente e abra o rascunho. No assistente, clique em Ditar neste campo e selecione Observações descritivas, Procedimentos realizados, Resultado e decisão ou Encaminhamento ou encerramento. O destino mostra paciente, campo e rascunho.

Use Ouvir e transcrever para falar apenas o conteúdo. Confira o trecho, clique em Preparar trecho e depois em Confirmar acréscimo. O texto anterior é preservado, com um espaço entre os trechos. Para gravar, use Salvar rascunho. Cada acréscimo aplicado ou descartado exige nova escolha explícita do campo; o corpo editável permanece disponível. Usar comandos retorna ao modo anterior.

## Contratos preservados

O corpo ditado não passa pelo parser de comandos. Palavras como confirmar ou não abrir Agenda permanecem texto literal. O limite combinado continua em 4000 unidades UTF-16, incluindo o separador; espaços e quebras de linha não são corrigidos ou truncados. A captura conserva o teto de 12 segundos e sempre exige preparo manual neste modo, mesmo quando termina por silêncio.

Paciente, rascunho, valores vivos, revisão, epoch e cadeia de ciclos da interface vinculam a seleção. Há revalidação antes da captura, no retorno, no preparo e na aplicação, incluindo o consumidor de Sessões. Trocar ou reabrir o destino invalida a seleção. Capturas obsoletas são descartadas antes de inserir texto, sem apagar o corpo já editado.

Um erro de transcrição descarta a proposta anterior, mas não invalida por si só um destino ainda válido: nova tentativa é explícita e revalida esse destino. Confirmar aplica ao formulário, não salva; o caminho de acréscimo continua aguardando salvamento explícito. Edições manuais fora desse caminho mantêm seu autosave existente.

A revisão duplicada fora do assistente foi ocultada somente para propostas deste ditado. O seletor e o destino têm linhas próprias; a prévia conserva as quebras de linha. A captura da interface com dados fictícios foi inspecionada.

## Testes e correções

O primeiro teste unitário produziu erro de importação porque o helper ainda não existia; não foram falhas de execução dos seus casos. Depois, os 12 testes novos e os 25 de acréscimo anterior passaram juntos, 37/37. O teste novo foi incluído na execução padrão; o conjunto JavaScript final passou 806/806.

O RED de interface confirmou ausência do botão, com Center e editor montados corretamente. Houve duas execuções separadas desse caso, ambas falhas, não uma suíte de dois casos. Uma tentativa anterior com filtro ancorado não encontrou testes e não foi classificada como falha de produto.

A primeira integração teve 16 aprovados e um falho em 17 casos: uma transcrição atrasada apareceu no editor após Ana → Bia → Ana, embora não tivesse sido aplicada ou salva. O contrato foi refinado para descartar áudio obsoleto preservando o texto já editado. O teste não foi enfraquecido. Outro RED, de um caso, comprovou a barra de revisão duplicada antes de ocultá-la.

No código final congelado, a rodada do novo fluxo passou **22/22 em 1,0 min**: cinco casos isolados do Center e 17 da aplicação com IPC e mídia simulados. Inclui os quatro campos, salvamento exato, concorrentes intactos, limite 4000/4001, dois trechos, edição manual, troca e retorno de paciente/rascunho, reload, remontagem, corte, descarte, erro, abort e resposta tardia. A rodada separada dos comandos anteriores passou **33/33 em 1,1 min**, sem retries. Não são uma única execução de 55 casos nem uma regressão integral.

Rust release/offline/locked passou 135 testes, zero falhas e um ignorado em 8,71 s, já com metadados 0.2.74. Não houve mudança funcional Rust. Lint passou com zero erros e os oito avisos anteriores. A revisão independente aprovou a fonte final; testes de interface não comprovam microfone físico ou persistência instalada.

## Instalador e limites

[Instalador Windows x64](../src-tauri/target/release/bundle/nsis/Círculo_0.2.74_x64-setup.exe): **135.905.900 bytes**, SHA-256 `ddad2c9e4d17b17c72be6aebfe06110bf204b7f8f0d3b333119cea18b26375fc`. O build NSIS offline/locked terminou com código zero. A auditoria conferiu versão, hash e alvo x64; Authenticode NotSigned. O conteúdo interno não foi extraído, e instalação, execução e desinstalação deste pacote não foram testadas.

Manifest local: `C:\Users\alexandre\AppData\Local\Temp\circulo-0274-audit-20261004.json`. O override temporário de build foi removido; a configuração oficial do updater e sua chave pública foram preservadas. Não houve assinatura de atualização automática, publicação de Release ou alteração da instalação 0.2.61 e do perfil existente. Avisos de chunk acima de 500 KiB e PDB do OpenSSL permaneceram.

Não houve nova inferência ASR, gravação física, síntese, download de modelo ou alteração do prompt nesta entrega. O [vocabulário experimental B](voz-comparacao-vocabulario-20261004.md) permanece rejeitado. Senhas e seleção de arquivos seguem manuais. O modo novo cobre somente os quatro textos da sessão, não todas as ações do sistema. Limpeza de recovery e compatibilidade com backups antigos permanecem fora do escopo. Somente dados fictícios foram usados. A meta continua ativa.
