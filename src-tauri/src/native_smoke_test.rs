//! Opt-in native smoke test for the persistent MVP flow using synthetic data only.
//! Every file lives under a temporary directory; the app profile is never opened.
use crate::vault::{
    AgendaSeriesInput, IndicatorEntry, PatientInput, ProfessionalIdentity, RescheduleInput, SessionDraftInput, Vault,
};
use std::{error::Error, fs, io::ErrorKind, path::PathBuf, process::Command};
use tempfile::{Builder, TempDir};

type TestResult<T = ()> = Result<T, Box<dyn Error>>;

const LOCAL_PASSWORD: &str = "synthetic-local-password-2026";
const BACKUP_PASSWORD: &str = "synthetic-independent-backup-2026";
const RESTORED_LOCAL_PASSWORD: &str = "synthetic-restored-local-2026";
const SYNTHETIC_PATIENT: &str = "Synthetic Smoke Patient";
const ORIGINAL_DATE: &str = "2026-01-01";
const EFFECTIVE_DATE: &str = "2026-01-03";
const OBSERVATION: &str = "Synthetic session observation";
const ROOT_ENV: &str = "CIRCULO_SELF_TEST_ROOT";
const MARKER: &[u8] = b"circulo-native-smoke-v1";

/// Exercises the persistent MVP flow and a portable CBK1 v5 roundtrip without app-profile access.
pub fn run() -> TestResult {
    let temp = Builder::new().prefix("circulo-selftest-").tempdir()?;
    let profile = temp.path().join("profile");
    let restored_profile = temp.path().join("restored-profile");
    let archive = temp.path().join("synthetic-portable.circulo-backup");
    ensure(
        BACKUP_PASSWORD != RESTORED_LOCAL_PASSWORD,
        "backup and restored local passwords must differ",
    )?;

    let vault = Vault::new(profile.clone());
    vault.create(LOCAL_PASSWORD.to_owned())?;
    ensure(vault.status()?.initialized, "new vault is not initialized")?;
    ensure(vault.status()?.unlocked, "new vault is not unlocked")?;

    let patient = vault.patient_create(PatientInput {
        name: SYNTHETIC_PATIENT.into(),
        life_cycle: "Adulto".into(),
        age: None,
        birth_date: None,
        self_requester: None,
        preferred_modality: "Presencial".into(),
    })?;

    let series = vault.agenda_create_series(AgendaSeriesInput {
        patient_id: patient.id.clone(),
        weekday: 4, // Thursday, 2026-01-01.
        start: "14:00".into(),
        end: "14:50".into(),
        frequency: "Semanal".into(),
        start_date: ORIGINAL_DATE.into(),
        end_date: None,
        modality: "Presencial".into(),
        meeting_link: None,
    })?;
    let initial = vault.agenda_occurrences(ORIGINAL_DATE, "2026-01-08")?;
    ensure(
        initial
            .iter()
            .any(|o| o.series_id == series.id && o.original_date == ORIGINAL_DATE),
        "first weekly occurrence was not created",
    )?;
    ensure(
        initial
            .iter()
            .any(|o| o.series_id == series.id && o.original_date == "2026-01-08"),
        "second weekly occurrence was not created",
    )?;
    vault.agenda_reschedule(
        &series.id,
        ORIGINAL_DATE,
        RescheduleInput {
            date: EFFECTIVE_DATE.into(),
            start: "16:00".into(),
            end: "16:50".into(),
            reason: Some("Synthetic schedule change".into()),
        },
    )?;
    let catalog = vault.indicator_catalog()?;
    let indicator = catalog
        .iter()
        .find(|definition| definition.id == "reg")
        .ok_or("existing regulation indicator is missing")?;
    ensure(indicator.labels.len() > 2, "indicator scale is too short")?;
    let draft = vault.session_draft_start(&series.id, ORIGINAL_DATE)?;
    let saved = vault.session_draft_save(
        &draft.id,
        SessionDraftInput {
            observation: OBSERVATION.into(),
            procedures: "Synthetic procedure".into(), outcome_decision: "Synthetic outcome".into(), referral_closure: None,
            behavior_ids: vec![],
            indicators: vec![IndicatorEntry {
                id: indicator.id.clone(),
                value: Some(2),
                note: Some("Synthetic indicator note".into()),
            }],
        },
    )?;
    ensure(
        saved.observation == OBSERVATION,
        "draft observation was not saved",
    )?;
    vault.professional_save(ProfessionalIdentity {
        display_name: "Synthetic Smoke Author".into(),
        registration: "TEST-001".into(),
    })?;
    let finalized = vault.session_finalize(&saved.id)?;
    ensure(
        finalized.session_date == EFFECTIVE_DATE && finalized.observation == OBSERVATION,
        "finalized session did not use the effective occurrence",
    )?;
    vault.backup_to_path(&archive, BACKUP_PASSWORD.into())?;
    let archive_before = fs::read(&archive)?;

    vault.lock()?;
    ensure(
        !vault.status()?.unlocked,
        "vault remained unlocked after lock",
    )?;
    ensure(
        vault.patient_list(false).is_err(),
        "locked vault allowed access to synthetic records",
    )?;

    let reopened = Vault::new(profile);
    ensure(
        reopened
            .unlock("synthetic-wrong-local-password".into())
            .is_err(),
        "incorrect local password was accepted",
    )?;
    reopened.unlock(LOCAL_PASSWORD.into())?;
    verify_records(
        &reopened,
        &patient.id,
        &series.id,
        &finalized.id,
        &indicator.id,
    )?;

    let destination = Vault::new(restored_profile.clone());
    ensure(
        !restored_profile.exists(),
        "restore destination is not empty",
    )?;
    let preview = destination.select_backup(archive.clone(), BACKUP_PASSWORD.into())?;
    ensure(
        preview.schema_version == 5
            && preview.profile_state == "empty"
            && !preview.replaces_existing,
        "v5 backup was not accepted for an empty profile",
    )?;
    ensure(
        destination
            .restore_selected(
                "synthetic-wrong-backup-password".into(),
                RESTORED_LOCAL_PASSWORD.into(),
                true,
                false,
            )
            .is_err(),
        "incorrect backup password was accepted",
    )?;
    ensure(
        !restored_profile.exists(),
        "wrong backup password changed the empty destination",
    )?;
    ensure(
        fs::read(&archive)? == archive_before,
        "failed restore changed the portable backup",
    )?;
    verify_records(
        &reopened,
        &patient.id,
        &series.id,
        &finalized.id,
        &indicator.id,
    )?;
    destination.select_backup(archive.clone(), BACKUP_PASSWORD.into())?;
    destination.restore_selected(
        BACKUP_PASSWORD.into(),
        RESTORED_LOCAL_PASSWORD.into(),
        true,
        false,
    )?;
    destination.lock()?;
    let restored = Vault::new(restored_profile);
    ensure(
        restored.unlock(BACKUP_PASSWORD.into()).is_err(),
        "backup password unlocked the restored vault",
    )?;
    restored.unlock(RESTORED_LOCAL_PASSWORD.into())?;
    verify_records(
        &restored,
        &patient.id,
        &series.id,
        &finalized.id,
        &indicator.id,
    )?;
    ensure(
        fs::read(&archive)? == archive_before,
        "successful restore changed the portable backup",
    )?;
    restored.lock()?;
    ensure(!restored.status()?.unlocked, "restored vault did not lock")?;
    reopened.lock()?;
    ensure(!reopened.status()?.unlocked, "reopened vault did not lock")?;
    run_cross_process(&temp)?;
    run_auto_backup(&temp)?;
    Ok(())
}

