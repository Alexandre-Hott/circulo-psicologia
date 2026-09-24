import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ignored=new Set(['node_modules','dist','.git','src-tauri'])
const forbidden=/(^\.env($|\.)|\.circulo-backup$|\.(db|sqlite|sqlite3|sqlcipher|pfx|p12|pem|key|bak)$|^(id_rsa|credentials|secrets?)($|\.))/i
export const findForbidden=(root,dir=root)=>readdirSync(dir).flatMap(name=>{const file=join(dir,name);if(statSync(file).isDirectory())return ignored.has(name)?[]:findForbidden(root,file);return forbidden.test(name)?[relative(root,file)]:[]})
if(process.argv[1].endsWith('repositoryGuard.js')){const found=findForbidden(process.cwd());if(found.length){console.error(`Arquivos proibidos: ${found.join(', ')}`);process.exit(1)}console.log('Repository guard passed.')}
