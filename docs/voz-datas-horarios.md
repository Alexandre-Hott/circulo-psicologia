# Campos de data e horário por voz

Incremento de código posterior ao instalador local 0.2.42. Ainda não empacotado no Windows.

O gateway normaliza somente campos HTML de data e hora visíveis. Não modifica nomes, observações ou demais textos. O valor convertido aparece na proposta; confirmar dispara os eventos normais do formulário, sem escrita direta no backend. Limites, obrigatoriedade e validações existentes continuam valendo.

Exemplos:

- “Preencher Data do compromisso com dez de outubro de 2026”.
- “Preencher Início da série com primeiro de março de dois mil e vinte e seis”.
- “Preencher Horário inicial com três da tarde”.
- “Preencher Horário final com três horas e cinquenta minutos da tarde”.
- Formatos numéricos existentes: AAAA-MM-DD, DD/MM/AAAA e HH:MM.

Datas precisam de ano explícito; não se inferem hoje/amanhã neste preenchimento genérico. Os pedidos naturais de calendário já têm sua rota própria. Anos falados suportam dois mil até dois mil e noventa e nove; demais anos devem ser numéricos de quatro dígitos. Datas impossíveis são recusadas.

Horas de 1 a 12 sem manhã/tarde/noite são ambíguas e recusadas; formato HH:MM é explícito de 24 horas. Horas de 13 a 23 podem ser faladas sem período. Meio-dia e meia-noite têm valores explícitos; “três da noite” é recusado. Não há horários aproximados ou alternativas. Formatos numéricos com segundos são preservados, mas dependem do step/validação do campo; segundos falados não são suportados. Números e minutos seguem vocabulário português limitado, não interpretação irrestrita de linguagem natural.

Validação: 229/229 testes JS, lint com quatro avisos anteriores, guard e build frontend passaram. Regressão conjunta Agenda/interface: 24/24 em 2,1 min antes dos ajustes finais da revisão. Após corrigir duas falhas de horas/minutos encontradas pela revisão, os unitários passaram novamente e o cenário específico ampliado passou em 20,8 s, verificando 20:03 e 21:30 no formulário. A rodada intermediária 23/24 falhou apenas pelo texto do erro; o prefixo “Valor inválido” foi preservado junto da nova orientação. Nenhuma alteração Rust, build NSIS ou instalação nesta rodada.

Microfone físico/ditado humano ainda não validado. As provas de interface usam comandos transcritos digitados e armazenamento Tauri sintético; isso não comprova a qualidade do reconhecimento Whisper nem persistência cifrada nativa.
