import { addCivilDays, parseCivilDate } from './calendarDate.js'
import { inSupportedRange } from './analyticsRange.js'
import { normalizeVoiceFieldValue } from './voiceFieldValue.js'

const normalize = value => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR')
  .replace(/[\u2019\u0027]/g, '')
  // Whisper can split "sessão" into "se são" or confuse it with "seção".
  .replace(/\bse sao\b/g, 'sessao')
  .replace(/\bsecao\b/g, 'sessao')
  // Observed Whisper base-model variants for a slow synthetic weekly-agenda phrase.
  .replace(/\b(?:cesa|sesa|sesao)\s*,?\s+libra\s+ossemanal\b/g, 'sessao semanal')
  // Additional exact SAPI/Whisper variants observed through the app's Rust audio path.
  .replace(/\bsesalibra\s+ossemanal\b/g, 'sessao semanal')
  .replace(/\bsesa\s+libra\s*-?\s*o\b/g, 'sessao')
  // Observed SAPI/Whisper spelling “Sessã Libra O”; repair only this phrase.
  .replace(/\bsessa\s+libra\s*-?\s*o\b/g, 'sessao')
  .replace(/\bsesalibra\s*-\s*o\b/g, 'sessao')
  .replace(/\b(comportamento|indicador|observacao|evolucao),\s*/g, '$1 ')
  .replace(/\besse (?=\d{1,2}\s*(?:h\b|horas?\b))/g, 'as ')
  // Whisper sometimes hears a clipped “às” as “toda” before a numeric time.
  .replace(/\btoda (?=\d{1,2}\s*horas?\b)/g, 'as ')
  .replace(/\s+/g, ' ')
  .replace(/[.!?;,:]+$/u, '')
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
  const selectedName = best[0].normalizedName
  const withoutSelected = normalize(text).replace(
    new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(selectedName)}(?=$|[^\\p{L}\\p{N}])`, 'gu'),
    '$1 ',
  )
  if (findExactMatches(withoutSelected, entities, getName).some(item => item.entity.id !== best[0].entity.id)) {
    return { error: `Encontrei mais de um ${label} no pedido. Mencione apenas um por comando.` }
  }
  return { entity: best[0].entity }
}

const parseAge = value => {
  if (value == null) return null
  const spokenAges = new Map([
    ['zero', 0], ['um', 1], ['uma', 1], ['dois', 2], ['duas', 2], ['tres', 3],
    ['quatro', 4], ['cinco', 5], ['seis', 6], ['sete', 7], ['oito', 8], ['nove', 9],
    ['dez', 10], ['onze', 11], ['doze', 12], ['treze', 13], ['catorze', 14], ['quatorze', 14],
    ['quinze', 15], ['dezesseis', 16], ['dezessete', 17], ['dezoito', 18], ['dezenove', 19],
    ['vinte', 20], ['vinte e um', 21], ['vinte e uma', 21], ['vinte e dois', 22],
    ['vinte e duas', 22], ['vinte e tres', 23], ['dezassete', 17],
  ])
  const units = ['zero', 'um', 'dois', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove']
  const tens = ['vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
  tens.forEach((word, index) => {
    const base = (index + 2) * 10
    spokenAges.set(word, base)
    units.slice(1).forEach((unit, offset) => spokenAges.set(`${word} e ${unit}`, base + offset + 1))
    spokenAges.set(`${word} e uma`, base + 1)
    spokenAges.set(`${word} e duas`, base + 2)
  })
  spokenAges.set('cem', 100)
  for (const [word, number] of [...spokenAges]) {
    if (number > 0 && number <= 20) spokenAges.set(`cento e ${word}`, 100 + number)
  }
  const numeric = /^\d{1,3}$/u.test(String(value).trim()) ? Number(value) : null
  const age = numeric ?? spokenAges.get(normalize(value))
  if (age == null) return undefined
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
  const marker = /\b(?:as|pelas?)\s+(.+?)(?=\s+(?:na|no|para|toda|todo|semanal|quinzenal|a partir|com inicio|inicio em|com modalidade|online|presencial)\b|$)/u.exec(text)
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

const cleanArgument = text => text.trim().replace(/[.!?;]+$/u, '').trim()
const validName = name => name.length > 0 && name.length <= 160

// Unlike session commands, these commands have a delimited entity argument:
// the entire argument must match, never just a name embedded in other text.
const exactTarget = (text, entities, label, getName = entity => entity.name) => {
  const matches = entities.filter(entity => normalize(getName(entity)) === normalize(cleanArgument(text)))
  if (matches.length === 1) return { entity: matches[0] }
  return { error: matches.length > 1
    ? `Encontrei mais de um ${label} com esse nome. Informe um nome único.`
    : `Não encontrei ${label} com esse nome exato. Mencione apenas um por comando.` }
}

// Read only explicit trailing attributes; never normalize the stored name.
const patientAttributes = input => {
  let rest = cleanArgument(input)
  const patch = {}
  for (;;) {
    const modality = /\s+(?:(?:com|na|em)\s+modalidade(?:\s+preferida)?|modalidade(?:\s+preferida)?|(?:com|no|na|em)\s+atendimento)\s+(\S+)$/iu.exec(rest)
      || /\s+(?:com\s+|na\s+|em\s+)?(online|presencial)$/iu.exec(rest)
    if (modality) {
      const value = normalize(modality[1])
      if (Object.hasOwn(patch, 'preferredModality') || !['online', 'presencial'].includes(value)) {
        return { error: 'Informe uma única modalidade: Online ou Presencial.' }
      }
      patch.preferredModality = value === 'online' ? 'Online' : 'Presencial'
      rest = rest.slice(0, modality.index).trim()
      continue
    }
    const age = /\s+(?:com|de)\s+((?:(?!\b(?:com|de)\b).)+?)\s+anos?$/iu.exec(rest)
    if (age) {
      const value = parseAge(age[1])
      if (Object.hasOwn(patch, 'age') || value === undefined) return { error: 'A idade deve ser um número inteiro entre 0 e 120 anos.' }
      patch.age = value
      rest = rest.slice(0, age.index).trim()
      continue
    }
    break
  }
  if (/\s+(?:com|de)\s+\d|\s+(?:(?:com|na|em)\s+)?modalidade\b/iu.test(rest)) {
    return { error: 'Informe atributos explícitos: idade em anos e uma modalidade Online ou Presencial.' }
  }
  return { name: rest, patch }
}

const parsePatientCreation = text => {
  const match = /^(?:(?:cadastrar|cadastre|cadastra|criar|crie|cria|adicionar|adicione|adiciona)\s+(?:um\s+|uma\s+)?(?:novo\s+)?paciente|novo\s+paciente)[.!?,:]?\s+(?:chamad[oa]\s+)?(.+)$/iu.exec(text)
  if (!match) return null
  const parsed = patientAttributes(match[1])
  if (parsed.error) return refuse(parsed.error)
  const { name, patch } = parsed
  if (!validName(name)) return refuse('Informe um nome de paciente com até 160 caracteres.')
  if (/\s+e\s+(?:paciente\s+)?/iu.test(name)) return refuse('Mencione apenas um paciente por comando; use comandos separados para nomes com “e”.')
  const patientDraft = { name, age: null, ...patch }
  return draft(
    { type: 'patient.create', draft: patientDraft },
    `Rascunho de paciente: ${name}${patientDraft.age == null ? ' · idade não informada' : ` · ${patientDraft.age} anos`}${patch.preferredModality ? ` · ${patch.preferredModality}` : ''}.`,
    ['Nada será cadastrado até que a tela de destino revise e confirme este rascunho.'],
  )
}

const parsePatientManagement = (text, context) => {
  const patients = context.patients || []
  const lifecycle = /^(arquivar|arquive|arquiva|restaurar|restaure|restaura)\s+(?:o\s+)?paciente\s+(.+)$/iu.exec(text)
  if (lifecycle) {
    const restoring = /^restaur/iu.test(lifecycle[1])
    const result = exactTarget(lifecycle[2], patients.filter(patient => restoring ? patient.archivedAt != null : patient.archivedAt == null), 'paciente')
    if (result.error) return refuse(result.error)
    return draft({ type: restoring ? 'patient.restore' : 'patient.archive', target: { patientId: result.entity.id } },
      `${restoring ? 'Restaurar' : 'Arquivar'} paciente ${result.entity.name}.`)
  }
  const rename = /^(?:renomear|renomeie|renomeia)\s+(?:o\s+)?paciente\s+(.+?)\s+para\s+(.+)$/iu.exec(text)
  const modality = /^(?:mudar|mude|muda|alterar|altere|altera)\s+(?:a\s+)?modalidade\s+(?:de|do|da)\s+(?:paciente\s+)?(.+?)\s+para\s+(.+)$/iu.exec(text)
  // A pause after the command noun can be transcribed as punctuation.
  // Consume it before the entity argument, never inside the patient's name.
  const edit = /^(?:editar|edite|edita|atualizar|atualize|atualiza)\s+(?:o\s+)?paciente[.,]?\s+(.+)$/iu.exec(text)
  if (!rename && !modality && !edit) return null
  let targetName
  let patch
  if (rename) {
    targetName = rename[1]
    const name = cleanArgument(rename[2])
    if (!validName(name)) return refuse('Informe um nome de paciente com até 160 caracteres.')
    patch = { name }
  } else if (modality) {
    targetName = modality[1]
    const value = normalize(modality[2])
    if (!['online', 'presencial'].includes(value)) return refuse('Informe uma única modalidade: Online ou Presencial.')
    patch = { preferredModality: value === 'online' ? 'Online' : 'Presencial' }
  } else {
    const parsed = patientAttributes(edit[1])
    if (parsed.error) return refuse(parsed.error)
    targetName = parsed.name
    patch = parsed.patch
  }
  const result = exactTarget(targetName, patients.filter(patient => patient.archivedAt == null), 'paciente')
  if (result.error) return refuse(result.error)
  if (!Object.keys(patch).length) {
    return draft({ type: 'patient.edit.open', target: { patientId: result.entity.id } },
      `Abrir edição do cadastro de ${result.entity.name}.`, ['Apenas abre o formulário existente; nenhum dado será salvo.'])
  }
  return draft({ type: 'patient.update', target: { patientId: result.entity.id }, draft: patch },
    `Alterar ${result.entity.name}: ${[patch.name && `nome ${patch.name}`, patch.age != null && `idade ${patch.age} anos`, patch.preferredModality && `modalidade ${patch.preferredModality}`].filter(Boolean).join(' · ')}.`)
}

const parseBehaviorManagement = (text, context) => {
  const match = /^(criar|crie|cria|cadastrar|cadastre|cadastra|adicionar|adicione|adiciona|editar|edite|edita|atualizar|atualize|atualiza)\s+(?:um\s+|o\s+)?comportamento\s+(.+)$/iu.exec(text)
  if (!match) return null
  const editing = /^(?:edit|atualiz)/iu.test(match[1])
  const description = /\s+com\s+descri[çc][ãa]o\s+(.+)$/iu.exec(match[2])
  const titleArgument = (description ? match[2].slice(0, description.index) : match[2]).trim()
  const availableBehaviors = (context.behaviors || []).filter(item => item.archivedAt == null)
  const hasLiteralTarget = editing && availableBehaviors.some(item => normalize(item.title) === normalize(titleArgument))
  const rename = editing && !hasLiteralTarget && /\s+para\s+(.+)$/iu.exec(titleArgument)
  const titleOrTarget = match[2].slice(0, rename ? rename.index : description ? description.index : undefined).trim()
  const patch = {}
  if (!editing || rename) patch.title = rename ? rename[1].trim() : titleOrTarget
  if (/\s+com\s+descri[çc][ãa]o\s*$/iu.test(match[2])) return refuse('Informe o texto da descrição.')
  if (description) patch.description = description[1].trim()
  if (patch.title != null && !validName(patch.title)) return refuse('Informe um título de comportamento com até 160 caracteres.')
  if (patch.description != null && (!patch.description || patch.description.length > 1000)) return refuse('A descrição deve ter entre 1 e 1000 caracteres.')
  if (!editing) {
    return draft({ type: 'behavior.create', draft: { title: patch.title, description: patch.description ?? '' } },
      `Rascunho de comportamento: ${patch.title}.`, ['Título e descrição mantidos literalmente, sem interpretação clínica.'])
  }
  const result = exactTarget(titleOrTarget, availableBehaviors, 'modelo de comportamento', item => item.title)
  if (result.error) return refuse(result.error)
  if (!Object.keys(patch).length) {
    return draft({ type: 'behavior.edit.open', target: { behaviorId: result.entity.id } },
      `Abrir edição do comportamento ${result.entity.title}.`, ['Apenas abre a biblioteca; nenhum comportamento ou registro de sessão será salvo.'])
  }
  return draft({ type: 'behavior.update', target: { behaviorId: result.entity.id }, draft: patch },
    `Rascunho de alteração do comportamento ${result.entity.title}.`, ['Texto mantido literalmente, sem interpretação clínica.'])
}

const parseAgendaNavigation = (text, referenceDate) => {
  const command = /^(?:mostrar|mostre|mostra|abrir|abra|abre)\s+(?:a\s+)?agenda\s+(.+)$/u.exec(text)
  if (!command) return null
  // Match the entire qualifier: extra dates, actions or words require clarification.
  const relative = /^(de hoje|de amanha|desta semana|deste mes)$/u.exec(command[1])
  const explicit = /^(do dia|da semana de|do mes de)\s+(\d{2})\/(\d{2})\/(\d{4})$/u.exec(command[1])
  if (!relative && !explicit) {
    return refuse('Informe de hoje, de amanhã, do dia DD/MM/AAAA, desta semana, deste mês, da semana de DD/MM/AAAA ou do mês de DD/MM/AAAA.')
  }
  let view
  let date
  if (explicit) {
    view = { 'do dia': 'day', 'da semana de': 'week', 'do mes de': 'month' }[explicit[1]]
    date = `${explicit[4]}-${explicit[3]}-${explicit[2]}`
  } else {
    if (!isCivilDate(referenceDate)) return refuse('Informe uma data civil de referência válida (AAAA-MM-DD).')
    view = { 'de hoje': 'day', 'de amanha': 'day', 'desta semana': 'week', 'deste mes': 'month' }[relative[1]]
    date = referenceDate
    if (relative[1] === 'de amanha') {
      const tomorrow = new Date(`${date}T00:00:00Z`)
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
      date = tomorrow.toISOString().slice(0, 10)
    }
  }
  if (!isCivilDate(date)) return refuse('Informe uma data válida para visualizar a agenda.')
  const [year, month, day] = date.split('-')
  const label = { day: 'do dia', week: 'da semana de', month: 'do mês de' }[view]
  return draft({ type: 'agenda.view', target: { view, referenceDate: date } },
    `Mostrar agenda ${label} ${day}/${month}/${year}.`)
}

// Occurrence lookup has no duration: accept the full clock range and consume
// every time token rather than using the scheduling parser's spoken prefix.
const parseOccurrenceTime = phrase => {
  const match = /^(.*?)\s*(?:\s+(?:da|de|pela)\s+(manha|tarde|noite))?$/u.exec(phrase)
  const clock = /^(\d{1,2}):([0-5]\d)$/u.exec(match[1])
  const hourPhrase = /^(.*?)(?:\s+horas?)?(\s+e\s+meia)?$/u.exec(match[1])
  const hourText = hourPhrase[1]
  let hour = clock ? Number(clock[1]) : /^\d{1,2}$/u.test(hourText) ? Number(hourText) : spokenHours.get(hourText)
  const minute = clock ? Number(clock[2]) : hourPhrase[2] ? 30 : 0
  if (hour == null || hour > 23) return null
  const period = match[2]
  if (period) {
    if (hour < 1 || hour > 12 || (period === 'manha' && hour === 12)) return null
    if (period !== 'manha' && hour < 12) hour += 12
    if (period === 'noite' && hour === 12) hour = 0
  } else if (!clock && hour >= 1 && hour <= 12) {
    return null
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

const parseAddendumNavigation = (text, context) => {
  if (!/^(?:adicionar|adicione|adiciona|abrir|abra|abre)\s+(?:um\s+|o\s+)?adendo\b/u.test(text)) return null
  const match = /^(?:adicionar|adicione|adiciona|abrir|abra|abre)\s+(?:um\s+|o\s+)?adendo\s+(?:a|na|da)\s+sessao\s+de\s+(.+)\s+as\s+(.+)$/u.exec(text)
  if (!match) return refuse('Informe o paciente, a data completa e o horário da sessão finalizada para abrir o adendo.')
  // Test each explicit separator, not each patient name. The existing typed-date
  // converter requires a complete civil date/year; no inferred date or entity.
  const dates = [...match[1].matchAll(/\s+(?:de|em|no dia)\s+/gu)].map(separator => ({
    name: match[1].slice(0, separator.index),
    date: normalizeVoiceFieldValue('date', match[1].slice(separator.index + separator[0].length)),
  })).filter(item => item.date)
  if (dates.length !== 1) return refuse('Informe uma única data completa e válida, como 03/10/2026 ou três de outubro de dois mil e vinte e seis.')
  const { name, date } = dates[0]
  const patient = exactTarget(name, (context.patients || []).filter(item => item.archivedAt == null), 'paciente')
  if (patient.error) return refuse(patient.error)
  const start = parseOccurrenceTime(match[2])
  if (!isCivilDate(date)) return refuse('Informe uma data válida para a sessão finalizada.')
  if (!start) return refuse('Informe um horário explícito e sem ambiguidade, como 15:00 ou três da tarde.')
  return draft({ type: 'session.addendum.open', target: { patientId: patient.entity.id, date, start } },
    `Abrir adendo da sessão finalizada de ${patient.entity.name} em ${date.split('-').reverse().join('/')} às ${start}.`,
    ['Apenas abre o formulário da sessão finalizada exata; nenhum adendo ou compromisso será salvo.'])
}

const parseOccurrenceAction = (text, context, referenceDate) => {
  if (!/^(?:iniciar|remarcar|cancelar)\s+sessao\b/u.test(text)) return null
  const match = /^(iniciar|remarcar|cancelar)\s+sessao\s+de\s+(.+?)\s+(hoje|amanha|no dia \d{2}\/\d{2}\/\d{4})\s+as\s+(.+)$/u.exec(text)
  if (!match) return refuse('Informe uma sessão com nome exato do paciente, hoje, amanhã ou no dia DD/MM/AAAA e horário explícito.')
  const patient = exactTarget(match[2], (context.patients || []).filter(item => item.archivedAt == null), 'paciente')
  if (patient.error) return refuse(patient.error)
  let date
  if (match[3].startsWith('no dia ')) {
    const [day, month, year] = match[3].slice(7).split('/')
    date = `${year}-${month}-${day}`
  } else {
    if (!isCivilDate(referenceDate)) return refuse('Informe uma data civil de referência válida (AAAA-MM-DD).')
    date = referenceDate
    if (match[3] === 'amanha') {
      const tomorrow = new Date(`${date}T00:00:00Z`)
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
      date = tomorrow.toISOString().slice(0, 10)
    }
  }
  if (!isCivilDate(date)) return refuse('Informe uma data válida para a ocorrência.')
  const start = parseOccurrenceTime(match[4])
  if (!start) return refuse('Informe um horário explícito e sem ambiguidade, como 15:00 ou três da tarde.')
  const action = match[1] === 'iniciar' ? 'start' : match[1]
  const [year, month, day] = date.split('-')
  const detail = `${patient.entity.name} em ${day}/${month}/${year} às ${start}`
  return draft({ type: 'agenda.occurrence.action', target: { patientId: patient.entity.id, date, start, action } },
    action === 'start'
      ? `Abrir a sessão existente de ${detail}.`
      : `Abrir o formulário para ${action} a ocorrência de ${detail}, sem salvar alterações.`,
    [action === 'start' ? 'Após confirmar, o sistema cria ou retoma o rascunho da sessão existente.' : 'Apenas abre o formulário; informe o motivo e confirme na tela para salvar a alteração.'])
}

const parsePatientWorkspaceNavigation = (text, context) => {
  // Whisper may spell the spoken navigation noun as “seções”; accept it only
  // here, leaving the delimited patient name and literal fields untouched.
  const match = /^(?:abrir|abra|abre)\s+(?:(?:o|a|os|as)\s+)?(registros|sessoes|secoes|evolucao|vinculos|contexto(?: do caso)?)\s+(?:de|do|da)\s+(.+)$/u.exec(text)
  if (!match) return null
  const result = exactTarget(match[2], (context.patients || []).filter(patient => patient.archivedAt == null), 'paciente')
  if (result.error) return refuse(result.error)
  const space = match[1] === 'vinculos' ? 'links' : match[1] === 'evolucao' ? 'evolution' : match[1].startsWith('contexto') ? 'context' : 'sessions'
  return draft({ type: 'patient.workspace.open', target: { patientId: result.entity.id, space } },
    `Abrir ${space === 'links' ? 'vínculos' : space === 'context' ? 'contexto do caso' : 'registros'} de ${result.entity.name}.`)
}

// Month boundaries are civil dates, including leap years and the four-digit
// year limits. Advance from day 28 so no out-of-range next month is needed.
const analyticsMonthEnd = start => {
  let end = `${start.slice(0, 7)}-28`
  while (parseCivilDate(`${start.slice(0, 7)}-${Number(end.slice(-2)) + 1}`)) end = addCivilDays(end, 1)
  return end
}

const parseAnalyticsNavigation = (text, context, referenceDate) => {
  const command = /^(?:mostrar|mostre|mostra|abrir|abra|abre)\s+(?:(?:a|o|as|os)\s+)?(?:analise|analises|graficos)(?:\s+(.+))?$/u.exec(text)
  if (!command) return null
  let argument = command[1] || ''
  const period = /(?:^|\s+)(hoje|deste mes|neste mes|dos ultimos 12 meses|nos ultimos 12 meses|de (\d{2}\/\d{2}\/\d{4}) ate (\d{2}\/\d{2}\/\d{4}))$/u.exec(argument)
  if (period) argument = argument.slice(0, period.index).trim()
  let patientId = ''
  let label = 'todos os pacientes'
  if (argument && !/^(?:(?:de|para)\s+)?todos os pacientes$/u.test(argument)) {
    const name = /^(?:de|do|da)\s+(.+)$/u.exec(argument)
    if (!name) return refuse('Informe um paciente pelo nome exato e um período: hoje, neste mês, últimos 12 meses ou de DD/MM/AAAA até DD/MM/AAAA.')
    const result = exactTarget(name[1], (context.patients || []).filter(patient => patient.archivedAt == null), 'paciente')
    if (result.error) return refuse(result.error)
    patientId = result.entity.id
    label = result.entity.name
  }
  let from
  let to
  let view
  if (period?.[2]) {
    from = period[2].split('/').reverse().join('-')
    to = period[3].split('/').reverse().join('-')
    view = 'custom'
  } else {
    const reference = parseCivilDate(referenceDate)
    if (!reference) return refuse('Informe uma data civil de referência válida (AAAA-MM-DD).')
    if (period?.[1] === 'hoje') {
      from = to = referenceDate
      view = 'day'
    } else {
      from = `${referenceDate.slice(0, 7)}-01`
      to = analyticsMonthEnd(from)
      view = 'month'
      if (period?.[1].includes('12 meses')) {
        const monthIndex = reference.year * 12 + reference.month - 1 - 11
        from = `${String(Math.floor(monthIndex / 12)).padStart(4, '0')}-${String(monthIndex % 12 + 1).padStart(2, '0')}-01`
        view = 'year'
      }
    }
  }
  if (!parseCivilDate(from) || !parseCivilDate(to) || !inSupportedRange(from, to)) {
    return refuse('Informe um período válido, em ordem cronológica e de até cinco anos.')
  }
  return draft({ type: 'analytics.view', target: { patientId, from, to, view } },
    `Mostrar análises de ${label}: ${from.split('-').reverse().join('/')} a ${to.split('-').reverse().join('/')}.`)
}

const parseWorkspaceNavigation = text => {
  const match = /^(?:abrir|abra|abre)\s+(?:(?:a|o|as|os)\s+)?(.+)$/u.exec(text)
  if (!match) return null
  if (/^(?:biblioteca|biblioteca de comportamentos(?:,? (?:reutilizaveis|utilizaveis))?)$/u.test(match[1])) {
    return draft({ type: 'workspace.open', target: { space: 'sessions', section: 'library' } },
      'Abrir biblioteca de comportamentos reutilizáveis.', ['Apenas abre a biblioteca; nenhum comportamento ou registro será salvo.'])
  }
  const spaces = { home: 'home', inicio: 'home', 'pagina inicial': 'home', pacientes: 'patients', agenda: 'agenda', sessoes: 'sessions', analises: 'analytics', graficos: 'analytics', ajustes: 'settings', configuracoes: 'settings' }
  const space = Object.hasOwn(spaces, match[1]) ? spaces[match[1]] : null
  return space ? draft({ type: 'workspace.open', target: { space } }, `Abrir ${match[1]}.`) : refuse('Informe um único espaço: início, pacientes, agenda, sessões, análises ou configurações.')
}

const parseRecurringAppointment = ({ text, context, referenceDate }) => {
  if (!/^(?:agendar|agende|agenda|marcar|marque|marca|criar|crie|cria|adicionar|adicione|adiciona|incluir|inclui)\b/u.test(text) || !/\b(?:sessao|compromisso|serie)\b/u.test(text)) return null
  if (/\bonline\b/u.test(text) && /\bpresencial\b/u.test(text)) return refuse('Informe uma única modalidade: Online ou Presencial.')
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

const parseSingleAppointment = ({ text, context, referenceDate }) => {
  if (!/^(?:agendar|agende|agenda|marcar|marque|marca|criar|crie|cria|adicionar|adicione|adiciona)\s+(?:uma\s+)?sessao\b/u.test(text)) return null
  const match = /^(?:agendar|agende|agenda|marcar|marque|marca|criar|crie|cria|adicionar|adicione|adiciona)\s+(?:uma\s+)?sessao\s+(?:avulsa\s+)?para\s+(.+?)\s+(hoje|amanha|(?:no\s+)?dia\s+\d{2}\/\d{2}\/\d{4})\s+(.+)$/u.exec(text)
  if (!match && /\b(?:semanal|quinzenal|toda|todo|serie)\b/u.test(text)) return null
  if (!match) return refuse('Informe um paciente, hoje, amanhã ou dia DD/MM/AAAA e um horário explícito para a sessão avulsa.')
  const result = exactTarget(match[1], (context.patients || []).filter(patient => patient.archivedAt == null), 'paciente')
  if (result.error) return refuse(result.error)
  let startDate
  if (match[2].includes('/')) {
    const [, day, month, year] = /(\d{2})\/(\d{2})\/(\d{4})/u.exec(match[2])
    startDate = `${year}-${month}-${day}`
  } else {
    if (!isCivilDate(referenceDate)) return refuse('Informe a data de referência válida para hoje ou amanhã.')
    startDate = referenceDate
    if (match[2] === 'amanha') {
      const [year, month, day] = referenceDate.split('-').map(Number)
      startDate = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10)
    }
  }
  if (!isCivilDate(startDate)) return refuse('Informe uma data válida para a sessão avulsa.')
  const timeText = match[3].replace(/\s+(?:(?:com|na|em)\s+modalidade\s+)?(?:online|presencial)$/u, '')
  // Validate the complete time clause, rather than silently ignoring another command.
  if (!/^(?:as|pelas?)\s+/u.test(timeText)) return refuse('Informe um horário explícito para a sessão avulsa.')
  const timePhrase = timeText.replace(/^(?:as|pelas?)\s+/u, '')
  const validSpoken = [...spokenHours.keys()].some(hour => new RegExp(`^${escapeRegExp(hour)}(?:\\s+horas?)?(?:\\s+e\\s+meia)?(?:\\s+(?:da|de|pela)\\s+(?:manha|tarde|noite))?$`, 'u').test(timePhrase))
  const validNumeric = /^\d{1,2}(?::[0-5]\d)?\s*(?:h(?:oras?)?)?(?:\s+e\s+meia)?(?:\s+(?:da|de|pela)\s+(?:manha|tarde|noite))?$/u.test(timePhrase)
  if (!validSpoken && !validNumeric) return refuse('Informe apenas um horário e uma modalidade para a sessão avulsa.')
  const time = parseTime(timeText)
  if (!time) return refuse('Informe um horário explícito válido (por exemplo, 15:00 ou três da tarde).')
  if (time.ambiguous) return refuse('O horário pode significar manhã ou noite. Diga, por exemplo, “9 da manhã” ou “21 horas”.')
  if (/\bonline\b/u.test(match[3]) && /\bpresencial\b/u.test(match[3])) return refuse('Informe uma única modalidade: Online ou Presencial.')
  const appointmentDraft = {
    appointmentType: 'Avulsa', patientId: result.entity.id, patientName: result.entity.name,
    startDate, start: time.start, end: time.end,
    modality: /\bonline\b/u.test(match[3]) ? 'Online' : 'Presencial', meetingLink: '',
  }
  return draft({ type: 'appointment.single.create', draft: appointmentDraft },
    `Rascunho de sessão avulsa para ${result.entity.name}: ${startDate}, ${time.start}–${time.end}, ${appointmentDraft.modality}.`,
    [/\b(?:online|presencial)\b/u.test(match[3]) ? 'Modalidade identificada explicitamente no comando.' : 'A modalidade presencial foi preenchida pelo padrão atual do formulário.'])
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

  const behaviorCommand = /^(?:selecionar|marcar|adicionar|registrar)\s+(?:o\s+)?comportamento\s+(.+?)\s+(?:para|na sessao de|na sessao do|na sessao da)\s+(.+?)\s+na sessao$/u.exec(text)
    || /^(?:selecionar|marcar|adicionar)\s+(?:o\s+)?comportamento\s+(.+?)\s+na sessao de\s+(.+?)\s*$/u.exec(text)
  if (behaviorCommand) {
    const behaviorResult = exactTarget(behaviorCommand[1], (context.behaviors || []).filter(item => item.archivedAt == null), 'modelo de comportamento', item => item.title)
    if (behaviorResult.error) return refuse(behaviorResult.error)
    const patientInCommand = exactTarget(behaviorCommand[2], [target.patient], 'paciente')
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
    const exactText = fieldCommand[3].trim().replace(/^[\u0027\u201c\u0022]|[\u0027\u201d\u0022]$/g, '')
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
  // Descriptions and session field text are literal payloads, not commands.
  const commandRegion = normalized.split(/\s+com\s+descricao\s+/u)[0]
    .replace(/^(?:preencher|anotar|registrar)\s+(?:observacao|evolucao|procedimentos?|resultado|decisao|encaminhamento|fechamento)\s+(?:da|do)\s+sessao\s+de\s+(.+?)\s+com\s+.+$/u, '$1')
  if (/^(?:(?:por favor|por gentileza)\s*[,،]?\s*)?(?:nao|nunca|jamais)\b/u.test(normalized)
    || /\b(?:nao|nunca|jamais)\s+(?:iniciar|remarcar|cancelar|cadastre|cadastra|cadastrar|crie|cria|criar|adicione|adiciona|adicionar|editar|edite|edita|mudar|mude|muda|renomear|renomeie|arquivar|arquive|arquiva|restaurar|restaure|restaura|agendar|agende|agenda|marcar|marque|marca|abrir|abra|abre|mostrar|mostre|mostra|registrar|preencher|selecionar|definir)\b/u.test(commandRegion)) {
    return refuse('O pedido contém uma negação. Informe um único comando afirmativo.')
  }
  if (/(?:\s+e\s+|;\s*|\s+depois\s+)(?:iniciar|remarcar|cancelar|cadastrar|cadastre|cadastra|criar|crie|cria|adicionar|adicione|adiciona|editar|edite|mudar|mude|renomear|arquivar|arquive|restaurar|restaure|agendar|agende|marcar|marque|abrir|abra|abre|mostrar|mostre|mostra|finalizar|excluir)\b/u.test(commandRegion)
    || /(?:\s+ou\s+|,\s*|\s+em seguida\s+)(?:iniciar|remarcar|cancelar)\s+sessao\b/u.test(commandRegion)
    || /(?:\s+ou\s+|,\s*|\s+em seguida\s+)(?:abrir|abra|abre|mostrar|mostre|mostra)\s+(?:(?:a|o|as|os)\s+)?(?:analises|graficos|registros|sessoes|evolucao|vinculos)\b/u.test(commandRegion)) {
    return refuse('Informe apenas uma ação por comando.')
  }
  const addendum = parseAddendumNavigation(normalized, context)
  if (addendum) return addendum
  const occurrence = parseOccurrenceAction(normalized, context, referenceDate)
  if (occurrence?.status === 'draft') return occurrence
  if (/^(?:apague|apagar|exclua|excluir|delete|deletar|remova|remover|finalize|finalizar|cancele|cancelar)\b/u.test(normalized)) {
    return refuse('Este comando não é suportado pelo parser. Use a ação explícita na tela correspondente.')
  }
  if (occurrence) return occurrence
  // Repair only the command prefix Whisper misheard; preserve the name exactly as spoken.
  const patientInput = rawText.replace(/^cada estrar(?=\s+paciente\b)/iu, 'cadastrar')
  const patient = parsePatientCreation(patientInput)
  if (patient) return patient
  const patientManagement = parsePatientManagement(rawText, context)
  if (patientManagement) return patientManagement
  const behavior = parseBehaviorManagement(rawText, context)
  if (behavior) return behavior
  const agendaNavigation = parseAgendaNavigation(normalized, referenceDate)
  if (agendaNavigation) return agendaNavigation
  const patientNavigation = parsePatientWorkspaceNavigation(normalized, context)
  if (patientNavigation) return patientNavigation
  // Bare “abrir análises/gráficos” retains the existing workspace contract.
  if (!/^(?:abrir|abra|abre)\s+(?:(?:as|os)\s+)?(?:analises|graficos)$/u.test(normalized)) {
    const analyticsNavigation = parseAnalyticsNavigation(normalized, context, referenceDate)
    if (analyticsNavigation) return analyticsNavigation
  }
  const navigation = parseWorkspaceNavigation(normalized)
  if (navigation) return navigation
  const session = parseSessionDraft({ text: normalized, rawText, context })
  if (session) return session
  const singleAppointment = parseSingleAppointment({ text: normalized, context, referenceDate })
  if (singleAppointment) return singleAppointment
  const appointment = parseRecurringAppointment({ text: normalized, context, referenceDate })
  if (appointment) return appointment
  return refuse('Ainda não reconheço esse comando. Posso preparar um rascunho de paciente, uma série recorrente ou campos explícitos de uma sessão aberta.')
}

export function formatCentralCommandPreview(result) {
  if (!result || result.status !== 'draft') return result?.message || 'Nenhum rascunho preparado.'
  return result.preview
}
