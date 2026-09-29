import { createHash } from 'node:crypto'
import { createReadStream, existsSync, lstatSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

function defaultRun(command, args, input, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', input, windowsHide: true, timeout: 30000, ...options })
  return { ok: result.status === 0, output: result.stdout || '', stderr: result.stderr || '', error: result.error?.message }
}

function firstLine(value) {
  return String(value || '').split(/\r?\n/).find(line => line.trim())?.trim() || null
}

function assertManifestPath(manifestPath, { tempDir, realpath, statDirectory }) {
  const absoluteTemp = realpath(path.resolve(tempDir))
  const absoluteManifest = path.resolve(manifestPath)
  const resolvedParent = realpath(path.dirname(absoluteManifest))
  const resolvedManifest = path.join(resolvedParent, path.basename(absoluteManifest))
  const tempIdentity = statDirectory(absoluteTemp)
  let ancestor = resolvedParent
  let allowed = false
  while (true) {
    const identity = statDirectory(ancestor)
    if (identity.dev === tempIdentity.dev && identity.ino === tempIdentity.ino) {
      allowed = true
      break
    }
    const parent = path.dirname(ancestor)
    if (parent === ancestor) break
    ancestor = parent
  }
  if (!allowed) {
    throw new Error('Manifest precisa ser salvo em um arquivo dentro do diretório temporário do sistema.')
  }
  return resolvedManifest
}

function hashFile(filePath, hashFactory, readStream) {
  return new Promise((resolve, reject) => {
    const hash = hashFactory('sha256')
    const stream = readStream(filePath)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => {
      try {
        const digest = hash.digest('hex')
        if (!/^[a-f0-9]{64}$/i.test(digest)) throw new Error('SHA256 retornou um digest inválido.')
        resolve(digest.toLowerCase())
      } catch (error) { reject(error) }
    })
  })
}

function readPeMetadata(filePath, run) {
  const command = process.env.SystemRoot
    ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe'
  const script = "Import-Module (Join-Path $PSHOME 'Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop; $p=$env:CIRCULO_INSTALLER_AUDIT_TARGET; $i=[Diagnostics.FileVersionInfo]::GetVersionInfo($p); $s=Get-AuthenticodeSignature -LiteralPath $p; [pscustomobject]@{ productVersion=$i.ProductVersion; fileVersion=$i.FileVersion; signatureStatus=[string]$s.Status } | ConvertTo-Json -Compress"
  const result = run(command, ['-NoProfile', '-NonInteractive', '-Command', script], undefined, {
    env: { ...process.env, CIRCULO_INSTALLER_AUDIT_TARGET: filePath }
  })
  if (!result.ok || result.stderr?.trim()) throw new Error(`Não foi possível ler versão PE/Authenticode: ${result.error || result.stderr?.trim().slice(0, 500) || firstLine(result.output) || 'PowerShell falhou'}`)
  try {
    const metadata = JSON.parse(result.output.trim())
    return { peVersion: metadata.productVersion || metadata.fileVersion || null, signatureStatus: metadata.signatureStatus || 'Unknown' }
  } catch {
    throw new Error('A leitura de metadados PE/Authenticode retornou resposta inválida.')
  }
}

