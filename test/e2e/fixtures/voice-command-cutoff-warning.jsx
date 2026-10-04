import React from 'react'
import { createRoot } from 'react-dom/client'
import { VoiceCommandCenter } from '../../../src/VoiceCommandCenter.jsx'
import { parseCentralCommand } from '../../../src/centralCommandRouter.js'

// Normal Vite package imports share React with the production component.
// Seeded host responses are metadata-contract tests, not native ASR evidence.
const autoInterpret = new URLSearchParams(window.location.search).get('autoInterpret') === 'true'
const host = document.getElementById('cutoff-host')
const context = {
  patients: [{ id: 'ana', name: 'Ana Clara', archivedAt: null }],
  activeSessionDraft: { id: 'draft-ana', patientId: 'ana', patientName: 'Ana Clara', originalDate: '2026-10-04' },
  clinicalTextSnapshot: { patientId: 'ana', sessionDraftId: 'draft-ana', epoch: 1, revision: 1, values: { observation: '', procedures: '', outcomeDecision: '', referralClosure: '' } },
}
window.cutoffHarness = { parserCalls: [], transcribeCalls: [], drafts: [], pending: null, applies: [], writes: [] }
export function Harness() {
  const [pending, setPending] = React.useState(undefined)
  return React.createElement(VoiceCommandCenter, {
    patients: context.patients, activeSessionDraft: context.activeSessionDraft,
    referenceDate: '2026-10-04', autoInterpret, pendingIntent: pending,
    parseCommand: request => {
      window.cutoffHarness.parserCalls.push(structuredClone(request))
      return parseCentralCommand({ ...request, context })
    },
    onTranscribe: patientNames => {
      window.cutoffHarness.transcribeCalls.push([...patientNames])
      return new Promise((resolve, reject) => { window.resolveCutoff = resolve; window.rejectCutoff = reject })
    },
    onDraft: intent => {
      window.cutoffHarness.drafts.push(structuredClone(intent))
      window.cutoffHarness.pending = structuredClone(intent)
      setPending(intent)
    },
    onApply: () => {
      // Simulated host local application only. There is no Save/IPC here.
      window.cutoffHarness.applies.push(structuredClone(pending))
      window.cutoffHarness.pending = null
      setPending(null)
    },
    onCancel: () => { window.cutoffHarness.pending = null; setPending(null) },
  })
}
window.cutoffRoot = createRoot(host)
window.cutoffRoot.render(React.createElement(Harness))
