import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import DesktopAgenda from './DesktopAgenda.jsx'
import DesktopAnalytics from './DesktopAnalytics.jsx'
import DesktopSessions from './DesktopSessions.jsx'
import { seedSyntheticDemo } from './desktopDemoSeed.js'
import { checkDesktopUpdate, closeDesktopUpdate, installDesktopUpdate } from './desktopUpdater.js'
import { AGENDA_TIME_ZONE, currentCivilDate } from './calendarDate.js'
import sqlcipherLicense from './licenses/SQLCIPHER-COMMUNITY.txt?raw'
import opensslLicense from './licenses/OPENSSL-APACHE-2.0.txt?raw'
import './DesktopVault.css'

const emptyPatientForm = () => ({ name: '', age: '', selfRequester: '', preferredModality: '' })
// Faixas em anos completos: 0–11 criança, 12–17 adolescente, 18–59 adulto, 60+ idoso.
const lifeCycleFromAge = age => age == null ? 'Não informado' : age < 12 ? 'Criança' : age < 18 ? 'Adolescente' : age < 60 ? 'Adulto' : 'Idoso'
const emptyPartyForm = () => ({ name: '', relation: 'Outro', roles: { requester: false, legalGuardian: false, administrativeContact: false } })
const relationOptions = ['Mãe', 'Pai', 'Responsável legal', 'Escola', 'Instituição', 'Outro']
const localDay = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }

