# Assistente de voz 0.2.40 — 03/10/2026

Consolida os incrementos posteriores ao instalador 0.2.39: abertura direta de registros, evolução e vínculos por paciente; análises por paciente/período; seleção explícita de rascunhos da mesma data; links internos das etapas/biblioteca e nomes simplificados de campos de adendo. Não seleciona arbitrariamente o primeiro rascunho quando há vários.

Também corrige “Agendar sessão quinzenal para Ana Clara na segunda às 15 horas online”: o horário numérico não absorve a modalidade. Modalidades conflitantes são recusadas. A revisão encontrou essa falha e o teste agora usa a frase originalmente problemática, sem contornar mudando a ordem das palavras.

## Evidência desta rodada

- 223/223 testes JS gerais passaram; parser completo 56/56 passou na conferência específica.
- Rodada conjunta E2E: 12/12 passaram (1,5 min). Quatro de agenda, quatro de ajustes/exportação/updater e quatro de registros clínicos. Componentes, roteador e gateway reais; apenas fronteira Tauri e armazenamento são sintéticos. Não provam cliques na janela instalada ou ditado humano.
- Agenda: payload completo da série quinzenal online, remarcação preservando identidade original, cancelamento com motivo e histórico, recusa sem alteração, encerramento/antecipação com primeira data excluída.
- Ajustes: inspeção agregada sem limpeza, cópia automática, licenças e bloqueio. Senha recusada pelo preenchimento de voz; entrada manual fictícia permite acionar o handler de backup, com seleção de arquivo cancelada na fixture.
- Exportação: recusar não invoca; confirmar usa apenas o paciente selecionado. Escolha de arquivo simulada como cancelada, sem arquivo criado.
- Atualização: recusa, falha sintética, nova verificação e tentativa; cadastro aberto não é descartado sem confirmação. Nenhum download ou instalador real executado por esses testes.
- Registros: vínculos CRUD e isolamento entre pacientes, indicadores com notas/limpeza/salvamento, duas revisões de contexto e adendos na sessão correta preservando original.
- Lint passou com os quatro avisos anteriores; repository guard, diff check e build Vite/Tauri NSIS offline/locked passaram. Vite alerta chunk acima de 500 kB; linker alerta ausência de PDB OpenSSL sem impedir build. Não houve mudança na implementação Rust; suíte Rust e self-test nativo de dados temporários não foram repetidos nesta rodada.

## Instalador e instalação

`Círculo_0.2.40_x64-setup.exe`, 135.879.624 bytes, SHA-256 `d340ad03c0fbbb27a4891d1ba42c752679e6fb2b65456eec00dfd754c329005c`. Windows x64, Authenticode `NotSigned`. Auditoria de metadados em `%TEMP%\circulo-0240-audit-20261003.json`; ela não extrai/inspeciona conteúdo nem executa o pacote. A instalação e o smoke de processo abaixo foram conferidos separadamente.

Instalação silenciosa retornou 0; executável instalado reportou 0.2.40. Os quatro arquivos principais do perfil foram preservados byte a byte antes da primeira abertura. Snapshot: `%LOCALAPPDATA%\Círculo-update-backup-20261003-0240`. Abertura instalada produziu janela Círculo responsiva; input idle confirmado, fechamento normal aceito e processo terminou. Nenhum formulário ou dado foi alterado nessa abertura.

Pacote local sem assinatura do updater, não publicado como GitHub Release e não oferecido automaticamente. A configuração temporária de build foi removida; configuração oficial de assinatura permanece intacta.

## Limites e próximas provas

Microfone humano e interação visual com a janela instalada continuam sem validação. Comandos testados via texto ou áudio sintético não garantem reconhecimento de qualquer nome. Senhas e diálogos nativos de arquivos permanecem manuais; o assistente fica disponível apenas após desbloquear. Não existe escuta permanente. Limpeza de recovery continua desabilitada e não foi investigada; compatibilidade com backups antigos não foi ampliada.

A meta permanece ativa, sem declaração de paridade universal. Próximas verificações: formulários completos de paciente (solicitante próprio e busca), cancelamento/edição da biblioteca preservando snapshots e comandos contra alvo/tela que mudam durante uma proposta. Consultar o histórico em `melhoria-continua-voz.md` para outras evidências já obtidas.
