import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function requireEqual(label, actual, expected) {
  if (actual !== expected) throw new Error(`${label}: esperado ${expected}, encontrado ${actual ?? 'indisponível'}.`)
}

function requireDocumentReference(label, content, basename, version, sha256) {
  const at = content.indexOf(basename)
  if (at < 0) throw new Error(`${label}: nome do NSIS ${basename} não encontrado.`)
  const reference = content.slice(at, at + 1000).toLowerCase()
  if (!reference.includes(version)) throw new Error(`${label}: versão ${version} não acompanha o NSIS.`)
  if (!reference.includes(sha256)) throw new Error(`${label}: SHA-256 ${sha256} não acompanha o NSIS.`)
}

/** Read-only consistency check. Every path and the expected version must be supplied explicitly. */
export async function verifyReleaseConsistency(input, dependencies = {}) {
  const {
    read = readFile, fileStat = stat, canonicalize = realpathSync.native,
    hash = bytes => createHash('sha256').update(bytes).digest('hex'),
  } = dependencies
  const required = ['installerPath', 'manifestPath', 'packagePath', 'tauriConfigPath', 'readmePath', 'releaseNotePath', 'expectedVersion']
  for (const field of required) {
    if (typeof input?.[field] !== 'string' || !input[field].trim()) throw new Error(`Informe ${field} explicitamente.`)
  }
  const { installerPath, manifestPath, packagePath, tauriConfigPath, readmePath, releaseNotePath, expectedVersion } = input
  if (!/^\d+\.\d+\.\d+$/.test(expectedVersion)) throw new Error('expectedVersion deve ser uma versão X.Y.Z.')

  const [packageText, tauriText, manifestText, readmeText, noteText, installerInfo, installerBytes] = await Promise.all([
    read(packagePath, 'utf8'),
    read(tauriConfigPath, 'utf8'),
    read(manifestPath, 'utf8'),
    read(readmePath, 'utf8'),
    read(releaseNotePath, 'utf8'),
    fileStat(installerPath),
    read(installerPath),
  ])
  if (!installerInfo.isFile() || installerInfo.size <= 0) throw new Error('NSIS não é arquivo regular não vazio.')
  const packageJson = JSON.parse(packageText)
  const tauriConfig = JSON.parse(tauriText)
  const manifest = JSON.parse(manifestText)
  const expectedBasename = `${tauriConfig.productName}_${expectedVersion}_x64-setup.exe`
  const actualBasename = path.basename(installerPath)

  requireEqual('package.json.version', packageJson.version, expectedVersion)
  requireEqual('tauri.conf.json.version', tauriConfig.version, expectedVersion)
  requireEqual('nome do NSIS', actualBasename, expectedBasename)
  requireEqual('manifest.expectedVersion', manifest.expectedVersion, expectedVersion)
  requireEqual('manifest.peVersion', manifest.peVersion, expectedVersion)
  requireEqual('manifest.basename', manifest.basename, expectedBasename)
  requireEqual('manifest.targetArchitecture', manifest.targetArchitecture, 'x64')
  requireEqual('manifest.targetTriple', manifest.targetTriple, 'x86_64-pc-windows-msvc')
  let auditedPath
  try {
    auditedPath = canonicalize(manifest.artifactPath)
  } catch {
    throw new Error('manifest.artifactPath: o arquivo auditado não pôde ser resolvido.')
  }
  requireEqual('manifest.artifactPath', auditedPath, canonicalize(installerPath))
  requireEqual('manifest.sizeBytes', manifest.sizeBytes, installerInfo.size)
  requireEqual('bytes lidos do NSIS', installerBytes.length, installerInfo.size)
  const actualSha256 = hash(installerBytes).toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(actualSha256)) throw new Error('SHA-256 calculado inválido.')
  requireEqual('manifest.sha256', String(manifest.sha256 || '').toLowerCase(), actualSha256)
  requireDocumentReference('README.md', readmeText, expectedBasename, expectedVersion, actualSha256)
  requireDocumentReference('nota de validação', noteText, expectedBasename, expectedVersion, actualSha256)

  return { version: expectedVersion, basename: expectedBasename, sizeBytes: installerInfo.size, sha256: actualSha256 }
}

export function parseArgs(args) {
  const names = {
    '--installer': 'installerPath', '--manifest': 'manifestPath', '--package': 'packagePath',
    '--tauri-config': 'tauriConfigPath', '--readme': 'readmePath',
    '--release-note': 'releaseNotePath', '--expected-version': 'expectedVersion',
  }
  const values = {}
  for (let index = 0; index < args.length; index += 2) {
    const name = names[args[index]]
    if (!name || !args[index + 1] || name in values) throw new Error('Argumentos inválidos ou repetidos; informe todos os caminhos e --expected-version.')
    values[name] = args[index + 1]
  }
  return values
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const result = await verifyReleaseConsistency(parseArgs(process.argv.slice(2)))
    console.log(`Release consistente: ${result.basename}; ${result.sizeBytes} bytes; SHA-256 ${result.sha256}.`)
    console.log('Estado de instalação não é alterado por esta verificação.')
  } catch (error) {
    console.error(`Consistência do release falhou: ${error.message}`)
    process.exitCode = 1
  }
}
