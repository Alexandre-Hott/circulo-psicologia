export const LIFE_CYCLES=['Criança','Adolescente','Adulto','Idoso','Não informado']
export const createPatient=input=>{
 const name=String(input.name??'').trim()
 if(!name)throw Object.assign(new Error('Informe o nome do paciente.'),{field:'name'})
 if(!LIFE_CYCLES.includes(input.lifeCycle))throw Object.assign(new Error('Ciclo de vida inválido.'),{field:'lifeCycle'})
 const rawAge=String(input.age??'').trim()
 if(rawAge&&!/^\d+$/.test(rawAge))throw Object.assign(new Error('Informe a idade em anos como número inteiro não negativo.'),{field:'age'})
 const age=rawAge?Number(rawAge):null
 if(age!==null&&!Number.isSafeInteger(age))throw Object.assign(new Error('Informe a idade em anos como número inteiro não negativo.'),{field:'age'})
 const preferredModality=input.preferredModality||''
 if(!['','Presencial','Online'].includes(preferredModality))throw Object.assign(new Error('Modalidade preferida inválida.'),{field:'preferredModality'})
 return {...input,name,age,lifeCycle:input.lifeCycle,preferredModality}
}
export const updatePatient=(patient,patch)=>{
 const validated=createPatient({...patient,...patch})
 return {...patient,name:validated.name,age:validated.age,lifeCycle:validated.lifeCycle,preferredModality:validated.preferredModality,initials:validated.name.split(' ').map(part=>part[0]).slice(0,2).join('').toUpperCase()}
}
export const newPatientId=()=>crypto.randomUUID()
export const patientDefaultModality=patient=>['Presencial','Online'].includes(patient?.preferredModality)?patient.preferredModality:'Presencial'
export const formatPatientAge=age=>age===null||age===undefined||age===''?'Idade não informada':`${age} ${age===1?'ano':'anos'}`
export const isChildPatient=patient=>patient.lifeCycle==='Criança'
export const compatibleTemplates=(templates,patient,modality)=>templates.filter(t=>t.lifeCycles.includes(patient.lifeCycle)&&t.modalities.includes(modality))
