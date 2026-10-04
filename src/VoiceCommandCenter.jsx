import { useEffect, useRef, useState } from 'react'
import { formatCentralCommandPreview, parseCentralCommand } from './centralCommandRouter.js'
import { VOICE_COMMAND_MAX_LENGTH } from './voiceCommandLimits.js'
import { LOCAL_VOICE_MAX_MS } from './localVoiceCapture.js'
import { clinicalDictationFields } from './clinicalFieldDictation.js'
import './VoiceCommandCenter.css'

/**
 * Compact Home command composer. onTranscribe is supplied by the native host and
 * resolves to a legacy string or { transcript, endedBy, maxDurationMs }.
 * This component does not capture audio.
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
  getDictationTarget,
  validateDictationTarget,
  prepareDictation,
}) {
  const [command, setCommand] = useState('')
  const [result, setResult] = useState(null)
  const [transcribing, setTranscribing] = useState(false)
  const [captureNotice, setCaptureNotice] = useState('')
  const [dictatingField, setDictatingField] = useState(false)
  const [dictationSelection, setDictationSelection] = useState(null)
  const [dictationBody, setDictationBody] = useState('')
  const dictationGeneration = useRef(0)
  const dictationProposalPending = useRef(false)
  const transcriptGeneration = useRef(0)
  useEffect(() => () => { transcriptGeneration.current += 1; dictationGeneration.current += 1 }, [])
  useEffect(() => {
    if (pendingIntent === null) {
      transcriptGeneration.current += 1
      setResult(current => current?.status === 'draft' ? null : current)
      if (dictationProposalPending.current) {
        dictationProposalPending.current = false
        setDictationSelection(null)
      }
    }
  }, [pendingIntent])

  useEffect(() => {
    if (!dictationSelection || !validateDictationTarget) return
    const check = () => {
      try { validateDictationTarget(dictationSelection) }
      catch {
        dictationGeneration.current++
        dictationProposalPending.current = false
        setDictationSelection(null)
        setResult({ status: 'clarification', message: 'O campo mudou. Selecione novamente o destino; seu trecho continua editável.' })
        onDraft?.(null)
      }
    }
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.body, { subtree: true, childList: true, attributes: true,
      attributeFilter: ['data-voice-lifecycle', 'data-voice-record', 'data-voice-epoch', 'hidden', 'inert', 'aria-hidden', 'disabled', 'readonly', 'open', 'style', 'class'] })
    const edited = event => { if (!event.target.closest?.('.voice-command-center')) check() }
    document.addEventListener('input', edited)
    document.addEventListener('change', edited)
    return () => { observer.disconnect(); document.removeEventListener('input', edited); document.removeEventListener('change', edited) }
  }, [dictationSelection, validateDictationTarget, onDraft])

  const clearDictationProposal = () => {
    dictationProposalPending.current = false
    setResult(null)
    onDraft?.(null)
  }
  const selectDictationField = field => {
    dictationGeneration.current++
    clearDictationProposal()
    setDictationSelection(null)
    if (!field) return
    try {
      const selection = getDictationTarget(field)
      if (!selection || selection.field !== field) throw new Error('Selecione um campo de um rascunho disponível para ditar.')
      validateDictationTarget(selection)
      setDictationSelection(selection)
    } catch (reason) { setResult({ status: 'clarification', message: reason.message }) }
  }
  const checkDictationSelection = selection => {
    try {
      if (!selection) throw new Error('Selecione o campo do rascunho antes de continuar.')
      validateDictationTarget(selection)
      return true
    } catch {
      clearDictationProposal()
      setDictationSelection(null)
      setResult({ status: 'clarification', message: 'Selecione novamente o campo do rascunho; seu trecho continua editável.' })
      return false
    }
  }
  const prepareFieldDictation = () => {
    if (!checkDictationSelection(dictationSelection)) return
    clearDictationProposal()
    try {
      const proposed = prepareDictation(dictationSelection, dictationBody)
      if (proposed?.status !== 'draft') throw new Error(proposed?.message || 'Confira o trecho antes de preparar o acréscimo.')
      if (!checkDictationSelection(dictationSelection)) return
      dictationProposalPending.current = true
      setResult(proposed)
      onDraft?.(proposed.intent)
    } catch (reason) { setResult({ status: 'clarification', message: reason.message }) }
  }
  const confirmFieldDictation = async () => {
    if (result?.status !== 'draft' || !checkDictationSelection(dictationSelection)) return
    const intent = result.intent
    clearDictationProposal()
    setDictationSelection(null)
    try { await onApply?.(intent) }
    catch (reason) { setResult({ status: 'clarification', message: reason.message || 'Selecione novamente o campo antes de aplicar o trecho.' }) }
  }
  const transcribeField = async () => {
    if (!onTranscribe || transcribing || !checkDictationSelection(dictationSelection)) return
    const selection = dictationSelection
    const generation = ++dictationGeneration.current
    clearDictationProposal()
    setTranscribing(true)
    setCaptureNotice('')
    const patientNames = patients.filter(patient => patient && patient.archivedAt == null && typeof patient.name === 'string').map(patient => patient.name)
    try {
      const response = await onTranscribe(patientNames)
      if (dictationGeneration.current !== generation) return
      const structured = response !== null && typeof response === 'object' && !Array.isArray(response)
      const transcript = structured ? response.transcript : response
      const validMetadata = !structured || (['silence', 'max-duration'].includes(response.endedBy)
        && Number.isFinite(response.maxDurationMs) && response.maxDurationMs > 0 && response.maxDurationMs <= LOCAL_VOICE_MAX_MS)
      if (!validMetadata || typeof transcript !== 'string' || !transcript.trim()) throw new Error('Não recebi um trecho. Você pode escrevê-lo para continuar.')
      if (!checkDictationSelection(selection)) return
      setDictationBody(transcript)
      if (structured && response.endedBy === 'max-duration') {
        setCaptureNotice(`A captura atingiu ${(response.maxDurationMs / 1000).toLocaleString('pt-BR')} segundos e pode estar incompleta. Confira ou complete o texto e clique em Preparar trecho.`)
      }
      setResult({ status: 'transcript', message: 'Confira o trecho e clique em Preparar trecho. Nada foi aplicado ou salvo.' })
    } catch (reason) {
      if (dictationGeneration.current === generation) {
        clearDictationProposal()
        setResult(reason?.name === 'AbortError' ? null : { status: 'clarification', message: reason.message || 'Não foi possível transcrever. Seu trecho continua editável.' })
      }
    } finally { patientNames.fill(''); setTranscribing(false) }
  }

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
      setCaptureNotice('')
      void onApply()
      return
    }
    if (onCancel && /^(?:descartar comando|cancelar comando)$/.test(word)) {
      setResult(null); setCommand(''); setCaptureNotice(''); onCancel(); return
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
    setCaptureNotice('')
    const patientNames = patients
      .filter(patient => patient && patient.archivedAt == null && typeof patient.name === 'string')
      .map(patient => patient.name)
    try {
      const response = await onTranscribe(patientNames)
      if (transcriptGeneration.current !== generation) return
      const structured = response !== null && typeof response === 'object' && !Array.isArray(response)
      const transcript = structured ? response.transcript : response
      const validMetadata = !structured || (['silence', 'max-duration'].includes(response.endedBy)
        && Number.isFinite(response.maxDurationMs) && response.maxDurationMs > 0 && response.maxDurationMs <= LOCAL_VOICE_MAX_MS)
      if (!validMetadata || typeof transcript !== 'string' || !transcript.trim()) {
        onDraft?.(null)
        setResult({ status: 'clarification', message: 'Não recebi uma transcrição. Você pode digitar o comando.' })
        return
      }
      if (structured && response.endedBy === 'max-duration') {
        onDraft?.(null)
        setCommand(transcript)
        setResult({ status: 'transcript', message: 'Confira ou corrija o texto reconhecido. Depois clique em “Preparar rascunho”. Nada foi interpretado ou salvo.' })
        setCaptureNotice(`A captura atingiu ${(response.maxDurationMs / 1000).toLocaleString('pt-BR')} segundos e pode estar incompleta. Confira ou complete o texto e clique em Preparar rascunho.`)
      } else if (autoInterpret) interpret(transcript.trim())
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
        if (dictatingField) void transcribeField()
        else void transcribe()
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  })

  return <section className={`voice-command-center${compact ? ' voice-command-compact' : ''}${dictatingField ? ' voice-command-dictation' : ''}`} aria-label="Comando do Círculo">
    <div className="voice-command-heading">
      <div><p className="voice-command-eyebrow">ASSISTENTE</p><h2>O que você quer fazer?</h2></div>
      <span aria-hidden="true">✦</span>
    </div>
    <p className="voice-command-description">{dictatingField ? 'Dite apenas o trecho. Confira e confirme o acréscimo; depois salve o rascunho.' : 'Fale o pedido. Confira a proposta e diga “confirmar”.'}</p>
    {onTranscribe && <small>Fale um trecho de até {LOCAL_VOICE_MAX_MS / 1000} segundos.</small>}
    {getDictationTarget && validateDictationTarget && prepareDictation && <div className="voice-command-actions">
      <button type="button" className="voice-command-secondary" disabled={transcribing} onClick={() => {
        transcriptGeneration.current++; dictationGeneration.current++
        clearDictationProposal(); setDictationSelection(null); setCaptureNotice(''); setDictatingField(true)
      }}>Ditar neste campo</button>
      {dictatingField && <button type="button" className="voice-command-secondary" disabled={transcribing} onClick={() => {
        dictationGeneration.current++; clearDictationProposal(); setDictationSelection(null); setCaptureNotice(''); setDictatingField(false)
      }}>Usar comandos</button>}
    </div>}
    {dictatingField ? <>
      <label htmlFor="voice-dictation-field">Campo do rascunho</label>
      <select id="voice-dictation-field" disabled={transcribing} value={dictationSelection?.field || ''} onChange={event => selectDictationField(event.target.value)}>
        <option value="">Selecione o campo</option>
        {Object.entries(clinicalDictationFields).map(([field, label]) => <option key={field} value={field}>{label}</option>)}
      </select>
      {dictationSelection && <small className="voice-dictation-target" role="status">{clinicalDictationFields[dictationSelection.field]} · {dictationSelection.patientName} · rascunho {dictationSelection.sessionDraftId}</small>}
      <label htmlFor="voice-dictation-body">Trecho a acrescentar</label>
      <textarea id="voice-dictation-body" rows={3} value={dictationBody} onChange={event => {
        dictationGeneration.current++; setDictationBody(event.target.value); clearDictationProposal()
      }} />
      <div className="voice-command-actions">
        <button type="button" disabled={transcribing || !dictationSelection} onClick={prepareFieldDictation}>Preparar trecho</button>
        {onTranscribe && <button type="button" className="voice-command-secondary" disabled={transcribing || !dictationSelection} onClick={transcribeField}>
          {transcribing ? 'Ouvindo e transcrevendo aqui…' : '🎙 Ouvir e transcrever'}
        </button>}
        {result?.status === 'draft' && <>
          <button type="button" disabled={transcribing || !dictationSelection} onClick={() => void confirmFieldDictation()}>Confirmar acréscimo</button>
          <button type="button" className="voice-command-secondary" onClick={() => {
            clearDictationProposal(); setDictationSelection(null)
          }}>Descartar trecho</button>
        </>}
      </div>
    </> : <>
    <label htmlFor="voice-command-text">Seu comando</label>
    <textarea
      id="voice-command-text"
      rows={2}
      maxLength={VOICE_COMMAND_MAX_LENGTH}
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
    </>}
    {captureNotice && <p className="voice-command-preview" role="status" aria-live="polite">{captureNotice}</p>}
    {result?.status === 'clarification' && <p className="voice-command-error" role="status">{result.message}</p>}
    {result?.status === 'transcript' && !captureNotice && <p className="voice-command-preview" role="status" aria-live="polite">{result.message}</p>}
    {result?.status === 'draft' && <div className="voice-command-preview" role="status" aria-live="polite">
      <strong>Confira a proposta</strong>
      <p>{formatCentralCommandPreview(result)}</p>
      {(compact ? result.notes?.filter(note => /apenas nesta sessão|somente ao rascunho|mantido literalmente/.test(note)) : result.notes)?.map(note => <small key={note}>{note}</small>)}
      <small>{dictatingField ? 'Clique em Confirmar acréscimo para aplicar ao formulário. Depois use Salvar rascunho.' : onApply ? 'Diga “confirmar” para aplicar ou “cancelar comando” para descartar.' : 'Nada foi salvo nem alterado. Revise na tela correspondente.'}</small>
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
      <li>“Encerrar série de Ana Clara na segunda às quinze horas” apenas abre o formulário</li>
      <li>“Abrir detalhes de Ana Clara em quatro de outubro de dois mil e vinte e seis às quinze horas” apenas abre os detalhes após confirmar; não altera o compromisso nem inicia sessão</li>
      <li>“Preencher Nome com Ana Clara”</li>
      <li>“Preencher Data do compromisso com dez de outubro de 2026”</li>
      <li>“Preencher Horário inicial com três da tarde”</li>
      <li>“Limpar Nome” ou “Limpar Busca”</li>
      <li>“Selecionar Modalidade como Online”</li>
      <li>“Marcar Pede ajuda” ou “Desmarcar Pede ajuda” na sessão</li>
      <li>“Retirar comportamento Pede ajuda da sessão de Ana Clara”</li>
      <li>“Preencher Nota contextual de Regulação emocional com Participou com apoio” na sessão</li>
      <li>“Clicar em Salvar rascunho” ou “Finalizar sessão”</li>
    </ul><small>Use o texto do botão ou campo. Se houver opções iguais, acrescente o paciente. Senhas e escolhas de arquivos continuam nas janelas próprias.</small></>}</details>
  </section>
}

export default VoiceCommandCenter
