use super::*;
use std::fs;
use tempfile::TempDir;
use std::sync::{Arc, mpsc};
use std::time::Duration;

#[test]
fn retry_start_is_serialized_and_preserved_after_encrypted_reopen() {
    let root = TempDir::new().unwrap();
    let vault = Vault::new(root.path().into());
    vault.create("synthetic-password-123".into()).unwrap();
    let patient = vault.patient_create(PatientInput {
        name: "Synthetic retry".into(), life_cycle: "Adulto".into(), age: None,
        birth_date: None, self_requester: None, preferred_modality: "Presencial".into(),
    }).unwrap();
    let series = vault.agenda_create_series(AgendaSeriesInput {
        patient_id: patient.id.clone(), weekday: 0, start: "14:00".into(), end: "14:50".into(),
        frequency: "Avulsa".into(), start_date: "2026-09-27".into(), end_date: Some("2026-09-27".into()),
        modality: "Presencial".into(), meeting_link: None,
    }).unwrap();
    let ids = std::thread::scope(|scope| {
        let a = scope.spawn(|| vault.session_draft_start(&series.id, "2026-09-27").unwrap().id);
        let b = scope.spawn(|| vault.session_draft_start(&series.id, "2026-09-27").unwrap().id);
        (a.join().unwrap(), b.join().unwrap())
    });
    assert_eq!(ids.0, ids.1);
    vault.session_draft_save(&ids.0, SessionDraftInput {
        observation: "Synthetic persisted text".into(), procedures: "Synthetic procedure".into(),
        outcome_decision: "Synthetic outcome".into(), referral_closure: None,
        behavior_ids: vec![], indicators: vec![],
    }).unwrap();
    vault.lock().unwrap();
    drop(vault);
    let reopened = Vault::new(root.path().into());
    reopened.unlock("synthetic-password-123".into()).unwrap();
    let retried = reopened.session_draft_start(&series.id, "2026-09-27").unwrap();
    assert_eq!(retried.id, ids.0);
    assert_eq!(retried.observation, "Synthetic persisted text");
    assert_eq!(reopened.session_draft_list(&patient.id).unwrap().len(), 1);
}

#[test]
fn identification_roundtrip_is_scoped_and_explicit() {
    let root = TempDir::new().unwrap();
    let source_root = root.path().join("synthetic-identification");
    let source = Vault::new(source_root.clone());
    source.create("synthetic-password-123".into()).unwrap();
    let make = |name: &str, life: &str, birth: Option<&str>, self_requester: Option<&str>| PatientInput {
        name: name.into(), life_cycle: life.into(), age: Some(15), preferred_modality: "Presencial".into(),
        birth_date: birth.map(|s| Some(s.into())), self_requester: self_requester.map(|s| Some(s.into())),
    };
    let adult = source.patient_create(make("Synthetic Adult", "Adulto", Some("1990-01-02"), Some("yes"))).unwrap();
    let child = source.patient_create(make("Synthetic Child", "Criança", None, Some("no"))).unwrap();
    let adolescent = source.patient_create(make("Synthetic Adolescent", "Adolescente", Some("2011-05-06"), None)).unwrap();
    let absent = source.patient_create(make("Synthetic Unknown", "Não informado", None, None)).unwrap();
    assert_eq!(adult.self_requester.as_deref(), Some("yes"));
    let preserved = source.patient_update(&adult.id, adult.revision, make("Synthetic Adult", "Adulto", None, None)).unwrap();
    assert_eq!(preserved.birth_date.as_deref(), Some("1990-01-02"));
    assert_eq!(preserved.self_requester.as_deref(), Some("yes"));
    let mut clear = make("Synthetic Adult", "Adulto", None, None);
    clear.birth_date = Some(None);
    clear.self_requester = Some(None);
    let cleared = source.patient_update(&adult.id, preserved.revision, clear).unwrap();
    assert!(cleared.birth_date.is_none() && cleared.self_requester.is_none());
    let restored_values = source.patient_update(&adult.id, cleared.revision, make("Synthetic Adult", "Adulto", Some("1990-01-02"), Some("yes"))).unwrap();
    assert_eq!(restored_values.age, Some(15));
    assert_eq!(child.self_requester.as_deref(), Some("no"));
    assert_eq!(absent.self_requester, None);
    assert_eq!(adolescent.age, Some(15));
    let roles = |requester, legal_guardian, administrative_contact| RelatedPartyRoles { requester, legal_guardian, administrative_contact };
    assert!(source.related_party_create(&child.id, RelatedPartyInput { name: "Unclassified".into(), relation: "Outro".into(), roles: roles(false,false,false) }).is_err());
    let guardian = source.related_party_create(&child.id, RelatedPartyInput { name: "Synthetic Mother".into(), relation: "Mãe".into(), roles: roles(false,true,true) }).unwrap();
    let school = source.related_party_create(&child.id, RelatedPartyInput { name: "Synthetic School".into(), relation: "Escola".into(), roles: roles(true,false,false) }).unwrap();
    let a1 = source.related_party_create(&adolescent.id, RelatedPartyInput { name: "Synthetic Father".into(), relation: "Pai".into(), roles: roles(false,true,false) }).unwrap();
    let _a2 = source.related_party_create(&adolescent.id, RelatedPartyInput { name: "Synthetic Institution".into(), relation: "Instituição".into(), roles: roles(true,false,true) }).unwrap();
    assert_eq!(source.related_party_list(&child.id, false).unwrap().len(), 2);
    assert_eq!(source.related_party_list(&adolescent.id, false).unwrap().len(), 2);
    assert!(source.related_party_list(&adult.id, false).unwrap().is_empty());
    assert!(source.related_party_update(&adolescent.id, &guardian.id, guardian.revision, RelatedPartyInput { name: "Leak".into(), relation: "Outro".into(), roles: roles(false,false,false) }).is_err());
    assert!(source.related_party_set_archived(&adolescent.id, &school.id, school.revision, true).is_err());
    let changed = source.related_party_update(&child.id, &guardian.id, guardian.revision, RelatedPartyInput { name: "Synthetic Guardian".into(), relation: "Responsável legal".into(), roles: roles(true,true,false) }).unwrap();
    assert!(source.related_party_update(&child.id, &guardian.id, changed.revision, RelatedPartyInput { name: "No role".into(), relation: "Outro".into(), roles: roles(false,false,false) }).is_err());
    assert_eq!(changed.id, guardian.id);
    assert!(source.related_party_update(&child.id, &guardian.id, guardian.revision, RelatedPartyInput { name: "Stale".into(), relation: "Outro".into(), roles: roles(false,false,false) }).is_err());
    let archived = source.related_party_set_archived(&child.id, &changed.id, changed.revision, true).unwrap();
    assert!(archived.archived_at.is_some());
    assert_eq!(source.related_party_list(&child.id, false).unwrap().len(), 1);
    assert_eq!(source.related_party_list(&child.id, true).unwrap().len(), 2);
    let restored = source.related_party_set_archived(&child.id, &archived.id, archived.revision, false).unwrap();
    assert_eq!(restored.id, guardian.id);
    assert!(restored.archived_at.is_none());
    assert_eq!(source.related_party_list(&adolescent.id, false).unwrap()[0].id, a1.id);
    let txt = source.record_copy_text(&child.id).unwrap();
    assert!(!txt.contains("Synthetic Guardian"));
    assert!(!txt.contains("Synthetic School"));
    source.lock().unwrap();
    let reopened = Vault::new(source_root);
    reopened.unlock("synthetic-password-123".into()).unwrap();
    assert_eq!(reopened.patient_get(&adult.id).unwrap().birth_date.as_deref(), Some("1990-01-02"));
    assert_eq!(reopened.related_party_list(&child.id, false).unwrap().len(), 2);
    let auto = reopened.auto_backup_status().unwrap();
    assert!(auto.present);
    let archive = root.path().join("synthetic-identification.cbk1");
    reopened.backup_to_path(&archive, IMPORT_BACKUP_PASSWORD.into()).unwrap();
    let restored_vault = Vault::new(root.path().join("synthetic-restored"));
    restored_vault.select_backup(archive, IMPORT_BACKUP_PASSWORD.into()).unwrap();
    restored_vault.restore_selected(IMPORT_BACKUP_PASSWORD.into(), IMPORT_LOCAL_PASSWORD.into(), true, false).unwrap();
    assert_eq!(restored_vault.patient_get(&absent.id).unwrap().birth_date, None);
    assert_eq!(restored_vault.patient_get(&adolescent.id).unwrap().self_requester, None);
    assert_eq!(restored_vault.related_party_list(&child.id, false).unwrap().len(), 2);
}

