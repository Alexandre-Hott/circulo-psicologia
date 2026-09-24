# Precedência das ocorrências da agenda

Este MVP usa uma data original como identidade estável de cada ocorrência de uma série semanal ou quinzenal. A grade mensal, semanal e diária usa a mesma função `expandRecurringSeries` e apenas recorta o intervalo exibido.

Para cada data original, aplica-se esta ordem:

1. **Cancelamento individual:** omite a ocorrência da agenda, preserva a série e mantém motivo e histórico da exceção.
2. **Remarcação ou restauração individual:** fixa a data e o horário daquela ocorrência, mesmo se a regra da série mudar depois. A restauração recupera exatamente o último horário efetivo antes do cancelamento.
3. **Mudança da série:** a última mudança cuja data efetiva não ultrapassa a data original determina o novo dia e horário daquele ponto em diante.
4. **Regra original:** vale quando não há mudança ou exceção aplicável.

As alterações da série são ordenadas pela data original efetiva. Uma mudança posterior substitui a regra anterior apenas para as ocorrências a partir dela. Exceções individuais são guardadas pela data original e, portanto, continuam ligadas à mesma ocorrência após mudanças da série. Uma ocorrência cancelada não pode ser remarcada diretamente. Ao cancelar uma ocorrência já remarcada, o histórico da remarcação permanece na exceção, mas ela não aparece na grade.

Um cancelamento vigente de série ativa e não encerrada pode ser restaurado pelo histórico administrativo somente se a identidade original ainda existir, o horário efetivo anterior for futuro e válido, não houver conflito com outra ocorrência e não existir sessão finalizada ou rascunho salvo vinculado à identidade. A ação pede confirmação. O horário anterior fica fixado como exceção individual restaurada; nenhuma mudança posterior da série o recalcula silenciosamente. O cancelamento e eventual remarcação anterior continuam no histórico, seguidos de “Ocorrência restaurada”. Cancelamentos antigos, horários passados e qualquer série já encerrada não oferecem restauração. O histórico é apenas memória local, não trilha de auditoria durável.

No fluxo sintético normal, uma ocorrência com sessão finalizada já não pode ser cancelada. O bloqueio de restauração para uma sessão finalizada vinculada cobre estados legados ou inconsistentes e é verificado em teste de modelo; o fluxo visual cobre restauração, conflito e rascunho vinculado.

O encerramento da série usa `stoppedFromOriginalDate` como corte inclusivo pela **identidade/data original** da primeira ocorrência retirada. Ele não muda `endDate`: uma ocorrência anterior ao corte que foi remarcada para uma data efetiva posterior continua existindo. Ocorrências com identidade no corte ou depois deixam de ser projetadas; as exceções anteriores, sessões finalizadas e seus snapshots permanecem. O diálogo identifica paciente, série e slot atual; a confirmação do encerramento repete paciente (nome/ID), série e data original do corte, sem motivo ou link. A interface só permite escolher uma ocorrência cuja data original e horário efetivo ainda sejam futuros. Se uma sessão finalizada ou um rascunho salvo estiver ligado a uma identidade que seria retirada, o encerramento é recusado e os dados são preservados. O motivo opcional e cada corte ficam no histórico local da série, sem constituir trilha de auditoria durável.

A remarcação prospectiva da série também usa a identidade/data original como corte: esta ocorrência e as seguintes recebem o novo padrão; uma exceção individual anterior ao corte prevalece mesmo se sua data efetiva for posterior. O formulário avisa o alcance, e a confirmação identifica paciente, série, corte e novo slot sem incluir motivo, link ou nota. Cancelar não altera o formulário nem o histórico.

Conflitos são calculados com as ocorrências efetivas depois da aplicação dessas regras. A validação compara o calendário antes e depois de cada alteração e recusa apenas colisões novas; cancelamentos não bloqueiam horários. Duas exceções individuais da mesma série não podem ocupar horários sobrepostos. Alterações de série que criem sobreposição com exceções existentes também são recusadas.

Em uma série com término definido, remarcação individual e mudança da série podem cair no próprio dia final, mas não depois dele. A recusa ocorre antes de gravar a exceção, para que a ocorrência não desapareça silenciosamente da Agenda enquanto o histórico anunciaria uma nova data.

O resumo local de alterações mostra ação, data original, data efetiva ou retirada, horário e motivo. Remarcações e encerramentos aceitam motivo opcional; cancelamentos exigem motivo. Motivos novos são administrativos, limitados a 240 caracteres e exibidos nesse histórico da Agenda; não devem conter dados de prontuário. O limite não reescreve motivos antigos. Esse resumo usa somente o estado em memória e não constitui trilha de auditoria durável.

