# Círculo — MVP de acompanhamento psicológico

Protótipo React/Vite para organização do acompanhamento clínico realizado por psicólogos. O produto mantém uma experiência especialmente preparada para psicologia infantil, sem assumir que todos os pacientes são crianças.

Uma faixa informativa permanece visível no início de Pacientes, Agenda, Perfil e Sessão: todos os dados são fictícios, ficam apenas na memória da página, alterações somem ao recarregar e não se deve usar dados clínicos reais. A confirmação de finalização também lembra que a sessão é somente desta demonstração.

## Decisões de integração

- O cadastro identifica o paciente por ciclo de vida: `Criança`, `Adolescente`, `Adulto`, `Idoso` ou `Não informado`.
- A idade em anos é opcional; quando informada, aceita somente número inteiro não negativo. O ciclo de vida é selecionado separadamente, sem inferência automática pela idade.
- O produto usa o termo **paciente** na lista, no perfil e nos registros gerais.
- Para `Criança`, a etapa de emoções oferece o **modo visual infantil**: ícones grandes, intensidade e opção de não responder, sempre com confirmação do profissional.
- Para os demais ciclos, a mesma etapa usa o **registro emocional guiado**, sem apresentar o modo infantil como padrão. A origem do relato continua explícita.
- Indicadores, observações, resumo, linha do tempo e gráficos são descritivos e aplicáveis a todos os ciclos de vida.
- O escopo permanece sendo a organização clínica do psicólogo: não há IA, diagnóstico, prescrição, prontuário médico genérico, backend ou integração externa.

## Fluxo disponível

`Pacientes → Perfil → Nova sessão em rascunho → Emoções → Observações → Indicadores → Resumo privado → Finalização → Evolução`

## Catálogo e agenda reutilizáveis

- A biblioteca contém itens-base de comportamento/observação com categoria, descrição, unidade/escala, versão e status. Uma ocorrência clínica guarda paciente, sessão, data, origem e um *snapshot* da versão aplicada; editar ou arquivar o item não reescreve o histórico.
- A agenda guarda séries semanais ou quinzenais vinculadas ao paciente, não cópias independentes. A tela deriva as ocorrências da série e registra cancelamentos e remarcações por data original, preservando a ligação com a série.
- No perfil e na Evolução, a origem da Agenda aparece dentro do registro da sessão correspondente, a partir do snapshot finalizado (série, datas original e efetiva, horário, modalidade, fuso e Remarcada quando aplicável). Sessões avulsas e rascunhos não recebem origem inventada; mudanças posteriores na série não reescrevem o histórico.
- A agenda é somente de sessões. Cada série inclui modalidade presencial ou online, dia/horário, periodicidade, início e término opcional. Cancelamento exige motivo; remarcação individual ou da série é uma escolha explícita, nunca automática.
- Em séries com término, uma remarcação pode ocorrer no próprio dia final, mas não depois dele; uma tentativa inválida não altera compromisso nem histórico.
- A nota opcional da série é exclusivamente administrativa (até 240 caracteres). A criação avisa para não inserir dados clínicos; a nota aparece somente na seção administrativa de séries da Agenda e não é copiada para ocorrências, rascunhos, sessões, perfil ou evolução.
- Na criação de série, fechar por Escape, X, fundo ou Cancelar com campos alterados exige confirmação de descarte. O aviso identifica paciente e data inicial e lista só nomes de campos, sem expor link, nota ou outros valores; criar com sucesso fecha sem esse aviso.
- A seção administrativa permite editar ou limpar a nota de uma série já criada, sem alterar a série, suas ocorrências ou registros clínicos. Nenhuma versão anterior da nota é gravada no histórico.
- Os botões repetidos de editar/limpar nota e restaurar ocorrência incluem paciente e identidade no nome acessível; o conteúdo da nota ou motivo não é anunciado pelo botão.
- Os cartões de ocorrência da Agenda preservam o texto visual como início do nome acessível e acrescentam paciente/ID, data efetiva, horário, série e data original para distinguir ocorrências repetidas. O nome também anuncia Remarcada, Realizada e alerta de horário local quando visíveis, sem incluir link, motivo, nota ou conteúdo clínico.
- O editor e as confirmações administrativas repetem paciente, série e horário pertinente antes da ação, sem incluir o conteúdo da nota ou motivo.
- Ao trocar de paciente durante a criação, link externo e nota administrativa preenchidos exigem uma única confirmação para descarte; cancelar preserva os campos e o paciente anterior.
- As visões Dia, Semana e Mês usam a mesma projeção de ocorrências efetivas e verificam novos conflitos. O cartão e o perfil do paciente mostram a próxima sessão futura ativa da agenda, considerando remarcações e cancelamentos; sem ocorrência, mostram `—`.
- No diálogo de alteração de compromisso, trocar entre remarcação, cancelamento e encerramento com motivo já preenchido exige confirmação para descartá-lo; a simples troca não grava evento no histórico.
- Fechar o editor de compromisso com tipo de ação, data, horário ou motivo alterados — inclusive por Escape, fundo, perfil ou início de sessão — também exige confirmação. O aviso identifica o compromisso e apenas os nomes dos campos alterados, nunca seus valores; cancelar mantém o formulário.
- O motivo dessas ações é administrativo, aparece no histórico da Agenda e aceita até 240 caracteres. O diálogo avisa para não inserir dados de prontuário; motivos já existentes não são reescritos.
- O diálogo de alteração identifica o compromisso selecionado por paciente (nome/ID), série, data original e slot efetivo/horário/status. A confirmação de encerramento repete o alvo e o corte prospectivo, sem incluir motivo, link ou conteúdo clínico; a referência Online permanece em bloco separado.
- A remarcação de uma série usa um botão próprio e confirma paciente, série, corte pela data original e novo horário antes de alterar esta ocorrência e as seguintes. Cancelar mantém o formulário e a Agenda; ocorrências anteriores ao corte continuam válidas, mesmo quando remarcadas para uma data posterior.
- Um cancelamento vigente pode ser restaurado pelo histórico administrativo quando o horário anterior ainda é futuro e não há conflito ou registros vinculados. A restauração mantém a mesma identidade da ocorrência e preserva no histórico o cancelamento e remarcações anteriores.
- Iniciar pela Agenda retoma um rascunho salvo da mesma ocorrência somente se o vínculo ainda corresponder ao compromisso vigente. Se o rascunho for avulso, de outra ocorrência ou estiver desatualizado, a substituição exige confirmação com paciente e datas de origem/alvo, sem repetir respostas clínicas, nota privada, link ou motivo administrativo.