export default function DesktopVault() {
  const [status, setStatus] = useState(null)
  const [password, setPassword] = useState('')
  const [patients, setPatients] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusyState] = useState(false)
  const [backupPassword, setBackupPassword] = useState('')
  const [autoBackup, setAutoBackup] = useState(null)
  const [recoveryInventory, setRecoveryInventory] = useState(null)
  const [localAutoPassword, setLocalAutoPassword] = useState('')
  const [localAutoValidated, setLocalAutoValidated] = useState(false)
  const [localRestorePassword, setLocalRestorePassword] = useState('')
  const [preview, setPreview] = useState(null)
  const [freshRestoreOpen, setFreshRestoreOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [space, setSpace] = useState('home')
  const [homeAgenda, setHomeAgenda] = useState({ state: 'loading', items: [] })
  const [homeAgendaRetry, setHomeAgendaRetry] = useState(0)
  const [patientFormOpen, setPatientFormOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null)
  const [partyPatientId, setPartyPatientId] = useState('')
  const [parties, setParties] = useState([])
  const [partyForm, setPartyForm] = useState(emptyPartyForm)
  const [editingParty, setEditingParty] = useState(null)
  const [showArchivedParties, setShowArchivedParties] = useState(false)
  const partyRequest = useRef(0)
  const partySelection = useRef(0)
  const selectedPartyPatient = useRef('')
  const patientRequest = useRef(0)
  const vaultGeneration = useRef(0)
  const vaultUnlocked = useRef(false)
  const [agendaOpen, setAgendaOpen] = useState(false)
  const [startAvulsaSignal, setStartAvulsaSignal] = useState(0)
  const [quickStart, setQuickStart] = useState(false)
  const [agendaRecordPatientId, setAgendaRecordPatientId] = useState('')
  const [sessionsOpen, setSessionsOpen] = useState(false)
  const [sessionPatientId, setSessionPatientId] = useState('')
  const [activeDraft, setActiveDraft] = useState(null)
  const [updateState, setUpdateState] = useState({ phase: 'checking' })
  const updateRef = useRef(null)
  const updateBusy = useRef(false)
  const updateCheckBusy = useRef(false)
  const updateCheckGeneration = useRef(0)
  const updateFormsOpen = useRef(false)
  useEffect(() => { updateFormsOpen.current = Boolean(patientFormOpen || partyPatientId || agendaOpen) }, [patientFormOpen, partyPatientId, agendaOpen])
  const sessionsRef = useRef(null)
  const busyRef = useRef(false)
  const dailyCheckRef = useRef(null)
  const unlockedDay = useRef(null)
  const setBusy = value => {
    busyRef.current = value
    setBusyState(value)
  }

  useEffect(() => {
    let active = true
    checkDesktopUpdate().then(update => {
      if (!active) { void closeDesktopUpdate(update).catch(() => {}); return }
      updateRef.current = update
      setUpdateState(update ? { phase: 'available', version: update.version } : { phase: 'none' })
    }).catch(() => { if (active) setUpdateState({ phase: 'check-error' }) })
    const release = () => {
      active = false
      updateCheckGeneration.current += 1
      const held = updateRef.current
      updateRef.current = null
      void closeDesktopUpdate(held).catch(() => {})
    }
    window.addEventListener('pagehide', release)
    return () => { window.removeEventListener('pagehide', release); release() }
  }, [])

  const retryUpdateCheck = async () => {
    if (updateBusy.current || updateCheckBusy.current) return
    updateCheckBusy.current = true
    const generation = updateCheckGeneration.current
    setUpdateState({ phase: 'checking' })
    try {
      const update = await checkDesktopUpdate()
      if (generation !== updateCheckGeneration.current) {
        await closeDesktopUpdate(update)
        return
      }
      const previous = updateRef.current
      updateRef.current = update
      if (previous && previous !== update) await closeDesktopUpdate(previous).catch(() => {})
      if (generation !== updateCheckGeneration.current) return
      setUpdateState(update ? { phase: 'available', version: update.version } : { phase: 'none' })
    } catch { if (generation === updateCheckGeneration.current) setUpdateState({ phase: 'check-error' }) }
    finally { updateCheckBusy.current = false }
  }

  const applyUpdate = async () => {
    if (updateBusy.current || !updateRef.current || busyRef.current) return
    const version = updateRef.current.version
    if (updateFormsOpen.current || sessionsRef.current?.hasOtherUnsavedEditors()) {
      setUpdateState({ phase: 'forms-open', version })
      return
    }
    if (!window.confirm(`Instalar Círculo ${version}? O aplicativo será fechado durante a instalação. Salve seu trabalho antes de continuar.`)) return
    updateBusy.current = true
    setUpdateState({ phase: 'saving', version })
    try {
      await sessionsRef.current?.waitForIdle()
      await sessionsRef.current?.savePending()
      if (updateFormsOpen.current || sessionsRef.current?.hasOtherUnsavedEditors()) {
        setUpdateState({ phase: 'forms-open', version })
        return
      }
      setUpdateState({ phase: 'downloading', version, downloaded: 0, total: null })
      await installDesktopUpdate(updateRef.current, progress => setUpdateState({ ...progress, version }))
      const installed = updateRef.current
      updateRef.current = null
      void closeDesktopUpdate(installed).catch(() => {})
      setUpdateState({ phase: 'installed', version })
    } catch (reason) {
      const failed = updateRef.current
      updateRef.current = null
      void closeDesktopUpdate(failed).catch(() => {})
      setUpdateState({ phase: 'install-error', version, error: String(reason) })
    } finally { updateBusy.current = false }
  }

  useEffect(() => {
    if (!status?.unlocked) return
    const check = () => dailyCheckRef.current?.()
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    const timer = window.setInterval(check, 60_000)
    return () => { window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); window.clearInterval(timer) }
  }, [status?.unlocked])
  const [form, setForm] = useState(emptyPatientForm)

  const refreshAuto = async () => {
    try { setAutoBackup(await invoke('auto_backup_status')) }
    catch { setAutoBackup({ dirty: true, error: 'Estado da cópia automática indisponível.', available: false, lastVerifiedAt: null }) }
  }
  const refreshWorkspace = async () => {
    setHomeAgenda({ state: 'loading', items: [] })
    setHomeAgendaRetry(value => value + 1)
    await refreshAuto()
  }

  const loadPatients = async (includeArchived = showArchived) => {
    const request = ++patientRequest.current
    const generation = vaultGeneration.current
    const listed = await invoke('patient_list', { includeArchived })
    if (request === patientRequest.current && generation === vaultGeneration.current && vaultUnlocked.current) setPatients(listed)
  }
  useEffect(() => {
    if (!status?.unlocked || space !== 'home') return
    let active = true
    const today = currentCivilDate(AGENDA_TIME_ZONE)
    invoke('agenda_occurrences', { from: today, to: today })
      .then(items => { if (active) setHomeAgenda({ state: 'ready', items }) })
      .catch(() => { if (active) setHomeAgenda({ state: 'error', items: [] }) })
    return () => { active = false }
  }, [status?.unlocked, space, homeAgendaRetry])
  useEffect(() => {
    let active = true
    invoke('vault_status').then(result => {
      if (!active) return
      vaultUnlocked.current = result.unlocked
      unlockedDay.current = result.unlocked ? localDay() : null
      setStatus(result)
      if (result.unlocked) loadPatients(false).catch(() => { if (active && vaultUnlocked.current) setError('Não foi possível carregar os pacientes. Use Atualizar lista.') })
    }).catch(() => { if (active) setError('Não foi possível consultar o cofre local.') })
    invoke('auto_backup_status').then(setAutoBackup).catch(() => setAutoBackup({ dirty: true, error: 'Estado da cópia automática indisponível.', available: false, lastVerifiedAt: null }))
    return () => { active = false }
  }, [])
  const clearParties = () => {
    partyRequest.current += 1
    partySelection.current += 1
    selectedPartyPatient.current = ''
    setPartyPatientId(''); setParties([]); setEditingParty(null); setPartyForm(emptyPartyForm()); setShowArchivedParties(false)
  }
  const loadParties = async (patientId, includeArchived = showArchivedParties) => {
    const request = ++partyRequest.current
    const listed = await invoke('related_party_list', { patientId, includeArchived })
    if (request === partyRequest.current && selectedPartyPatient.current === patientId && vaultUnlocked.current) setParties(listed)
  }
  const selectPartyPatient = async patientId => {
    clearParties()
    if (!patientId) return
    selectedPartyPatient.current = patientId
    setPartyPatientId(patientId)
    try { await loadParties(patientId, false) } catch (reason) { setError(String(reason)) }
  }
  const saveParty = async event => {
    event.preventDefault()
    if (!partyPatientId) return
    if (!partyForm.name.trim()) { setError('Informe o nome da pessoa ou instituição.'); return }
    if (!Object.values(partyForm.roles).some(Boolean)) { setError('Selecione ao menos um papel.'); return }
    setBusy(true); setError(''); setMessage('')
    const patientId = partyPatientId
    const selection = partySelection.current
    const currentSelection = () => vaultUnlocked.current && selectedPartyPatient.current === patientId && partySelection.current === selection
    try {
      const input = { ...partyForm, name: partyForm.name.trim() }
      const args = { patientId, input }
      if (editingParty) { args.id = editingParty.id; args.revision = editingParty.revision }
      const saved = await invoke(editingParty ? 'related_party_update' : 'related_party_create', args)
      if (!currentSelection()) return
      setParties(current => editingParty ? current.map(item => item.id === saved.id ? saved : item) : [...current, saved])
      setEditingParty(null); setPartyForm(emptyPartyForm())
      setMessage('Vínculo salvo.')
      try { await loadParties(patientId) } catch { if (currentSelection()) setError('Vínculo salvo, mas a lista não foi atualizada. Reabra os vínculos.') }
      await refreshAuto()
    } catch (reason) { if (currentSelection()) setError(/revision|conflict|conflito|revisão/i.test(String(reason)) ? 'Conflito de edição. Reabra os vínculos para obter a revisão atual.' : String(reason)) }
    finally { setBusy(false) }
  }
  const changePartyArchive = async party => {
    const verb = party.archivedAt == null ? 'Arquivar' : 'Restaurar'
    if (!window.confirm(`${verb} o vínculo de ${party.name}?`)) return
    setBusy(true); setError(''); setMessage('')
    const patientId = partyPatientId
    const selection = partySelection.current
    const currentSelection = () => vaultUnlocked.current && selectedPartyPatient.current === patientId && partySelection.current === selection
    try {
      const saved = await invoke(party.archivedAt == null ? 'related_party_archive' : 'related_party_restore', { patientId, id: party.id, revision: party.revision })
      if (!currentSelection()) return
      setParties(current => current.map(item => item.id === saved.id ? saved : item).filter(item => showArchivedParties || item.archivedAt == null))
      setEditingParty(null); setPartyForm(emptyPartyForm())
      setMessage(`Vínculo ${party.archivedAt == null ? 'arquivado' : 'restaurado'}.`)
      try { await loadParties(patientId) } catch { if (currentSelection()) setError('Operação salva, mas a lista não foi atualizada. Reabra os vínculos.') }
      await refreshAuto()
    } catch (reason) { if (currentSelection()) setError(/revision|conflict|conflito|revisão/i.test(String(reason)) ? 'Conflito de edição. Reabra os vínculos para obter a revisão atual.' : String(reason)) }
    finally { setBusy(false) }
  }
  const enter = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await invoke(status.initialized ? 'vault_unlock' : 'vault_create', { password })
      vaultGeneration.current += 1
      vaultUnlocked.current = true
      unlockedDay.current = localDay()
      setPassword('')
      setLocalAutoPassword('')
      setLocalAutoValidated(false)
      setRecoveryInventory(null)
      setSessionsOpen(false)
      setAgendaRecordPatientId('')
      setSpace('home')
      setSessionPatientId('')
      setActiveDraft(null)
      clearParties()
      setStatus({ initialized: true, unlocked: true, profileState: 'ready' })
      await loadPatients()
      await refreshAuto()
    } catch (reason) {
      setError(String(reason))
    } finally {
      setBusy(false)
    }
  }
  const submitPatient = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const age = form.age === '' ? null : Number(form.age)
      const input = { ...form, name: form.name.trim(), age, lifeCycle: lifeCycleFromAge(age), selfRequester: form.selfRequester || null }
      if (form.age !== '' && (!/^\d+$/.test(form.age) || !Number.isSafeInteger(input.age))) throw new Error('Idade deve ser inteira não negativa.')
      if (!input.name) throw new Error('Informe o nome do paciente.')
      const saved = editing
        ? await invoke('patient_update', { id: editing.id, revision: editing.revision, input })
        : await invoke('patient_create', { input })
      setPatients(current => editing ? current.map(patient => patient.id === saved.id ? saved : patient) : [...current, saved])
      setEditing(null)
      setForm(emptyPatientForm())
      setMessage(editing ? 'Cadastro atualizado.' : 'Cadastro salvo no cofre cifrado.')
      try { await loadPatients() } catch { setError('Cadastro salvo, mas não foi possível atualizar a lista. Use Atualizar lista antes de outra operação.') }
      await refreshAuto()
    } catch (reason) {
      setError(String(reason))
    } finally {
      setBusy(false)
    }
  }
  const changeArchive = async (patient) => {
    const action = patient.archivedAt == null ? 'Arquivar' : 'Restaurar'
    if (!window.confirm(`${action} o cadastro de ${patient.name}?`)) return
    setBusy(true); setError(''); setMessage('')
    try {
      const saved = await invoke(patient.archivedAt == null ? 'patient_archive' : 'patient_restore', { id: patient.id, revision: patient.revision })
      setPatients(current => current.map(item => item.id === saved.id ? saved : item).filter(item => showArchived || item.archivedAt == null))
      if (editing?.id === patient.id) { setEditing(null); setForm(emptyPatientForm()) }
      if (partyPatientId === patient.id) clearParties()
      setMessage(`Cadastro ${patient.archivedAt == null ? 'arquivado' : 'restaurado'}.`)
      try { await loadPatients() } catch { setError('Arquivamento confirmado, mas não foi possível atualizar a lista. Use Atualizar lista.') }
      await refreshAuto()
    } catch (reason) { setError(String(reason)) }
    finally { setBusy(false) }
  }
  const clearUnlockedState = () => {
    vaultGeneration.current += 1
    patientRequest.current += 1
    vaultUnlocked.current = false
    unlockedDay.current = null
    setPatients([])
    setEditing(null)
    setForm(emptyPatientForm())
    clearParties()
    setQuery('')
    setAgendaOpen(false)
    setQuickStart(false)
    setAgendaRecordPatientId('')
    setSpace('home')
    setHomeAgenda({ state: 'loading', items: [] })
    setPatientFormOpen(false)
    setSessionsOpen(false)
    setSessionPatientId('')
    setActiveDraft(null)
    setPreview(null)
    setFreshRestoreOpen(false)
    setBackupPassword('')
    setLocalRestorePassword('')
    setLocalAutoPassword('')
    setLocalAutoValidated(false)
    setRecoveryInventory(null)
    setPassword('')
    setStatus({ initialized: true, unlocked: false, profileState: 'ready' })
  }
  const confirmRestoredVault = async () => {
    clearUnlockedState()
    const confirmed = await invoke('vault_status')
    if (!confirmed?.initialized || !confirmed.unlocked || confirmed.profileState !== 'ready') {
      setStatus(confirmed)
      throw new Error('Não foi possível confirmar o cofre desbloqueado após a restauração.')
    }
    vaultGeneration.current += 1
    vaultUnlocked.current = true
    unlockedDay.current = localDay()
    setStatus(confirmed)
    await loadPatients()
    await refreshAuto()
  }
  const recoverRestoreFailure = async () => {
    clearUnlockedState()
    try {
      const confirmed = await invoke('vault_status')
      if (confirmed?.unlocked) {
        vaultGeneration.current += 1
        vaultUnlocked.current = true
        unlockedDay.current = localDay()
        setStatus(confirmed)
        await loadPatients()
      } else setStatus(confirmed)
    } catch { setStatus(null) }
  }
  const lock = async () => {
    if (busyRef.current) return
    setBusy(true)
    try {
      await sessionsRef.current?.waitForIdle()
      await sessionsRef.current?.savePending()
      await invoke('vault_lock')
      clearUnlockedState()
      setError('')
    } catch (reason) {
      setError(String(reason))
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => { dailyCheckRef.current = () => {
    if (!vaultUnlocked.current) return
    const generation = vaultGeneration.current
    if (unlockedDay.current !== localDay()) {
      let pendingSave
      try { if (!busyRef.current) pendingSave = sessionsRef.current?.savePending() } catch { /* O bloqueio visual não depende do salvamento. */ }
      void Promise.resolve(pendingSave).catch(() => {})
      clearUnlockedState()
      const expiredGeneration = vaultGeneration.current
      setMessage('Um novo dia começou. Desbloqueie o cofre para continuar.')
      invoke('vault_lock').then(() => null, reason => reason).then(async lockError => {
        const current = await invoke('vault_status')
        if (expiredGeneration !== vaultGeneration.current || vaultUnlocked.current) return
        if (!current.unlocked) { setStatus(current); return }
        setError(`Não foi possível bloquear o cofre no dispositivo: ${lockError || 'o backend ainda informa o cofre desbloqueado.'}`)
      }).catch(reason => {
        if (expiredGeneration === vaultGeneration.current && !vaultUnlocked.current) setError(`Não foi possível confirmar o bloqueio do cofre: ${reason}`)
      })
      return
    }
    invoke('vault_status').then(current => {
      if (generation !== vaultGeneration.current || !vaultUnlocked.current) return
      if (unlockedDay.current !== localDay()) { dailyCheckRef.current?.(); return }
      if (!current.unlocked) { clearUnlockedState(); setStatus(current); setMessage('O cofre foi bloqueado. Desbloqueie para continuar.') }
      else if (space === 'home') setHomeAgendaRetry(value => value + 1)
    }).catch(reason => { if (generation === vaultGeneration.current) setError(String(reason)) })
  } })
  useEffect(() => {
    if (space !== 'agenda' || !startAvulsaSignal) return
    const frame = window.requestAnimationFrame(() => document.getElementById('agenda-patient')?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [space, startAvulsaSignal])

  const toggleSessions = async () => {
    if (!sessionsOpen) { setSessionsOpen(true); return }
    if (sessionsRef.current?.hasOtherUnsavedEditors() && !window.confirm('Fechar Sessões e descartar contexto, adendo ou comportamento ainda não salvos?')) return
    setBusy(true); setError('')
    try {
      await sessionsRef.current?.savePending()
      sessionsRef.current?.discardOtherUnsavedEditors()
      setSessionsOpen(false); setSessionPatientId(''); setActiveDraft(null)
    } catch (reason) { setError(String(reason)) }
    finally { setBusy(false) }
  }

  const createBackup = async () => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const saved = await invoke('backup_create', { password: backupPassword })
      setMessage(saved ? 'Backup cifrado criado e verificado.' : 'Criação de backup cancelada.')
      setBackupPassword('')
    } catch (reason) { setError(String(reason)) }
    finally { setBusy(false) }
  }
  const selectBackup = async () => {
    setBusy(true)
    setError('')
    setMessage('')
    setPreview(null)
    try {
      const selected = await invoke('backup_select', { password: backupPassword })
      setPreview(selected)
      if (!selected) setMessage('Seleção de backup cancelada.')
    } catch (reason) { setError(String(reason)) }
    finally { setBusy(false) }
  }
  const restoreBackup = async () => {
    const incomplete = preview?.profileState === 'incomplete'
    const action = incomplete ? 'mover todos os arquivos do perfil incompleto para uma quarentena local sem sobrescrevê-los e criar um novo cofre' : preview?.replacesExisting ? 'SUBSTITUIR o único perfil local após criar uma cópia de segurança cifrada' : 'criar um cofre local vazio a partir deste backup com a nova senha local'
    if (!window.confirm(`Confirmar restauração? Ela vai ${action}. Continue somente com dados sintéticos.`)) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await sessionsRef.current?.savePending()
      const restored = await invoke('backup_restore', { backupPassword, localPassword: localRestorePassword, confirmed: true, quarantineConfirmed: incomplete })
      if (restored === false) { setMessage('Restauração cancelada. Nenhum cofre foi criado.'); return }
      await confirmRestoredVault()
      setMessage('Restauração concluída. O cofre local está desbloqueado.')
    } catch (reason) { await recoverRestoreFailure(); setError(String(reason)) }
    finally { setBusy(false) }
  }

  const retryAutoBackup = async () => {
    setBusy(true)
    try { setAutoBackup(await invoke('auto_backup_retry')) }
    catch (reason) { setAutoBackup({ dirty: true, error: String(reason), available: autoBackup?.available || false, lastVerifiedAt: autoBackup?.lastVerifiedAt || null }) }
    finally { setBusy(false) }
  }

  const inspectRecovery = async () => {
    setBusy(true); setError(''); setRecoveryInventory(null)
    try { setRecoveryInventory(await invoke('recovery_inventory')) }
    catch (reason) { setError(String(reason)) }
    finally { setBusy(false) }
  }

  const validateLocalAutoBackup = async () => {
    setBusy(true); setError(''); setLocalAutoValidated(false)
    try {
      const valid = await invoke('auto_backup_validate', { password: localAutoPassword })
      if (!valid) throw new Error('Cópia automática local inválida.')
      setLocalAutoValidated(true)
    } catch (reason) { setError(String(reason)); setLocalAutoPassword('') }
    finally { setBusy(false) }
  }

  const restoreLocalAutoBackup = async () => {
    if (!localAutoValidated) return
    if (!window.confirm('Substituir o banco local pela última cópia automática cifrada? O banco anterior será preservado em arquivo local. Continue somente com dados sintéticos.')) {
      setLocalAutoPassword('')
      setLocalAutoValidated(false)
      return
    }
    setBusy(true); setError(''); setMessage('')
    try {
      await invoke('auto_backup_restore', { password: localAutoPassword, confirmed: true })
      await confirmRestoredVault()
      setMessage('Cópia automática local restaurada e verificada.')
    } catch (reason) { await recoverRestoreFailure(); setError(String(reason)) }
    finally { setLocalAutoPassword(''); setLocalAutoValidated(false); setBusy(false) }
  }

  const startSessionFromAgenda = async occurrence => {
    setQuickStart(false)
    setBusy(true); setError(''); setMessage('')
    try {
      await sessionsRef.current?.savePending()
      const draft = await invoke('session_draft_start', { seriesId: occurrence.seriesId, originalDate: occurrence.originalDate })
      setSessionPatientId(draft.patientId)
      setActiveDraft(draft)
      setAgendaOpen(false)
      setAgendaRecordPatientId('')
      setSessionsOpen(true)
      setSpace('sessions')
      await refreshWorkspace()
      return true
    } catch (reason) { setError(String(reason)); return false }
    finally { setBusy(false) }
  }

  const openPatientSessions = async patientId => {
    if (busyRef.current) return
    setBusy(true); setError('')
    try {
      if (sessionPatientId !== patientId) await sessionsRef.current?.savePending()
      if (sessionPatientId !== patientId) setActiveDraft(null)
      setSessionPatientId(patientId)
      setSessionsOpen(true)
      setSpace('sessions')
    } catch (reason) { setError(String(reason)) }
    finally { setBusy(false) }
  }

  const openAgendaForRecord = patientId => {
    setAgendaRecordPatientId(patientId)
    setQuickStart(true)
    setStartAvulsaSignal(value => value + 1)
    setAgendaOpen(true)
    setSpace('agenda')
  }

  const loadSyntheticDemo = async () => {
    if (!status?.unlocked || busyRef.current) return
    if (!window.confirm('Carregar dados fictícios de demonstração no cofre atual? A ação adiciona pacientes, modelos, compromissos e sessões Exemplo Demo; não apaga dados existentes. Se já estiverem presentes, não serão duplicados.')) return
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await seedSyntheticDemo()
      const { patients: createdPatients, templates, series, sessions } = result.created
      setMessage(`Demonstração disponível: ${createdPatients} paciente(s), ${templates} modelo(s), ${series} compromisso(s) e ${sessions} sessão(ões) adicionados. ${result.patientIds.length} pacientes Exemplo Demo no cofre.`)
    } catch (reason) {
      setError(`Não foi possível concluir a demonstração: ${String(reason)}. Os dados já criados foram preservados; confira a lista antes de tentar novamente.`)
    } finally {
      try {
        await loadPatients()
        await refreshWorkspace()
        setQuery('')
        setSpace('patients')
      } catch (reason) { setError(`Não foi possível atualizar a visualização após a demonstração: ${String(reason)}. Use Atualizar lista.`) }
      setBusy(false)
    }
  }

  return <main className={`vault-page ${status?.unlocked ? 'vault-page-unlocked' : ''}`}>
    <section className="vault-card">
      <header className="vault-header"><div><p className="vault-eyebrow">CÍRCULO</p><h1>Círculo</h1><p>Um lugar para organizar o cuidado.</p></div>{status?.unlocked && space !== 'settings' && <button disabled={busy} className="vault-secondary vault-header-lock" onClick={() => lock(false)}>Bloquear</button>}</header>
      {updateState.phase === 'available' && <aside className="vault-updater" role="status"><strong>Atualização disponível: Círculo {updateState.version}</strong><p>Você pode continuar usando o aplicativo. A instalação só começa após sua confirmação.</p><button type="button" onClick={applyUpdate}>Baixar e instalar</button></aside>}
      {['saving', 'downloading', 'installing'].includes(updateState.phase) && <aside className="vault-updater" role="status"><strong>Atualização {updateState.version}</strong><p>{updateState.phase === 'saving' ? 'Salvando rascunho pendente…' : updateState.phase === 'installing' ? 'Download concluído. Iniciando instalação…' : `Baixando atualização…${updateState.total ? ` ${Math.min(100, Math.round(updateState.downloaded / updateState.total * 100))}%` : ''}`}</p>{updateState.phase === 'downloading' && updateState.total && <progress value={updateState.downloaded} max={updateState.total} aria-label="Progresso do download" />}</aside>}
      {updateState.phase === 'forms-open' && <aside className="vault-updater" role="alert"><strong>Feche os formulários antes de instalar Círculo {updateState.version}.</strong><p>Cadastro, vínculo, Agenda ou editores de Sessões podem conter alterações não salvas. Salve o que precisar; depois feche ou descarte as alterações explicitamente.</p><button type="button" onClick={() => { if (!window.confirm('Fechar cadastro, vínculo e Agenda e descartar contexto, adendo ou comportamento não salvos em Sessões?')) return; try { sessionsRef.current?.discardOtherUnsavedEditors(); setPatientFormOpen(false); setEditing(null); setForm(emptyPatientForm()); clearParties(); setAgendaOpen(false); setUpdateState({ phase: 'available', version: updateState.version }) } catch (reason) { setUpdateState({ phase: 'forms-open', version: updateState.version, error: String(reason) }) } }}>Descartar edições e fechar formulários</button><button type="button" className="vault-secondary" onClick={applyUpdate}>Tentar novamente</button>{updateState.error && <p>{updateState.error}</p>}</aside>}
      {updateState.phase === 'install-error' && <aside className="vault-updater" role="alert"><strong>Não foi possível instalar Círculo {updateState.version}.</strong><p>{updateState.error}</p><button type="button" onClick={retryUpdateCheck}>Verificar e tentar novamente</button></aside>}
      {updateState.phase === 'check-error' && <aside className="vault-updater" role="status"><p>Não foi possível verificar atualizações. Você pode continuar normalmente.</p><button type="button" onClick={retryUpdateCheck}>Tentar novamente</button></aside>}
      {updateState.phase === 'installed' && <aside className="vault-updater" role="status">Atualização {updateState.version} instalada. Reinicie o aplicativo para usar a nova versão.</aside>}
      {!status?.unlocked && <p>Seu espaço local está protegido por senha. Este protótipo não está pronto para atendimento real.</p>}
      {status?.unlocked ? <p className="vault-notice">Protótipo: use somente dados fictícios.</p> : <p className="vault-warning"><strong>Não use dados clínicos reais.</strong> Faltam revisão operacional e legal e validação completa do aplicativo instalado. A senha é solicitada na primeira abertura do dia. A cópia automática é local e depende da senha do cofre; não protege contra perda do dispositivo. Faça também backup manual portátil com senha independente.</p>}
      {error && <p className="vault-error" role="alert">{error}</p>}
      {message && <p className="vault-ok" role="status">{message}</p>}
      {status?.profileState === 'empty' && !status.initialized && <details className="vault-advanced"><summary>Opções avançadas de restauração</summary><section className="vault-fresh-choice" aria-label="Começar neste dispositivo">
        <h2>Já tem um backup CBK1?</h2>
        <p>Restaure o cofre existente diretamente neste dispositivo. Você precisará do arquivo, da senha independente do backup e de uma nova senha local. Verificar o arquivo não cria nem substitui um cofre.</p>
        <button type="button" disabled={busy} aria-expanded={freshRestoreOpen} onClick={() => { setFreshRestoreOpen(true); setError(''); setMessage('') }}>Restaurar backup existente</button>
        {freshRestoreOpen && <div className="vault-restore">
          <button type="button" className="vault-secondary" disabled={busy} onClick={() => { setFreshRestoreOpen(false); setPreview(null); setBackupPassword(''); setLocalRestorePassword('') }}>Voltar à criação de cofre</button>
          <p>1. Digite a senha do backup e selecione o arquivo CBK1. 2. Confira a verificação. 3. Crie uma nova senha local e confirme a restauração.</p>
          <label htmlFor="fresh-backup-password">Senha independente do backup (mínimo de 12 caracteres)</label>
          <input id="fresh-backup-password" type="password" autoComplete="off" value={backupPassword} onChange={event => { setBackupPassword(event.target.value); setPreview(null); setLocalRestorePassword('') }} />
          <button type="button" disabled={busy || backupPassword.length < 12} onClick={selectBackup}>Selecionar e verificar backup</button>
          {preview && <div className="vault-restore">
            <p>Backup verificado · formato v1 · banco v{preview.schemaVersion} · {new Date(preview.createdAt * 1000).toLocaleString('pt-BR')} · {Math.ceil(preview.sizeBytes / 1024)} KiB. Nenhum conteúdo clínico é mostrado.</p>
            {preview.profileState === 'empty' && !preview.replacesExisting ? <><p>O backup será restaurado neste perfil vazio. A senha do backup lê o arquivo; a nova senha local protegerá o cofre neste dispositivo.</p><label htmlFor="fresh-local-password">Nova senha local (mínimo de 12 caracteres)</label><input id="fresh-local-password" type="password" autoComplete="new-password" value={localRestorePassword} onChange={event => setLocalRestorePassword(event.target.value)} /><button type="button" disabled={busy || localRestorePassword.length < 12} onClick={restoreBackup}>Confirmar restauração</button></> : <p role="alert" className="vault-warning">Este backup não está disponível para restauração em um perfil vazio. Nenhum cofre foi criado ou substituído.</p>}
          </div>}
        </div>}
      </section></details>}
      {!status ? <p>Verificando cofre...</p> : status.profileState === 'incomplete' ? <div role="alert" className="vault-warning"><strong>Perfil local incompleto.</strong> Existe um banco ou envelope de chave sem o par íntegro. Os arquivos existentes serão preservados. Se o envelope estiver íntegro, uma cópia automática local validada pode recuperar o banco. A restauração de backup portátil está indisponível enquanto o perfil permanecer incompleto; é possível selecionar e verificar o arquivo, mas não restaurá-lo neste estado.</div> : !status.unlocked && !freshRestoreOpen ? <form onSubmit={enter}>
        <label htmlFor="vault-password">{status.initialized ? 'Senha do cofre' : 'Crie uma senha local (mínimo de 12 caracteres)'}</label>
        <input id="vault-password" type="password" autoComplete={status.initialized ? 'current-password' : 'new-password'} minLength={status.initialized ? undefined : 12} required value={password} onChange={event => setPassword(event.target.value)} />
        <button disabled={busy} type="submit">{status.initialized ? 'Desbloquear' : 'Criar cofre cifrado'}</button>
      </form> : !status.unlocked ? null : <div className="vault-workspace">
        <nav className="vault-nav" aria-label="Espaços do Círculo">
          <button type="button" aria-current={space === 'home' ? 'page' : undefined} onClick={() => { setHomeAgenda({ state: 'loading', items: [] }); setSpace('home') }}>Início</button>
          <button type="button" aria-current={space === 'patients' ? 'page' : undefined} onClick={() => setSpace('patients')}>Pacientes</button>
          <button type="button" aria-label="Abrir Agenda" aria-current={space === 'agenda' ? 'page' : undefined} onClick={() => { setAgendaRecordPatientId(''); setQuickStart(false); setAgendaOpen(true); setSpace('agenda') }}>Agenda</button>
          <button type="button" aria-label="Abrir sessões sintéticas" aria-current={space === 'sessions' ? 'page' : undefined} onClick={() => { setSessionsOpen(true); setSpace('sessions') }}>Sessões</button>
          <button type="button" aria-current={space === 'analytics' ? 'page' : undefined} onClick={() => setSpace('analytics')}>Análises</button>
          <button type="button" className="vault-nav-settings" aria-current={space === 'settings' ? 'page' : undefined} onClick={() => setSpace('settings')}>Ajustes</button>
        </nav>
        {space === 'home' && <section className="vault-panel vault-home" aria-label="Início">
          <p className="vault-eyebrow">SEU ESPAÇO</p><h2>Olá, por onde começamos?</h2><p>Escolha uma área para continuar.</p>
          <div className="vault-home-actions">
            <button type="button" onClick={() => setSpace('patients')}><span aria-hidden="true">◯</span><strong>Pacientes</strong><small>Cadastros e vínculos</small></button>
            <button type="button" onClick={() => { setAgendaRecordPatientId(''); setQuickStart(false); setAgendaOpen(true); setSpace('agenda') }}><span aria-hidden="true">▦</span><strong>Agenda</strong><small>Compromissos e horários</small></button>
            <button type="button" onClick={() => { setAgendaRecordPatientId(''); setQuickStart(true); setAgendaOpen(true); setStartAvulsaSignal(value => value + 1); setSpace('agenda') }}><span aria-hidden="true">✎</span><strong>Registrar sessão</strong><small>Crie e inicie em seguida</small></button>
            <button type="button" onClick={() => setSpace('analytics')}><span aria-hidden="true">▥</span><strong>Análises</strong><small>Resumo das sessões</small></button>
            <button type="button" disabled={busy || !status?.unlocked} onClick={loadSyntheticDemo}><span aria-hidden="true">✳</span><strong>Carregar dados fictícios de demonstração</strong><small>Adiciona exemplos ao cofre atual</small></button>
          </div>
          <div className="vault-home-preview"><section><h3>Pacientes</h3>{patients.filter(item => item.archivedAt == null).length ? <ul>{patients.filter(item => item.archivedAt == null).slice(0, 3).map(item => <li key={item.id}>{item.name}</li>)}</ul> : <p>Nenhum paciente cadastrado ainda.</p>}<button type="button" className="vault-secondary" onClick={() => setSpace('patients')}>Ver pacientes</button></section><section><h3>Agenda de hoje</h3>{homeAgenda.state === 'loading' ? <p>Carregando compromissos...</p> : homeAgenda.state === 'error' ? <><p>Não foi possível consultar a agenda agora.</p><button type="button" className="vault-secondary" onClick={() => { setHomeAgenda({ state: 'loading', items: [] }); setHomeAgendaRetry(value => value + 1) }}>Tentar novamente</button></> : homeAgenda.items.length ? <ul>{homeAgenda.items.slice(0, 3).map(item => <li key={item.id}>{item.start} · {patients.find(patient => patient.id === item.patientId)?.name || 'Paciente'}{item.status === 'completed' ? ' · realizado' : ''}</li>)}</ul> : <p>Nenhum compromisso para hoje.</p>}<button type="button" className="vault-secondary" onClick={() => { setAgendaOpen(true); setSpace('agenda') }}>Ver agenda</button></section></div>
        </section>}
        {space === 'analytics' && <section className="vault-panel" aria-label="Análises"><div className="vault-section-heading"><div><p className="vault-eyebrow">ANÁLISES</p><h2>Análises</h2></div></div><DesktopAnalytics /></section>}
        <section className="vault-panel" hidden={space !== 'patients'} aria-label="Pacientes"><div className="vault-section-heading"><div><p className="vault-eyebrow">PACIENTES</p><h2>Pacientes</h2></div><button type="button" onClick={() => setPatientFormOpen(true)}>Novo cadastro</button></div>
        <p>Use somente identidades inventadas. Arquivar é reversível; não há exclusão definitiva nesta etapa.</p>
        {patientFormOpen && <form className="vault-form-panel" onSubmit={submitPatient} aria-label={editing ? 'Editar cadastro' : 'Novo cadastro'}>
          <label htmlFor="clinical-name">Nome</label><input id="clinical-name" maxLength={200} required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} />
          <label htmlFor="clinical-age">Idade em anos (opcional)</label><input id="clinical-age" inputMode="numeric" value={form.age} onChange={event => setForm({ ...form, age: event.target.value })} />
          <label htmlFor="clinical-self-requester">O próprio paciente solicitou o atendimento?</label><select id="clinical-self-requester" value={form.selfRequester} onChange={event => setForm({ ...form, selfRequester: event.target.value })}><option value="">Não informado</option><option value="yes">Sim</option><option value="no">Não</option></select>
          <label htmlFor="clinical-modality">Modalidade</label><select id="clinical-modality" value={form.preferredModality} onChange={event => setForm({ ...form, preferredModality: event.target.value })}><option value="">Não informada</option><option>Presencial</option><option>Online</option></select>
          <div><button disabled={busy} type="submit">{editing ? 'Salvar alterações' : 'Salvar paciente'}</button>{editing && <button type="button" className="vault-secondary" onClick={() => { setEditing(null); setForm(emptyPatientForm()) }}>Cancelar edição</button>}</div>
        </form>}
        <button disabled={busy} className="vault-secondary" onClick={async () => { setBusy(true); setError(''); try { await loadPatients() } catch (reason) { setError(String(reason)) } finally { setBusy(false) } }}>Atualizar lista</button>
        <label htmlFor="clinical-search">Buscar cadastro</label><input id="clinical-search" value={query} onChange={event => setQuery(event.target.value)} />
        <label className="vault-checkbox"><input type="checkbox" checked={showArchived} onChange={async event => { const checked = event.target.checked; setShowArchived(checked); try { await loadPatients(checked) } catch (reason) { setError(String(reason)) } }} /> Mostrar arquivados</label>
        {patients.filter(patient => patient.name.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'))).length ? <ul className="vault-patients">{patients.filter(patient => patient.name.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'))).map(patient => <li key={patient.id}><strong>{patient.name}</strong><span>{patient.age == null ? 'Idade não informada' : `${patient.age} anos`} · Modalidade: {patient.preferredModality || 'não informada'}</span>{patient.archivedAt != null && <em> · Arquivado</em>}<div>{patient.archivedAt == null && <><button type="button" disabled={busy} onClick={() => openPatientSessions(patient.id)}>Registrar comportamento / evolução</button><button disabled={busy} className="vault-secondary" onClick={() => { setPatientFormOpen(true); setEditing(patient); setForm({ name: patient.name, age: patient.age == null ? '' : String(patient.age), selfRequester: patient.selfRequester || '', preferredModality: patient.preferredModality || '' }) }}>Editar</button><button className="vault-secondary" onClick={() => selectPartyPatient(partyPatientId === patient.id ? '' : patient.id)}>{partyPatientId === patient.id ? 'Fechar vínculos' : 'Pessoas vinculadas'}</button></>}<button disabled={busy} className="vault-secondary" onClick={() => changeArchive(patient)}>{patient.archivedAt == null ? 'Arquivar' : 'Restaurar'}</button></div></li>)}</ul> : <p>Nenhum paciente encontrado.</p>}
        {partyPatientId && <section className="vault-parties" aria-label="Pessoas vinculadas ao paciente"><h3>Vínculos de {patients.find(patient => patient.id === partyPatientId)?.name}</h3><p>Registre somente o vínculo e seus papéis; nenhum contato é solicitado.</p><form onSubmit={saveParty} aria-label={editingParty ? 'Editar vínculo' : 'Novo vínculo'}><label htmlFor="party-name">Nome da pessoa ou instituição</label><input id="party-name" maxLength={200} required value={partyForm.name} onChange={event => setPartyForm({ ...partyForm, name: event.target.value })} /><label htmlFor="party-relation">Relação com o paciente</label><select id="party-relation" value={partyForm.relation} onChange={event => setPartyForm({ ...partyForm, relation: event.target.value })}>{relationOptions.map(value => <option key={value}>{value}</option>)}</select><fieldset><legend>Papéis (selecione ao menos um)</legend>{[['requester', 'Solicitante'], ['legalGuardian', 'Responsável legal'], ['administrativeContact', 'Contato administrativo']].map(([key, label]) => <label className="vault-checkbox" key={key}><input type="checkbox" checked={partyForm.roles[key]} onChange={event => setPartyForm({ ...partyForm, roles: { ...partyForm.roles, [key]: event.target.checked } })} />{label}</label>)}</fieldset><div><button disabled={busy || !Object.values(partyForm.roles).some(Boolean)} type="submit">{editingParty ? 'Salvar vínculo' : 'Adicionar vínculo'}</button>{editingParty && <button type="button" className="vault-secondary" onClick={() => { setEditingParty(null); setPartyForm(emptyPartyForm()) }}>Cancelar edição do vínculo</button>}</div></form><label className="vault-checkbox"><input type="checkbox" checked={showArchivedParties} onChange={async event => { const checked = event.target.checked; setShowArchivedParties(checked); try { await loadParties(partyPatientId, checked) } catch (reason) { setError(String(reason)) } }} /> Mostrar vínculos arquivados</label>{parties.length ? <ul className="vault-patients">{parties.map(party => <li key={party.id}><strong>{party.name}</strong> · {party.relation}{party.archivedAt != null && <em> · Arquivado</em>}<small>{[['requester', 'Solicitante'], ['legalGuardian', 'Responsável legal'], ['administrativeContact', 'Contato administrativo']].filter(([key]) => party.roles?.[key]).map(([, label]) => label).join(' · ')}</small><div>{party.archivedAt == null && <button disabled={busy} className="vault-secondary" onClick={() => { setEditingParty(party); setPartyForm({ name: party.name, relation: party.relation, roles: { ...party.roles } }) }}>Editar vínculo</button>}<button disabled={busy} className="vault-secondary" onClick={() => changePartyArchive(party)}>{party.archivedAt == null ? 'Arquivar vínculo' : 'Restaurar vínculo'}</button></div></li>)}</ul> : <p>Nenhum vínculo cadastrado.</p>}</section>}
        
        </section>
        <section className="vault-panel" hidden={space !== 'agenda'} aria-label="Agenda"><div className="vault-section-heading"><div><p className="vault-eyebrow">AGENDA</p><h2>Compromissos</h2></div><button type="button" className="vault-secondary" onClick={() => setSpace('patients')}>Fechar Agenda</button></div>{agendaRecordPatientId && <p role="status">Paciente {patients.find(patient => patient.id === agendaRecordPatientId)?.name || 'selecionado'} já selecionado para um compromisso avulso. Confira data e horário e use “Criar e iniciar sessão”; você também pode iniciar uma sessão em um compromisso existente.</p>}{agendaOpen && <DesktopAgenda patients={patients} initialPatientId={agendaRecordPatientId} onChanged={refreshWorkspace} onStartSession={startSessionFromAgenda} startAvulsaSignal={startAvulsaSignal} quickStart={quickStart} onQuickStartConsumed={() => setQuickStart(false)} />}</section>
        <section className="vault-panel" hidden={space !== 'sessions'} aria-label="Sessões e registros"><div className="vault-section-heading"><div><p className="vault-eyebrow">SESSÕES / REGISTROS</p><h2>Sessões e registros</h2></div><button type="button" className="vault-secondary" disabled={busy} onClick={async () => { await toggleSessions(); if (sessionsOpen) setSpace('patients') }}>Fechar sessões sintéticas</button></div><div className="vault-session-start"><p>Para começar um novo registro, crie ou escolha um compromisso na Agenda. Você também pode retomar um rascunho abaixo.</p><button type="button" onClick={() => { setAgendaRecordPatientId(''); setAgendaOpen(true); setSpace('agenda') }}>Criar compromisso avulso ou escolher agendado</button></div>{sessionsOpen && <DesktopSessions ref={sessionsRef} key={activeDraft?.id || 'timeline'} patientId={sessionPatientId} onPatientChange={setSessionPatientId} activeDraft={activeDraft} onDraftChange={setActiveDraft} onChanged={refreshWorkspace} onSessionMessage={setMessage} onStartRecord={openAgendaForRecord} />}</section>
        <section className="vault-panel" hidden={space !== 'settings'} aria-label="Ajustes"><p className="vault-eyebrow">AJUSTES</p><h2>Proteção e dados locais</h2><p className="vault-ok">Cofre desbloqueado neste dispositivo.</p><p className="vault-warning"><strong>Não use dados clínicos reais.</strong> Faltam revisão operacional e legal e validação completa do aplicativo instalado. A senha é solicitada na primeira abertura do dia. A cópia automática é local e depende da senha do cofre; não protege contra perda do dispositivo. Faça também backup manual portátil com senha independente.</p><p className="vault-idle-note">Ao mudar o dia, o cofre pode pedir a senha novamente. Use Bloquear para fechar agora.</p><button disabled={busy} className="vault-secondary" onClick={() => lock(false)}>Bloquear</button>
      {status && <section className="vault-backup" aria-label="Backup e restauração">
        <h2>Backup e restauração manual</h2>
        <p>O pacote portátil CBK1 contém cadastros, Agenda, rascunhos, sessões sintéticas e seus snapshots de indicadores, cifrados com senha independente. Não há conta nem sincronização externa. Um backup manual existente nunca é sobrescrito automaticamente.</p>
        <h3>Cópia automática local</h3>
        <h3>Artefatos locais de recuperação</h3>
        <p>Inspeção local agregada: sem nomes de arquivos nem conteúdo. Quarentenas, cópias pré-restauração, arquivos ativos e itens não validados nunca podem ser apagados aqui.</p>
        {status.unlocked && <button type="button" disabled={busy} className="vault-secondary" onClick={inspectRecovery}>Inspecionar artefatos locais</button>}
        {recoveryInventory && <div aria-live="polite">
          <ul>{recoveryInventory.categories.map(item => <li key={item.category}><strong>{item.category}</strong>: {item.count} item(ns), {Math.ceil(item.bytes / 1024)} KiB{item.sizeComplete === false ? ' (tamanho parcial; item inacessível preservado)' : ''}{item.oldestAt ? ` · datas aproximadas ${new Date(item.oldestAt * 1000).toLocaleDateString('pt-BR')}–${new Date(item.newestAt * 1000).toLocaleDateString('pt-BR')}` : ''}</li>)}</ul>
          {recoveryInventory.cleanupBlocked && <p className="vault-warning">Limpeza indisponível: existe marcador de recuperação ou artefato de staging. Nada foi removido.</p>}
          {recoveryInventory.eligibleCount > 0 && <><p>{recoveryInventory.eligibleCount} cópia(s) pré-migração cifradas são tecnicamente elegíveis para remoção (aprox. {Math.ceil(recoveryInventory.eligibleBytes / 1024)} KiB), mas ainda podem conter dados recuperáveis.</p><button type="button" disabled aria-describedby="recovery-cleanup-disabled">Limpar cópias pré-migração selecionáveis</button><p id="recovery-cleanup-disabled" className="vault-warning">Limpeza temporariamente desabilitada: ainda não foi comprovada proteção contra troca concorrente do arquivo após a prévia. Os artefatos serão preservados.</p></>}
          {recoveryInventory.eligibleCount === 0 && !recoveryInventory.cleanupBlocked && <p>Nenhum artefato elegível para limpeza. Itens incertos são preservados.</p>}
        </div>}
        <p>A cópia cifrada fica nos dados locais do aplicativo e usa a chave do cofre. Última verificação nesta sessão: {autoBackup?.lastVerifiedAt ? new Date(autoBackup.lastVerifiedAt * 1000).toLocaleString('pt-BR') : 'não confirmada'}.</p>
        {autoBackup?.present && !autoBackup?.available && <p>Cópia local encontrada, mas não validada{status.unlocked ? ' ou inválida.' : ' enquanto o cofre está bloqueado.'}</p>}
        {autoBackup?.dirty && <p role="alert" className="vault-error">Cópia automática pendente: {autoBackup.error || 'tente novamente'}. A última alteração pode não estar na cópia.</p>}
        {status.unlocked && <button type="button" disabled={busy} className="vault-secondary" onClick={retryAutoBackup}>Atualizar cópia automática agora</button>}
        {!status.unlocked && autoBackup?.present && autoBackup?.keyEnvelopePresent && <div><label htmlFor="local-auto-password">Senha local para verificar cópia automática</label><input id="local-auto-password" type="password" value={localAutoPassword} onChange={event => { setLocalAutoPassword(event.target.value); setLocalAutoValidated(false) }} /><button type="button" disabled={busy || !localAutoPassword} onClick={validateLocalAutoBackup}>Verificar cópia automática local</button>{localAutoValidated && <><p role="status">Cópia automática local validada.</p><button type="button" disabled={busy} onClick={restoreLocalAutoBackup}>Recuperar cópia automática local</button></>}</div>}
        <label htmlFor="backup-password">Senha independente do backup (mínimo de 12 caracteres)</label>
        <input id="backup-password" type="password" autoComplete="new-password" minLength={12} value={backupPassword} onChange={event => setBackupPassword(event.target.value)} />
        {status.unlocked && <button disabled={busy || backupPassword.length < 12} onClick={createBackup}>Criar backup cifrado</button>}
        <button disabled={busy || backupPassword.length < 12} className="vault-secondary" onClick={selectBackup}>Selecionar e verificar backup</button>
        {preview && <div className="vault-restore">
          <p>Backup verificado · formato v1 · banco v{preview.schemaVersion} · {new Date(preview.createdAt * 1000).toLocaleString('pt-BR')} · {Math.ceil(preview.sizeBytes / 1024)} KiB. Nenhum conteúdo clínico é mostrado.</p>
          <p className="vault-warning">{preview.profileState === 'legacy-unsupported' ? 'Este backup usa um esquema legado cuja migração não foi validada. Ele foi preservado, não será restaurado e nenhum arquivo será alterado.' : preview.profileState === 'empty' ? 'O backup v5 será restaurado neste perfil vazio. Defina uma nova senha local; a senha independente do backup continuará sendo usada apenas para ler o arquivo portátil.' : preview.profileState === 'incomplete-profile-unsupported' ? 'O perfil local não está vazio ou está incompleto. A restauração portátil não foi validada para este estado; os arquivos serão preservados sem alteração.' : 'A restauração substituirá o único perfil local após criar uma cópia de segurança cifrada.'}</p>
          {preview.replacesExisting && !status.unlocked && <p>Desbloqueie o cofre local antes de restaurar sobre este perfil.</p>}
          <label htmlFor="local-restore-password">{preview.replacesExisting ? 'Senha atual do cofre local' : 'Nova senha local'} (mínimo de 12 caracteres)</label>
          <input id="local-restore-password" type="password" autoComplete={preview.replacesExisting ? 'current-password' : 'new-password'} value={localRestorePassword} onChange={event => setLocalRestorePassword(event.target.value)} />
          <button disabled={busy || localRestorePassword.length < 12 || !['ready', 'empty'].includes(preview.profileState) || (preview.replacesExisting && !status.unlocked)} onClick={restoreBackup}>Confirmar restauração</button>
        </div>}
      </section>}
      <details className="vault-licenses"><summary>Licenças de terceiros</summary>
        <p>SQLCipher Community Edition — Copyright (c) 2008-2026, ZETETIC, LLC.</p>
        <pre>{sqlcipherLicense}</pre>
        <p>OpenSSL 3.x — Copyright (c) The OpenSSL Project. All rights reserved. Apache License 2.0.</p>
        <pre>{opensslLicense}</pre>
        <p>SQLite é disponibilizado em domínio público.</p>
      </details></section></div>}
      {status && !status.unlocked && !(status.profileState === 'empty' && !status.initialized) && <details className="vault-advanced" open={status.profileState === 'incomplete' ? true : undefined}><summary>Opções avançadas de backup e restauração</summary><section className="vault-backup" aria-label="Backup e restauração">
        <p>A restauração exige verificação da cópia e confirmação explícita.</p>
        {autoBackup?.dirty && <p role="alert" className="vault-error">Cópia automática pendente: {autoBackup.error || 'tente novamente'}. A última alteração pode não estar na cópia.</p>}
        {autoBackup?.present && !autoBackup?.available && <p>Cópia local encontrada, mas não validada enquanto o cofre está bloqueado.</p>}
        {autoBackup?.present && autoBackup?.keyEnvelopePresent && <div><label htmlFor="local-auto-password">Senha local para verificar cópia automática</label><input id="local-auto-password" type="password" value={localAutoPassword} onChange={event => { setLocalAutoPassword(event.target.value); setLocalAutoValidated(false) }} /><button type="button" disabled={busy || !localAutoPassword} onClick={validateLocalAutoBackup}>Verificar cópia automática local</button>{localAutoValidated && <><p role="status">Cópia automática local validada.</p><button type="button" disabled={busy} onClick={restoreLocalAutoBackup}>Recuperar cópia automática local</button></>}</div>}
        <label htmlFor="backup-password">Senha independente do backup (mínimo de 12 caracteres)</label><input id="backup-password" type="password" autoComplete="new-password" minLength={12} value={backupPassword} onChange={event => setBackupPassword(event.target.value)} /><button disabled={busy || backupPassword.length < 12} className="vault-secondary" onClick={selectBackup}>Selecionar e verificar backup</button>
        {preview && <div className="vault-restore"><p>Backup verificado · formato v1 · banco v{preview.schemaVersion} · {new Date(preview.createdAt * 1000).toLocaleString('pt-BR')} · {Math.ceil(preview.sizeBytes / 1024)} KiB. Nenhum conteúdo clínico é mostrado.</p><p className="vault-warning">{preview.profileState === 'legacy-unsupported' ? 'Este backup usa um esquema legado cuja migração não foi validada. Ele foi preservado, não será restaurado e nenhum arquivo será alterado.' : preview.profileState === 'incomplete-profile-unsupported' ? 'O perfil local não está vazio ou está incompleto. A restauração portátil não foi validada para este estado; os arquivos serão preservados sem alteração.' : 'Desbloqueie o cofre local antes de restaurar sobre este perfil.'}</p><label htmlFor="local-restore-password">Senha atual do cofre local (mínimo de 12 caracteres)</label><input id="local-restore-password" type="password" autoComplete="current-password" value={localRestorePassword} onChange={event => setLocalRestorePassword(event.target.value)} /><button disabled>Confirmar restauração</button></div>}
      </section></details>}
    </section>
  </main>
}




