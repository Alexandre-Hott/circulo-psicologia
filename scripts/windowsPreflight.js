import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const TARGET = 'x86_64-pc-windows-msvc'
const WEBVIEW2_CLIENT = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'

function commandResult(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    shell: process.platform === 'win32' && ['npm', 'npx'].includes(command),
    ...options
  })
  return {
    ok: result.status === 0,
    output: `${result.stdout || ''}\n${result.stderr || ''}`.trim(),
    error: result.error?.message
  }
}

function commandCheck(name, command, args, hint, run) {
  const result = run(command, args)
  return {
    name,
    ok: result.ok,
    detail: result.ok ? firstLine(result.output) : hint,
    output: result.output,
    hint: result.ok ? undefined : hint
  }
}

function firstLine(value = '') {
  return value.split(/\r?\n/).find(line => line.trim())?.trim() || 'disponível'
}

function findWindowsSdk({ env, sdkPaths, exists, listDirectories }) {
  const includeRoots = env.WindowsSdkDir
    ? [`${env.WindowsSdkDir.replace(/[\\/]$/, '')}\\Include`]
    : sdkPaths
  for (const includeRoot of includeRoots) {
    if (!exists(includeRoot)) continue
    let versions = []
    try {
      versions = listDirectories(includeRoot)
    } catch {
      versions = []
    }
    if (env.WindowsSDKVersion) {
      const requested = env.WindowsSDKVersion.replace(/[\\/]$/, '')
      versions = versions.filter(version => version === requested)
    }
    for (const version of versions.filter(value => /^\d+\.\d+\.\d+\.\d+$/.test(value))) {
      const kitsRoot = includeRoot.replace(/[\\/]Include$/i, '')
      const includeVersion = `${includeRoot}\\${version}`
      const complete = ['um', 'shared'].every(folder => exists(`${includeVersion}\\${folder}`)) && exists(`${kitsRoot}\\Lib\\${version}\\um\\x64`)
      if (complete) return `${includeRoot}\\${version}`
    }
  }
  return null
}

function findMsvc({ env, run, exists, listDirectories, vswherePaths, visualStudioRoots }) {
  const roots = new Set()
  if (env.VSINSTALLDIR) roots.add(env.VSINSTALLDIR.replace(/[\\/]$/, ''))

  const vswhere = vswherePaths.find(exists)
  const whereVswhere = !vswhere && run('where.exe', ['vswhere.exe'])
  const vswhereExecutable = vswhere || (whereVswhere?.ok && whereVswhere.output.split(/\r?\n/).find(path => /vswhere\.exe$/i.test(path.trim()))?.trim())
  if (vswhereExecutable) {
    const result = run(vswhereExecutable, [
      '-latest', '-products', '*', '-requires',
      'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'
    ])
    if (result.ok) {
      for (const root of result.output.split(/\r?\n/).map(line => line.trim()).filter(Boolean)) roots.add(root.replace(/[\\/]$/, ''))
    }
  }

  for (const root of visualStudioRoots) roots.add(root)
  for (const root of roots) {
    const msvcRoot = `${root}\\VC\\Tools\\MSVC`
    let versions = []
    if (exists(msvcRoot)) {
      try {
        versions = listDirectories(msvcRoot).map(name => `${msvcRoot}\\${name}`)
      } catch {
        versions = []
      }
    }
    for (const versionPath of versions) {
      const bin = `${versionPath}\\bin\\Hostx64\\x64`
      const compiler = `${bin}\\cl.exe`
      const linker = `${bin}\\link.exe`
      const vcvars = `${root}\\VC\\Auxiliary\\Build\\vcvars64.bat`
      if (exists(compiler) && exists(linker) && exists(vcvars)) return { compiler, linker, root, versionPath }
    }
  }
  return null
}

