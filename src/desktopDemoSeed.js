import { invoke } from '@tauri-apps/api/core'
import { AGENDA_TIME_ZONE, addCivilDays, civilWeekday, currentCivilDate } from './calendarDate.js'

const patients = [
  { name: 'Exemplo Demo — Lia Fictícia', lifeCycle: 'Criança', age: 9, preferredModality: 'Presencial' },
  { name: 'Exemplo Demo — Caio Fictício', lifeCycle: 'Adolescente', age: 14, preferredModality: 'Online' },
  { name: 'Exemplo Demo — Bia Fictícia', lifeCycle: 'Adulto', age: 28, preferredModality: 'Presencial' },
]
const templates = [
  { title: 'Exemplo Demo — comunicação de necessidades', description: 'Modelo exclusivamente fictício: registrar pedidos claros durante atividade simulada.' },
  { title: 'Exemplo Demo — organização de rotina', description: 'Modelo exclusivamente fictício: observar etapas combinadas de uma rotina simulada.' },
]
// In-memory provenance only. A restarted process cannot authenticate a namesake
// patient, so it must refuse reuse instead of attaching demo data to that record.
const createdPatientIds = new Set()
const single = (items, label) => {
  if (items.length > 1) throw new Error(`Dados de demonstração ambíguos: ${label}. Nenhum registro existente será alterado.`)
  return items[0]
}
const sameSeriesSlot = (item, plan) => item.patientId === plan.patientId && item.frequency === plan.frequency && item.start === plan.start
const sameSeries = (item, plan, date) => sameSeriesSlot(item, plan)
  && item.startDate === date && item.weekday === civilWeekday(date)
  && item.end === plan.end && item.modality === plan.modality
  && item.endDate === (plan.frequency === 'Avulsa' ? date : null)
  && item.meetingLink == null
const draftFields = draft => ({
  observation: draft.observation || '', procedures: draft.procedures || '',
  outcomeDecision: draft.outcomeDecision || '', referralClosure: draft.referralClosure || null,
  behaviorIds: draft.behaviorIds || [], indicators: draft.indicators || [],
})
const emptyDraft = draft => Object.values(draftFields(draft)).every(value => value == null || value === '' || Array.isArray(value) && value.length === 0)

