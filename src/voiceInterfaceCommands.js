import { normalizeVoiceFieldValue } from './voiceFieldValue.js'

// The voice shortcut uses the same visible controls and validation as a click.
// No hidden control, arbitrary selector or backend command can be requested.
const optionNumbers = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 }
const fold = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/·/g, ' ')
  .replace(/\bopcao\s+(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\b/g, (_, word) => `opcao ${optionNumbers[word]}`)
  .replace(/\s+/g, ' ').replace(/[.!?]+$/g, '').trim()
const clean = value => String(value ?? '').trim().replace(/[.!?]+$/g, '').replace(/^["“]|["”]$/g, '').trim()
const refusal = message => ({ status: 'clarification', message })
let voiceLifecycleCounter = 0
export function nextVoiceLifecycle() {
  if (voiceLifecycleCounter >= Number.MAX_SAFE_INTEGER) throw new Error('Ciclo de interface esgotado. Reabra o aplicativo.')
  return String(++voiceLifecycleCounter)
}
const clinicalLineBreak = /[\r\n\u2028\u2029]/u
function multilineTextareaField(element) {
  if (element.tagName !== 'TEXTAREA') return false
  const form = element.closest('form#session-draft') || element.closest('form')
  const record = form?.getAttribute('data-voice-record')
  if (['session-observation', 'session-procedures', 'session-outcome-decision', 'session-referral-closure'].includes(element.id)
    || /^indicator-note-.+$/u.test(element.id)) return form?.id === 'session-draft' && Boolean(record)
  if (element.id === 'behavior-description') return form?.getAttribute('aria-label') === 'Comportamento reutilizável' && /^behavior:.+$/u.test(record || '')
  if (['case-demand', 'case-objectives'].includes(element.id)) return form?.getAttribute('aria-label') === 'Nova revisão do contexto do caso'
    && /^context:.+$/u.test(record || '') && Boolean(form.getAttribute('data-voice-epoch'))
  if (element.id === 'agenda-reason') return form?.getAttribute('aria-label') === 'Alterar ocorrência individual' && /^.+:\d{4}-\d{2}-\d{2}$/u.test(record || '')
  if (/^addendum-.+$/u.test(element.id)) return Boolean(form) && element.closest('li[data-voice-record]')?.getAttribute('data-voice-record') === `session:${element.id.slice('addendum-'.length)}`
  return false
}

function lifecycleChain(element) {
  const chain = []
  for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
    const epoch = ancestor.getAttribute('data-voice-lifecycle')
    if (epoch !== null) chain.push(epoch)
  }
  return chain.length ? JSON.stringify(chain) : null
}

function visible(element) {
  if (!element.isConnected || element.closest('[hidden], [inert], [aria-hidden="true"]')) return false
  for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
    const style = ancestor.ownerDocument.defaultView.getComputedStyle(ancestor)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    if (ancestor.tagName === 'DETAILS' && !ancestor.open && !ancestor.querySelector(':scope > summary')?.contains(element)) return false
  }
  return true
}

function textContent(element) {
  const clone = element.cloneNode(true)
  clone.querySelectorAll('[aria-hidden="true"], [hidden], small, svg, input, textarea, select').forEach(item => item.remove())
  return clean(clone.textContent)
}

function nameOf(element) {
  const labelledBy = element.getAttribute('aria-labelledby')?.split(/\s+/).map(id => element.ownerDocument.getElementById(id)?.textContent || '').join(' ')
  return clean(element.getAttribute('data-voice-label') || element.getAttribute('aria-label') || labelledBy || (element.labels?.length ? [...element.labels].map(textContent).join(' ') : textContent(element)))
}

function contextOf(element) {
  const card = element.closest('li, form, article, [role="dialog"], [role="alertdialog"]')
  const heading = card?.querySelector('strong, h3, h4')
  return clean(card?.getAttribute('aria-label') || (heading ? textContent(heading) : ''))
}

function inventory(root) {
  const dialog = root.querySelector('[role="alertdialog"]')
  const scope = dialog && visible(dialog) ? dialog : root
  const seenActions = new Set()
  return [...scope.querySelectorAll('button, summary, input, textarea, select, a[href^="#"]')]
    .filter(element => visible(element) && (!element.closest('.voice-command-center') || element.matches('summary[data-voice-help]')) && !element.matches(':disabled') && element.type !== 'hidden')
    .map(element => ({ element, name: nameOf(element), context: contextOf(element) }))
    .filter(item => item.name)
    .filter(item => {
      // Separate series cards must compete even when an action/label is copied.
      if (item.element.hasAttribute('data-voice-series-kind')) return true
      // Only explicitly identical, record-scoped button actions are equivalent.
      // Matching text alone must never merge different patient/session targets.
      const action = item.element.matches('button') && item.element.getAttribute('data-voice-action')
      if (!action) return true
      const key = item.element.hasAttribute('data-voice-appointment-details')
        ? appointmentEquivalence(item)
        : item.element.hasAttribute('data-voice-draft-resume')
          ? JSON.stringify([action, fold(item.name), item.element.getAttribute('data-voice-record'), item.element.getAttribute('data-voice-epoch'), resumeMetadata(item.element)])
        : `${action}:${fold(item.name)}`
      if (seenActions.has(key)) return false
      seenActions.add(key)
      return true
    })
}

