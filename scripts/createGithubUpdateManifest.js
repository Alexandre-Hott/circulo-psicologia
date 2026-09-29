import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OWNER = 'Alexandre-Hott'
const REPO = 'circulo-psicologia'

export function parseArgs(args) {
  const options = {}
  const names = new Set(['--version', '--installer', '--signature', '--notes', '--output'])
  for (let i = 0; i < args.length; i += 2) {
    if (!names.has(args[i]) || !args[i + 1] || args[i] in options) throw new Error('Informe --version, --installer, --signature, --notes e --output uma vez cada.')
    options[args[i]] = args[i + 1]
  }
  if (names.size !== Object.keys(options).length) throw new Error('Faltam argumentos obrigatórios.')
  return {
    version: options['--version'], installerPath: options['--installer'],
    signaturePath: options['--signature'], notes: options['--notes'], outputPath: options['--output'],
  }
}

export async function createGithubUpdateManifest({ version, installerPath, signaturePath, notes, outputPath }) {
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error('Versão deve ser semver X.Y.Z exata.')
  if (typeof notes !== 'string' || !notes.trim()) throw new Error('Notas não podem estar vazias.')
  const basename = `Círculo_${version}_x64-setup.exe`
  if (path.basename(installerPath || '') !== basename) throw new Error(`Instalador deve se chamar ${basename}.`)
  if (path.basename(signaturePath || '') !== `${basename}.sig`) throw new Error(`Assinatura deve se chamar ${basename}.sig.`)
  if (!outputPath || path.basename(outputPath) !== 'latest.json') throw new Error('Saída deve se chamar latest.json.')
  if (path.resolve(outputPath) === path.resolve(installerPath) || path.resolve(outputPath) === path.resolve(signaturePath)) throw new Error('Saída não pode substituir os artefatos.')
  const [installerInfo, signatureInfo, signature] = await Promise.all([
    stat(installerPath), stat(signaturePath), readFile(signaturePath, 'utf8'),
  ])
  if (!installerInfo.isFile() || installerInfo.size === 0) throw new Error('Instalador ausente, vazio ou não regular.')
  if (!signatureInfo.isFile() || signatureInfo.size === 0) throw new Error('Assinatura ausente, vazia ou não regular.')
  const signatureText = signature.trim()
  if (!signatureText || /\s/.test(signatureText) || !/^[A-Za-z0-9+/]+={0,2}$/.test(signatureText)) throw new Error('Assinatura deve conter texto base64 em uma linha.')
  const url = `https://github.com/${OWNER}/${REPO}/releases/download/v${version}/${encodeURIComponent(basename)}`
  const manifest = {
    version,
    notes: notes.trim(),
    platforms: { 'windows-x86_64': { url, signature: signatureText } },
  }
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  return manifest
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const manifest = await createGithubUpdateManifest(parseArgs(process.argv.slice(2)))
    console.log(`Criado latest.json para ${manifest.version}: ${manifest.platforms['windows-x86_64'].url}`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