fn run_auto_backup(temp: &TempDir) -> TestResult {
    let root = temp.path().join("auto-profile");
    let vault = Vault::new(root.clone());
    vault.create(LOCAL_PASSWORD.into())?;
    let patient = vault.patient_create(PatientInput {
        name: SYNTHETIC_PATIENT.into(),
        life_cycle: "Adulto".into(),
        age: None,
        birth_date: None,
        self_requester: None,
        preferred_modality: "Presencial".into(),
    })?;
    let active = root.join("circulo.db");
    let snapshot = root.join("auto-backup.db");
    let envelope = root.join("vault.key");
    let marker = root.join("restore.pending");
    let status = vault.auto_backup_status()?;
    ensure(
        status.present && status.available && status.key_envelope_present && !status.dirty,
        "mutation did not create an available automatic backup",
    )?;
    let snapshot_before = fs::read(&snapshot)?;
    let envelope_before = fs::read(&envelope)?;
    ensure(
        vault.validate_auto_backup(LOCAL_PASSWORD.into())?,
        "correct password did not validate automatic backup",
    )?;
    ensure(
        vault
            .validate_auto_backup("synthetic-wrong-local-password".into())
            .is_err(),
        "incorrect password validated automatic backup",
    )?;

    vault.lock()?;
    fs::write(&active, b"synthetic corrupted active database")?;
    let corrupted_active = fs::read(&active)?;
    ensure(
        path_absent(&marker)?,
        "recovery marker existed before refusal",
    )?;
    ensure(
        vault
            .restore_auto_backup(LOCAL_PASSWORD.into(), false)
            .is_err(),
        "automatic restore without confirmation was accepted",
    )?;
    ensure(
        fs::read(&active)? == corrupted_active
            && fs::read(&snapshot)? == snapshot_before
            && fs::read(&envelope)? == envelope_before
            && path_absent(&marker)?,
        "refused automatic restore changed files or marker",
    )?;
    vault.restore_auto_backup(LOCAL_PASSWORD.into(), true)?;
    ensure(
        vault.patient_get(&patient.id)?.name == SYNTHETIC_PATIENT,
        "automatic restore did not recover synthetic patient",
    )?;
    vault.lock()?;
    let reopened = Vault::new(root);
    reopened.unlock(LOCAL_PASSWORD.into())?;
    ensure(
        reopened.patient_get(&patient.id)?.name == SYNTHETIC_PATIENT,
        "automatic backup patient missing after reopening",
    )?;
    reopened.lock()?;
    println!("Self-test da cópia automática local concluído com sucesso.");
    Ok(())
}

