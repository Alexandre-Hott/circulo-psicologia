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
    onDraft={intent => { window.__lastIntent = intent; document.getElementById('intent-result').textContent = intent ? JSON.stringify(intent) : '' }}
    onTranscribe={async patientNames => {
      window.__transcribePatientNames = [...patientNames]
      window.__transcribePatientNamesReference = patientNames
      if (new URLSearchParams(window.location.search).get('voiceFail') === 'permission') {
        throw new Error('O acesso ao microfone foi bloqueado. Permita o microfone para o Círculo ou digite o comando.')
      }
      if (new URLSearchParams(window.location.search).get('voiceTranscript') === 'patient-pause') {
        return 'Cadastrar paciente. Bia Fictância com 9 anos.'
      }
      if (new URLSearchParams(window.location.search).get('voiceTranscript') === 'deferred') {
        return await new Promise(resolve => { window.__resolveVoiceTranscript = resolve })
      }
      return 'Ajendar seçao semanal para Ana Clara toda quinta às 15:00'
    }}
  />
  <output id="intent-result" aria-label="Intent emitted"></output>
</>)