#[test]
fn optional_patient_json_distinguishes_missing_and_null() {
    let dir = TempDir::new().unwrap();
    let vault = Vault::new(dir.path().to_path_buf());
    vault.create("synthetic-password-123".into()).unwrap();
    let base = serde_json::json!({"name":"Synthetic", "lifeCycle":"Adulto", "age":null, "preferredModality":"Online"});
    let initial: PatientInput = serde_json::from_value(serde_json::json!({"name":"Synthetic", "lifeCycle":"Adulto", "age":null, "preferredModality":"Online", "birthDate":"1990-01-02", "selfRequester":"yes"})).unwrap();
    let patient = vault.patient_create(initial).unwrap();
    let omitted: PatientInput = serde_json::from_value(base.clone()).unwrap();
    assert!(omitted.birth_date.is_none());
    assert!(omitted.self_requester.is_none());
    let preserved = vault.patient_update(&patient.id, patient.revision, omitted).unwrap();
    assert_eq!(preserved.birth_date.as_deref(), Some("1990-01-02"));
    assert_eq!(preserved.self_requester.as_deref(), Some("yes"));
    let mut clear = base;
    clear["birthDate"] = serde_json::Value::Null;
    clear["selfRequester"] = serde_json::Value::Null;
    let cleared: PatientInput = serde_json::from_value(clear).unwrap();
    assert!(matches!(cleared.birth_date, Some(None)));
    assert!(matches!(cleared.self_requester, Some(None)));
    let result = vault.patient_update(&patient.id, preserved.revision, cleared).unwrap();
    assert_eq!(result.birth_date, None);
    assert_eq!(result.self_requester, None);
    vault.lock().unwrap();
    vault.unlock("synthetic-password-123".into()).unwrap();
    let stored = vault.patient_get(&patient.id).unwrap();
    assert_eq!(stored.birth_date, None);
    assert_eq!(stored.self_requester, None);
}

#[test]
fn archived_patient_requires_real_state_transitions_and_cannot_be_edited() {
    let dir = TempDir::new().unwrap();
    let vault = Vault::new(dir.path().to_path_buf());
    vault.create("synthetic-password-123".into()).unwrap();
    let input = || PatientInput {
        name: "Synthetic Archived Patient".into(), life_cycle: "Adulto".into(), age: None,
        birth_date: None, self_requester: None, preferred_modality: "Online".into(),
    };
    let patient = vault.patient_create(input()).unwrap();
    assert!(vault.patient_set_archived(&patient.id, patient.revision, false).is_err());
    assert_eq!(vault.patient_get(&patient.id).unwrap().revision, patient.revision);
    let archived = vault.patient_set_archived(&patient.id, patient.revision, true).unwrap();
    assert!(archived.archived_at.is_some());
    assert!(vault.patient_set_archived(&patient.id, archived.revision, true).is_err());
    assert!(vault.patient_update(&patient.id, archived.revision, input()).is_err());
    assert_eq!(vault.patient_get(&patient.id).unwrap().revision, archived.revision);
    assert!(vault.patient_set_archived(&patient.id, patient.revision, false).is_err());
    let restored = vault.patient_set_archived(&patient.id, archived.revision, false).unwrap();
    assert!(restored.archived_at.is_none());
    assert!(vault.patient_set_archived(&patient.id, restored.revision, false).is_err());
    assert!(vault.patient_update(&patient.id, archived.revision, input()).is_err());
    let edited = vault.patient_update(&patient.id, restored.revision, input()).unwrap();
    assert_eq!(edited.revision, restored.revision + 1);
}

