# Assistente de voz 0.2.46 — 03/10/2026

## Pacote local

`Círculo_0.2.46_x64-setup.exe`, **135.880.530 bytes**, SHA-256 `9315096aff0cc1cf759ec3f64a6e57fc98e0afc3ecbbcc1170d4d58f5061db39`.

Arquivo em `src-tauri/target/release/bundle/nsis/`. Build Vite/Tauri NSIS offline/locked terminou exit0. Avisos anteriores de chunk >500KiB e PDB OpenSSL não impediram compilação. Override local temporário para não gerar assinatura updater removido depois do build; configuração oficial de chave pública/endpoint preservada.

Auditoria `%TEMP%\circulo-0246-audit-20261003.json`: PE0.2.46, x64, NotSigned, tamanho/hash acima. Metadados somente: sem extração interna, instalação ou execução deste pacote. Nenhum processo Círculo estava aberto na conferência; nenhum perfil/banco foi alterado. Instalado permanece0.2.45.

## Incluído

- Limpeza de intenção/aviso antigo antes do RPC de entrada manual no cofre, além da invalidação de áudio já entregue na45.
- Prompt do reconhecedor local com vocabulário das áreas e ações existentes.
- Variante `seções` limitada ao substantivo da navegação de sessões do paciente; `análise` singular em navegação das análises. Nomes e textos livres não são autocorrigidos.

## Evidência

**230/230 JavaScript** e repository guard repetidos na versão46. Antes do empacotamento, no mesmo código funcional: **13/13 testes Rust de voz**, teste sintético Rust **1/1** percorrendo12 WAVs em20,60s, **21/21 E2E interface em1,4min**. Rodadas anteriores de transições e restauração inicial:30/30 E2E; detalhe histórico em [cobertura](voz-cobertura-interface.md) e [ciclo](melhoria-continua-voz.md). Não são uma única rodada conjunta nem testes de todos os botões em áudio físico.

[Corpus, comparação e falhas](voz-audio-sintetico-20261003.md). A voz sintética melhorou Novo cadastro, pacientes e comportamento sem palavra extra; sessões/análises usam as variantes explícitas. Comando de edição sem atributos continua insuficiente. Resultados não demonstram confiabilidade com microfone humano, ruído ou sotaques diferentes. E2E substituem backend/captura por respostas sintéticas.

## Limites

- Instalador local pronto para teste com dados fictícios, não publicado em Release e não oferecido pelo updater. Não há assinatura Authenticode nem artefato assinado para atualização automática nesta entrega.
- Instalação, abertura, captura física e jornada de voz nesta versão46 ainda não validadas. O usuário não precisa manipular a tela para concluir esta geração de pacote.
- Senhas e seletor nativo de arquivos continuam manuais.
- Não houve limpeza de recovery, compatibilidade com backups antigos ou novos fluxos clínicos.
- Meta permanece ativa; este pacote consolida progresso, não comprova cobertura universal das funções por áudio.
