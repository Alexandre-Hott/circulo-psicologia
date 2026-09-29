use super::{agenda, db, types::*};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

pub fn professional_get(c: &Connection) -> Result<Option<ProfessionalIdentity>, String> {
    c.query_row("SELECT display_name,registration FROM professional_identity WHERE id=1", [], |r| Ok(ProfessionalIdentity { display_name: r.get(0)?, registration: r.get(1)? }))
        .optional().map_err(|_| "Não foi possível consultar o profissional local.".into())
}

pub fn professional_save(c: &Connection, identity: ProfessionalIdentity) -> Result<ProfessionalIdentity, String> {
    let name = identity.display_name.trim();
    let registration = identity.registration.trim();
    if name.is_empty() || registration.is_empty() || name.chars().count() > 160 || registration.chars().count() > 100 {
        return Err("Informe nome e registro profissional válidos.".into());
    }
    c.execute("INSERT INTO professional_identity(id,display_name,registration) VALUES(1,?1,?2) ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,registration=excluded.registration", params![name,registration])
        .map_err(|_| "Não foi possível salvar o profissional local.".to_string())?;
    professional_get(c)?.ok_or("Profissional local indisponível.".into())
}

pub fn case_context_create(c: &Connection, patient_id: &str, demand: String, objectives: String) -> Result<CaseContextRevision, String> {
    let demand = demand.trim();
    let objectives = objectives.trim();
    if demand.is_empty() || objectives.is_empty() || demand.chars().count() > 4000 || objectives.chars().count() > 4000 {
        return Err("Demanda e objetivos devem conter de 1 a 4000 caracteres cada.".into());
    }
    db::patient_get(c, patient_id)?;
    let author = professional_get(c)?;
    let item = CaseContextRevision { id: db::random_id(), patient_id: patient_id.into(), recorded_at: chrono::Utc::now().to_rfc3339(), demand: demand.into(), objectives: objectives.into(), author };
    c.execute("INSERT INTO case_context_revisions(id,patient_id,recorded_at,demand,objectives,author_name,author_registration) VALUES(?1,?2,?3,?4,?5,?6,?7)",
        params![item.id,item.patient_id,item.recorded_at,item.demand,item.objectives,item.author.as_ref().map(|a| &a.display_name),item.author.as_ref().map(|a| &a.registration)])
        .map_err(|_| "Não foi possível salvar o contexto do caso.".to_string())?;
    Ok(item)
}

