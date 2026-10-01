import { createRoot } from 'react-dom/client'
import { VoiceCommandCenter } from '../../../src/VoiceCommandCenter.jsx'

const patients = [
  { id: 'synthetic-ana', name: 'Ana Clara', age: 8, archivedAt: null },
  { id: 'synthetic-caio', name: 'Caio Fictício', age: 11, archivedAt: null },
]
const behaviors = [{ id: 'synthetic-behavior-1', title: 'Pede ajuda', archivedAt: null }]
const indicators = [{ id: 'synthetic-indicator-1', name: 'Regulação emocional', labels: ['Ainda não observado', 'Com muito apoio', 'Com algum apoio', 'Com autonomia'] }]

createRoot(document.getElementById('root')).render(<>
  <VoiceCommandCenter
    patients={patients}
    behaviors={behaviors}
    indicators={indicators}
    activeSessionDraft={{ id: 'synthetic-draft-1', patientId: 'synthetic-ana', patientName: 'Ana Clara', originalDate: '2026-09-30' }}
    referenceDate="2026-09-30"
    onDraft={intent => { window.__lastIntent = intent; document.getElementById('intent-result').textContent = JSON.stringify(intent) }}
    onTranscribe={async () => 'Adicionar uma sessão semanal para Ana Clara toda quinta às 15:00'}
  />
  <output id="intent-result" aria-label="Intent emitted"></output>
</>)
