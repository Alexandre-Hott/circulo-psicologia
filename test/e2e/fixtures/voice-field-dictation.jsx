import React from 'react'
import { createRoot } from 'react-dom/client'
import { VoiceCommandCenter } from '../../../src/VoiceCommandCenter.jsx'
import { prepareClinicalTextAppend, validateClinicalTextAppend } from '../../../src/clinicalTextAppend.js'

// Center contract fixture: host/selection callbacks are explicit test doubles.
// Real React/component/append validation; no ASR, native IPC or persistence.
const fields = ['observation', 'procedures', 'outcomeDecision', 'referralClosure']
const values = Object.fromEntries(fields.map(field => [field, 'Base fictícia.']))
window.fieldDictation = {
  live: { patientId: 'ana', sessionDraftId: 'draft-ana', epoch: 1, revision: 1, values },
  selections: [], validations: [], preparations: [], parserCalls: [], applies: [], writes: [], pending: null,
}
const copy = value => structuredClone(value)

export function Harness() {
  const [pending, setPending] = React.useState(undefined)
  const [, refresh] = React.useState(0)
  const fixture = window.fieldDictation
  const validate = selection => {
    fixture.validations.push(copy(selection))
    const live = fixture.live
    if (!selection || selection.patientId !== live.patientId || selection.sessionDraftId !== live.sessionDraftId
      || selection.epoch !== live.epoch || selection.revision !== live.revision
      || selection.baseValue !== live.values[selection.field] || selection.lifecycle !== 'editor:' + live.epoch) {
      throw new Error('O destino do ditado mudou. Selecione o campo novamente.')
    }
    return selection
  }
  return <>
    <VoiceCommandCenter
      patients={[{ id: 'ana', name: 'Ana Clara', archivedAt: null }]}
      activeSessionDraft={{ id: 'draft-ana', patientId: 'ana', patientName: 'Ana Clara', originalDate: '2026-10-04' }}
      autoInterpret referenceDate="2026-10-04" pendingIntent={pending}
      getDictationTarget={field => {
        if (!fields.includes(field)) return null
        const live = fixture.live
        const selection = { ...copy(live), field, patientName: 'Ana Clara', baseValue: live.values[field], lifecycle: 'editor:' + live.epoch }
        fixture.selections.push(copy(selection))
        return selection
      }}
      validateDictationTarget={validate}
      prepareDictation={(selection, body) => {
        validate(selection)
        fixture.preparations.push({ selection: copy(selection), body })
        const target = { patientId: selection.patientId, patientName: selection.patientName, sessionDraftId: selection.sessionDraftId, sessionDate: '2026-10-04' }
        const { patch, combined } = prepareClinicalTextAppend(target, selection.field, body, fixture.live)
        return { status: 'draft', intent: { type: 'session.draft.update', target, patch, dictationSelection: copy(selection) }, preview: combined, notes: [] }
      }}
      parseCommand={request => {
        fixture.parserCalls.push(copy(request))
        return { status: 'clarification', message: 'Parser de comandos não deve receber corpo do ditado.' }
      }}
      onTranscribe={() => new Promise((resolve, reject) => { window.resolveFieldDictation = resolve; window.rejectFieldDictation = reject })}
      onDraft={intent => { fixture.pending = copy(intent); setPending(intent) }}
      onApply={intent => {
        const proposal = intent?.type ? intent : fixture.pending
        if (!proposal) throw new Error('Nenhuma proposta para aplicar.')
        const combined = validateClinicalTextAppend(proposal.target, proposal.patch, fixture.live)
        fixture.applies.push(copy(proposal))
        fixture.live.values[proposal.patch.field] = combined
        fixture.live.revision++
        fixture.pending = null
        setPending(null)
        refresh(value => value + 1)
      }}
      onCancel={() => { fixture.pending = null; setPending(null) }}
    />
    <label htmlFor="fixture-live">Observação fictícia do editor</label>
    <textarea id="fixture-live" value={fixture.live.values.observation} onChange={event => {
      fixture.live.values.observation = event.target.value
      fixture.live.revision++
      refresh(value => value + 1)
    }} />
  </>
}
createRoot(document.getElementById('dictation-host')).render(<Harness />)
