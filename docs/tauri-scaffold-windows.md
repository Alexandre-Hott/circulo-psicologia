# Scaffold Tauri 2 — Windows

O plano inicial abaixo é histórico. Para o aplicativo e o pacote atuais, consulte a [validação da versão80](validacao-voz-0.2.80.md).

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

## Estado da entrega inicial (histórico)

O ambiente atual não possui `rustc`, `cargo` ou CLI Tauri. Portanto não houve instalação nem build Tauri. O frontend continua validado por `npm test`, `npm run lint` e `npm run build`.

## Integração candidata de voz local (04/10/2026)

O backend e o gate Windows passam a exigir explicitamente `ggml-small-q5_1.bin`
(190085487 bytes, SHA-256 `ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb`).
`voice:prepare` fixa a origem e o digest; `voice:test-synthetic` usa o mesmo modelo,
prompt atual, nomes fictícios e transporte por arquivo UTF-8 de argumentos.
A configuração de bundle lista somente esse modelo, CLI/DLLs atuais e licenças;
o base histórico pode continuar localmente, mas não é empacotado nem fallback.
Nenhuma permissão, chave, versão ou função de usuário é adicionada.

O Rust opt-in foi executado com os mesmos oito WAVs sintéticos preservados,
em série, 60s por inferência e 10min globais, sem retry/download/TTS. Confirmou
5 pedidos corretos/2 falhos/1 confirmação não avaliada; native0 e avaliador2.
O replay dos oito textos reais passou8/8 nas verificações da UI, sem reparar fala.
O A/B direto anterior deu5/2/1 no small contra3/4/1 no base, sem regredir os três
acertos, mas agenda/observação ainda falham e a latência aumenta. São provas distintas.
O pacote local80 foi gerado e auditado por metadados, sem instalação, inspeção
interna, assinatura ou publicação. Isso não constitui precisão populacional ou
validação de microfone. Revisão e confirmação permanecem necessárias.
