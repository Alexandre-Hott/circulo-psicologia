import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { AGENDA_TIME_ZONE, addCivilDays, civilMonthEnd, civilWeekday, currentCivilDate, formatCivilShortDate, isCivilDate, parseCivilDate } from './calendarDate.js'
import { parseVoiceAgendaCommand } from './voiceAgendaCommand.js'

const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const statusLabel = status => status === 'completed' ? 'Realizada' : status === 'scheduled' ? 'Agendada' : status
const datesBetween = (from, to) => {
  const dates = []
  for (let date = from; date <= to; date = addCivilDays(date, 1)) dates.push(date)
  return dates
}
const moveMonth = (date, delta) => {
  const { year, month, day } = parseCivilDate(date)
  const monthIndex = year * 12 + month - 1 + delta
  const nextYear = Math.floor(monthIndex / 12)
  const nextMonth = monthIndex % 12 + 1
  const first = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
  const lastDay = Number(civilMonthEnd(first).slice(8))
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
}

const emptyForm = (patients, day) => ({
  patientId: patients.find(patient => patient.archivedAt == null)?.id || '',
  weekday: civilWeekday(day), start: '14:00', end: '14:50', frequency: 'Semanal',
  startDate: day, endDate: '', modality: 'Presencial', meetingLink: '',
})

const rangeFor = (day, mode) => {
  if (mode === 'Dia') return [day, day]
  if (mode === 'Semana') {
    const start = addCivilDays(day, -civilWeekday(day))
    return [start, addCivilDays(start, 6)]
  }
  return [`${day.slice(0, 7)}-01`, civilMonthEnd(day)]
}

