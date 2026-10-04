# Validação de voz do Círculo 0.2.83

Esta etapa corrige a recusa de comandos como “Editar comportamento. Pede ajuda.”. O parser aceita um ponto ou vírgula imediatamente após a palavra comportamento, seguido de espaço obrigatório. Os verbos existentes permanecem iguais; títulos, descrições, IDs, confirmação e conteúdo clínico não foram normalizados ou substituídos. A meta de melhoria contínua permanece ativa.

## Testes e revisão

Antes da correção, a rodada unitária ampliada do principal teve sete testes: três passaram e quatro falharam. Depois da mudança de uma regex, os sete passaram. O arquivo foi acrescentado ao npm test, sem remover os testes anteriores. Com metadados 83, a suíte JavaScript passou 1891/1891 em 12,71 s; Rust release/offline/locked passou 138 testes, com um opt-in ignorado, em 8,77 s. Nenhuma nova inferência de voz foi executada nesta etapa.

A conferência do principal de todo o arquivo da biblioteca passou nove cenários em 1,1 min, com um worker e zero retries, na porta padrão 5189. A variável PLAYWRIGHT_PORT fornecida nessa rodada não é a variável E2E_PORT da configuração; por isso a porta pretendida 5257 não foi usada. A execução teve seu próprio servidor e terminou com código zero. Dois cenários usam o botão de microfone com PCM e transcrições fixas simulados; os sete anteriores preservam as verificações por comando digitado.

O primeiro cenário novo recusa um título ambíguo, escolhe a opção dois, abre o ID second na versão 1, preenche a descrição e só grava após confirmar o salvamento. A gravação única leva esse registro à versão 2, sem alterar o primeiro comportamento, pacientes, rascunhos ou o snapshot da sessão histórica. O segundo verifica ponto e vírgula no cabeçalho, criação e edição do mesmo ID, título e descrição literais e confirmação adicional do diálogo existente. A captura confere buffers, recursos de áudio, payload e ausência de tráfego externo inesperado.

O autor também passou cada novo cenário focalmente. Antes do resultado final do segundo, duas expectativas do teste falharam: descrição ausente da prévia genérica e confirmação adicional do guard existente. Somente essas expectativas foram ajustadas; não houve mudança nos handlers. Revisão independente estática aprovou a regex, os sete testes unitários, o helper opt-in e os dois cenários. Lint terminou sem erros, com oito avisos anteriores; guard e diff passaram.

Hashes finais da mudança funcional e provas:

- Parser: `18963D81AD6F29ABFC9321A2EE92C9390DE7C8C7DB2B9175F1F1411F88FB1A39`.
- Unitários: `781221B01496BE5F42AF8EA75F59949FDD5F0C10251433CFDD11D77412867BC5`.
- Interface da biblioteca: `F32D60FBBD35D5E15C2C47DBFDDB47C411B1B959C2182011953D34B2E11B9CDC`.

## Prova adicional do fluxo rápido de sessão

Depois do pacote 83, um caso novo de captura simulada verificou Registrar sessão → Criar e iniciar sessão. O autor passou 1/1 em 28,4 s, sem falhas preliminares. A conferência do principal de todo o arquivo de calendário passou 14/14 em 1,2 min, na porta 5259, com um worker e zero retries. São rodadas separadas. O comando e sua confirmação usam áudios distintos; os campos de data e horário também foram preenchidos por esse caminho. Preparar não grava nada. Após confirmar, exatamente uma criação de compromisso para Lia e um início de rascunho usam a série criada e a mesma data, sem duplicação. Pacientes, compromisso e rascunho concorrentes e histórico foram preservados.

O helper é opt-in; os casos anteriores de falha, retry e contexto de desbloqueio permanecem intactos e passaram na mesma conferência. Revisão independente estática aprovou payloads, identidade e limpeza de recursos/buffers. SHA-256 do arquivo de testes: `C0C45F872E65BFF155972675800A147601A36CE8D2878D4A8997BBE099952BCB`. Isso não foi uma nova inferência de voz nem validação da janela instalada. Não houve alteração de produção ou outro build por causa dessa prova.

## Instalador para teste local

O [instalador para Windows x64](../src-tauri/target/release/bundle/nsis/Círculo_0.2.83_x64-setup.exe) foi gerado com sucesso, com compilação release em 1 min 02 s e término do bundle NSIS com código zero. Tem 187.067.492 bytes e SHA-256 `ee04cfa4545e0dd07ca8c70aca6bec5dde801ee7f2ce6bc68fd0dcad4fb36c81`. A auditoria de metadados em `C:\Users\alexandre\AppData\Local\Temp\circulo-0283-audit-20261004.json` confirmou versão PE 0.2.83 e Authenticode NotSigned.

O build release/offline/locked usou --no-sign e um override temporário externo que desativou somente os artefatos assinados do updater. O override foi removido após o build. Endpoint, chave pública e configuração oficial de atualização foram preservados; nenhuma chave privada foi acessada. Avisos anteriores de tamanho do bundle JavaScript e de PDB OpenSSL permanecem. Alvo declarado do aplicativo x64; o stub do instalador NSIS é distinto do executável do aplicativo. O conteúdo interno não foi inspecionado. Este pacote não foi instalado, executado, assinado ou publicado em Releases; não há atualização automática publicada da versão 83.

## Limites

Os cenários simulam mídia e IPC. Não comprovam que o reconhecedor sempre produza esses textos nem que um microfone físico funcione na janela instalada. O backend nativo, modelo, script sintético e cofre não receberam alterações funcionais; a prova nativa anterior está no relatório da versão 82 e não foi repetida aqui. Não se afirma cobertura universal das ações. Senhas, seleção de arquivos e início explícito do áudio permanecem manuais. Perfil instalado preservado; limpeza de recovery e compatibilidade de backups antigos não foram investigadas.