const isSeriesQuery = query => /^(?:encerrar serie|antecipar termino|anticipar termino) de /u.test(fold(query))
const seriesOptionRequested = query => isSeriesQuery(query) && /\bopcao\b/u.test(fold(query))
  && !/\s*·\s*s[eé]rie\s+\S+$/iu.test(query)
const seriesMetadata = element => element.hasAttribute('data-voice-series-kind')
  ? JSON.stringify(['kind', 'patient', 'weekday', 'time', 'ambiguous', 'option', 'patient-id', 'id'].map(key => element.getAttribute(`data-voice-series-${key}`))) : null
const canonicalOption = value => /^[1-9]\d*$/u.test(value ?? '') && Number.isSafeInteger(Number(value))

function seriesLabelMatches(query, item) {
  const element = item.element
  const kind = element.getAttribute('data-voice-series-kind')
  if (!element.matches('button') || !['end', 'advance'].includes(kind)) return false
  const normalized = fold(query)
  const action = /^(encerrar serie|antecipar termino|anticipar termino) de /u.exec(normalized)
  if (!action || (action[1] === 'encerrar serie' ? 'end' : 'advance') !== kind) return false
  const patient = fold(element.getAttribute('data-voice-series-patient'))
  const prefix = action[0] + patient
  if (!patient || !normalized.startsWith(prefix)) return false
  // Match the full catalog name before reading suffixes: delimiters may belong
  // to the name, and another patient's longer name must not be truncated.
  const match = /^(?: na (.+?) as (.+?))?(?: opcao ([1-9]\d*))?$/u.exec(normalized.slice(prefix.length))
  if (!match) return false
  if (match[3]) {
    const patientId = element.getAttribute('data-voice-series-patient-id')
    const seriesId = element.getAttribute('data-voice-series-id')
    if (!canonicalOption(match[3]) || match[3] !== element.getAttribute('data-voice-series-option')
      || !patientId || !seriesId || element.getAttribute('data-voice-action') !== `agenda:end-series:${patientId}:${seriesId}`
      || element.getAttribute('data-voice-record') !== `series:${patientId}:${seriesId}`) return false
  } else if (element.getAttribute('data-voice-series-ambiguous') === 'true') return false
  if (!match[1]) return true
  const weekday = normalizeVoiceFieldValue('weekday', match[1])
  const time = normalizeVoiceFieldValue('time', match[2])
  return weekday !== null && time !== null && weekday === element.getAttribute('data-voice-series-weekday') && time === element.getAttribute('data-voice-series-time')
}

function uniqueSeriesOption(query, item, candidates) {
  if (!seriesLabelMatches(query, item)) return false
  const option = / opcao ([1-9]\d*)$/u.exec(fold(query))?.[1]
  return Boolean(option && item.element.getAttribute('data-voice-series-option') === option
    && candidates.filter(candidate => candidate.element.hasAttribute('data-voice-series-kind')
    && candidate.element.getAttribute('data-voice-series-option') === option).length === 1)
}

const appointmentQuery = query => /^(?:(?:abrir|ver) detalhes|detalhes|verdetales) de /u.test(fold(query))
// Keep punctuation inside appointment names literal, including a final initial
// before a date suffix. Sentence punctuation is handled only at command end.
const foldAppointmentName = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/·/g, ' ').replace(/\s+/g, ' ').trim()
const appointmentMetadata = element => element.hasAttribute('data-voice-appointment-details')
  ? JSON.stringify(['patient', 'date', 'start', 'end', 'original-date', 'ambiguous', 'option', 'patient-id', 'id'].map(key => element.getAttribute(`data-voice-appointment-${key}`))) : null
const appointmentEquivalence = item => JSON.stringify([item.element.getAttribute('data-voice-action'),
  foldAppointmentName(item.name), item.element.getAttribute('data-voice-record'), item.element.getAttribute('data-voice-epoch'),
  appointmentMetadata(item.element), lifecycleChain(item.element)])
