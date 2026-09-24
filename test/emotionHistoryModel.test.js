import test from 'node:test'
import assert from 'node:assert/strict'
import { emotionHistoryForSession } from '../src/emotionHistoryModel.js'

test('finalized emotion history distinguishes selection, explicit no-answer and true absence', () => {
  const selected={patientId:1,status:'Finalizada',childEmotions:[{name:'Calma',icon:'😌',intensity:3,privateNote:'não exibir'}],noAnswer:'Não sei'}
  assert.deepEqual(emotionHistoryForSession(selected,1),{kind:'selected',emotions:[{name:'Calma',icon:'😌',intensity:3}]})
  assert.deepEqual(emotionHistoryForSession({patientId:1,status:'Finalizada',childEmotions:[],noAnswer:'Não sei'},1),{kind:'noAnswer',value:'Não sei'})
  assert.deepEqual(emotionHistoryForSession({patientId:1,status:'Finalizada',childEmotions:[],noAnswer:'Não quero responder'},1),{kind:'noAnswer',value:'Não quero responder'})
  assert.deepEqual(emotionHistoryForSession({patientId:1,status:'Finalizada',childEmotions:[],noAnswer:''},1),{kind:'none'})
  assert.equal(emotionHistoryForSession(selected,2),null)
  assert.equal(emotionHistoryForSession({...selected,status:'Rascunho'},1),null)
})
