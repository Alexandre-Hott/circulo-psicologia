import test from 'node:test';import assert from 'node:assert/strict';import { readFileSync } from 'node:fs'
const source=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')
test('patient lifecycle options are represented without assuming every patient is a child',()=>{for(const cycle of ['Criança','Adolescente','Adulto','Idoso','Não informado'])assert.match(source,new RegExp(`['"]${cycle}['"]`));assert.match(source,/PERFIL DO PACIENTE/)})
test('infant visual experience remains optional and conditional',()=>{assert.match(source,/kid\.lifeCycle==='Criança'/);assert.match(source,/MODO VISUAL INFANTIL/)})
