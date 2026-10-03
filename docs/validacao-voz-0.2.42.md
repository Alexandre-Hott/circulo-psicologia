# Assistente de voz 0.2.42 — 03/10/2026

Pacientes e pessoas vinculadas com nomes idênticos exibem opções distintas. Linhas usam ID e revisão; editor de vínculo também identifica paciente, vínculo e revisão. Editar ou arquivar pelo nome ambíguo não escolhe arbitrariamente. O pedido explícito “Clicar em Editar de Ana Fictícia opção dois” identifica o segundo cadastro sem renomear o registro.

Agenda, Sessões e Análises usam a mesma regra nos seletores de paciente. O gateway ignora o ponto separador visual `·` e aceita opção um/uma, dois/duas, três até dez; não modifica o conteúdo literal ditado nos campos. Ao confirmar uma seleção, revalida valor e rótulo. Opção removida, desabilitada ou renomeada é recusada; reordenação sem mudança de ID/rótulo mantém o alvo.

## Evidência

- 225/225 JS passaram, incluindo dois testes novos do helper de rótulos.
- 20/20 E2E finais de regressão e identidade de seleções passaram (1,3 min): 16 casos de interface existentes e quatro novos do gateway, após ajustar a correspondência dos números falados. A rodada anterior de 20 também passou antes desse ajuste; não contar como casos adicionais.
- 4/4 E2E de homônimos passaram separadamente (42,9 s): edição do segundo paciente e vínculo com payload/ID/revisão corretos, preservação do primeiro, proposta antiga recusada após troca de vínculo e seleção explícita do segundo paciente nas três áreas. Nome simples ambíguo recusado, nenhuma gravação antes da confirmação.
- Componentes e roteador reais; fronteira Tauri, armazenamento e captura/transcrição dos casos de áudio são sintéticos. Não se testou ditado humano nem interação visual no aplicativo instalado.
- Lint passou com quatro avisos anteriores; guard, diff check e build Vite/Tauri offline/locked passaram. Persistem alertas não bloqueantes de chunk acima de 500 kB e PDB OpenSSL ausente. Implementação Rust não mudou; sua suíte e self-test de dados temporários não foram repetidos.

## Entrega local

`Círculo_0.2.42_x64-setup.exe`, 135.873.412 bytes, SHA-256 `e7da87c938e9b7cac132ad71fc009f3b0ea06b8102badbe0eec7f0333e38f7bd`, Windows x64, Authenticode `NotSigned`. Auditoria de metadados `%TEMP%\circulo-0242-audit-20261003.json`, sem extração do conteúdo. Configuração temporária de build removida; configuração oficial de assinatura intacta.

Instalação silenciosa retornou 0; executável reportou 0.2.42. Quatro arquivos principais do perfil inalterados byte a byte antes da primeira abertura, snapshot `%LOCALAPPDATA%\Círculo-update-backup-20261003-0242`. Smoke de processo aprovado: janela Círculo responsiva, input idle, fechamento normal e término do processo. Nenhum formulário ou dado alterado nessa abertura.

Sem publicação GitHub Release e sem assinatura updater; pacote não oferecido automaticamente. Senhas/seletores de arquivos Windows seguem manuais; assistente só após desbloqueio. Não existe escuta permanente. Microfone humano continua sem validação; campos genéricos de data/hora ainda não aceitam todas as formas faladas. Recovery desabilitado e backups antigos não foram investigados. A meta permanece ativa e a paridade universal não é declarada.
