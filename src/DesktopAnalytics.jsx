import { useEffect, useRef, useState } from 'react'
import { entityOptionSuffix } from './voiceEntityLabels.js'
import { invoke } from '@tauri-apps/api/core'
import { AGENDA_TIME_ZONE, currentCivilDate } from './calendarDate.js'
import { inSupportedRange } from './analyticsRange.js'

const isoDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const todayInSaoPaulo = () => { const [year, month, day] = currentCivilDate(AGENDA_TIME_ZONE).split('-').map(Number); return new Date(year, month - 1, day) }
const monthStart = date => isoDate(new Date(date.getFullYear(), date.getMonth(), 1))
const monthEnd = date => isoDate(new Date(date.getFullYear(), date.getMonth() + 1, 0))
const labelDate = value => value?.split('-').reverse().join('/') || value
const labelMonth = value => { const [year, month] = value.split('-'); return `${month}/${year}` }
const behaviorLabel = (item, all) => {
  if (all.filter(other => other.title === item.title).length === 1) return item.title
  const shortId = item.templateId.slice(0, 8)
  const collides = all.some(other => other !== item && other.title === item.title && other.templateVersion === item.templateVersion && other.templateId.slice(0, 8) === shortId)
  return `${item.title} · v${item.templateVersion} · modelo ${collides ? item.templateId : shortId}`
}

function CountChart({ title, rows, label, empty }) {
  const max = Math.max(1, ...rows.map(item => item.count))
  return <section className="analytics-chart" aria-label={title}>
    <h3>{title}</h3>
    {rows.length ? <>
      <div className="analytics-bars" aria-hidden="true">{rows.map(item => <div key={item.key} className="analytics-bar-row"><span>{item.label}</span><div><i style={{ width: `${item.count ? Math.max(4, item.count / max * 100) : 0}%` }} /></div><strong>{item.count}</strong></div>)}</div>
      <table><caption>{title} em números</caption><thead><tr><th scope="col">{label}</th><th scope="col">Sessões</th></tr></thead><tbody>{rows.map(item => <tr key={item.key}><th scope="row">{item.label}</th><td>{item.count}</td></tr>)}</tbody></table>
    </> : <p>{empty}</p>}
  </section>
}

