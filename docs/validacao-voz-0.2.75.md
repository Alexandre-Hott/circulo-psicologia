# Validação da seleção de séries por voz 0.2.75

Esta entrega permite escolher uma série recorrente pelo número exibido na Agenda, inclusive quando há pacientes com o mesmo nome. O comando prepara uma proposta; confirmar abre o formulário existente. A data de encerramento e a confirmação final continuam necessárias para gravar.

## Como usar

Abra Agenda e a gaveta Compromissos persistidos. Cada série recorrente mostra opção e dia da semana. Diga ou digite, por exemplo, `Encerrar série de Ana Clara opção dois` ou `Antecipar término de Ana Clara na segunda às quinze horas opção dois`. O prefixo `Clicar em` também é aceito. Confira nome, opção, dia e horário na prévia antes de confirmar.

O número acompanha a ordem de todas as séries recorrentes carregadas, inclusive encerradas; compromissos avulsos não recebem opção. Uma série encerrada mantém seu número, mas não ganha uma ação que antes não estava disponível. Fechar a gaveta não renumera. Recarregar uma lista diferente pode mudar os números e invalida propostas antigas.

## Regras e limites

O nome completo e a opção devem corresponder ao mesmo paciente e à mesma série. Dia e horário, quando informados, também precisam corresponder. Sem opção, nomes homônimos continuam recusados. Os comandos antigos com identificadores continuam disponíveis. Números falados de um a dez são aceitos; acima de dez, use algarismos no comando editável. Palavras como onze ainda não são reconhecidas por esta regra.

Preparar não clica nem grava. Aplicar revalida os controles disponíveis, concorrentes, identidade, metadados e ciclo da interface. Trocar de espaço descarta a proposta; atualizar a lista exige novo preparo. A opção reduz a necessidade de ditar identificadores, mas não representa melhoria medida de precisão da transcrição.

## Testes e correções

O primeiro RED unitário teve 37 aprovados e 20 falhos em 57 casos, antes da implementação. Dois casos adicionais verificam concorrentes com metadados diferentes. Uma rodada posterior teve 58 aprovados e um falho em 59, por faltar a prévia amigável. Após a correção, os 59 passaram. O conjunto JavaScript padrão final passou 865/865, já com os metadados 0.2.75.

O RED inicial de interface, executado pelo agente de testes, confirmou que os atributos de opção ainda não existiam. Na primeira integração do MAIN, 16 de 17 passaram: a expectativa de mensagem após sair e voltar à Agenda estava incorreta. A aplicação já descartava a proposta; o teste passou a exigir ausência de prévia e barra de aplicação, mensagem de comando indisponível, formulário ausente e zero escritas. As verificações de alvo e concorrentes não foram removidas.

Uma segunda rodada teve 16 aprovados e um timeout no primeiro caso, em clique visível, habilitado e estável. Havia outra rodada de navegador concorrente; isso não estabelece a causa do timeout. Sem alterar código, prazo ou retries, a execução sequencial passou 23/23 em 1,6 min: 17 cenários novos e seis do aviso de corte. Inclui opções, homônimos, IDs legados, séries encerradas e avulsas, renumeração, reload, disponibilidade, troca de espaço, aliases concorrentes e escrita exata somente após confirmação final. A captura da interface com dados fictícios foi inspecionada.

Na regressão inicial, 46 de 47 passaram. O replay antigo emitia frames não silenciosos indefinidamente, atingia o limite de 12 segundos e esperava preparo automático incompatível com o contrato atual. A fixture passou a simular fala curta seguida de silêncio, preservando corpus e transcrições originais, duas capturas, IDs exatos e ausência de escritas indevidas. Acrescentou verificações de limpeza, PCM abaixo do limite e ausência do aviso de corte. A rodada final dessa regressão passou 47/47 em 2,3 min, sem retries, separadamente dos 23 casos anteriores. Não é uma execução única de 70 casos nem regressão integral de todas as áreas.

Rust release/offline/locked passou 135 testes, zero falhas e um ignorado em 7,48 s, com metadados 0.2.75. Não houve mudança funcional Rust. Lint passou sem erros e com os oito avisos anteriores. A revisão independente não encontrou P1/P2 concreto nas fontes nem nos ajustes de testes. Os testes de interface usam IPC e mídia simulados; replay de transcrições anteriores não é nova inferência ASR.

## Pacote e validações restantes

[Instalador Windows x64](../src-tauri/target/release/bundle/nsis/Círculo_0.2.75_x64-setup.exe): **135.887.065 bytes**, SHA-256 `c446a558677e82c91aa7a6082da0ba396c36846b647e2bd9ca01efbe656143c6`. O build NSIS offline/locked terminou com código zero. A auditoria conferiu versão, hash e alvo x64; Authenticode NotSigned. O conteúdo interno não foi extraído, e instalação, execução e desinstalação deste pacote não foram testadas.

Manifest local: `C:\Users\alexandre\AppData\Local\Temp\circulo-0275-audit-20261004.json`. O override temporário de build foi removido; configuração oficial do updater e chave pública foram preservadas. Não houve assinatura de atualização automática nem publicação de Release. A instalação 0.2.61 foi conferida por metadados e não alterada; o perfil existente não foi modificado pelo trabalho. Os avisos anteriores de chunk acima de 500 KiB e PDB do OpenSSL permaneceram.

Não houve gravação física, nova ASR, download de modelo ou mudança do prompt. Senhas e seleção de arquivos permanecem manuais. Limpeza de recovery e compatibilidade com backups antigos continuam fora do escopo. O incremento não prova cobertura universal das ações nem funcionamento do microfone físico. Somente dados fictícios foram usados; a meta continua ativa.