#[test]
fn birth_date_uses_current_sao_paulo_civil_day_without_age_inference() {
    use chrono::Duration;
    let today = chrono::Utc::now().with_timezone(&chrono_tz::America::Sao_Paulo).date_naive();
    assert!(db::valid_birth_date(&today.format("%Y-%m-%d").to_string()));
    assert!(!db::valid_birth_date(&(today + Duration::days(1)).format("%Y-%m-%d").to_string()));
    assert!(!db::valid_birth_date("2026-02-30"));
    let dir = TempDir::new().unwrap();
    let vault = Vault::new(dir.path().to_path_buf());
    vault.create("synthetic-password-123".into()).unwrap();
    let input = |date: String| PatientInput {
        name: "Synthetic Date Patient".into(), life_cycle: "Não informado".into(), age: Some(42),
        birth_date: Some(Some(date)), self_requester: None, preferred_modality: "Online".into(),
    };
    assert!(vault.patient_create(input((today + Duration::days(1)).format("%Y-%m-%d").to_string())).is_err());
    let patient = vault.patient_create(input(today.format("%Y-%m-%d").to_string())).unwrap();
    assert_eq!(patient.age, Some(42));
    assert_eq!(patient.life_cycle, "Não informado");
    assert!(vault.patient_update(&patient.id, patient.revision, input((today + Duration::days(1)).format("%Y-%m-%d").to_string())).is_err());
    assert_eq!(vault.patient_get(&patient.id).unwrap().revision, patient.revision);
}

#[test]
fn lock_waits_for_in_flight_database_operation() {
    let dir = TempDir::new().unwrap();
    let vault = Arc::new(Vault::new(dir.path().to_path_buf()));
    vault.create("synthetic-password-123".into()).unwrap();
    let (opened_tx, opened_rx) = mpsc::channel();
    let (release_tx, release_rx) = mpsc::channel();
    let worker_vault = Arc::clone(&vault);
    let worker = std::thread::spawn(move || {
        let conn = worker_vault.open_conn().unwrap();
        opened_tx.send(()).unwrap();
        release_rx.recv().unwrap();
        db::patients_list(&conn, false).unwrap();
    });
    opened_rx.recv_timeout(Duration::from_secs(5)).unwrap();
    let (started_tx, started_rx) = mpsc::channel();
    let (locked_tx, locked_rx) = mpsc::channel();
    let locking_vault = Arc::clone(&vault);
    let locker = std::thread::spawn(move || {
        started_tx.send(()).unwrap();
        locking_vault.lock().unwrap();
        locked_tx.send(()).unwrap();
    });
    started_rx.recv_timeout(Duration::from_secs(5)).unwrap();
    assert!(locked_rx.recv_timeout(Duration::from_millis(100)).is_err());
    release_tx.send(()).unwrap();
    worker.join().unwrap();
    locked_rx.recv_timeout(Duration::from_secs(5)).unwrap();
    locker.join().unwrap();
    assert!(vault.patient_list(false).is_err());
}
#[test]
fn envelope_roundtrip_and_wrong_password() {
    let (e, k) = crypto::new_envelope("synthetic-password-123").unwrap();
    assert_eq!(
        crypto::open_envelope("synthetic-password-123", &e).unwrap(),
        k
    );
    assert!(crypto::open_envelope("wrong-password", &e).is_err())
}
#[test]
fn new_profile_is_encrypted_and_lock_closes_it() {
    let t = TempDir::new().unwrap();
    let v = Vault::new(t.path().to_path_buf());
    v.create("synthetic-password-123".into()).unwrap();
    assert!(v.status().unwrap().unlocked);
    v.lock().unwrap();
    assert!(!v.status().unwrap().unlocked);
    assert!(v.unlock("bad-password-000".into()).is_err());
    v.unlock("synthetic-password-123".into()).unwrap();
}
#[test]
fn patient_revision_and_synthetic_data_persist() {
    let t = TempDir::new().unwrap();
    let v = Vault::new(t.path().into());
    v.create("synthetic-password-123".into()).unwrap();
    let p = v
        .patient_create(PatientInput {
            name: "DEMO Synthetic A".into(),
            life_cycle: "Adulto".into(),
            age: None,
            birth_date: None, self_requester: None,
            preferred_modality: "Online".into(),
        })
        .unwrap();
    assert_eq!(p.revision, 1);
    let updated = v
        .patient_update(
            &p.id,
            p.revision,
            PatientInput {
                name: "DEMO Synthetic B".into(),
                life_cycle: "Adulto".into(),
                age: Some(30),
                birth_date: None, self_requester: None,
                preferred_modality: "Online".into(),
            },
        )
        .unwrap();
    assert_eq!(updated.revision, 2);
    assert!(v
        .patient_update(
            &p.id,
            1,
            PatientInput {
                name: "stale".into(),
                life_cycle: "Adulto".into(),
                age: None,
                birth_date: None, self_requester: None,
                preferred_modality: "".into()
            }
        )
        .is_err());
    v.lock().unwrap();
    v.unlock("synthetic-password-123".into()).unwrap();
    assert_eq!(v.patient_get(&p.id).unwrap().name, "DEMO Synthetic B")
}
#[test]
fn finalized_session_cannot_be_mutated() {
    let t = TempDir::new().unwrap();
    let v = Vault::new(t.path().into());
    v.create("synthetic-password-123".into()).unwrap();
    let p = v
        .patient_create(PatientInput {
            name: "DEMO Session".into(),
            life_cycle: "Adulto".into(),
            age: None,
            birth_date: None, self_requester: None,
            preferred_modality: "Presencial".into(),
        })
        .unwrap();
    let s = v
        .agenda_create_series(AgendaSeriesInput {
            patient_id: p.id,
            weekday: 0,
            start: "14:00".into(),
            end: "14:50".into(),
            frequency: "Semanal".into(),
            start_date: "2026-09-27".into(),
            end_date: None,
            modality: "Presencial".into(),
            meeting_link: None,
        })
        .unwrap();
    let d = v.session_draft_start(&s.id, "2026-09-27").unwrap();
    let saved = v
        .session_draft_save(
            &d.id,
            SessionDraftInput {
                observation: "DEMO observation".into(),
                procedures: "Synthetic procedure".into(), outcome_decision: "Synthetic outcome".into(), referral_closure: None,
                behavior_ids: vec![],
                indicators: vec![],
            },
        )
        .unwrap();
    let done = v.session_finalize(&saved.id).unwrap();
    assert!(done.author.is_none());
    assert!(done.recorded_at.as_deref().unwrap().ends_with("+00:00"));
    assert!(v.session_timeline(&saved.patient_id).unwrap()[0].author.is_none());
    v.professional_save(ProfessionalIdentity { display_name: "Synthetic Author".into(), registration: "TEST-001".into() }).unwrap();
    let authored_draft = v.session_draft_start(&s.id, "2026-10-04").unwrap();
    let authored_draft = v.session_draft_save(&authored_draft.id, SessionDraftInput {
        observation: "DEMO authored observation".into(), procedures: "Synthetic procedure".into(),
        outcome_decision: "Synthetic outcome".into(), referral_closure: None,
        behavior_ids: vec![], indicators: vec![],
    }).unwrap();
    let authored = v.session_finalize(&authored_draft.id).unwrap();
    assert_eq!(authored.author.as_ref().unwrap().registration, "TEST-001");
    v.professional_save(ProfessionalIdentity { display_name: "Changed Synthetic Author".into(), registration: "TEST-999".into() }).unwrap();
    let timeline = v.session_timeline(&saved.patient_id).unwrap();
    assert!(timeline.iter().find(|item| item.id == done.id).unwrap().author.is_none());
    assert_eq!(timeline.iter().find(|item| item.id == authored.id).unwrap().author.as_ref().unwrap().registration, "TEST-001");
    v.lock().unwrap();
    assert!(v.professional_save(ProfessionalIdentity { display_name: "Locked".into(), registration: "TEST-000".into() }).is_err());
    v.unlock("synthetic-password-123".into()).unwrap();
    assert_eq!(done.observation, "DEMO observation");
    assert!(v
        .session_draft_save(
            &saved.id,
            SessionDraftInput {
                observation: "overwrite".into(),
                procedures: "Synthetic procedure".into(), outcome_decision: "Synthetic outcome".into(), referral_closure: None,
                behavior_ids: vec![],
                indicators: vec![]
            }
        )
        .is_err())
}
#[test]
fn cbk1_authenticates_and_detects_corruption() {
    let packed = backup::package(
        b"synthetic encrypted db bytes",
        &[7; 32],
        "synthetic-backup-password",
    )
    .unwrap();
    assert_eq!(&packed[..4], b"CBK1");
    assert!(backup::unpack(&packed, "wrong-password").is_err());
    let mut changed = packed.clone();
    changed[150] ^= 1;
    assert!(backup::unpack(&changed, "synthetic-backup-password").is_err())
}

