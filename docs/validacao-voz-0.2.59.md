# Instalação local e controle da entrada — Círculo0.2.59

## Resultado confirmado em04/10/2026

- Antes: ProductVersion0.2.52, janela minimizada. Leitura por acessibilidade após ativar confirmou tela de senha, sem formulário clínico aberto. Nenhuma senha lida/preenchida.
- Clique Fechar falhou com `coordinate input geometry is unavailable`. Após reobservar, Alt+F4 encerrou: nova lista sem janela Círculo e processo ausente. Não houve encerramento forçado.
- Cópia dos quatro arquivos do perfil em `C:\Users\alexandre\AppData\Local\Círculo-update-backup-20261004-0259`, com igualdade de hash por arquivo. Cópia local fora do repositório; não enviada ao GitHub.
- Antes da instalação, SHA256 do NSIS confirmado: `3ee3f5dd104ad277dbe0900b387b4dac571f10e96fc9089dd3de1f34b8a0ce09`.
- Instalador local `/S`: exit0; ProductVersion instalada0.2.59. Os quatro arquivos continuaram iguais aos da cópia por hash após instalar e abrir.
-18arquivos dos recursos de voz instalados conferidos por hash contra `src-tauri/resources/voice`, incluindo modelo/CLI e dependências. Não houve download de modelo nesta etapa.
- Aplicativo aberto pelo caminho instalado; janela nova localizada, tela de senha/assistente lida por acessibilidade. Somente `Seu comando` recebeu texto de teste por `set_value`; leitura confirmou o texto, mas não comprova interpretação nem o estado React interno. Comando limpo e campo vazio confirmado ao final. Nenhuma ação clínica ou confirmação executada.

## Limitações observadas, sem ampliar o alcance da prova

O teclado fechou a janela antiga, mas Tab não produziu mudança de foco observável: permanecia RootWebArea. Não houve digitação cega nem tentativa em senha. A captura de imagem falhou com `FrameArrived timed out: timed out waiting on channel`; recuperar a janela e repetir terminou com `window capture timed out: timed out waiting on channel`. Sem geometria/captura confiáveis, não foi executado o botão Preparar rascunho ou a confirmação no instalado.

Habilidade computer-use usada para observar/fechar/abrir/limpar o campo. Não foram automatizados autenticação, permissões ou configurações de privacidade. Aplicativo deixado aberto e bloqueado; sem recriar/substituir/limpar cofre, sem dados reais, sem gravação ambiente. Senha permanece manual.

Instalação, preservação e abertura não homologam microfone físico, reconhecimento desta sessão, pacientes/sessões/banco por áudio nem a jornada completa no aplicativo. Testes anteriores de componentes/RPC/mídia fictícios continuam separados dessa prova nativa. Manifest de auditoria do artefato permanece o registro histórico anterior à instalação, não foi adulterado para anunciar testes de execução.

Não publicado em Release, sem `.sig` de updater ou Authenticode. Instalar localmente não disponibiliza atualização automática no GitHub. Não houve build novo porque o instalador59 existente é o mesmo artefato já conferido. Meta continua ativa.
