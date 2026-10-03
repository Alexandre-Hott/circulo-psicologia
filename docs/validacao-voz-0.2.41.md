# Assistente de voz 0.2.41 — 03/10/2026

Biblioteca: títulos iguais agora mostram “opção 1”, “opção 2” nas ações de edição e seleção. IDs e versões identificam o registro no gateway; os checkboxes também incluem a identidade do rascunho. O formulário da biblioteca identifica se está criando ou editando um comportamento específico. Uma proposta preparada para um editor não preenche outro após uma troca interveniente. Não se alterou o modelo de persistência nem os snapshots de sessões finalizadas.

Corrigida a frase “Selecionar O próprio paciente solicitou o atendimento? como Sim”: o parser não remove cegamente o artigo inicial do rótulo. Considera tanto o rótulo literal quanto a forma com prefixo de campo, resolvendo contra controles visíveis e recusando ambiguidade. “Selecionar o campo O próprio…” continua funcionando.

## Validação

23/23 E2E passaram numa rodada conjunta (2,1 min): 16 casos existentes de interface de voz, quatro de biblioteca e três de campos de paciente. Os componentes e o gateway são reais; RPC e armazenamento são sintéticos. A captura/transcrição usada pelos casos de áudio é sintética, não microfone humano.

Biblioteca: editou somente a opção 2, cancelou a edição da opção 1 sem gravação, manteve o snapshot finalizado v1, selecionou/desmarcou IDs corretos, recusou proposta antiga após troca de editor e após troca de rascunho. O quarto teste inicialmente procurou um botão numa gaveta que havia sido recolhida pela remontagem do workspace; o percurso reabre a gaveta antes da proposta. Passou isoladamente e depois na rodada conjunta; não foi ampliado o timeout para ocultar o erro.

Pacientes: criação e edição com payload completo (nome, idade, ciclo calculado, modalidade e solicitante yes/no/null), revisão correta, cancelamento sem escrita, busca/limpeza, inclusão de arquivados e atualização da lista. Nascimento omitido é preservado pela fixture; o contrato nativo em `vault/db.rs` foi inspecionado e também preserva esse campo quando ausente. Nenhuma validação clínica adicional é alegada.

223/223 testes JS passaram. Lint passou com os quatro avisos anteriores; guard e diff check passaram. Build Vite/Tauri NSIS offline/locked passou, mantendo avisos de chunk acima de 500 kB e PDB OpenSSL ausente. Implementação Rust não mudou; apenas versão de pacote. Não repetida a suíte Rust nem self-test nativo de dados temporários nesta rodada.

## Pacote local

`Círculo_0.2.41_x64-setup.exe`, 135.880.630 bytes, SHA-256 `d0697394017bd2a90ce1d8bc9259989b103437529bf083a9f8a5747fc648d622`. Windows x64, Authenticode `NotSigned`. Auditoria de metadados em `%TEMP%\circulo-0241-audit-20261003.json`, sem extração do conteúdo interno. Configuração temporária sem assinatura updater removida após o build; configuração oficial intacta.

Instalação silenciosa retornou 0 e executável instalado reportou 0.2.41. Os quatro arquivos principais do perfil foram preservados byte a byte antes da primeira abertura, com snapshot `%LOCALAPPDATA%\Círculo-update-backup-20261003-0241`. Smoke de processo: janela Círculo responsiva, input idle confirmado, fechamento normal aceito e processo terminou. Não houve cliques em formulários nem criação/alteração de dados nessa abertura.

## Limites e próxima rodada

Sem publicação GitHub Release ou assinatura updater; não será oferecido automaticamente. Microfone humano e interação visual instalada continuam sem prova. Senhas e escolha de arquivos Windows são manuais; assistente apenas após desbloqueio. Sem escuta permanente. Recovery permanece desabilitado sem investigação, e compatibilidade de backups antigos não foi ampliada.

Meta ativa, sem afirmar paridade universal. Próximas verificações: pacientes/vínculos homônimos e escolha inequívoca por voz; reconhecimento de datas/horas faladas nos campos; consolidar matriz de todas as ações visíveis com evidência ou exceção explícita.
