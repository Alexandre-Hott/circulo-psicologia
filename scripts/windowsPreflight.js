import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
const extra=['C:\\Users\\alexandre\\.cargo\\bin','C:\\Program Files (x86)\\NSIS'].filter(existsSync).join(';')
const check=(name,cmd,args=[])=>{const r=spawnSync(cmd,args,{shell:true,encoding:'utf8',env:{...process.env,Path:`${extra};${process.env.Path}`}});return {name,ok:r.status===0,detail:(r.stdout||r.stderr||'não encontrado').trim().split('\n')[0]}}
const checks=[check('Node','node',['--version']),check('npm','npm',['--version']),check('Rust','rustc',['--version']),check('Cargo','cargo',['--version']),check('Tauri CLI','npx',['tauri','--version']),check('NSIS/makensis','makensis',['/VERSION'])]
for(const c of checks)console.log(`${c.ok?'✓':'✗'} ${c.name}: ${c.detail}`)
const scaffold=checks.filter(c=>['Node','npm','Rust','Cargo','Tauri CLI'].includes(c.name)).every(c=>c.ok)
const release=scaffold&&checks.find(c=>c.name==='NSIS/makensis').ok&&process.env.WINDOWS_SIGNING_CONFIG
console.log(`\nScaffold Tauri: ${scaffold?'PRONTO':'BLOQUEADO — instale os itens marcados.'}`)
console.log(`Release assinada: ${release?'PRONTO':'BLOQUEADO — requer scaffold, NSIS e WINDOWS_SIGNING_CONFIG em cofre seguro.'}`)
