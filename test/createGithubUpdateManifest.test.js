import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createGithubUpdateManifest, parseArgs } from '../scripts/createGithubUpdateManifest.js'

async function fixture(run) {
  const dir = await mkdtemp(path.join(tmpdir(), 'circulo-manifest-'))
  const installerPath = path.join(dir, 'Círculo_0.2.17_x64-setup.exe')
  const signaturePath = `${installerPath}.sig`
  const outputPath = path.join(dir, 'latest.json')
  try {
    await writeFile(installerPath, 'synthetic installer')
    await writeFile(signaturePath, 'c3ludGhldGljLXNpZ25hdHVyZQ==\n')
    await run({ version: '0.2.17', installerPath, signaturePath, outputPath, notes: 'Teste sintético' })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('creates immutable-tag Windows update manifest from exact local artifacts', async () => fixture(async options => {
  const result = await createGithubUpdateManifest(options)
  assert.deepEqual(JSON.parse(await readFile(options.outputPath, 'utf8')), result)
  assert.equal(result.version, '0.2.17')
  assert.equal(result.notes, 'Teste sintético')
  assert.deepEqual(result.platforms['windows-x86_64'], {
    url: 'https://github.com/Alexandre-Hott/circulo-psicologia/releases/download/v0.2.17/C%C3%ADrculo_0.2.17_x64-setup.exe',
    signature: 'c3ludGhldGljLXNpZ25hdHVyZQ==',
  })
  await assert.rejects(createGithubUpdateManifest(options), /EEXIST/)
}))

test('rejects mismatched version, empty files and malformed signature', async () => fixture(async options => {
  await assert.rejects(createGithubUpdateManifest({ ...options, version: '0.2.18' }), /Instalador deve/)
  await assert.rejects(createGithubUpdateManifest({ ...options, version: 'v0.2.17' }), /semver/)
  await writeFile(options.installerPath, '')
  await assert.rejects(createGithubUpdateManifest(options), /Instalador ausente, vazio/)
  await writeFile(options.installerPath, 'synthetic installer')
  await writeFile(options.signaturePath, 'not a signature')
  await assert.rejects(createGithubUpdateManifest(options), /base64/)
  await writeFile(options.signaturePath, '')
  await assert.rejects(createGithubUpdateManifest(options), /Assinatura ausente, vazia/)
}))

test('requires explicit CLI arguments', () => {
  assert.deepEqual(parseArgs(['--version', '0.2.17', '--installer', 'a', '--signature', 'b', '--notes', 'n', '--output', 'latest.json']), {
    version: '0.2.17', installerPath: 'a', signaturePath: 'b', notes: 'n', outputPath: 'latest.json',
  })
  assert.throws(() => parseArgs(['--version', '0.2.17']), /Faltam/)
  assert.throws(() => parseArgs(['--version', '0.2.17', '--version', '0.2.18']), /uma vez/)
})
