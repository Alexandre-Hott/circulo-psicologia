# Assistente de voz 0.2.47 — 03/10/2026

## Pacote

`Círculo_0.2.47_x64-setup.exe`, **135.889.767 bytes**, SHA-256 `26e853d02c29c82db5e4d62e0a74a13e0215511085d77b5949564fdfd99cd818`.

Local: `src-tauri/target/release/bundle/nsis/`. Build Vite/Tauri NSIS offline/locked exit0; avisos anteriores de chunk >500KiB e PDB OpenSSL. Override temporário removido depois do terminal do build; configuração oficial de updater preservada.

Auditoria `%TEMP%\circulo-0247-audit-20261003.json`: versão PE0.2.47, x64, NotSigned, tamanho/hash acima. Somente metadados, sem extração. As flags false da auditoria descrevem esse momento anterior à instalação, não a verificação posterior abaixo.

## Instalação verificada

App previamente fechado. Cópia dos quatro arquivos principais em `%LOCALAPPDATA%\Círculo-update-backup-20261003-0247`, verificados por hash antes da instalação. NSIS silencioso terminou exit0, executável instalado ProductVersion0.2.47. Após instalar, `circulo.db`, `auto-backup.db`, `vault.key` e `daily-unlock.dpapi` permaneceram byte a byte iguais ao snapshot. Whisper CLI/modelo instalados conferidos por hash contra os recursos de origem. Nenhum conteúdo do perfil foi extraído ou dado acrescentado. App continua fechado; nenhuma abertura visual nesta rodada.

## Funcionalidade consolidada

- `Editar paciente Ana Clara` sem atributos abre o cadastro ativo de nome exato, preserva campos e só grava ao solicitar Salvar alterações. Pausa com pontuação após a palavra paciente é aceita sem reescrever o nome.
- `Editar comportamento Pede ajuda` abre o modelo reutilizável, não uma observação de sessão. Biblioteca é consultada novamente e ID ativo/versão são validados; Cancelar não grava e Salvar versão permanece separado.
- Homônimos, nomes/títulos parciais e alvos arquivados são recusados. Mudanças explícitas continuam usando os fluxos anteriores. Toda abertura via comando tem proposta/confirmação.

## Testes e revisão

**232/232 JavaScript** e guard repetidos na versão47. Antes do empacotamento, no mesmo código funcional: **28/28 E2E interface/biblioteca em1,9min**, lint/build/diff aprovados. Nova abertura de paciente também passou na rodada anterior22/22 E2E; não somar como testes distintos. Revisor independente não identificou achado concreto na abertura de comportamento. [Cobertura e tentativas intermediárias](voz-cobertura-interface.md).

E2E usam componentes reais com captura/transcrição/backend simulados. O [teste nativo sintético anterior](voz-audio-sintetico-20261003.md) avaliou12 WAVs no prompt entregue na46, sem microfone físico. Não repetido aqui; backend de voz não foi alterado nesta rodada.

## Limitações

- Sem validação nova de microfone humano, ruído, sotaques ou jornada visual instalada. Instalação verde não comprova essas etapas.
- Senhas e seleção nativa de arquivos continuam manuais.
- Pacote não publicado em Release e não assinado para updater/Authenticode; não é atualização automática oferecida pelo GitHub.
- Nenhuma limpeza de recovery, compatibilidade de backup antigo ou funcionalidade clínica nova foi implementada.
- Meta continua ativa, sem declaração de cobertura universal por áudio. Usar dados fictícios nos testes.
