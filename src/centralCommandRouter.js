const normalize = value => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR')
  .replace(/[’']/g, '')
  .replace(/\s+/g, ' ')
  .trim()

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const weekdays = [
  { index: 0, names: ['domingo'] },
  { index: 1, names: ['segunda-feira', 'segunda'] },
  { index: 2, names: ['terca-feira', 'terca'] },
  { index: 3, names: ['quarta-feira', 'quarta'] },
  { index: 4, names: ['quinta-feira', 'quinta'] },
  { index: 5, names: ['sexta-feira', 'sexta'] },
  { index: 6, names: ['sabado'] },
]
const spokenHours = new Map([
  ['meia-noite', 0], ['meia noite', 0], ['uma', 1], ['um', 1], ['duas', 2], ['dois', 2],
  ['tres', 3], ['quatro', 4], ['cinco', 5], ['seis', 6], ['sete', 7], ['oito', 8],
  ['nove', 9], ['dez', 10], ['onze', 11], ['doze', 12], ['treze', 13], ['catorze', 14],
  ['quatorze', 14], ['quinze', 15], ['dezesseis', 16], ['dezassete', 17], ['dezessete', 17],
  ['dezoito', 18], ['dezenove', 19], ['vinte', 20], ['vinte e uma', 21], ['vinte e duas', 22],
  ['vinte e tres', 23],
])

const refuse = message => ({ status: 'clarification', message })
const draft = (intent, preview, notes = []) => ({ status: 'draft', intent, preview, notes })

const findExactMatches = (text, entities, getName = entity => entity.name) => {
  const normalizedText = normalize(text)
  return entities
    .filter(entity => entity && (entity.archivedAt == null || entity.archivedAt === undefined))
    .map(entity => ({ entity, name: String(getName(entity) ?? '').trim(), normalizedName: normalize(getName(entity)) }))
    .filter(item => item.normalizedName && new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(item.normalizedName)}(?=$|[^\\p{L}\\p{N}])`, 'u').test(normalizedText))
    .sort((a, b) => b.normalizedName.length - a.normalizedName.length)
}

const uniqueEntity = (text, entities, label, getName) => {
  const matches = findExactMatches(text, entities, getName)
  if (!matches.length) return { error: `Não encontrei ${label} com esse nome. Confira o nome no cadastro e tente novamente.` }
  const longest = matches[0].normalizedName.length
  const best = matches.filter(item => item.normalizedName.length === longest)
  if (best.length !== 1) return { error: `Encontrei mais de um ${label} compatível. Informe um nome mais específico.` }
  return { entity: best[0].entity }
}

const parseAge = value => {
  if (value == null) return null
  const age = Number(value)
  return Number.isInteger(age) && age >= 0 && age <= 120 ? age : undefined
}

const parseWeekday = text => {
  const matches = weekdays.flatMap(day => day.names
    .filter(name => new RegExp(`(^|[^\\p{L}])${escapeRegExp(name)}(?=$|[^\\p{L}])`, 'u').test(text))
    .map(name => ({ index: day.index, name })))
  const indices = [...new Set(matches.map(item => item.index))]
  return indices.length === 1 ? { index: indices[0], label: matches.find(item => item.index === indices[0]).name } : null
}

const parseTime = text => {
  const marker = /\b(?:as|pelas?)\s+(.+?)(?=\s+(?:na|no|para|toda|todo|semanal|quinzenal|a partir|com inicio|inicio em|com modalidade)\b|$)/u.exec(text)
  if (!marker) return null
  const phrase = marker[1].trim()
  const period = /\b(?:da|de|pela)\s+(manha|tarde|noite)\b/u.exec(phrase)?.[1]
  const numeric = /^(\d{1,2})(?::([0-5]\d))?\s*(?:h(?:oras?)?)?(?:\s+e\s+meia)?(?:\s+(?:da|de|pela)\s+(?:manha|tarde|noite))?$/u.exec(phrase)
  const spoken = !numeric && [...spokenHours.keys()].sort((a, b) => b.length - a.length)
    .find(hour => phrase === hour || phrase.startsWith(`${hour} `))
  let hour
  let minute = 0
  if (numeric) {
    hour = Number(numeric[1])
    minute = numeric[2] == null ? (/\be\s+meia\b/u.test(phrase) ? 30 : 0) : Number(numeric[2])
  } else if (spoken) {
    hour = spokenHours.get(spoken)
    if (/\be\s+meia\b/u.test(phrase)) minute = 30
  } else return null

  if (period) {
    if (hour < 1 || hour > 12) return null
    if (period === 'tarde' && hour < 12) hour += 12
    if (period === 'noite' && hour < 12) hour += 12
    if (period === 'manha' && hour === 12) hour = 0
  } else if (hour >= 1 && hour <= 12) {
    return { ambiguous: true }
  }
  if (hour > 23 || (hour === 23 && minute > 9)) return null
  const start = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  const endMinutes = hour * 60 + minute + 50
  const end = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`
  return { start, end }
}

const parseStartDate = text => {
  const match = /\b(?:a partir de|com inicio em|inicio em)\s+(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})\b/u.exec(text)
  if (!match) return null
  if (match[1].includes('/')) {
    const [, day, month, year] = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(match[1])
    return `${year}-${month}-${day}`
  }
  return match[1]
}

const isCivilDate = value => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  if (!match) return false
  const [, year, month, day] = match.map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

const parsePatientCreation = text => {
  const match = /^(?:cadastrar|criar|adicionar)\s+(?:um\s+)?paciente\s+(?:chamado\s+|chamada\s+)?(.+?)(?:\s+com\s+(\d{1,3})\s+anos?)?[.!?]*$/iu.exec(text)
  if (!match) return null
  const name = match[1].trim().replace(/[.!?]+$/g, '').trim()
  if (!name || name.length > 160) return refuse('Informe um nome de paciente com até 160 caracteres.')
  const age = parseAge(match[2])
  if (age === undefined) return refuse('A idade deve ser um número inteiro entre 0 e 120 anos.')
  const patientDraft = { name, age }
  return draft(
    { type: 'patient.create', draft: patientDraft },
    `Rascunho de paciente: ${name}${age == null ? ' · idade não informada' : ` · ${age} anos`}.`,
    ['Nada será cadastrado até que a tela de destino revise e confirme este rascunho.'],
  )
}

const parseRecurringAppointment = ({ text, context, referenceDate }) => {
  if (!/\b(?:agendar|agenda|marcar|marca|criar|cria|adicionar|adiciona|incluir|inclui)\b/u.test(text) || !/\b(?:sessao|compromisso|serie)\b/u.test(text)) return null
  const patients = (context.patients || []).filter(patient => patient.archivedAt == null)
  const patientResult = uniqueEntity(text, patients, 'paciente')
  if (patientResult.error) return refuse(patientResult.error)
  const weekday = parseWeekday(text)
  const frequencyMatch = /\b(quinzenal|semanal|toda semana|toda quinzena)\b/u.exec(text)
    || (weekday && /\btoda\s+/u.test(text) ? ['', 'semanal'] : null)
  const time = parseTime(text)
  if (!frequencyMatch || !weekday || !time) {
    const missing = [!frequencyMatch && 'frequência semanal ou quinzenal', !weekday && 'dia da semana', !time && 'horário explícito (por exemplo, 15:00 ou três da tarde)'].filter(Boolean)
    return refuse(`Para preparar a série, preciso de: ${missing.join(', ')}.`)
  }
  if (time.ambiguous) return refuse('O horário pode significar manhã ou noite. Diga, por exemplo, “9 da manhã” ou “21 horas”.')
  const startDate = parseStartDate(text) || referenceDate
  if (!isCivilDate(startDate)) return refuse('Informe uma data de início válida ou abra o comando com a data de hoje disponível.')
  const frequency = /quinz/u.test(frequencyMatch[1]) ? 'Quinzenal' : 'Semanal'
  const patient = patientResult.entity
  const appointmentDraft = {
    appointmentType: 'Recorrente', patientId: patient.id, patientName: patient.name,
    weekday: weekday.index, frequency, startDate, endDate: null,
    start: time.start, end: time.end, modality: /\bonline\b/u.test(text) ? 'Online' : 'Presencial', meetingLink: '',
  }
  return draft(
    { type: 'appointment.recurring.create', draft: appointmentDraft },
    `Rascunho de série ${frequency.toLocaleLowerCase('pt-BR')} para ${patient.name}: ${weekday.label}, ${time.start}–${time.end}, a partir de ${startDate}, ${appointmentDraft.modality.toLocaleLowerCase('pt-BR')}.`,
    [! /\b(?:online|presencial)\b/u.test(text) ? `A modalidade presencial foi preenchida pelo padrão atual do formulário (${appointmentDraft.modality}).` : 'Modalidade identificada explicitamente no comando.', 'Revise paciente, data, horário e modalidade antes de confirmar. Nenhum compromisso foi criado.'],
  )
}

const resolveSessionTarget = (text, context) => {
  const patientResult = uniqueEntity(text, (context.patients || []).filter(patient => patient.archivedAt == null), 'paciente')
  if (patientResult.error) return { error: patientResult.error }
  const session = context.activeSessionDraft
  if (!session?.id || !session?.patientId) return { error: 'Abra primeiro um rascunho de sessão específico. Não vou associar registros a um paciente sem sessão selecionada.' }
  if (session.patientId !== patientResult.entity.id) return { error: `A sessão aberta pertence a ${session.patientName || 'outro paciente'}. Selecione a sessão de ${patientResult.entity.name} antes de continuar.` }
  return { patient: patientResult.entity, session }
}

const parseSessionDraft = ({ text, rawText, context }) => {
  if (!/\b(?:sessao|rascunho)\b/u.test(text) || !/\b(?:comportamento|indicador|observacao|evolucao|procedimento|resultado|encaminhamento|fechamento|decisao)\b/u.test(text)) return null
  const target = resolveSessionTarget(text, context)
  if (target.error) return refuse(target.error)
  const sessionTarget = {
    patientId: target.patient.id,
    patientName: target.patient.name,
    sessionDraftId: target.session.id,
    sessionDate: target.session.originalDate || target.session.date || null,
  }

  const behaviorCommand = /\b(?:selecionar|marcar|adicionar)\s+(?:o\s+)?comportamento\s+(.+?)\s+(?:para|na sessao de|na sessao do|na sessao da)\s+(.+?)\s+na sessao\b/u.exec(text)
    || /\b(?:selecionar|marcar|adicionar)\s+(?:o\s+)?comportamento\s+(.+?)\s+na sessao de\s+(.+?)\s*$/u.exec(text)
  if (behaviorCommand) {
    const behaviorResult = uniqueEntity(behaviorCommand[1], context.behaviors || [], 'modelo de comportamento', item => item.title)
    if (behaviorResult.error) return refuse(behaviorResult.error)
    const patientInCommand = uniqueEntity(behaviorCommand[2], [target.patient], 'paciente')
    if (patientInCommand.error) return refuse(patientInCommand.error)
    const behavior = behaviorResult.entity
    return draft(
      { type: 'session.draft.update', target: sessionTarget, patch: { field: 'behaviorIds', operation: 'add', value: behavior.id, label: behavior.title } },
      `Rascunho: selecionar “${behavior.title}” como comportamento observado na sessão de ${target.patient.name}${sessionTarget.sessionDate ? ` (${sessionTarget.sessionDate})` : ''}.`,
      ['Isto registra uma observação apenas nesta sessão; não define o paciente nem infere um traço.'],
    )
  }

  const indicatorCommand = /\b(?:definir|registrar|marcar)\s+(?:o\s+)?indicador\s+(.+?)\s+(?:como|em)\s+(.+?)\s+na sessao de\s+(.+?)\s*$/u.exec(text)
  if (indicatorCommand) {
    const indicatorResult = uniqueEntity(indicatorCommand[1], context.indicators || [], 'indicador')
    if (indicatorResult.error) return refuse(indicatorResult.error)
    const indicator = indicatorResult.entity
    const label = indicator.labels?.find(item => normalize(item) === normalize(indicatorCommand[2]))
    if (!label) return refuse(`Esse valor não existe na escala “${indicator.name}”. Use uma das opções do catálogo.`)
    const patientInCommand = uniqueEntity(indicatorCommand[3], [target.patient], 'paciente')
    if (patientInCommand.error) return refuse(patientInCommand.error)
    const value = indicator.labels.indexOf(label)
    return draft(
      { type: 'session.draft.update', target: sessionTarget, patch: { field: 'indicators', operation: 'set', value: { id: indicator.id, value, label } } },
      `Rascunho: registrar “${label}” em ${indicator.name} na sessão de ${target.patient.name}${sessionTarget.sessionDate ? ` (${sessionTarget.sessionDate})` : ''}.`,
      ['O valor será associado somente ao rascunho de sessão indicado; confira a escala antes de aplicar.'],
    )
  }

  const fieldCommand = /\b(?:preencher|anotar|registrar)\s+(observa(?:ção|cao)|evolu(?:ção|cao)|procedimentos?|resultado|decis(?:ão|ao)|encaminhamento|fechamento)\s+(?:da|do)\s+sess(?:ão|ao)\s+de\s+(.+?)\s+com\s+(.+)$/iu.exec(rawText)
  if (fieldCommand) {
    const field = normalize(fieldCommand[1])
    const fieldMap = {
      observacao: 'observation', evolucao: 'observation', procedimento: 'procedures', procedimentos: 'procedures',
      resultado: 'outcomeDecision', decisao: 'outcomeDecision', encaminhamento: 'referralClosure', fechamento: 'referralClosure',
    }
    const patientInCommand = uniqueEntity(fieldCommand[2], [target.patient], 'paciente')
    if (patientInCommand.error) return refuse(patientInCommand.error)
    const exactText = fieldCommand[3].trim().replace(/^['“"]|['”"]$/g, '')
    if (!exactText || exactText.length > 1000) return refuse('O texto do campo deve ter entre 1 e 1000 caracteres.')
    const key = fieldMap[field]
    return draft(
      { type: 'session.draft.update', target: sessionTarget, patch: { field: key, operation: 'replace', value: exactText } },
      `Rascunho para ${target.patient.name}: preencher “${fieldCommand[1]}” da sessão com “${exactText}”.`,
      ['O texto foi mantido literalmente, sem interpretação clínica. Revise antes de aplicar ao rascunho.'],
    )
  }

  return refuse('Comando de sessão não reconhecido. Diga explicitamente o campo ou o modelo, o paciente e a sessão aberta.')
}

/**
 * Deterministic parser for a small, explicit Portuguese command vocabulary.
 * Returns a proposed typed draft only. It never invokes persistence or UI actions.
 * context: { patients, behaviors, indicators, activeSessionDraft: { id, patientId, originalDate? } }
 */
export function parseCentralCommand({ text, context = {}, referenceDate } = {}) {
  const rawText = String(text ?? '').trim()
  const normalized = normalize(rawText)
  if (!normalized) return refuse('Digite um comando para continuar.')
  if (normalized.length > 1200) return refuse('O comando passou do limite de 1200 caracteres. Divida-o em comandos menores.')
  if (/\b(?:apague|apagar|exclua|excluir|delete|remova|remover|finalize|finalizar|cancele|cancelar|arquive|arquivar|restaure|restaurar)\b/u.test(normalized)) {
    return refuse('Este comando não pode executar ações destrutivas ou finais. Faça essa ação manualmente na tela correspondente.')
  }
  const patient = parsePatientCreation(rawText)
  if (patient) return patient
  const session = parseSessionDraft({ text: normalized, rawText, context })
  if (session) return session
  const appointment = parseRecurringAppointment({ text: normalized, context, referenceDate })
  if (appointment) return appointment
  return refuse('Ainda não reconheço esse comando. Posso preparar um rascunho de paciente, uma série recorrente ou campos explícitos de uma sessão aberta.')
}

export function formatCentralCommandPreview(result) {
  if (!result || result.status !== 'draft') return result?.message || 'Nenhum rascunho preparado.'
  return result.preview
}
