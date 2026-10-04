import { clinicalDictationFields } from './clinicalFieldDictation.js'

const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.!?]{1,3}$/u, '').trim()

// Classification only. The assistant owns availability, snapshots and applying.
// Never send the literal dictation body through this command parser.
export function parseDictationControl(text, { dictatingField = false } = {}) {
  if (typeof text !== 'string') return null
  const command = normalize(text)
  const active = dictatingField === true
  if (command === 'ditar neste campo') return { kind: 'local-action', action: 'enter' }
  if (command === 'confirmar') return active ? { kind: 'local-action', action: 'confirm' } : null
  const actions = new Map([
    ['preparar trecho', 'prepare'], ['confirmar acrescimo', 'confirm'],
    ['descartar trecho', 'discard'], ['usar comandos', 'exit'],
  ])
  if (actions.has(command)) return active
    ? { kind: 'local-action', action: actions.get(command) }
    : { kind: 'local-refusal', reason: 'inactive-mode' }
  if (!/^selecionar campo(?: |$)/u.test(command)) return null
  if (!active) return { kind: 'local-refusal', reason: 'inactive-mode' }
  const label = command.slice('selecionar campo'.length).trim()
  const fields = Object.entries(clinicalDictationFields).filter(([field, canonical]) => {
    const labels = field === 'referralClosure'
      ? [canonical, canonical.replace(/ \(opcional\)$/u, ''), canonical.replace(/\(opcional\)$/u, 'opcional')]
      : [canonical]
    return labels.some(value => normalize(value) === label)
  })
  return fields.length === 1 ? { kind: 'local-action', action: 'select', field: fields[0][0] }
    : { kind: 'local-refusal', reason: 'invalid-field' }
}
