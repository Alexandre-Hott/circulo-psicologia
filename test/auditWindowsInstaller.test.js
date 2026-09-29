import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { audit } from '../scripts/auditWindowsInstaller.js'

const tempDir = path.join(os.tmpdir(), 'circulo-installer-audit-tests')
const installerPath = path.join(tempDir, 'Círculo_0.1.0_x64-setup.exe')
const manifestPath = path.join(tempDir, 'audit-manifest.json')

function setup({ size = 10, peVersion = '0.1.0', signatureStatus = 'NotSigned', exists = true } = {}) {
  let written
  const run = (command, args) => {
    if (args.includes('-Command')) return { ok: true, output: JSON.stringify({ productVersion: peVersion, fileVersion: peVersion, signatureStatus }) }
    return { ok: true, output: `${command} version 1.2.3` }
  }
  const dependencies = {
    tempDir,
    exists: target => target === installerPath ? exists : false,
    stat: () => ({ isFile: () => true, size, mtime: new Date('2026-09-01T00:00:00.000Z') }),
    lstat: () => ({ isSymbolicLink: () => false }),
    realpath: target => path.resolve(target),
    statDirectory: target => target === tempDir ? { dev: 1, ino: 2 } : { dev: 1, ino: target === path.dirname(manifestPath) ? 2 : 3 },
    readStream: () => Readable.from([Buffer.from('synthetic installer bytes')]),
    run,
    writeFile: (target, content, options) => { written = { target, content, options } },
    now: () => new Date('2026-09-26T12:00:00.000Z')
  }
  return { dependencies, getWritten: () => written }
}

test('audits a NotSigned installer and writes reproducible metadata to Temp', async () => {
  const context = setup()
  const manifest = await audit({ installerPath, expectedVersion: '0.1.0', manifestPath }, { ...context.dependencies, targetArchitecture: 'x86_64-pc-windows-msvc' })

  assert.equal(manifest.basename, path.basename(installerPath))
  assert.equal(manifest.expectedVersion, '0.1.0')
  assert.equal(manifest.peVersion, '0.1.0')
  assert.equal(manifest.sizeBytes, 10)
  assert.match(manifest.sha256, /^[a-f0-9]{64}$/)
  assert.equal(manifest.authenticodeStatus, 'NotSigned')
  assert.equal(manifest.toolVersions.node, `${process.execPath} version 1.2.3`)
  assert.equal(manifest.contentInspection, 'not-performed')
  assert.equal(manifest.targetArchitecture, 'x64')
  assert.equal(manifest.targetTriple, 'x86_64-pc-windows-msvc')
  assert.equal(manifest.installationTested, false)
  assert.equal(manifest.uninstallationTested, false)
  assert.equal(manifest.appRuntimeTested, false)
  assert.match(manifest.contentInspectionReason, /não foi extraído nem executado/)
  assert.equal(context.getWritten().target, manifestPath)
  assert.equal(context.getWritten().options.flag, 'wx')
})

test('runtime/install flags remain false and target is detected when not supplied', async () => {
  const context = setup()
  const manifest = await audit({ installerPath, expectedVersion: '0.1.0', manifestPath }, context.dependencies)
  assert.ok(manifest.targetArchitecture)
  assert.ok(manifest.targetTriple)
  assert.equal(manifest.installationTested, false)
  assert.equal(manifest.uninstallationTested, false)
  assert.equal(manifest.appRuntimeTested, false)
})

test('records Tauri CLI and NSIS versions when found outside PATH', async () => {
  const { dependencies } = setup()
  const projectRoot = path.join(tempDir, 'project')
  const tauriScript = path.join(projectRoot, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')
  const nsisExecutable = 'D:\\Installed\\NSIS\\makensis.exe'
  const defaultRun = dependencies.run
  dependencies.projectRoot = projectRoot
  dependencies.nsisPaths = [nsisExecutable]
  dependencies.exists = target => target === installerPath || target === tauriScript || target === nsisExecutable
  dependencies.run = (command, args, ...rest) => {
    if (args.includes('-Command')) return defaultRun(command, args, ...rest)
    if (command === 'where.exe' && args[0] === 'makensis.exe') return { ok: false, output: '' }
    if (command === process.execPath && args[0] === tauriScript) return { ok: true, output: 'tauri-cli 2.11.5' }
    if (command === nsisExecutable && args[0] === '/VERSION') return { ok: true, output: '3.12' }
    return defaultRun(command, args, ...rest)
  }

  const manifest = await audit({ installerPath, expectedVersion: '0.1.0', manifestPath }, dependencies)
  assert.equal(manifest.toolVersions.tauriCli, 'tauri-cli 2.11.5')
  assert.equal(manifest.toolVersions.nsis, '3.12')
})

test('fails when installer is missing', async () => {
  const { dependencies } = setup({ exists: false })
  await assert.rejects(audit({ installerPath, expectedVersion: '0.1.0', manifestPath }, dependencies), /não existe/)
})

test('fails when installer is empty', async () => {
  const { dependencies } = setup({ size: 0 })
  await assert.rejects(audit({ installerPath, expectedVersion: '0.1.0', manifestPath }, dependencies), /vazio/)
})

test('fails when PE version diverges from expected version', async () => {
  const { dependencies } = setup({ peVersion: '0.2.0' })
  await assert.rejects(audit({ installerPath, expectedVersion: '0.1.0', manifestPath }, dependencies), /Versão PE divergente/)
})

test('does not accept signed or unknown Authenticode as unsigned', async () => {
  for (const signatureStatus of ['Valid', 'UnknownError', 'Unknown']) {
    const { dependencies } = setup({ signatureStatus })
    await assert.rejects(audit({ installerPath, expectedVersion: '0.1.0', manifestPath }, dependencies), /Status Authenticode inesperado/)
  }
})

test('fails when manifest path is outside system Temp', async () => {
  const { dependencies } = setup()
  const forbidden = path.join(process.cwd(), 'audit-manifest.json')
  await assert.rejects(audit({ installerPath, expectedVersion: '0.1.0', manifestPath: forbidden }, dependencies), /dentro do diretório temporário/)
})

test('fails signed mode unless Authenticode status is Valid', async () => {
  const { dependencies } = setup({ signatureStatus: 'NotSigned' })
  await assert.rejects(audit({ installerPath, expectedVersion: '0.1.0', manifestPath, expectedSignature: 'signed' }, dependencies), /Status Authenticode inesperado/)
})
