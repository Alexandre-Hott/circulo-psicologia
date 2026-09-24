import test from 'node:test';import assert from 'node:assert/strict';import {changeSessionModality,createAppointment,sessionAttendanceForHistory,sessionSnapshot,compatibleWithTemplate} from '../src/modalityModel.js'
test('appointment validates modality and optional online reference link',()=>{assert.equal(createAppointment({modality:'Online',meetingLink:'https://example.test'}).meetingLink,'https://example.test');assert.throws(()=>createAppointment({modality:'Presencial',meetingLink:'https://example.test'}),/online/);assert.throws(()=>createAppointment({modality:'Híbrido'}),/inválida/)})
test('session preserves modality snapshot and model compatibility',()=>{const s=sessionSnapshot({},createAppointment({modality:'Presencial'}));assert.equal(s.attendanceSnapshot.modality,'Presencial');assert.equal(compatibleWithTemplate({modalities:['Online']},'Presencial'),false)})
test('modality switch requires acknowledgement before discarding an online link',()=>{
 const draft={modality:'Online',meetingLink:'https://example.test',summary:'Sintético'}
 assert.deepEqual(changeSessionModality(draft,'Presencial'),{needsConfirmation:true,draft})
 assert.deepEqual(changeSessionModality(draft,'Presencial',true),{needsConfirmation:false,draft:{...draft,modality:'Presencial',meetingLink:''}})
 assert.deepEqual(draft,{modality:'Online',meetingLink:'https://example.test',summary:'Sintético'})
 assert.equal(changeSessionModality(draft,'Online').draft.meetingLink,'https://example.test')
})
test('historical reference is shown only for online attendance, including older valid sessions',()=>{
 assert.deepEqual(sessionAttendanceForHistory({modality:'Presencial',meetingLink:'https://stale.test'}),{modality:'Presencial',meetingLink:null})
 assert.deepEqual(sessionAttendanceForHistory({modality:'Online',meetingLink:'https://legacy.test'}),{modality:'Online',meetingLink:'https://legacy.test'})
 assert.deepEqual(sessionAttendanceForHistory({modality:'Presencial',meetingLink:'https://stale.test',attendanceSnapshot:{modality:'Online',meetingLink:'https://snapshot.test'}}),{modality:'Online',meetingLink:'https://snapshot.test'})
})