export default function DesktopAgenda({ patients, onChanged, onStartSession, onConfirm = async message => window.confirm(message), initialPatientId = '', voiceCommandDraft = null, onVoiceDraftApplied, voiceViewRequest = null, onVoiceViewApplied, voiceOccurrenceRequest = null, onVoiceOccurrenceApplied, startAvulsaSignal = 0, quickStart = false, onQuickStartConsumed }) {
  const [allPatients, setAllPatients] = useState(patients)
  const [day, setDay] = useState(() => currentCivilDate(AGENDA_TIME_ZONE))
  const [mode, setMode] = useState('Semana')
  const [series, setSeries] = useState([])
  const [occurrences, setOccurrences] = useState([])
  const [history, setHistory] = useState([])
  const [form, setForm] = useState(() => emptyForm(patients, currentCivilDate(AGENDA_TIME_ZONE)))
  const [appointmentType, setAppointmentType] = useState('Avulsa')
  const [createOpen, setCreateOpen] = useState(Boolean(initialPatientId || quickStart || startAvulsaSignal))
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [persistedOpen, setPersistedOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [focusedOccurrenceId, setFocusedOccurrenceId] = useState(null)
  useEffect(() => {
    if (!startAvulsaSignal) return
    const frame = window.requestAnimationFrame(() => { setAppointmentType('Avulsa'); setCreateOpen(true) })
    return () => window.cancelAnimationFrame(frame)
  }, [startAvulsaSignal])
  const [selected, setSelected] = useState(null)
  const [ending, setEnding] = useState(null)
  const [effectiveDate, setEffectiveDate] = useState('')
  const [action, setAction] = useState('remarcar')
  const [change, setChange] = useState({ date: '', start: '', end: '', reason: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [commandText, setCommandText] = useState('')
  const [commandReview, setCommandReview] = useState(null)
  const [commandError, setCommandError] = useState('')
  const [loadedRange, setLoadedRange] = useState('')
  const selectedFormRef = useRef(null)
  const createFormRef = useRef(null)
  const originButtonRef = useRef(null)
  const detailOriginRef = useRef(null)
  const calendarRef = useRef(null)
  const requestIdRef = useRef(0)
  const currentRangeRef = useRef('')
  const appliedInitialPatientEntryRef = useRef('')
  const appliedVoiceCommandRef = useRef('')
  const appliedVoiceViewRef = useRef('')
  const appliedVoiceOccurrenceRef = useRef('')

  useEffect(() => {
    if (!voiceViewRequest?.commandId || appliedVoiceViewRef.current === voiceViewRequest.commandId) return
    const modes = { day: 'Dia', week: 'Semana', month: 'Mês' }
    if (!modes[voiceViewRequest.view] || !isCivilDate(voiceViewRequest.referenceDate)) return
    const frame = window.requestAnimationFrame(() => {
      appliedVoiceViewRef.current = voiceViewRequest.commandId
      setDay(voiceViewRequest.referenceDate)
      setMode(modes[voiceViewRequest.view])
      onVoiceViewApplied?.(voiceViewRequest.commandId)
      calendarRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [voiceViewRequest, onVoiceViewApplied])

  useEffect(() => {
    if (!initialPatientId) {
      appliedInitialPatientEntryRef.current = ''
      return
    }
    const entryKey = `${initialPatientId}:${startAvulsaSignal}`
    if (appliedInitialPatientEntryRef.current === entryKey) return
    if (![...patients, ...allPatients].some(patient => patient.id === initialPatientId && patient.archivedAt == null)) return
    const frame = window.requestAnimationFrame(() => {
      appliedInitialPatientEntryRef.current = entryKey
      setForm(current => ({ ...current, patientId: initialPatientId }))
      setAppointmentType('Avulsa')
      setCreateOpen(true)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [initialPatientId, startAvulsaSignal, patients, allPatients])

  useEffect(() => {
    const commandDraft = voiceCommandDraft
    if (!commandDraft?.commandId || appliedVoiceCommandRef.current === commandDraft.commandId) return
    const frame = window.requestAnimationFrame(() => {
      if (appliedVoiceCommandRef.current === commandDraft.commandId) return
      appliedVoiceCommandRef.current = commandDraft.commandId
      setForm(current => ({
        ...current,
        patientId: commandDraft.patientId || '',
        ...(commandDraft.weekday !== undefined ? { weekday: commandDraft.weekday } : {}),
        ...(commandDraft.frequency !== undefined ? { frequency: commandDraft.frequency } : {}),
        startDate: commandDraft.startDate || '',
        endDate: commandDraft.endDate || '',
        start: commandDraft.start || '',
        end: commandDraft.end || '',
        modality: commandDraft.modality,
        meetingLink: commandDraft.meetingLink || '',
      }))
      setAppointmentType(commandDraft.appointmentType === 'Avulsa' ? 'Avulsa' : 'Recorrente')
      setCreateOpen(true)
      if (isCivilDate(commandDraft.startDate)) setDay(commandDraft.startDate)
      setCommandReview(null)
      setCommandError('')
      onVoiceDraftApplied?.(commandDraft.commandId)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [voiceCommandDraft, onVoiceDraftApplied])

  const [from, to] = rangeFor(day, mode)
  const rangeKey = `${from}|${to}`
  useLayoutEffect(() => { currentRangeRef.current = rangeKey }, [rangeKey])
  const loaded = loadedRange === rangeKey
  const visibleDates = datesBetween(from, to)
  const sortedOccurrences = [...occurrences].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.id.localeCompare(b.id))
  const occurrencesFor = date => sortedOccurrences.filter(occurrence => occurrence.date === date)
  const movePeriod = delta => setDay(current => mode === 'Dia' ? addCivilDays(current, delta) : mode === 'Semana' ? addCivilDays(current, delta * 7) : moveMonth(current, delta))
  const showOccurrenceActions = (occurrence, origin) => {
    detailOriginRef.current = origin || null
    setFocusedOccurrenceId(occurrence.id)
    setDetailsOpen(true)
  }
  const closeDetails = () => {
    if (selected) return
    setDetailsOpen(false)
    window.requestAnimationFrame(() => (detailOriginRef.current?.isConnected ? detailOriginRef.current : calendarRef.current)?.focus({ preventScroll: false }))
  }
  useEffect(() => {
    if (!detailsOpen) return
    const frame = window.requestAnimationFrame(() => {
      const card = focusedOccurrenceId ? document.getElementById(`agenda-detail-${focusedOccurrenceId}`) : document.querySelector('#agenda-details-panel .agenda-detail-list li')
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      card?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [detailsOpen, focusedOccurrenceId, mode, loadedRange])
  useEffect(() => {
    if (!selected) return
    const frame = window.requestAnimationFrame(() => {
      selectedFormRef.current?.focus({ preventScroll: true })
      selectedFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [selected])
  const closeSelected = () => {
    setSelected(null)
    window.requestAnimationFrame(() => {
      const target = originButtonRef.current?.isConnected ? originButtonRef.current : calendarRef.current
      target?.focus({ preventScroll: false })
    })
  }
  const load = async (rangeStart = from, rangeEnd = to) => {
    const requestId = ++requestIdRef.current
    const requestedRange = `${rangeStart}|${rangeEnd}`
    const [nextSeries, nextOccurrences, nextHistory] = await Promise.all([
      invoke('agenda_list_series'), invoke('agenda_occurrences', { from: rangeStart, to: rangeEnd }), invoke('agenda_history'),
    ])
    if (requestId !== requestIdRef.current || requestedRange !== currentRangeRef.current) return
    setSeries(nextSeries); setOccurrences(nextOccurrences); setHistory(nextHistory); setLoadedRange(requestedRange)
  }

  useEffect(() => {
    const requestId = ++requestIdRef.current
    let active = true
    Promise.all([invoke('agenda_list_series'), invoke('agenda_occurrences', { from, to }), invoke('agenda_history')])
      .then(([nextSeries, nextOccurrences, nextHistory]) => {
        if (!active || requestId !== requestIdRef.current || `${from}|${to}` !== currentRangeRef.current) return
        setSeries(nextSeries); setOccurrences(nextOccurrences); setHistory(nextHistory); setLoadedRange(`${from}|${to}`)
      }).catch(reason => { if (active && requestId === requestIdRef.current && `${from}|${to}` === currentRangeRef.current) setError(String(reason)) })
    return () => { active = false }
  }, [from, to])

  useEffect(() => {
    let active = true
    invoke('patient_list', { includeArchived: true }).then(nextPatients => {
      if (!active) return
      setAllPatients(nextPatients)
      setForm(current => nextPatients.some(patient => patient.id === current.patientId && patient.archivedAt == null)
        ? current
        : { ...current, patientId: nextPatients.find(patient => patient.archivedAt == null)?.id || '' })
    }).catch(reason => { if (active) setError(String(reason)) })
    return () => { active = false }
  }, [patients])

  const create = async event => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      const input = { ...form, weekday: appointmentType === 'Avulsa' ? civilWeekday(form.startDate) : Number(form.weekday), frequency: appointmentType === 'Avulsa' ? 'Avulsa' : form.frequency, endDate: appointmentType === 'Avulsa' ? form.startDate : form.endDate || null, meetingLink: form.modality === 'Online' ? form.meetingLink.trim() || null : null }
      const created = await invoke('agenda_create_series', { input })
      const startNow = quickStart && appointmentType === 'Avulsa'
      if (startNow) onQuickStartConsumed?.()
      await onChanged()
      setMessage(appointmentType === 'Avulsa' ? 'Compromisso avulso salvo no cofre cifrado.' : 'Série recorrente salva no cofre cifrado.')
      if (appointmentType === 'Avulsa') setDay(form.startDate)
      setForm(emptyForm(patients, input.startDate))
      setCommandReview(null)
      setCommandText('')
      await load(...rangeFor(input.startDate, mode))
      if (startNow) {
        const started = await onStartSession({ seriesId: created.id, originalDate: input.startDate })
        if (!started) setMessage('Compromisso criado, mas a sessão não iniciou. Use Iniciar sessão no compromisso exibido abaixo.')
      }
    } catch (reason) { setError(String(reason)) }
    finally { setBusy(false) }
  }

  const selectOccurrence = (occurrence, originButton) => {
    originButtonRef.current = originButton
    setDetailsOpen(true)
    setSelected(occurrence); setAction('remarcar')
    setChange({ date: occurrence.date, start: occurrence.start, end: occurrence.end, reason: '' })
    setError(''); setMessage('')
  }

  useEffect(() => {
    if (!voiceOccurrenceRequest?.commandId || appliedVoiceOccurrenceRef.current === voiceOccurrenceRequest.commandId) return
    const { occurrence, action, commandId } = voiceOccurrenceRequest
    if (!occurrence || !['remarcar', 'cancelar'].includes(action)) return
    const frame = window.requestAnimationFrame(() => {
      appliedVoiceOccurrenceRef.current = commandId
      setDay(occurrence.date)
      setMode('Dia')
      selectOccurrence(occurrence, calendarRef.current)
      setAction(action)
      onVoiceOccurrenceApplied?.(commandId)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [voiceOccurrenceRequest, onVoiceOccurrenceApplied])

  const applyChange = async event => {
    event.preventDefault()
    if (!selected) return
    if (selected.frequency === 'Avulsa' && !change.reason.trim()) { setError('Informe um motivo administrativo para alterar o compromisso avulso.'); return }
    const detail = `${selected.originalDate} da série ${selected.seriesId} para ${selected.patientId}`
    if (!await onConfirm(action === 'cancelar' ? `Cancelar explicitamente a ocorrência original ${detail}?` : `Remarcar apenas a ocorrência original ${detail} para ${change.date} às ${change.start}–${change.end}?`)) return
    setBusy(true); setError(''); setMessage('')
    try {
      if (action === 'cancelar') await invoke('agenda_cancel', { seriesId: selected.seriesId, originalDate: selected.originalDate, reason: change.reason })
      else await invoke('agenda_reschedule', { seriesId: selected.seriesId, originalDate: selected.originalDate, input: { date: change.date, start: change.start, end: change.end, reason: change.reason || null } })
      await onChanged()
      closeSelected()
      setMessage(action === 'cancelar' ? 'Ocorrência cancelada; histórico mantido.' : 'Ocorrência individual remarcada; data original preservada.')
      await load()
    } catch (reason) { setError(String(reason)) }
    finally { setBusy(false) }
  }

  const patientName = id => allPatients.find(patient => patient.id === id)?.name || 'Paciente não encontrado'
  const endSeries = async event => {
    event.preventDefault()
    if (!ending || !isCivilDate(effectiveDate)) return
    if (!await onConfirm(`Encerrar a série ${ending.id} de ${patientName(ending.patientId)} a partir de ${effectiveDate}? O histórico será preservado; remarcações ainda ativas após essa data impedirão o encerramento.`)) return
    setBusy(true); setError(''); setMessage('')
    try {
      await invoke('agenda_end_series', { seriesId: ending.id, effectiveDate })
      await onChanged()
      setEnding(null)
      setMessage(`Série encerrada a partir de ${effectiveDate}; histórico preservado.`)
      await load()
    } catch (reason) { setError(String(reason)) }
    finally { setBusy(false) }
  }
  const seriesPatient = id => series.find(item => item.id === id)?.patientId
  const activePatients = allPatients.filter(patient => patient.archivedAt == null)
  const interpretCommand = text => {
    const parsed = parseVoiceAgendaCommand({ text, patients: activePatients, referenceDate: currentCivilDate(AGENDA_TIME_ZONE) })
    if (parsed.intent !== 'create') {
      setCommandError(parsed.intent === 'error' ? parsed.error : 'Comando não reconhecido. Use “marcar” ou “adicionar” com paciente, data ou dia da semana e horário.')
      setCommandReview(null)
      return
    }
    if (quickStart && parsed.appointmentType !== 'Avulsa') {
      setCommandError('Este atalho inicia apenas compromissos avulsos. Abra a Agenda normalmente para criar uma série.')
      setCommandReview(null)
      return
    }
    setForm(current => ({
      ...current,
      patientId: parsed.patientId || '',
      weekday: parsed.appointmentType === 'Recorrente' ? parsed.weekday ?? '' : current.weekday,
      start: parsed.start || '', end: parsed.end || '',
      startDate: parsed.missing.includes('date') ? '' : parsed.startDate,
      endDate: '', frequency: 'Semanal', modality: 'Presencial', meetingLink: '',
    }))
    setAppointmentType(parsed.appointmentType)
    setCreateOpen(true)
    setCommandReview(parsed)
    setCommandError('')
  }
  const missingLabels = { patient: 'paciente', weekday: 'dia da semana', date: 'data', time: 'horário' }
  const focusedOccurrence = sortedOccurrences.find(item => item.id === focusedOccurrenceId)
  const detailOccurrences = focusedOccurrence ? [focusedOccurrence] : sortedOccurrences

  return <section className="vault-agenda" aria-label="Agenda persistente de sessões">
    <h2>Agenda de sessões</h2>
    <p className="agenda-intro">Organização de horários. Fuso civil: {AGENDA_TIME_ZONE}. O início de sessão cria um rascunho no cofre; não abre chamada online.</p>
    {error && <p role="alert" className="vault-error">{error}</p>}
    {message && <p role="status" className="vault-ok">{message}</p>}
    <button type="button" className="vault-secondary agenda-create-jump" onClick={() => { setCreateOpen(true); window.requestAnimationFrame(() => { createFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); createFormRef.current?.focus({ preventScroll: true }) }) }}>Novo compromisso</button>
    <div className="vault-agenda-controls"><h3>Calendário</h3><div className="agenda-mode-switch" role="group" aria-label="Visualização da Agenda">{['Dia', 'Semana', 'Mês'].map(value => <button key={value} type="button" className={mode === value ? '' : 'vault-secondary'} aria-pressed={mode === value} onClick={() => setMode(value)}>{value}</button>)}</div><div className="agenda-navigation"><button type="button" className="vault-secondary" onClick={() => movePeriod(-1)}>Anterior</button><button type="button" className="vault-secondary" onClick={() => setDay(currentCivilDate(AGENDA_TIME_ZONE))}>Hoje</button><button type="button" className="vault-secondary" onClick={() => movePeriod(1)}>Próximo</button></div><label htmlFor="agenda-day">Data de referência</label><input id="agenda-day" type="date" value={day} onChange={event => { if (isCivilDate(event.target.value)) setDay(event.target.value) }} /><p aria-live="polite">{from} a {to}</p></div>
    <div ref={calendarRef} className="agenda-calendar" role="region" tabIndex={0} aria-label={`Calendário ${mode.toLowerCase()}`}>
      {!loaded ? <p role="status">Carregando Agenda...</p> : mode === 'Mês' ? <div className="agenda-month-grid">
        {weekDays.map(name => <div className="agenda-weekday" key={name}>{name}</div>)}
        {datesBetween(addCivilDays(from, -civilWeekday(from)), addCivilDays(to, 6 - civilWeekday(to))).map(date => {
          const inside = date >= from && date <= to
          return <div className={`agenda-month-day${inside ? '' : ' outside'}${date === day ? ' selected' : ''}`} key={date}>
            <button type="button" className="agenda-date-button" onClick={() => { setDay(date); setMode('Dia') }} aria-label={`Ver dia ${date}`} aria-current={date === day ? 'date' : undefined}><time dateTime={date}>{formatCivilShortDate(date)}</time></button>
            {inside && occurrencesFor(date).map(occurrence => <button type="button" className={`agenda-event-chip ${occurrence.status === 'completed' ? 'completed' : ''}`} key={occurrence.id} onClick={event => showOccurrenceActions(occurrence, event.currentTarget)} data-voice-action={`agenda:details:${occurrence.id}`} aria-label={`Ver ações de ${patientName(occurrence.patientId)} em ${occurrence.date} às ${occurrence.start}–${occurrence.end}`}><span>{occurrence.start} {patientName(occurrence.patientId)}</span>{(occurrence.wasRescheduled || occurrence.status === 'completed') && <small>{occurrence.wasRescheduled ? 'Remarcada' : statusLabel(occurrence.status)}</small>}</button>)}
          </div>
        })}
      </div> : mode === 'Semana' ? <div className="agenda-time-grid week-view agenda-week-compact">
        {visibleDates.map(date => {
          const appointments = occurrencesFor(date)
          return <div className="agenda-time-day" key={date}>
            <button type="button" className="agenda-time-heading" onClick={() => { setDay(date); setMode('Dia') }} aria-current={date === day ? 'date' : undefined}>{weekDays[civilWeekday(date)]} <time dateTime={date}>{formatCivilShortDate(date)}</time></button>
            <div className="agenda-week-appointments">
              {appointments.length ? appointments.map(occurrence => <button type="button" className={`agenda-time-event agenda-week-event ${occurrence.status === 'completed' ? 'completed' : ''}`} key={occurrence.id} onClick={event => showOccurrenceActions(occurrence, event.currentTarget)} data-voice-action={`agenda:details:${occurrence.id}`} aria-label={`Ver ações de ${patientName(occurrence.patientId)} em ${occurrence.date} às ${occurrence.start}–${occurrence.end}`}><strong>{occurrence.start}–{occurrence.end}</strong><span>{patientName(occurrence.patientId)}</span>{(occurrence.wasRescheduled || occurrence.status === 'completed') && <small>{occurrence.wasRescheduled ? 'Remarcada' : statusLabel(occurrence.status)}</small>}</button>) : <p className="agenda-week-empty">Sem compromissos</p>}
            </div>
          </div>
        })}
      </div> : <div className="agenda-day-compact">
        {visibleDates.map(date => <div className="agenda-time-day" key={date}>
          <button type="button" className="agenda-time-heading" onClick={() => { setDay(date); setMode('Dia') }} aria-current={date === day ? 'date' : undefined}>{weekDays[civilWeekday(date)]} <time dateTime={date}>{formatCivilShortDate(date)}</time></button>
          {occurrencesFor(date).length > 0 && <ol className="agenda-day-list">{occurrencesFor(date).map(occurrence => <li key={occurrence.id} id={`agenda-occurrence-${occurrence.id}`} tabIndex={-1}>
            <div className="agenda-day-summary"><strong>{occurrence.start}–{occurrence.end}</strong><span>{patientName(occurrence.patientId)}</span><small>{statusLabel(occurrence.status)}{occurrence.wasRescheduled ? ' · Remarcada' : ''} · {occurrence.modality}</small></div>
            <div className="agenda-day-actions"><button type="button" className="vault-secondary" data-voice-action={`agenda:details:${occurrence.id}`} aria-label={`Ver ações de ${patientName(occurrence.patientId)} em ${occurrence.date} às ${occurrence.start}–${occurrence.end}`} onClick={event => showOccurrenceActions(occurrence, event.currentTarget)}>Detalhes</button>{occurrence.status !== 'completed' && <button disabled={busy} className="vault-secondary" type="button" data-voice-action={`agenda:edit:${occurrence.id}`} aria-label={`Alterar ocorrência de ${patientName(occurrence.patientId)} em ${occurrence.date} às ${occurrence.start}–${occurrence.end}`} onClick={event => selectOccurrence(occurrence, event.currentTarget)}>Alterar</button>}{occurrence.status !== 'completed' && allPatients.some(patient => patient.id === occurrence.patientId && patient.archivedAt == null) && <button disabled={busy} type="button" data-voice-action={`agenda:start:${occurrence.id}`} aria-label={`Iniciar sessão de ${patientName(occurrence.patientId)} em ${occurrence.date} às ${occurrence.start}–${occurrence.end}`} onClick={() => onStartSession(occurrence)}>Iniciar sessão</button>}</div>
          </li>)}</ol>}
        </div>)}
      </div>}
      {loaded && !sortedOccurrences.length && <p className="agenda-empty">Nenhum compromisso neste período.</p>}
    </div>
    <section className="agenda-drawer" aria-label="Novo compromisso"><button type="button" className="agenda-drawer-toggle" data-voice-label={createOpen ? 'Recolher novo compromisso' : 'Abrir formulário de novo compromisso'} aria-expanded={createOpen} aria-controls="agenda-create-panel" onClick={() => setCreateOpen(value => !value)}>Novo compromisso <span aria-hidden="true">{createOpen ? '▾' : '▸'}</span></button>{createOpen && <div id="agenda-create-panel"><form ref={createFormRef} tabIndex={-1} onSubmit={create} aria-label="Novo compromisso">
      <h3>Novo compromisso</h3><p>Recolher ou trocar de espaço mantém este rascunho enquanto o aplicativo estiver aberto. Salve antes de bloquear ou fechar.</p>
      <section className="agenda-command" aria-label="Comando de agendamento"><h4>Preencher por comando</h4><p>Para preparar por voz, use o assistente na tela inicial. O pedido é revisado aqui antes de salvar.</p><label htmlFor="agenda-command-text">Comando de agendamento</label><input id="agenda-command-text" type="text" value={commandText} onChange={event => setCommandText(event.target.value)} placeholder="Ex.: marcar semanal para Ana na quinta às 15" /><div className="agenda-command-actions"><button type="button" className="vault-secondary" onClick={() => interpretCommand(commandText)}>Interpretar comando</button></div>{commandError && <p role="alert" className="vault-error">{commandError}</p>}{commandReview && <div className="agenda-command-review" role="status"><strong>Confira antes de salvar</strong><p>{commandReview.appointmentType} · {commandReview.startDate}{commandReview.start ? ` · ${commandReview.start}–${commandReview.end}` : ''} · Presencial</p>{commandReview.missing.length > 0 && <p>Complete no formulário: {commandReview.missing.map(item => missingLabels[item]).join(', ')}.</p>}{commandReview.timeAmbiguous && <p>Horário de 1 a 12 é ambíguo. Diga manhã, tarde ou noite, ou informe no formato de 24 horas.</p>}{commandReview.ambiguousPatients.length > 0 && <div><p>Mais de um paciente com esse nome. Escolha o cadastro correto:</p>{commandReview.ambiguousPatients.map(candidate => <button key={candidate.id} type="button" className="vault-secondary" onClick={() => { setForm(current => ({ ...current, patientId: candidate.id })); setCommandReview(current => ({ ...current, patientId: candidate.id, missing: current.missing.filter(item => item !== 'patient') })) }}>{candidate.name} · ID {candidate.id}</button>)}</div>}<p>O comando apenas preencheu os campos. Revise e use o botão de criação para salvar.</p></div>}</section>
      <label htmlFor="agenda-type">Tipo</label><select id="agenda-type" disabled={quickStart} value={appointmentType} onChange={event => setAppointmentType(event.target.value)}><option>Avulsa</option><option>Recorrente</option></select>
      <label htmlFor="agenda-patient">Paciente</label><select id="agenda-patient" required value={form.patientId} onChange={event => setForm({ ...form, patientId: event.target.value })}><option value="">Selecione</option>{activePatients.map(patient => <option key={patient.id} value={patient.id}>{patient.name}</option>)}</select>
      {appointmentType === 'Recorrente' && <><label htmlFor="agenda-weekday">Dia da semana</label><select id="agenda-weekday" required value={form.weekday} onChange={event => setForm({ ...form, weekday: event.target.value === '' ? '' : Number(event.target.value) })}><option value="">Selecione</option>{['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map((label, index) => <option value={index} key={label}>{label}</option>)}</select><label htmlFor="agenda-frequency">Frequência</label><select id="agenda-frequency" value={form.frequency} onChange={event => setForm({ ...form, frequency: event.target.value })}><option>Semanal</option><option>Quinzenal</option></select></>}
      <label htmlFor="agenda-start-date">{appointmentType === 'Avulsa' ? 'Data do compromisso' : 'Início da série'}</label><input id="agenda-start-date" type="date" required value={form.startDate} onChange={event => setForm({ ...form, startDate: event.target.value })} />
      {appointmentType === 'Recorrente' && <><label htmlFor="agenda-end-date">Término opcional (inclusivo)</label><input id="agenda-end-date" type="date" value={form.endDate} onChange={event => setForm({ ...form, endDate: event.target.value })} /></>}
      <label htmlFor="agenda-start-time">Horário inicial</label><input id="agenda-start-time" type="time" required value={form.start} onChange={event => setForm({ ...form, start: event.target.value })} />
      <label htmlFor="agenda-end-time">Horário final</label><input id="agenda-end-time" type="time" required value={form.end} onChange={event => setForm({ ...form, end: event.target.value })} />
      <label htmlFor="agenda-modality">Modalidade</label><select id="agenda-modality" value={form.modality} onChange={event => setForm({ ...form, modality: event.target.value, meetingLink: event.target.value === 'Presencial' ? '' : form.meetingLink })}><option>Presencial</option><option>Online</option></select>
      {form.modality === 'Online' && <><label htmlFor="agenda-link">Referência online opcional (somente texto)</label><input id="agenda-link" type="url" value={form.meetingLink} onChange={event => setForm({ ...form, meetingLink: event.target.value })} /></>}
      <button type="submit" disabled={busy || !activePatients.length}>{quickStart ? 'Criar e iniciar sessão' : appointmentType === 'Avulsa' ? 'Criar compromisso avulso' : 'Criar série'}</button>
    </form></div>}</section>
    {(selected || (loaded && sortedOccurrences.length > 0)) && <section className="agenda-drawer agenda-occurrence-details" aria-label="Detalhes e ações dos compromissos"><button type="button" className="agenda-drawer-toggle" aria-expanded={detailsOpen} aria-controls="agenda-details-panel" disabled={Boolean(selected)} onClick={event => { if (detailsOpen) closeDetails(); else { detailOriginRef.current = event.currentTarget; setFocusedOccurrenceId(null); setDetailsOpen(true) } }}>Detalhes e ações <span aria-hidden="true">{detailsOpen ? '▾' : '▸'}</span></button>{detailsOpen && <div id="agenda-details-panel"><ul className="vault-patients agenda-detail-list">{detailOccurrences.map(occurrence => <li key={occurrence.id} id={`agenda-detail-${occurrence.id}`} tabIndex={-1}><strong>{patientName(occurrence.patientId)}</strong><span>{occurrence.date} · {occurrence.start}–{occurrence.end}</span><small>{statusLabel(occurrence.status)} · {occurrence.modality}{occurrence.wasRescheduled ? ' · Remarcada' : ''}</small>{occurrence.originalDate !== occurrence.date && <small>Data original: {occurrence.originalDate}</small>}{occurrence.modality === 'Online' && occurrence.meetingLink && <small>Referência online (texto): {occurrence.meetingLink}</small>}<div className="agenda-detail-actions">{occurrence.status !== 'completed' && <button disabled={busy} className="vault-secondary" type="button" data-voice-action={`agenda:edit:${occurrence.id}`} aria-label={`Alterar ocorrência de ${patientName(occurrence.patientId)} em ${occurrence.date} às ${occurrence.start}–${occurrence.end}`} onClick={event => selectOccurrence(occurrence, event.currentTarget)}>Alterar</button>}{occurrence.status !== 'completed' && allPatients.some(patient => patient.id === occurrence.patientId && patient.archivedAt == null) && <button disabled={busy} type="button" data-voice-action={`agenda:start:${occurrence.id}`} aria-label={`Iniciar sessão de ${patientName(occurrence.patientId)} em ${occurrence.date} às ${occurrence.start}–${occurrence.end}`} onClick={() => onStartSession(occurrence)}>Iniciar sessão</button>}</div></li>)}</ul><button type="button" className="vault-secondary" disabled={Boolean(selected)} onClick={closeDetails}>Fechar detalhes</button></div>}</section>}
    {selected && <form data-voice-record={`${selected.seriesId}:${selected.originalDate}`} ref={selectedFormRef} tabIndex={-1} onSubmit={applyChange} aria-label="Alterar ocorrência individual"><h3>Ocorrência selecionada</h3><p>{patientName(selected.patientId)} · série {selected.seriesId} · original {selected.originalDate} · efetiva {selected.date} às {selected.start}–{selected.end}</p><label htmlFor="agenda-action">Ação explícita</label><select id="agenda-action" value={action} onChange={event => setAction(event.target.value)}><option value="remarcar">Remarcar somente esta ocorrência</option><option value="cancelar">Cancelar esta ocorrência</option></select>{action === 'remarcar' && <><label htmlFor="agenda-new-date">Nova data efetiva</label><input id="agenda-new-date" type="date" required value={change.date} onChange={event => setChange({ ...change, date: event.target.value })} /><label htmlFor="agenda-new-start">Novo início</label><input id="agenda-new-start" type="time" required value={change.start} onChange={event => setChange({ ...change, start: event.target.value })} /><label htmlFor="agenda-new-end">Novo fim</label><input id="agenda-new-end" type="time" required value={change.end} onChange={event => setChange({ ...change, end: event.target.value })} /></>}<label htmlFor="agenda-reason">Motivo administrativo {action === 'cancelar' ? '(obrigatório)' : '(opcional)'}</label><textarea id="agenda-reason" maxLength={240} required={action === 'cancelar'} value={change.reason} onChange={event => setChange({ ...change, reason: event.target.value })} /><p>Não inclua conteúdo clínico no motivo. O histórico administrativo preserva ações anteriores.</p><button disabled={busy} type="submit">Confirmar {action === 'cancelar' ? 'cancelamento' : 'remarcação individual'}</button><button className="vault-secondary" type="button" onClick={closeSelected}>Fechar</button></form>}
    <section className="agenda-drawer agenda-admin-section" aria-label="Compromissos persistidos"><button type="button" className="agenda-drawer-toggle" aria-expanded={persistedOpen} aria-controls="agenda-persisted-panel" disabled={Boolean(ending)} onClick={() => setPersistedOpen(value => !value)}>Compromissos persistidos <span aria-hidden="true">{persistedOpen ? '▾' : '▸'}</span></button>{persistedOpen && <div id="agenda-persisted-panel">{series.length ? <ul className="vault-patients">{series.map(item => <li key={item.id}>{patientName(item.patientId)} · {item.frequency} · {item.start}–{item.end} · {item.startDate}{item.frequency !== 'Avulsa' && (item.endDate ? item.endDate < item.startDate ? ` · encerrada antes do início (${item.endDate})` : ` a ${item.endDate}` : ' sem término')}<small>{item.modality}</small>{item.frequency !== 'Avulsa' && (!item.endDate || item.endDate >= currentCivilDate(AGENDA_TIME_ZONE)) && <button type="button" disabled={busy} className="vault-secondary" aria-label={`Encerrar série de ${patientName(item.patientId)} · série ${item.id}`} onClick={() => { setEnding(item); setEffectiveDate(currentCivilDate(AGENDA_TIME_ZONE)); setError(''); setMessage('') }}>{item.endDate ? 'Antecipar término' : 'Encerrar série'}</button>}</li>)}</ul> : <p>Nenhum compromisso cadastrado.</p>}</div>}</section>
    {ending && <form onSubmit={endSeries} aria-label="Encerrar série recorrente"><h3>Encerrar série de {patientName(ending.patientId)} · {ending.id}</h3><p>Escolha a primeira data original que deixará de gerar ocorrências, inclusive antes do início da série. Sessões, rascunhos e alterações individuais nessa data ou depois impedem o encerramento. Uma ocorrência anterior remarcada para depois do corte também impede a ação. Histórico permanece.</p><label htmlFor="agenda-effective-date">Primeira data excluída</label><input id="agenda-effective-date" type="date" required min={currentCivilDate(AGENDA_TIME_ZONE)} max={ending.endDate || undefined} value={effectiveDate} onChange={event => setEffectiveDate(event.target.value)} /><button type="submit" disabled={busy}>Confirmar encerramento</button><button type="button" className="vault-secondary" onClick={() => setEnding(null)}>Voltar</button></form>}
    <section className="agenda-drawer agenda-admin-section" aria-label="Histórico administrativo"><button type="button" className="agenda-drawer-toggle" aria-expanded={historyOpen} aria-controls="agenda-history-panel" onClick={() => setHistoryOpen(value => !value)}>Histórico administrativo <span aria-hidden="true">{historyOpen ? '▾' : '▸'}</span></button>{historyOpen && <div id="agenda-history-panel">{history.length ? <ul className="vault-patients">{history.map(item => <li key={item.id}>{patientName(seriesPatient(item.seriesId))} · {item.action} · original {item.originalDate}{item.effectiveDate ? ` → ${item.effectiveDate} ${item.start}–${item.end}` : ''}{item.reason && <small>Motivo administrativo: {item.reason}</small>}</li>)}</ul> : <p>Nenhuma ação registrada.</p>}</div>}</section>
    <p className="vault-warning">Cancelamentos permanecem no histórico e não podem ser desfeitos por aqui.</p>
  </section>
}



