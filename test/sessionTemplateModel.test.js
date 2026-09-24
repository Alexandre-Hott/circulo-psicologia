import test from 'node:test';import assert from 'node:assert/strict';import {applyTemplate,editTemplate,templateAnswersLostOnChange} from '../src/sessionTemplateModel.js'
const template={id:'initial',name:'Avaliação inicial acolhedora',type:'Avaliação inicial',version:1,fields:[{id:'demanda',label:'Demanda'}],indicatorIds:['reg'],behaviorIds:['participacao'],lifeCycles:['Criança'],modalities:['Presencial','Online']}
test('applying a template snapshots fields and pre-selections into the session',()=>{const s=applyTemplate({template,session:{indicatorValues:{}}});assert.equal(s.templateSnapshot.version,1);assert.deepEqual(s.selectedBehaviorIds,['participacao'])})
test('editing a template does not rewrite an earlier session snapshot',()=>{const s=applyTemplate({template,session:{}});assert.equal(editTemplate(template,{name:'Novo'}).version,2);assert.equal(s.templateSnapshot.name,'Avaliação inicial acolhedora')})
test('switching a template preserves compatible answers and warns before losing incompatible ones',()=>{
  const initial=applyTemplate({template,session:{indicatorValues:{com:2}}})
  const answered={...initial,templateFields:{demanda:'Resposta sintética'}}
  const compatible={...template,id:'compatible',fields:[{id:'demanda',label:'Demanda ajustada'},{id:'foco',label:'Foco'}]}
  assert.deepEqual(templateAnswersLostOnChange(answered,compatible),[])
  const kept=applyTemplate({template:compatible,session:answered})
  assert.equal(kept.templateFields.demanda,'Resposta sintética')
  assert.equal(kept.indicatorValues.com,2)
  assert.equal(kept.templateFields.foco,'')
  assert.deepEqual(templateAnswersLostOnChange(answered,null),['Demanda'])
  assert.deepEqual(templateAnswersLostOnChange(answered,{...template,fields:[{id:'foco',label:'Foco'}]}),['Demanda'])
  assert.equal(applyTemplate({template:null,session:answered}).templateSnapshot,null)
})
