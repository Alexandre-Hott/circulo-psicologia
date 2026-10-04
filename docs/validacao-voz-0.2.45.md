# Assistente de voz 0.2.45 — 03/10/2026

## Incremento consolidado

Assistente na entrada bloqueada e primeira configuração, restrito aos controles visíveis. Senhas permanecem manuais; contexto de pacientes vazio antes do desbloqueio. Criação/desbloqueio usam os formulários e validação normais. Ajuda curta própria da entrada, sem exemplos clínicos nessa tela.

Corrigido áudio atrasado que podia aceitar uma confirmação nova após desbloquear no mesmo espaço: aborto antes do RPC de entrada, aborto em ambas as transições de bloqueio e invalidação da geração ao desmontar o painel. Epoch inclui bloqueado/desbloqueado. Revisor independente apontou o cenário e confirmou a correção após teste red/green.

## Evidência

229/229 JS e repository guard repetidos na versão0.2.45. Na implementação consolidada antes do empacotamento:78/78 E2E shell/interface/settings em4,2min;2/2 transições de áudio em20,6s;9/9 painel isolado em21,0s. São rodadas distintas, não nova execução conjunta de89cenários na versão45. Componentes reais, mídia/transcrição, updater e backend sintéticos. Tentativas intermediárias, achado do revisor e limites estão em [cobertura](voz-cobertura-interface.md).

Build Vite/Tauri NSIS offline/locked concluído. Avisos anteriores de chunk>500KiB e PDB OpenSSL ausente não impediram o build. Override temporário removido; endpoint/chave pública e configuração oficial de updater preservados. Backend Rust não modificado, suíte Rust e smoke nativo não repetidos nesta rodada.

## Entrega local

`Círculo_0.2.45_x64-setup.exe`, **135.872.658 bytes**, SHA-256 `acedea5cdd0f860677948056aa97652b2c97be1218ed1c65e78dfd028dbb60b4`.

Auditoria `%TEMP%\circulo-0245-audit-20261003.json`: PE0.2.45, x64, Authenticode NotSigned. Auditoria registra metadados, sem extração interna; suas flags de instalação/execução permanecemfalse e não representam a instalação posterior.

Instalador silencioso exit0; executável instalado com ProductVersion0.2.45. Snapshot em `%LOCALAPPDATA%\Círculo-update-backup-20261003-0245`: quatro arquivos principais copiados/verificados por hash. Após instalar, `circulo.db`, `auto-backup.db`, `vault.key` e `daily-unlock.dpapi` permaneceram byte a byte iguais. Whisper e ggml-base.bin instalados conferidos por hash contra os recursos locais do build. Nenhum conteúdo do perfil foi lido nem dado acrescentado. Aplicativo não aberto nesta rodada.

## Limites e pendências

- Sem Release/publicação ou assinatura updater: pacote local não será oferecido automaticamente pelo GitHub. O código-fonte do PR não é link público para baixar este EXE.
- Microfone humano e interação visual na janela instalada continuam não validados. Verificar recursos do áudio não prova reconhecimento de fala.
- Senhas e escolha de arquivo Windows permanecem manuais; controles avançados bloqueados ainda não têm homologação integral por comando.
- RPC de entrada atrasado/falhando e interrupção durante gravação permanecem cenários específicos pendentes; os testes novos retiveram a resposta do backend de transcrição.
- Não houve limpeza de recovery nem compatibilidade com backups antigos. Meta ativa, sem declaração de cobertura universal.
