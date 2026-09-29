# Plano técnico — aplicativo desktop Windows local

## Decisão

**Tecnologia escolhida: Tauri 2 + React existente + Rust.**

O produto será um aplicativo Windows para uso individual de um psicólogo. O repositório GitHub privado guardará apenas código, documentação, automações e instaladores de release. Dados clínicos, chaves, backups e segredos nunca serão versionados, enviados ao GitHub ou incluídos em telemetria.

Tauri foi escolhido em vez de Electron porque o MVP já usa React, o aplicativo será local e de escopo fechado, e Tauri permite empacotar uma interface web com WebView2 e um núcleo Rust com permissões explícitas. Electron seria uma alternativa válida e madura, mas distribui Chromium/Node completos e exigiria uma superfície de segurança maior para este caso. A decisão deve ser reavaliada apenas se houver necessidade comprovada de módulos Node nativos incompatíveis ou de suporte extensivo a integrações de desktop não cobertas por Rust/Tauri.

Fontes oficiais para a escolha: [instaladores Windows do Tauri](https://v2.tauri.app/distribute/windows-installer/) e [atualizador assinado do Tauri](https://v2.tauri.app/plugin/updater/). Para comparação, o [atualizador do Electron](https://www.electronjs.org/docs/latest/tutorial/updates) depende de um feed de atualização apropriado e empacotamento Windows compatível.

## Arquitetura alvo

```text
React (interface local)
        │ comandos tipados, lista explícita de permissões
Tauri/Rust (regras de domínio, auditoria, cifragem, backup)
        │
SQLite com SQLCipher (dados clínicos cifrados em repouso)
        │
%LOCALAPPDATA%\Circulo\data\circulo.db
```

- Interface: mantém o fluxo de pacientes, sessões, emoções, observações e indicadores já implementado.
- Núcleo: somente comandos Tauri previamente permitidos; sem abrir shell, acesso amplo a arquivos ou carregamento de conteúdo remoto.
- Banco: SQLite com SQLCipher. Migrações versionadas ficam no código; o arquivo de banco fica fora do diretório do aplicativo e fora do repositório.
- Auditoria: tabela local somente de acréscimo para login, criação, edição, finalização, backup, restauração e falhas de desbloqueio. Não registrar conteúdo clínico nos logs.
- Rede: desabilitada por padrão. A única comunicação futura autorizada é HTTPS para consulta/download de atualização assinada, após ação explícita ou preferência do usuário.

## Autenticação e criptografia local

1. Na primeira execução, o psicólogo define uma senha local e confirma que é responsável pela proteção do computador.
2. O aplicativo gera uma chave aleatória de 256 bits para o banco.
3. A senha é derivada com **Argon2id**, usando salt exclusivo e parâmetros ajustáveis; a chave resultante cifra a chave do banco (envelope encryption).
4. A chave do banco abre o SQLCipher apenas enquanto a sessão estiver desbloqueada. A senha nunca é persistida; a chave e buffers sensíveis são zerados ao bloquear/encerrar quando tecnicamente possível.
5. Bloqueio automático por inatividade (implementado com intervalo fixo de 15 minutos) e botão de bloqueio imediato. O intervalo não é configurável nesta versão.

DPAPI do Windows pode proteger opcionalmente o envelope em uma instalação de usuário único, mas não substitui a senha: ele protege principalmente contra outros perfis do Windows, não contra processos com acesso ao mesmo perfil desbloqueado. O banco cifrado e a senha local continuam sendo a barreira principal.

## Backup e restauração

- Backup automático cifrado após alterações relevantes e em rotina configurável, com retenção configurável. A interface também permite iniciar um backup manual.
- Exportar um pacote cifrado (`.circulo-backup`) contendo banco, manifesto de versão, checksum e data. O pacote recebe uma senha própria de backup, derivada com Argon2id; não reutilizar silenciosamente a senha da sessão.
- A restauração/migração em outro computador deve: validar versão e integridade, solicitar senha do backup, criar um backup de segurança do banco atual e exigir confirmação antes de substituir dados. Nenhuma conta externa é necessária para a migração.
- Não gravar backups na pasta do repositório. Sugerir pasta escolhida pelo usuário, mídia removível ou diretório corporativo local; nenhuma nuvem é integrada neste MVP.
- Testes obrigatórios: restaurar para uma instalação limpa, backup com senha errada, arquivo corrompido, rollback após falha e compatibilidade de migração.

## Empacotamento, releases e atualização

- Distribuição Windows: **NSIS `-setup.exe` por usuário**, evitando privilégios administrativos no uso individual. Oferecer MSI apenas se uma clínica precisar de implantação gerenciada.
- As builds de release usam Tauri para produzir instalador e artefatos de atualização assinados.
- Assinar o instalador com certificado de assinatura de código Windows e carimbo de tempo. Sem isso, SmartScreen pode alertar o usuário; um instalador não assinado não é aceitável para distribuição clínica.
- O atualizador Tauri exige assinatura de artefatos. A chave privada de atualização e o certificado nunca entram no repositório; ficam em cofre de segredos/ambiente seguro de CI.
- GitHub Releases privadas podem hospedar instaladores e metadados de versão se o mecanismo de download autenticar adequadamente o usuário. Antes de adotá-las, validar que o endpoint de atualização não exige token embutido no aplicativo. Se exigir, usar um endpoint de atualização autenticado sob controle do fornecedor ou atualização manual por instalador. Em ambos os casos, GitHub recebe somente binários de produto, nunca bancos ou backups.
- O usuário vê versão, notas e origem antes de instalar. Manter canal `stable` único no MVP e permitir adiar a instalação.

## Pré-requisitos de implementação

1. Windows 10/11 suportado e WebView2 Runtime disponível (o instalador pode verificar/instalar o runtime).
2. Rust `stable`, Visual Studio Build Tools com C++ e Windows SDK, Node LTS e Tauri CLI no ambiente de build.
3. Biblioteca SQLCipher com build reprodutível; avaliar licenciamento e distribuição antes da adoção.
4. Dependência Rust para Argon2id e criptografia autenticada, revisada e com versões bloqueadas.
5. Certificado de assinatura Windows, chave de assinatura do atualizador e ambiente de CI Windows com segredos protegidos antes do primeiro release público ou privado.
6. Política operacional: senha perdida, troca de computador, retenção/remoção de backup e resposta a perda/roubo do dispositivo.

## Riscos e controles

| Risco | Controle planejado |
| --- | --- |
| Computador desbloqueado ou malware no mesmo perfil | bloqueio automático após 15 minutos de inatividade detectada, senha local e orientação de segurança; não é possível garantir proteção contra comprometimento do sistema ou detecção perfeita de atividade. |
| Perda da senha | não criar porta dos fundos; recuperação só por backup que tenha senha conhecida. |
| Backup copiado ou extraviado | cifragem própria do backup e senha independente. |
| Release adulterado | assinatura de código, assinatura do updater, HTTPS e verificação de chave pública embutida. |
| Vazamento por Git | `.gitignore`, revisão pré-commit, varredura de segredos e dados simulados somente. |
| Falha de migração | backup automático pré-migração e migrações testadas com cópias cifradas. |

## Próximas etapas, sem publicação

1. Criar branch local de migração e integrar Tauri ao Vite atual.
2. Definir esquema SQLite e comandos Rust para pacientes, sessões, indicadores e trilha de auditoria.
3. Implementar o fluxo de primeira execução, bloqueio e desbloqueio com chave de banco cifrada.
4. Implementar backup/restauração e testes de recuperação.
5. Produzir instalador NSIS local de teste, sem assinatura e sem updater, apenas para validação interna.
6. Depois da aprovação de segurança, configurar assinatura, CI e uma estratégia de releases privadas.

## Build NSIS local da fatia de cadastro — 25/09/2026 (obsoleto)

Este artefato foi gerado antes da Agenda desktop e não contém Agenda, backup automático, sessões persistentes nem indicadores desktop. O código-fonte atual inclui essas fatias no esquema SQLCipher v5. **Correção histórica em 26/09:** a frase “nenhum novo NSIS foi produzido” deixou de ser verdadeira quando o instalador 0.2.0 abaixo foi produzido; em 25/09, ela se referia somente ao estado daquela data. As instruções desta seção descrevem exclusivamente o instalador anterior.

Com Node 20, Rust/Cargo, Tauri CLI 2.11.5 e NSIS 3.12 disponíveis, foi executado `npx tauri build` no Windows, com `CARGO_TARGET_DIR=C:\Users\alexandre\AppData\Local\Temp\circulo-target` (caminho curto para a compilação do OpenSSL) e `Path` incluindo Cargo, NSIS e Strawberry Perl. O Vite compilou o frontend, Rust terminou no perfil `release` e o NSIS produziu `Círculo_0.1.0_x64-setup.exe`. O linker emitiu avisos LNK4099 sobre PDB de OpenSSL ausente, sem impedir o build. Não houve assinatura, publicação ou instalação.

Uma cópia do artefato está em `installer/Círculo_0.1.0_x64-setup.exe` (3.948.536 bytes; SHA-256 `5E1DEFD18D356D84376D8108C405857EDD0E43B5A1E61D343F76A55EF720231A`). `Get-AuthenticodeSignature` retornou `NotSigned`. `git check-ignore -v` confirmou que `installer/`, `src-tauri/target/` e `dist/` são ignorados; `git status --short` não mostrou o executável. O arquivo é **somente para teste local com dados sintéticos**, não para distribuição clínica.

Este NSIS 0.1.0 é legado e não deve ser usado; permanece no repositório ignorado, sem sobrescrita.

## Build NSIS local 0.2.0 — 26/09/2026

O desktop foi alinhado à versão 0.2.0 em Tauri/Cargo/Cargo.lock. O pacote npm da interface mantém `0.0.0`, pois não define a versão mostrada no PE; nenhuma dependência foi atualizada. O bundle NSIS foi gerado localmente pelo Tauri para x64/`x86_64-pc-windows-msvc`, com `CARGO_TARGET_DIR=C:\Users\alexandre\AppData\Local\Temp\circulo-nsis-target-20260926`; EXE e manifesto ficaram fora do repositório. O artefato `Círculo_0.2.0_x64-setup.exe` tem **4.148.082 bytes**, SHA-256 **`f38cb9ab5a00f1d5394317aeddf48ec18090303098bcf3ba41b2c79ba202b16f`**, PE **0.2.0**, Authenticode **`NotSigned`**. O manifesto está em `%TEMP%\circulo-nsis-audit-20260926.json` e registra Node 20.19.6, Rust/Cargo 1.98.1, Tauri CLI 2.11.5 e NSIS 3.12. Ele explicita `installationTested:false`, `uninstallationTested:false`, `appRuntimeTested:false` e `contentInspection:not-performed`.

No snapshot da auditoria de 26/09/2026, o instalador ainda **não havia sido executado, extraído ou instalado**. A auditoria daquele momento não inspecionou seu conteúdo. A nota posterior abaixo registra a instalação autorizada depois desse snapshot. Este artefato local não é uma distribuição pronta para usuário; não há assinatura Authenticode nem prova de instalação segura/funcional. O build e seu manifesto existem somente no Temp, não em `installer/`.

O smoke test *instalado* não foi executado neste perfil. Mesmo escolhendo uma pasta temporária para o NSIS, um instalador por usuário pode modificar registro de desinstalação e atalhos; além disso, `app_local_data_dir` do Tauri usa o perfil de usuário, não a pasta de instalação. Não foi validada uma VM/conta Windows descartável nesta execução. Não seria seguro supor isolamento apenas por mudar o destino do instalador.

### Preflight reproduzível do artefato 0.2.0

Na máquina que mantém o EXE fora do repositório, execute a auditoria de metadados existente e depois o preflight/checklist. Os caminhos são exemplos correspondentes ao artefato e manifesto registrados acima; escolha um nome de manifesto novo dentro de `%TEMP%`:

```powershell
$installer = Join-Path $env:TEMP 'circulo-nsis-target-20260926\Círculo_0.2.0_x64-setup.exe'
$manifest = Join-Path $env:TEMP 'circulo-nsis-audit-20260926-recheck.json'
node scripts/auditWindowsInstaller.js --installer $installer --expected-version 0.2.0 --manifest $manifest --signature unsigned
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/preflightInstalledSmokeTest.ps1 -InstallerPath $installer -ReportPath (Join-Path $env:TEMP 'circulo-nsis-smoke-preflight-20260926.json')
```

O auditor existente compara versão PE e Authenticode, coleta SHA-256 e metadados de toolchain, e exige manifesto novo em Temp. O preflight PowerShell verifica presença, tamanho, SHA-256 fixado ao valor deste registro, versão PE 0.2.0 e assinatura `NotSigned`; grava JSON diretamente em Temp. Seu `preflightStatus` e cada etapa futura permanecem `not-run`: este script não executa, extrai, instala ou desinstala EXE e não acessa registro, atalhos ou perfil. Metadados coincidentes não provam autenticidade, origem, conteúdo nem uso do artefato. `NotSigned` registra somente o estado esperado e não é fator de confiança.

Para os testes mockados, com Pester instalado: `Invoke-Pester ./test/preflightInstalledSmokeTest.Tests.ps1`. Os testes substituem leitores de hash/versão/assinatura e usam apenas um arquivo sintético temporário; não abrem o NSIS real.

O checklist instalado só pode ser realizado futuramente em VM Windows descartável, sem instalação prévia do Círculo e com snapshot recuperável. Usar dados e senhas sintéticos; desconectar rede desnecessária. Na VM, conferir o hash contra este registro, então instalar, iniciar o app, criar dados, fechar/reabrir para validar persistência, criar e restaurar backup, verificar atalhos e desinstalar. Inspecionar dados/backups residuais antes de descartar a VM. Nenhuma dessas etapas é declarada concluída pelo preflight.

### Estado posterior da validação instalada — 26/09/2026

Após autorização do usuário, o NSIS 0.2.0 foi iniciado e instalado no perfil Windows atual, em `C:\Users\alexandre\AppData\Local\Círculo` (escopo same-profile; **não** em VM ou conta isolada). Foram observados o registro HKCU com DisplayName `Círculo` e versão `0.2.0`, além do atalho no menu Iniciar. O processo `circulo.exe` permaneceu `Responding`, com `MainWindowTitle` `Círculo`.

A captura visual da janela falhou duas vezes pelo helper `@oai/sky` (`FrameArrived timed out: timed out waiting on channel`; recuperação: `window capture timed out...`). Portanto, nenhum formulário ou fluxo visual foi operado ou validado. `%LOCALAPPDATA%\br.circulo.psicologia` continha somente `EBWebView` no que foi observado; não houve cadastro nem inserção de dados sintéticos. O app permanece instalado e aberto, e a desinstalação ainda **não foi feita**. Passaram apenas a execução/instalação observada, as verificações do registro e atalho, e a responsividade/janela identificada pelo processo; persistência, fluxos do app, backup/restauração, conteúdo integral do instalador e desinstalação seguem pendentes. Isto não comprova funcionamento end-to-end.

As flags `installationTested:false`, `uninstallationTested:false` e `appRuntimeTested:false` no manifesto são métricas históricas corretas do snapshot anterior à instalação; não foram alteradas retroativamente. A execução observada ocorreu no perfil de uso atual e não satisfaz o checklist de VM descartável descrito acima.

### Bloqueio automático do cofre desktop

O intervalo é fixo: 15 minutos desde a última atividade reconhecida; desbloquear ou criar o cofre inicia um novo intervalo. Teclado, clique/toque e retorno após perda real de foco/visibilidade reiniciam o prazo. Movimento do ponteiro conta quando supera um limiar mínimo, com throttle de 1 segundo; rolagem também usa throttle de 1 segundo. Eventos sintéticos não reiniciam o prazo. O botão “Bloquear” é manual e não apresenta a mensagem de inatividade.

Se o prazo vencer durante uma operação, o pedido de bloqueio aguarda a operação sem cancelá-la. Atividade confiável enquanto aguarda invalida esse pedido e reinicia os 15 minutos; sem atividade nova, o bloqueio prossegue após o trabalho em andamento. Antes de bloquear, o app desabilita os controles do rascunho e persiste alterações sujas. Se o salvamento falhar, o cofre permanece aberto, os campos continuam visíveis para nova tentativa e o prazo é reiniciado. Esta política foi exercitada por testes automatizados com operações sintéticas adiadas; **não foi validada em uma instalação Windows** e não oferece proteção absoluta contra malware, falhas do sistema ou eventos de atividade não detectados.

Aceitação manual em VM descartável sem instalação prévia do Círculo: (1) conferir o hash acima e manter a rede desnecessária/desligada; (2) instalar o NSIS e abrir o app; (3) criar cofre com senha sintética, cadastrar dois pacientes fictícios de mesmo nome e conferir IDs distintos; (4) editar, arquivar e restaurar um deles, bloquear, fechar e reabrir, e confirmar persistência após desbloqueio; (5) gerar backup com senha independente, restaurar em segundo perfil descartável e verificar ambos os cadastros; (6) verificar que a demo web, Agenda, Sessão e Evolução não aparecem no desktop; (7) verificar atalhos, desinstalar e inspecionar manualmente dados/backups locais antes de descartar a VM. Nunca inserir dados clínicos reais. Assinatura, validação do instalador, auditoria de acesso e revisão de segurança continuam pendentes.