function findNsis({ run, exists, nsisPaths }) {
  const pathResult = run('where.exe', ['makensis.exe'])
  const inPath = pathResult.ok && pathResult.output.split(/\r?\n/).find(line => /makensis\.exe$/i.test(line.trim()))?.trim()
  const executable = [inPath, ...nsisPaths].find(path => path && exists(path))
  if (!executable) return { ok: false, detail: 'NSIS/makensis.exe não encontrado no PATH ou nos diretórios padrão' }
  const version = run(executable, ['/VERSION'])
  return version.ok
    ? { ok: true, detail: `${executable} (${firstLine(version.output)})` }
    : { ok: false, detail: `${executable} foi encontrado, mas não executou com /VERSION` }
}

export function createWindowsPreflight({
  platform = process.platform,
  env = process.env,
  run = commandResult,
  exists = existsSync,
  listDirectories = path => readdirSync(path, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name),
  sdkPaths = [
    'C:\\Program Files (x86)\\Windows Kits\\10\\Include',
    'C:\\Program Files\\Windows Kits\\10\\Include'
  ],
  perlPaths = [
    'C:\\Strawberry\\perl\\bin\\perl.exe',
    'C:\\Strawberry\\c\\bin\\perl.exe'
  ],
  vswherePaths = ['C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe'],
  visualStudioRoots = [
    ...['2022', '2019'].flatMap(year => ['BuildTools', 'Community', 'Professional', 'Enterprise'].map(edition => `C:\\Program Files (x86)\\Microsoft Visual Studio\\${year}\\${edition}`)),
    ...['2022', '2019'].flatMap(year => ['BuildTools', 'Community', 'Professional', 'Enterprise'].map(edition => `C:\\Program Files\\Microsoft Visual Studio\\${year}\\${edition}`))
  ],
  nsisPaths = ['C:\\Program Files (x86)\\NSIS\\makensis.exe', 'C:\\Program Files\\NSIS\\makensis.exe'],
  webViewRegistryKey = `HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\${WEBVIEW2_CLIENT}`
} = {}) {
  const windows = platform === 'win32'
  const native = [
    commandCheck('Node.js', 'node', ['--version'], 'Instale Node.js LTS e reabra o terminal.', run),
    commandCheck('npm', 'npm', ['--version'], 'Instale npm junto com Node.js LTS.', run),
    commandCheck('Rust', 'rustc', ['--version'], 'Instale Rust stable pelo rustup.', run),
    commandCheck('Cargo', 'cargo', ['--version'], 'Instale Rust stable pelo rustup (inclui Cargo).', run),
    commandCheck('Tauri CLI', 'npx', ['tauri', '--version'], 'Execute npm install para disponibilizar a Tauri CLI do projeto.', run),
    commandCheck('Target Rust MSVC', 'rustup', ['target', 'list', '--installed'], 'Execute: rustup target add x86_64-pc-windows-msvc.', run)
  ]

  const target = native.at(-1)
  target.ok = target.ok && target.output.split(/\s+/).includes(TARGET)
  delete target.output
  if (!target.ok) {
    target.detail = `target ${TARGET} não instalado`
    target.hint = `Instale com: rustup target add ${TARGET}.`
  }

  if (windows) {
    const msvc = findMsvc({ env, run, exists, listDirectories, vswherePaths, visualStudioRoots })
    for (const [name, executable, hint] of [
      ['MSVC cl.exe', msvc?.compiler, 'Instale/ative o workload “Desenvolvimento para desktop com C++” do Visual Studio Build Tools 2022.'],
      ['MSVC link.exe', msvc?.linker, 'Instale/ative o linker do MSVC no Visual Studio Build Tools 2022.']
    ]) {
      const onPath = !executable && run('where.exe', [name.endsWith('cl.exe') ? 'cl.exe' : 'link.exe'])
      const path = executable || (onPath?.ok && onPath.output.split(/\r?\n/).find(line => line.toLowerCase().includes(name.endsWith('cl.exe') ? 'cl.exe' : 'link.exe'))?.trim())
      native.push({
        name,
        ok: Boolean(path),
        detail: path || 'não encontrado em instalação MSVC completa nem no PATH',
        hint: path ? undefined : hint
      })
    }
    const sdk = findWindowsSdk({ env, sdkPaths, exists, listDirectories })
    native.push({
      name: 'Windows SDK',
      ok: Boolean(sdk),
      detail: sdk || 'não encontrado',
      hint: sdk ? undefined : 'Instale o Windows 10/11 SDK pelo Visual Studio Installer e reabra o terminal.'
    })
    const perlOnPath = run('where.exe', ['perl.exe'])
    const perlPath = perlOnPath.ok && perlOnPath.output.split(/\r?\n/).find(path => /\\Strawberry\\/i.test(path))
    const perl = perlPath || perlPaths.find(exists)
    native.push({
      name: 'Strawberry Perl',
      ok: Boolean(perl),
      detail: perl || 'Strawberry Perl não encontrado no PATH nem nos caminhos padrão',
      hint: perl ? undefined : 'Instale Strawberry Perl para Windows e deixe seu diretório no PATH.'
    })
    const webviewKeys = [webViewRegistryKey, webViewRegistryKey.replace(/^HKLM/, 'HKCU').replace('WOW6432Node\\', '')]
    const webview = webviewKeys.map(key => run('reg.exe', ['query', key, '/v', 'pv'])).find(result => result.ok && /pv\s+REG_SZ\s+(?!0\.0\.0\.0)[\d.]+/i.test(result.output))
    const webViewOk = Boolean(webview)
    native.push({
      name: 'WebView2 Runtime',
      ok: webViewOk,
      detail: webViewOk ? firstLine(webview.output) : 'não encontrado no registro do Windows',
      hint: webViewOk ? undefined : 'Instale o Microsoft Edge WebView2 Runtime (Evergreen) no Windows.'
    })
  }

  const nsis = windows
    ? findNsis({ run, exists, nsisPaths })
    : (() => {
        const check = commandCheck('NSIS/makensis', 'makensis', ['/VERSION'], 'Instale NSIS 3.x e adicione makensis.exe ao PATH.', run)
        return { ok: check.ok, detail: check.ok ? check.detail : check.hint, hint: check.hint }
      })()
  nsis.name = 'NSIS/makensis'
  if (!nsis.ok) nsis.hint = 'Instale NSIS 3.x ou adicione makensis.exe ao PATH.'
  const nativeOk = native.every(item => item.ok)
  const nsisOk = nsis.ok
  return {
    native,
    bundle: [nsis],
    signing: { status: 'não configurado/não validado', detail: 'A configuração Tauri atual não declara assinatura nem updater.' },
    ready: { nativeBuild: nativeOk, nsisBundle: nativeOk && nsisOk }
  }
}

function printGroup(title, checks) {
  console.log(`${title}:`)
  for (const item of checks) {
    console.log(`  ${item.ok ? '✓' : '✗'} ${item.name}: ${item.detail}`)
    if (item.hint) console.log(`    Ação: ${item.hint}`)
  }
}

export function printWindowsPreflight(result) {
  printGroup('Pré-requisitos para build nativo', result.native)
  printGroup('Pré-requisitos para bundle NSIS', result.bundle)
  console.log(`Signing: ${result.signing.status} — ${result.signing.detail}`)
  console.log(`\nBuild nativo: ${result.ready.nativeBuild ? 'PRONTO' : 'BLOQUEADO — veja ações acima.'}`)
  console.log(`Bundle NSIS: ${result.ready.nsisBundle ? 'PRONTO' : 'BLOQUEADO — requer build nativo e NSIS.'}`)
  return result.ready.nativeBuild && result.ready.nsisBundle ? 0 : 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = printWindowsPreflight(createWindowsPreflight())
}
