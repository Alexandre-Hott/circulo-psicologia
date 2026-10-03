import test from 'node:test'
import assert from 'node:assert/strict'
import { formatCentralCommandPreview, parseCentralCommand } from '../src/centralCommandRouter.js'
import { inSupportedRange } from '../src/analyticsRange.js'

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

test('abrir biblioteca e contexto usa rotas de leitura e paciente exato ativo', () => {
  for (const text of ['Abrir biblioteca', 'Abra a biblioteca de comportamentos', 'Abrir biblioteca de comportamentos reutilizáveis.']) {
    assert.deepEqual(parseCentralCommand({ text, context }).intent, { type: 'workspace.open', target: { space: 'sessions', section: 'library' } })
  }
  for (const text of ['Abrir contexto do caso de Ana Clara', 'Abra o contexto de Ana Clara.']) {
    assert.deepEqual(parseCentralCommand({ text, context }).intent, { type: 'patient.workspace.open', target: { patientId: 'patient-ana', space: 'context' } })
  }
  for (const text of ['Abrir contexto do caso de Ana', 'Abrir contexto do caso de Ana Clara e Caio Fictício', 'Abrir biblioteca e abrir agenda']) {
    assert.equal(parseCentralCommand({ text, context }).status, 'clarification')
  }
  for (const patients of [[{ id: 'x', name: 'Ana Clara', archivedAt: 1 }], [{ id: 'x', name: 'Ana Clara' }, { id: 'y', name: 'Ana Clara' }]]) {
    assert.equal(parseCentralCommand({ text: 'Abrir contexto do caso de Ana Clara', context: { patients } }).status, 'clarification')
  }
})

test('editar comportamento sem alterações abre modelo exato sem preparar versão nova', () => {
  for (const text of ['Editar comportamento Pede ajuda.', 'Edite o comportamento Pede ajuda', 'Atualizar comportamento Pede ajuda']) {
    assert.deepEqual(parseCentralCommand({ text, context }).intent,
      { type: 'behavior.edit.open', target: { behaviorId: 'behavior-regulation' } })
  }
  for (const list of [[{ id: 'x', title: 'Pede ajuda', archivedAt: 1 }],
    [{ id: 'x', title: 'Pede ajuda' }, { id: 'y', title: 'Pede ajuda' }]]) {
    assert.equal(parseCentralCommand({ text: 'Editar comportamento Pede ajuda', context: { behaviors: list } }).status, 'clarification')
  }
  assert.equal(parseCentralCommand({ text: 'Editar comportamento Pede', context }).status, 'clarification')
  const literal = { behaviors: [{ id: 'literal', title: 'Pede ajuda para o adulto' }] }
  assert.deepEqual(parseCentralCommand({ text: 'Editar comportamento Pede ajuda para o adulto', context: literal }).intent,
    { type: 'behavior.edit.open', target: { behaviorId: 'literal' } })
})

test('editar paciente sem atributos abre formulário por ID, não prepara gravação', () => {
  for (const text of ['Editar paciente Ana Clara.', 'Editar paciente. Ana Clara.', 'Editar paciente, Ana Clara.', 'Edite o paciente Ana Clara', 'Atualizar paciente Ana Clara']) {
    const result = parseCentralCommand({ text, context })
    assert.deepEqual(result.intent, { type: 'patient.edit.open', target: { patientId: 'patient-ana' } })
    assert.match(result.preview, /Abrir edição/)
  }
  for (const patients of [[{ id: '1', name: 'Ana Clara', archivedAt: 1 }],
    [{ id: '1', name: 'Ana Clara' }, { id: '2', name: 'Ana Clara' }]]) {
    assert.equal(parseCentralCommand({ text: 'Editar paciente Ana Clara', context: { patients } }).status, 'clarification')
  }
  assert.equal(parseCentralCommand({ text: 'Editar paciente Ana', context }).status, 'clarification')
})

test('transcrições nativas: variantes de navegação não reescrevem nomes ou títulos', () => {
  const sessions = parseCentralCommand({ text: 'Abrir seções de Ana Clara.', context })
  assert.deepEqual(sessions.intent, { type: 'patient.workspace.open', target: { patientId: 'patient-ana', space: 'sessions' } })
  for (const text of ['Abrir análise deste mes.', 'Abrir a análise deste mês.', 'Abrir análises deste mês.']) {
    assert.deepEqual(parseCentralCommand({ text, context, referenceDate: '2026-10-03' }).intent,
      { type: 'analytics.view', target: { patientId: '', from: '2026-10-01', to: '2026-10-31', view: 'month' } })
  }
  assert.equal(parseCentralCommand({ text: 'Abrir seções de Anaclara.', context }).status, 'clarification')
  assert.equal(parseCentralCommand({ text: 'Abrir seções de Ana Clara e abrir ajustes.', context }).status, 'clarification')
  assert.equal(parseCentralCommand({ text: 'Criar comportamento e espera a vez.', context }).intent.draft.title, 'e espera a vez.')
  assert.equal(parseCentralCommand({ text: 'Cadastrar paciente Seções com nove anos.', context }).intent.draft.name, 'Seções')
})

test('navegação do paciente prepara registros, sessões, evolução e vínculos', () => {
  for (const verb of ['Abrir', 'Abra', 'Abre']) {
    for (const [section, space] of [['registros', 'sessions'], ['sessões', 'sessions'], ['evolução', 'evolution'], ['vínculos', 'links']]) {
      const result = parseCentralCommand({ text: `${verb} ${section} de Ana Clara`, context })
      assert.deepEqual(result.intent, { type: 'patient.workspace.open', target: { patientId: 'patient-ana', space } })
      assert.equal(result.status, 'draft')
      assert.equal(result.preview, `Abrir ${space === 'links' ? 'vínculos' : 'registros'} de Ana Clara.`)
      assert.equal(formatCentralCommandPreview(result), result.preview)
    }
  }
  assert.equal(parseCentralCommand({ text: '  ABRIR   OS VÍNCULOS DE ÁNA CLARA! ', context }).intent.target.space, 'links')
})