const IMPORT_BACKUP_PASSWORD: &str = "synthetic-independent-backup-2026";
const IMPORT_LOCAL_PASSWORD: &str = "synthetic-new-local-2026";

#[test]
fn case_context_revisions_remain_append_only_across_reopen_and_cbk1_restore() {
    let source_dir = TempDir::new().unwrap();
    let source_root = source_dir.path().join("synthetic-source");
    let source = Vault::new(source_root.clone());
    source.create("synthetic-source-local-2026".into()).unwrap();
    let patient = source.patient_create(PatientInput {
        name: "Synthetic Context Patient".into(),
        life_cycle: "Criança".into(),
        age: Some(8),
        birth_date: None, self_requester: None,
        preferred_modality: "Presencial".into(),
    }).unwrap();
    source.professional_save(ProfessionalIdentity {
        display_name: "Synthetic Context Author".into(),
        registration: "TEST-CONTEXT".into(),
    }).unwrap();
    let first = source.case_context_create(&patient.id, "Synthetic initial demand".into(), "Synthetic initial objective".into()).unwrap();
    let series = source.agenda_create_series(AgendaSeriesInput {
        patient_id: patient.id.clone(),
        weekday: 1,
        start: "14:00".into(),
        end: "14:50".into(),
        frequency: "Semanal".into(),
        start_date: "2026-09-28".into(),
        end_date: None,
        modality: "Presencial".into(),
        meeting_link: None,
    }).unwrap();
    let draft = source.session_draft_start(&series.id, "2026-09-28").unwrap();
    source.session_draft_save(&draft.id, SessionDraftInput {
        observation: "Synthetic context-independent session".into(),
        procedures: "Synthetic procedure".into(), outcome_decision: "Synthetic outcome".into(), referral_closure: None,
        behavior_ids: vec![],
        indicators: vec![],
    }).unwrap();
    let session = source.session_finalize(&draft.id).unwrap();
    let series_snapshot = serde_json::to_value(&series).unwrap();
    let session_snapshot = serde_json::to_value(&session).unwrap();
    let occurrence_snapshot = serde_json::to_value(source.agenda_occurrences("2026-09-28", "2026-09-28").unwrap()).unwrap();
    let second = source.case_context_create(&patient.id, "Synthetic revised demand".into(), "Synthetic revised objective".into()).unwrap();
    assert_ne!(first.id, second.id);

    let assert_revisions = |vault: &Vault| {
        let revisions = vault.case_context_list(&patient.id).unwrap();
        assert_eq!(revisions.len(), 2);
        assert_eq!(revisions[0].id, second.id);
        assert_eq!(revisions[1].id, first.id);
        for (expected, demand, objectives) in [
            (&first, "Synthetic initial demand", "Synthetic initial objective"),
            (&second, "Synthetic revised demand", "Synthetic revised objective"),
        ] {
            let actual = revisions.iter().find(|item| item.id == expected.id).unwrap();
            assert_eq!(actual.patient_id, patient.id);
            assert_eq!(actual.recorded_at, expected.recorded_at);
            assert_eq!(actual.demand, demand);
            assert_eq!(actual.objectives, objectives);
            assert_eq!(actual.author.as_ref().unwrap().registration, "TEST-CONTEXT");
        }
        let series_after = vault.agenda_list_series().unwrap();
        assert_eq!(series_after.len(), 1);
        assert_eq!(serde_json::to_value(&series_after[0]).unwrap(), series_snapshot);
        let sessions_after = vault.session_timeline(&patient.id).unwrap();
        assert_eq!(sessions_after.len(), 1);
        assert_eq!(serde_json::to_value(&sessions_after[0]).unwrap(), session_snapshot);
        assert_eq!(serde_json::to_value(vault.agenda_occurrences("2026-09-28", "2026-09-28").unwrap()).unwrap(), occurrence_snapshot);
    };
    assert_revisions(&source);
    {
        let conn = source.open_conn().unwrap();
        assert!(conn.execute("UPDATE case_context_revisions SET demand='tampered' WHERE id=?1", [&first.id]).is_err());
        assert!(conn.execute("DELETE FROM case_context_revisions WHERE id=?1", [&first.id]).is_err());
    }
    assert_revisions(&source);
    source.lock().unwrap();
    let reopened = Vault::new(source_root);
    reopened.unlock("synthetic-source-local-2026".into()).unwrap();
    assert_revisions(&reopened);

    let archive = source_dir.path().join("synthetic-context.circulo-backup");
    reopened.backup_to_path(&archive, IMPORT_BACKUP_PASSWORD.into()).unwrap();
    assert_eq!(&fs::read(&archive).unwrap()[..4], b"CBK1");
    let destination_dir = TempDir::new().unwrap();
    let destination = Vault::new(destination_dir.path().join("restored-profile"));
    destination.select_backup(archive, IMPORT_BACKUP_PASSWORD.into()).unwrap();
    destination.restore_selected(IMPORT_BACKUP_PASSWORD.into(), IMPORT_LOCAL_PASSWORD.into(), true, false).unwrap();
    assert_revisions(&destination);
    destination.lock().unwrap();
    destination.unlock(IMPORT_LOCAL_PASSWORD.into()).unwrap();
    assert_revisions(&destination);
}

