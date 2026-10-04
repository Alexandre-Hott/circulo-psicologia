import { prepareClinicalTextAppend } from './clinicalTextAppend.js'

export const clinicalDictationFields = {
  observation: 'Observações descritivas',
  procedures: 'Procedimentos realizados',
  outcomeDecision: 'Resultado e decisão',
  referralClosure: 'Encaminhamento ou encerramento (opcional)',
}
const validCounter = value => Number.isSafeInteger(value) && value >= 0
const validString = value => typeof value === 'string' && value.length > 0
const changed = () => new Error('Selecione novamente o campo do rascunho para continuar. Seu trecho pode ser revisado antes de aplicar.')

function checkSnapshot(field, snapshot) {
  if (!Object.hasOwn(clinicalDictationFields, field) || !snapshot
    || !validString(snapshot.patientId) || !validString(snapshot.sessionDraftId)
    || !validCounter(snapshot.epoch) || !validCounter(snapshot.revision)
    || !validString(snapshot.lifecycle) || typeof snapshot.values?.[field] !== 'string') throw changed()
}

export function createClinicalDictationSelection(field, snapshot, patientName) {
  checkSnapshot(field, snapshot)
  if (!validString(patientName)) throw changed()
  return { field, label: clinicalDictationFields[field], patientName,
    patientId: snapshot.patientId, sessionDraftId: snapshot.sessionDraftId,
    epoch: snapshot.epoch, revision: snapshot.revision, lifecycle: snapshot.lifecycle,
    baseValue: snapshot.values[field] }
}

export function validateClinicalDictationSelection(selection, snapshot) {
  checkSnapshot(selection?.field, snapshot)
  if (!validCounter(selection.epoch) || !validCounter(selection.revision)
    || selection.patientId !== snapshot.patientId || selection.sessionDraftId !== snapshot.sessionDraftId
    || selection.epoch !== snapshot.epoch || selection.revision !== snapshot.revision
    || selection.lifecycle !== snapshot.lifecycle || selection.baseValue !== snapshot.values[selection.field]) throw changed()
}

export function prepareClinicalDictation(selection, body, snapshot) {
  validateClinicalDictationSelection(selection, snapshot)
  if (typeof body !== 'string' || !body.trim()) throw new Error('Dite ou escreva um trecho antes de preparar o acréscimo.')
  const target = { patientId: selection.patientId, sessionDraftId: selection.sessionDraftId }
  const { patch, combined } = prepareClinicalTextAppend(target, selection.field, body, snapshot)
  return { status: 'draft',
    intent: { type: 'session.draft.update', target, patch, dictationSelection: { ...selection } },
    preview: `${selection.label} · ${selection.patientName} · rascunho ${selection.sessionDraftId}: ${combined}`,
    notes: ['Trecho mantido literalmente. Revise o acréscimo e depois salve explicitamente o rascunho.'] }
}