test('análises usam o contrato exato para filtros globais e de paciente', () => {
  const cases = [
    ['Mostrar análises deste mês', '', '2026-10-01', '2026-10-31', 'month'],
    ['Mostrar análises de Ana Clara neste mês', 'patient-ana', '2026-10-01', '2026-10-31', 'month'],
    ['Mostrar análises de Ana Clara hoje', 'patient-ana', '2026-10-03', '2026-10-03', 'day'],
    ['Mostrar gráficos dos últimos 12 meses', '', '2025-11-01', '2026-10-31', 'year'],
    ['Mostrar análises de Ana Clara de 01/09/2026 até 30/09/2026', 'patient-ana', '2026-09-01', '2026-09-30', 'custom'],
    ['Mostrar análises de 01/09/2026 até 30/09/2026', '', '2026-09-01', '2026-09-30', 'custom'],
    ['Mostrar análises de todos os pacientes hoje', '', '2026-10-03', '2026-10-03', 'day'],
    ['Mostrar gráficos para todos os pacientes neste mês', '', '2026-10-01', '2026-10-31', 'month'],
    ['Mostrar análises todos os pacientes de 01/09/2026 até 30/09/2026', '', '2026-09-01', '2026-09-30', 'custom'],
    ['Mostrar análises', '', '2026-10-01', '2026-10-31', 'month'],
    ['Mostrar análises de Ana Clara', 'patient-ana', '2026-10-01', '2026-10-31', 'month'],
    ['Mostrar análises de todos os pacientes', '', '2026-10-01', '2026-10-31', 'month'],
    ['Abrir gráficos de Ana Clara dos últimos 12 meses', 'patient-ana', '2025-11-01', '2026-10-31', 'year'],
  ]
  for (const [text, patientId, from, to, view] of cases) {
    const result = parseCentralCommand({ text, context, referenceDate: '2026-10-03' })
    assert.equal(result.status, 'draft', text)
    assert.deepEqual(result.intent, { type: 'analytics.view', target: { patientId, from, to, view } }, text)
    assert.equal(inSupportedRange(from, to), true)
    assert.equal(result.preview, `Mostrar análises de ${patientId ? 'Ana Clara' : 'todos os pacientes'}: ${from.split('-').reverse().join('/')} a ${to.split('-').reverse().join('/')}.`)
    assert.equal(formatCentralCommandPreview(result), result.preview)
  }
  for (const verb of ['mostre', 'mostra', 'abra', 'abre']) {
    assert.equal(parseCentralCommand({ text: `${verb} as análises hoje`, referenceDate: '2026-10-03' }).intent.target.view, 'day')
  }
  for (const text of ['abrir análises', 'abra os gráficos', 'abre as análises']) {
    assert.deepEqual(parseCentralCommand({ text }).intent, { type: 'workspace.open', target: { space: 'analytics' } })
  }
})

test('novas navegações exigem um único nome exato e ativo', () => {
  for (const command of ['Abrir registros de', 'Abrir sessões de', 'Abrir evolução de', 'Abrir vínculos de', 'Mostrar análises de']) {
    for (const name of ['Ana', 'Clara', 'Outra Pessoa', 'Ana Clara e Caio Fictício', 'Ana Clara por favor']) {
      const result = parseCentralCommand({ text: `${command} ${name}`, context, referenceDate: '2026-10-03' })
      assert.equal(result.status, 'clarification', `${command} ${name}`)
      assert.equal(result.intent, undefined)
    }
    for (const patients of [[], [{ id: 'archived', name: 'Ana Clara', archivedAt: '2026-09-01' }],
      [...context.patients, { id: 'duplicate', name: 'ÁNA CLARA' }]]) {
      assert.equal(parseCentralCommand({ text: `${command} Ana Clara`, context: { patients }, referenceDate: '2026-10-03' }).status, 'clarification')
    }
    const expanded = { patients: [...patients, { id: 'short', name: 'Ana' }, { id: 'archived', name: 'Ana Clara', archivedAt: '2026-09-01' }] }
    assert.equal(parseCentralCommand({ text: `${command} Ana Clara`, context: expanded, referenceDate: '2026-10-03' }).intent.target.patientId, 'patient-ana')
  }
})

test('análises calculam períodos civis nas viradas de ano e em anos bissextos', () => {
  for (const [referenceDate, from, to] of [
    ['2026-01-31', '2025-02-01', '2026-01-31'],
    ['2024-02-29', '2023-03-01', '2024-02-29'],
    ['2026-02-28', '2025-03-01', '2026-02-28'],
    ['2026-12-31', '2026-01-01', '2026-12-31'],
    ['2000-02-29', '1999-03-01', '2000-02-29'],
    ['2100-02-28', '2099-03-01', '2100-02-28'],
  ]) {
    assert.deepEqual(parseCentralCommand({ text: 'Mostrar gráficos dos últimos 12 meses', referenceDate }).intent.target,
      { patientId: '', from, to, view: 'year' })
    assert.equal(parseCentralCommand({ text: 'Mostrar análises neste mês', referenceDate }).intent.target.to, to)
    assert.equal(parseCentralCommand({ text: 'Mostrar análises hoje', referenceDate }).intent.target.from, referenceDate)
  }
  assert.equal(parseCentralCommand({ text: 'Mostrar análises neste mês', referenceDate: '0001-02-01' }).intent.target.to, '0001-02-28')
  assert.equal(parseCentralCommand({ text: 'Mostrar gráficos dos últimos 12 meses', referenceDate: '0001-01-01' }).status, 'clarification')
  // Keep the shared range validator authoritative even at its upper year limit.
  assert.equal(parseCentralCommand({ text: 'Mostrar gráficos dos últimos 12 meses', referenceDate: '9999-12-31' }).status, 'clarification')
})