export default function DesktopAnalytics({ voiceRequest = null, onVoiceRequestApplied } = {}) {
  const [from, setFrom] = useState(() => voiceRequest?.from || monthStart(todayInSaoPaulo()))
  const [to, setTo] = useState(() => voiceRequest?.to || monthEnd(todayInSaoPaulo()))
  const [patientId, setPatientId] = useState(() => voiceRequest?.patientId || '')
  const [view, setView] = useState(() => voiceRequest?.view || 'month')
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState({ phase: 'loading' })
  const [patients, setPatients] = useState([])
  const requestKey = `${from}|${to}|${patientId}|${retry}`
  const appliedVoiceRequest = useRef('')

  useEffect(() => {
    if (!voiceRequest?.commandId || appliedVoiceRequest.current === voiceRequest.commandId || !inSupportedRange(voiceRequest.from, voiceRequest.to)) return
    const frame = window.requestAnimationFrame(() => {
      appliedVoiceRequest.current = voiceRequest.commandId
      setFrom(voiceRequest.from)
      setTo(voiceRequest.to)
      setPatientId(voiceRequest.patientId || '')
      setView(voiceRequest.view)
      onVoiceRequestApplied?.(voiceRequest.commandId)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [voiceRequest, onVoiceRequestApplied])

  useEffect(() => {
    let active = true
    invoke('patient_list', { includeArchived: true }).then(items => { if (active) setPatients(items) }).catch(() => { if (active) setPatients([]) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!inSupportedRange(from, to)) return
    let active = true
    invoke('analytics_overview', { from, to, patientId: patientId || null })
      .then(data => { if (active) setResult({ phase: 'ready', key: requestKey, data }) })
      .catch(() => { if (active) setResult({ phase: 'error', key: requestKey }) })
    return () => { active = false }
  }, [from, to, patientId, retry, requestKey])

  const chooseRange = next => {
    const date = todayInSaoPaulo()
    setView(next)
    if (next === 'day') { setFrom(isoDate(date)); setTo(isoDate(date)) }
    else if (next === 'year') { setFrom(monthStart(new Date(date.getFullYear(), date.getMonth() - 11, 1))); setTo(monthEnd(date)) }
    else { setFrom(monthStart(date)); setTo(monthEnd(date)) }
  }
  const valid = inSupportedRange(from, to)
  const phase = result.key === requestKey ? result.phase : 'loading'
  const data = phase === 'ready' ? result.data : null
  const daily = (data?.dailyCounts || []).map(item => ({ key: item.date, label: labelDate(item.date), count: item.count }))
  const monthly = (data?.monthlyCounts || []).map(item => ({ key: item.month, label: labelMonth(item.month), count: item.count }))
  const behaviors = data?.behaviorCounts || []
  const maxBehavior = Math.max(1, ...behaviors.map(item => item.occurrences))

  return <div className="desktop-analytics">
    <p className="analytics-intro">Um resumo das sessões finalizadas neste dispositivo.</p>
    <div className="analytics-filters" aria-label="Filtros de análises">
      <div className="analytics-presets" role="group" aria-label="Período rápido">{[['day', 'Hoje'], ['month', 'Este mês'], ['year', '12 meses']].map(([key, title]) => <button key={key} type="button" className="vault-secondary" aria-pressed={view === key} onClick={() => chooseRange(key)}>{title}</button>)}</div>
      <label>De <input type="date" value={from} onChange={event => { setView('custom'); setFrom(event.target.value) }} /></label>
      <label>Até <input type="date" value={to} onChange={event => { setView('custom'); setTo(event.target.value) }} /></label>
      <label>Paciente <select aria-label="Paciente" value={patientId} onChange={event => setPatientId(event.target.value)}><option value="">Todos os pacientes</option>{patients.map(item => <option key={item.id} value={item.id}>{item.name}{entityOptionSuffix(item, patients)}{item.archivedAt ? ' (arquivado)' : ''}</option>)}</select></label>
    </div>
    {!valid ? <p role="alert">Escolha um período válido, em ordem cronológica e de até cinco anos.</p> : phase === 'loading' ? <p role="status">Carregando análises…</p> : phase === 'error' ? <div role="alert"><p>Não foi possível carregar as análises. Seus dados não foram alterados.</p><button type="button" onClick={() => setRetry(value => value + 1)}>Tentar novamente</button></div> : <>
      <div className="analytics-summary"><section><span>Sessões finalizadas no período</span><strong>{data.totalCompletedSessions}</strong></section><section><span>Pacientes distintos</span><strong>{data.uniquePatients}</strong></section></div>
      {data.totalCompletedSessions === 0 && <p role="status" className="analytics-empty">Nenhuma sessão finalizada neste período. Ajuste as datas ou o paciente.</p>}
      <div className="analytics-grid">
        <CountChart title="Sessões por dia" rows={daily} label="Dia" empty="Sem sessões por dia neste período." />
        <CountChart title="Evolução mensal" rows={monthly} label="Mês" empty="Sem sessões por mês neste período." />
      </div>
      <section className="analytics-chart" aria-label="Comportamentos observados"><h3>Comportamentos observados</h3><p>Ocorrências = sessões finalizadas que contêm a observação. Não indicam traços estáveis nem diagnóstico.</p>{behaviors.length ? <><div className="analytics-bars" aria-hidden="true">{behaviors.map(item => <div key={`${item.templateId}-${item.templateVersion || ''}`} className="analytics-bar-row"><span>{behaviorLabel(item, behaviors)}</span><div><i style={{ width: `${item.occurrences ? Math.max(4, item.occurrences / maxBehavior * 100) : 0}%` }} /></div><strong>{item.occurrences}</strong></div>)}</div><table><caption>Comportamentos observados em números</caption><thead><tr><th scope="col">Observação</th><th scope="col">Sessões com observação</th><th scope="col">Pacientes distintos</th></tr></thead><tbody>{behaviors.map(item => <tr key={`${item.templateId}-${item.templateVersion || ''}`}><th scope="row">{behaviorLabel(item, behaviors)}</th><td>{item.occurrences}</td><td>{item.uniquePatients}</td></tr>)}</tbody></table></> : <p>Nenhuma observação neste período.</p>}</section>
    </>}
  </div>
}