Ao abrir uma ocorrência ativa, o diálogo permite **Abrir perfil** do paciente associado pelo `patientId` da série, além de remarcar ou cancelar. Ocorrências canceladas não aparecem na grade e, portanto, não oferecem ação de perfil ou início de sessão a partir do evento. A navegação não usa o nome como identificador.

O mesmo diálogo permite **Iniciar sessão** para uma ocorrência ativa. O novo rascunho recebe o `patientId`, a data e as horas locais efetivas da ocorrência, além de uma referência à identidade e data original do evento. Se a ocorrência foi remarcada, o rascunho usa a nova data/horário sem perder a referência original. Se já houver rascunho temporário desse paciente, a interface pede confirmação antes de substituí-lo; rascunhos de outros pacientes não são alterados.

Antes de finalizar um rascunho iniciado pela agenda, a ocorrência de origem é conferida novamente. Se tiver sido cancelada, desativada ou remarcada depois que o rascunho foi guardado, a finalização é bloqueada com uma explicação; o rascunho permanece em memória para consulta. Sessões já finalizadas continuam com seu snapshot histórico, mesmo após alterações posteriores na agenda.

No rascunho iniciado pela Agenda, data, início, fim e modalidade são somente leitura. Para mudá-los, o profissional deve remarcar na Agenda e iniciar uma nova sessão. Antes da finalização, esses valores efetivos do rascunho também são comparados ao snapshot de origem; uma divergência bloqueia a finalização e preserva o rascunho. Em uma sessão avulsa, alterar a data atualiza as datas das ocorrências de comportamento aplicadas naquele rascunho e paciente, sem alterar IDs ou snapshots dos itens. A finalização verifica que paciente e data das ocorrências coincidem com a sessão.

Ao finalizar uma sessão iniciada pela agenda, o perfil e a tela Evolução exibem a origem registrada: série, data original, data efetiva, horário, modalidade e fuso. Uma sessão remarcada é marcada como tal. Esse snapshot não muda quando a série é alterada depois; sessões avulsas não recebem origem de agenda.

Na grade Dia/Semana/Mês, a ocorrência com uma sessão finalizada vinculada aparece como **Realizada** em texto e estilo próprios. Ela continua disponível para consultar o diálogo e o perfil, mas não pode ser iniciada, remarcada ou cancelada novamente. Alterações de série iniciadas em outra data também são recusadas se deslocariam uma ocorrência já realizada; mudanças apenas em ocorrências futuras continuam possíveis. Uma sessão avulsa na mesma data não muda o estado visual nem bloqueia a edição da ocorrência.

O cartão e o perfil de cada paciente calculam a **próxima sessão** a partir das ocorrências efetivas da agenda, sem campo de data duplicado no cadastro. A busca começa no dia e hora civis atuais de `America/Sao_Paulo` e considera apenas ocorrências futuras da própria pessoa em séries ativas que ainda não tenham sessão finalizada vinculada. Cancelamentos e ocorrências já concluídas são omitidos; remarcações usam data e horário efetivos. Sem ocorrência no horizonte demonstrativo de 364 dias, aparece `—`.

Novas séries e mudanças recorrentes verificam conflitos no horizonte de 364 dias; esse limite deve ser revisto antes de usar a agenda com dados reais. Os dados demonstrativos desta fase permanecem somente em memória.

## Datas civis e horário local

A agenda usa explicitamente o identificador IANA `America/Sao_Paulo`. Cada compromisso mantém a data civil (`AAAA-MM-DD`) e as horas locais (`HH:MM`) como valores separados, sem converter a data para UTC ou depender do fuso da máquina que exibe a agenda. As vistas Dia, Semana e Mês, a recorrência e os conflitos usam a mesma aritmética de calendário gregoriano.

Ao criar uma série ou remarcar uma ocorrência, o primeiro horário efetivo é verificado pelas regras IANA do fuso informado. Uma hora local inexistente na transição de verão, ou ambígua na transição de retorno, é recusada com uma mensagem para escolher outro horário. Ocorrências futuras de uma série podem cair em uma transição depois da criação; elas preservam a data e hora de parede originais, aparecem sinalizadas para revisão e **não** são deslocadas automaticamente. A verificação de conflitos continua a comparar intervalos civis para que o resultado não varie conforme a configuração regional do computador.

O fuso não é configurável na interface deste MVP. Regras IANA podem mudar com atualizações do ambiente; por isso, ocorrências sinalizadas devem ser revisadas antes de qualquer uso operacional. Esta demonstração não oferece sincronização externa nem trilha de auditoria durável.
