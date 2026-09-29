import test from 'node:test'
import assert from 'node:assert/strict'
import { createWindowsPreflight, printWindowsPreflight } from '../scripts/windowsPreflight.js'

const successful = (output = 'ok') => ({ ok: true, output })
const failed = { ok: false, output: '' }

function mockRun({ missing = [], outputs = {} } = {}) {
  return (command, args) => {
    const key = `${command} ${args.join(' ')}`
    if (key in outputs) return outputs[key]
    if (command === 'where.exe') {
      if (missing.includes(`where:${args[0]}`)) return failed
      const paths = {
        'cl.exe': 'C:\\VS\\VC\\Tools\\MSVC\\bin\\Hostx64\\x64\\cl.exe',
        'link.exe': 'C:\\VS\\VC\\Tools\\MSVC\\bin\\Hostx64\\x64\\link.exe',
        'perl.exe': 'D:\\Tools\\Strawberry\\perl\\bin\\perl.exe'
      }
      return successful(paths[args[0]] || 'ok')
    }
    return missing.includes(command) ? failed : successful(command === 'rustup' ? 'stable-x86_64-pc-windows-msvc\nx86_64-pc-windows-msvc' : 'v1.2.3')
  }
}

test('Windows preflight separates native build, NSIS and unconfigured signing', () => {
  const result = createWindowsPreflight({
    platform: 'win32',
    env: { WINDOWS_SIGNING_CONFIG: 'should-not-enable-signing' },
    run: mockRun({ outputs: {
      'reg.exe query HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5} /v pv': successful('pv REG_SZ 138.0.0.0')
    } }),
    exists: path => path.includes('Windows Kits') || path.includes('Strawberry') || path.includes('NSIS'),
    listDirectories: path => path.includes('Windows Kits') ? ['10.0.26100.0'] : [],
    vswherePaths: [],
    visualStudioRoots: []
  })

  assert.equal(result.ready.nativeBuild, true)
  assert.equal(result.ready.nsisBundle, true)
  assert.equal(result.signing.status, 'não configurado/não validado')
  assert.equal(result.native.find(item => item.name === 'Target Rust MSVC').ok, true)
  assert.ok(result.native.some(item => item.name === 'MSVC cl.exe'))
})

test('machine without VS, SDK, Perl, WebView2 and NSIS reports actionable blockers', () => {
  const result = createWindowsPreflight({
    platform: 'win32',
    env: {},
    run: mockRun({
      missing: ['where:cl.exe', 'where:link.exe', 'where:perl.exe', 'reg.exe', 'makensis'],
      outputs: { 'rustup target list --installed': successful('x86_64-pc-windows-gnu') }
    }),
    exists: () => false
  })

  assert.equal(result.ready.nativeBuild, false)
  assert.equal(result.ready.nsisBundle, false)
  for (const name of ['Target Rust MSVC', 'MSVC cl.exe', 'MSVC link.exe', 'Windows SDK', 'Strawberry Perl', 'WebView2 Runtime']) {
    const check = result.native.find(item => item.name === name)
    assert.ok(check, `${name} should be checked`)
    assert.equal(check.ok, false, `${name} should block native build`)
    assert.ok(check.hint, `${name} should give an action`)
  }
  assert.ok(result.bundle[0].hint)
  assert.equal(result.signing.status, 'não configurado/não validado')
})

test('detects Strawberry Perl from PATH outside the standard folders', () => {
  const result = createWindowsPreflight({ platform: 'win32', run: mockRun(), exists: () => false })
  const perl = result.native.find(item => item.name === 'Strawberry Perl')
  assert.equal(perl.ok, true)
  assert.match(perl.detail, /D:\\Tools\\Strawberry/)
})

