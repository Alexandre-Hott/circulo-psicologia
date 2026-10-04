# Validação de voz do Círculo 0.2.84

Esta entrega inclui a [correção da confirmação digitada](voz-confirmacao-digitada.md): “Confirmar.” não apaga a proposta antes da aplicação explícita. O [instalador para Windows x64](../src-tauri/target/release/bundle/nsis/Círculo_0.2.84_x64-setup.exe) foi gerado para teste local com dados fictícios. Tem 187.080.647 bytes e SHA-256 `280fed1625ece9ddbb91f9b77dfa91cc6c6be57ac90e64e1903dcb87efb1bdcb`. Não foi instalado, executado, assinado ou publicado. A meta continua ativa.

## Reconhecimento de quatro pedidos

Uma rodada opt-in pelo backend Rust real transcreveu os quatro WAVs fictícios novos, sem retries. O processo supervisionado do principal usou count4, recursos locais explícitos, release/offline/locked, captura de stdout/stderr por bytes e limite global de 600 s, com 60 s por chamada no backend. Terminou com código zero em 31,443 s; compilação 12,74 s e teste 18,34 s. Uma tentativa anterior de abrir o processo foi rejeitada por diretório de trabalho inválido antes de executar o script ou criar o claim; não houve rodada nativa anterior ou repetida.

| Pedido pretendido | Texto Rust bruto | Resultado estrito |
| --- | --- | --- |
| Criar comportamento Espera a vez | Criar comportamento. Espera a vez. | Falha literal: o título criado seria “Espera a vez.”, com ponto |
| Editar comportamento Pede ajuda | Editar comportamento pede ajuda. | Intent completo correto, ID help único |
| Abrir análises | Abrir análises. | Intent completo correto, destino analytics |
| Clicar em Registrar sessão | Clicar em Registrar Sessão. | Não avaliado pelo parser puro; replay posterior abriu somente o formulário rápido |

O harness passou, mas isso não equivale a quatro ações corretas. A avaliação pura estrita deu dois aprovados, um falho e um não avaliado, decisão semântica 2; a chamada PowerShell retornou código 1. O ponto no título foi preservado, não removido para obter acerto. Um avaliador preliminar que normalizava nomes/títulos foi rejeitado e não executado; permanece como artefato histórico. O novo usa igualdade profunda de todas as chaves/valores dos três intents, confere bytes com o único marker e só tolera caixa/pontuação terminal na comparação textual do quarto comando.

Os textos Unicode/codepoints foram registrados antes da síntese. A geração anterior teve quatro Speak, zero retries e sinal PCM22050 mono16 não zero, com durações 2,30 a 3,69 s. A auditoria independente confirmou os 43 pins antes/depois: cinco fontes, 19 recursos, três referências e oito históricos nas duas localizações. O principal conferiu novamente fontes, recursos e WAVs antes/depois da inferência. A mudança posterior de metadados para 84 não alterou essas fontes funcionais. Não há latência por caso nem logs internos Whisper.

Artefatos em `C:\Users\alexandre\AppData\Local\Temp\circulo-trusted4-short-d9e220c93018447387a8e0424a348ce5\results`: stdout `A8BCC868616134CB8416F4E64D1ABFC827877652291D3F86E8C08C33D7FF4AA9`, stderr `65523252DC695ACAA878E5D97C480A68A0018EAE69F21884D1723F26628F9DFC` e relatório estrito `DE49F084E3DDBE2A78CE7F55126B7B7F76E71A812942DA8C59A6FCCEBCCC97A7`. Entrada extraída do marker `6127189F601815D2429612E3225745CA456E8AE17B7227DB827241085E2184DE`; avaliador estrito `286E6EC331DB45192DA3AD024AEFFFF58C9B47688D902C96FC23DA1AF1382B0A`.

## Replay dos textos na interface

Após o build, os quatro textos Rust intactos passaram4/4 na UI do autor em23,9s e4/4 na conferência do principal em23,7s. Rodadas separadas, um worker e zero retries, portas5263/5264. A proposta só abre formulário ou espaço depois do segundo áudio “Confirmar comando.”, reutilizado da rodada Rust fresca anterior de oito áudios; isso não é outra inferência. O formulário de criação conserva literalmente “Espera a vez.”, a edição abre somente help/v1, Análises consulta os filtros exatos e Registrar sessão abre somente Novo compromisso/Avulsa. Catálogo, pacientes e rascunhos concorrentes ficam iguais, sem Save ou outra gravação. Recursos e buffers da captura foram encerrados/zerados; não houve tráfego externo inesperado ou janela nativa.

A primeira rodada do autor passou três casos e falhou na expectativa de uma única leitura analítica; a aplicação fez duas consultas idênticas. Somente o teste foi ajustado para exigir ao menos uma consulta e validar cada payload integralmente. Revisão estática independente aprovou fixture, leitura das props atuais sem callbacks e os quatro cenários. O replay passou, mas não transforma a divergência literal do reconhecimento em acerto; o relatório puro original2/1/1 permanece intacto. Não houve mudança de produção ou outro build por esse replay.

- Fixture de transcrições: `07FF18B9C6405EA68352BAA4AE14A683981681300A2FF32B9A8562C0AB895C7C`.
- Replay da interface: `C9672580C62CA86ED4C0E97C6D0E58D65AE4D7D540895B280FCE22DE629EBD13`.

## Testes e pacote

Com metadados 84, JavaScript passou 1891/1891 em 5,47 s; Rust release/offline/locked passou 138 testes e ignorou o opt-in, em 11,57 s. Esse opt-in foi executado separadamente na rodada de quatro áudios descrita acima, antes da atualização mecânica. A confirmação foi previamente conferida em 25/25 de assistente e 26/26 de ditado, em rodadas separadas; o fluxo rápido de sessão passou14/14 no arquivo de calendário. Esses testes usam mídia/IPC simulados, não nova inferência.

Build Tauri/NSIS release/offline/locked terminou com código zero e compilação release em 56,38 s. Usou --no-sign e override temporário externo para desativar somente os artefatos assinados do updater; o override foi removido. A configuração oficial do updater, endpoint e chave pública permanecem iguais; nenhuma chave privada foi acessada. Avisos anteriores de tamanho do bundle e PDB OpenSSL permanecem.

Auditoria de metadados em `C:\Users\alexandre\AppData\Local\Temp\circulo-0284-audit-20261004.json`: PE0.2.84, Authenticode NotSigned, alvo declarado do aplicativo x64. O stub NSIS é distinto do executável do aplicativo; o conteúdo interno não foi inspecionado. Sem instalação, execução, desinstalação ou publicação em Releases desta versão. Perfil e aplicativo instalados preservados.

## Limites e próxima prova

Os quatro textos Rust foram conferidos na interface; a diferença no título permanece como limitação explícita. Reconhecimento nativo e aplicação UI são provas separadas; não há homologação de microfone físico, precisão geral ou cobertura universal. Senhas, seletores de arquivos e início explícito do áudio permanecem manuais. Limpeza de recovery, backups antigos e novas funcionalidades clínicas ficaram fora do escopo. A próxima auditoria procura lacunas funcionais reais nas oito áreas, sem criar funcionalidades ou prolongar o ciclo apenas com testes redundantes.
