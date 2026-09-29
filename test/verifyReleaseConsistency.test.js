import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs, verifyReleaseConsistency } from '../scripts/verifyReleaseConsistency.js'

const version = '0.2.1'
const basename = `Círculo_${version}_x64-setup.exe`

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'circulo-release-consistency-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const installerPath = path.join(root, basename)
  const manifestPath = path.join(root, 'audit.json')
  const packagePath = path.join(root, 'package.json')
  const tauriConfigPath = path.join(root, 'tauri.json')
  const readmePath = path.join(root, 'README.md')
  const releaseNotePath = path.join(root, 'release.md')
  const bytes = Buffer.from('synthetic NSIS fixture, not a real installer')
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  writeFileSync(installerPath, bytes)
  writeFileSync(packagePath, JSON.stringify({ version }))
  writeFileSync(tauriConfigPath, JSON.stringify({ version, productName: 'Círculo' }))
  writeFileSync(manifestPath, JSON.stringify({
    artifactPath: installerPath, basename, expectedVersion: version, peVersion: version,
    targetArchitecture: 'x64', targetTriple: 'x86_64-pc-windows-msvc',
    sizeBytes: bytes.length, sha256, installationTested: false,
  }))
  writeFileSync(readmePath, `Release ${basename} (SHA-256 ${sha256}).`)
  writeFileSync(releaseNotePath, `NSIS ${basename}\nSHA-256: ${sha256}`)
  const input = { installerPath, manifestPath, packagePath, tauriConfigPath, readmePath, releaseNotePath, expectedVersion: version }
  const changeJson = (file, change) => {
    const value = JSON.parse(readFileSync(file, 'utf8'))
    change(value)
    writeFileSync(file, JSON.stringify(value))
  }
  return { input, bytes, sha256, changeJson }
}

test('checks a synthetic release fixture without changing audit installation status', async t => {
  const { input, bytes, sha256 } = fixture(t)
  const manifestBefore = readFileSync(input.manifestPath, 'utf8')
  const result = await verifyReleaseConsistency(input)
  assert.deepEqual(result, { version, basename, sizeBytes: bytes.length, sha256 })
  assert.equal(readFileSync(input.manifestPath, 'utf8'), manifestBefore)
})

test('accepts two path spellings only when canonicalization identifies the same artifact', async t => {
  const { input, changeJson } = fixture(t)
  changeJson(input.manifestPath, value => { value.artifactPath = 'synthetic-short-path-alias' })
  const result = await verifyReleaseConsistency(input, {
    canonicalize: target => target === 'synthetic-short-path-alias' ? input.installerPath : target,
  })
  assert.equal(result.basename, basename)
})

test('Windows real 8.3 Temp alias resolves to the audited artifact', async t => {
  if (process.platform !== 'win32') {
    t.skip('Integração de alias 8.3 disponível somente no Windows.')
    return
  }
  const temporaryRoot = os.tmpdir()
  const canonicalTemp = realpathSync.native(temporaryRoot)
  if (!/~\d+/.test(temporaryRoot) || temporaryRoot.toLowerCase() === canonicalTemp.toLowerCase()) {
    t.skip('Este ambiente Windows não expõe um alias 8.3 distinto para Temp.')
    return
  }
  const { input, changeJson } = fixture(t)
  const longInstallerPath = realpathSync.native(input.installerPath)
  assert.notEqual(input.installerPath.toLowerCase(), longInstallerPath.toLowerCase())
  changeJson(input.manifestPath, value => { value.artifactPath = longInstallerPath })
  const result = await verifyReleaseConsistency(input)
  assert.equal(result.basename, basename)
})

test('rejects package, Tauri and audited PE version divergence', async t => {
  const { input, changeJson } = fixture(t)
  changeJson(input.packagePath, value => { value.version = '0.2.0' })
  await assert.rejects(verifyReleaseConsistency(input), /package\.json\.version/)
  changeJson(input.packagePath, value => { value.version = version })
  changeJson(input.tauriConfigPath, value => { value.version = '0.2.0' })
  await assert.rejects(verifyReleaseConsistency(input), /tauri\.conf\.json\.version/)
  changeJson(input.tauriConfigPath, value => { value.version = version })
  changeJson(input.manifestPath, value => { value.peVersion = '0.2.0' })
  await assert.rejects(verifyReleaseConsistency(input), /manifest\.peVersion/)
})

test('rejects a manifest with a different NSIS name, artifact path or architecture', async t => {
  const { input, changeJson } = fixture(t)
  changeJson(input.manifestPath, value => { value.basename = 'Other_0.2.1_x64-setup.exe' })
  await assert.rejects(verifyReleaseConsistency(input), /manifest\.basename/)
  changeJson(input.manifestPath, value => { value.basename = basename; value.artifactPath = 'different.exe' })
  await assert.rejects(verifyReleaseConsistency(input), /manifest\.artifactPath/)
  changeJson(input.manifestPath, value => { value.artifactPath = input.installerPath; value.targetArchitecture = 'arm64' })
  await assert.rejects(verifyReleaseConsistency(input), /manifest\.targetArchitecture/)
})

test('rejects a different file size or recalculated SHA-256', async t => {
  const { input, changeJson } = fixture(t)
  changeJson(input.manifestPath, value => { value.sizeBytes += 1 })
  await assert.rejects(verifyReleaseConsistency(input), /manifest\.sizeBytes/)
  changeJson(input.manifestPath, value => { value.sizeBytes -= 1 })
  writeFileSync(input.installerPath, Buffer.from('synthetic NSIS fixture, not a real installeR'))
  await assert.rejects(verifyReleaseConsistency(input), /manifest\.sha256/)
})

test('rejects drift in either release document', async t => {
  const { input, sha256 } = fixture(t)
  writeFileSync(input.readmePath, `Release ${basename} (SHA-256 ${'0'.repeat(64)}).`)
  await assert.rejects(verifyReleaseConsistency(input), /README\.md: SHA-256/)
  writeFileSync(input.readmePath, `Release ${basename} (SHA-256 ${sha256}).`)
  writeFileSync(input.releaseNotePath, `NSIS Other_${version}_x64-setup.exe\nSHA-256: ${sha256}`)
  await assert.rejects(verifyReleaseConsistency(input), /nota de validação: nome do NSIS/)
})

test('requires explicit CLI inputs and rejects duplicate flags', async () => {
  assert.throws(() => parseArgs(['--installer', 'fixture.exe', '--installer', 'again.exe']), /repetidos/)
  assert.throws(() => parseArgs(['--unknown', 'value']), /Argumentos inválidos/)
  await assert.rejects(verifyReleaseConsistency({ expectedVersion: version }), /installerPath explicitamente/)
})