fn synthetic_import_fixture(root: &Path) -> (Vault, String, String, String, PathBuf) {
    let source = Vault::new(root.to_path_buf());
    source.create("synthetic-source-local-2026".into()).unwrap();
    let patient = source
        .patient_create(PatientInput {
            name: "Synthetic Portable Patient".into(),
            life_cycle: "Adulto".into(),
            age: None,
            birth_date: None, self_requester: None,
            preferred_modality: "Presencial".into(),
        })
        .unwrap();
    let series = source
        .agenda_create_series(AgendaSeriesInput {
            patient_id: patient.id.clone(),
            weekday: 4,
            start: "14:00".into(),
            end: "14:50".into(),
            frequency: "Semanal".into(),
            start_date: "2026-01-01".into(),
            end_date: None,
            modality: "Presencial".into(),
            meeting_link: None,
        })
        .unwrap();
    source
        .agenda_reschedule(
            &series.id,
            "2026-01-01",
            RescheduleInput {
                date: "2026-01-03".into(),
                start: "16:00".into(),
                end: "16:50".into(),
                reason: Some("Synthetic change".into()),
            },
        )
        .unwrap();
    let draft = source
        .session_draft_start(&series.id, "2026-01-01")
        .unwrap();
    let draft = source
        .session_draft_save(
            &draft.id,
            SessionDraftInput {
                observation: "Synthetic portable observation".into(),
                procedures: "Synthetic portable procedure".into(), outcome_decision: "Synthetic portable outcome".into(), referral_closure: Some("Synthetic referral".into()),
                behavior_ids: vec![],
                indicators: vec![IndicatorEntry {
                    id: "reg".into(),
                    value: Some(2),
                    note: Some("Synthetic portable note".into()),
                }],
            },
        )
        .unwrap();
    source.professional_save(ProfessionalIdentity { display_name: "Synthetic Backup Author".into(), registration: "TEST-002".into() }).unwrap();
    let session = source.session_finalize(&draft.id).unwrap();
    assert_eq!(session.procedures.as_deref(), Some("Synthetic portable procedure"));
    assert_eq!(session.outcome_decision.as_deref(), Some("Synthetic portable outcome"));
    assert_eq!(session.referral_closure.as_deref(), Some("Synthetic referral"));
    let archive = root.join("synthetic-portable.circulo-backup");
    source
        .backup_to_path(&archive, IMPORT_BACKUP_PASSWORD.into())
        .unwrap();
    (source, patient.id, series.id, session.id, archive)
}

#[test]
fn v5_portable_backup_imports_into_empty_profile_with_new_local_password() {
    assert_ne!(IMPORT_BACKUP_PASSWORD, IMPORT_LOCAL_PASSWORD);
    let source_dir = TempDir::new().unwrap();
    let (source, patient_id, series_id, session_id, archive) =
        synthetic_import_fixture(source_dir.path());
    let archive_before = fs::read(&archive).unwrap();
    let destination_parent = TempDir::new().unwrap();
    let root = destination_parent.path().join("empty-profile");
    let destination = Vault::new(root.clone());
    assert!(!root.exists());
    let preview = destination
        .select_backup(archive.clone(), IMPORT_BACKUP_PASSWORD.into())
        .unwrap();
    assert_eq!(preview.schema_version, 5);
    assert_eq!(preview.profile_state, "empty");
    assert!(!preview.replaces_existing);
    destination
        .restore_selected(
            IMPORT_BACKUP_PASSWORD.into(),
            IMPORT_LOCAL_PASSWORD.into(),
            true,
            false,
        )
        .unwrap();
    assert!(destination.status().unwrap().unlocked);
    destination.lock().unwrap();
    let reopened = Vault::new(root);
    assert!(reopened.unlock(IMPORT_BACKUP_PASSWORD.into()).is_err());
    reopened.unlock(IMPORT_LOCAL_PASSWORD.into()).unwrap();
    assert_eq!(reopened.professional_get().unwrap().unwrap().registration, "TEST-002");
    let restored_session = reopened.session_timeline(&patient_id).unwrap().into_iter().find(|item| item.id == session_id).unwrap();
    assert_eq!(restored_session.procedures.as_deref(), Some("Synthetic portable procedure"));
    assert_eq!(restored_session.outcome_decision.as_deref(), Some("Synthetic portable outcome"));
    assert_eq!(restored_session.referral_closure.as_deref(), Some("Synthetic referral"));
    assert_eq!(restored_session.author.unwrap().display_name, "Synthetic Backup Author");
    assert!(restored_session.recorded_at.is_some());
    assert_eq!(
        reopened.patient_get(&patient_id).unwrap().name,
        "Synthetic Portable Patient"
    );
    assert!(reopened
        .agenda_list_series()
        .unwrap()
        .iter()
        .any(|series| series.id == series_id));
    assert!(reopened
        .agenda_occurrences("2026-01-01", "2026-01-08")
        .unwrap()
        .iter()
        .any(|occurrence| {
            occurrence.series_id == series_id
                && occurrence.original_date == "2026-01-01"
                && occurrence.date == "2026-01-03"
                && occurrence.was_rescheduled
        }));
    assert!(reopened.agenda_history().unwrap().iter().any(|event| {
        event.series_id == series_id
            && event.action == "reschedule"
            && event.effective_date.as_deref() == Some("2026-01-03")
    }));
    assert!(reopened
        .session_timeline(&patient_id)
        .unwrap()
        .iter()
        .any(|session| {
            session.id == session_id
                && session.observation == "Synthetic portable observation"
                && session.indicators.iter().any(|indicator| {
                    indicator.id == "reg"
                        && indicator.value == Some(2)
                        && indicator.note.as_deref() == Some("Synthetic portable note")
                })
        }));
    assert_eq!(fs::read(&archive).unwrap(), archive_before);
    assert_eq!(
        source.patient_get(&patient_id).unwrap().name,
        "Synthetic Portable Patient"
    );
}

