import test from 'node:test';import assert from 'node:assert/strict';import { findForbidden } from '../scripts/repositoryGuard.js'
test('synthetic workspace has no prohibited clinical data or secrets',()=>assert.deepEqual(findForbidden(process.cwd()),[]))
