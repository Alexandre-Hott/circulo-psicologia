import { lstat, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

// Static regression guard, not a runtime permission boundary: custom invoke_handler commands
// remain callable by app windows unless product code explicitly enforces access control.
// Scope: local files under src/, src-tauri/src/, and the named manifests/configuration files.
// Imports resolved outside those roots and CLI --config overlays are not analyzed; review them separately.
export const REVIEWED_HANDLERS = Object.freeze([
  'vault_status', 'vault_create', 'vault_unlock', 'vault_lock',
  'professional_get', 'professional_save',
  'case_context_create', 'case_context_list',
  'record_copy_export',
  'patient_list', 'patient_get', 'patient_create', 'patient_update', 'patient_archive', 'patient_restore',
  'related_party_list', 'related_party_create', 'related_party_update', 'related_party_archive', 'related_party_restore',
  'agenda_list_series', 'agenda_occurrences', 'agenda_history', 'agenda_create_series', 'agenda_end_series', 'agenda_cancel', 'agenda_reschedule',
  'behavior_list', 'behavior_create', 'behavior_update',
  'session_draft_start', 'session_draft_list', 'session_draft_save', 'session_draft_cancel',
  'session_finalize', 'session_timeline', 'session_addendum_create', 'session_addendum_list', 'analytics_overview', 'backup_create',
  'auto_backup_status', 'auto_backup_retry', 'auto_backup_validate', 'auto_backup_restore',
  'backup_select', 'backup_restore', 'indicator_catalog', 'recovery_inventory',
])

// The updater UI uses check() and downloadAndInstall() only.
export const REVIEWED_PLUGIN_DEPENDENCIES = Object.freeze(['tauri-plugin-updater', '@tauri-apps/plugin-updater=^2.11.0'])
export const REVIEWED_PLUGIN_INITIALIZERS = Object.freeze(['src-tauri/src/main.rs'])
export const REVIEWED_CAPABILITIES = Object.freeze(['src-tauri/capabilities/default.json'])
export const REVIEWED_PERMISSIONS = Object.freeze([])
const REVIEWED_UPDATER_PERMISSIONS = Object.freeze(['core:default', 'updater:allow-check', 'updater:allow-download-and-install'])

function fail(message) {
  throw new Error(`${message} Atualize a allowlist apenas após revisão deliberada da superfície Tauri.`)
}

function isIdentifierStart(char) { return /[A-Za-z_$]/.test(char) }
function isIdentifierPart(char) { return /[A-Za-z0-9_$]/.test(char) }

/** Tokenizes the supported JS/JSX and Rust subset, including template interpolations. */
export function tokensOf(source, label, language = 'js') {
  const tokens = []
  let index = 0
  function quoted(quote) {
    index++
    let value = ''
    let escaped = false
    while (index < source.length) {
      const char = source[index++]
      if (char === '\\') {
        escaped = true
        if (index >= source.length) fail(`${label}: string incompleta.`)
        value += source[index++]
      } else if (char === quote) {
        tokens.push({ kind: 'string', value, escaped })
        return
      } else {
        value += char
      }
    }
    fail(`${label}: string incompleta.`)
  }
  function template() {
    index++
    while (index < source.length) {
      if (source[index] === '\\') { index += 2; continue }
      if (source[index] === '`') { index++; return }
      if (source[index] === '$' && source[index + 1] === '{') {
        index += 2
        code(true)
        continue
      }
      index++
    }
    fail(`${label}: template literal incompleto.`)
  }
  function code(stopAtBrace = false) {
    let braceDepth = 0
    while (index < source.length) {
      const char = source[index]
      if (/\s/.test(char)) { index++; continue }
      if (char === '/' && source[index + 1] === '/') {
        index = source.indexOf('\n', index + 2)
        if (index < 0) index = source.length
        continue
      }
      if (char === '/' && source[index + 1] === '*') {
        const end = source.indexOf('*/', index + 2)
        if (end < 0) fail(`${label}: comentário incompleto.`)
        index = end + 2
        continue
      }
      if (char === '"' || (char === "'" && language === 'js')) { quoted(char); continue }
      if (char === '`' && language === 'js') { template(); continue }
      if (char === '}' && stopAtBrace && braceDepth === 0) { index++; return }
      if (char === '{') braceDepth++
      if (char === '}') braceDepth--
      if (isIdentifierStart(char)) {
        const start = index++
        while (index < source.length && isIdentifierPart(source[index])) index++
        tokens.push({ kind: 'identifier', value: source.slice(start, index) })
        continue
      }
      const pair = source.slice(index, index + 2)
      if (pair === '::' || pair === '?.') {
        tokens.push({ kind: 'punctuation', value: pair })
        index += 2
      } else {
        tokens.push({ kind: 'punctuation', value: char })
        index++
      }
    }
    if (stopAtBrace) fail(`${label}: interpolação de template incompleta.`)
  }
  code()
  return tokens
}

function literalCommand(token, label) {
  if (token?.kind !== 'string' || token.escaped || !/^[a-z][a-z0-9_]*$/.test(token.value)) {
    fail(`${label}: invoke usa comando não literal ou padrão não suportado.`)
  }
  return token.value
}

function commandArgument(tokens, label) {
  if (tokens.length === 1) return [literalCommand(tokens[0], label)]
  const question = tokens.findIndex(token => token.value === '?')
  const colon = tokens.findIndex((token, index) => index > question && token.value === ':')
  if (question < 1 || colon !== question + 2 || tokens.length !== colon + 2) {
    fail(`${label}: invoke dinâmico ou ternário não suportado.`)
  }
  return [literalCommand(tokens[question + 1], label), literalCommand(tokens[colon + 1], label)]
}

function firstArgument(tokens, open, label) {
  let parens = 0; let brackets = 0; let braces = 0
  for (let index = open + 1; index < tokens.length; index++) {
    const value = tokens[index].value
    if ((value === ',' || value === ')') && parens === 0 && brackets === 0 && braces === 0) {
      const argument = tokens.slice(open + 1, index)
      if (!argument.length) fail(`${label}: invoke sem comando literal.`)
      return argument
    }
    if (value === '(') parens++
    if (value === ')') parens--
    if (value === '[') brackets++
    if (value === ']') brackets--
    if (value === '{') braces++
    if (value === '}') braces--
  }
  fail(`${label}: chamada invoke incompleta.`)
}

export function uiCommands(uiSources) {
  const commands = new Set()
  for (const [file, source] of Object.entries(uiSources)) {
    const tokens = tokensOf(source, file)
    const importPositions = new Set()
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index]
      if (token.kind === 'identifier' && token.value === '__TAURI__') {
        fail(`${file}: referência à API global __TAURI__ não revisada.`)
      }
      if (token.kind === 'string' && token.value === '__TAURI__' && tokens[index - 1]?.value === '[') {
        fail(`${file}: referência à API global __TAURI__ não revisada.`)
      }
      if (token.kind === 'string' && token.value.startsWith('@tauri-apps/plugin-') && token.value !== '@tauri-apps/plugin-updater') {
        fail(`${file}: importação de plugin Tauri ${token.value} não revisada.`)
      }
      if (token.kind === 'string' && token.value === '@tauri-apps/api/core') {
        const expected = ['import', '{', 'invoke', '}', 'from']
        const actual = tokens.slice(index - 5, index).map(part => part.value)
        if (actual.length !== expected.length || actual.some((part, at) => part !== expected[at])) {
          fail(`${file}: importação de invoke/core não suportada; aliases e APIs adicionais exigem revisão.`)
        }
        importPositions.add(index - 3)
      }
    }
    const imported = importPositions.size === 1
    if (importPositions.size > 1) fail(`${file}: importações duplicadas de invoke.`)
    for (let index = 0; index < tokens.length; index++) {
      if (tokens[index].value !== 'invoke' || importPositions.has(index)) continue
      if (!imported || tokens[index + 1]?.value !== '(' || ['.', '?.'].includes(tokens[index - 1]?.value)) {
        fail(`${file}: uso de invoke não suportado ou sem importação direta de @tauri-apps/api/core.`)
      }
      for (const command of commandArgument(firstArgument(tokens, index + 1, file), file)) commands.add(command)
    }
  }
  return [...commands].sort()
}

