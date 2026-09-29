import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyzeTauriSurface, checkTauriSurface } from '../scripts/tauriSurfaceGuard.js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function fixture() {
  return {
    cargoToml: '[dependencies]\ntauri = "2"',
    tauriConfig: JSON.stringify({ app: { windows: [{ title: 'Synthetic' }] } }),
    packageJson: JSON.stringify({ dependencies: { '@tauri-apps/api': '2' } }),
    uiSources: {
      'src/Synthetic.jsx': "import { invoke } from '@tauri-apps/api/core'\n// invoke('not_a_call')\nconst decoy = \"invoke('also_not_a_call')\"\nexport const read = () => invoke('vault_status')",
    },
    rustSources: {
      'src-tauri/src/main.rs': 'fn main() { tauri::Builder::default().invoke_handler(tauri::generate_handler![vault_status]).run(tauri::generate_context!()); }',
      'src-tauri/build.rs': 'fn main() {}',
    },
    capabilityEntries: [],
    permissionEntries: [],
    additionalConfigs: [],
  }
}

function check(snapshot) {
  return analyzeTauriSurface(snapshot, { allowedHandlers: ['vault_status'] })
}

test('current checkout matches reviewed handlers and narrowly scoped updater', async () => {
  const result = await checkTauriSurface(projectRoot)
  assert.equal(result.handlers.length, 48)
  assert.ok(result.handlers.includes('analytics_overview'))
  assert.ok(result.invoked.includes('vault_status'))
  assert.ok(result.handlers.includes('record_copy_export'))
  assert.ok(result.handlers.includes('case_context_create'))
  assert.ok(result.handlers.includes('case_context_list'))
  assert.ok(result.handlers.includes('professional_get'))
  assert.ok(result.handlers.includes('professional_save'))
  assert.ok(result.handlers.includes('session_addendum_create'))
  assert.ok(result.handlers.includes('session_addendum_list'))
})

test('updater approval requires only check and combined download/install permissions', () => {
  const snapshot = fixture()
  snapshot.cargoToml += '\ntauri-plugin-updater = "2"'
  snapshot.packageJson = JSON.stringify({ dependencies: { '@tauri-apps/plugin-updater': '^2.11.0' } })
  snapshot.tauriConfig = JSON.stringify({ plugins: { updater: { pubkey: 'synthetic', endpoints: ['https://example.test/latest.json'] } } })
  snapshot.rustSources['src-tauri/src/main.rs'] += '\nfn updater() { builder.plugin(tauri_plugin_updater::Builder::new().build()); }'
  snapshot.capabilityEntries = ['src-tauri/capabilities/default.json']
  const capability = { identifier: 'default', windows: ['main'], permissions: ['core:default', 'updater:allow-check', 'updater:allow-download-and-install'] }
  snapshot.capabilitySources = { 'src-tauri/capabilities/default.json': JSON.stringify(capability) }
  snapshot.uiSources['src/updater.js'] = "import { check } from '@tauri-apps/plugin-updater'"
  assert.deepEqual(check(snapshot), { handlers: ['vault_status'], invoked: ['vault_status'] })
  capability.permissions = ['core:default', 'updater:default']
  snapshot.capabilitySources['src-tauri/capabilities/default.json'] = JSON.stringify(capability)
  assert.throws(() => check(snapshot), /permissões da capability updater/)
  capability.permissions = ['core:default', 'updater:allow-check', 'updater:allow-download-and-install', 'updater:allow-install']
  snapshot.capabilitySources['src-tauri/capabilities/default.json'] = JSON.stringify(capability)
  assert.throws(() => check(snapshot), /permissões da capability updater/)
})

test('synthetic baseline ignores decoy strings/comments and accepts literal invokes', () => {
  assert.deepEqual(check(fixture()), { handlers: ['vault_status'], invoked: ['vault_status'] })
})

test('filesystem scan refuses a symlinked source root', async t => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'tauri-surface-guard-'))
  try {
    await mkdir(path.join(temporaryRoot, 'src-tauri'))
    await mkdir(path.join(temporaryRoot, 'synthetic-src'))
    try {
      await symlink(path.join(temporaryRoot, 'synthetic-src'), path.join(temporaryRoot, 'src'), process.platform === 'win32' ? 'junction' : 'dir')
    } catch (error) {
      if (['EPERM', 'EACCES', 'ENOTSUP', 'EOPNOTSUPP'].includes(error.code)) {
        t.skip(`junction/symlink indisponível neste ambiente: ${error.code}`)
        return
      }
      throw error
    }
    await assert.rejects(checkTauriSurface(temporaryRoot), /src: diretório simbólico não analisado/)
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})