const appointmentPayload = query => foldAppointmentName(query).replace(/[.!?]+$/g, '')
  .replace(/^(?:(?:abrir|ver) detalhes|detalhes|verdetales) de /u, '')

function appointmentSuffix(query, element) {
  if (!appointmentQuery(query)) return null
  const payload = appointmentPayload(query)
  const patient = foldAppointmentName(element.getAttribute('data-voice-appointment-patient'))
  if (!patient) return null
  // A complete catalog name wins before any suffix parsing. In particular,
  // "opção dois" inside (or at the end of) a name is never rewritten.
  if (payload === patient.replace(/[.!?]+$/g, '')) return { option: null, date: null, time: null }
  if (!payload.startsWith(patient)) return null
  const suffix = /^(?: (?:em|no dia) (.+?) as (.+?))?(?: opcao ([1-9]\d*|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez))?$/u.exec(payload.slice(patient.length))
  if (!suffix) return null
  const option = suffix[3] ? String(optionNumbers[suffix[3]] ?? suffix[3]) : null
  if (option !== null && !canonicalOption(option)) return null
  const date = suffix[1] ? normalizeVoiceFieldValue('date', suffix[1]) : null
  const time = suffix[2] ? normalizeVoiceFieldValue('time', suffix[2]) : null
  if (suffix[1] && (date === null || time === null)) return null
  return { option, date, time }
}

function appointmentOptionContract(element, option) {
  const id = element.getAttribute('data-voice-appointment-id')
  const patientId = element.getAttribute('data-voice-appointment-patient-id')
  if (!id || !patientId || option !== element.getAttribute('data-voice-appointment-option')
    || element.getAttribute('data-voice-action') !== `agenda:details:${id}`
    || !element.getAttribute('data-voice-epoch') || lifecycleChain(element) === null) return false
  try {
    const record = JSON.parse(element.getAttribute('data-voice-record'))
    return Array.isArray(record) && record.length === 5 && record[0] === 'occurrence'
      && record[1] === id && record[2] === patientId
      && (record[3] === null || typeof record[3] === 'string')
      && record[4] === element.getAttribute('data-voice-appointment-original-date')
  } catch { return false }
}

function appointmentLabelMatches(query, item) {
  const element = item.element
  if (!element.matches('button[data-voice-appointment-details]')) return false
  const suffix = appointmentSuffix(query, element)
  if (!suffix) return false
  if (suffix.option !== null) {
    if (!appointmentOptionContract(element, suffix.option)) return false
  } else if (element.getAttribute('data-voice-appointment-ambiguous') === 'true') return false
  return suffix.date === null || (suffix.date === element.getAttribute('data-voice-appointment-date')
    && suffix.time === element.getAttribute('data-voice-appointment-start'))
}

function appointmentSelectionUnique(query, item, candidates) {
  const element = item.element
  const equivalent = appointmentEquivalence(item)
  const id = element.getAttribute('data-voice-appointment-id')
  const action = element.getAttribute('data-voice-action')
  const recordId = control => {
    try {
      const record = JSON.parse(control.getAttribute('data-voice-record'))
      return Array.isArray(record) && record.length === 5 && record[0] === 'occurrence' ? record[1] : null
    } catch { return null }
  }
  const occurrenceId = recordId(element)
  // Conflicting representations cannot become selectable just because an
  // option or date suffix filters out the contradictory twin.
  const contradictory = candidates.some(candidate => candidate.element.hasAttribute('data-voice-appointment-details')
    && ((id && candidate.element.getAttribute('data-voice-appointment-id') === id)
      || (action && candidate.element.getAttribute('data-voice-action') === action)
      || (occurrenceId && recordId(candidate.element) === occurrenceId))
    && appointmentEquivalence(candidate) !== equivalent)
  if (contradictory) return false
  const suffix = appointmentSuffix(query, element)
  if (!suffix || suffix.option === null) return true
  return candidates.filter(candidate => candidate.element.hasAttribute('data-voice-appointment-details')
    && candidate.element.getAttribute('data-voice-appointment-option') === suffix.option).length === 1
}

const resumeQuery = query => /^(?:retomar rascunho|continuar sessao (?:em|opcao)|continuar secao opcao)(?: |$)/u.test(fold(query))
const resumeMetadata = element => element.hasAttribute('data-voice-draft-resume')
  ? JSON.stringify(['patient', 'draft', 'date', 'option', 'needs-option'].map(key => element.getAttribute(`data-voice-resume-${key}`))) : null