fn run_cross_process(temp: &TempDir) -> TestResult {
    fs::write(temp.path().join("self-test.marker"), MARKER)?;
    let executable = std::env::current_exe()?;
    let writer = Command::new(&executable)
        .arg("--self-test-child-write")
        .env(ROOT_ENV, temp.path())
        .status()?;
    ensure(writer.success(), "cross-process writer failed")?;
    // The writer has exited before the reader opens the same encrypted profile.
    let reader = Command::new(&executable)
        .arg("--self-test-child-read")
        .env(ROOT_ENV, temp.path())
        .status()?;
    ensure(reader.success(), "cross-process reader failed")?;
    println!("Self-test entre processos concluído com sucesso.");
    Ok(())
}

fn validated_child_root() -> TestResult<PathBuf> {
    let raw = std::env::var_os(ROOT_ENV).ok_or("self-test root missing")?;
    let supplied = PathBuf::from(raw);
    ensure(supplied.is_absolute(), "self-test root must be absolute")?;
    ensure(
        !fs::symlink_metadata(&supplied)?.file_type().is_symlink(),
        "self-test root must not be a symlink",
    )?;
    let root = fs::canonicalize(&supplied)?;
    let system_temp = fs::canonicalize(std::env::temp_dir())?;
    ensure(
        root.parent() == Some(system_temp.as_path())
            && root
                .file_name()
                .is_some_and(|name| name.to_string_lossy().starts_with("circulo-selftest-")),
        "self-test root must be a direct child of system Temp",
    )?;
    let marker = root.join("self-test.marker");
    ensure(
        fs::symlink_metadata(&marker)?.file_type().is_file() && fs::read(marker)? == MARKER,
        "self-test marker invalid",
    )?;
    Ok(root)
}

pub fn run_child(phase: &str) -> TestResult {
    let root = validated_child_root()?;
    match phase {
        "write" => write_cross_process(&root),
        "read" => read_cross_process(&root),
        _ => Err("invalid self-test child phase".into()),
    }
}

fn path_absent(path: &std::path::Path) -> TestResult<bool> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(false),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(true),
        Err(error) => Err(error.into()),
    }
}

fn write_cross_process(root: &std::path::Path) -> TestResult {
    let profile = root.join("process-profile");
    let archive = root.join("process-portable.circulo-backup");
    ensure(
        path_absent(&profile)? && path_absent(&archive)?,
        "cross-process fixtures already exist",
    )?;
    let vault = Vault::new(profile);
    vault.create(LOCAL_PASSWORD.into())?;
    let patient = vault.patient_create(PatientInput {
        name: SYNTHETIC_PATIENT.into(),
        life_cycle: "Adulto".into(),
        age: None,
        birth_date: None,
        self_requester: None,
        preferred_modality: "Presencial".into(),
    })?;
    let series = vault.agenda_create_series(AgendaSeriesInput {
        patient_id: patient.id,
        weekday: 4,
        start: "14:00".into(),
        end: "14:50".into(),
        frequency: "Semanal".into(),
        start_date: ORIGINAL_DATE.into(),
        end_date: None,
        modality: "Presencial".into(),
        meeting_link: None,
    })?;
    vault.agenda_reschedule(
        &series.id,
        ORIGINAL_DATE,
        RescheduleInput {
            date: EFFECTIVE_DATE.into(),
            start: "16:00".into(),
            end: "16:50".into(),
            reason: Some("Synthetic schedule change".into()),
        },
    )?;
    let indicator = vault
        .indicator_catalog()?
        .into_iter()
        .find(|definition| definition.id == "reg")
        .ok_or("existing regulation indicator is missing")?;
    let draft = vault.session_draft_start(&series.id, ORIGINAL_DATE)?;
    let saved = vault.session_draft_save(
        &draft.id,
        SessionDraftInput {
            observation: OBSERVATION.into(),
            procedures: "Synthetic procedure".into(), outcome_decision: "Synthetic outcome".into(), referral_closure: None,
            behavior_ids: vec![],
            indicators: vec![IndicatorEntry {
                id: indicator.id,
                value: Some(2),
                note: Some("Synthetic indicator note".into()),
            }],
        },
    )?;
    vault.professional_save(ProfessionalIdentity {
        display_name: "Synthetic Smoke Author".into(),
        registration: "TEST-001".into(),
    })?;
    vault.session_finalize(&saved.id)?;
    vault.backup_to_path(&archive, BACKUP_PASSWORD.into())?;
    vault.lock()?;
    Ok(())
}