export function registeredHandlers(rustSource) {
  const tokens = tokensOf(rustSource, 'main.rs', 'rust')
  let handlerCalls = 0
  const macros = []
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index].value === '.' && tokens[index + 1]?.value === 'invoke_handler' && tokens[index + 2]?.value === '(') handlerCalls++
    if (tokens[index].value === 'generate_handler') {
      if (tokens[index - 5]?.value !== '.' || tokens[index - 4]?.value !== 'invoke_handler' || tokens[index - 3]?.value !== '(' || tokens[index - 2]?.value !== 'tauri' || tokens[index - 1]?.value !== '::' || tokens[index + 1]?.value !== '!' || tokens[index + 2]?.value !== '[') {
        fail('main.rs: generate_handler não está diretamente em invoke_handler ou usa forma não suportada.')
      }
      const names = []
      let cursor = index + 3
      while (cursor < tokens.length && tokens[cursor].value !== ']') {
        if (tokens[cursor].kind !== 'identifier') fail('main.rs: handler não literal ou padrão não suportado.')
        names.push(tokens[cursor++].value)
        if (tokens[cursor]?.value === ',') cursor++
        else if (tokens[cursor]?.value !== ']') fail('main.rs: separador de handlers não suportado.')
      }
      if (tokens[cursor]?.value !== ']') fail('main.rs: generate_handler incompleto.')
      macros.push(names)
    }
  }
  if (handlerCalls !== 1 || macros.length !== 1) fail('main.rs: esperado exatamente um invoke_handler com um tauri::generate_handler![...].')
  if (new Set(macros[0]).size !== macros[0].length) fail('main.rs: handlers duplicados.')
  return macros[0].sort()
}

