import { useRef, useState } from 'react'
import { formatCentralCommandPreview, parseCentralCommand } from './centralCommandRouter.js'
import './VoiceCommandCenter.css'

/**
 * Compact Home command composer. onTranscribe is supplied by the native host and
 * must resolve to a transcript string; this component does not capture audio.
 * onDraft receives a typed intent for preview only. The caller owns all applying
 * and persistence decisions.
 */
export function VoiceCommandCenter({
  patients = [],
  behaviors = [],
  indicators = [],
  activeSessionDraft = null,
  referenceDate,
  onDraft,
  onTranscribe,
}) {
  const [command, setCommand] = useState('')
  const [result, setResult] = useState(null)
  const [transcribing, setTranscribing] = useState(false)
  const transcriptGeneration = useRef(0)

  const interpret = value => {
    transcriptGeneration.current += 1
    const next = parseCentralCommand({
      text: value,
      context: { patients, behaviors, indicators, activeSessionDraft },
      referenceDate,
    })
    setCommand(value)
    setResult(next)
    onDraft?.(next.status === 'draft' ? next.intent : null)
  }

  const transcribe = async () => {
    if (!onTranscribe || transcribing) return
    const generation = ++transcriptGeneration.current
    setTranscribing(true)
    setResult(null)
    onDraft?.(null)
    const patientNames = patients
      .filter(patient => patient && patient.archivedAt == null && typeof patient.name === 'string')
      .map(patient => patient.name)
    try {
      const transcript = await onTranscribe(patientNames)
      if (transcriptGeneration.current !== generation) return
      if (typeof transcript !== 'string' || !transcript.trim()) {
        setResult({ status: 'clarification', message: 'Não recebi uma transcrição. Você pode digitar o comando.' })
        return
      }
      setCommand(transcript.trim())
      setResult({ status: 'transcript', message: 'Confira ou corrija o texto reconhecido. Depois clique em “Preparar rascunho”. Nada foi interpretado ou salvo.' })
    } catch (reason) {
      if (transcriptGeneration.current === generation) {
        setResult({ status: 'clarification', message: reason?.message || 'Não foi possível transcrever agora. Digite o comando para continuar.' })
      }
    } finally {
      patientNames.fill('')
      setTranscribing(false)
    }
  }

  return <section className="voice-command-center" aria-label="Comando do Círculo">
    <div className="voice-command-heading">
      <div><p className="voice-command-eyebrow">ATALHO</p><h2>O que você quer fazer?</h2></div>
      <span aria-hidden="true">✦</span>
    </div>
    <p className="voice-command-description">Fale ou digite um pedido para Pacientes, Agenda ou uma sessão aberta. A voz é transcrita neste computador; confira o rascunho antes de aplicar.</p>
    <label htmlFor="voice-command-text">Seu comando</label>
    <textarea
      id="voice-command-text"
      rows={2}
      maxLength={1200}
      value={command}
      onChange={event => {
        transcriptGeneration.current += 1
        setCommand(event.target.value)
        setResult(null)
        onDraft?.(null)
      }}
      placeholder="Ex.: criar sessão semanal para Ana Clara toda quinta às 15:00"
      onKeyDown={event => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') interpret(command)
      }}
    />
    <div className="voice-command-actions">
      <button type="button" onClick={() => interpret(command)}>Preparar rascunho</button>
      {onTranscribe && <button type="button" className="voice-command-secondary" onClick={transcribe} disabled={transcribing}>
      {transcribing ? 'Ouvindo e transcrevendo aqui…' : '🎙 Ouvir e transcrever'}
      </button>}
    </div>
    {result?.status === 'clarification' && <p className="voice-command-error" role="status">{result.message}</p>}
    {result?.status === 'transcript' && <p className="voice-command-preview" role="status" aria-live="polite">{result.message}</p>}
    {result?.status === 'draft' && <div className="voice-command-preview" role="status" aria-live="polite">
      <strong>Confira este rascunho</strong>
      <p>{formatCentralCommandPreview(result)}</p>
      {result.notes?.map(note => <small key={note}>{note}</small>)}
      <small>Nada foi salvo nem alterado. Esta proposta ainda precisa ser revisada na tela correspondente.</small>
    </div>}
  </section>
}

export default VoiceCommandCenter