#[test]
fn empty_import_rejects_wrong_password_and_corruption_without_changing_either_profile() {
    let source_dir = TempDir::new().unwrap();
    let (source, patient_id, _, _, archive) = synthetic_import_fixture(source_dir.path());
    let archive_before = fs::read(&archive).unwrap();
    let destination_parent = TempDir::new().unwrap();
    let root = destination_parent.path().join("empty-profile");
    fs::create_dir(&root).unwrap();
    let destination = Vault::new(root.clone());
    destination
        .select_backup(archive.clone(), IMPORT_BACKUP_PASSWORD.into())
        .unwrap();
    assert!(destination
        .restore_selected(
            "wrong-synthetic-backup-password".into(),
            IMPORT_LOCAL_PASSWORD.into(),
            true,
            false
        )
        .is_err());
    assert_eq!(fs::read_dir(&root).unwrap().count(), 0);
    assert!(destination
        .restore_selected(
            IMPORT_BACKUP_PASSWORD.into(),
            "too-short".into(),
            true,
            false
        )
        .is_err());
    assert_eq!(fs::read_dir(&root).unwrap().count(), 0);
    let mut corrupted = archive_before.clone();
    corrupted[150] ^= 1;
    let corrupted_path = source_dir.path().join("corrupted.circulo-backup");
    fs::write(&corrupted_path, corrupted).unwrap();
    assert!(destination
        .select_backup(corrupted_path.clone(), IMPORT_BACKUP_PASSWORD.into())
        .is_err());
    assert!(backup::restore_empty(
        &root,
        &corrupted_path,
        IMPORT_BACKUP_PASSWORD,
        IMPORT_LOCAL_PASSWORD,
        true
    )
    .is_err());
    assert_eq!(fs::read_dir(&root).unwrap().count(), 0);
    let malformed = backup::package(
        b"synthetic invalid SQLCipher bytes",
        &[7; 32],
        IMPORT_BACKUP_PASSWORD,
    )
    .unwrap();
    let malformed_path = source_dir.path().join("malformed.circulo-backup");
    fs::write(&malformed_path, malformed).unwrap();
    assert!(backup::restore_empty(
        &root,
        &malformed_path,
        IMPORT_BACKUP_PASSWORD,
        IMPORT_LOCAL_PASSWORD,
        true
    )
    .is_err());
    assert_eq!(fs::read_dir(&root).unwrap().count(), 0);
    assert_eq!(fs::read_dir(destination_parent.path()).unwrap().count(), 1);
    assert_eq!(fs::read(&archive).unwrap(), archive_before);
    assert_eq!(
        source.patient_get(&patient_id).unwrap().name,
        "Synthetic Portable Patient"
    );
}

#[test]
fn empty_import_refuses_incomplete_or_occupied_destination_without_modification() {
    let source_dir = TempDir::new().unwrap();
    let (_, _, _, _, archive) = synthetic_import_fixture(source_dir.path());
    let destination_parent = TempDir::new().unwrap();
    for name in ["circulo.db", "vault.key", "restore.pending", "other-file"] {
        let root = destination_parent.path().join(name.replace('.', "-"));
        fs::create_dir(&root).unwrap();
        fs::write(root.join(name), b"synthetic existing artifact").unwrap();
        let before = fs::read(root.join(name)).unwrap();
        let destination = Vault::new(root.clone());
        let preview = destination
            .select_backup(archive.clone(), IMPORT_BACKUP_PASSWORD.into())
            .unwrap();
        assert_eq!(preview.profile_state, "incomplete-profile-unsupported");
        assert!(destination
            .restore_selected(
                IMPORT_BACKUP_PASSWORD.into(),
                IMPORT_LOCAL_PASSWORD.into(),
                true,
                false
            )
            .is_err());
        assert_eq!(fs::read(root.join(name)).unwrap(), before);
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
    }
}

#[test]
fn existing_profile_replacement_still_uses_its_preserved_path() {
    let source_dir = TempDir::new().unwrap();
    let (_, patient_id, _, _, archive) = synthetic_import_fixture(source_dir.path());
    let destination_dir = TempDir::new().unwrap();
    let destination = Vault::new(destination_dir.path().to_path_buf());
    destination.create(IMPORT_LOCAL_PASSWORD.into()).unwrap();
    destination
        .patient_create(PatientInput {
            name: "Synthetic Previous Patient".into(),
            life_cycle: "Adulto".into(),
            age: None,
            birth_date: None, self_requester: None,
            preferred_modality: "Online".into(),
        })
        .unwrap();
    let preview = destination
        .select_backup(archive, IMPORT_BACKUP_PASSWORD.into())
        .unwrap();
    assert!(preview.replaces_existing);
    assert_eq!(preview.profile_state, "ready");
    destination
        .restore_selected(
            IMPORT_BACKUP_PASSWORD.into(),
            IMPORT_LOCAL_PASSWORD.into(),
            true,
            true,
        )
        .unwrap();
    assert_eq!(
        destination.patient_get(&patient_id).unwrap().name,
        "Synthetic Portable Patient"
    );
    assert!(fs::read_dir(destination_dir.path())
        .unwrap()
        .filter_map(Result::ok)
        .any(|entry| {
            entry
                .file_name()
                .to_string_lossy()
                .starts_with("pre-restore-")
        }));
}

