import test from 'node:test'
import assert from 'node:assert/strict'
import { formatCentralCommandPreview, parseCentralCommand } from '../src/centralCommandRouter.js'

const patients = [
  { id: 'patient-ana', name: 'Ana Clara', age: 8, archivedAt: null },
  { id: 'patient-caio', name: 'Caio Fictício', age: 11, archivedAt: null },
]
const behaviors = [
  { id: 'behavior-regulation', title: 'Pede ajuda', archivedAt: null },
  { id: 'behavior-turn-taking', title: 'Espera a vez', archivedAt: null },
]
const indicators = [
  { id: 'indicator-regulation', name: 'Regulação emocional', labels: ['Ainda não observado', 'Com muito apoio', 'Com algum apoio', 'Com autonomia'] },
]
const session = { id: 'session-draft-ana-001', patientId: 'patient-ana', patientName: 'Ana Clara', originalDate: '2026-09-30' }
const context = { patients, behaviors, indicators, activeSessionDraft: session }

test('prepara cadastro de paciente como intent tipada sem persistir', () => {
  const result = parseCentralCommand({ text: 'Cadastrar paciente Bia de Teste com 8 anos' })
  assert.equal(result.status, 'draft')
  assert.deepEqual(result.intent, { type: 'patient.create', draft: { name: 'Bia de Teste', age: 8 } })
  assert.match(formatCentralCommandPreview(result), /Bia de Teste.*8 anos/u)
})

test('recusa idade fora do intervalo aceito', () => {
  const result = parseCentralCommand({ text: 'Criar paciente Bia com 121 anos' })
  assert.equal(result.status, 'clarification')
  assert.match(result.message, /0 e 120/u)
})

test('prepara uma série semanal exata para paciente existente e explicita os padrões', () => {
  const result = parseCentralCommand({
    text: 'Agendar sessão semanal para Ana Clara toda quinta às 15:00',
    context,
    referenceDate: '2026-09-30',
  })
  assert.equal(result.status, 'draft')
  assert.deepEqual(result.intent, {
    type: 'appointment.recurring.create',
    draft: {
      appointmentType: 'Recorrente', patientId: 'patient-ana', patientName: 'Ana Clara',
      weekday: 4, frequency: 'Semanal', startDate: '2026-09-30', endDate: null,
      start: '15:00', end: '15:50', modality: 'Presencial', meetingLink: '',
    },
  })
  assert.match(result.preview, /Ana Clara: quinta, 15:00–15:50/u)
  assert.match(result.notes.join(' '), /padrão atual do formulário/u)
})

test('aceita formulação curta natural, data válida e modalidade explícita', () => {
  const result = parseCentralCommand({
    text: 'Adiciona uma sessão toda quinta às quinze online para Ana Clara',
    context,
    referenceDate: '2026-09-30',
  })
  assert.equal(result.status, 'draft')
  assert.equal(result.intent.draft.frequency, 'Semanal')
  assert.equal(result.intent.draft.start, '15:00')
  assert.equal(result.intent.draft.modality, 'Online')

  const invalidDate = parseCentralCommand({ text: 'Agendar sessão semanal para Ana Clara toda quinta às 15 com início em 31/02/2026', context, referenceDate: '2026-09-30' })
  assert.equal(invalidDate.status, 'clarification')
  assert.match(invalidDate.message, /data de início válida/u)
})

test('entende horário falado explicitamente como período da tarde e exige esclarecimento quando ambíguo', () => {
  const afternoon = parseCentralCommand({ text: 'Marcar sessão para Ana Clara toda quinta às três da tarde semanal', context, referenceDate: '2026-09-30' })
  assert.equal(afternoon.status, 'draft')
  assert.equal(afternoon.intent.draft.start, '15:00')

  const ambiguous = parseCentralCommand({ text: 'Marcar sessão para Ana Clara toda quinta às 9 semanal', context, referenceDate: '2026-09-30' })
  assert.equal(ambiguous.status, 'clarification')
  assert.match(ambiguous.message, /manhã ou noite/u)
})

