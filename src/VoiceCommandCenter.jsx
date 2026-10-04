import { useEffect, useRef, useState } from 'react'
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
  parseCommand,
  onApply,
  onCancel,
  autoInterpret = false,
  compact = false,
  interfaceOnly = false,
  pendingIntent,
}) {
  const [command, setCommand] = useState('')
  const [result, setResult] = useState(null)
  const [transcribing, setTranscribing] = useState(false)
  const transcriptGeneration = useRef(0)
  useEffect(() => () => { transcriptGeneration.current += 1 }, [])
  useEffect(() => {
    if (pendingIntent === null) {
      transcriptGeneration.current += 1
      setResult(current => current?.status === 'draft' ? null : current)
    }
  }, [pendingIntent])

  const interpret = value => {
    transcriptGeneration.current += 1
    const request = {
      text: value,
      context: { patients, behaviors, indicators, activeSessionDraft },
      referenceDate,
    }
    const word = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[.!?]/g, '').trim()
    if (onApply && result?.status === 'draft' && /^(?:confirmar|confirma|aplicar|aplica|confirmar comando)$/.test(word)) {
      setCommand(value)
      setResult(null)
      void onApply()
      return
    }
    if (onCancel && /^(?:descartar comando|cancelar comando)$/.test(word)) {
      setResult(null); setCommand(''); onCancel(); return
    }
    const next = parseCommand ? parseCommand(request) : parseCentralCommand(request)
    setCommand(value)
    setResult(next)
    onDraft?.(next.status === 'draft' ? next.intent : null)
    if (next.status === 'confirmation') { setResult(null); void onApply?.(next.intent) }
  }

  const transcribe = async () => {
    if (!onTranscribe || transcribing) return
    const generation = ++transcriptGeneration.current
    setTranscribing(true)
    const patientNames = patients
      .filter(patient => patient && patient.archivedAt == null && typeof patient.name === 'string')
      .map(patient => patient.name)
    try {
      const transcript = await onTranscribe(patientNames)
      if (transcriptGeneration.current !== generation) return
      if (typeof transcript !== 'string' || !transcript.trim()) {
        onDraft?.(null)
        setResult({ status: 'clarification', message: 'Não recebi uma transcrição. Você pode digitar o comando.' })
        return
      }
      if (autoInterpret) interpret(transcript.trim())
      else {
        onDraft?.(null)
        setCommand(transcript.trim())
        setResult({ status: 'transcript', message: 'Confira ou corrija o texto reconhecido. Depois clique em “Preparar rascunho”. Nada foi interpretado ou salvo.' })
      }
    } catch (reason) {
      if (transcriptGeneration.current === generation) {
        if (reason?.name === 'AbortError') { setResult(null); onDraft?.(null) }
        else {
          onDraft?.(null)
          setResult({ status: 'clarification', message: reason?.message || 'Não foi possível transcrever agora. Digite o comando para continuar.' })
        }
      }
    } finally {
      patientNames.fill('')
      setTranscribing(false)
    }
  }
  useEffect(() => {
    const shortcut = event => {
      if (event.ctrlKey && event.shiftKey && event.code === 'Space' && !event.repeat && onTranscribe) {
        event.preventDefault()
        void transcribe()
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  })

  return <section className={`voice-command-center${compact ? ' voice-command-compact' : ''}`} aria-label="Comando do Círculo">
    <div className="voice-command-heading">
      <div><p className="voice-command-eyebrow">ASSISTENTE</p><h2>O que você quer fazer?</h2></div>
      <span aria-hidden="true">✦</span>
    </div>
    <p className="voice-command-description">Fale o pedido. Confira a proposta e diga “confirmar”.</p>
    <label htmlFor="voice-command-text">Seu comando</label>
    <textarea
      id="voice-command-text"
      rows={2}
      maxLength={1200}
      value={command}
      onChange={event => {
        transcriptGeneration.current += 1
        const value = event.target.value
        setCommand(value)
        const word = value.toLowerCase().trim()
        if (!word || !['confirmar', 'confirmar comando', 'aplicar', 'cancelar comando', 'descartar comando'].some(phrase => phrase.startsWith(word))) {
          setResult(null)
          onDraft?.(null)
        }
      }}
      placeholder={interfaceOnly ? 'Ex.: clicar em Desbloquear (digite a senha primeiro)' : 'Ex.: criar sessão semanal para Ana Clara toda quinta às 15:00'}
      onKeyDown={event => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') interpret(command)
      }}
    />
    <div className="voice-command-actions">
      <button type="button" onClick={() => interpret(command)}>Preparar rascunho</button>
      {onTranscribe && <button type="button" className="voice-command-secondary" onClick={transcribe} disabled={transcribing} title="Ctrl + Shift + Espaço" aria-keyshortcuts="Control+Shift+Space">
      {transcribing ? 'Ouvindo e transcrevendo aqui…' : '🎙 Ouvir e transcrever'}
      </button>}
    </div>
    {result?.status === 'clarification' && <p className="voice-command-error" role="status">{result.message}</p>}
    {result?.status === 'transcript' && <p className="voice-command-preview" role="status" aria-live="polite">{result.message}</p>}
    {result?.status === 'draft' && <div className="voice-command-preview" role="status" aria-live="polite">
      <strong>Confira a proposta</strong>
      <p>{formatCentralCommandPreview(result)}</p>
      {(compact ? result.notes?.filter(note => /apenas nesta sessão|somente ao rascunho|mantido literalmente/.test(note)) : result.notes)?.map(note => <small key={note}>{note}</small>)}
      <small>{onApply ? 'Diga “confirmar” para aplicar ou “cancelar comando” para descartar.' : 'Nada foi salvo nem alterado. Revise na tela correspondente.'}</small>
    </div>}
    <details className="voice-command-help"><summary data-voice-help>O que posso pedir?</summary>{interfaceOnly ? <><ul><li>“Clicar em Desbloquear” após digitar sua senha</li><li>“Clicar em Criar cofre cifrado” na primeira configuração</li><li>“Clicar em Opções avançadas de backup e restauração” quando disponível</li></ul><small>Somente botões visíveis nesta tela. Digite as senhas manualmente; pacientes e agenda ficam disponíveis após desbloquear.</small></> : <><ul>
      <li>“Cadastrar paciente Ana Clara com 8 anos”</li>
      <li>“Criar comportamento Pede ajuda”</li>
      <li>“Agendar sessão para Ana Clara amanhã às três da tarde”</li>
      <li>“Abrir Agenda” ou “Abrir Análises”</li>
      <li>“Mostrar agenda de hoje”, “desta semana” ou “deste mês”</li>
      <li>“Abrir registros de Ana Clara” ou “Abrir vínculos de Ana Clara”</li>
      <li>“Mostrar análises de Ana Clara neste mês”</li>
      <li>“Iniciar sessão de Ana Clara hoje às 15 horas”</li>
      <li>“Cancelar sessão de Ana Clara amanhã às três da tarde” abre o formulário</li>
      <li>“Clicar em Novo compromisso”</li>
      <li>“Preencher Nome com Ana Clara”</li>
      <li>“Preencher Data do compromisso com dez de outubro de 2026”</li>
      <li>“Preencher Horário inicial com três da tarde”</li>
      <li>“Limpar Nome” ou “Limpar Busca”</li>
      <li>“Selecionar Modalidade como Online”</li>
      <li>“Marcar Pede ajuda” ou “Desmarcar Pede ajuda” na sessão</li>
      <li>“Preencher Nota contextual de Regulação emocional com Participou com apoio” na sessão</li>
      <li>“Clicar em Salvar rascunho” ou “Finalizar sessão”</li>
    </ul><small>Use o texto do botão ou campo. Se houver opções iguais, acrescente o paciente. Senhas e escolhas de arquivos continuam nas janelas próprias.</small></>}</details>
  </section>
}

export default VoiceCommandCenter
