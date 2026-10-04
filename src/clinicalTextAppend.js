import { VOICE_CLINICAL_TEXT_MAX_LENGTH } from './voiceCommandLimits.js'

export const clinicalTextFields = ['observation', 'procedures', 'outcomeDecision', 'referralClosure']
const validCounter = value => Number.isSafeInteger(value) && value >= 0
const validId = value => typeof value === 'string' && value.length > 0
const stale = () => new Error('O formulário atual do rascunho mudou ou não está pronto. Prepare o pedido novamente.')

function checkSnapshot(target, field, snapshot) {
  if (!clinicalTextFields.includes(field) || !validId(target?.patientId) || !validId(target?.sessionDraftId)
    || !snapshot || snapshot.patientId !== target.patientId || snapshot.sessionDraftId !== target.sessionDraftId
    || !validCounter(snapshot.epoch) || !validCounter(snapshot.revision)
    || typeof snapshot.values?.[field] !== 'string') throw stale()
}

export function validateClinicalTextAppend(target, patch, snapshot) {
  checkSnapshot(target, patch?.field, snapshot)
  if (patch.operation !== 'append' || patch.separator !== ' ' || typeof patch.value !== 'string' || !patch.value.length
    || typeof patch.baseValue !== 'string' || !validCounter(patch.baseEpoch) || !validCounter(patch.baseRevision)
    || patch.baseEpoch !== snapshot.epoch || patch.baseRevision !== snapshot.revision
    || patch.baseValue !== snapshot.values[patch.field]) throw stale()
  const combined = patch.baseValue === '' ? patch.value : patch.baseValue + ' ' + patch.value
  if (combined.length > VOICE_CLINICAL_TEXT_MAX_LENGTH) {
    const error = new Error(`O texto combinado do campo deve ter até ${VOICE_CLINICAL_TEXT_MAX_LENGTH} caracteres, incluindo o espaço entre os trechos.`)
    error.code = 'clinical_text_limit'
    throw error
  }
  return combined
}

export function prepareClinicalTextAppend(target, field, value, snapshot) {
  checkSnapshot(target, field, snapshot)
  const patch = { field, operation: 'append', value, separator: ' ', baseValue: snapshot.values[field], baseEpoch: snapshot.epoch, baseRevision: snapshot.revision }
  const combined = validateClinicalTextAppend(target, patch, snapshot)
  return { patch, combined }
}
