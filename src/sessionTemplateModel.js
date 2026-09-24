export const templateTypes=['Avaliação inicial','Acompanhamento','Devolutiva/orientação','Personalizado']
export const templateAnswersLostOnChange = (session, nextTemplate) => (session.templateSnapshot?.fields || [])
  .filter(field => !nextTemplate?.fields.some(next => next.id === field.id) && String(session.templateFields?.[field.id] || '').trim())
  .map(field => field.label)

export const applyTemplate=({template,session})=>template ? ({
  ...session,
  templateSnapshot:{id:template.id,name:template.name,type:template.type,version:template.version,fields:template.fields.map(field=>({...field})),indicatorIds:[...template.indicatorIds],behaviorIds:[...template.behaviorIds],lifeCycles:[...template.lifeCycles],modalities:[...template.modalities]},
  templateFields:Object.fromEntries(template.fields.map(field=>[field.id,session.templateFields?.[field.id]||''])),
  indicatorValues:{...session.indicatorValues,...Object.fromEntries(template.indicatorIds.map(id=>[id,session.indicatorValues?.[id]??null]))},
  selectedBehaviorIds:[...template.behaviorIds],
}) : ({...session,templateSnapshot:null,templateFields:{},selectedBehaviorIds:[]})
export const editTemplate=(template,patch)=>({...template,...patch,version:template.version+1})
