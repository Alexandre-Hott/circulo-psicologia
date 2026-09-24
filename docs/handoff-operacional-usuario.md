# Handoff operacional — próximos passos do usuário

Nenhuma senha, token, certificado ou chave deve ser enviada em chat, salva em arquivo do projeto ou commitada.

## Ações que dependem do usuário, nesta ordem

1. Instalar Rust stable/Cargo, Visual Studio Build Tools com C++ e Windows SDK, WebView2 Runtime e NSIS no computador de build Windows.
2. Executar `npm run preflight:windows` até obter pronto para scaffold; a CLI Tauri será adicionada apenas na etapa de scaffold aprovada.
3. Escolher a estratégia de assinatura Windows: Azure Trusted Signing ou certificado comercial equivalente. Criar conta/cofre de segredos fora do projeto.
4. Decidir quem terá acesso administrativo ao repositório e à assinatura.
5. Autenticar-se no GitHub pelo fluxo normal da plataforma e criar repositório **privado**; não enviar dados clínicos, backups, chaves ou `.env`.
6. Configurar ambiente GitHub `production`, aprovações obrigatórias e segredos diretamente no cofre da plataforma, nunca no código.

## O que os agentes farão depois

- Reexecutar o preflight e ativar/validar o scaffold Tauri local.
- Implementar banco SQLCipher, migrações e autenticação local em etapas testáveis.
- Implementar backup automático cifrado, restauração atômica e migração entre computadores.
- Produzir instalador de teste não publicado, depois configurar assinatura e CI gated.
- Executar checklist de piloto sintético, revisão clínica e revisão de segurança antes de qualquer uso real.

## Gate de segurança

Não avançar para dados reais, piloto clínico, release ou distribuição enquanto o documento `auditoria-prontidao-windows.md` listar bloqueadores críticos.
