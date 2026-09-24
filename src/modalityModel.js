export const MODALITIES=['Presencial','Online']
export const createAppointment=(input)=>{if(!MODALITIES.includes(input.modality))throw new Error('Modalidade inválida.');if(input.meetingLink&&input.modality!=='Online')throw new Error('Link externo só é permitido para atendimento online.');return {...input,meetingLink:input.meetingLink||null}}
export const sessionSnapshot=(session,appointment)=>({...session,attendanceSnapshot:{modality:appointment.modality,meetingLink:appointment.meetingLink}})
export const compatibleWithTemplate=(template,modality)=>template.modalities.includes(modality)

export const changeSessionModality = (draft, modality, discardLink = false) => {
  if(!MODALITIES.includes(modality))throw new Error('Modalidade inválida.')
  if(modality==='Presencial'&&String(draft.meetingLink||'').trim()&&!discardLink)return {needsConfirmation:true,draft}
  return {needsConfirmation:false,draft:{...draft,modality,meetingLink:modality==='Presencial'?'':draft.meetingLink||''}}
}

export const normalizeSessionAttendance = draft => {
  const modality=draft.modality||'Presencial',meetingLink=String(draft.meetingLink||'').trim()
  if(!MODALITIES.includes(modality))throw new Error('Modalidade inválida.')
  if(meetingLink&&modality!=='Online')throw new Error('Link externo só é permitido para atendimento online.')
  if(meetingLink){
    let url
    try{url=new URL(meetingLink)}catch{throw new Error('Informe um link externo HTTP ou HTTPS válido.')}
    if(!['http:','https:'].includes(url.protocol)||!url.hostname)throw new Error('Informe um link externo HTTP ou HTTPS válido.')
  }
  return {modality,meetingLink:meetingLink||null}
}

export const sessionAttendanceForHistory = session => {
  const modality=session.attendanceSnapshot?.modality||session.modality||'Presencial'
  return {modality,meetingLink:modality==='Online'?(session.attendanceSnapshot?.meetingLink??session.meetingLink??null):null}
}