function exactSet(label, actual, allowed) {
  const extra = actual.filter(item => !allowed.includes(item))
  const missing = allowed.filter(item => !actual.includes(item))
  if (extra.length || missing.length) fail(`${label}: inesperados [${extra.join(', ') || 'nenhum'}]; ausentes [${missing.join(', ') || 'nenhum'}].`)
}

function declaredConfigSurface(config, prefix = 'tauri.conf.json') {
  const found = []
  if (!config || typeof config !== 'object') return found
  for (const [key, value] of Object.entries(config)) {
    const current = `${prefix}.${key}`
    if (['plugins', 'capabilities', 'permissions'].includes(key)) found.push(current)
    found.push(...declaredConfigSurface(value, current))
  }
  return found
}

export function analyzeTauriSurface(snapshot, { allowedHandlers = REVIEWED_HANDLERS } = {}) {
  const manifest = JSON.parse(snapshot.packageJson)
  const config = JSON.parse(snapshot.tauriConfig)
  const cargoWithoutComments = snapshot.cargoToml.replace(/#.*$/gm, '')
  const cargoPlugins = [...cargoWithoutComments.matchAll(/tauri[-_]plugin[-_][A-Za-z0-9_-]+/g)].map(match => match[0])
  const dependencyCategories = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
  const jsPlugins = dependencyCategories.flatMap(category => Object.entries(manifest[category] || {}))
    .filter(([name, spec]) => name.startsWith('@tauri-apps/plugin-') || /^npm:@tauri-apps\/plugin-[^@/]+(?:@|$)/.test(spec))
    .map(([name, spec]) => `${name}=${spec}`)
  const updaterPresent = [...cargoPlugins, ...jsPlugins].some(item => item.includes('plugin-updater'))
  exactSet('dependências de plugins Tauri', [...new Set([...cargoPlugins, ...jsPlugins])], updaterPresent ? REVIEWED_PLUGIN_DEPENDENCIES : [])

  const initializers = []
  for (const [file, source] of Object.entries(snapshot.rustSources)) {
    const tokens = tokensOf(source, file, 'rust')
    for (let index = 0; index < tokens.length; index++) {
      if (tokens[index].value === '.' && tokens[index + 1]?.value === 'plugin' && tokens[index + 2]?.value === '(') initializers.push(file)
    }
  }
  exactSet('inicializações .plugin(...)', initializers, updaterPresent ? REVIEWED_PLUGIN_INITIALIZERS : [])
  exactSet('capabilities declaradas', snapshot.capabilityEntries, updaterPresent ? REVIEWED_CAPABILITIES : [])
  if (updaterPresent) {
    const capability = JSON.parse(snapshot.capabilitySources?.['src-tauri/capabilities/default.json'] || '{}')
    exactSet('permissões da capability updater', capability.permissions || [], REVIEWED_UPDATER_PERMISSIONS)
    exactSet('janelas da capability updater', capability.windows || [], ['main'])
    if (capability.identifier !== 'default' || capability.remote !== undefined || capability.local === false) fail('capability updater: escopo não revisado.')
  }
  exactSet('permissions declaradas', snapshot.permissionEntries, REVIEWED_PERMISSIONS)
  exactSet('plugins/capabilities/permissions no tauri.conf.json', declaredConfigSurface(config), updaterPresent ? ['tauri.conf.json.plugins'] : [])
  if (updaterPresent && (!config.plugins?.updater || Object.keys(config.plugins).some(key => key !== 'updater'))) fail('tauri.conf.json: plugin além do updater.')
  exactSet('configs Tauri adicionais', (snapshot.additionalConfigs || []).map(item => item.path), [])
  if (config.app?.withGlobalTauri !== undefined && config.app.withGlobalTauri !== false) {
    fail('tauri.conf.json: app.withGlobalTauri não revisado.')
  }

  const handlers = registeredHandlers(snapshot.rustSources['src-tauri/src/main.rs'])
  exactSet('handlers Tauri', handlers, allowedHandlers)
  const invoked = uiCommands(snapshot.uiSources)
  const unregistered = invoked.filter(command => !handlers.includes(command))
  if (unregistered.length) fail(`UI invoca comandos não registrados: ${unregistered.join(', ')}.`)
  return { handlers, invoked }
}

async function sourceFiles(root, relative, extension) {
  const dir = path.join(root, relative)
  if ((await lstat(dir)).isSymbolicLink()) fail(`${relative}: diretório simbólico não analisado.`)
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const nested = path.join(relative, entry.name)
    if (entry.isSymbolicLink()) fail(`${nested}: link simbólico não analisado.`)
    if (entry.isDirectory()) files.push(...await sourceFiles(root, nested, extension))
    else if (extension.test(entry.name)) files.push(nested.replaceAll('\\', '/'))
  }
  return files
}

