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
5. Bloqueio automático por inatividade e botão de bloqueio imediato. O tempo padrão e a confirmação antes de reduzir a proteção devem ser definidos na implementação.

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
| Computador desbloqueado ou malware no mesmo perfil | bloqueio automático, senha local e orientação de segurança; não é possível garantir proteção contra comprometimento do sistema. |
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