test('detects a complete VS Build Tools and NSIS installation outside PATH', () => {
  const vsRoot = 'C:\\VS2022\\BuildTools'
  const versionRoot = `${vsRoot}\\VC\\Tools\\MSVC\\14.44.35207`
  const compiler = `${versionRoot}\\bin\\Hostx64\\x64\\cl.exe`
  const linker = `${versionRoot}\\bin\\Hostx64\\x64\\link.exe`
  const vcvars = `${vsRoot}\\VC\\Auxiliary\\Build\\vcvars64.bat`
  const nsis = 'D:\\Apps\\NSIS\\makensis.exe'
  const known = new Set([
    'C:\\tools\\vswhere.exe', `${vsRoot}\\VC\\Tools\\MSVC`, compiler, linker, vcvars,
    'C:\\Kits\\10\\Include', 'C:\\Kits\\10\\Include\\10.0.26100.0\\um',
    'C:\\Kits\\10\\Include\\10.0.26100.0\\shared', 'C:\\Kits\\10\\Lib\\10.0.26100.0\\um\\x64',
    'C:\\Strawberry\\perl\\bin\\perl.exe', nsis
  ])
  const run = (command, args) => {
    if (command === 'C:\\tools\\vswhere.exe') return successful(vsRoot)
    if (command === nsis && args[0] === '/VERSION') return successful('3.12')
    if (command === 'where.exe' && ['cl.exe', 'link.exe', 'makensis.exe'].includes(args[0])) return failed
    if (command === 'where.exe' && args[0] === 'perl.exe') return successful('C:\\Strawberry\\perl\\bin\\perl.exe')
    if (command === 'reg.exe') return successful('pv REG_SZ 138.0.0.0')
    return successful(command === 'rustup' ? 'x86_64-pc-windows-msvc' : 'ok')
  }
  const result = createWindowsPreflight({
    platform: 'win32',
    run,
    exists: path => known.has(path),
    listDirectories: path => path === `${vsRoot}\\VC\\Tools\\MSVC` ? ['14.44.35207'] : path === 'C:\\Kits\\10\\Include' ? ['10.0.26100.0'] : [],
    vswherePaths: ['C:\\tools\\vswhere.exe'],
    visualStudioRoots: [],
    sdkPaths: ['C:\\Kits\\10\\Include'],
    nsisPaths: [nsis],
    perlPaths: []
  })

  assert.equal(result.ready.nativeBuild, true)
  assert.equal(result.ready.nsisBundle, true)
  assert.equal(result.native.find(item => item.name === 'MSVC cl.exe').detail, compiler)
  assert.equal(result.native.find(item => item.name === 'MSVC link.exe').detail, linker)
  assert.match(result.native.find(item => item.name === 'Windows SDK').detail, /10\.0\.26100\.0/)
  assert.match(result.bundle[0].detail, /D:\\Apps\\NSIS\\makensis\.exe \(3\.12\)/)
})

test('non-Windows environment skips Windows-only dependencies but still checks Rust target', () => {
  const result = createWindowsPreflight({
    platform: 'linux',
    run: mockRun({ outputs: {
      'rustup target list --installed': successful('x86_64-unknown-linux-gnu')
    } }),
    exists: () => false
  })

  assert.equal(result.native.some(item => item.name === 'MSVC cl.exe'), false)
  assert.equal(result.native.some(item => item.name === 'Windows SDK'), false)
  assert.equal(result.native.find(item => item.name === 'Target Rust MSVC').ok, false)
  assert.equal(result.ready.nativeBuild, false)
})

test('preflight exit status follows build and bundle prerequisites', () => {
  const lines = []
  const original = console.log
  console.log = line => lines.push(line)
  try {
    assert.equal(printWindowsPreflight({
      native: [], bundle: [],
      signing: { status: 'não configurado/não validado', detail: 'não ligado' },
      ready: { nativeBuild: false, nsisBundle: false }
    }), 1)
  } finally {
    console.log = original
  }
  assert.ok(lines.some(line => line.includes('Signing: não configurado/não validado')))
  assert.ok(lines.some(line => line.includes('Build nativo: BLOQUEADO')))
})
