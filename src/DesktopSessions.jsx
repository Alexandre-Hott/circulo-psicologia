import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { groupIndicatorHistory } from './desktopIndicatorEvolution.js'
import './DesktopSessions.css'

export default function DesktopSessions({ ref, patientId, onPatientChange, activeDraft, voiceCommandDraft = null, onVoiceDraftApplied, onDraftChange, onChanged, onSessionMessage, onStartRecord, onConfirm = async message => window.confirm(message) }) {
  const [patients, setPatients] = useState([])
  const [templates, setTemplates] = useState([])
  const [indicatorCatalog, setIndicatorCatalog] = useState([])
  const [drafts, setDrafts] = useState([])
  const [timeline, setTimeline] = useState([])
  const [addenda, setAddenda] = useState([])
  const [caseContexts, setCaseContexts] = useState([])
  const [caseDemand, setCaseDemand] = useState('')
  const [caseObjectives, setCaseObjectives] = useState('')
  const [addendumSessionId, setAddendumSessionId] = useState('')
  const [addendumContent, setAddendumContent] = useState('')
  const [loadedPatientId, setLoadedPatientId] = useState('')
  const [observation, setObservation] = useState(activeDraft?.observation || '')
  const [procedures, setProcedures] = useState(activeDraft?.procedures || '')
  const [outcomeDecision, setOutcomeDecision] = useState(activeDraft?.outcomeDecision || '')
  const [referralClosure, setReferralClosure] = useState(activeDraft?.referralClosure || '')
  const [behaviorIds, setBehaviorIds] = useState(activeDraft?.behaviorIds || [])
  const [indicatorEntries, setIndicatorEntries] = useState(activeDraft?.indicators || [])
  const [templateTitle, setTemplateTitle] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusyState] = useState(false)
  const valuesRef = useRef({ observation, procedures, outcomeDecision, referralClosure, behaviorIds, indicatorEntries })
  const revisionRef = useRef(0)
  const dirtyRef = useRef(false)
  const savePromiseRef = useRef(null)
  const saveRef = useRef(null)
  const autosaveTimerRef = useRef(null)
  const mountedRef = useRef(true)
  const draftIdentityRef = useRef({ id: activeDraft?.id, patientId: activeDraft?.patientId })
  const appliedVoiceDraftRef = useRef('')
  const voiceConfirmationPendingRef = useRef(false)
  const voiceVersionRef = useRef(0)
  const approvedVoiceVersionRef = useRef(0)
  const [voiceConfirmationPending, setVoiceConfirmationPending] = useState(false)
  const busyRef = useRef(false)
  const idleWaiters = useRef(new Set())
  const setBusy = value => {
    busyRef.current = value
    setBusyState(value)
    if (!value) { for (const resolve of idleWaiters.current) resolve(); idleWaiters.current.clear() }
  }
  const waitForIdle = async () => {
    if (busyRef.current) await new Promise(resolve => idleWaiters.current.add(resolve))
    if (savePromiseRef.current) await savePromiseRef.current
  }

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false; clearTimeout(autosaveTimerRef.current) }
  }, [])
  useLayoutEffect(() => {
    draftIdentityRef.current = { id: activeDraft?.id, patientId: activeDraft?.patientId }
    return () => { clearTimeout(autosaveTimerRef.current); autosaveTimerRef.current = null }
  }, [activeDraft?.id, activeDraft?.patientId])

  const reload = async (selected = patientId) => {
    const [nextPatients, nextTemplates] = await Promise.all([
      invoke('patient_list', { includeArchived: true }), invoke('behavior_list'),
    ])
    setPatients(nextPatients); setTemplates(nextTemplates)
    if (selected) {
      const [nextDrafts, nextTimeline, nextAddenda, nextContexts] = await Promise.all([
        invoke('session_draft_list', { patientId: selected }), invoke('session_timeline', { patientId: selected }), invoke('session_addendum_list', { patientId: selected }), invoke('case_context_list', { patientId: selected }),
      ])
      setDrafts(nextDrafts); setTimeline(nextTimeline); setAddenda(nextAddenda); setCaseContexts(nextContexts); setLoadedPatientId(selected)
    }
  }

  useEffect(() => {
    let active = true
    Promise.all([invoke('patient_list', { includeArchived: true }), invoke('behavior_list'), invoke('indicator_catalog')])
      .then(([nextPatients, nextTemplates, nextCatalog]) => { if (active) { setPatients(nextPatients); setTemplates(nextTemplates); setIndicatorCatalog(nextCatalog) } })
      .catch(reason => { if (active) setError(String(reason)) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    if (!patientId) return () => { active = false }
    Promise.all([invoke('session_draft_list', { patientId }), invoke('session_timeline', { patientId }), invoke('session_addendum_list', { patientId }), invoke('case_context_list', { patientId })])
      .then(([nextDrafts, nextTimeline, nextAddenda, nextContexts]) => { if (active) { setDrafts(nextDrafts); setTimeline(nextTimeline); setAddenda(nextAddenda); setCaseContexts(nextContexts); setCaseDemand(''); setCaseObjectives(''); setLoadedPatientId(patientId) } })
      .catch(reason => { if (active) setError(String(reason)) })
    return () => { active = false }
  }, [patientId])

  const updateValues = useCallback(next => {
    valuesRef.current = { ...valuesRef.current, ...next }
    revisionRef.current++
    dirtyRef.current = true
    clearTimeout(autosaveTimerRef.current)
    const { id, patientId: draftPatientId } = draftIdentityRef.current
    if (id && draftPatientId === patientId && !voiceConfirmationPendingRef.current) {
      autosaveTimerRef.current = setTimeout(() => {
        autosaveTimerRef.current = null
        if (draftIdentityRef.current.id === id && draftIdentityRef.current.patientId === draftPatientId) saveRef.current?.().catch(reason => { if (mountedRef.current) setError(String(reason)) })
      }, 600)
    }
  }, [patientId])

  useEffect(() => {
    const intent = voiceCommandDraft
    if (!intent?.commandId || appliedVoiceDraftRef.current === intent.commandId) return
    if (intent.type === 'behavior.create' || intent.type === 'behavior.update') {
      appliedVoiceDraftRef.current = intent.commandId
      const applyBehaviorDraft = async () => {
        const draft = intent.draft
        if (!draft || (draft.title !== undefined && typeof draft.title !== 'string') || (draft.description !== undefined && typeof draft.description !== 'string')) throw new Error('Campos de comportamento incompatíveis com o formulário.')
        let template = null
        if (intent.type === 'behavior.update') {
          if (typeof intent.target?.behaviorId !== 'string' || !intent.target.behaviorId || (draft.title === undefined && draft.description === undefined)) throw new Error('Informe o comportamento e os campos que deseja editar.')
          const nextTemplates = await invoke('behavior_list')
          if (!mountedRef.current || appliedVoiceDraftRef.current !== intent.commandId) return
          template = nextTemplates.find(item => item.id === intent.target.behaviorId)
          if (!template || !Number.isInteger(template.version) || template.version < 1) throw new Error('Não encontrei uma versão válida do comportamento solicitado. Atualize a biblioteca e tente novamente.')
          setTemplates(nextTemplates)
        } else if (typeof draft.title !== 'string' || typeof draft.description !== 'string') throw new Error('Informe título e descrição para criar o comportamento.')
        setEditingTemplate(template)
        setTemplateTitle(draft.title ?? template?.title ?? '')
        setTemplateDescription(draft.description ?? template?.description ?? '')
        setError(''); setMessage('')
        const details = document.getElementById('session-behaviors')
        details?.setAttribute('open', '')
        details?.scrollIntoView({ block: 'center' })
        document.getElementById('behavior-title')?.focus({ preventScroll: true })
        onSessionMessage?.('Comportamento preenchido. Confira o formulário e clique no botão de salvar para gravar.')
      }
      void applyBehaviorDraft().catch(reason => {
        if (mountedRef.current && appliedVoiceDraftRef.current === intent.commandId) setError(String(reason))
      }).finally(() => {
        if (mountedRef.current && appliedVoiceDraftRef.current === intent.commandId) onVoiceDraftApplied?.(intent.commandId)
      })
      return
    }
    if ((intent.type && intent.type !== 'session.draft.update') || !activeDraft || activeDraft.id !== intent.target?.sessionDraftId || activeDraft.patientId !== intent.target?.patientId || patientId !== activeDraft.patientId) return
    appliedVoiceDraftRef.current = intent.commandId
    voiceVersionRef.current++
    voiceConfirmationPendingRef.current = true
    setVoiceConfirmationPending(true)
    const patch = intent.patch
    if (patch?.field === 'behaviorIds' && ['add', 'remove'].includes(patch.operation) && typeof patch.value === 'string') {
      const next = patch.operation === 'remove'
        ? valuesRef.current.behaviorIds.filter(id => id !== patch.value)
        : valuesRef.current.behaviorIds.includes(patch.value) ? valuesRef.current.behaviorIds : [...valuesRef.current.behaviorIds, patch.value]
      setBehaviorIds(next); updateValues({ behaviorIds: next })
      onSessionMessage?.(`Comportamento preenchido. Confira o formulário e clique em “Salvar rascunho” para gravar.`)
    } else if (['observation', 'procedures', 'outcomeDecision', 'referralClosure'].includes(patch?.field) && patch.operation === 'replace' && typeof patch.value === 'string') {
      const setter = { observation: setObservation, procedures: setProcedures, outcomeDecision: setOutcomeDecision, referralClosure: setReferralClosure }[patch.field]
      setter(patch.value); updateValues({ [patch.field]: patch.value })
      onSessionMessage?.(`Texto preenchido. Confira o formulário e clique em “Salvar rascunho” para gravar.`)
    } else if (patch?.field === 'indicators' && patch.operation === 'set' && patch.value?.id && Number.isInteger(patch.value.value)) {
      const previous = valuesRef.current.indicatorEntries.find(item => item.id === patch.value.id) || { id: patch.value.id, value: null, note: null }
      const entry = { id: patch.value.id, value: patch.value.value, note: previous.note ?? null }
      const next = [...valuesRef.current.indicatorEntries.filter(item => item.id !== entry.id), entry]
      setIndicatorEntries(next); updateValues({ indicatorEntries: next })
      onSessionMessage?.(`Indicador preenchido. Confira o formulário e clique em “Salvar rascunho” para gravar.`)
    } else onSessionMessage?.('Não apliquei o comando: o campo ou a operação não é compatível com este rascunho.')
    onVoiceDraftApplied?.(intent.commandId)
  }, [voiceCommandDraft, activeDraft, patientId, onVoiceDraftApplied, onSessionMessage, updateValues])
  const save = useCallback(() => {
    clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = null
    if (savePromiseRef.current) return savePromiseRef.current
    if (voiceVersionRef.current > approvedVoiceVersionRef.current) return Promise.reject(new Error('Revise a alteração de voz e clique em “Salvar rascunho” antes de gravar.'))
    const draftId = activeDraft.id
    const draftPatientId = activeDraft.patientId
    if (draftIdentityRef.current.id !== draftId || draftIdentityRef.current.patientId !== draftPatientId || patientId !== draftPatientId) return Promise.reject(new Error('Rascunho ativo alterado antes de salvar'))
    const pending = (async () => {
      let saved
      let revision
      do {
        revision = revisionRef.current
        const values = valuesRef.current
        saved = await invoke('session_draft_save', { id: draftId, input: { observation: values.observation, procedures: values.procedures, outcomeDecision: values.outcomeDecision, referralClosure: values.referralClosure, behaviorIds: values.behaviorIds, indicators: values.indicatorEntries } })
      } while (revision !== revisionRef.current && voiceVersionRef.current <= approvedVoiceVersionRef.current)
      const stillActive = mountedRef.current && draftIdentityRef.current.id === draftId && draftIdentityRef.current.patientId === draftPatientId
      if (stillActive) {
        dirtyRef.current = revision !== revisionRef.current
        if (!dirtyRef.current && voiceVersionRef.current <= approvedVoiceVersionRef.current) {
          voiceConfirmationPendingRef.current = false
          setVoiceConfirmationPending(false)
        }
        setError('')
        if (draftIdentityRef.current.id === draftId && draftIdentityRef.current.patientId === draftPatientId && saved.id === draftId && saved.patientId === draftPatientId) {
          onDraftChange(saved)
          setDrafts(previous => previous.map(item => item.id === draftId ? saved : item))
          await onChanged()
        }
      }
      return saved
    })()
    savePromiseRef.current = pending
    void pending.then(() => {
      if (savePromiseRef.current === pending) savePromiseRef.current = null
      if (mountedRef.current && dirtyRef.current && !voiceConfirmationPendingRef.current && !autosaveTimerRef.current && draftIdentityRef.current.id === draftId && draftIdentityRef.current.patientId === draftPatientId) {
        autosaveTimerRef.current = setTimeout(() => { autosaveTimerRef.current = null; if (draftIdentityRef.current.id === draftId && draftIdentityRef.current.patientId === draftPatientId && !voiceConfirmationPendingRef.current) saveRef.current?.().catch(reason => { if (mountedRef.current) setError(String(reason)) }) }, 600)
      }
    }, () => { if (savePromiseRef.current === pending) savePromiseRef.current = null })
    return pending
  }, [activeDraft, patientId, onDraftChange, onChanged])
  useLayoutEffect(() => { saveRef.current = save }, [save])
  const flush = async () => {
    let saved
    do { saved = await save() } while (dirtyRef.current)
    return saved
  }

  useImperativeHandle(ref, () => ({
    savePending: async () => {
      if (voiceConfirmationPendingRef.current) throw new Error('Há uma alteração de voz não salva. Revise e clique em “Salvar rascunho” ou cancele o rascunho antes de sair.')
      if (!activeDraft || (!dirtyRef.current && !savePromiseRef.current)) return
      setBusy(true)
      try { await flush() } finally { setBusy(false) }
    },
    hasUnconfirmedVoiceChanges: () => voiceConfirmationPendingRef.current,
    waitForIdle,
    hasOtherUnsavedEditors: () => Boolean(
      caseDemand.trim() || caseObjectives.trim() || addendumSessionId || addendumContent.trim() ||
      templateTitle.trim() || templateDescription.trim() || editingTemplate
    ),
    discardOtherUnsavedEditors: () => {
      if (busyRef.current) throw new Error('Aguarde o salvamento em andamento antes de descartar edições.')
      setCaseDemand(''); setCaseObjectives('')
      setAddendumSessionId(''); setAddendumContent('')
      setTemplateTitle(''); setTemplateDescription(''); setEditingTemplate(null)
    },
  }))

  const saveDraft = async event => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    approvedVoiceVersionRef.current = voiceVersionRef.current
    try { await flush(); setMessage('Rascunho salvo no cofre cifrado.') }
    catch (reason) { setError(String(reason)) }
    finally { setBusy(false) }
  }

  const finalize = async () => {
    if (!activeDraft || activeDraft.patientId !== patientId || !observation.trim() || !procedures.trim() || !outcomeDecision.trim() || !await onConfirm(`Finalizar sessão do paciente ${patientId}, ocorrência original ${activeDraft.originalDate}?`)) return
    if (voiceConfirmationPendingRef.current) { setError('Salve a alteração de voz em “Salvar rascunho” antes de finalizar.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      const saved = await flush()
      await invoke('session_finalize', { id: saved.id })
      onSessionMessage('Sessão finalizada e salva.')
      onDraftChange(null)
      await onChanged()
    } catch (reason) { setError(String(reason)) }
    finally { setBusy(false) }
  }

  const cancel = async () => {
    if (!activeDraft || !await onConfirm(`Cancelar e excluir o rascunho da ocorrência original ${activeDraft.originalDate}? Texto e comportamentos ainda não salvos também serão descartados. Nenhuma sessão finalizada será criada.`)) return
    setBusy(true); setError(''); setMessage('')
    try {
      clearTimeout(autosaveTimerRef.current)
      if (savePromiseRef.current) await savePromiseRef.current
      await invoke('session_draft_cancel', { id: activeDraft.id })
      approvedVoiceVersionRef.current = voiceVersionRef.current
      setObservation(''); setProcedures(''); setOutcomeDecision(''); setReferralClosure(''); setBehaviorIds([]); setIndicatorEntries([]); valuesRef.current = { observation: '', procedures: '', outcomeDecision: '', referralClosure: '', behaviorIds: [], indicatorEntries: [] }; revisionRef.current++; dirtyRef.current = false; voiceConfirmationPendingRef.current = false; setVoiceConfirmationPending(false)
      onSessionMessage('Rascunho cancelado sem registro clínico final.')
      onDraftChange(null)
      await onChanged()
    } catch (reason) { setError(String(reason)) }
    finally { setBusy(false) }
  }

  const saveTemplate = async event => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      if (editingTemplate) await invoke('behavior_update', { id: editingTemplate.id, version: editingTemplate.version, title: templateTitle, description: templateDescription })
      else await invoke('behavior_create', { title: templateTitle, description: templateDescription })
      setEditingTemplate(null); setTemplateTitle(''); setTemplateDescription('')
      await reload(patientId); await onChanged()
      setMessage('Comportamento reutilizável salvo. Sessões já finalizadas mantêm seus snapshots.')
    } catch (reason) { setError(String(reason)) }
    finally { setBusy(false) }
  }

  const selectDraft = async draft => {
    setBusy(true); setError('')
    try {
      if (voiceConfirmationPendingRef.current) throw new Error('Salve ou cancele a alteração de voz antes de trocar de rascunho.')
      const saved = activeDraft && (dirtyRef.current || savePromiseRef.current) ? await flush() : null
      const selected = saved?.id === draft.id ? saved : draft
      onPatientChange(selected.patientId); onDraftChange(selected)
      clearTimeout(autosaveTimerRef.current); setObservation(selected.observation || ''); setProcedures(selected.procedures || ''); setOutcomeDecision(selected.outcomeDecision || ''); setReferralClosure(selected.referralClosure || ''); setBehaviorIds(selected.behaviorIds || []); setIndicatorEntries(selected.indicators || []); valuesRef.current = { observation: selected.observation || '', procedures: selected.procedures || '', outcomeDecision: selected.outcomeDecision || '', referralClosure: selected.referralClosure || '', behaviorIds: selected.behaviorIds || [], indicatorEntries: selected.indicators || [] }; revisionRef.current++; dirtyRef.current = false; setMessage('')
    } catch (reason) { setError(String(reason)) }
    finally { setBusy(false) }
  }

  const changePatient = async value => {
    setBusy(true); setError('')
    try {
      if (voiceConfirmationPendingRef.current) throw new Error('Salve ou cancele a alteração de voz antes de trocar de paciente.')
      if (activeDraft && (dirtyRef.current || savePromiseRef.current)) await flush()
      clearTimeout(autosaveTimerRef.current); onPatientChange(value); onDraftChange(null); valuesRef.current = { observation: '', procedures: '', outcomeDecision: '', referralClosure: '', behaviorIds: [], indicatorEntries: [] }; revisionRef.current++; dirtyRef.current = false
      setAddendumSessionId(''); setAddendumContent('')
    } catch (reason) { setError(String(reason)) }
    finally { setBusy(false) }
  }

  const visibleDrafts = loadedPatientId === patientId ? drafts : []
  const chooseDraftToResume = () => {
    if (visibleDrafts.length === 1) { void selectDraft(visibleDrafts[0]); return }
    const panel = document.getElementById('session-other-drafts')
    if (panel) { panel.open = true; panel.scrollIntoView({ block: 'start', behavior: 'smooth' }); panel.querySelector('summary')?.focus({ preventScroll: true }) }
  }
  const templateOption = template => {
    const sameTitle = templates.filter(item => item.title === template.title)
    return sameTitle.length > 1 ? ` · opção ${sameTitle.findIndex(item => item.id === template.id) + 1}` : ''
  }
  const visibleTimeline = loadedPatientId === patientId ? timeline : []
  const visibleAddenda = loadedPatientId === patientId ? addenda : []
  const visibleContexts = loadedPatientId === patientId ? caseContexts : []
  const missingFinalizationFields = [
    !observation.trim() && 'observações descritivas',
    !procedures.trim() && 'procedimentos realizados',
    !outcomeDecision.trim() && 'resultado e decisão',
  ].filter(Boolean)
  const saveCaseContext = async event => {
    event.preventDefault(); if (!patientId || !caseDemand.trim() || !caseObjectives.trim()) return
    setBusy(true); setError(''); setMessage('')
    let saved
    try {
      saved = await invoke('case_context_create', { patientId, demand: caseDemand, objectives: caseObjectives })
    } catch (reason) { setError(String(reason)); setBusy(false); return }
    setCaseDemand(''); setCaseObjectives('')
    setCaseContexts(previous => [saved, ...previous])
    setMessage('Nova revisão datada do contexto salva; revisões anteriores preservadas.')
    try {
      const results = await Promise.allSettled([reload(patientId), onChanged()])
      if (results.some(result => result.status === 'rejected')) setMessage('Nova revisão datada do contexto salva; a atualização da tela falhou. Reabra as sessões para atualizar os dados.')
    } finally { setBusy(false) }
  }
  const saveAddendum = async event => {
    event.preventDefault(); if (!addendumSessionId || !addendumContent.trim()) return
    setBusy(true); setError(''); setMessage('')
    let saved
    try {
      saved = await invoke('session_addendum_create', { sessionId: addendumSessionId, patientId, content: addendumContent })
    } catch (reason) { setError(String(reason)); setBusy(false); return }
    setAddendumSessionId(''); setAddendumContent('')
    setAddenda(previous => [...previous, saved])
    setMessage('Adendo datado salvo. O registro original permanece intacto.')
    try {
      const results = await Promise.allSettled([reload(patientId), onChanged()])
      if (results.some(result => result.status === 'rejected')) setMessage('Adendo datado salvo; a atualização da tela falhou. Reabra as sessões para atualizar os dados.')
    } finally { setBusy(false) }
  }
  const exportRecord = async () => {
    if (!patientId || busy || !await onConfirm('Esta cópia será um arquivo .txt sem criptografia com dados sensíveis. Escolha um destino local seguro; pastas sincronizadas podem enviar o arquivo à nuvem. Uma queda do aplicativo ou de energia durante a exportação pode deixar um arquivo temporário .circulo-record-*.tmp em texto puro no diretório escolhido. Revise o conteúdo antes de usar. Continuar?')) return
    setBusy(true); setError(''); setMessage('')
    try {
      const created = await invoke('record_copy_export', { patientId })
      if (created) setMessage('Cópia legível criada. O profissional deve revisar o conteúdo.')
    } catch (reason) { setError(String(reason)) }
    finally { setBusy(false) }
  }
  const indicatorGroups = groupIndicatorHistory(visibleTimeline)
  const setIndicator = (id, change) => {
    const previous = valuesRef.current.indicatorEntries.find(item => item.id === id) || { id, value: null, note: null }
    const next = [...valuesRef.current.indicatorEntries.filter(item => item.id !== id), { ...previous, ...change }]
    setIndicatorEntries(next)
    updateValues({ indicatorEntries: next })
  }

  return <section className="vault-backup session-workspace" aria-label="Sessões e registros">
    <h2>Registros do paciente</h2>
    {error && <p role="alert" className="vault-error">{error}</p>}
    {message && <p role="status" className="vault-ok">{message}</p>}
    <label htmlFor="session-patient">Paciente para evolução e sessões</label>
    <select id="session-patient" disabled={busy} value={patientId || ''} onChange={event => changePatient(event.target.value)}>
      <option value="">Selecione</option>{patients.map(patient => <option key={patient.id} value={patient.id}>{patient.name}{patient.archivedAt != null ? ' · arquivado' : ''}</option>)}
    </select>
    {patientId && <section className="session-primary" aria-label="Registrar comportamento ou evolução">
      <h3>Registrar comportamento nesta sessão</h3>
      <p>Marque abaixo o que ocorreu; o comportamento entra no histórico ao finalizar a sessão.</p>
      {activeDraft?.patientId === patientId ? <button type="button" className="session-primary-button" disabled={busy} onClick={() => { const choices = document.getElementById('draft-behaviors'); choices?.scrollIntoView({ block: 'center' }); choices?.focus({ preventScroll: true }) }}>Escolher comportamentos desta sessão</button> : visibleDrafts.length ? <button type="button" disabled={busy} onClick={chooseDraftToResume}>{visibleDrafts.length === 1 ? `Retomar sessão de ${visibleDrafts[0].originalDate}` : 'Escolher rascunho para retomar'}</button> : <button type="button" disabled={busy || !onStartRecord} onClick={() => onStartRecord?.(patientId)}>Escolher compromisso na Agenda</button>}
      {!activeDraft && !visibleDrafts.length && <p>Escolha ou crie um compromisso para este paciente; depois marque os comportamentos na sessão.</p>}
      {!activeDraft && !visibleDrafts.length && !onStartRecord && <p>Abra a Agenda para criar ou escolher um compromisso.</p>}
    </section>}
    {activeDraft && activeDraft.patientId === patientId && <form id="session-draft" data-voice-record={activeDraft.id} onSubmit={saveDraft} aria-label="Rascunho de sessão">
      <h3>Rascunho da ocorrência {activeDraft.originalDate}</h3>
      <p>Paciente: <strong>{patients.find(patient => patient.id === patientId)?.name || patientId}</strong> · {activeDraft.originalDate}</p>
      <fieldset id="draft-behaviors" className="session-behavior-choices" tabIndex={-1} disabled={busy}><legend>Comportamentos desta sessão</legend>{templates.length ? templates.map(template => <label key={template.id} data-voice-record={`${activeDraft.id}:behavior:${template.id}`} data-voice-epoch={template.version} className="vault-checkbox"><input type="checkbox" checked={behaviorIds.includes(template.id)} onChange={event => { const next = event.target.checked ? [...behaviorIds, template.id] : behaviorIds.filter(id => id !== template.id); setBehaviorIds(next); updateValues({ behaviorIds: next }) }} /> {template.title} · v{template.version}{templateOption(template)}</label>) : <p>Nenhum comportamento disponível. <a href="#session-behaviors" onClick={() => document.getElementById('session-behaviors')?.setAttribute('open', '')}>Criar na biblioteca</a>.</p>}</fieldset>
      {voiceConfirmationPending && <p role="status">Alteração de voz ainda não salva. Revise os campos e clique em “Salvar rascunho”.</p>}
      <div id="draft-actions" className="session-draft-actions"><button type="submit" disabled={busy}>Salvar rascunho</button><button type="button" disabled={busy || activeDraft.patientId !== patientId || missingFinalizationFields.length > 0} aria-describedby={missingFinalizationFields.length ? 'session-finalize-requirements' : undefined} onClick={finalize}>Finalizar sessão</button></div>
      <p id="session-finalize-requirements" className="session-finalize-requirements" role="status" aria-live="polite">{missingFinalizationFields.length ? `Para finalizar, preencha: ${missingFinalizationFields.join(', ')}.` : 'Campos necessários preenchidos; a sessão pode ser finalizada.'}</p>
      <nav className="session-draft-steps" aria-label="Etapas do rascunho"><a href="#draft-behaviors">Comportamentos</a> · <a href="#session-observation">Evolução descritiva</a> · <a href="#draft-indicators">Indicadores e escalas</a> · <a href="#draft-actions">Salvar ou finalizar</a></nav>
      <label htmlFor="session-observation">Observações descritivas</label><textarea disabled={busy} id="session-observation" maxLength={4000} value={observation} onChange={event => { setObservation(event.target.value); updateValues({ observation: event.target.value }) }} />
      <label htmlFor="session-procedures">Procedimentos realizados</label><textarea disabled={busy} id="session-procedures" maxLength={4000} value={procedures} onChange={event => { setProcedures(event.target.value); updateValues({ procedures: event.target.value }) }} />
      <label htmlFor="session-outcome-decision">Resultado e decisão</label><textarea disabled={busy} id="session-outcome-decision" maxLength={4000} value={outcomeDecision} onChange={event => { setOutcomeDecision(event.target.value); updateValues({ outcomeDecision: event.target.value }) }} />
      <label htmlFor="session-referral-closure">Encaminhamento ou encerramento (opcional)</label><textarea disabled={busy} id="session-referral-closure" maxLength={4000} value={referralClosure} onChange={event => { setReferralClosure(event.target.value); updateValues({ referralClosure: event.target.value }) }} />
      <fieldset id="draft-indicators"><legend>Indicadores descritivos e escalas desta sessão</legend>{indicatorCatalog.length === 0 && <p>Nenhum indicador disponível.</p>}{indicatorCatalog.map(indicator => {
        const entry = indicatorEntries.find(item => item.id === indicator.id)
        return <div key={indicator.id}>
          <label htmlFor={`indicator-${indicator.id}`}>{indicator.name} · v{indicator.version}</label>
          <p>{indicator.definition}</p>
          <select disabled={busy} id={`indicator-${indicator.id}`} value={entry?.value == null ? '' : String(entry.value)} onChange={event => setIndicator(indicator.id, { value: event.target.value === '' ? null : Number(event.target.value) })}>
            <option value="">Sem registro</option>{indicator.labels.map((label, index) => <option key={label} value={index}>{label}</option>)}
          </select>
          <label htmlFor={`indicator-note-${indicator.id}`}>Nota contextual opcional · {indicator.name}</label>
          <textarea disabled={busy} id={`indicator-note-${indicator.id}`} maxLength={500} value={entry?.note || ''} onChange={event => setIndicator(indicator.id, { note: event.target.value })} />
          <button type="button" disabled={busy} className="vault-secondary" onClick={() => setIndicator(indicator.id, { value: null, note: null })}>Limpar {indicator.name}</button>
        </div>
      })}</fieldset>
      {!visibleContexts.length && <p>Contexto do caso não registrado; a sessão pode ser finalizada com esta lacuna.</p>}
      <button type="button" className="vault-secondary" disabled={busy} onClick={cancel}>Cancelar rascunho</button>
    </form>}
    {patientId && <details id="session-other-drafts" className="session-secondary"><summary>Outros rascunhos do paciente</summary>{visibleDrafts.length ? <ul className="vault-patients">{visibleDrafts.map((draft, index) => <li key={draft.id} data-voice-record={`draft:${draft.id}`}>Ocorrência original {draft.originalDate}<button type="button" disabled={busy} className="vault-secondary" onClick={() => selectDraft(draft)}>Retomar rascunho {draft.originalDate}{visibleDrafts.filter(item => item.originalDate === draft.originalDate).length > 1 ? ` · opção ${index + 1}` : ''}</button></li>)}</ul> : <p>Nenhum rascunho deste paciente.</p>}</details>}
    <details id="session-behaviors" className="session-secondary"><summary>Biblioteca de comportamentos reutilizáveis</summary><p>Crie ou edite opções para usar em sessões. A biblioteca não vincula o item ao paciente.</p><form data-voice-record={editingTemplate ? `behavior:${editingTemplate.id}` : 'behavior:new'} data-voice-epoch={editingTemplate?.version || 0} onSubmit={saveTemplate} aria-label="Comportamento reutilizável"><label htmlFor="behavior-title">Título descritivo</label><input disabled={busy} id="behavior-title" maxLength={160} required value={templateTitle} onChange={event => setTemplateTitle(event.target.value)} /><label htmlFor="behavior-description">Descrição opcional</label><textarea disabled={busy} id="behavior-description" maxLength={1000} value={templateDescription} onChange={event => setTemplateDescription(event.target.value)} /><button disabled={busy} type="submit">{editingTemplate ? 'Salvar versão do comportamento' : 'Criar comportamento reutilizável'}</button>{editingTemplate && <button type="button" className="vault-secondary" onClick={() => { setEditingTemplate(null); setTemplateTitle(''); setTemplateDescription('') }}>Cancelar edição</button>}</form>{templates.length > 0 && <ul className="vault-patients">{templates.map(template => <li key={template.id} data-voice-record={`behavior:${template.id}`} data-voice-epoch={template.version}>{template.title} · v{template.version}<small>{template.description}</small><button type="button" disabled={busy} className="vault-secondary" onClick={() => { setEditingTemplate(template); setTemplateTitle(template.title); setTemplateDescription(template.description); document.getElementById('session-behaviors')?.setAttribute('open', '') }}>Editar comportamento {template.title}{templateOption(template)}</button></li>)}</ul>}</details>
    {patientId && <details className="session-secondary"><summary>Contexto do caso</summary>{visibleContexts.length ? <><h4>Contexto atual</h4><p>Registrado em <time dateTime={visibleContexts[0].recordedAt}>{new Date(visibleContexts[0].recordedAt).toLocaleString('pt-BR')}</time>{visibleContexts[0].author && ` · Identidade local declarada: ${visibleContexts[0].author.displayName} · ${visibleContexts[0].author.registration}`}</p><dl><dt>Demanda avaliada</dt><dd>{visibleContexts[0].demand}</dd><dt>Objetivos de trabalho</dt><dd>{visibleContexts[0].objectives}</dd></dl><h4>Revisões anteriores</h4>{visibleContexts.length > 1 ? <ol>{visibleContexts.slice(1).map(item => <li key={item.id}><time dateTime={item.recordedAt}>{new Date(item.recordedAt).toLocaleString('pt-BR')}</time>{item.author && ` · ${item.author.displayName} · ${item.author.registration}`}<dl><dt>Demanda avaliada</dt><dd>{item.demand}</dd><dt>Objetivos de trabalho</dt><dd>{item.objectives}</dd></dl></li>)}</ol> : <p>Nenhuma revisão anterior.</p>}</> : <p role="status">Contexto do caso não registrado para este paciente.</p>}<form onSubmit={saveCaseContext} aria-label="Nova revisão do contexto do caso"><p>Cada envio cria uma revisão datada; anteriores são preservadas.</p><label htmlFor="case-demand">Demanda avaliada</label><textarea id="case-demand" disabled={busy} required maxLength={4000} value={caseDemand} onChange={event => setCaseDemand(event.target.value)} /><label htmlFor="case-objectives">Objetivos de trabalho</label><textarea id="case-objectives" disabled={busy} required maxLength={4000} value={caseObjectives} onChange={event => setCaseObjectives(event.target.value)} /><button type="submit" disabled={busy || !caseDemand.trim() || !caseObjectives.trim()}>Salvar nova revisão do contexto</button></form></details>}
    {patientId && <details className="session-secondary"><summary>Exportar cópia legível</summary><p className="vault-warning">A cópia .txt não é cifrada. Escolha destino local seguro e revise o conteúdo. Uma queda durante a exportação pode deixar arquivo temporário em texto puro.</p><button type="button" disabled={busy} onClick={exportRecord}>Exportar cópia legível deste paciente</button></details>}
    <details id="session-evolution" className="desktop-evolution session-secondary" aria-label="Evolução descritiva somente leitura">
      <summary>Evolução e escalas registradas · Adicionar adendo</summary>
      {patientId && <button type="button" disabled={busy || (!onStartRecord && !activeDraft && !visibleDrafts.length)} onClick={() => activeDraft?.patientId === patientId ? document.getElementById('session-draft')?.scrollIntoView() : visibleDrafts.length ? chooseDraftToResume() : onStartRecord?.(patientId)}>Registrar nova sessão ou continuar rascunho</button>}
      <p>Registros persistidos em ordem de data da sessão. Esta visualização apenas descreve o que foi anotado; não é avaliação clínica e não calcula tendências.</p>
      {visibleTimeline.length ? <ol className="desktop-evolution-list">{visibleTimeline.map(session => <li key={session.id} data-voice-record={`session:${session.id}`}>
        <header><strong>{session.sessionDate}</strong><span>{session.start}–{session.end} · {session.modality}{session.wasRescheduled ? ' · remarcada' : ''}</span></header>
        <p>{session.recordedAt ? `Registrado em ${new Date(session.recordedAt).toLocaleString('pt-BR')} (UTC: ${session.recordedAt})` : 'Horário de registro não disponível'}{session.author && ` · Identidade local declarada: ${session.author.displayName} · ${session.author.registration}`}</p>
        <dl><dt>Observação original</dt><dd>{session.observation?.trim() || 'Sem registro'}</dd><dt>Comportamentos registrados</dt><dd>{session.behaviors?.length ? <ul>{session.behaviors.map(item => <li key={`${item.templateId}-${item.templateVersion}`}>{item.title} · v{item.templateVersion}{item.description ? ` · ${item.description}` : ''}</li>)}</ul> : 'Sem registro'}</dd><dt>Indicadores registrados</dt><dd>{session.indicators?.length ? <ul>{session.indicators.map(item => <li key={`${item.id}-${item.version}`}>{item.name} · v{item.version}: {item.value == null ? 'Sem registro' : item.labels[item.value]}{item.note && <small>Nota contextual: {item.note}</small>}</li>)}</ul> : 'Sem registro'}</dd></dl>
        <dl><dt>Procedimentos realizados</dt><dd>{session.procedures?.trim() || 'não registrado'}</dd><dt>Resultado e decisão</dt><dd>{session.outcomeDecision?.trim() || 'não registrado'}</dd><dt>Encaminhamento ou encerramento</dt><dd>{session.referralClosure?.trim() || 'não registrado'}</dd></dl>
        <h4>Adendos datados</h4>
        {visibleAddenda.filter(item => item.sessionId === session.id).length ? <ol>{visibleAddenda.filter(item => item.sessionId === session.id).map(item => <li key={item.id}><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('pt-BR')}</time> · {item.content}</li>)}</ol> : <p>Sem adendos.</p>}
        {addendumSessionId === session.id ? <form onSubmit={saveAddendum}><label htmlFor={`addendum-${session.id}`}>Texto do adendo (até 4000 caracteres)</label><textarea id={`addendum-${session.id}`} disabled={busy} required maxLength={4000} value={addendumContent} onChange={event => setAddendumContent(event.target.value)} /><button type="submit" disabled={busy || !addendumContent.trim()}>Salvar adendo imutável</button><button type="button" className="vault-secondary" disabled={busy} onClick={() => { setAddendumSessionId(''); setAddendumContent('') }}>Cancelar</button></form> : <button type="button" className="vault-secondary" data-voice-label={`Adicionar adendo de ${patients.find(patient => patient.id === patientId)?.name || 'Paciente'} em ${session.sessionDate} às ${session.start}–${session.end}`} disabled={busy} onClick={() => { setAddendumSessionId(session.id); setAddendumContent('') }}>Adicionar adendo</button>}
      </li>)}</ol> : <p>Nenhuma sessão finalizada deste paciente.</p>}
      <h4>Registros longitudinais por escala compatível</h4>
      <p>Comparação apenas quando ID, versão e rótulos do snapshot coincidem exatamente. Escalas incompatíveis ficam separadas; não há média nem tendência calculada.</p>
      {indicatorGroups.length ? <ul className="vault-patients">{indicatorGroups.map(group => <li key={group.key} className="session-scale-group"><strong>{group.name} · v{group.version}</strong><small>{group.definition}</small><p>Escala registrada: {group.labels.join(' · ')}. Cada ponto indica a categoria registrada naquela sessão; ausência não gera ponto.</p><div className="session-scale-chart" aria-hidden="true"><div className="session-scale-plot" style={{ '--scale-count': group.labels.length }}><div className="session-scale-axis"><span>Data da sessão</span><div className="session-scale-axis-labels">{group.labels.map((label, index) => <span key={`${index}-${label}`}>{label}</span>)}</div></div>{group.records.map(record => <div className="session-scale-row" key={record.sessionId}><time dateTime={record.date}>{record.date}</time><div className="session-scale-track">{record.value == null ? <span className="session-scale-empty">Sem registro</span> : <span className="session-scale-point" style={{ gridColumn: record.value + 1 }} />}</div></div>)}</div></div><p>Leitura equivalente por sessão:</p><ol>{group.records.map(record => <li key={record.sessionId}>{record.date} · {record.label}{record.note && <small>Nota contextual: {record.note}</small>}</li>)}</ol></li>)}</ul> : <p>Sem registro de indicadores para este paciente.</p>}
    </details>
  </section>
}
