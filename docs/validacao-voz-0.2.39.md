# Assistente de voz 0.2.39 — 03/10/2026

Inclui as melhorias posteriores à 0.2.38: consultas naturais de calendário, início de sessão por paciente/data/horário, abertura de formulário para remarcar/cancelar, limpeza de campos por voz e identificação dos adendos pelo horário. Botões duplicados da mesma ocorrência usam uma identidade de ação explícita; registros diferentes continuam separados. Veja [comandos e pendências](melhoria-continua-voz.md).

O pedido prepara uma proposta; “confirmar” aplica. Iniciar cria ou retoma um rascunho do compromisso existente. Cancelar e remarcar apenas abrem o formulário: o motivo e a confirmação de gravação não são omitidos. Compromissos inexistentes, realizados ou duplicados não são iniciados por esse pedido. Campos e ações continuam usando os handlers e validações do aplicativo.

Testes: 20/20 E2E finais de voz passaram, incluindo áudio sintético e segunda gravação de confirmação, seleção da ocorrência, descarte tardio, identidade de registro, duplicação de botões, adendos por horário e jornada de finalização. 48/48 testes do parser passaram após atualizar a asserção do texto da prévia para explicitar que iniciar pode criar um rascunho. A suíte JS geral teve 215 aprovações antes desse ajuste textual; a verificação posterior completa do parser cobre o ajuste. Lint passou com os quatro avisos anteriores. Build Vite, build Tauri NSIS offline/locked, repository guard e diff check passaram. Não houve mudanças na implementação Rust; não foi repetida nesta rodada a suíte Rust ou o self-test nativo com dados temporários da 0.2.38.

O teste intermediário detectou uma regressão ao separar o nome de campo do valor quando aparecia “para” no rótulo e “com” no valor; corrigida e coberta no E2E final. Um percurso antigo também foi corrigido para consultar o dia correto após sua fixture passar a respeitar o filtro de datas. As falhas intermediárias não ficaram pendentes.

Instalador local: `Círculo_0.2.39_x64-setup.exe`, 135.877.192 bytes, SHA-256 `a08dfcb1feb800e31ef0bc129f8d932dba05898a38697a2f61f83d2ffb3d4485`. NSIS Windows x64, Authenticode `NotSigned`. Manifest de auditoria: `%TEMP%\circulo-0239-audit-20261003.json`. A configuração temporária sem assinatura updater foi removida após o build. Não publicado como Release nem habilitado para download automático nesta entrega.

Instalação silenciosa retornou código 0. Executável instalado reportou 0.2.39. Os quatro arquivos locais do perfil foram preservados byte a byte antes da primeira abertura, com snapshot em `%LOCALAPPDATA%\Círculo-update-backup-20261003-0239`.

Smoke de processo instalado: abertura produziu janela Círculo responsiva; fechamento normal retornou verdadeiro e o processo terminou. Não houve criação de dados nem interação com formulários nessa conferência. O verificador de consistência conferiu versão, tamanho e hash do pacote contra README e esta nota.

Limitações: microfone humano e cliques na janela instalada não foram validados visualmente; testes de frontend usam backend e áudio sintéticos. Senhas e janelas Windows para arquivos permanecem manuais. Nomes/títulos transcritos podem precisar de revisão. A meta de cobertura contínua permanece ativa; não afirmar que todos os fluxos já têm linguagem natural.
