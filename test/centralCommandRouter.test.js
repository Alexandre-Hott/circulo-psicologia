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

test('corrige confusões frequentes do reconhecimento local para "sessão" sem alargar o comando', () => {
  for (const spoken of [
    'Marcar se são semanal para Ana Clara toda quinta às quinze horas',
    'Adiciona uma seção semanal para Ana Clara toda quinta às quinze horas',
  ]) {
    const result = parseCentralCommand({ text: spoken, context, referenceDate: '2026-09-30' })
    assert.equal(result.status, 'draft', spoken)
    assert.equal(result.intent.type, 'appointment.recurring.create')
    assert.equal(result.intent.draft.start, '15:00')
  }
})

test('corrige a forma sintética observada para sessão semanal e respeita o escopo exato', () => {
  for (const transcript of [
    'Marcar Cesã Libra Óssemanal para Ana Clara toda quinta às quinze horas;',
    'Marcar sesã, Libra Óssemanal para Ana Clara, toda quinta, esse 15 horas.',
  ]) {
    const result = parseCentralCommand({ text: transcript, context, referenceDate: '2026-09-30' })
    assert.equal(result.status, 'draft', transcript)
    assert.equal(result.intent.type, 'appointment.recurring.create')
    assert.equal(result.intent.draft.patientId, 'patient-ana')
    assert.equal(result.intent.draft.weekday, 4)
    assert.equal(result.intent.draft.start, '15:00')
  }
  assert.equal(parseCentralCommand({ text: 'Cesã Libra Óssemanal sem paciente ou dia' }).status, 'clarification')
})

test('decodificação beam preserva rascunho se reconhece o dia e recusa quando a reamostragem o omite', () => {
  const preservedWeekday = parseCentralCommand({
    text: 'Marcar sesã libra óssemanal para Ana Clara, toda quinta, esse 15 horas.',
    context,
    referenceDate: '2026-09-30',
  })
  assert.equal(preservedWeekday.status, 'draft')
  assert.equal(preservedWeekday.intent.draft.weekday, 4)
  assert.equal(preservedWeekday.intent.draft.start, '15:00')

  const omittedWeekday = parseCentralCommand({
    text: 'Marcar sesã libra óssemanal para Ana Clara, toda 15 horas.',
    context,
    referenceDate: '2026-09-30',
  })
  assert.equal(omittedWeekday.status, 'clarification')
  assert.match(omittedWeekday.message, /dia da semana/u)
  assert.equal(omittedWeekday.intent, undefined)
})

test('transcrição SAPI com erro de separação identifica comportamento, mas small ambíguo não vira série', () => {
  const behavior = parseCentralCommand({
    text: 'Registrar comportamento pede ajuda para Ana Clara na Sessã Libra-O.',
    context,
  })
  assert.equal(behavior.status, 'draft')
  assert.equal(behavior.intent.patch.value, 'behavior-regulation')

  const smallAppointment = parseCentralCommand({
    text: 'Marcar sessã-libra osemanal para Ana Clara toda quinta-anésse 15 horas.',
    context,
    referenceDate: '2026-09-30',
  })
  assert.equal(smallAppointment.status, 'clarification')
  assert.equal(smallAppointment.intent, undefined)
})

test('corrige somente a variante observada “Sessã Libra O” ao nomear sessão de comportamento', () => {
  const result = parseCentralCommand({
    text: 'Registrar comportamento pede ajuda para Ana Clara na Sessã Libra O.',
    context,
  })
  assert.equal(result.status, 'draft')
  assert.equal(result.intent.patch.value, 'behavior-regulation')
  assert.equal(result.intent.target.sessionDraftId, session.id)
})

test('transcrição do backend nativo não inventa o dia da semana quando Whisper o omite', () => {
  const result = parseCentralCommand({
    text: 'Marcar sesalibra óssemanal para Ana Clara, toda 15 horas.',
    context,
    referenceDate: '2026-09-30',
  })
  assert.equal(result.status, 'clarification')
  assert.match(result.message, /dia da semana/u)
  assert.equal(result.intent, undefined)
})