test('recusa criação de série quando paciente ou detalhes obrigatórios estão ambíguos', () => {
  const duplicatePatients = [...patients, { id: 'patient-ana-2', name: 'Ana Clara', archivedAt: null }]
  const duplicate = parseCentralCommand({ text: 'Marcar sessão semanal para Ana Clara toda quinta às 15:00', context: { ...context, patients: duplicatePatients }, referenceDate: '2026-09-30' })
  assert.equal(duplicate.status, 'clarification')
  assert.match(duplicate.message, /mais de um paciente/u)

  const missing = parseCentralCommand({ text: 'Marcar sessão semanal para Ana Clara toda quinta', context, referenceDate: '2026-09-30' })
  assert.equal(missing.status, 'clarification')
  assert.match(missing.message, /horário explícito/u)
})

test('seleciona modelo de comportamento somente para paciente e rascunho de sessão nomeados', () => {
  const result = parseCentralCommand({ text: 'Marcar comportamento Pede ajuda para Ana Clara na sessão', context })
  assert.equal(result.status, 'draft')
  assert.deepEqual(result.intent, {
    type: 'session.draft.update',
    target: { patientId: 'patient-ana', patientName: 'Ana Clara', sessionDraftId: 'session-draft-ana-001', sessionDate: '2026-09-30' },
    patch: { field: 'behaviorIds', operation: 'add', value: 'behavior-regulation', label: 'Pede ajuda' },
  })
  assert.match(result.notes.join(' '), /apenas nesta sessão; não define o paciente/u)
})

test('não vincula comportamento a sessão inexistente ou a outro paciente', () => {
  const noSession = parseCentralCommand({ text: 'Marcar comportamento Pede ajuda para Ana Clara na sessão', context: { ...context, activeSessionDraft: null } })
  assert.equal(noSession.status, 'clarification')
  assert.match(noSession.message, /rascunho de sessão específico/u)

  const otherSession = parseCentralCommand({ text: 'Marcar comportamento Pede ajuda para Caio Fictício na sessão', context })
  assert.equal(otherSession.status, 'clarification')
  assert.match(otherSession.message, /Selecione a sessão de Caio Fictício/u)
})

test('prepara valor de escala somente a partir dos rótulos exatos do catálogo', () => {
  const result = parseCentralCommand({ text: 'Registrar indicador Regulação emocional como Com algum apoio na sessão de Ana Clara', context })
  assert.equal(result.status, 'draft')
  assert.equal(result.intent.target.sessionDraftId, session.id)
  assert.deepEqual(result.intent.patch, { field: 'indicators', operation: 'set', value: { id: 'indicator-regulation', value: 2, label: 'Com algum apoio' } })

  const invalid = parseCentralCommand({ text: 'Registrar indicador Regulação emocional como sempre feliz na sessão de Ana Clara', context })
  assert.equal(invalid.status, 'clarification')
  assert.match(invalid.message, /não existe na escala/u)
})

test('mantém conteúdo descritivo literal e vinculado ao campo, paciente e sessão indicados', () => {
  const result = parseCentralCommand({ text: 'Preencher observação da sessão de Ana Clara com pediu ajuda duas vezes', context })
  assert.equal(result.status, 'draft')
  assert.equal(result.intent.target.sessionDraftId, session.id)
  assert.deepEqual(result.intent.patch, { field: 'observation', operation: 'replace', value: 'pediu ajuda duas vezes' })
  assert.match(result.notes.join(' '), /mantido literalmente, sem interpretação clínica/u)
})

test('não transforma comandos destrutivos ou intenções arbitrárias em ação', () => {
  for (const text of ['Apagar paciente Ana Clara', 'Finalizar a sessão de Ana Clara', 'Faça qualquer coisa que achar melhor']) {
    assert.equal(parseCentralCommand({ text, context }).status, 'clarification')
  }
})