test('análises recusam referências e intervalos inválidos sem adivinhar datas', () => {
  for (const referenceDate of [undefined, null, '', '2026-02-30', '03/10/2026', '2026-10-03T00:00:00Z', '0000-01-01']) {
    for (const suffix of ['', 'hoje', 'neste mês', 'dos últimos 12 meses']) {
      assert.equal(parseCentralCommand({ text: `Mostrar análises ${suffix}`, referenceDate }).status, 'clarification')
    }
    assert.deepEqual(parseCentralCommand({ text: 'Mostrar análises de Ana Clara de 29/02/2024 até 01/03/2024', context, referenceDate }).intent.target,
      { patientId: 'patient-ana', from: '2024-02-29', to: '2024-03-01', view: 'custom' })
  }
  for (const range of ['31/02/2026 até 01/03/2026', '29/02/2026 até 01/03/2026', '01/09/2026 até 31/09/2026',
    '30/09/2026 até 01/09/2026', '01/01/2020 até 02/01/2025', '29/02/2020 até 01/03/2025',
    '01/01/0000 até 01/01/0001', '1/09/2026 até 30/09/2026', '2026-09-01 até 2026-09-30']) {
    assert.equal(parseCentralCommand({ text: `Mostrar análises de ${range}`, context, referenceDate: '2026-10-03' }).status, 'clarification', range)
  }
  for (const range of ['01/01/2020 até 01/01/2025', '29/02/2020 até 28/02/2025', '01/09/2026 até 01/09/2026']) {
    assert.equal(parseCentralCommand({ text: `Mostrar análises de ${range}` }).status, 'draft', range)
  }
})

test('novas navegações preservam recusas de conteúdo extra, negação e ações múltiplas', () => {
  for (const text of ['Mostrar análises amanhã', 'Mostrar análises deste ano', 'Mostrar análises hoje e amanhã',
    'Mostrar análises neste mês hoje', 'Mostrar gráficos dos últimos 6 meses',
    'Mostrar análises de Ana Clara de 01/09/2026', 'Mostrar análises de Ana Clara hoje às 15:00',
    'Mostrar análises de Ana Clara de 01/09/2026 até 30/09/2026 e 01/10/2026', 'Abrir vínculos de Ana Clara hoje']) {
    assert.equal(parseCentralCommand({ text, context, referenceDate: '2026-10-03' }).status, 'clarification', text)
  }
  for (const command of ['abrir registros de Ana Clara', 'abrir vínculos de Ana Clara', 'mostrar análises de Ana Clara hoje']) {
    for (const text of [`não ${command}`, `nunca ${command}`, `jamais ${command}`, `por favor, não ${command}`,
      `${command} não`, `${command} e abrir pacientes`, `${command}; criar paciente Bia`,
      ...['e', ';', 'depois', 'ou', ',', 'em seguida'].map(join => `criar paciente Bia ${join} ${command}`)]) {
      const result = parseCentralCommand({ text, context, referenceDate: '2026-10-03' })
      assert.equal(result.status, 'clarification', text)
      assert.equal(result.intent, undefined, text)
    }
  }
})

test('novas navegações são somente leitura e não executam efeitos', () => {
  const frozenContext = Object.freeze({
    patients: Object.freeze(patients.map(patient => Object.freeze({ ...patient }))),
    activeSessionDraft: Object.freeze({ ...session }),
    invoke: () => assert.fail('Não pode chamar backend'),
    save: () => assert.fail('Não pode salvar'),
    navigate: () => assert.fail('Não pode navegar'),
  })
  const before = structuredClone({ patients: frozenContext.patients, session: frozenContext.activeSessionDraft })
  for (const text of ['Abrir registros de Ana Clara', 'Abrir vínculos de Ana Clara', 'Mostrar análises de Ana Clara hoje', 'Mostrar gráficos dos últimos 12 meses']) {
    const result = parseCentralCommand(Object.freeze({ text, context: frozenContext, referenceDate: '2026-10-03' }))
    assert.equal(result.status, 'draft')
    assert.deepEqual(Object.keys(result.intent).sort(), ['target', 'type'])
    assert.deepEqual({ patients: frozenContext.patients, session: frozenContext.activeSessionDraft }, before)
  }
})

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