function resumeLabelMatches(query, item) {
  const element = item.element
  if (!element.matches('button[data-voice-draft-resume]') || !element.getAttribute('data-voice-resume-patient') || !element.getAttribute('data-voice-resume-draft')) return false
  const option = element.getAttribute('data-voice-resume-option')
  const originalDate = element.getAttribute('data-voice-resume-date')
  if (!/^[1-9]\d*$/u.test(option || '') || !originalDate || normalizeVoiceFieldValue('date', originalDate) !== originalDate || !['true', 'false'].includes(element.getAttribute('data-voice-resume-needs-option'))) return false
  if (fold(item.name) !== `retomar rascunho ${originalDate} opcao ${option}`) return false
  // Exact observed prefix variant, scoped to marked resume buttons only.
  // Do not rewrite names, notes, dates or any other control's command.
  const optionOnly = /^continuar (?:sessao|secao) opcao ([1-9]\d*)$/u.exec(fold(query))
  if (optionOnly) return optionOnly[1] === option
  const match = /^(?:retomar rascunho|continuar sessao em) (.+?)(?: opcao ([1-9]\d*))?$/u.exec(fold(query))
  if (!match) return false
  const date = normalizeVoiceFieldValue('date', match[1])
  // An option is accepted only when actually displayed by this draft button.
  // Repeated dates require it even if another same-date button is disabled.
  return date !== null && date === element.getAttribute('data-voice-resume-date') && (match[2] ? match[2] === option : element.getAttribute('data-voice-resume-needs-option') === 'false')
}

function matches(query, entries) {
  const detailsQuery = appointmentQuery(query)
  // Appointment names are literal. Only the final option suffix can normalize
  // a spoken numeral for alias competition; never rewrite words inside names.
  const matchFold = detailsQuery ? value => foldAppointmentName(value).replace(/[.!?]+$/g, '')
    .replace(/ opcao (um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)$/u, (_, word) => `opcao ${optionNumbers[word]}`) : fold
  const normalized = matchFold(query)
  // One short save request covers both modes of the existing library form.
  // It still competes with every visible match and retains the actual button
  // fingerprint, so a proposal cannot cross from creation to another editor.
  const behaviorSave = normalized === 'salvar comportamento'
  // Exact Portuguese recognition variant, only for this visible party role.
  // Never rewrite a name, relation, text field or another checkbox label.
  const administrativeRoleAlias = normalized === 'contrato administrativo'
  const seriesQuery = isSeriesQuery(query)
  const draftResumeQuery = resumeQuery(query)
  // Explicit legacy aliases compete with all matching controls, never picking
  // the first retry when two operations share an old short command.
  const exact = entries.filter(item => matchFold(item.name) === normalized || (administrativeRoleAlias && item.element.type === 'checkbox' && fold(item.name) === 'contato administrativo' && item.element.closest('form[data-voice-record^="party:"]')) || (behaviorSave && item.element.matches('button') && ['criar comportamento reutilizavel', 'salvar versao do comportamento'].includes(fold(item.name))) || matchFold(item.element.getAttribute('data-voice-alias') || '') === normalized || matchFold(`${item.name} de ${item.context}`) === normalized || matchFold(`${item.name} em ${item.context}`) === normalized)
  if (!seriesQuery && !detailsQuery && !draftResumeQuery && exact.length) return exact
  const aliases = entries.filter(item => matchFold(item.name.replace(/\s*·\s*v\d+\s*$/i, '').replace(/\s*\(opcional\)/i, '').replace(/\s*\(at[eé]\s+\d+\s+caracteres\)/iu, '').replace(/\s+em anos\b/i, '')) === normalized)
  if (!seriesQuery && !detailsQuery && !draftResumeQuery) return aliases.length ? aliases : entries.filter(item => item.context && [fold(`${item.name} de ${item.context}`), fold(`${item.name} em ${item.context}`)].some(label => label.startsWith(normalized) && normalized.startsWith(fold(item.name) + ' ')))
  const series = entries.filter(item => seriesLabelMatches(query, item))
  const literalPatients = detailsQuery ? entries.filter(item => item.element.hasAttribute('data-voice-appointment-details'))
    .map(item => foldAppointmentName(item.element.getAttribute('data-voice-appointment-patient')))
    .filter(patient => patient && patient.replace(/[.!?]+$/g, '') === appointmentPayload(query)) : []
  const appointments = entries.filter(item => (!literalPatients.length
    || literalPatients.includes(foldAppointmentName(item.element.getAttribute('data-voice-appointment-patient')))) && appointmentLabelMatches(query, item))
  const resumableDrafts = entries.filter(item => resumeLabelMatches(query, item))
  return [...new Set([...exact, ...aliases, ...series, ...appointments, ...resumableDrafts])]
}

