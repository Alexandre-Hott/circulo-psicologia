# Validação da seleção de compromissos por voz 0.2.76

O calendário passa a mostrar uma opção em cada compromisso. Isso permite abrir detalhes de uma ocorrência específica por voz mesmo quando pacientes, datas e horários coincidem. Confirmar o comando apenas abre detalhes; não inicia sessão, não altera o compromisso e não grava dados.

## Como usar

Na Agenda, encontre o número exibido no compromisso em Dia, Semana ou Mês. Diga ou digite `Abrir detalhes de Ana Clara opção dois`. Também pode usar `Ver detalhes`, `Detalhes` ou o prefixo `Clicar em`. Se informar data e horário, eles precisam corresponder: `Abrir detalhes de Ana Clara em cinco de outubro de dois mil e vinte e seis às quinze horas opção dois`.

Confira na prévia nome, data efetiva, intervalo e opção antes de confirmar. A opção não é um identificador permanente: pertence à lista carregada e pode mudar ao trocar período ou atualizar os dados. O número segue data efetiva, início e identificador, incluindo compromissos realizados, remarcados e avulsos; não é uma numeração por paciente ou por status. A disponibilidade do botão limita a seleção, não a numeração.

Nomes completos e pontuação interna são preservados. Palavras como em, às ou opção dois dentro do nome não são comandos; só um sufixo adicional escolhe a ocorrência. De um a dez, aceita números falados; acima de dez, use algarismos canônicos no comando editável. Sem opção, homônimos continuam recusados; rótulos legados exatos permanecem disponíveis quando únicos.

## Revalidação do destino

Opção, paciente, ocorrência, action e record devem corresponder. Metadados, epoch e cadeia de ciclos da interface entram na equivalência: representações idênticas podem ser deduplicadas, mas divergentes competem e não autorizam escolher a primeira. Aliases concorrentes também competem. A aplicação resolve novamente o pedido e compara o fingerprint antes de clicar.

Reload, renumeração, alteração de identidade e troca de espaço invalidam propostas antigas. O preparo e a abertura de detalhes não escrevem dados nem iniciam atendimento. As opções de série da 0.2.75 continuam sendo seletores separados para encerrar ou antecipar término de uma série.

## Evidências e limitações dos testes

O primeiro conjunto unitário, com 93 casos, foi repetido pelo MAIN: 52 passaram e 41 falharam em 152,35 ms antes da implementação. Depois, foram acrescentadas duas verificações de coerência inicial entre patient-id/original-date e o record. No código congelado, os 95 novos casos e os 59 de séries passaram juntos, 154/154 em 180,77 ms. O conjunto JavaScript padrão passou 960/960 com os metadados ainda 0.2.75 e novamente com metadados 0.2.76.

O RED de interface foi observado em duas execuções separadas: um caso falhou em 19,3 s pelo agente de testes e em 20,1 s pelo MAIN. O calendário e os controles corretos estavam montados, mas faltava o atributo de opção; não houve IPC desconhecido. Esses resultados não são uma única suíte de dois casos.

A rodada final do novo fluxo passou 19/19 em 1,5 min, sem retries. Cobriu Dia/Semana/Mês, homônimos, mesmo horário, nomes pontuados e com delimitadores, legado, número 11, opções inválidas, realizadas/remarcadas/avulsas, reload, renumeração, identidade, troca de espaço, representações idênticas/divergentes e aliases concorrentes. As verificações exigem detalhes do alvo exato, zero escritas e nenhum início/edição de sessão. A captura da interface com dados fictícios foi inspecionada.

Um dos cenários de ordenação devolve um superset fictício por IPC para provar que registros carregados, mas fora do dia visível, não renumeram o subconjunto mostrado. Isso testa a apresentação com esse retorno simulado; não afirma que o backend real devolva dados fora do intervalo solicitado. Os demais cenários preservam seu filtro normal de intervalo.

A primeira regressão selecionada teve 66 aprovados e três falhos em 69 casos, em 3,0 min. Os três replays antigos simulavam frames de fala não silenciosos continuamente e atingiam o limite de 12 segundos, mas ainda esperavam preparo automático. A falha apareceu como aviso de corte em vez da proposta. As duas fixtures de mídia agora emitem fala curta seguida de silêncio, sem mudar transcrições, dados de destino ou produção; mantêm confirmação, duas capturas e verificações de persistência, acrescentando limpeza, PCM abaixo de 12 segundos e ausência do aviso de corte. A rodada final passou 69/69 em 3,4 min, sem retries, separadamente dos 19 novos cenários. Não são uma execução única de 88 casos nem regressão integral de todas as áreas.

Lint passou sem erros e com os oito avisos anteriores; o build frontend passou com o aviso de chunk acima de 500 KiB. A revisão independente aprovou o código congelado e os testes por inspeção, sem execução própria.

## Pacote e validações restantes

Rust release/offline/locked passou 135 testes, zero falhas e um ignorado em 7,45 s, com metadados 0.2.76. Não houve mudança funcional Rust.

[Instalador Windows x64](../src-tauri/target/release/bundle/nsis/Círculo_0.2.76_x64-setup.exe): **135.887.968 bytes**, SHA-256 `2b9599d4aebddb49f6b56003dbd4f8003d190eaa4f8ceed3b2bdc132a86df45b`. O build NSIS offline/locked terminou com código zero. A auditoria conferiu versão, hash e alvo x64; Authenticode NotSigned. O conteúdo interno não foi extraído, e instalação, execução e desinstalação deste pacote não foram testadas.

Manifest local: `C:\Users\alexandre\AppData\Local\Temp\circulo-0276-audit-20261004.json`. O override temporário de build foi removido; configuração oficial do updater e chave pública foram preservadas. Não houve assinatura de atualização automática nem publicação de Release. A instalação 0.2.61 foi conferida por metadados e não alterada; o perfil existente não foi modificado pelo trabalho. Os avisos anteriores de chunk acima de 500 KiB e PDB do OpenSSL permaneceram.

Não houve nova ASR, captura física, síntese, download de modelo ou alteração do prompt. Os testes usam IPC e mídia simulados; replays anteriores não comprovam reconhecimento novo. Senhas e seleção de arquivos continuam manuais. Limpeza de recovery e compatibilidade com backups antigos permanecem fora do escopo. O incremento não homologa microfone físico nem cobre universalmente todas as ações do sistema. Somente dados fictícios foram usados; a meta continua ativa.
