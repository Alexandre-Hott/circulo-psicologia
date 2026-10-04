# Validação do assistente de voz 0.2.73

Esta entrega torna explícito quando a gravação chegou ao limite e pode estar incompleta. Conserva o texto reconhecido para revisão, sem preparar automaticamente uma proposta cortada. Também corrige a leitura dos WAVs no teste opt-in; esse decoder é somente de teste, não uma mudança do reconhecimento em produção.

## Captura e revisão

O aplicativo informa o limite de 12 segundos antes e durante a captura. A captura retorna a causa do encerramento, silence ou max-duration, e o limite efetivo. O host encaminha esses metadados junto do texto, sem mudar o IPC Rust. Tanto o teto de amostras quanto o timer identificam max-duration; pausa normal mantém silence.

Ao atingir o limite, o assistente descarta a proposta anterior, conserva literalmente a transcrição no campo editável e apresenta um aviso separado. Não chama o parser automaticamente. O usuário confere ou completa o texto e clica em Preparar rascunho; a confirmação existente continua necessária. Esse caminho é uma exceção explícita ao preparo automático, não um novo comando por voz. A mensagem comum de transcrição é ocultada nesse estado para evitar repetir instruções.

String legada e resposta estruturada terminada por silêncio mantêm o fluxo anterior. O aviso não entra no comando nem no conteúdo clínico. Limite de captura, modelo, prompt A, parser, buffers, abortos, banco e cofre permanecem preservados. Não houve vocabulário experimental B ou reparo de texto reconhecido.

## Testes de captura e interface

Antes da correção, os 16 testes de captura tiveram seis aprovados e dez falhos pela ausência dos metadados. Depois passaram 16/16: incluem timer, teto de amostras, pausa normal, duração limitada, erro sem fala e liberação dos recursos no cancelamento.

O primeiro teste de interface falhou na montagem por duas cópias de React; essa falha não foi atribuída à produção. Fixtures HTML/JSX com imports normais corrigiram a montagem. A repetição selecionada então reproduziu o problema real: após resposta estruturada, o editor conservava Abrir Agenda em vez da nova transcrição. Esse RED ocorreu antes da implementação de Center e Vault.

A primeira regressão selecionada posterior teve 26 aprovados e um falho em 27 casos, em 44,3 s. A única expectativa antiga exigia uma proposta automática após 96.000 amostras a 8 kHz, ou seja, no limite de 12 segundos. O caso foi ajustado para exigir aviso, texto editável e ausência de proposta até preparo manual; as checagens de buffers zerados, recursos fechados e zero writes continuam.

Em outra execução, os seis replays históricos falharam porque suas fixtures simulavam fala contínua até o teto. Somente a mídia simulada foi ajustada para fala curta seguida de silêncio; corpus, transcrições, alvos, snapshots e confirmação por segundo áudio foram preservados. Acrescentaram-se checagens de duração abaixo de 12 segundos, recursos fechados e buffers zerados. Não houve alteração de resultados de reconhecimento para obter aprovação.

No código final congelado, uma única regressão selecionada passou **33/33 em 1,0 min**, Edge headless, worker único, sem retries: seis casos de corte/compatibilidade, 13 do assistente, sete de navegação, um de autosave e seis replays. JS final passou 783/783. Lint teve zero erros e os oito avisos anteriores; o aviso novo da fixture foi removido. Repository guard e diff check passaram. As execuções anteriores e a final são rodadas distintas, não uma regressão integral.

## Leitura do áudio no teste nativo

O opt-in antigo lia PCM desde offset44, mas os WAVs preservados têm PCM desde46. O helper cfg(test) agora percorre chunks RIFF/WAVE com limites e padding, localiza fmt/data e lê apenas o payload PCM mono16. Aceita fmt16/18 e recusa truncamento, duplicados, formatos incompatíveis, taxa fora de 8–192 kHz e duração acima de 12 segundos. Escala PCM/32767 preservada, sem novo resampling ou clamp no decoder.

Os 33 testes novos primeiro produziram RED de compilação E0432 pela ausência do helper; não foram 33 falhas de execução. Após a implementação, Rust passou 135 testes e um opt-in ignorado, zero falhas, em 8,49 s. A repetição final release/offline/locked, já com metadados 0.2.73, passou novamente 135 testes, zero falhas e um ignorado, em 8,56 s. Revisão independente aprovou os contratos.

## Limitações e evidência

Não houve nova inferência nativa ou gravação física nesta rodada. Os testes de interface usam mídia e IPC simulados; o decoder usa WAVs construídos em memória. A avaliação semântica da 0.2.72 continua sendo evidência histórica de dois aprovados, dois falhos e um não avaliado, não uma medição desta versão com decoder corrigido. Microfone físico, todos os comandos e persistência instalada não foram homologados aqui. Seleção de arquivos e senhas continuam manuais; preparo após corte também é manual. A meta permanece ativa.

Limpeza de recovery e compatibilidade com backups antigos seguem fora do escopo. Falha preexistente de kill/crash não tem garantia de limpeza; remoção normal não é apagamento seguro. O aplicativo instalado permanece 0.2.61; nenhum perfil clínico foi usado ou alterado por esta rodada.

Logs locais externos: C:/Users/alexandre/AppData/Local/Temp/circulo-73-ui-final.log, circulo-73-node-final.log e circulo-73-rust-final.log. Hashes SHA-256 congelados: captura E4CB688A963443F8A984EA01D84C492B0B0460BAF30461E3F60D60B0F1FE9BF2; Center 6B2A234520576ED99893D27B703F3953EA5DEF845120F1F8207A095BCB25062C; Vault AAE464DF41D9C824F91A4030478C4FC1505E4ACFA80953F36E78F7CB0E22F78C; native_voice.rs 82AC1A29A62E38BED5233436C2411C91AF25F8223AD3D02CFCA2393734F197E5.

## Instalador para teste local

[Instalador Windows x64](../src-tauri/target/release/bundle/nsis/Círculo_0.2.73_x64-setup.exe): 135.884.954 bytes, SHA-256 `d57c4964399d16802c81e53b38204998e1d45aadbe4e1904d091bfdc1851ec27`. Build NSIS offline/locked exit0; compilação Rust em 39,69 s. Aviso anterior de OpenSSL sem PDB permanece. Override externo temporário removido após o build; configuração oficial do updater preservada.

Auditoria de metadados exit0: PE 0.2.73, x64, NotSigned. Manifest: C:/Users/alexandre/AppData/Local/Temp/circulo-0273-audit-20261004.json. Conteúdo interno não extraído; pacote não instalado ou executado. Sem assinatura updater/Authenticode e sem publicação de Release. Entrega local para teste com dados fictícios, não atualização nova já disponível no GitHub.
