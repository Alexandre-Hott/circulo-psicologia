import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { emptyDemoState, summarizeDemoState } from '../src/demoState.js'
import { hasDraftContent, shouldGuardDraftExit } from '../src/draftGuard.js'

test('temporary-state summary includes profiles, series, exceptions, changes, sessions, library and drafts', () => {
  const state = { patients:[{id:1}], series:[{id:'s1',exceptions:{'2026-09-21':{status:'Cancelado'}},changes:[{effectiveDate:'2026-09-28'}]}], sessions:[{id:1},{id:2}], library:[{id:'a'}], drafts:{1:{date:'2026-09-22'}} }
  assert.deepEqual(summarizeDemoState(state), {patients:1,series:1,exceptions:1,seriesChanges:1,sessions:2,libraryItems:1,drafts:1})
  const cleared = emptyDemoState()
  assert.deepEqual(summarizeDemoState(cleared), {patients:0,series:0,exceptions:0,seriesChanges:0,sessions:0,libraryItems:0,drafts:0})
  assert.equal(state.series[0].exceptions['2026-09-21'].status,'Cancelado')
})

test('demonstration UI does not persist clinical drafts to browser storage', () => {
  const source = readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')
  assert.doesNotMatch(source,/localStorage|sessionStorage|indexedDB/i)
  assert.match(source,/Confirmar limpeza/)
  assert.match(source,/Cancelar/)
  assert.match(source,/desaparecem ao recarregar/)
})

test('only meaningful edits require confirmation before leaving a session', () => {
  const empty={date:'2026-09-22',duration:'50',childEmotions:[],behaviorOccurrences:[],indicatorValues:{},indicatorNotes:{}}
  assert.equal(hasDraftContent(empty,'2026-09-22'),false)
  assert.equal(hasDraftContent({...empty,arrived:'Chegada fictícia'},'2026-09-22'),true)
  assert.equal(hasDraftContent({...empty,childEmotions:[{key:'calma'}]},'2026-09-22'),true)
  assert.equal(hasDraftContent({...empty,indicatorValues:{reg:0}},'2026-09-22'),true)
  assert.equal(hasDraftContent({...empty,date:'2026-09-23'},'2026-09-22'),true)
  const saved={...empty,patientId:1,arrived:'Chegada fictícia'}
  const cleared={...saved,arrived:''}
  assert.equal(hasDraftContent(cleared,'2026-09-22'),false)
  assert.equal(shouldGuardDraftExit(cleared,saved,'2026-09-22'),true)
  assert.equal(shouldGuardDraftExit(empty,null,'2026-09-22'),false)
})
