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
      // Only explicitly identical, record-scoped button actions are equivalent.
      // Matching text alone must never merge different patient/session targets.
      const action = item.element.matches('button') && item.element.getAttribute('data-voice-action')
      if (!action) return true
      const key = `${action}:${fold(item.name)}`
      if (seenActions.has(key)) return false
      seenActions.add(key)
      return true
    })
}

function matches(query, entries) {
  const normalized = fold(query)
  // One short save request covers both modes of the existing library form.
  // It still competes with every visible match and retains the actual button
  // fingerprint, so a proposal cannot cross from creation to another editor.
  const behaviorSave = normalized === 'salvar comportamento'
  // Exact Portuguese recognition variant, only for this visible party role.
  // Never rewrite a name, relation, text field or another checkbox label.
  const administrativeRoleAlias = normalized === 'contrato administrativo'
  // Explicit legacy aliases compete with all matching controls, never picking
  // the first retry when two operations share an old short command.
  const exact = entries.filter(item => fold(item.name) === normalized || (administrativeRoleAlias && item.element.type === 'checkbox' && fold(item.name) === 'contato administrativo' && item.element.closest('form[data-voice-record^="party:"]')) || (behaviorSave && item.element.matches('button') && ['criar comportamento reutilizavel', 'salvar versao do comportamento'].includes(fold(item.name))) || fold(item.element.getAttribute('data-voice-alias') || '') === normalized || fold(`${item.name} de ${item.context}`) === normalized || fold(`${item.name} em ${item.context}`) === normalized)
  if (exact.length) return exact
  const aliases = entries.filter(item => fold(item.name.replace(/\s*·\s*v\d+\s*$/i, '').replace(/\s*\(opcional\)/i, '').replace(/\s*\(at[eé]\s+\d+\s+caracteres\)/iu, '').replace(/\s+em anos\b/i, '')) === normalized)
  if (aliases.length) return aliases
  // Patient cards have short buttons; their context makes "Editar de Ana Clara" unique.
  return entries.filter(item => item.context && [fold(`${item.name} de ${item.context}`), fold(`${item.name} em ${item.context}`)].some(label => label.startsWith(normalized) && normalized.startsWith(fold(item.name) + ' ')))
}

function fingerprint(item, drawer = false) {
  return { id: item.element.id || null, tag: item.element.tagName, inputType: item.element.type || null, valueType: item.element.getAttribute('data-voice-value-type') || null, name: drawer ? textContent(item.element) : item.name, context: item.context, action: item.element.getAttribute('data-voice-action') || null, record: item.element.closest('[data-voice-record]')?.getAttribute('data-voice-record') || null, epoch: item.element.closest('[data-voice-epoch]')?.getAttribute('data-voice-epoch') || null }
}

function isDrawer(element) {
  return element.matches('summary') && element.parentElement?.matches('details') ||
    element.matches('button[aria-controls]') && ['true', 'false'].includes(element.getAttribute('aria-expanded'))
}