test('série aceita modalidade após horário numérico e recusa modalidades conflitantes', () => {
  for (const [time, start] of [['15 horas', '15:00'], ['15:30', '15:30'], ['quinze horas', '15:00']]) {
    for (const modality of ['online', 'presencial']) {
      const result = parseCentralCommand({ text: `Agendar sessão quinzenal para Ana Clara na segunda às ${time} ${modality}`, context, referenceDate: '2026-10-03' })
      assert.equal(result.status, 'draft')
      assert.equal(result.intent.draft.start, start)
      assert.equal(result.intent.draft.frequency, 'Quinzenal')
      assert.equal(result.intent.draft.modality, modality === 'online' ? 'Online' : 'Presencial')
    }
  }
  assert.equal(parseCentralCommand({ text: 'Agendar sessão quinzenal para Ana Clara na segunda às 15 horas online presencial', context, referenceDate: '2026-10-03' }).status, 'clarification')
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

test('variantes naturais de cadastro preservam nome, idade opcional e modalidade explícita', () => {
  for (const prefix of ['Cadastre', 'Cadastra', 'Crie', 'Adiciona', 'Novo']) {
    const result = parseCentralCommand({ text: `${prefix} paciente João D’Ávila` })
    assert.deepEqual(result.intent, { type: 'patient.create', draft: { name: 'João D’Ávila', age: null } }, prefix)
  }
  for (const suffix of ['com quarenta e duas anos na modalidade Online', 'na modalidade Online com quarenta e duas anos']) {
    const result = parseCentralCommand({ text: `Crie um novo paciente João de Souza ${suffix}` })
    assert.deepEqual(result.intent.draft, { name: 'João de Souza', age: 42, preferredModality: 'Online' })
  }
  assert.deepEqual(parseCentralCommand({ text: 'Adiciona paciente Érica com atendimento presencial' }).intent.draft,
    { name: 'Érica', age: null, preferredModality: 'Presencial' })
})

test('idades adultas faladas e limites numéricos são explícitos e não inferem ciclo de vida', () => {
  for (const [word, age] of [['zero', 0], ['trinta e um', 31], ['sessenta e cinco', 65], ['noventa e nove', 99], ['cem', 100], ['cento e uma', 101], ['cento e dezenove', 119], ['cento e vinte', 120], ['120', 120]]) {
    assert.deepEqual(parseCentralCommand({ text: `Novo paciente José com ${word} anos` }).intent.draft, { name: 'José', age }, word)
  }
  for (const word of ['121', '-1', '8.5', 'cento e vinte e um', 'muitos']) {
    assert.equal(parseCentralCommand({ text: `Crie paciente José com ${word} anos` }).status, 'clarification', word)
  }
})

test('atualização de paciente contém somente os campos explícitos e o ID exato', () => {
  for (const [text, patch] of [
    ['Editar paciente Ana Clara com 9 anos', { age: 9 }],
    ['Atualize paciente Ana Clara com trinta e sete anos na modalidade Presencial', { age: 37, preferredModality: 'Presencial' }],
    ['Mudar modalidade de Ana Clara para Online', { preferredModality: 'Online' }],
    ['Renomear paciente Ana Clara para Ana Souza', { name: 'Ana Souza' }],
    ['Renomear paciente Ana Clara para Caio Fictício', { name: 'Caio Fictício' }],
  ]) {
    assert.deepEqual(parseCentralCommand({ text, context }).intent, { type: 'patient.update', target: { patientId: 'patient-ana' }, draft: patch }, text)
  }
})

test('atualização recusa alvo parcial, alvo duplo, duplicatas e patch inválido', () => {
  for (const text of ['Editar paciente Ana com 9 anos', 'Editar paciente Ana Clara e Caio Fictício com 9 anos', 'Renomear paciente Ana Clara e Outra Pessoa para Bia', 'Editar paciente Ana Clara com 121 anos', 'Mudar modalidade de Ana Clara para Online e Presencial', 'Editar paciente Ana Clara com modalidade Remota', 'Crie paciente Bia com 9', 'Crie paciente Bia com 9 anos com 10 anos', 'Crie paciente Ana Clara e Bia']) {
    assert.equal(parseCentralCommand({ text, context }).status, 'clarification', text)
  }
  const duplicateContext = { ...context, patients: [...patients, { id: 'duplicate', name: 'Ana Clara' }] }
  assert.equal(parseCentralCommand({ text: 'Editar paciente Ana Clara com 9 anos', context: duplicateContext }).status, 'clarification')
  const nestedContext = { ...context, patients: [...patients, { id: 'short', name: 'Ana' }] }
  assert.equal(parseCentralCommand({ text: 'Editar paciente Ana Clara com 9 anos', context: nestedContext }).intent.target.patientId, 'patient-ana')
})

test('arquiva somente paciente ativo e restaura somente paciente arquivado', () => {
  const archived = { id: 'archived', name: 'Bia Souza', archivedAt: '2026-09-01' }
  const lifecycleContext = { ...context, patients: [...patients, archived] }
  assert.deepEqual(parseCentralCommand({ text: 'Arquive paciente Ana Clara', context: lifecycleContext }).intent,
    { type: 'patient.archive', target: { patientId: 'patient-ana' } })
  assert.deepEqual(parseCentralCommand({ text: 'Restaurar paciente Bia Souza', context: lifecycleContext }).intent,
    { type: 'patient.restore', target: { patientId: 'archived' } })
  for (const text of ['Arquivar paciente Bia Souza', 'Restaurar paciente Ana Clara', 'Arquivar paciente Ana Clara e Caio Fictício', 'Editar paciente Bia Souza com 10 anos', 'Excluir permanentemente paciente Ana Clara']) {
    assert.equal(parseCentralCommand({ text, context: lifecycleContext }).status, 'clarification', text)
  }
})

test('cria comportamento literal sem associar a sessão ou inferir paciente', () => {
  const result = parseCentralCommand({ text: 'Criar comportamento Pede ajuda com descrição Solicita ajuda ao adulto', context })
  assert.deepEqual(result.intent, { type: 'behavior.create', draft: { title: 'Pede ajuda', description: 'Solicita ajuda ao adulto' } })
  const literal = parseCentralCommand({ text: 'Crie comportamento Não espera a vez! com descrição Não registrar diagnóstico; apenas observar.', context: {} })
  assert.deepEqual(literal.intent, { type: 'behavior.create', draft: { title: 'Não espera a vez!', description: 'Não registrar diagnóstico; apenas observar.' } })
  assert.deepEqual(parseCentralCommand({ text: 'Criar comportamento Pede ajuda' }).intent.draft, { title: 'Pede ajuda', description: '' })
})

test('edita descrição e título de comportamento com alvo delimitado pelo catálogo', () => {
  assert.deepEqual(parseCentralCommand({ text: 'Editar comportamento Pede ajuda com descrição Solicita apoio.', context }).intent,
    { type: 'behavior.update', target: { behaviorId: 'behavior-regulation' }, draft: { description: 'Solicita apoio.' } })
  assert.deepEqual(parseCentralCommand({ text: 'Editar comportamento Pede ajuda para Solicita Apoio! com descrição Pede apoio ao adulto.', context }).intent,
    { type: 'behavior.update', target: { behaviorId: 'behavior-regulation' }, draft: { title: 'Solicita Apoio!', description: 'Pede apoio ao adulto.' } })
  assert.deepEqual(parseCentralCommand({ text: 'Editar comportamento Pede ajuda para Espera a vez', context }).intent.draft, { title: 'Espera a vez' })
  for (const text of ['Editar comportamento Pede com descrição Apoio', 'Editar comportamento Pede ajuda e Espera a vez com descrição Apoio', 'Criar comportamento Pede ajuda com descrição']) {
    assert.equal(parseCentralCommand({ text, context }).status, 'clarification', text)
  }
  const duplicate = { ...context, behaviors: [...behaviors, { id: 'duplicate', title: 'Pede ajuda' }] }
  assert.equal(parseCentralCommand({ text: 'Editar comportamento Pede ajuda com descrição Apoio', context: duplicate }).status, 'clarification')
})

test('navega para um único espaço tipado e recusa espaços ambíguos', () => {
  for (const [label, space] of [['início', 'home'], ['home', 'home'], ['pacientes', 'patients'], ['agenda', 'agenda'], ['sessões', 'sessions'], ['análises', 'analytics'], ['configurações', 'settings']]) {
    assert.deepEqual(parseCentralCommand({ text: `Abrir ${label}` }).intent, { type: 'workspace.open', target: { space } })
  }
  for (const text of ['Abrir agenda e análises', 'Abrir relatórios', 'Abrir sessões de Ana Clara']) assert.equal(parseCentralCommand({ text }).status, 'clarification', text)
})

test('navegação de agenda prepara somente view e data civil com preview legível', () => {
  const cases = [
    ['de hoje', 'day', '2026-10-03', 'do dia 03/10/2026'],
    ['de amanhã', 'day', '2026-10-04', 'do dia 04/10/2026'],
    ['do dia 10/10/2026', 'day', '2026-10-10', 'do dia 10/10/2026'],
    ['desta semana', 'week', '2026-10-03', 'da semana de 03/10/2026'],
    ['deste mês', 'month', '2026-10-03', 'do mês de 03/10/2026'],
    ['da semana de 10/10/2026', 'week', '2026-10-10', 'da semana de 10/10/2026'],
    ['do mês de 10/10/2026', 'month', '2026-10-10', 'do mês de 10/10/2026'],
  ]
  const frozenContext = Object.freeze({ patients: Object.freeze([]) })
  for (const verb of ['mostrar', 'mostre', 'mostra', 'abrir', 'abra', 'abre']) {
    for (const article of ['', 'a ']) {
      for (const [qualifier, view, date, preview] of cases) {
        const text = `${verb} ${article}agenda ${qualifier}`
        const input = Object.freeze({ text, context: frozenContext, referenceDate: '2026-10-03' })
        const result = parseCentralCommand(input)
        assert.deepEqual(result, {
          status: 'draft', intent: { type: 'agenda.view', target: { view, referenceDate: date } },
          preview: `Mostrar agenda ${preview}.`, notes: [],
        }, text)
        assert.equal(formatCentralCommandPreview(result), `Mostrar agenda ${preview}.`)
        assert.equal(input.referenceDate, '2026-10-03')
      }
    }
  }
  assert.equal(parseCentralCommand({ text: '  MOSTRAR   AGENDA DE AMANHA! ', referenceDate: '2026-10-03' }).intent.target.referenceDate, '2026-10-04')
})

test('agenda usa a referência fornecida e resolve amanhã nas viradas civis', () => {
  for (const [referenceDate, tomorrow] of [
    ['2026-12-31', '2027-01-01'], ['2026-01-31', '2026-02-01'],
    ['2024-02-28', '2024-02-29'], ['2024-02-29', '2024-03-01'], ['2026-02-28', '2026-03-01'],
  ]) {
    assert.equal(parseCentralCommand({ text: 'abrir agenda de amanhã', referenceDate }).intent.target.referenceDate, tomorrow)
    for (const qualifier of ['de hoje', 'desta semana', 'deste mês']) {
      assert.equal(parseCentralCommand({ text: `mostrar agenda ${qualifier}`, referenceDate }).intent.target.referenceDate, referenceDate)
    }
  }
  for (const qualifier of ['do dia', 'da semana de', 'do mês de']) {
    const text = `mostrar agenda ${qualifier} 29/02/2024`
    assert.equal(parseCentralCommand({ text }).intent.target.referenceDate, '2024-02-29')
    assert.equal(parseCentralCommand({ text, referenceDate: 'inválida' }).intent.target.referenceDate, '2024-02-29')
  }
})

test('agenda recusa referência ausente ou inválida para períodos relativos', () => {
  for (const referenceDate of [undefined, null, '', '2026-02-30', '03/10/2026', '2026-10-03T00:00:00Z']) {
    for (const qualifier of ['de hoje', 'de amanhã', 'desta semana', 'deste mês']) {
      const result = parseCentralCommand({ text: `mostrar agenda ${qualifier}`, referenceDate })
      assert.equal(result.status, 'clarification')
      assert.equal(result.intent, undefined)
      assert.match(result.message, /data civil de referência válida/u)
    }
  }
  assert.equal(parseCentralCommand({ text: 'mostrar agenda de amanhã', referenceDate: '9999-12-31' }).status, 'clarification')
})

test('agenda recusa datas impossíveis, períodos ambíguos e argumentos adicionais', () => {
  for (const qualifier of ['do dia', 'da semana de', 'do mês de']) {
    for (const date of ['31/02/2026', '29/02/2026', '31/04/2026', '00/10/2026', '10/00/2026', '10/13/2026', '10/10/0000', '10/10', '1/10/2026', '2026-10-10']) {
      const result = parseCentralCommand({ text: `mostrar agenda ${qualifier} ${date}`, referenceDate: '2026-10-03' })
      assert.equal(result.status, 'clarification', `${qualifier} ${date}`)
      assert.equal(result.intent, undefined)
    }
  }
  for (const text of [
    'mostrar agenda', 'mostrar agenda da semana', 'abrir agenda do mês',
    'mostrar agenda da próxima semana', 'mostrar agenda de ontem',
    'mostrar agenda de hoje ou amanhã', 'mostrar agenda de hoje e amanhã',
    'mostrar agenda do dia 10/10/2026 e 11/10/2026',
    'mostrar agenda desta semana deste mês', 'mostrar agenda de hoje para Ana Clara',
    'mostrar agenda de hoje às 15:00', 'mostrar agenda de hoje não',
  ]) {
    const result = parseCentralCommand({ text, referenceDate: '2026-10-03' })
    assert.equal(result.status, 'clarification', text)
    assert.equal(result.intent, undefined, text)
  }
})

test('agenda mantém recusa de negação e ações múltiplas em ambas as ordens', () => {
  for (const text of [
    'não mostrar agenda de hoje', 'nunca mostre agenda deste mês',
    'por favor, não abrir agenda de amanhã', 'mostrar agenda de hoje e não mostre agenda de amanhã',
    'mostrar agenda de hoje e abrir pacientes', 'abrir agenda de amanhã; mostrar agenda deste mês',
    'mostrar agenda desta semana depois criar paciente Bia',
    'criar paciente Bia e mostrar agenda de hoje', 'criar paciente Bia; mostre agenda de hoje',
    'criar paciente Bia depois mostra agenda de hoje', 'criar paciente Bia e abre agenda de hoje',
  ]) {
    const result = parseCentralCommand({ text, referenceDate: '2026-10-03' })
    assert.equal(result.status, 'clarification', text)
    assert.equal(result.intent, undefined, text)
  }
})

test('abrir agenda sem período preserva navegação existente sem referência', () => {
  for (const text of ['abrir agenda', 'abra a agenda', 'abre agenda.']) {
    assert.deepEqual(parseCentralCommand({ text }).intent, { type: 'workspace.open', target: { space: 'agenda' } })
  }
})

test('negações e pedidos de várias ações não geram intents', () => {
  for (const text of ['Não cadastre paciente Bia', 'Por favor, não criar comportamento Pede ajuda', 'Nunca arquivar paciente Ana Clara', 'Não restaure paciente Ana Clara', 'Não abrir agenda', 'Não agendar sessão para Ana Clara amanhã às três da tarde', 'Criar paciente Bia e arquivar paciente Ana Clara', 'Arquivar paciente Ana Clara e restaurar paciente Caio Fictício', 'Editar paciente Ana Clara com 9 anos e abrir agenda', 'Abrir agenda; excluir paciente Ana Clara']) {
    const result = parseCentralCommand({ text, context, referenceDate: '2026-10-03' })
    assert.equal(result.status, 'clarification', text)
    assert.equal(result.intent, undefined, text)
  }
  assert.equal(parseCentralCommand({ text: 'Preencher observação da sessão de Ana Clara com Não registrar diagnóstico; apenas observar.', context }).intent.patch.value, 'Não registrar diagnóstico; apenas observar.')
})

test('sessão avulsa usa data civil de referência e horário explícito', () => {
  for (const [dateText, date] of [['hoje', '2026-10-03'], ['amanhã', '2026-10-04'], ['dia 05/10/2026', '2026-10-05']]) {
    const result = parseCentralCommand({ text: `Agendar sessão para Ana Clara ${dateText} às três da tarde`, context, referenceDate: '2026-10-03' })
    assert.deepEqual(result.intent, { type: 'appointment.single.create', draft: {
      appointmentType: 'Avulsa', patientId: 'patient-ana', patientName: 'Ana Clara', startDate: date,
      start: '15:00', end: '15:50', modality: 'Presencial', meetingLink: '',
    } }, dateText)
  }
  const online = parseCentralCommand({ text: 'Marcar uma sessão avulsa para Ana Clara no dia 05/10/2026 às 15:30 com modalidade Online', context })
  assert.equal(online.intent.draft.modality, 'Online')
  assert.equal(online.intent.draft.end, '16:20')
  const rollover = parseCentralCommand({ text: 'Agendar sessão para Ana Clara amanhã às 15:00', context, referenceDate: '2026-12-31' })
  assert.equal(rollover.intent.draft.startDate, '2027-01-01')
})

test('sessão avulsa recusa dados inválidos, ambiguidades e palavras extras', () => {
  for (const text of ['Agendar sessão para Ana Clara hoje às 9', 'Agendar sessão para Ana Clara dia 31/02/2026 às 15:00', 'Agendar sessão para Ana Clara e Caio Fictício hoje às 15:00', 'Agendar sessão para Ana hoje às 15:00', 'Agendar sessão para Ana Clara hoje às três da tarde e Caio Fictício', 'Agendar sessão para Ana Clara hoje às três da tarde online presencial', 'Agendar sessão para Ana Clara hoje às 24:00', 'Agendar sessão para Ana Clara hoje', 'Agendar sessão para Ana Clara às 15:00']) {
    assert.equal(parseCentralCommand({ text, context, referenceDate: '2026-10-03' }).status, 'clarification', text)
  }
  assert.equal(parseCentralCommand({ text: 'Agendar sessão para Ana Clara amanhã às 15:00', context }).status, 'clarification')
  assert.equal(parseCentralCommand({ text: 'Agendar sessão para Ana Clara hoje às 15:00', context, referenceDate: '2026-02-30' }).status, 'clarification')
})

test('vocabulário de agenda em títulos e descrições não transforma comportamento em agendamento', () => {
  const result = parseCentralCommand({ text: 'Crie comportamento Agendar sessão semanal com descrição Arquivar e restaurar são ações administrativas.', context })
  assert.deepEqual(result.intent, { type: 'behavior.create', draft: { title: 'Agendar sessão semanal', description: 'Arquivar e restaurar são ações administrativas.' } })
  const literalContext = { ...context, behaviors: [...behaviors, { id: 'literal', title: 'Pede ajuda para o adulto' }] }
  assert.deepEqual(parseCentralCommand({ text: 'Editar comportamento Pede ajuda para o adulto com descrição Solicita apoio.', context: literalContext }).intent,
    { type: 'behavior.update', target: { behaviorId: 'literal' }, draft: { description: 'Solicita apoio.' } })
  assert.equal(parseCentralCommand({ text: 'Não sei se devo criar sessão semanal para Ana Clara toda quinta às 15:00', context, referenceDate: '2026-10-03' }).status, 'clarification')
  assert.equal(parseCentralCommand({ text: 'Abrir constructor' }).status, 'clarification')
})

test('ações naturais de ocorrência preparam somente o contrato de abertura e uma prévia segura', () => {
  for (const [text, action, date] of [
    ['Iniciar sessão de Ana Clara hoje às 15 horas', 'start', '2026-10-03'],
    ['Remarcar sessão de Ana Clara amanhã às três da tarde', 'remarcar', '2026-10-04'],
    ['Cancelar sessão de Ana Clara no dia 10/10/2026 às 15:00', 'cancelar', '2026-10-10'],
  ]) {
    const result = parseCentralCommand({ text, context, referenceDate: '2026-10-03' })
    assert.equal(result.status, 'draft', text)
    assert.deepEqual(result.intent, {
      type: 'agenda.occurrence.action', target: { patientId: 'patient-ana', date, start: '15:00', action },
    })
    assert.equal(formatCentralCommandPreview(result), result.preview)
    assert.match(result.preview, /Ana Clara.*às 15:00/u)
    assert.ok(result.preview.includes(date.split('-').reverse().join('/')))
    if (action === 'start') assert.match(result.preview, /Abrir a sessão existente/u)
    else assert.match(result.preview, new RegExp(`Abrir o formulário para ${action}.*sem salvar alterações`, 'u'))
    assert.match(result.notes.join(' '), action === 'start' ? /Após confirmar.*cria ou retoma o rascunho/u : /Apenas abre o formulário.*confirm.*salvar/u)
  }
})

test('ocorrência exige nome completo único e ativo, mesmo com nomes sobrepostos no cadastro', () => {
  const expanded = { ...context, patients: [...patients,
    { id: 'short', name: 'Ana' }, { id: 'archived', name: 'Ana Clara', archivedAt: '2026-09-01' },
  ] }
  assert.equal(parseCentralCommand({ text: 'Iniciar sessão de Ana Clara hoje às 15:00', context: expanded, referenceDate: '2026-10-03' }).intent.target.patientId, 'patient-ana')
  for (const action of ['Iniciar', 'Remarcar', 'Cancelar']) {
    for (const name of ['Ana', 'Clara', 'Ana Clara e Caio Fictício', 'Ana Clara por favor', 'Outra Pessoa']) {
      assert.equal(parseCentralCommand({ text: `${action} sessão de ${name} hoje às 15:00`, context, referenceDate: '2026-10-03' }).status, 'clarification', name)
    }
    for (const patients of [
      [{ id: 'archived', name: 'Ana Clara', archivedAt: '2026-09-01' }],
      [...context.patients, { id: 'duplicate', name: 'Ana Clara' }],
      [...context.patients, { id: 'duplicate', name: 'ÁNA CLARA' }],
      [],
    ]) {
      assert.equal(parseCentralCommand({ text: `${action} sessão de Ana Clara hoje às 15:00`, context: { patients }, referenceDate: '2026-10-03' }).status, 'clarification')
    }
  }
  assert.equal(parseCentralCommand({ text: '  INICIAR   SESSÃO DE ANA CLARA HOJE ÀS 15 HORAS! ', context, referenceDate: '2026-10-03' }).intent.target.patientId, 'patient-ana')
})

test('ocorrência resolve datas civis relativas e explícitas sem consultar sessão aberta', () => {
  for (const [referenceDate, tomorrow] of [
    ['2026-12-31', '2027-01-01'], ['2026-01-31', '2026-02-01'],
    ['2024-02-28', '2024-02-29'], ['2024-02-29', '2024-03-01'], ['2026-02-28', '2026-03-01'],
  ]) {
    for (const [qualifier, date] of [['hoje', referenceDate], ['amanhã', tomorrow]]) {
      const result = parseCentralCommand({ text: `Iniciar sessão de Ana Clara ${qualifier} às 15:00`, context: { patients }, referenceDate })
      assert.equal(result.intent.target.date, date)
    }
  }
  for (const referenceDate of [undefined, null, '', '2026-02-30', '03/10/2026', '2026-10-03T00:00:00Z']) {
    for (const qualifier of ['hoje', 'amanhã']) {
      assert.equal(parseCentralCommand({ text: `Remarcar sessão de Ana Clara ${qualifier} às 15:00`, context, referenceDate }).status, 'clarification')
    }
    assert.equal(parseCentralCommand({ text: 'Cancelar sessão de Ana Clara no dia 29/02/2024 às 15:00', context, referenceDate }).intent.target.date, '2024-02-29')
  }
  for (const date of ['31/02/2026', '29/02/2026', '31/04/2026', '00/10/2026', '10/00/2026', '10/13/2026', '10/10/0000', '1/10/2026', '10/10', '2026-10-10']) {
    assert.equal(parseCentralCommand({ text: `Iniciar sessão de Ana Clara no dia ${date} às 15:00`, context }).status, 'clarification', date)
  }
  assert.equal(parseCentralCommand({ text: 'Iniciar sessão de Ana Clara amanhã às 15:00', context, referenceDate: '9999-12-31' }).status, 'clarification')
})

test('ocorrência consome horário completo sem impor duração e exige interpretação única', () => {
  for (const [time, start] of [
    ['15 horas', '15:00'], ['quinze horas', '15:00'], ['quinze', '15:00'],
    ['três da tarde', '15:00'], ['três e meia da tarde', '15:30'], ['9 da manhã', '09:00'],
    ['oito da noite', '20:00'], ['12 da tarde', '12:00'], ['doze da noite', '00:00'],
    ['09:05', '09:05'], ['00:00', '00:00'], ['23:59', '23:59'], ['meia-noite', '00:00'],
    ['vinte e três horas e meia', '23:30'],
  ]) {
    assert.equal(parseCentralCommand({ text: `Iniciar sessão de Ana Clara hoje às ${time}`, context, referenceDate: '2026-10-03' }).intent?.target.start, start, time)
  }
  for (const time of [
    '3', 'três', 'três horas', '12 horas', '24:00', '25 horas', '15:60', '-1', '15.30',
    '13 da tarde', 'zero da manhã', '12 da manhã', 'três e quinze da tarde',
    'três e qualquer coisa da tarde', 'quinze bananas', '15:00 e meia',
    '15 horas ou 16 horas', '15:00 e 16:00', '15 horas não', '15:00 por favor',
  ]) {
    const result = parseCentralCommand({ text: `Remarcar sessão de Ana Clara hoje às ${time}`, context, referenceDate: '2026-10-03' })
    assert.equal(result.status, 'clarification', time)
    assert.equal(result.intent, undefined, time)
  }
})

test('cancelar só supera a recusa global com ocorrência inteiramente validada', () => {
  for (const text of [
    'Cancelar sessão de Ana Clara hoje às três', 'Cancelar sessão de Ana Clara no dia 31/02/2026 às 15:00',
    'Cancelar sessão de Outra Pessoa hoje às 15:00', 'Cancelar sessão de Ana Clara hoje às 15:00 e algo mais',
    'Cancelar sessão de Ana Clara amanhã às 15:00', 'Cancelar sessão de Ana Clara às 15:00',
    'Cancelar sessão', 'Cancelar rascunho', 'Cancelar paciente Ana Clara',
    'Cancele sessão de Ana Clara no dia 10/10/2026 às 15:00',
  ]) {
    const result = parseCentralCommand({ text, context })
    assert.deepEqual(result, {
      status: 'clarification', message: 'Este comando não é suportado pelo parser. Use a ação explícita na tela correspondente.',
    }, text)
  }
  assert.equal(parseCentralCommand({ text: 'Cancelar sessão de Ana Clara hoje às 15:00', context, referenceDate: '2026-10-03' }).intent.target.action, 'cancelar')
})

test('ocorrência recusa conteúdo extra, negações e ações múltiplas em ambas as ordens', () => {
  for (const action of ['iniciar', 'remarcar', 'cancelar']) {
    const command = `${action} sessão de Ana Clara hoje às 15:00`
    for (const text of [
      `não ${command}`, `nunca ${command}`, `jamais ${command}`, `por favor, não ${command}`,
      `${command} não`, `${command} para amanhã`, `${command} com modalidade Online`,
      `${command} com descrição Abrir pacientes`, `${command} e abrir pacientes`,
      `${command}; criar paciente Bia`, `${command} depois remarcar sessão de Caio Fictício amanhã às 15:00`,
      `criar paciente Bia e ${command}`, `criar paciente Bia; ${command}`, `criar paciente Bia depois ${command}`,
      `criar paciente Bia ou ${command}`, `criar paciente Bia, ${command}`, `criar paciente Bia em seguida ${command}`,
      `criar paciente Bia e não ${command}`, `criar paciente Bia e nunca ${command}`,
      `${action} sessão de Ana Clara hoje e amanhã às 15:00`,
      `${action} sessão de Ana Clara hoje`, `${action} sessão de Ana Clara às 15:00`,
    ]) {
      const result = parseCentralCommand({ text, context, referenceDate: '2026-10-03' })
      assert.equal(result.status, 'clarification', text)
      assert.equal(result.intent, undefined, text)
    }
  }
})

test('parser de ocorrência não altera contexto nem chama efeitos externos', () => {
  const frozenPatient = Object.freeze({ ...patients[0] })
  const frozenSession = Object.freeze({ ...session })
  const frozenContext = Object.freeze({
    patients: Object.freeze([frozenPatient]), activeSessionDraft: frozenSession,
    invoke: () => assert.fail('O parser não pode chamar o backend'),
    save: () => assert.fail('O parser não pode salvar'),
    openSession: () => assert.fail('O parser não executa a abertura da sessão'),
  })
  const before = structuredClone({ patients: frozenContext.patients, activeSessionDraft: frozenSession })
  for (const action of ['iniciar', 'remarcar', 'cancelar']) {
    const input = Object.freeze({ text: `${action} sessão de Ana Clara hoje às 15:00`, context: frozenContext, referenceDate: '2026-10-03' })
    const result = parseCentralCommand(input)
    assert.equal(result.status, 'draft')
    assert.equal(result.intent.draft, undefined)
    assert.equal(result.intent.patch, undefined)
    assert.deepEqual({ patients: frozenContext.patients, activeSessionDraft: frozenSession }, before)
  }
})
