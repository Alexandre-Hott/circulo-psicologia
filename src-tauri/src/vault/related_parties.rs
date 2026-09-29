use super::{db, types::{RelatedParty, RelatedPartyInput, RelatedPartyRoles}};
use rusqlite::{params, Connection};

fn valid(input: &RelatedPartyInput) -> Result<(), String> {
    if input.name.trim().is_empty() || input.name.chars().count() > 160
        || !matches!(input.relation.as_str(), "Mãe" | "Pai" | "Responsável legal" | "Escola" | "Instituição" | "Outro")
        || !(input.roles.requester || input.roles.legal_guardian || input.roles.administrative_contact) {
        return Err("Dados da pessoa relacionada inválidos.".into());
    }
    Ok(())
}

pub fn list(c: &Connection, patient_id: &str, archived: bool) -> Result<Vec<RelatedParty>, String> {
    db::patient_get(c, patient_id)?;
    let mut q = c.prepare("SELECT id,patient_id,revision,name,relation,requester,legal_guardian,administrative_contact,archived_at FROM related_parties WHERE patient_id=?1 AND (?2=1 OR archived_at IS NULL) ORDER BY name,id")
        .map_err(|_| "Não foi possível consultar pessoas relacionadas.".to_string())?;
    let rows = q.query_map(params![patient_id, archived], |r| Ok(RelatedParty {
        id: r.get(0)?, patient_id: r.get(1)?, revision: r.get(2)?, name: r.get(3)?, relation: r.get(4)?,
        roles: RelatedPartyRoles { requester: r.get(5)?, legal_guardian: r.get(6)?, administrative_contact: r.get(7)? },
        archived_at: r.get(8)?,
    })).map_err(|_| "Não foi possível consultar pessoas relacionadas.".to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|_| "Não foi possível consultar pessoas relacionadas.".into())
}

fn get(c: &Connection, patient_id: &str, id: &str) -> Result<RelatedParty, String> {
    list(c, patient_id, true)?.into_iter().find(|p| p.id == id)
        .ok_or("Pessoa relacionada não encontrada neste paciente.".into())
}

pub fn create(c: &Connection, patient_id: &str, input: RelatedPartyInput) -> Result<RelatedParty, String> {
    valid(&input)?;
    db::patient_get(c, patient_id)?;
    let id = db::random_id();
    c.execute("INSERT INTO related_parties(id,patient_id,revision,name,relation,requester,legal_guardian,administrative_contact) VALUES(?1,?2,1,?3,?4,?5,?6,?7)",
        params![id, patient_id, input.name.trim(), input.relation, input.roles.requester, input.roles.legal_guardian, input.roles.administrative_contact])
        .map_err(|_| "Não foi possível cadastrar pessoa relacionada.".to_string())?;
    get(c, patient_id, &id)
}

pub fn update(c: &Connection, patient_id: &str, id: &str, revision: i64, input: RelatedPartyInput) -> Result<RelatedParty, String> {
    valid(&input)?;
    let n = c.execute("UPDATE related_parties SET revision=revision+1,name=?1,relation=?2,requester=?3,legal_guardian=?4,administrative_contact=?5 WHERE patient_id=?6 AND id=?7 AND revision=?8 AND archived_at IS NULL",
        params![input.name.trim(),input.relation,input.roles.requester,input.roles.legal_guardian,input.roles.administrative_contact,patient_id,id,revision])
        .map_err(|_| "Não foi possível atualizar pessoa relacionada.".to_string())?;
    if n != 1 { return Err("Pessoa relacionada ausente, arquivada ou alterada; atualize a lista.".into()); }
    get(c, patient_id, id)
}

pub fn set_archived(c: &Connection, patient_id: &str, id: &str, revision: i64, archived: bool) -> Result<RelatedParty, String> {
    let stamp = archived.then(|| chrono::Utc::now().to_rfc3339());
    let n = c.execute("UPDATE related_parties SET revision=revision+1,archived_at=?1 WHERE patient_id=?2 AND id=?3 AND revision=?4 AND (archived_at IS NULL)=?5",
        params![stamp,patient_id,id,revision,archived])
        .map_err(|_| "Não foi possível atualizar pessoa relacionada.".to_string())?;
    if n != 1 { return Err("Pessoa relacionada ausente ou alterada; atualize a lista.".into()); }
    get(c, patient_id, id)
}