test('rejects Tauri plugin dependencies, initializers and plugin JS imports', () => {
  const dependency = fixture()
  dependency.cargoToml += '\ntauri-plugin-shell = "2"'
  assert.throws(() => check(dependency), /dependências de plugins Tauri.*tauri-plugin-shell/)

  const initializer = fixture()
  initializer.rustSources['src-tauri/src/main.rs'] += '\nfn extra() { builder.plugin(tauri_plugin_shell::init()); }'
  assert.throws(() => check(initializer), /inicializações \.plugin/)

  const jsImport = fixture()
  jsImport.uiSources['src/Synthetic.jsx'] += "\nimport { open } from '@tauri-apps/plugin-shell'"
  assert.throws(() => check(jsImport), /importação de plugin Tauri/)
})

test('rejects unexpected capability, permission and Tauri config declarations', () => {
  const capability = fixture()
  capability.capabilityEntries.push('src-tauri/capabilities/default.json')
  assert.throws(() => check(capability), /capabilities declaradas/)

  const permission = fixture()
  permission.permissionEntries.push('src-tauri/permissions/shell.toml')
  assert.throws(() => check(permission), /permissions declaradas/)

  const config = fixture()
  config.tauriConfig = JSON.stringify({ plugins: { shell: {} } })
  assert.throws(() => check(config), /tauri\.conf\.json/)

  const platformConfig = fixture()
  platformConfig.additionalConfigs.push({
    path: 'src-tauri/tauri.windows.conf.json',
    content: JSON.stringify({ plugins: { shell: {} }, app: { capabilities: ['default'] }, permissions: ['shell:allow-open'] }),
  })
  assert.throws(() => check(platformConfig), /configs Tauri adicionais.*tauri\.windows\.conf\.json/)

  const globalTauri = fixture()
  globalTauri.tauriConfig = JSON.stringify({ app: { withGlobalTauri: true } })
  assert.throws(() => check(globalTauri), /app\.withGlobalTauri/)
})

test('rejects global Tauri access in the frontend', () => {
  const dot = fixture()
  dot.uiSources['src/Synthetic.jsx'] += '\nwindow.__TAURI__.core.invoke("vault_status")'
  assert.throws(() => check(dot), /API global __TAURI__/)

  const bracket = fixture()
  bracket.uiSources['src/Synthetic.jsx'] += "\nwindow['__TAURI__'].core.invoke('vault_status')"
  assert.throws(() => check(bracket), /API global __TAURI__/)
})

test('rejects npm plugin aliases in every dependency category', () => {
  for (const category of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    const snapshot = fixture()
    const manifest = JSON.parse(snapshot.packageJson)
    manifest[category] = { ...manifest[category], innocuous: 'npm:@tauri-apps/plugin-shell@2' }
    snapshot.packageJson = JSON.stringify(manifest)
    assert.throws(() => check(snapshot), /dependências de plugins Tauri.*innocuous/)
  }
})

test('rejects UI invokes that are not registered', () => {
  const snapshot = fixture()
  snapshot.uiSources['src/Synthetic.jsx'] += "\ninvoke('unregistered_command')"
  assert.throws(() => check(snapshot), /UI invoca comandos não registrados: unregistered_command/)
})

test('rejects a new handler until its allowlist is deliberately reviewed', () => {
  const snapshot = fixture()
  snapshot.rustSources['src-tauri/src/main.rs'] = snapshot.rustSources['src-tauri/src/main.rs']
    .replace('generate_handler![vault_status]', 'generate_handler![vault_status, surprise_handler]')
  assert.throws(() => check(snapshot), /handlers Tauri: inesperados \[surprise_handler\]/)
})

test('rejects dynamic invokes, aliases and unsupported handler syntax instead of silently counting them', () => {
  const dynamic = fixture()
  dynamic.uiSources['src/Synthetic.jsx'] += '\ninvoke(commandName)'
  assert.throws(() => check(dynamic), /invoke dinâmico|comando não literal/)

  const alias = fixture()
  alias.uiSources['src/Synthetic.jsx'] = "import { invoke as call } from '@tauri-apps/api/core'\ncall('vault_status')"
  assert.throws(() => check(alias), /importação de invoke\/core não suportada/)

  const handler = fixture()
  handler.rustSources['src-tauri/src/main.rs'] = handler.rustSources['src-tauri/src/main.rs']
    .replace('generate_handler![vault_status]', 'generate_handler![commands::vault_status]')
  assert.throws(() => check(handler), /handler não literal|separador de handlers não suportado/)
})
