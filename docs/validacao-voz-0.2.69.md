# Validação de voz 0.2.69 — 04/10/2026

## Escopo

Acrescentar trechos aos quatro textos do rascunho: observação, procedimentos, resultado e encaminhamento. Exemplo: “Acrescentar procedimentos da sessão de Ana Clara com fez jogo de turnos.” Não substitui o texto anterior. Os comandos antigos de preencher/anotar/registrar continuam substituindo o campo.

A base vem do formulário visível, incluindo texto ainda não salvo. Proposta guarda identidade, epoch, revisão e base literal; pai e filho revalidam antes de aplicar. Mudança de texto, paciente, rascunho, área ou remount invalida a proposta. Sem snapshot pronto, não há fallback para dados persistidos. Acrescenta um espaço após uma base não vazia, sem normalizar whitespace. Limite combinado: 4000 unidades UTF-16, sem truncamento.

Confirmação aplica ao formulário; gravação exige “Salvar rascunho”. Banco, cofre, captura de 12 segundos e autosave manual existentes não foram ampliados. Dados exclusivamente fictícios.

## Evidência intermediária

- RED inicial: 3 passaram, 19 falharam em 22 unidades.
- Central + limites + append: 125/125 passaram antes da captura nativa.
- Primeiro shell append: 19/19 passaram em 1,2 minuto, porta 5212.
- Regressão selecionada: 20/20 passaram em 1,8 minuto, porta 5213; limites, indicadores, vínculos, contexto, adendo e autosave. Não é suíte E2E integral.
- Rust release/offline/locked 0.2.69: 86 passaram, 0 falharam, 1 ignorado, 14,33 s.

## Reconhecimento sintético nativo

Uma captura SAPI rate 0, offline, com cinco WAVs abaixo de 12 segundos. CLI cinco exits 0; teste Rust opt-in exit 0, cinco transcrições idênticas às do CLI em 9,83 s. Wrapper exit 1 porque a avaliação de intents completos encontrou 1 Passed, 3 Failed e 1 NotEvaluated. Não é falha de execução do backend nem aprovação do conteúdo clínico.

Transcrições preservadas, sem correção:

1. “Acrescentar observação da seção de Ana Clara compidiu ajuda.”
2. “Acrescentar procedimentos da sessão de Ana Clara com fez jogo de turnos.”
3. “Acrescentar resultado da seção de Ana Clara com manteve atenção.”
4. “Acrecentar encaminhamento da seção de Ana Clara com próxima seção semanal.”
5. “Confirmar comando.”

Somente procedimentos correspondeu originalmente ao intent esperado completo. Observação perdeu o separador “com” e teve conteúdo incorreto; não deve ser inferida. Encaminhamento contém “seção” no próprio texto clínico; esse conteúdo deve continuar literal, não virar “sessão”. Confirmação precisa de proposta na interface e não é avaliada pelo parser central isolado.

Fixture: test/fixtures/native-voice-clinical-append-20261004.json. WAVs e logs: C:/Users/alexandre/AppData/Local/Temp/circulo-whisper-synthetic-4d5d6738249843e7b82ebf665557f4df. Durações: 5,672; 6,438; 5,874; 6,635; 2,458 s. Bytes: 250194; 283966; 259100; 292646; 108450. Nenhuma nova captura foi solicitada para esconder essas falhas.

Após correção restrita do cabeçalho de append, o mesmo corpus dá 2 Passed, 2 Failed e 1 NotEvaluated contra as intenções originais estritas. “Seção” na posição do cabeçalho e “Acrecentar” como verbo inicial são aceitos. Resultado agora corresponde integralmente; encaminhamento é roteado, mas ainda falha na fidelidade clínica esperada, pois preserva “próxima seção semanal.”. A observação sem delimitador continua recusada. A captura original não foi reexecutada nem sua fixture alterada.

## Código final

Rodada final selecionada: **43/43 passaram em 2,9 minutos, exit 0**, porta 5214, Edge headless, worker único e sem retries: append19, replay nativo4 e regressão20. Produção permaneceu com os quatro hashes congelados durante testes/build. Replay usa transcrições intactas e dois áudios: prévia sem efeito e confirmação antes de aplicar. Observação incompleta recusa mesmo após confirmar; encaminhamento preserva a palavra errada literal. Não é suíte E2E integral nem validação de microfone físico.

393/393 unidades passaram, exit 0. Focal central/limites/append: 128/128. Lint exit 0, oito avisos anteriores e nenhum novo; guard do repositório e diff-check aprovados. Revisão independente estática aprovou snapshot, validação antes de efeitos e aliases restritos ao cabeçalho. Não executou microfone/interface instalada.

Produção congelada antes da rodada final e do build. SHA-256: centralCommandRouter.js 11D670DCC60E2E7C8C26FB559D558C7995FC1634B4ECF77ED7B05D3927F71799; DesktopVault.jsx 78946845207682B43C03E57833EB84209A95F2847731296C0F0EE50F1BAFB3D4; DesktopSessions.jsx 3728F97D43050F788AF7BE84573A2AEE891018E4F3285556740F804851AC7EE4; clinicalTextAppend.js 022977A6A6628964DFFF082AE8C78899722B3BAEE16F1692282A4A411B7C4CE0.

## Pacote local

[Instalador Windows x64](../src-tauri/target/release/bundle/nsis/Círculo_0.2.69_x64-setup.exe): 135.892.456 bytes, SHA-256 `25952d0321b63108faa474e87ae6d71c2d9fea7ab50ac162b2e30c74d7c1f8e1`. Build NSIS offline/locked exit 0; compilação Rust 40,32 s. Override temporário externo ao repositório foi retirado após o resultado terminal; updater oficial preservado. Avisos anteriores de chunk maior que 500 KiB e OpenSSL-PDB presentes.

Auditoria de metadados: PE 0.2.69, x64, NotSigned; manifest C:/Users/alexandre/AppData/Local/Temp/circulo-0269-audit-20261004.json. Conteúdo interno não extraído; pacote não instalado nem executado. Sem publicação de Release ou assinatura updater/Authenticode. A instalação observada permanece 0.2.61.

## Limitações e uso

Áudio sintético e replay com mídia/IPC simulados são evidências separadas. Microfone físico, jornada instalada e reconhecimento de texto longo não homologados nesta etapa. A primeira gravação permanece manual, por botão ou atalho. Senhas e seletores nativos de arquivos continuam manuais; recovery e backups antigos fora do escopo. A instalação 0.2.61 e o perfil cifrado não são alterados por estes testes.

A meta de melhoria contínua permanece ativa; este incremento não significa cobertura universal de todos os botões.
