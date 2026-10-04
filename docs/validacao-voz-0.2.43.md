# Assistente de voz 0.2.43 — 03/10/2026

Consolida o preenchimento de campos de data/hora com português explícito. Exemplos: “dez de outubro de dois mil e vinte e seis”, “três da tarde”, “vinte horas e três” (20:03) e “vinte e uma horas e trinta minutos” (21:30). Valores aparecem na proposta e só preenchem o formulário após confirmação. Não reescreve textos livres ou nomes e não executa comandos nativos diretamente.

## Provas do código consolidado

- 229/229 testes JavaScript passaram novamente com a versão 0.2.43; quatro testes do novo helper cobrem datas civis, anos explícitos, formatos numéricos, limites e ambiguidades.
- Rodada anterior de Agenda/interface: 24/24 E2E em 2,1 min. Após a revisão final do parser, o cenário ampliado de datas/horários passou separadamente em 20,8 s, incluindo as conversões 20:03 e 21:30, recusa de ambiguidade e payload final correto. Não apresentar como 24 casos repetidos após a revisão.
- A revisão encontrou duas falhas de separação de horas/minutos e uma restrição indevida de formatos numéricos com segundos; corrigidas e cobertas. O caso intermediário de mensagem de erro foi resolvido preservando o prefixo “Valor inválido”.
- Guard e build frontend passaram; lint com quatro avisos anteriores e alerta de chunk acima de 500 kB. Nenhuma alteração de implementação Rust; suíte nativa não repetida neste incremento.

## Limites

[Formatos aceitos](voz-datas-horarios.md) e [cobertura por ação](voz-cobertura-interface.md). Datas genéricas exigem ano; horas de 1–12 exigem período ou HH:MM. Sem aproximações, alternativas ou segundos falados. Formatos numéricos com segundos dependem da validação do campo. Ditado humano no microfone e interação visual nativa continuam sem validação. Senhas e escolhas de arquivos seguem manuais; cofre bloqueado não oferece assistente. Recovery e backups antigos não investigados.

## Empacotamento

Build Vite/Tauri NSIS offline/locked aprovado, com aviso anterior de PDB OpenSSL ausente. Override temporário removido após o build; configuração oficial de assinatura/updater intacta.

`Círculo_0.2.43_x64-setup.exe`, 135.880.605 bytes, SHA-256 `fff63083d0ff13268a83d4d7627742406562cffbe02b7df64620ecbfbab148e8`. Auditoria de metadados em `%TEMP%\\circulo-0243-audit-20261003.json`: versão PE 0.2.43, x64, Authenticode NotSigned. Conteúdo do NSIS não extraído; flags do manifest representam só essa auditoria, não o teste de instalação posterior.

Instalação silenciosa retornou 0 e executável instalado reportou 0.2.43. Os quatro arquivos principais do perfil permaneceram byte a byte iguais antes de qualquer abertura, com cópia verificada em `%LOCALAPPDATA%\\Círculo-update-backup-20261003-0243`. Aplicativo não foi aberto nesta rodada; não é smoke de execução nem validação de formulários nativos. Não foram adicionados dados.

Sem publicação em Release ou assinatura updater; pacote não oferecido automaticamente. A meta permanece ativa.