fn read_cross_process(root: &std::path::Path) -> TestResult {
    let profile = root.join("process-profile");
    let archive = root.join("process-portable.circulo-backup");
    ensure(
        fs::symlink_metadata(&profile)?.file_type().is_dir()
            && fs::symlink_metadata(&archive)?.file_type().is_file(),
        "cross-process fixtures missing or linked",
    )?;
    let vault = Vault::new(profile);
    ensure(
        !vault.status()?.unlocked,
        "cross-process profile was already unlocked",
    )?;
    vault.unlock(LOCAL_PASSWORD.into())?;
    let patient = vault
        .patient_list(false)?
        .into_iter()
        .find(|item| item.name == SYNTHETIC_PATIENT)
        .ok_or("cross-process patient missing")?;
    let series = vault
        .agenda_list_series()?
        .into_iter()
        .find(|item| item.patient_id == patient.id)
        .ok_or("cross-process series missing")?;
    let session = vault
        .session_timeline(&patient.id)?
        .into_iter()
        .find(|item| item.observation == OBSERVATION)
        .ok_or("cross-process session missing")?;
    verify_records(&vault, &patient.id, &series.id, &session.id, "reg")?;
    let archive_before = fs::read(&archive)?;
    let restored_profile = root.join("process-restored-profile");
    ensure(
        path_absent(&restored_profile)?,
        "cross-process restore profile exists",
    )?;
    let restored = Vault::new(restored_profile);
    let preview = restored.select_backup(archive.clone(), BACKUP_PASSWORD.into())?;
    ensure(
        preview.schema_version == 5
            && preview.profile_state == "empty"
            && !preview.replaces_existing,
        "cross-process CBK1 v5 preview invalid",
    )?;
    restored.restore_selected(
        BACKUP_PASSWORD.into(),
        RESTORED_LOCAL_PASSWORD.into(),
        true,
        false,
    )?;
    restored.lock()?;
    let reopened = Vault::new(root.join("process-restored-profile"));
    reopened.unlock(RESTORED_LOCAL_PASSWORD.into())?;
    verify_records(&reopened, &patient.id, &series.id, &session.id, "reg")?;
    ensure(
        fs::read(&archive)? == archive_before,
        "cross-process backup changed",
    )?;
    reopened.lock()?;
    vault.lock()?;
    Ok(())
}

fn verify_records(
    vault: &Vault,
    patient_id: &str,
    series_id: &str,
    session_id: &str,
    indicator_id: &str,
) -> TestResult {
    ensure(
        vault.patient_get(patient_id)?.name == SYNTHETIC_PATIENT,
        "synthetic record was not available after reopening",
    )?;
    ensure(
        vault
            .agenda_list_series()?
            .iter()
            .any(|series| series.id == series_id),
        "weekly series was not available after reopening",
    )?;
    let occurrences = vault.agenda_occurrences(ORIGINAL_DATE, "2026-01-08")?;
    ensure(
        occurrences.iter().any(|o| {
            o.series_id == series_id
                && o.patient_id == patient_id
                && o.original_date == ORIGINAL_DATE
                && o.date == EFFECTIVE_DATE
                && o.start == "16:00"
                && o.was_rescheduled
        }),
        "rescheduled occurrence was not available after reopening",
    )?;
    ensure(
        occurrences
            .iter()
            .any(|o| o.series_id == series_id && o.original_date == "2026-01-08"),
        "weekly recurrence was not available after reopening",
    )?;
    ensure(
        vault.agenda_history()?.iter().any(|event| {
            event.series_id == series_id
                && event.action == "reschedule"
                && event.original_date == ORIGINAL_DATE
                && event.effective_date.as_deref() == Some(EFFECTIVE_DATE)
        }),
        "Agenda history was not available after reopening",
    )?;
    let timeline = vault.session_timeline(patient_id)?;
    ensure(
        timeline.iter().any(|session| {
            session.id == session_id
                && session.patient_id == patient_id
                && session.session_date == EFFECTIVE_DATE
                && session.observation == OBSERVATION
                && session.indicators.iter().any(|entry| {
                    entry.id == indicator_id
                        && entry.value == Some(2)
                        && entry.note.as_deref() == Some("Synthetic indicator note")
                })
        }),
        "finalized session and indicator were not available after reopening",
    )?;
    Ok(())
}

fn ensure(condition: bool, message: &'static str) -> TestResult {
    if condition {
        Ok(())
    } else {
        Err(message.into())
    }
}