// Called only after the parent has confirmed the action and unlocked the vault.
export async function seedSyntheticDemo() {
  const status = await invoke('vault_status')
  if (!status?.unlocked) throw new Error('Desbloqueie o cofre antes de criar a demonstração.')
  const today = currentCivilDate(AGENDA_TIME_ZONE)
  const result = { synthetic: true, label: 'Dados exclusivamente fictícios — Exemplo Demo', patientIds: [], templateIds: [], seriesIds: [], sessionIds: [], created: { patients: 0, templates: 0, series: 0, sessions: 0 } }

  for (const spec of patients) {
    const listed = await invoke('patient_list', { includeArchived: true })
    let patient = single(listed.filter(item => item.name === spec.name), spec.name)
    if (patient && !createdPatientIds.has(patient.id)) throw new Error(`Paciente com nome de demonstração sem origem verificável: ${spec.name}. Nenhum registro será vinculado a ele.`)
    if (!patient) {
      patient = await invoke('patient_create', { input: { ...spec, birthDate: null, selfRequester: null } })
      createdPatientIds.add(patient.id)
      result.created.patients++
    }
    if (patient.archivedAt != null) throw new Error(`Paciente de demonstração arquivado: ${spec.name}.`)
    result.patientIds.push(patient.id)
  }

  for (const spec of templates) {
    const listed = await invoke('behavior_list')
    let template = single(listed.filter(item => item.title === spec.title), spec.title)
    if (template && template.description !== spec.description) throw new Error(`Modelo de demonstração divergente: ${spec.title}.`)
    if (!template) {
      template = await invoke('behavior_create', spec)
      result.created.templates++
    }
    result.templateIds.push(template.id)
  }

  const plans = [
    { patientId: result.patientIds[0], frequency: 'Semanal', start: '09:00', end: '09:50', modality: 'Presencial', offset: -28 },
    { patientId: result.patientIds[1], frequency: 'Semanal', start: '15:00', end: '15:50', modality: 'Online', offset: -27 },
    { patientId: result.patientIds[2], frequency: 'Avulsa', start: '11:00', end: '11:50', modality: 'Presencial', offset: 3 },
  ]
  const series = []
  for (const plan of plans) {
    const listed = await invoke('agenda_list_series')
    const date = addCivilDays(today, plan.offset)
    const slot = listed.filter(candidate => sameSeriesSlot(candidate, plan))
    const itemAtSlot = single(slot, `agenda ${plan.patientId}/${plan.start}`)
    // AgendaSeries has no demo marker. A later-day retry cannot prove ownership of a
    // shifted start date, so reject that slot instead of adopting or duplicating it.
    if (itemAtSlot && !sameSeries(itemAtSlot, plan, date)) throw new Error('Série existente divergente ou criada em outro dia. Sem marcador de origem no backend, a retentativa foi recusada para preservar compromissos existentes.')
    let item = itemAtSlot
    if (!item) {
      item = await invoke('agenda_create_series', { input: {
        patientId: plan.patientId, weekday: civilWeekday(date), start: plan.start, end: plan.end,
        frequency: plan.frequency, startDate: date, endDate: plan.frequency === 'Avulsa' ? date : null,
        modality: plan.modality, meetingLink: null,
      } })
      result.created.series++
    }
    series.push(item)
    result.seriesIds.push(item.id)
  }

  const catalog = await invoke('indicator_catalog')
  const indicators = catalog.filter(item => item.labels?.length >= 3).slice(0, 2)
  if (indicators.length < 2) throw new Error('Catálogo de indicadores insuficiente para a demonstração.')
  for (const item of series.slice(0, 2)) {
    const end = addCivilDays(item.startDate, 7)
    const occurrences = await invoke('agenda_occurrences', { from: item.startDate, to: end })
    for (const [step, date] of [item.startDate, end].entries()) {
      const occurrence = single(occurrences.filter(candidate => candidate.seriesId === item.id && candidate.originalDate === date), `ocorrência ${item.id}/${date}`)
      if (!occurrence) throw new Error(`Ocorrência de demonstração indisponível: ${date}.`)
      if (occurrence.status === 'completed' || occurrence.status === 'Realizada') {
        const timeline = await invoke('session_timeline', { patientId: item.patientId })
        const existing = single(timeline.filter(session => session.sessionDate === occurrence.date && session.start === item.start && session.observation?.startsWith('EXEMPLO DEMO —')), `sessão ${item.id}/${date}`)
        if (!existing) throw new Error('Ocorrência realizada sem identificação demo; a sessão existente será preservada.')
        result.sessionIds.push(existing.id)
        continue
      }
      const drafts = await invoke('session_draft_list', { patientId: item.patientId })
      let draft = single(drafts.filter(candidate => candidate.seriesId === item.id && candidate.originalDate === date), `rascunho ${item.id}/${date}`)
      const phase = step === 0 ? 'inicial' : 'seguimento'
      const input = {
        observation: `EXEMPLO DEMO — Sessão fictícia de ${phase}. Em atividade simulada, a pessoa identificou etapas da rotina e comunicou necessidades com ${step === 0 ? 'apoio frequente' : 'maior autonomia'}. Nenhum dado clínico real.`,
        procedures: 'EXEMPLO DEMO — Conversa guiada e atividade estruturada fictícias.',
        outcomeDecision: `EXEMPLO DEMO — ${step === 0 ? 'Combinar prática simulada para o próximo encontro.' : 'Registrar melhora ilustrativa e manter acompanhamento fictício.'}`,
        referralClosure: null,
        behaviorIds: result.templateIds,
        indicators: indicators.map(def => ({ id: def.id, value: Math.min(step + 1, def.labels.length - 1), note: 'EXEMPLO DEMO — valor ilustrativo, sem avaliação real.' })),
      }
      if (draft && !emptyDraft(draft) && JSON.stringify(draftFields(draft)) !== JSON.stringify(input)) throw new Error('Rascunho existente modificado; nenhuma informação será sobrescrita.')
      if (!draft) draft = await invoke('session_draft_start', { seriesId: item.id, originalDate: date })
      const saved = await invoke('session_draft_save', { id: draft.id, input })
      const session = await invoke('session_finalize', { id: saved.id })
      result.sessionIds.push(session.id)
      result.created.sessions++
    }
  }
  return result
}
