# GitHub Releases com updater assinado

O endpoint configurado no aplicativo lê `releases/latest/download/latest.json`. Esse arquivo deve conter a versão publicada e apontar para o instalador no tag imutável `vX.Y.Z`. O script local apenas monta o manifesto; ele não assina, verifica criptograficamente a assinatura, cria releases ou envia arquivos.

## Preparar 0.2.17

1. Revisar o checkout e confirmar versões `0.2.17` nos manifests. Executar testes e construir o NSIS com os artefatos do updater habilitados. A chave privada do updater fica fora do repositório, em armazenamento seguro, com cópia de recuperação protegida. Nunca colocá-la no checkout, nos argumentos deste script, no release ou em logs.
2. Confirmar que o instalador `Círculo_0.2.17_x64-setup.exe` e a assinatura emitida pelo Tauri `Círculo_0.2.17_x64-setup.exe.sig` são do mesmo build. Conferir versão PE, SHA-256 e assinatura com a chave pública embutida no aplicativo. O script confere apenas existência, tamanho, nomes e formato textual; não prova a correspondência criptográfica.
3. Gerar `latest.json` em diretório de preparação vazio:

   ```powershell
   node scripts/createGithubUpdateManifest.js --version 0.2.17 --installer 'C:\staging\Círculo_0.2.17_x64-setup.exe' --signature 'C:\staging\Círculo_0.2.17_x64-setup.exe.sig' --notes 'Atualização 0.2.17' --output 'C:\staging\latest.json'
   ```

   O script recusa sobrescrever `latest.json`. Inspecionar o JSON e conferir que `platforms.windows-x86_64.url` aponta para `/releases/download/v0.2.17/` e que `signature` corresponde ao `.sig`.

## Publicar e testar

4. Criar o tag `v0.2.17` no commit revisado. Publicar um GitHub Release **público** com o EXE, `.sig` e `latest.json` de 0.2.17; verificar que as três URLs respondem. O endpoint `/releases/latest/download/latest.json` precisa resolver para esse release, que não deve estar marcado como prerelease. Não trocar bytes de artefatos depois da publicação; preparar novo release para correções.
5. Em VM ou perfil descartável, testar a transição **0.2.16 → 0.2.17 por instalação manual** do NSIS 0.2.17 sobre o 0.2.16, usando somente dados sintéticos. O 0.2.16 instalado não contém updater e não pode buscar nem aceitar essa atualização. Registrar hashes dos dados locais de teste e conferir versão, reabertura e preservação após a instalação manual.
6. Para testar o updater, publicar um release de teste **0.2.18** mais novo, com instalador e assinatura do updater correspondentes e `latest.json` apontando ao tag `v0.2.18`. Em outro perfil descartável, instalar 0.2.17 manualmente, abrir o app, aceitar 0.2.18 pelo updater e conferir versão, reabertura, preservação dos dados sintéticos e resposta segura a assinatura inválida. Não executar esses ensaios no perfil de uso existente.

GitHub Releases público é necessário para o download sem autenticação. Não incluir dados clínicos, bancos, backups, senhas ou chaves nos assets, notas ou testes. A assinatura do updater é distinta da assinatura Windows Authenticode: a primeira é verificada pelo updater com a chave pública embutida; a segunda identifica o editor do executável para o Windows. O instalador atual não tem Authenticode, e a assinatura do updater não a substitui na instalação manual.