## Diretrizes clínicas e de uso confirmadas

- O prontuário é exclusivo do psicólogo. Crianças e pacientes não usam esta interface no MVP.
- Não há anexos de arquivos no MVP.
- Avaliação, sessão e metas usam modelos iniciais editáveis pelo psicólogo. Eles são uma estrutura de organização, não um protocolo universal, recomendação clínica ou instrumento prescritivo.
- O futuro desktop fará backup automático cifrado e permitirá exportar/restaurar a migração em outro computador mediante a senha do backup. O backup nunca é enviado ao GitHub.

Dados, sessões e rascunhos desta demonstração ficam apenas na memória da página. Recarregar a página descarta as alterações; não há armazenamento clínico seguro.

Se já houver um rascunho guardado, sair descartando alterações recentes conserva a versão salva. Excluir a versão inteira é uma ação separada, com confirmação que identifica paciente e origem, sem repetir conteúdo clínico ou privado.

Em Ajustes, limpar a demonstração exige um diálogo modal com foco inicial em Cancelar; Escape e Cancelar preservam todos os registros temporários. Somente a confirmação remove as coleções em memória. O aviso lista categorias, sem repetir dados clínicos.

Em “Backup e migração”, os botões “Sobre…” apenas explicam por que as operações dependem do app desktop com banco cifrado. O diálogo não escolhe pasta, cria arquivo, exporta, restaura ou migra dados. Todos os registros desta demonstração continuam voláteis; não use dados reais.

A confirmação de finalização identifica apenas paciente (nome e ID) e data da sessão. Ela não repete conteúdo clínico ou notas privadas; cancelar mantém o rascunho em edição.

No registro emocional, substituir emoções selecionadas por “Não sei”/“Não quero responder” — ou uma dessas respostas por uma emoção — exige confirmação antes de apagar a escolha anterior. O aviso não enumera emoções, intensidades ou notas.

## Próxima arquitetura desktop

O plano para transformar o protótipo em aplicativo Windows local, incluindo banco cifrado, autenticação local, backup, restauração e releases, está em [docs/plano-desktop-windows.md](docs/plano-desktop-windows.md). Ele não configura publicação ou conexão com GitHub.

## Executar

```powershell
npm install
npm run dev
```

## Verificar

```powershell
npm run lint
npm run build
npm test
npm run test:e2e
```

## Limitações do MVP

- Dados demonstrativos e em memória; não há autenticação, permissões reais, auditoria nem persistência clínica segura.
- O cadastro é intencionalmente simples e não substitui um processo de identificação ou consentimento.
- Os gráficos descritivos usam apenas as sessões sintéticas da página e não têm significado diagnóstico; qualquer acompanhamento durável exigirá persistência clínica segura.
