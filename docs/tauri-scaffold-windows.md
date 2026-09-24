# Scaffold Tauri 2 — Windows

O diretório `src-tauri/` é um esqueleto seguro para empacotar o frontend Vite existente. Ele não cria banco, não acessa dados locais, não inclui chaves e não habilita rede, shell ou comandos de arquivo.

## Pré-requisitos

Instalar em um ambiente Windows de desenvolvimento, antes de ativar o scaffold:

1. Rust stable com Cargo (`rustup`).
2. Visual Studio Build Tools, workload **Desktop development with C++** e Windows SDK.
3. Node LTS e dependências do projeto (`npm install`).
4. WebView2 Runtime. Para distribuição, o instalador deve validá-lo.
5. CLI Tauri 2 como dependência de desenvolvimento, somente após aprovação: `npm install -D @tauri-apps/cli`.

Depois disso, validar primeiro `npx tauri dev` e então `npx tauri build`. O scaffold está configurado para NSIS por usuário; assinatura de código e atualização automática permanecem desligadas até haver certificado e cofre de segredos.

## Dados locais e integração futura

- Banco: `%LOCALAPPDATA%\Circulo\data\circulo.db`, fora do repositório e cifrado por SQLCipher.
- Senha local: derivar chave com Argon2id; guardar no banco somente envelope e metadados, nunca a senha.
- Backup automático: serviço Rust separado, produzindo pacote cifrado fora do projeto; restauração exige validação, senha e backup prévio do banco atual.
- Toda capacidade deve ser uma Tauri command com permissão explícita e auditoria. Não expor acesso genérico a arquivos/shell ao frontend.

## Estado desta entrega

O ambiente atual não possui `rustc`, `cargo` ou CLI Tauri. Portanto não houve instalação nem build Tauri. O frontend continua validado por `npm test`, `npm run lint` e `npm run build`.