function fingerprint(item, drawer = false) {
  return { lifecycle: lifecycleChain(item.element), id: item.element.id || null, tag: item.element.tagName, inputType: item.element.type || null, valueType: item.element.getAttribute('data-voice-value-type') || null, name: drawer ? textContent(item.element) : item.name, context: item.context, action: item.element.getAttribute('data-voice-action') || null, record: item.element.closest('[data-voice-record]')?.getAttribute('data-voice-record') || null, epoch: item.element.closest('[data-voice-epoch]')?.getAttribute('data-voice-epoch') || null, series: seriesMetadata(item.element) }
}

function isDrawer(element) {
  return element.matches('summary') && element.parentElement?.matches('details') ||
    element.matches('button[aria-controls]') && ['true', 'false'].includes(element.getAttribute('aria-expanded'))
}

export function parseVoiceInterfaceCommand(text, root = globalThis.document) {
  // Exact variant observed in the synthetic Portuguese Whisper test. No names
  // or field contents are repaired; this still produces a reviewable proposal.
  const sourceText = String(text ?? '')
  const multiline = clinicalLineBreak.test(sourceText)
  const raw = (multiline ? sourceText.replace(/^[^\S\r\n\u2028\u2029]+/u, '') : clean(text)).replace(/^ficarem novo cadastro$/iu, 'Clicar em Novo cadastro')
    // Exact command-prefix variants captured from local Portuguese recognition.
    // Never repair the value, patient's name, indicator title or note content.
    .replace(/^princher(?=\s)/iu, 'Preencher')
    .replace(/^prinscheridade(?=\s+(?:com|como|para)\s)/iu, 'Preencher Idade')
  const normalized = fold(raw)
  if (!root || !normalized) return null
  if (/^(?:nao|nunca)\b/.test(normalized)) return refusal('Pedido negado. Nenhuma ação preparada.')
  let operation, query, value, optionLabel
  let directSeries = false
  const fieldPayload = (multiline
    ? /^(?:preencher|preencha|preenche|definir|defina|selecionar|selecione|seleciona)[^\S\r\n\u2028\u2029]+([\s\S]+)$/iu
    : /^(?:preencher|preencha|preenche|definir|defina|selecionar|selecione|seleciona)\s+(.+)$/iu).exec(raw)?.[1]
  // An article can be part of the actual label ("O próprio paciente...").
  // Resolve both forms against visible controls instead of stripping it blindly.
  const payloads = fieldPayload ? [...new Set([fieldPayload, fieldPayload.replace(/^(?:o campo |a op[cç][aã]o |o |a )/iu, '')])] : []
  const fields = payloads.flatMap(payload => [...payload.matchAll(multiline
    ? /[^\S\r\n\u2028\u2029]+(?:com|como|para)[^\S\r\n\u2028\u2029]+/giu
    : /\s+(?:com|como|para)\s+/giu)].map(delimiter => ({ query: payload.slice(0, delimiter.index),
    value: multiline ? payload.slice(delimiter.index + delimiter[0].length) : clean(payload.slice(delimiter.index + delimiter[0].length)),
  }))).filter(item => item.query && item.value && !clinicalLineBreak.test(item.query))
  if (multiline && !fields.length) return refusal('Use uma única linha para o comando e o nome do campo. Quebras de linha são permitidas apenas no texto dos quatro campos clínicos.')
  const clearField = /^(?:limpar|limpe|esvaziar|esvazie)\s+(?:o campo |o |a )?(.+)$/iu.exec(raw)
  const check = /^(marcar|marque|desmarcar|desmarque)\s+(?:a op[cç][aã]o |o |a )?(.+)$/iu.exec(raw)
  const click = /^(?:clicar|clique|clica|acionar|acione|apertar|aperte)\s+(?:no bot[aã]o |na opc[aã]o |no |na |em )?(.+)$/iu.exec(raw)
  const drawer = /^(abrir|abra|fechar|feche|recolher|recolha)\s+(?:a gaveta |gaveta )?(.+)$/iu.exec(raw)
  if (fields.length) { operation = 'fill'; query = fields[0].query; value = fields[0].value }
  else if (clearField) { operation = 'fill'; query = clearField[1]; value = '' }
  else if (check) { operation = /^des/i.test(check[1]) ? 'uncheck' : 'check'; query = check[2] }
  else if (click) { operation = 'click'; query = click[1] }
  else if (appointmentQuery(raw)) { operation = 'click'; query = raw }
  else if (resumeQuery(raw)) { operation = 'click'; query = raw }
  else if (drawer) { operation = /^abr/iu.test(drawer[1]) ? 'open' : 'close'; query = drawer[2] }
  else if (/^(?:salvar|salve)(?: o)? comportamento$/.test(normalized)) { operation = 'click'; query = 'Salvar comportamento' }
  else if (/^(?:encerrar s[eé]rie|antecipar t[eé]rmino|anticipar t[eé]rmino) de .+$/iu.test(raw)) { operation = 'click'; query = raw; directSeries = true }
  else if (/^(?:confirmar|confirma|confirmar acao|confirmar ação)$/.test(normalized)) { operation = 'click'; query = 'Confirmar ação' }
  else if (/^(?:salvar paciente|salvar alteracoes|salvar rascunho|finalizar sessao|cancelar rascunho|novo cadastro|novo compromisso|criar comportamento reutilizavel|criar compromisso|criar serie|atualizar lista|bloquear|voltar|confirmar cancelamento|confirmar remarcacao individual|confirmar encerramento)$/.test(normalized)) { operation = 'click'; query = raw }
  else return null
  const candidates = inventory(root).filter(item => operation === 'fill'
    ? ['INPUT', 'TEXTAREA', 'SELECT'].includes(item.element.tagName) && !['checkbox', 'radio', 'password', 'file'].includes(item.element.type) && !item.element.readOnly
    : ['open', 'close'].includes(operation) ? isDrawer(item.element)
    : ['check', 'uncheck'].includes(operation) ? item.element.type === 'checkbox' || item.element.type === 'radio'
      : item.element.matches('button, summary, a[href^="#"], input[type="radio"], input[type="checkbox"]'))
  let found = matches(query, candidates)
  if (['open', 'close'].includes(operation)) {
    // Toggle buttons may describe the current action instead of the drawer name.
    // Only their exact visible caption is an additional label; no fuzzy target.
    found = candidates.filter(item => fold(item.name) === fold(query) || fold(textContent(item.element)) === fold(query))
  }
  if (fields.length) {
    const viable = fields.map(item => ({ ...item, found: matches(item.query, candidates) })).filter(item => item.found.length)
    if (viable.length > 1) return refusal('O pedido pode preencher campos diferentes. Diga um campo e um valor por comando.')
    if (viable.length === 1) { query = viable[0].query; value = viable[0].value; found = viable[0].found }
  }
  if (found.length !== 1) {
    if (found.length > 1) return refusal(`Há mais de uma opção “${query}”. Diga o nome completo ou acrescente o paciente: “clicar em ${found[0].name} de ${found[0].context || 'nome do paciente'}”.`)
    if (resumeQuery(query)) {
      // Diagnose the missing visible option without admitting any selection.
      const repeated = candidates.filter(item => item.element.getAttribute('data-voice-resume-needs-option') === 'true' && resumeLabelMatches(`${query} opção ${item.element.getAttribute('data-voice-resume-option')}`, item))
      if (repeated.length) return refusal('Há mais de um rascunho nessa data. Diga a opção visível: “Continuar sessão opção dois”, por exemplo, usando o número do rascunho desejado.')
    }
    return refusal(`Não encontrei “${query}” disponível nesta tela. Abra a área correspondente e diga o texto do botão ou campo.`)
  }
  const item = found[0]
  const numberedSeriesQuery = operation === 'click' && seriesOptionRequested(query)
  if (numberedSeriesQuery && !uniqueSeriesOption(query, item, candidates)) return refusal('Diga o nome completo e uma opção de série única exibida nesta tela. Confira também o dia e o horário, quando informados.')
  if (resumeQuery(query) && !resumeLabelMatches(query, item)) return refusal(`Não encontrei “${query}” em um controle de retomada disponível. Diga a data completa e a opção exibida quando houver datas repetidas.`)
  if (appointmentQuery(query) && !appointmentLabelMatches(query, item)) return refusal(`Não encontrei “${query}” em um controle de detalhes disponível.`)
  if (appointmentMetadata(item.element) !== null && !appointmentSelectionUnique(query, item, candidates)) return refusal('Há representações ou opções de compromisso conflitantes. Atualize a Agenda e prepare o pedido novamente.')
  if (directSeries && !item.element.hasAttribute('data-voice-series-kind')) return refusal(`Não encontrei “${query}” em um controle de série disponível.`)
  if (/^anticipar termino de /u.test(fold(query)) && !seriesLabelMatches(query, item)) return refusal(`Não encontrei “${query}” em um controle de série disponível.`)
  if (operation === 'uncheck' && item.element.type === 'radio') return refusal('Escolha outra opção deste grupo para alterar a seleção.')
  if (operation === 'fill') {
    if (multiline && !multilineTextareaField(item.element)) return refusal('Quebras de linha são permitidas apenas nos campos de texto disponíveis do rascunho, contexto, biblioteca, adendo ou motivo administrativo.')
    if (item.element.tagName === 'SELECT') {
      if (clearField) return refusal('Para mudar uma seleção, diga “selecionar” e o nome da opção.')
      const weekday = item.element.getAttribute('data-voice-value-type') === 'weekday'
      const selectedValue = weekday ? normalizeVoiceFieldValue('weekday', value) : value
      const options = selectedValue === null ? [] : [...item.element.options].filter(option => !option.disabled && (fold(option.textContent) === fold(selectedValue) || fold(option.value) === fold(selectedValue)))
      if (options.length !== 1) return refusal(`Para “${item.name}”, escolha: ${[...item.element.options].filter(option => !option.disabled).map(option => option.textContent).join(', ')}.`)
      value = options[0].value
      optionLabel = options[0].textContent
    } else if (item.element.getAttribute('data-voice-value-type') === 'age') {
      value = normalizeVoiceFieldValue('age', value)
      if (value === null) return refusal(`Valor inválido para “${item.name}”. Diga uma idade inteira entre zero e cento e vinte.`)
    } else if (['date', 'time'].includes(item.element.type)) {
      value = normalizeVoiceFieldValue(item.element.type, value)
      if (value === null) return refusal(`Valor inválido para “${item.name}”. Diga a data completa com ano ou um horário exato com manhã/tarde/noite. Também pode usar AAAA-MM-DD ou HH:MM.`)
    }
    if (item.element.maxLength > 0 && value.length > item.element.maxLength) return refusal(`O campo “${item.name}” aceita até ${item.element.maxLength} caracteres.`)
    if (item.element.tagName === 'INPUT') {
      const probe = item.element.cloneNode()
      probe.value = value
      if (probe.value !== value || (!clearField && !probe.checkValidity())) return refusal(`Valor inválido para “${item.name}”. Confira o formato e os limites do campo.`)
    }
  }
  return {
    status: 'draft',
    intent: { type: 'interface.control', operation, target: { ...fingerprint(item, ['open', 'close'].includes(operation)), ...(seriesMetadata(item.element) !== null && isSeriesQuery(query) ? { seriesQuery: query } : {}), ...(resumeMetadata(item.element) !== null ? { resume: resumeMetadata(item.element), ...(resumeQuery(query) ? { resumeQuery: query } : {}) } : {}), ...(appointmentMetadata(item.element) !== null ? { appointment: appointmentMetadata(item.element), appointmentQuery: query } : {}), ...(['open', 'close'].includes(operation) ? { drawerId: item.element.matches('summary') ? item.element.parentElement.id : item.element.getAttribute('aria-controls') } : {}) }, ...(operation === 'fill' ? { value } : {}), ...(optionLabel !== undefined ? { optionLabel } : {}) },
    preview: clearField ? `Limpar ${item.name}.` : operation === 'fill' ? `${item.name}: ${item.element.tagName === 'SELECT' ? [...item.element.options].find(option => option.value === value)?.textContent : value}`
      : appointmentSuffix(query, item.element)?.option ? `Abrir detalhes de ${item.element.getAttribute('data-voice-appointment-patient')} · ${item.element.getAttribute('data-voice-appointment-date')} às ${item.element.getAttribute('data-voice-appointment-start')}–${item.element.getAttribute('data-voice-appointment-end')} · opção ${item.element.getAttribute('data-voice-appointment-option')}.`
      : numberedSeriesQuery ? `${item.element.getAttribute('data-voice-series-kind') === 'advance' ? 'Antecipar término' : 'Encerrar série'} de ${item.element.getAttribute('data-voice-series-patient')} · opção ${item.element.getAttribute('data-voice-series-option')} · ${['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'][Number(item.element.getAttribute('data-voice-series-weekday'))]} às ${item.element.getAttribute('data-voice-series-time')}.`
      : `${operation === 'open' ? 'Abrir' : operation === 'close' ? 'Recolher' : operation === 'click' ? 'Acionar' : operation === 'check' ? 'Marcar' : 'Desmarcar'} ${['open', 'close'].includes(operation) ? textContent(item.element) : item.name}${item.element.hasAttribute('data-voice-series-kind') ? ` · ${['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][Number(item.element.getAttribute('data-voice-series-weekday'))]} às ${item.element.getAttribute('data-voice-series-time')}` : ''}${item.context ? ` · ${item.context}` : ''}.`,
    notes: appointmentMetadata(item.element) !== null ? ['Apenas abre os detalhes do compromisso após confirmar. Não altera registros nem inicia sessão.'] : [],
  }
}

export function applyVoiceInterfaceCommand(intent, root = globalThis.document) {
  if (intent?.type !== 'interface.control') throw new Error('Comando de interface inválido.')
  if (intent.target?.seriesQuery) {
    const candidates = inventory(root).filter(item => item.element.matches('button, summary, a[href^="#"], input[type="radio"], input[type="checkbox"]'))
    const resolved = matches(intent.target.seriesQuery, candidates)
    if (resolved.length !== 1 || seriesMetadata(resolved[0].element) === null
      || (seriesOptionRequested(intent.target.seriesQuery) && !uniqueSeriesOption(intent.target.seriesQuery, resolved[0], candidates))) {
      throw new Error('A tela mudou. Prepare o comando novamente antes de aplicar.')
    }
  }
  if (intent.target?.resumeQuery) {
    const candidates = inventory(root).filter(item => item.element.matches('button, summary, a[href^="#"], input[type="radio"], input[type="checkbox"]'))
    const resolved = matches(intent.target.resumeQuery, candidates)
    if (resolved.length !== 1 || !resumeLabelMatches(intent.target.resumeQuery, resolved[0])) throw new Error('A tela mudou. Prepare o comando novamente antes de aplicar.')
  }
  if (intent.target?.appointmentQuery) {
    const candidates = inventory(root).filter(item => item.element.matches('button, summary, a[href^="#"], input[type="radio"], input[type="checkbox"]'))
    const resolved = matches(intent.target.appointmentQuery, candidates)
    if (resolved.length !== 1 || appointmentMetadata(resolved[0].element) === null
      || (appointmentQuery(intent.target.appointmentQuery) && !appointmentLabelMatches(intent.target.appointmentQuery, resolved[0]))
      || !appointmentSelectionUnique(intent.target.appointmentQuery, resolved[0], candidates)) throw new Error('A tela mudou. Prepare o comando novamente antes de aplicar.')
  }
  const found = inventory(root).filter(item => {
    const current = fingerprint(item, ['open', 'close'].includes(intent.operation)), target = intent.target
    if (resumeMetadata(item.element) !== (target.resume ?? null)) return false
    if (appointmentMetadata(item.element) !== (target.appointment ?? null)) return false
    if (['open', 'close'].includes(intent.operation) && (!isDrawer(item.element) || target.drawerId !== (item.element.matches('summary') ? item.element.parentElement.id : item.element.getAttribute('aria-controls')))) return false
    return current.lifecycle === (target.lifecycle ?? null) && current.id === target.id && current.tag === target.tag && current.inputType === target.inputType && current.valueType === target.valueType && current.name === target.name && current.context === target.context && current.action === target.action && current.record === target.record && current.epoch === target.epoch && current.series === target.series
  })
  if (found.length !== 1) throw new Error('A tela mudou. Prepare o comando novamente antes de aplicar.')
  const element = found[0].element
  if (intent.operation === 'fill' && clinicalLineBreak.test(intent.value)) {
    if (!multilineTextareaField(element) || element.readOnly || (element.maxLength > 0 && intent.value.length > element.maxLength)) {
      throw new Error('O campo clínico mudou. Prepare o comando novamente antes de aplicar.')
    }
  }
  if (intent.operation === 'fill' && element.tagName === 'SELECT') {
    const options = [...element.options].filter(option => !option.disabled && option.value === intent.value)
    if (options.length !== 1 || (intent.optionLabel !== undefined && options[0].textContent !== intent.optionLabel)) {
      throw new Error('As opções mudaram. Prepare o comando novamente antes de aplicar.')
    }
  }
  element.scrollIntoView({ block: 'center', behavior: 'smooth' })
  element.focus({ preventScroll: true })
  if (['open', 'close'].includes(intent.operation)) {
    if (!isDrawer(element)) throw new Error('A gaveta mudou. Prepare o comando novamente.')
    const open = element.matches('summary') ? element.parentElement.open : element.getAttribute('aria-expanded') === 'true'
    if (open !== (intent.operation === 'open')) element.click()
  }
  else if (intent.operation === 'click') element.click()
  else if (intent.operation === 'check' || intent.operation === 'uncheck') {
    if (element.checked !== (intent.operation === 'check')) element.click()
  } else if (intent.operation === 'fill') {
    if (element.type === 'password' || element.type === 'file' || element.readOnly) throw new Error('Este campo precisa ser preenchido diretamente.')
    const view = element.ownerDocument.defaultView
    const prototype = element.tagName === 'TEXTAREA' ? view.HTMLTextAreaElement.prototype : element.tagName === 'SELECT' ? view.HTMLSelectElement.prototype : view.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, intent.value)
    element.dispatchEvent(new view.Event('input', { bubbles: true }))
    element.dispatchEvent(new view.Event('change', { bubbles: true }))
  } else throw new Error('Operação de interface inválida.')
}