pub fn case_context_list(c: &Connection, patient_id: &str) -> Result<Vec<CaseContextRevision>, String> {
    db::patient_get(c, patient_id)?;
    let mut q = c.prepare("SELECT id,patient_id,recorded_at,demand,objectives,author_name,author_registration FROM case_context_revisions WHERE patient_id=?1 ORDER BY recorded_at DESC,rowid DESC")
        .map_err(|_| "Não foi possível consultar o contexto do caso.".to_string())?;
    let rows = q.query_map([patient_id], |r| {
        let name: Option<String> = r.get(5)?;
        let registration: Option<String> = r.get(6)?;
        Ok(CaseContextRevision { id:r.get(0)?,patient_id:r.get(1)?,recorded_at:r.get(2)?,demand:r.get(3)?,objectives:r.get(4)?,author: name.zip(registration).map(|(display_name,registration)| ProfessionalIdentity { display_name,registration }) })
    }).map_err(|_| "Não foi possível consultar o contexto do caso.".to_string())?;
    rows.collect::<Result<Vec<_>,_>>().map_err(|_| "Não foi possível consultar o contexto do caso.".to_string())
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionAddendum {
    pub id: String,
    pub session_id: String,
    pub patient_id: String,
    pub created_at: String,
    pub content: String,
}

pub fn addendum_create(c: &Connection, session_id: &str, patient_id: &str, content: String) -> Result<SessionAddendum, String> {
    let content = content.trim();
    if content.is_empty() || content.chars().count() > 4000 {
        return Err("Adendo deve conter de 1 a 4000 caracteres.".into());
    }
    let belongs: bool = c.query_row(
        "SELECT EXISTS(SELECT 1 FROM sessions WHERE id=?1 AND patient_id=?2)",
        params![session_id, patient_id], |r| r.get(0),
    ).map_err(|_| "Não foi possível verificar a sessão.".to_string())?;
    if !belongs { return Err("Sessão finalizada não encontrada para este paciente.".into()); }
    let item = SessionAddendum {
        id: db::random_id(), session_id: session_id.into(), patient_id: patient_id.into(),
        created_at: chrono::Utc::now().to_rfc3339(), content: content.into(),
    };
    c.execute("INSERT INTO session_addenda(id,session_id,patient_id,created_at,content) VALUES(?1,?2,?3,?4,?5)",
        params![item.id,item.session_id,item.patient_id,item.created_at,item.content])
        .map_err(|_| "Não foi possível salvar adendo.".to_string())?;
    Ok(item)
}

pub fn addendum_list(c: &Connection, patient_id: &str) -> Result<Vec<SessionAddendum>, String> {
    let mut q = c.prepare("SELECT a.id,a.session_id,a.patient_id,a.created_at,a.content FROM session_addenda a JOIN sessions s ON s.id=a.session_id WHERE a.patient_id=?1 AND s.patient_id=?1 ORDER BY a.created_at,a.id")
        .map_err(|_| "Não foi possível consultar adendos.".to_string())?;
    let rows = q.query_map([patient_id], |r| Ok(SessionAddendum { id:r.get(0)?,session_id:r.get(1)?,patient_id:r.get(2)?,created_at:r.get(3)?,content:r.get(4)? }))
        .map_err(|_| "Não foi possível consultar adendos.".to_string())?
        .collect::<Result<Vec<_>,_>>().map_err(|_| "Não foi possível consultar adendos.".to_string())?;
    Ok(rows)
}
pub fn behavior_list(c: &Connection) -> Result<Vec<BehaviorTemplate>, String> {
    let mut q=c.prepare("SELECT id,title,description,version FROM behavior_templates WHERE active=1 ORDER BY title").map_err(|_|"Não foi possível consultar a biblioteca.".to_string())?;
    let rows = q
        .query_map([], |r| {
            Ok(BehaviorTemplate {
                id: r.get(0)?,
                title: r.get(1)?,
                description: r.get(2)?,
                version: r.get(3)?,
            })
        })
        .map_err(|_| String::from("Não foi possível consultar a biblioteca."))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|_| String::from("Não foi possível consultar a biblioteca."))
}
pub fn behavior_create(
    c: &Connection,
    title: String,
    description: String,
) -> Result<BehaviorTemplate, String> {
    if title.trim().is_empty() || title.chars().count() > 160 || description.chars().count() > 1000
    {
        return Err("Dados do comportamento inválidos.".into());
    }
    let id = db::random_id();
    c.execute(
        "INSERT INTO behavior_templates(id,title,description,version) VALUES(?1,?2,?3,1)",
        params![id, title.trim(), description.trim()],
    )
    .map_err(|_| "Não foi possível salvar comportamento.".to_string())?;
    Ok(BehaviorTemplate {
        id,
        title: title.trim().into(),
        description: description.trim().into(),
        version: 1,
    })
}
pub fn behavior_update(
    c: &Connection,
    id: &str,
    version: i64,
    title: String,
    description: String,
) -> Result<BehaviorTemplate, String> {
    if title.trim().is_empty() || title.chars().count() > 160 || description.chars().count() > 1000
    {
        return Err("Dados do comportamento inválidos.".into());
    }
    let n=c.execute("UPDATE behavior_templates SET title=?1,description=?2,version=version+1 WHERE id=?3 AND version=?4 AND active=1",params![title.trim(),description.trim(),id,version]).map_err(|_|"Não foi possível atualizar comportamento.".to_string())?;
    if n != 1 {
        return Err("O comportamento mudou; atualize a lista.".into());
    }
    Ok(BehaviorTemplate {
        id: id.into(),
        title: title.trim().into(),
        description: description.trim().into(),
        version: version + 1,
    })
}
pub fn draft_start(c: &Connection, s: &str, d: &str) -> Result<SessionDraft, String> {
    let occ = agenda::occurrence_by_identity(c, s, d)?.ok_or("A ocorrência não está ativa.")?;
    let exists: Option<String> = c
        .query_row(
            "SELECT id FROM sessions WHERE series_id=?1 AND original_date=?2",
            params![s, d],
            |r| r.get(0),
        )
        .optional()
        .map_err(|_| "Não foi possível iniciar sessão.".to_string())?;
    if exists.is_some() {
        return Err("Esta ocorrência já foi realizada.".into());
    }
    let id = db::random_id();
    c.execute(
        "INSERT INTO session_drafts(id,patient_id,series_id,original_date,observation,behavior_ids,indicators) VALUES(?1,?2,?3,?4,'','[]','[]')",
        params![id, occ.patient_id, s, d],
    )
    .map_err(|_| "Não foi possível iniciar sessão.".to_string())?;
    draft_get(c, &id)
}
fn draft_get(c: &Connection, id: &str) -> Result<SessionDraft, String> {
    c.query_row("SELECT id,patient_id,series_id,original_date,observation,behavior_ids,indicators,procedures,outcome_decision,referral_closure FROM session_drafts WHERE id=?1",[id],|r|{let ids:String=r.get(5)?;let inds:String=r.get(6)?;Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?,r.get::<_,String>(4)?,ids,inds,r.get::<_,String>(7)?,r.get::<_,String>(8)?,r.get::<_,Option<String>>(9)?))}).map_err(|_|"Rascunho não encontrado.".to_string()).and_then(|(id,patient_id,series_id,original_date,observation,ids,inds,procedures,outcome_decision,referral_closure)|Ok(SessionDraft{id,patient_id,series_id,original_date,observation,procedures,outcome_decision,referral_closure,behavior_ids:serde_json::from_str(&ids).map_err(|_|"Rascunho inválido.".to_string())?,indicators:serde_json::from_str(&inds).map_err(|_|"Rascunho inválido.".to_string())?}))
}
pub fn draft_list(c: &Connection, p: &str) -> Result<Vec<SessionDraft>, String> {
    let mut q = c
        .prepare("SELECT id FROM session_drafts WHERE patient_id=?1 ORDER BY original_date DESC")
        .map_err(|_| "Falha ao consultar rascunhos.".to_string())?;
    let ids = q
        .query_map([p], |r| r.get::<_, String>(0))
        .map_err(|_| "Falha ao consultar rascunhos.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Falha ao consultar rascunhos.".to_string())?;
    ids.iter().map(|id| draft_get(c, id)).collect()
}
pub fn draft_save(c: &Connection, id: &str, i: SessionDraftInput) -> Result<SessionDraft, String> {
    let catalog = indicator_catalog();
    if i.observation.chars().count() > 4000
        || i.procedures.chars().count() > 4000
        || i.outcome_decision.chars().count() > 4000
        || i.referral_closure.as_ref().is_some_and(|v| v.chars().count() > 4000)
        || i.indicators.iter().any(|x| {
            x.note.as_ref().is_some_and(|n| n.chars().count() > 500)
                || !catalog.iter().any(|d| {
                    d.id == x.id
                        && x.value
                            .is_none_or(|v| v >= 0 && (v as usize) < d.labels.len())
                })
        })
    {
        return Err("Conteúdo do rascunho inválido.".into());
    }
    let current = draft_get(c, id)?;
    for bid in &i.behavior_ids {
        if !behavior_list(c)?.iter().any(|b| &b.id == bid) {
            return Err("Comportamento indisponível.".into());
        }
    }
    let ids = serde_json::to_string(&i.behavior_ids)
        .map_err(|_| "Falha ao salvar rascunho.".to_string())?;
    let inds = serde_json::to_string(&i.indicators)
        .map_err(|_| "Falha ao salvar rascunho.".to_string())?;
    c.execute(
        "UPDATE session_drafts SET observation=?1,behavior_ids=?2,indicators=?3,procedures=?4,outcome_decision=?5,referral_closure=?6 WHERE id=?7",
        params![i.observation, ids, inds, i.procedures, i.outcome_decision, i.referral_closure.filter(|v| !v.trim().is_empty()), id],
    )
    .map_err(|_| "Falha ao salvar rascunho.".to_string())?;
    draft_get(c, &current.id)
}
pub fn draft_cancel(c: &Connection, id: &str) -> Result<(), String> {
    let n = c
        .execute("DELETE FROM session_drafts WHERE id=?1", [id])
        .map_err(|_| "Falha ao cancelar rascunho.".to_string())?;
    if n == 1 {
        Ok(())
    } else {
        Err("Rascunho não encontrado.".into())
    }
}
pub fn finalize(c: &Connection, id: &str) -> Result<ClinicalSession, String> {
    let d = draft_get(c, id)?;
    let author = professional_get(c)?;
    let o = agenda::occurrence_by_identity(c, &d.series_id, &d.original_date)?
        .ok_or("A origem da Agenda não está mais ativa.")?;
    if d.patient_id.trim().is_empty() || o.date.trim().is_empty() || d.observation.trim().is_empty() {
        return Err("Descreva a sessão antes de finalizar.".into());
    }
    if d.procedures.trim().is_empty() || d.outcome_decision.trim().is_empty() {
        return Err("Informe procedimentos e decisão/desfecho antes de finalizar.".into());
    }
    if c.query_row(
        "SELECT count(*) FROM sessions WHERE series_id=?1 AND original_date=?2",
        params![d.series_id, d.original_date],
        |r| r.get::<_, i64>(0),
    )
    .map_err(|_| "Não foi possível finalizar.".to_string())?
        > 0
    {
        return Err("Esta ocorrência já foi finalizada.".into());
    }
    let behaviors: Vec<BehaviorSnapshot> = d
        .behavior_ids
        .iter()
        .map(|id| {
            let b = behavior_list(c)?
                .into_iter()
                .find(|b| &b.id == id)
                .ok_or("Comportamento indisponível.")?;
            Ok(BehaviorSnapshot {
                template_id: b.id,
                template_version: b.version,
                title: b.title,
                description: b.description,
            })
        })
        .collect::<Result<_, String>>()?;
    let catalog = indicator_catalog();
    let indicators: Vec<IndicatorSnapshot> = catalog
        .into_iter()
        .map(|def| {
            let item = d.indicators.iter().find(|x| x.id == def.id);
            Ok(IndicatorSnapshot {
                id: def.id,
                version: def.version,
                name: def.name,
                definition: def.definition,
                labels: def.labels,
                value: item.and_then(|x| x.value),
                note: item.and_then(|x| x.note.clone()),
            })
        })
        .collect::<Result<_, String>>()?;
    let id = db::random_id();
    let bs =
        serde_json::to_string(&behaviors).map_err(|_| "Não foi possível finalizar.".to_string())?;
    let ins = serde_json::to_string(&indicators)
        .map_err(|_| "Não foi possível finalizar.".to_string())?;
    let recorded_at = chrono::Utc::now().to_rfc3339();
    let session = ClinicalSession {
        id: id.clone(), patient_id: d.patient_id.clone(), session_date: o.date.clone(),
        start: o.start.clone(), end: o.end.clone(), modality: o.modality.clone(),
        was_rescheduled: o.was_rescheduled, observation: d.observation.clone(),
        procedures: Some(d.procedures.clone()), outcome_decision: Some(d.outcome_decision.clone()),
        referral_closure: d.referral_closure.clone(), behaviors, indicators,
        author: author.clone(), recorded_at: Some(recorded_at.clone()),
    };
    c.execute_batch("SAVEPOINT finalize_session")
        .map_err(|_| "Não foi possível finalizar sessão.".to_string())?;
    let write = (|| -> Result<(), String> {
        c.execute("INSERT INTO sessions(id,patient_id,session_date,start,end,modality,was_rescheduled,observation,behaviors,indicators,series_id,original_date,author_name,author_registration,recorded_at,procedures,outcome_decision,referral_closure) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)",params![id,d.patient_id,o.date,o.start,o.end,o.modality,o.was_rescheduled as i64,d.observation,bs,ins,d.series_id,d.original_date,author.as_ref().map(|a| &a.display_name),author.as_ref().map(|a| &a.registration),recorded_at,d.procedures,d.outcome_decision,d.referral_closure]).map_err(|_|"Não foi possível finalizar sessão.".to_string())?;
        let deleted = c.execute("DELETE FROM session_drafts WHERE id=?1", [&d.id])
            .map_err(|_| "Não foi possível finalizar sessão.".to_string())?;
        if deleted != 1 { return Err("Não foi possível finalizar sessão.".into()); }
        c.execute_batch("RELEASE SAVEPOINT finalize_session")
            .map_err(|_| "Não foi possível finalizar sessão.".to_string())?;
        Ok(())
    })();
    if write.is_err() {
        let _ = c.execute_batch("ROLLBACK TO SAVEPOINT finalize_session; RELEASE SAVEPOINT finalize_session");
    }
    write.map(|_| session)
}

