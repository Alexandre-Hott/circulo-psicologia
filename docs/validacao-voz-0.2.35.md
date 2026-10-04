# Validação do assistente local — 0.2.35 (01/10/2026)

## Correção

Após preparar uma proposta, editar o texto, iniciar outro ditado ou interpretar um comando recusado agora descarta a proposta anterior. Uma transcrição que chega depois de o usuário começar a digitar é ignorada. Assim, o botão “Revisar no formulário” corresponde apenas ao comando atual. Nenhuma dessas ações grava pacientes, compromissos ou sessões.

## Testes e empacotamento

- `npm test`: 189 aprovados, 0 falhas. Testes E2E focados em voz e encaminhamento: 15 aprovados, incluindo descarte da proposta antiga na Home e resposta atrasada do transcritor. `npm run lint` e `npm run build` passaram; o lint conserva o aviso anterior sobre `Date` em `src/App.jsx:103`.
- Build Tauri/NSIS concluído. A opção local `--config '{"bundle":{"createUpdaterArtifacts":false}}'` dispensou apenas o pacote de atualização assinado nesta invocação. A configuração de produção continua exigindo assinatura para atualização automática; nenhuma chave privada foi usada ou publicada.
- Instalador `Círculo_0.2.35_x64-setup.exe`: 135.867.866 bytes, SHA-256 `de3ec24150033bbc1bffd6b3ee98cdf9f6e00db5f77851f82b4048aadf845ae7`, PE 0.2.35, x64, Authenticode `NotSigned`. Manifesto de auditoria local: `%TEMP%\circulo-0235-audit-20261001-01.json`. A auditoria examina metadados, não o conteúdo interno do NSIS.
- Antes da atualização, os quatro arquivos cifrados do perfil foram copiados com hashes iguais para `%LOCALAPPDATA%\Círculo-update-backup-20261001-0235`. O NSIS silencioso retornou 0; o executável instalado reporta 0.2.35; os recursos de voz estão presentes e o perfil original manteve os mesmos hashes até a abertura. O processo instalado abriu uma janela `Círculo` responsiva.

## Limites ainda não verificados

Após essa build local, o aviso de licenças foi incluído entre os arquivos de origem versionáveis; o script de preparação e a build Rust agora exigem sua presença. O instalador 0.2.35 já continha o aviso. O modelo e os binários baixados continuam ignorados pelo Git.

O motor de voz não mudou nesta versão. Na 0.2.34 instalada, três frases SAPI fictícias passaram pelo backend Rust com os recursos da instalação em 5,91 s, sem rede. Isso não valida o microfone físico nem a interação visual do usuário com a janela; o controle de tela do agente falhou ao inicializar. O reconhecimento pode trocar nomes próprios, por isso o texto e o rascunho devem ser conferidos antes da confirmação. O CLI Whisper ainda inclui nomes locais no prompt do processo e usa WAV/TXT temporários. Licenças e avaliação de desempenho constam em [avaliação do reconhecimento local](avaliacao-reconhecimento-voz-local-2026-09-30.md). O instalador não foi publicado no GitHub.