export function parseVoiceInterfaceCommand(text, root = globalThis.document) {
  // Exact variant observed in the synthetic Portuguese Whisper test. No names
  // or field contents are repaired; this still produces a reviewable proposal.
  const raw = clean(text).replace(/^ficarem novo cadastro$/iu, 'Clicar em Novo cadastro')
    // Exact command-prefix variants captured from local Portuguese recognition.
    // Never repair the value, patient's name, indicator title or note content.
    .replace(/^princher(?=\s)/iu, 'Preencher')
    .replace(/^prinscheridade(?=\s+(?:com|como|para)\s)/iu, 'Preencher Idade')
  const normalized = fold(raw)
  if (!root || !normalized) return null
  if (/^(?:nao|nunca)\b/.test(normalized)) return refusal('Pedido negado. Nenhuma ação preparada.')
  let operation, query, value, optionLabel
  const fieldPayload = /^(?:preencher|preencha|preenche|definir|defina|selecionar|selecione|seleciona)\s+(.+)$/iu.exec(raw)?.[1]
  // An article can be part of the actual label ("O próprio paciente...").
  // Resolve both forms against visible controls instead of stripping it blindly.
  const payloads = fieldPayload ? [...new Set([fieldPayload, fieldPayload.replace(/^(?:o campo |a op[cç][aã]o |o |a )/iu, '')])] : []
  const fields = payloads.flatMap(payload => [...payload.matchAll(/\s+(?:com|como|para)\s+/giu)].map(delimiter => ({ query: payload.slice(0, delimiter.index), value: clean(payload.slice(delimiter.index + delimiter[0].length)) }))).filter(item => item.query && item.value)
  const clearField = /^(?:limpar|limpe|esvaziar|esvazie)\s+(?:o campo |o |a )?(.+)$/iu.exec(raw)
  const check = /^(marcar|marque|desmarcar|desmarque)\s+(?:a op[cç][aã]o |o |a )?(.+)$/iu.exec(raw)
  const click = /^(?:clicar|clique|clica|acionar|acione|apertar|aperte)\s+(?:no bot[aã]o |na opc[aã]o |no |na |em )?(.+)$/iu.exec(raw)
  const drawer = /^(abrir|abra|fechar|feche|recolher|recolha)\s+(?:a gaveta |gaveta )?(.+)$/iu.exec(raw)
  if (fields.length) { operation = 'fill'; query = fields[0].query; value = fields[0].value }
  else if (clearField) { operation = 'fill'; query = clearField[1]; value = '' }
  else if (check) { operation = /^des/i.test(check[1]) ? 'uncheck' : 'check'; query = check[2] }
  else if (click) { operation = 'click'; query = click[1] }
  else if (drawer) { operation = /^abr/iu.test(drawer[1]) ? 'open' : 'close'; query = drawer[2] }
  else if (/^(?:salvar|salve)(?: o)? comportamento$/.test(normalized)) { operation = 'click'; query = 'Salvar comportamento' }
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
    return refusal(`Não encontrei “${query}” disponível nesta tela. Abra a área correspondente e diga o texto do botão ou campo.`)
  }
  const item = found[0]
  if (operation === 'uncheck' && item.element.type === 'radio') return refusal('Escolha outra opção deste grupo para alterar a seleção.')
  if (operation === 'fill') {
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
    intent: { type: 'interface.control', operation, target: { ...fingerprint(item, ['open', 'close'].includes(operation)), ...(['open', 'close'].includes(operation) ? { drawerId: item.element.matches('summary') ? item.element.parentElement.id : item.element.getAttribute('aria-controls') } : {}) }, ...(operation === 'fill' ? { value } : {}), ...(optionLabel !== undefined ? { optionLabel } : {}) },
    preview: clearField ? `Limpar ${item.name}.` : operation === 'fill' ? `${item.name}: ${item.element.tagName === 'SELECT' ? [...item.element.options].find(option => option.value === value)?.textContent : value}`
      : `${operation === 'open' ? 'Abrir' : operation === 'close' ? 'Recolher' : operation === 'click' ? 'Acionar' : operation === 'check' ? 'Marcar' : 'Desmarcar'} ${['open', 'close'].includes(operation) ? textContent(item.element) : item.name}${item.context ? ` · ${item.context}` : ''}.`,
    notes: [],
  }
}

export function applyVoiceInterfaceCommand(intent, root = globalThis.document) {
  if (intent?.type !== 'interface.control') throw new Error('Comando de interface inválido.')
  const found = inventory(root).filter(item => {
    const current = fingerprint(item, ['open', 'close'].includes(intent.operation)), target = intent.target
    if (['open', 'close'].includes(intent.operation) && (!isDrawer(item.element) || target.drawerId !== (item.element.matches('summary') ? item.element.parentElement.id : item.element.getAttribute('aria-controls')))) return false
    return current.id === target.id && current.tag === target.tag && current.inputType === target.inputType && current.valueType === target.valueType && current.name === target.name && current.context === target.context && current.action === target.action && current.record === target.record && current.epoch === target.epoch
  })
  if (found.length !== 1) throw new Error('A tela mudou. Prepare o comando novamente antes de aplicar.')
  const element = found[0].element
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