test('corrige a frase de cadastro sintética transcrita como "cada estrar paciente"', () => {
  const result = parseCentralCommand({ text: 'Cada estrar paciente bia ficticia com 9 anos' })
  assert.equal(result.status, 'draft')
  assert.deepEqual(result.intent, { type: 'patient.create', draft: { name: 'bia ficticia', age: 9 } })
})

test('idade falada explicitamente é separada do nome do paciente no cadastro', () => {
  const result = parseCentralCommand({ text: 'Cadastrar paciente Bia Fictícia com nove anos.' })
  assert.equal(result.status, 'draft')
  assert.deepEqual(result.intent, { type: 'patient.create', draft: { name: 'Bia Fictícia', age: 9 } })

  const unsupported = parseCentralCommand({ text: 'Cadastrar paciente Bia Fictícia com cento e vinte e um anos' })
  assert.equal(unsupported.status, 'clarification')
  assert.match(unsupported.message, /idade deve ser um número inteiro/u)

  const syntheticWhisper = parseCentralCommand({ text: 'Cadastrar paciente bia fictância com 9 anos.' })
  assert.equal(syntheticWhisper.status, 'draft')
  assert.equal(syntheticWhisper.intent.draft.age, 9)
  assert.doesNotMatch(syntheticWhisper.intent.draft.name, /com 9 anos/u)
})

test('aceita pausa pontuada pelo Whisper entre “paciente” e o nome no rascunho de cadastro', () => {
  const result = parseCentralCommand({ text: 'Cadastrar paciente. Bia Fictância com 9 anos' })
  assert.equal(result.status, 'draft')
  assert.deepEqual(result.intent, { type: 'patient.create', draft: { name: 'Bia Fictância', age: 9 } })
})

test('recupera variantes sintéticas restritas da palavra sessão sem alterar paciente/comportamento', () => {
  const transcript = 'Registrar comportamento, pede ajuda para Ana Clara na sesalibra-o.'
  const result = parseCentralCommand({ text: transcript, context })
  assert.equal(result.status, 'draft')
  assert.equal(result.intent.type, 'session.draft.update')
  assert.equal(result.intent.target.patientId, 'patient-ana')
  assert.equal(result.intent.patch.label, 'Pede ajuda')
  assert.match(result.notes.join(' '), /apenas nesta sessão/u)
})

test('infere frequência semanal e converte o horário da tarde na transcrição sintética', () => {
  const result = parseCentralCommand({
    text: 'Cria uma sessão para Ana Clara toda quinta às três da tarde',
    context,
    referenceDate: '2026-09-30',
  })
  assert.equal(result.status, 'draft')
  assert.equal(result.intent.draft.frequency, 'Semanal')
  assert.equal(result.intent.draft.start, '15:00')
  assert.equal(result.intent.draft.end, '15:50')
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

test('recusa pedidos que nomeiam dois pacientes mesmo quando um nome é mais longo', () => {
  const maria = { id: 'patient-maria', name: 'Maria', age: 10, archivedAt: null }
  const both = { ...context, patients: [...patients, maria] }
  const behavior = parseCentralCommand({
    text: 'Marcar comportamento Pede ajuda para Ana Clara na sessão de Maria',
    context: both,
  })
  assert.equal(behavior.status, 'clarification')
  assert.match(behavior.message, /mais de um paciente/u)
  assert.equal(behavior.intent, undefined)

  const appointment = parseCentralCommand({
    text: 'Marcar sessão semanal para Ana Clara e Maria toda quinta às 15 horas',
    context: both,
    referenceDate: '2026-09-30',
  })
  assert.equal(appointment.status, 'clarification')
  assert.match(appointment.message, /mais de um paciente/u)

  const nestedName = parseCentralCommand({
    text: 'Marcar sessão semanal para Ana Clara toda quinta às 15 horas',
    context: { ...both, patients: [...both.patients, { id: 'patient-ana-short', name: 'Ana', archivedAt: null }] },
    referenceDate: '2026-09-30',
  })
  assert.equal(nestedName.status, 'draft')
  assert.equal(nestedName.intent.draft.patientId, 'patient-ana')
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
