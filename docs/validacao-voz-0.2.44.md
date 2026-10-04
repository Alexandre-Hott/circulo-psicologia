# Assistente de voz 0.2.44 — 03/10/2026

Consolida os incrementos posteriores ao instalado0.2.43:

- Recarregar agenda/análises, Verificar atualizações e Tentar instalação novamente identificam a operação por voz. Aliases antigos ficam compatíveis somente quando únicos; dois retries simultâneos não exigem navegar nem escolhem alvo arbitrariamente.
- Cabeçalhos semanal/diário da Agenda têm nome acessível Ver dia AAAA-MM-DD, igual ao mensal, sem mudar layout ou handlers.

## Evidência do código consolidado

229/229 JS passaram com versão0.2.44; repository guard aprovado. Nas rodadas anteriores desta mesma implementação: 20/20 E2E de retries/Análises/updater em58,2s;28/28 E2E de Agenda/interface em2,3min. Os cenários verificam alvos, payloads, recusa da ambiguidade, preservação de formulários, navegação de dias, Voltar sem escrita e fechamento de gavetas/vínculos. Essas rodadas são distintas e não representam uma nova execução conjunta de48casos na versão44.

Componentes reais com armazenamento, updater e chamadas Tauri sintéticos. Lint aprovado com quatro avisos anteriores e build frontend com alerta de chunk>500kB. Sem alteração da implementação Rust; suíte nativa não repetida nesta rodada. Microfone humano não validado.

## Entrega

Build Vite/Tauri NSIS offline/locked concluído; aviso anterior de PDB OpenSSL ausente não impediu o build. Override temporário removido; configuração oficial permanece preservada.

`Círculo_0.2.44_x64-setup.exe`, 135.879.482 bytes, SHA-256 `598b4e2a4cf1ea04f5447ac6c81c372b069beba968b932450efc66060de3bc23`. Manifest de auditoria `%TEMP%\\circulo-0244-audit-20261003.json`: versão PE0.2.44, x64, Authenticode NotSigned. Só metadados; conteúdo do NSIS não extraído e flags de instalação do manifest não representam o teste posterior.

Instalação silenciosa exit0, versão instalada0.2.44 conferida. Quatro arquivos principais do perfil permaneceram byte a byte iguais antes de abrir o app. Snapshot cifrado verificado em `%LOCALAPPDATA%\\Círculo-update-backup-20261003-0244`. Nenhum dado adicionado, aplicativo não aberto nesta rodada; não declarar smoke nativo/formulários/microfone. Sem publicação Release ou assinatura updater; pacote não oferecido automaticamente.

[Cobertura e pendências](voz-cobertura-interface.md), [retries explícitos](voz-retries-explicitos.md) e [formatos de data/hora](voz-datas-horarios.md). Permanecem ações/caminhos sem prova específica, entrada manual de senhas/arquivos e assistente ausente no cofre bloqueado. Não houve investigação de recovery ou backups antigos. Meta ativa, sem declaração de paridade universal.