#[cfg(test)]
mod rescheduled_occurrence_tests {
    use super::*;
    use rusqlite::Connection;

    fn synthetic_db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(
            "CREATE TABLE agenda_series(id TEXT PRIMARY KEY,patient_id TEXT,weekday INTEGER,start TEXT,end TEXT,frequency TEXT,start_date TEXT,end_date TEXT,modality TEXT,meeting_link TEXT);
             CREATE TABLE agenda_events(id TEXT PRIMARY KEY,series_id TEXT,action TEXT,original_date TEXT,effective_date TEXT,start TEXT,end TEXT,reason TEXT);
             CREATE TABLE session_drafts(id TEXT PRIMARY KEY,patient_id TEXT,series_id TEXT,original_date TEXT,observation TEXT,behavior_ids TEXT,indicators TEXT);
             CREATE TABLE sessions(id TEXT PRIMARY KEY,patient_id TEXT,session_date TEXT,start TEXT,end TEXT,modality TEXT,was_rescheduled INTEGER,observation TEXT,behaviors TEXT,indicators TEXT,series_id TEXT,original_date TEXT);
             CREATE TABLE behavior_templates(id TEXT PRIMARY KEY,title TEXT,description TEXT,version INTEGER,active INTEGER DEFAULT 1);
             CREATE UNIQUE INDEX one_session_per_occurrence ON sessions(series_id,original_date) WHERE series_id IS NOT NULL;
             INSERT INTO agenda_series VALUES('series-a','patient-a',4,'14:00','14:50','Semanal','2026-01-01',NULL,'Online','https://example.invalid/synthetic');
             INSERT INTO agenda_events VALUES('event-a','series-a','reschedule','2026-01-01','2026-01-03','16:00','16:50','synthetic');",
        )
        .unwrap();
        c.execute_batch("ALTER TABLE sessions ADD COLUMN author_name TEXT; ALTER TABLE sessions ADD COLUMN author_registration TEXT; ALTER TABLE sessions ADD COLUMN recorded_at TEXT; ALTER TABLE sessions ADD COLUMN procedures TEXT; ALTER TABLE sessions ADD COLUMN outcome_decision TEXT; ALTER TABLE sessions ADD COLUMN referral_closure TEXT; ALTER TABLE session_drafts ADD COLUMN procedures TEXT NOT NULL DEFAULT ''; ALTER TABLE session_drafts ADD COLUMN outcome_decision TEXT NOT NULL DEFAULT ''; ALTER TABLE session_drafts ADD COLUMN referral_closure TEXT; CREATE TABLE professional_identity(id INTEGER PRIMARY KEY,display_name TEXT,registration TEXT); INSERT INTO professional_identity VALUES(1,'Synthetic Author','TEST-001');").unwrap();
        c
    }

    #[test]
    fn new_session_requires_procedures_and_outcome_but_keeps_draft() {
        let c = synthetic_db();
        let draft = draft_start(&c, "series-a", "2026-01-01").unwrap();
        let input = SessionDraftInput { observation: "synthetic observation".into(), procedures: " ".into(), outcome_decision: " ".into(), referral_closure: None, behavior_ids: vec![], indicators: vec![] };
        draft_save(&c, &draft.id, input).unwrap();
        assert!(finalize(&c, &draft.id).err().unwrap().contains("procedimentos"));
        assert_eq!(draft_list(&c, "patient-a").unwrap().len(), 1);
        let input = SessionDraftInput { observation: "synthetic observation".into(), procedures: "synthetic procedure".into(), outcome_decision: " ".into(), referral_closure: None, behavior_ids: vec![], indicators: vec![] };
        draft_save(&c, &draft.id, input).unwrap();
        assert!(finalize(&c, &draft.id).err().unwrap().contains("desfecho"));
    }

    #[test]
    fn finalization_without_local_identity_persists_null_author_and_snapshot() {
        let c = synthetic_db();
        c.execute("DELETE FROM professional_identity", []).unwrap();
        let draft = draft_start(&c, "series-a", "2026-01-01").unwrap();
        let saved = draft_save(&c, &draft.id, SessionDraftInput {
            observation: "synthetic observation".into(), procedures: "synthetic procedure".into(),
            outcome_decision: "synthetic outcome".into(), referral_closure: None,
            behavior_ids: vec![], indicators: vec![],
        }).unwrap();
        let session = finalize(&c, &saved.id).unwrap();
        assert!(session.author.is_none());
        assert!(!session.indicators.is_empty());
        assert_eq!(session.procedures.as_deref(), Some("synthetic procedure"));
        assert_eq!(session.outcome_decision.as_deref(), Some("synthetic outcome"));
        let columns: (Option<String>, Option<String>) = c.query_row(
            "SELECT author_name,author_registration FROM sessions WHERE id=?1", [&session.id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        ).unwrap();
        assert_eq!(columns, (None, None));
        assert!(timeline(&c, "patient-a").unwrap()[0].author.is_none());
        assert!(draft_list(&c, "patient-a").unwrap().is_empty());
    }

    #[test]
    fn failed_draft_delete_rolls_back_finalization_and_retry_succeeds() {
        let c = synthetic_db();
        let draft = draft_start(&c, "series-a", "2026-01-01").unwrap();
        draft_save(&c, &draft.id, SessionDraftInput {
            observation: "synthetic observation".into(), procedures: "synthetic procedure".into(),
            outcome_decision: "synthetic outcome".into(), referral_closure: None,
            behavior_ids: vec![], indicators: vec![],
        }).unwrap();
        c.execute_batch("CREATE TRIGGER synthetic_block_draft_delete BEFORE DELETE ON session_drafts BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;").unwrap();
        assert!(finalize(&c, &draft.id).is_err());
        assert_eq!(c.query_row("SELECT count(*) FROM sessions", [], |r| r.get::<_, i64>(0)).unwrap(), 0);
        assert_eq!(draft_list(&c, "patient-a").unwrap().len(), 1);
        c.execute_batch("DROP TRIGGER synthetic_block_draft_delete").unwrap();
        let finalized = finalize(&c, &draft.id).unwrap();
        assert_eq!(finalized.procedures.as_deref(), Some("synthetic procedure"));
        assert!(draft_list(&c, "patient-a").unwrap().is_empty());
        assert_eq!(c.query_row("SELECT count(*) FROM sessions", [], |r| r.get::<_, i64>(0)).unwrap(), 1);
    }

    #[test]
    fn one_off_draft_finalization_keeps_agenda_origin() {
        let c = synthetic_db();
        let item = agenda::create_series(&c, AgendaSeriesInput {
            patient_id: "patient-a".into(), weekday: 1, start: "10:00".into(), end: "10:50".into(),
            frequency: "Avulsa".into(), start_date: "2026-02-02".into(), end_date: Some("2026-02-02".into()),
            modality: "Presencial".into(), meeting_link: None,
        }).unwrap();
        let draft = draft_start(&c, &item.id, "2026-02-02").unwrap();
        let saved = draft_save(&c, &draft.id, SessionDraftInput {
            observation: "synthetic one-off observation".into(), procedures: "synthetic procedure".into(), outcome_decision: "synthetic outcome".into(), referral_closure: None, behavior_ids: vec![], indicators: vec![],
        }).unwrap();
        let session = finalize(&c, &saved.id).unwrap();
        assert_eq!(session.session_date, "2026-02-02");
        assert_eq!(agenda::occurrence_by_identity(&c, &item.id, "2026-02-02").unwrap().unwrap().status, "completed");
        assert!(agenda::cancel(&c, &item.id, "2026-02-02", "synthetic".into()).is_err());
    }

    #[test]
    fn starts_and_finalizes_remarked_occurrence_using_effective_slot_and_stable_identity() {
        let c = synthetic_db();
        assert_eq!(agenda::occurrence_by_identity(&c, "series-a", "2026-01-01").unwrap().unwrap().status, "scheduled");
        let draft = draft_start(&c, "series-a", "2026-01-01").unwrap();
        assert_eq!(agenda::occurrence_by_identity(&c, "series-a", "2026-01-01").unwrap().unwrap().status, "scheduled");
        assert_eq!(draft.original_date, "2026-01-01");
        let saved = draft_save(
            &c,
            &draft.id,
            SessionDraftInput {
                observation: "synthetic observation".into(),
                procedures: "synthetic procedure".into(), outcome_decision: "synthetic outcome".into(), referral_closure: None,
                behavior_ids: vec![],
                indicators: vec![],
            },
        )
        .unwrap();
        let session = finalize(&c, &saved.id).unwrap();
        assert_eq!(session.session_date, "2026-01-03");
        assert_eq!(session.start, "16:00");
        assert_eq!(session.end, "16:50");
        assert!(session.was_rescheduled);
        let identity: (String, String) = c
            .query_row(
                "SELECT series_id,original_date FROM sessions WHERE id=?1",
                [&session.id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(identity, ("series-a".into(), "2026-01-01".into()));
        let completed = agenda::occurrence_by_identity(&c, "series-a", "2026-01-01").unwrap().unwrap();
        assert_eq!(completed.status, "completed");
        assert_eq!(completed.date, "2026-01-03");
        assert!(completed.was_rescheduled);
        assert_eq!(agenda::occurrences(&c, "2026-01-03", "2026-01-03").unwrap()[0].status, "completed");
        assert_eq!(agenda::occurrences(&c, "2026-01-08", "2026-01-08").unwrap()[0].status, "scheduled");
    }

    #[test]
    fn cancelled_remarked_occurrence_cannot_start_a_draft() {
        let c = synthetic_db();
        c.execute(
            "INSERT INTO agenda_events VALUES('event-b','series-a','cancel','2026-01-01',NULL,NULL,NULL,'synthetic cancel')",
            [],
        )
        .unwrap();
        assert!(draft_start(&c, "series-a", "2026-01-01").is_err());
    }

    fn assert_agenda_session_rows_survive(root: &std::path::Path, key: &[u8], patient: &str) {
        let c = rusqlite::Connection::open(root.join("circulo.db")).unwrap();
        db::configure(&c, key).unwrap();
        let counts: (i64, i64, i64, i64) = c
            .query_row(
                "SELECT (SELECT count(*) FROM agenda_series), (SELECT count(*) FROM agenda_events), (SELECT count(*) FROM session_drafts), (SELECT count(*) FROM sessions)",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(counts, (3, 2, 1, 1));
        let moved = agenda::occurrences(&c, "2026-01-03", "2026-01-03").unwrap();
        assert!(moved.iter().any(|o| {
            o.original_date == "2026-01-01" && o.date == "2026-01-03" && o.was_rescheduled
        }));
        assert!(!agenda::occurrences(&c, "2026-01-08", "2026-01-08")
            .unwrap()
            .iter()
            .any(|o| o.original_date == "2026-01-08"));
        assert_eq!(draft_list(&c, patient).unwrap().len(), 1);
        let session = timeline(&c, patient).unwrap().pop().unwrap();
        assert_eq!(session.session_date, "2026-01-04");
        let addenda = addendum_list(&c, patient).unwrap();
        assert_eq!(addenda.len(), 1);
        assert_eq!(addenda[0].session_id, session.id);
        assert_eq!(addenda[0].content, "synthetic correction");
        assert_eq!(session.observation, "synthetic finalized session");
        let contexts = case_context_list(&c, patient).unwrap();
        assert_eq!(contexts.len(), 2);
        assert_eq!(contexts[0].demand, "synthetic revised demand");
        assert_eq!(contexts[1].demand, "synthetic demand");
        let stable_identity: (String, String) = c
            .query_row(
                "SELECT series_id,original_date FROM sessions WHERE id=?1",
                [&session.id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(stable_identity.1, "2026-01-04");
    }

    #[test]
    fn agenda_drafts_events_and_session_snapshots_survive_backup_restore_across_migrate() {
        use std::path::PathBuf;

        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();
        let vault = crate::vault::Vault::new(root.clone());
        let local_password = "synthetic-local-password-2026";
        let backup_password = "synthetic-backup-password-2026";
        vault.create(local_password.into()).unwrap();
        let envelope = std::fs::read(root.join("vault.key")).unwrap();
        let key = crate::vault::crypto::open_envelope(local_password, &envelope).unwrap();

        let c = vault.open_conn().unwrap();
        let patient = db::patient_create(
            &c,
            PatientInput {
                name: "DEMO Backup Patient".into(),
                life_cycle: "Adulto".into(),
                age: None,
                birth_date: None,
                self_requester: None,
                preferred_modality: "Presencial".into(),
            },
        )
        .unwrap();
        let moved_series = agenda::create_series(
            &c,
            AgendaSeriesInput {
                patient_id: patient.id.clone(),
                weekday: 4,
                start: "14:00".into(),
                end: "14:50".into(),
                frequency: "Semanal".into(),
                start_date: "2026-01-01".into(),
                end_date: None,
                modality: "Presencial".into(),
                meeting_link: None,
            },
        )
        .unwrap();
        agenda::reschedule(
            &c,
            &moved_series.id,
            "2026-01-01",
            RescheduleInput {
                date: "2026-01-03".into(),
                start: "16:00".into(),
                end: "16:50".into(),
                reason: Some("synthetic move".into()),
            },
        )
        .unwrap();
        agenda::cancel(
            &c,
            &moved_series.id,
            "2026-01-08",
            "synthetic cancel".into(),
        )
        .unwrap();
        let draft_series = agenda::create_series(
            &c,
            AgendaSeriesInput {
                patient_id: patient.id.clone(),
                weekday: 0,
                start: "10:00".into(),
                end: "10:50".into(),
                frequency: "Semanal".into(),
                start_date: "2026-01-04".into(),
                end_date: None,
                modality: "Presencial".into(),
                meeting_link: None,
            },
        )
        .unwrap();
        let draft = draft_start(&c, &draft_series.id, "2026-01-04").unwrap();
        draft_save(
            &c,
            &draft.id,
            SessionDraftInput {
                observation: "synthetic pending draft".into(),
                procedures: "synthetic procedure".into(), outcome_decision: "synthetic outcome".into(), referral_closure: None,
                behavior_ids: vec![],
                indicators: vec![],
            },
        )
        .unwrap();
        let finalized_series = agenda::create_series(
            &c,
            AgendaSeriesInput {
                patient_id: patient.id.clone(),
                weekday: 0,
                start: "12:00".into(),
                end: "12:50".into(),
                frequency: "Semanal".into(),
                start_date: "2026-01-04".into(),
                end_date: None,
                modality: "Online".into(),
                meeting_link: Some("https://example.invalid/synthetic".into()),
            },
        )
        .unwrap();
        let finalized_draft = draft_start(&c, &finalized_series.id, "2026-01-04").unwrap();
        let finalized_draft = draft_save(
            &c,
            &finalized_draft.id,
            SessionDraftInput {
                observation: "synthetic finalized session".into(),
                procedures: "synthetic procedure".into(), outcome_decision: "synthetic outcome".into(), referral_closure: None,
                behavior_ids: vec![],
                indicators: vec![],
            },
        )
        .unwrap();
        professional_save(&c, ProfessionalIdentity { display_name: "Synthetic Author".into(), registration: "TEST-001".into() }).unwrap();
        let finalized = finalize(&c, &finalized_draft.id).unwrap();
        addendum_create(&c, &finalized.id, &patient.id, "synthetic correction".into()).unwrap();
        case_context_create(&c, &patient.id, "synthetic demand".into(), "synthetic objective".into()).unwrap();
        case_context_create(&c, &patient.id, "synthetic revised demand".into(), "synthetic revised objective".into()).unwrap();
        drop(c);

        let before_migrate = root.join("before-migrate.synthetic-cbk");
        crate::vault::backup::export(&root, &before_migrate, &key, backup_password.into()).unwrap();
        let migrated = vault.open_conn().unwrap();
        db::migrate(&migrated).unwrap();
        drop(migrated);
        let after_migrate = root.join("after-migrate.synthetic-cbk");
        crate::vault::backup::export(&root, &after_migrate, &key, backup_password.into()).unwrap();

        for backup_path in [PathBuf::from(before_migrate), after_migrate] {
            crate::vault::backup::restore(
                &root,
                &backup_path,
                backup_password,
                local_password,
                true,
                true,
                Some(&key),
            )
            .unwrap();
            assert_agenda_session_rows_survive(&root, &key, &patient.id);
        }
    }
}
pub fn timeline(c: &Connection, p: &str) -> Result<Vec<ClinicalSession>, String> {
    let mut q=c.prepare("SELECT id,patient_id,session_date,start,end,modality,was_rescheduled,observation,behaviors,indicators,author_name,author_registration,recorded_at,procedures,outcome_decision,referral_closure FROM sessions WHERE patient_id=?1 ORDER BY session_date DESC,start DESC").map_err(|_|"Falha ao consultar evolução.".to_string())?;
    let rows = q
        .query_map([p], |r| {
            let b: String = r.get(8)?;
            let i: String = r.get(9)?;
            Ok(ClinicalSession {
                id: r.get(0)?,
                patient_id: r.get(1)?,
                session_date: r.get(2)?,
                start: r.get(3)?,
                end: r.get(4)?,
                modality: r.get(5)?,
                was_rescheduled: r.get::<_, i64>(6)? != 0,
                observation: r.get(7)?,
                procedures: r.get(13)?,
                outcome_decision: r.get(14)?,
                referral_closure: r.get(15)?,
                behaviors: serde_json::from_str(&b).unwrap_or_default(),
                indicators: serde_json::from_str(&i).unwrap_or_default(),
                author: match (r.get::<_, Option<String>>(10)?, r.get::<_, Option<String>>(11)?) { (Some(display_name), Some(registration)) => Some(ProfessionalIdentity { display_name, registration }), _ => None },
                recorded_at: r.get(12)?,
            })
        })
        .map_err(|_| String::from("Falha ao consultar evolução."))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|_| String::from("Falha ao consultar evolução."))
}

#[cfg(test)]
mod addendum_tests {
    use super::*;

    #[test]
    fn bounded_append_only_addenda_keep_the_original_snapshot_and_links() {
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        c.execute("INSERT INTO patients(id,revision,name,life_cycle,preferred_modality) VALUES('p',1,'Synthetic','Não informado','')", []).unwrap();
        c.execute("INSERT INTO patients(id,revision,name,life_cycle,preferred_modality) VALUES('other',1,'Synthetic other','Não informado','')", []).unwrap();
        c.execute("INSERT INTO sessions(id,patient_id,session_date,start,end,modality,was_rescheduled,observation,behaviors,indicators) VALUES('s','p','2026-01-01','10:00','10:50','Online',0,'original','[]','[]')", []).unwrap();
        assert!(addendum_create(&c, "s", "p", "  ".into()).is_err());
        assert!(addendum_create(&c, "s", "p", "x".repeat(4001)).is_err());
        assert!(addendum_create(&c, "s", "other", "wrong patient".into()).is_err());
        assert!(addendum_create(&c, "missing", "p", "missing session".into()).is_err());
        let item = addendum_create(&c, "s", "p", "  correction  ".into()).unwrap();
        assert_eq!(item.content, "correction");
        assert_eq!(addendum_list(&c, "p").unwrap().len(), 1);
        assert!(addendum_list(&c, "other").unwrap().is_empty());
        assert!(c.execute("UPDATE session_addenda SET content='changed' WHERE id=?1", [&item.id]).is_err());
        assert!(c.execute("DELETE FROM session_addenda WHERE id=?1", [&item.id]).is_err());
        assert_eq!(timeline(&c, "p").unwrap()[0].observation, "original");
    }
}

#[cfg(test)]
mod case_context_tests {
    use super::*;

    #[test]
    fn revisions_are_patient_scoped_immutable_and_snapshot_local_identity() {
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        for id in ["p", "other"] {
            c.execute("INSERT INTO patients(id,revision,name,life_cycle,preferred_modality) VALUES(?1,1,'Synthetic','Não informado','')", [id]).unwrap();
        }
        assert!(case_context_list(&c, "p").unwrap().is_empty());
        assert!(case_context_create(&c, "missing", "d".into(), "o".into()).is_err());
        assert!(case_context_create(&c, "p", " ".into(), "o".into()).is_err());
        assert!(case_context_create(&c, "p", "d".into(), "x".repeat(4001)).is_err());
        let anonymous = case_context_create(&c, "p", " demand ".into(), " objective ".into()).unwrap();
        assert!(anonymous.author.is_none());
        let columns: (Option<String>, Option<String>) = c.query_row(
            "SELECT author_name,author_registration FROM case_context_revisions WHERE id=?1", [&anonymous.id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        ).unwrap();
        assert_eq!(columns, (None, None));
        assert_eq!(case_context_list(&c, "p").unwrap().len(), 1);
        c.execute("INSERT INTO case_context_revisions(id,patient_id,recorded_at,demand,objectives) VALUES('legacy','p','2025-01-01T00:00:00Z','legacy demand','legacy objective')", []).unwrap();
        assert!(case_context_list(&c, "p").unwrap()[0].author.is_none());
        professional_save(&c, ProfessionalIdentity { display_name: "Synthetic Author".into(), registration: "TEST-1".into() }).unwrap();
        let first = case_context_create(&c, "p", " demand ".into(), " objective ".into()).unwrap();
        let second = case_context_create(&c, "p", "new demand".into(), "new objective".into()).unwrap();
        professional_save(&c, ProfessionalIdentity { display_name: "Changed".into(), registration: "TEST-2".into() }).unwrap();
        let rows = case_context_list(&c, "p").unwrap();
        assert_eq!(rows.len(), 4);
        assert_eq!(rows[0].id, second.id);
        assert_eq!(rows[0].author.as_ref().unwrap().display_name, "Synthetic Author");
        assert_eq!(rows[1].demand, "demand");
        assert_eq!(rows[2].id, anonymous.id);
        assert!(rows[2].author.is_none());
        assert!(rows[3].author.is_none());
        assert!(case_context_list(&c, "other").unwrap().is_empty());
        assert!(c.execute("UPDATE case_context_revisions SET demand='changed' WHERE id=?1", [&first.id]).is_err());
        assert!(c.execute("DELETE FROM case_context_revisions WHERE id=?1", [&first.id]).is_err());
    }
}