async function directoryDeclaration(root, relative) {
  try {
    const dir = path.join(root, relative)
    if ((await lstat(dir)).isSymbolicLink()) fail(`${relative}: link simbólico não analisado.`)
    const entries = await readdir(dir, { withFileTypes: true })
    if (entries.some(entry => !entry.isFile())) fail(`${relative}: entrada não regular não analisada.`)
    return entries.map(entry => `${relative}/${entry.name}`)
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

export async function checkTauriSurface(projectRoot) {
  if ((await lstat(path.join(projectRoot, 'src-tauri'))).isSymbolicLink()) {
    fail('src-tauri: diretório simbólico não analisado.')
  }
  const uiFiles = await sourceFiles(projectRoot, 'src', /\.(?:js|jsx|ts|tsx|mjs|cjs)$/)
  const rustFiles = [...await sourceFiles(projectRoot, 'src-tauri/src', /\.rs$/), 'src-tauri/build.rs']
  const read = async relative => {
    const file = path.join(projectRoot, relative)
    if ((await lstat(file)).isSymbolicLink()) fail(`${relative}: link simbólico não analisado.`)
    return readFile(file, 'utf8')
  }
  const configFiles = await readdir(path.join(projectRoot, 'src-tauri'), { withFileTypes: true })
  const additionalConfigFiles = configFiles
    .filter(entry => /^tauri(?:\.[^.]+)?\.conf\.(?:json|json5|toml)$/.test(entry.name) && entry.name !== 'tauri.conf.json')
    .map(entry => `src-tauri/${entry.name}`)
  const additionalConfigs = await Promise.all(additionalConfigFiles.map(async file => ({ path: file, content: await read(file) })))
  const [cargoToml, tauriConfig, packageJson, capabilityEntries, permissionEntries] = await Promise.all([
    read('src-tauri/Cargo.toml'), read('src-tauri/tauri.conf.json'), read('package.json'),
    directoryDeclaration(projectRoot, 'src-tauri/capabilities'),
    directoryDeclaration(projectRoot, 'src-tauri/permissions'),
  ])
  const uiSources = Object.fromEntries(await Promise.all(uiFiles.map(async file => [file, await read(file)])))
  const rustSources = Object.fromEntries(await Promise.all(rustFiles.map(async file => [file, await read(file)])))
  const capabilitySources = Object.fromEntries(await Promise.all(capabilityEntries.map(async entry => [entry, await read(entry)])))
  return analyzeTauriSurface({ cargoToml, tauriConfig, packageJson, uiSources, rustSources, capabilityEntries, capabilitySources, permissionEntries, additionalConfigs })
}
