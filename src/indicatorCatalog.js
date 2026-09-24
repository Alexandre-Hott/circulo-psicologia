export const INDICATORS = [
  {id:'reg',name:'Regulação emocional',definition:'Uso de recursos para lidar com emoções intensas.',version:1,labels:['Ainda não observado','Com muito apoio','Com algum apoio','Com autonomia']},
  {id:'com',name:'Comunicação de necessidades',definition:'Expressa o que precisa em situações cotidianas.',version:1,labels:['Ainda não observado','Raramente','Às vezes','Frequentemente']},
]

export const snapshotIndicators = catalog => catalog.map(indicator => ({ id:indicator.id, name:indicator.name, definition:indicator.definition, version:indicator.version, labels:[...indicator.labels] }))