#[test]
fn legacy_portable_backup_is_refused_without_creating_staging_files() {
    let backup_dir = TempDir::new().unwrap();
    let root = TempDir::new().unwrap();
    let packed = backup::package_schema(
        b"synthetic encrypted legacy database bytes",
        &[0x42; 32],
        "synthetic-backup-password-123",
        3,
    )
    .unwrap();
    let source = backup_dir.path().join("legacy.circulo-backup");
    fs::write(&source, packed).unwrap();

    let result = backup::restore(
        root.path(),
        &source,
        "synthetic-backup-password-123",
        "synthetic-local-password-123",
        true,
        true,
        None,
    );
    assert!(result.is_err());
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 0);
    assert!(source.is_file());
}

#[test]
fn unlock_restores_a_verified_previous_database_after_interrupted_publication() {
    let t = TempDir::new().unwrap();
    let root = t.path();
    let v = Vault::new(root.to_path_buf());
    v.create("synthetic-password-123".into()).unwrap();
    let patient = v
        .patient_create(PatientInput {
            name: "DEMO Recoverable Patient".into(),
            life_cycle: "Adulto".into(),
            age: None,
            birth_date: None, self_requester: None,
            preferred_modality: "Presencial".into(),
        })
        .unwrap();
    v.lock().unwrap();

    fs::copy(root.join(DB_NAME), root.join("restore.pending")).unwrap();
    fs::write(root.join(DB_NAME), b"synthetic interrupted publication").unwrap();

    let reopened = Vault::new(root.to_path_buf());
    reopened.unlock("synthetic-password-123".into()).unwrap();
    assert_eq!(
        reopened.patient_get(&patient.id).unwrap().name,
        "DEMO Recoverable Patient"
    );
    assert!(!root.join("restore.pending").exists());
}

#[test]
fn new_restore_is_refused_while_an_existing_recovery_marker_is_preserved() {
    let t = TempDir::new().unwrap();
    let root = t.path();
    let v = Vault::new(root.to_path_buf());
    v.create("synthetic-password-123".into()).unwrap();
    let portable = root.join("synthetic-recovery.circulo-backup");
    v.backup_to_path(&portable, "synthetic-backup-password-123".into())
        .unwrap();
    v.lock().unwrap();
    fs::write(
        root.join("restore.pending"),
        b"synthetic unknown recovery artifact",
    )
    .unwrap();
    let marker_before = fs::read(root.join("restore.pending")).unwrap();

    let reopened = Vault::new(root.to_path_buf());
    reopened.unlock("synthetic-password-123".into()).unwrap();
    reopened
        .select_backup(portable, "synthetic-backup-password-123".into())
        .unwrap();
    assert!(reopened
        .restore_selected(
            "synthetic-backup-password-123".into(),
            "synthetic-password-123".into(),
            true,
            true,
        )
        .is_err());
    assert_eq!(
        fs::read(root.join("restore.pending")).unwrap(),
        marker_before
    );
}

#[test]
fn verified_previous_database_marker_is_preserved_under_inventory_name_on_unlock() {
    let t = TempDir::new().unwrap();
    let root = t.path();
    let v = Vault::new(root.to_path_buf());
    v.create("synthetic-password-123".into()).unwrap();
    v.lock().unwrap();
    fs::copy(root.join(DB_NAME), root.join("restore.pending")).unwrap();

    let reopened = Vault::new(root.to_path_buf());
    reopened.unlock("synthetic-password-123".into()).unwrap();
    assert!(root.join(DB_NAME).is_file());
    assert!(!root.join("restore.pending").exists());
    let retained = fs::read_dir(root)
        .unwrap()
        .filter_map(Result::ok)
        .any(|entry| {
            entry
                .file_name()
                .to_string_lossy()
                .starts_with("pre-restore-recovery-")
        });
    assert!(retained, "verified previous database was not preserved");
}

#[test]
fn invalid_automatic_snapshot_does_not_leave_a_recovery_marker_or_change_active_data() {
    let t = TempDir::new().unwrap();
    let root = t.path();
    let v = Vault::new(root.to_path_buf());
    v.create("synthetic-password-123".into()).unwrap();
    let patient = v
        .patient_create(PatientInput {
            name: "DEMO Auto Backup Patient".into(),
            life_cycle: "Adulto".into(),
            age: None,
            birth_date: None, self_requester: None,
            preferred_modality: "Online".into(),
        })
        .unwrap();
    v.lock().unwrap();
    fs::write(
        root.join("auto-backup.db"),
        b"synthetic invalid encrypted backup",
    )
    .unwrap();

    let reopened = Vault::new(root.to_path_buf());
    reopened.unlock("synthetic-password-123".into()).unwrap();
    assert!(reopened
        .restore_auto_backup("synthetic-password-123".into(), true)
        .is_err());
    assert!(!root.join("restore.pending").exists());
    assert_eq!(
        reopened.patient_get(&patient.id).unwrap().name,
        "DEMO Auto Backup Patient"
    );
}
#[test]
fn record_copy_keeps_operation_guard_through_publication() {
    use std::{sync::{mpsc, Arc}, thread, time::Duration};
    let dir = tempfile::tempdir().unwrap();
    let vault = Arc::new(super::Vault::new(dir.path().to_path_buf()));
    vault.create("synthetic-password-2026".into()).unwrap();
    let patient = vault.patient_create(super::PatientInput {
        name: "Synthetic export patient".into(), life_cycle: "Criança".into(),
        age: None, preferred_modality: "Presencial".into(),
        birth_date: None, self_requester: None,
    }).unwrap();
    let (publishing_tx, publishing_rx) = mpsc::channel();
    let (resume_tx, resume_rx) = mpsc::channel();
    let export_vault = Arc::clone(&vault);
    let observed_vault = Arc::clone(&vault);
    let export = thread::spawn(move || export_vault.record_copy_with(&patient.id, |text| {
        assert!(text.contains("Synthetic export patient"));
        assert!(observed_vault.operation.try_lock().is_err(), "export must hold operation guard during publication");
        publishing_tx.send(()).unwrap();
        resume_rx.recv().unwrap();
        Ok(())
    }));
    publishing_rx.recv_timeout(Duration::from_secs(5)).unwrap();
    let (lock_started_tx, lock_started_rx) = mpsc::channel();
    let (locked_tx, locked_rx) = mpsc::channel();
    let locking_vault = Arc::clone(&vault);
    let locking = thread::spawn(move || {
        lock_started_tx.send(()).unwrap();
        locking_vault.lock().unwrap();
        locked_tx.send(()).unwrap();
    });
    lock_started_rx.recv_timeout(Duration::from_secs(5)).unwrap();
    assert!(locked_rx.recv_timeout(Duration::from_millis(100)).is_err());
    resume_tx.send(()).unwrap();
    export.join().unwrap().unwrap();
    locked_rx.recv_timeout(Duration::from_secs(5)).unwrap();
    locking.join().unwrap();
    assert!(vault.record_copy_text("missing").is_err());
    assert!(!vault.status().unwrap().unlocked);
}
#[cfg(windows)]
#[test]
fn daily_unlock_reopens_and_manual_lock_revokes() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_path_buf();
    let vault = Vault::new(root.clone());
    vault.create("synthetic-password-123".into()).unwrap();
    assert!(root.join("daily-unlock.dpapi").exists());
    drop(vault);
    let reopened = Vault::new(root.clone());
    assert!(reopened.status().unwrap().unlocked);
    reopened.lock().unwrap();
    assert!(!reopened.status().unwrap().unlocked);
    assert!(!Vault::new(root).status().unwrap().unlocked);
}

