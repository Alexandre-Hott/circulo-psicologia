# Novas tentativas com alvo explícito

Consolidado no instalador local 0.2.44. [Pacote e evidência](validacao-voz-0.2.44.md).

Os rótulos visíveis identificam a operação; funcionam como comandos “Clicar em …”:

- Recarregar agenda: consulta novamente a prévia da Agenda do Início.
- Recarregar análises: repete a consulta com os filtros atuais.
- Verificar atualizações: verifica a disponibilidade; não inicia download ou instalação.
- Tentar instalação novamente: segue o fluxo normal de instalação, incluindo verificações de formulário aberto e confirmações. Não descarta dados silenciosamente.

Os rótulos antigos “Tentar novamente” e “Verificar e tentar novamente” ficam como aliases explícitos de compatibilidade, não correspondência aproximada. O alias curto só prepara proposta quando identifica um controle único. Se competir com outro alias ou nome real, a escolha é recusada; o usuário pode dizer o novo rótulo. Controles ocultos/desabilitados continuam excluídos. A proposta armazena e revalida a identidade e o nome atuais, não executa pelo alias sem revisão.

Isso resolve o caso de falha simultânea da prévia e da verificação de atualização: os dois controles podem ser acionados separadamente por voz na mesma tela. Não há navegação extra para distinguir os alvos.

Validação: 20/20 E2E conjuntos em 58,2 s (settings de voz, controles de Análises por voz, updater e Análises por clique). A prova com falhas simultâneas confirmou que cada novo comando repete só a sua operação, sem navegar; alias antigo ambíguo não faz nenhuma consulta. Alias único continua funcional. Os testes de formulário aberto preservam cadastro e confirmações. 229/229 JS, lint com quatro avisos anteriores, guard e build frontend aprovados; chunk acima de 500 kB continua como aviso. Rodada intermediária 19/20 falhou por um locator de clique ainda usar o nome antigo; atualizado ao rótulo visível, os 20 passaram conjuntamente.

Nenhuma modificação Rust, dados clínicos reais, assinatura ou publicação Release neste incremento. Os testes usam componentes reais e fronteira nativa sintética; não validam download/instalação real nem microfone físico.
