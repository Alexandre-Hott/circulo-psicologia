# Avisos de terceiros

Este protótipo inclui SQLCipher Community Edition, compilado por `libsqlite3-sys`, e OpenSSL 3.x vendorizado para o provedor criptográfico do SQLCipher. As atribuições técnicas abaixo não substituem uma revisão jurídica antes de distribuição.

- SQLCipher: Copyright (c) 2008-2026, ZETETIC, LLC. Licença BSD-style completa em [src/licenses/SQLCIPHER-COMMUNITY.txt](src/licenses/SQLCIPHER-COMMUNITY.txt), reproduzida também na tela “Licenças” do aplicativo. Fonte oficial: https://www.zetetic.net/sqlcipher/license/SQLCIPHER_COMMUNITY_EDITION_LICENSE.txt
- OpenSSL: Copyright (c) The OpenSSL Project. All rights reserved. OpenSSL 3.x é distribuído sob Apache License 2.0; texto completo em [src/licenses/OPENSSL-APACHE-2.0.txt](src/licenses/OPENSSL-APACHE-2.0.txt), reproduzido também na tela “Licenças”. Fonte oficial: https://openssl-library.org/source/license/index.html
- SQLite, integrado pelo SQLCipher, é disponibilizado em domínio público; veja https://sqlite.org/copyright.html.

O projeto não usa os pacotes comerciais do SQLCipher nem os componentes Android/Curl/Mono listados genericamente na página de avisos da Zetetic. Outras dependências Rust/JavaScript continuam sujeitas às respectivas licenças nos manifests/lockfiles; uma auditoria completa dos artefatos efetivamente embarcados permanece um gate antes da distribuição.
