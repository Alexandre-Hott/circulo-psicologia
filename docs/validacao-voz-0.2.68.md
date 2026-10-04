# Validação de voz 0.2.68 — 04/10/2026

## Escopo

Os quatro textos de sessão (observação, procedimentos, resultado e encaminhamento) aceitam pedidos naturais com até 4000 unidades UTF-16, como os formulários. “Seu comando” e o parser central compartilham o teto de 4600, permitindo conteúdo e prefixo. A guarda central mede texto bruto após trim, antes de comprimir espaços; não corta o conteúdo para caber.

Mantidos os limites menores: nome/título 160, descrição de comportamento 1000 e nota contextual 500. O gateway genérico continua validando o limite real do campo. Senha, escolha nativa de arquivos, captura de 12 segundos, handlers, banco e cofre não mudam.

O gate inicial reconhece “procedimentos” no plural, já previsto na gramática final. Recusas naturais acima de 4000 têm código interno exclusivo clinical_text_limit; somente essa recusa específica prevalece sobre a mensagem genérica de campo inexistente. Propostas genéricas válidas, bloqueio, confirmação aberta e demais fallbacks mantêm precedência.

## Evidência executada

- RED isolado antes do patch: 18 casos, 8 passaram e 10 falharam.
- Central + novo unit corrigidos: 103/103 passaram; novo unit 18/18, central 85/85. Identidade incompatível e homônimos exigem motivos específicos, não apenas recusa por tamanho.
- npm test após diagnóstico: 365/365 passaram, exit 0.
- Rust 0.2.68 release/offline/locked: 86 passaram, 0 falharam, 1 ignorado, 8,57 s. O opt-in ignorado não é homologação física.
- Opt-in nativo separado na 0.2.68: 1/1 passou em 7,09 s, exit 0, reaproveitando os três WAVs SAPI preservados de valores de indicador. Transcrições coincidiram byte a byte com a fixture: dois valores e confirmação. Não é nova gravação ou microfone físico.
- Primeira UI: 7/11 passaram; quatro naturais falharam somente porque a recusa de 4001 mostrava “campo não encontrado”. Trace/contexto preservados em test-results-5210; nenhuma asserção foi retirada.
- Revisão independente estática aprovou a correção e o diagnóstico estrito.

Rodada final selecionada: **117/117 passaram em 12,7 minutos, exit 0**, cinco arquivos, porta 5211, Edge headless, worker único, sem retry. Inclui os 11 novos casos, replay de escala e regressões de interface, sessão, confirmação, transcrição tardia e autosave. Produção ficou congelada durante testes/build; os quatro hashes conferidos permaneceram iguais. É regressão selecionada, não toda a suíte E2E.

## Pacote

[Instalador Windows x64](../src-tauri/target/release/bundle/nsis/Círculo_0.2.68_x64-setup.exe): 135.878.222 bytes, SHA-256 `cf599d63e1e8060b6222ffe213d95d30a62898821872e2bf74a57e9718448035`. Build NSIS offline/locked exit 0, Rust compilado em 55,22 s. Configuração temporária externa ao repositório foi retirada após o resultado terminal; desativava somente geração de artefatos do updater para o pacote local. Configuração oficial preservada.

Auditoria de metadados: PE 0.2.68, x64, NotSigned; manifest C:/Users/alexandre/AppData/Local/Temp/circulo-0268-audit-20261004.json. Conteúdo interno não extraído; pacote não instalado/executado. Avisos anteriores de chunk maior que 500 KiB e OpenSSL-PDB presentes. Consistência documental aprovada pelo verifier com caminhos explícitos; rodada final selecionada aprovada. Entrega é um pacote local para teste, não Release publicado.

Instalado permanece 0.2.61; perfil cifrado e cópia anterior preservados. Sem instalação, publicação de Release ou assinatura de atualização nesta etapa.

## Limites

Os testes novos usam texto digitado, parsers/handlers reais e IPC sintético. Não comprovam reconhecimento de áudio com 4000 unidades, salvamento na instalação final ou microfone físico. A captura continua limitada a 12 segundos; aumentar o campo não amplia a duração do ditado.

Iniciar a primeira gravação continua manual, por “Ouvir e transcrever” ou Ctrl+Shift+Espaço. Os controles internos do assistente não entram no gateway genérico; não há escuta permanente ou wake word. Isso deve permanecer uma exceção explícita, não ser apresentado como cobertura literal de todo botão do aplicativo.

UTF-16 é o critério de maxLength do navegador: um emoji pode ocupar duas unidades, portanto os limites não contam caracteres visuais. Extração/trim/aspas seguem o contrato anterior; payload não é normalizado, inferido ou truncado.

A regressão 0.2.67 (319/322 mais 3/3 focal) permanece evidência histórica separada, não resultado integral da 0.2.68.