function getToolVersions({ run, exists, projectRoot, nsisPaths }) {
  const commands = [
    ['node', process.execPath, ['--version']],
    ['rust', 'rustc', ['--version']],
    ['cargo', 'cargo', ['--version']],
  ]
  const versions = Object.fromEntries(commands.map(([key, command, args]) => {
    const result = run(command, args)
    return [key, result.ok ? firstLine(result.output) : null]
  }))

  const tauriScript = path.join(projectRoot, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')
  const tauriResult = exists(tauriScript) ? run(process.execPath, [tauriScript, '--version']) : { ok: false }
  versions.tauriCli = tauriResult.ok ? firstLine(tauriResult.output) : null

  const pathResult = run('where.exe', ['makensis.exe'])
  const inPath = pathResult.ok && pathResult.output.split(/\r?\n/).find(line => /makensis\.exe$/i.test(line.trim()))?.trim()
  const nsisExecutable = [inPath, ...nsisPaths].find(candidate => candidate && exists(candidate))
  const nsisResult = nsisExecutable ? run(nsisExecutable, ['/VERSION']) : { ok: false }
  versions.nsis = nsisResult.ok ? firstLine(nsisResult.output) : null
  return versions
}

export async function audit({ installerPath, expectedVersion, manifestPath, expectedSignature = 'unsigned' }, dependencies = {}) {
  const {
    exists = existsSync,
    stat = statSync,
    lstat = lstatSync,
    realpath = realpathSync,
    statDirectory = statSync,
    tempDir = os.tmpdir(),
    projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    nsisPaths = ['C:\\Program Files (x86)\\NSIS\\makensis.exe', 'C:\\Program Files\\NSIS\\makensis.exe'],
    hashFactory = createHash,
    readStream = createReadStream,
    run = defaultRun,
    writeFile = writeFileSync,
    now = () => new Date(),
    targetArchitecture = process.env.CARGO_BUILD_TARGET || null
  } = dependencies

  if (!installerPath || !expectedVersion || !manifestPath) throw new Error('Informe installerPath, expectedVersion e manifestPath.')
  if (!['unsigned', 'signed'].includes(expectedSignature)) throw new Error('expectedSignature deve ser unsigned ou signed.')
  const absoluteInstaller = path.resolve(installerPath)
  if (!exists(absoluteInstaller)) throw new Error('Arquivo do instalador não existe.')
  const info = stat(absoluteInstaller)
  if (!info.isFile() || info.size <= 0) throw new Error('Arquivo do instalador está vazio ou não é um arquivo regular.')

  const absoluteManifest = assertManifestPath(manifestPath, { tempDir, realpath, statDirectory })
  if (exists(absoluteManifest)) throw new Error('O manifest já existe; escolha um caminho temporário novo.')
  const manifestParentInfo = lstat(path.dirname(absoluteManifest))
  if (manifestParentInfo.isSymbolicLink()) throw new Error('Não é permitido salvar manifest por meio de diretório simbólico.')

  const { peVersion, signatureStatus } = readPeMetadata(absoluteInstaller, run)
  if (!peVersion || normalizeVersion(peVersion) !== normalizeVersion(expectedVersion)) {
    throw new Error(`Versão PE divergente: esperada ${expectedVersion}, encontrada ${peVersion || 'indisponível'}.`)
  }
  const requiredSignature = expectedSignature === 'unsigned' ? 'NotSigned' : 'Valid'
  if (signatureStatus !== requiredSignature) {
    throw new Error(`Status Authenticode inesperado: modo ${expectedSignature} exige ${requiredSignature}, encontrado ${signatureStatus}.`)
  }

  const sha256 = await hashFile(absoluteInstaller, hashFactory, readStream)
  const hostArchitecture = process.arch
  const architecture = targetArchitecture || ({ x64: 'x86_64-pc-windows-msvc', arm64: 'aarch64-pc-windows-msvc', ia32: 'i686-pc-windows-msvc' }[hostArchitecture] || `unknown-${hostArchitecture}`)
  const manifest = {
    artifactPath: absoluteInstaller,
    basename: path.basename(absoluteInstaller),
    expectedVersion,
    peVersion,
    sizeBytes: info.size,
    mtime: info.mtime.toISOString(),
    sha256,
    authenticodeStatus: signatureStatus,
    expectedSignature,
    targetArchitecture: architecture.startsWith('x86_64-') ? 'x64' : architecture.startsWith('aarch64-') ? 'arm64' : architecture.startsWith('i686-') ? 'x86' : hostArchitecture,
    targetTriple: architecture,
    installationTested: false,
    uninstallationTested: false,
    appRuntimeTested: false,
    toolVersions: getToolVersions({ run, exists, projectRoot, nsisPaths }),
    auditedAtUtc: now().toISOString(),
    contentInspection: 'not-performed',
    contentInspectionReason: 'O bundle NSIS não foi extraído nem executado; esta auditoria registra somente metadados do arquivo e não inspeciona seu conteúdo interno.'
  }
  writeFile(absoluteManifest, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
  return manifest
}

function normalizeVersion(value) {
  return String(value).trim().replace(/^v/i, '').replace(/\+.*$/, '')
}

function parseArgs(args) {
  const values = {}
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]
    if (!['--installer', '--expected-version', '--manifest', '--signature'].includes(key) || !args[index + 1]) {
      throw new Error('Uso: node scripts/auditWindowsInstaller.js --installer <exe> --expected-version <versão> --manifest <arquivo-em-Temp> [--signature unsigned|signed]')
    }
    const name = { '--installer': 'installerPath', '--expected-version': 'expectedVersion', '--manifest': 'manifestPath', '--signature': 'expectedSignature' }[key]
    if (name in values) throw new Error(`Argumento repetido: ${key}`)
    values[name] = args[++index]
  }
  return values
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const input = parseArgs(process.argv.slice(2))
    const manifest = await audit(input)
    console.log(`Manifest salvo: ${path.resolve(input.manifestPath)}`)
    console.log(`SHA256: ${manifest.sha256}`)
    console.log(`Authenticode: ${manifest.authenticodeStatus}; conteúdo interno não inspecionado.`)
    console.log(`Alvo: ${manifest.targetArchitecture} (${manifest.targetTriple}); instalação/execução não testadas.`)
  } catch (error) {
    console.error(`Auditoria falhou: ${error.message}`)
    process.exitCode = 1
  }
}
