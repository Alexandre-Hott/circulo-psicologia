# Instalação local e limite de controle — Círculo0.2.61

Data:04/10/2026. Pacote local `Círculo_0.2.61_x64-setup.exe`,135.882.040bytes; SHA256 `e948147d7279c7d5a7e89e5446cbe00400d8bc15353c80f0c7e324a5a37c131a` verificado antes de executar. Instalador NSIS silencioso `/S` terminou exit0; ProductVersion/FileVersion instalado0.2.61, antes0.2.59. Não é publicação de Release nem assinatura updater/Authenticode.

## Perfil preservado

Aplicativo anterior observado bloqueado por acessibilidade e fechado com Alt+F4. O processo foi confirmado ausente antes de copiar/instalar. Cópia local não sobrescrita em `C:\Users\alexandre\AppData\Local\Círculo-update-backup-20261004-0261`; preservada, não removida. Inventário dos quatro arquivos conferido antes da cópia. `auto-backup.db`118784bytes, `circulo.db`118784bytes, `daily-unlock.dpapi`294bytes e `vault.key`81bytes: hash de cada cópia igual ao original. Depois da instalação e depois de reabrir, os quatro arquivos continuam idênticos à cópia. Nenhum conteúdo do cofre ou chave/senha lido, nenhum registro criado/restaurado/apagado. Não foi solicitado uso de dados reais.

Os18arquivos de recursos de voz instalados foram comparados por hash com `src-tauri/resources/voice`, todos iguais; instalação contém18arquivos nesse diretório. Aplicativo reaberto por seu caminho instalado; processo em execução e primeira tela pedindo senha observada por acessibilidade, com assistente e ajuda presentes. Não se automatizou senha/autenticação.

## Identidade do executável

Comparação inicial de SHA256 bruto com `target/release/circulo.exe` foi falsa: ambos têm20.743.680bytes, mas diferem nos offsets14944378/14944379/14944380 (base zero). Comparação byte a byte encontrou exatamente3diferenças no marcador: build `__TAURI_BUNDLE_TYPE_VAR_UNK`, instalado `__TAURI_BUNDLE_TYPE_VAR_NSS`. Todos os demais bytes coincidem. `tauri-utils`2.10.0, versão do Cargo.lock, documenta patch binário do marcador durante build e associa NSS a BundleType::Nsis em `src/platform.rs`. Não esconder a diferença como hash bruto igual, nem alterar executável/instalador para forçar comparação. É a identidade de empacotamento esperada, não divergência de código frontend/backend.

## O que não passou

Uma tentativa de Tab na janela recém-observada falhou com `failed to activate captured window`. Refeito list_windows/get_window/get_window_state e repetido uma vez com objeto atualizado: mesma falha. Não foram reutilizados índices/coordenadas antigos, não digitado comando/senha e nenhuma configuração de segurança/privacidade alterada. A tentativa de interação na ajuda foi interrompida antes de qualquer clique ou alteração. Não se obteve novo screenshot e não se tentou contornar a falha por UI Automation própria/terminal.

Isso prova instalação, versão, abertura e preservação de arquivos/recursos; não prova captura por microfone físico, preparação/confirmação de comandos instalada, navegação clínica por voz ou persistência de uma jornada nativa. A regressão113/113, replay reforçado1/1, JS259/259, Rust86/0/1 e WAVs sintéticos da rodada anterior continuam com o alcance documentado. Meta permanece ativa; controle nativo é uma limitação explícita, não uma suíte verde fictícia. O pacote/aplicativo funcional não foi modificado nesta rodada.