#[cfg(windows)]
#[test]
fn daily_unlock_rejects_tampering_and_other_envelope() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_path_buf();
    let vault = Vault::new(root.clone());
    vault.create("synthetic-password-123".into()).unwrap();
    std::fs::write(root.join("daily-unlock.dpapi"), b"tampered").unwrap();
    assert!(!Vault::new(root.clone()).status().unwrap().unlocked);
    vault.unlock("synthetic-password-123".into()).unwrap();
    std::fs::write(root.join("vault.key"), b"other-envelope").unwrap();
    assert!(!Vault::new(root).status().unwrap().unlocked);
}

#[cfg(windows)]
#[test]
fn read_only_daily_cache_is_revoked_across_restart() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_path_buf();
    let vault = Vault::new(root.clone());
    vault.create("synthetic-password-123".into()).unwrap();
    let cache = root.join("daily-unlock.dpapi");
    let mut permissions = std::fs::metadata(&cache).unwrap().permissions();
    permissions.set_readonly(true);
    std::fs::set_permissions(&cache, permissions).unwrap();
    vault.lock().unwrap();
    assert!(!Vault::new(root.clone()).status().unwrap().unlocked);
    // Windows may delete a read-only file; only clear the flag if it survived.
    if cache.exists() {
        let mut permissions = std::fs::metadata(&cache).unwrap().permissions();
        permissions.set_readonly(false);
        std::fs::set_permissions(&cache, permissions).unwrap();
    }
    assert!(!Vault::new(root).status().unwrap().unlocked);
}

#[cfg(windows)]
#[test]
fn undeletable_daily_cache_path_uses_persistent_revocation_marker() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_path_buf();
    let vault = Vault::new(root.clone());
    vault.create("synthetic-password-123".into()).unwrap();
    let cache = root.join("daily-unlock.dpapi");
    std::fs::remove_file(&cache).unwrap();
    std::fs::create_dir(&cache).unwrap();
    vault.lock().unwrap();
    assert!(root.join("daily-unlock.revoked").exists());
    assert!(!Vault::new(root).status().unwrap().unlocked);
}

#[cfg(windows)]
fn block_daily_revocation(root: &Path) {
    let cache = root.join("daily-unlock.dpapi");
    fs::remove_file(&cache).unwrap();
    fs::create_dir(&cache).unwrap();
    fs::create_dir(root.join("daily-unlock.revoked")).unwrap();
}

#[cfg(windows)]
#[test]
fn expired_session_refuses_access_when_revocation_fails() {
    let dir = TempDir::new().unwrap();
    let root = dir.path().to_path_buf();
    let vault = Vault::new(root.clone());
    vault.create("synthetic-password-123".into()).unwrap();
    vault.lock_state().unwrap().unlocked_day = Some("2000-01-01".into());
    block_daily_revocation(&root);
    assert!(vault.status().is_err());
    assert!(vault.patient_list(false).is_err());
    assert!(vault.lock_state().unwrap().db_key.is_some());
}

#[cfg(windows)]
#[test]
fn failed_revocation_does_not_publish_selected_restore() {
    let source_dir = TempDir::new().unwrap();
    let (_source, _, _, _, archive) = synthetic_import_fixture(source_dir.path());
    let dest_dir = TempDir::new().unwrap();
    let root = dest_dir.path().join("destination");
    let vault = Vault::new(root.clone());
    vault.create("synthetic-password-123".into()).unwrap();
    vault.select_backup(archive, IMPORT_BACKUP_PASSWORD.into()).unwrap();
    let before_db = fs::read(root.join(DB_NAME)).unwrap();
    let before_key = fs::read(root.join(KEY_NAME)).unwrap();
    block_daily_revocation(&root);
    assert!(vault.restore_selected(IMPORT_BACKUP_PASSWORD.into(), IMPORT_LOCAL_PASSWORD.into(), true, false).is_err());
    assert_eq!(fs::read(root.join(DB_NAME)).unwrap(), before_db);
    assert_eq!(fs::read(root.join(KEY_NAME)).unwrap(), before_key);
    assert!(!root.join("restore.pending").exists());
}

#[cfg(windows)]
#[test]
fn failed_revocation_does_not_publish_auto_restore() {
    let dir = TempDir::new().unwrap();
    let root = dir.path().to_path_buf();
    let vault = Vault::new(root.clone());
    vault.create("synthetic-password-123".into()).unwrap();
    vault.patient_create(PatientInput {
        name: "Synthetic patient".into(), life_cycle: "Adulto".into(), age: None,
        birth_date: None, self_requester: None, preferred_modality: "Online".into(),
    }).unwrap();
    let before_db = fs::read(root.join(DB_NAME)).unwrap();
    block_daily_revocation(&root);
    assert!(vault.restore_auto_backup("synthetic-password-123".into(), true).is_err());
    assert_eq!(fs::read(root.join(DB_NAME)).unwrap(), before_db);
    assert!(!root.join("restore.pending").exists());
}
