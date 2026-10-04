#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod native_voice;
mod vault;
#[cfg(windows)]
mod single_instance;

#[cfg(feature = "native-smoke-test")]
mod native_smoke_test;

use tauri::{webview::{PermissionKind, PermissionResponse, WebviewWindowBuilder}, Manager};
use vault::{
    AnalyticsOverview,
    AgendaEvent, AgendaOccurrence, AgendaSeries, AgendaSeriesInput, AutoBackupStatus,
    BackupPreview, BehaviorTemplate, CaseContextRevision, ClinicalPatient, ClinicalSession, IndicatorDefinition,
    PatientInput, RelatedParty, RelatedPartyInput, ProfessionalIdentity, RecoveryInventory, RescheduleInput, SessionAddendum, SessionDraft, SessionDraftInput, Vault,
    VaultStatus,
};
use zeroize::{Zeroize, Zeroizing};

#[tauri::command]
async fn voice_transcribe(
    app: tauri::AppHandle,
    samples: Vec<f32>,
    sample_rate: u32,
    patient_names: Vec<String>,
) -> Result<String, String> {
    let samples = Zeroizing::new(samples);
    let patient_names = Zeroizing::new(patient_names);
    let resources = if cfg!(debug_assertions) {
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/voice")
    } else {
        app.path()
            .resource_dir()
            .map_err(|error| {
                format!("Não foi possível localizar recursos do aplicativo: {error}")
            })?
            .join("voice")
    };
    tauri::async_runtime::spawn_blocking(move || {
        native_voice::transcribe(&resources, &samples, sample_rate, &patient_names)
    })
    .await
    .map_err(|error| format!("Falha ao iniciar reconhecimento de voz local: {error}"))?
}

#[tauri::command]
fn vault_status(vault: tauri::State<'_, Vault>) -> Result<VaultStatus, String> {
    vault.status()
}

#[tauri::command]
fn vault_create(vault: tauri::State<'_, Vault>, password: String) -> Result<(), String> {
    vault.create(password)
}

#[tauri::command]
fn vault_unlock(vault: tauri::State<'_, Vault>, password: String) -> Result<(), String> {
    vault.unlock(password)
}

#[tauri::command]
fn vault_lock(vault: tauri::State<'_, Vault>) -> Result<(), String> {
    vault.lock()
}

#[tauri::command]
fn professional_get(vault: tauri::State<'_, Vault>) -> Result<Option<ProfessionalIdentity>, String> {
    vault.professional_get()
}

#[tauri::command]
fn professional_save(vault: tauri::State<'_, Vault>, identity: ProfessionalIdentity) -> Result<ProfessionalIdentity, String> {
    vault.professional_save(identity)
}

#[tauri::command]
fn case_context_create(vault: tauri::State<'_, Vault>, patient_id: String, demand: String, objectives: String) -> Result<CaseContextRevision, String> {
    vault.case_context_create(&patient_id, demand, objectives)
}

#[tauri::command]
fn case_context_list(vault: tauri::State<'_, Vault>, patient_id: String) -> Result<Vec<CaseContextRevision>, String> {
    vault.case_context_list(&patient_id)
}

#[tauri::command]
fn patient_list(
    vault: tauri::State<'_, Vault>,
    include_archived: bool,
) -> Result<Vec<ClinicalPatient>, String> {
    vault.patient_list(include_archived)
}

#[tauri::command]
fn patient_get(vault: tauri::State<'_, Vault>, id: String) -> Result<ClinicalPatient, String> {
    vault.patient_get(&id)
}

#[tauri::command]
fn patient_create(
    vault: tauri::State<'_, Vault>,
    input: PatientInput,
) -> Result<ClinicalPatient, String> {
    vault.patient_create(input)
}

#[tauri::command]
fn patient_update(
    vault: tauri::State<'_, Vault>,
    id: String,
    revision: i64,
    input: PatientInput,
) -> Result<ClinicalPatient, String> {
    vault.patient_update(&id, revision, input)
}

#[tauri::command]
fn patient_archive(
    vault: tauri::State<'_, Vault>,
    id: String,
    revision: i64,
) -> Result<ClinicalPatient, String> {
    vault.patient_set_archived(&id, revision, true)
}

#[tauri::command]
fn patient_restore(
    vault: tauri::State<'_, Vault>,
    id: String,
    revision: i64,
) -> Result<ClinicalPatient, String> {
    vault.patient_set_archived(&id, revision, false)
}

#[tauri::command]
fn related_party_list(vault: tauri::State<'_, Vault>, patient_id: String, include_archived: bool) -> Result<Vec<RelatedParty>, String> {
    vault.related_party_list(&patient_id, include_archived)
}
#[tauri::command]
fn related_party_create(vault: tauri::State<'_, Vault>, patient_id: String, input: RelatedPartyInput) -> Result<RelatedParty, String> {
    vault.related_party_create(&patient_id, input)
}
#[tauri::command]
fn related_party_update(vault: tauri::State<'_, Vault>, patient_id: String, id: String, revision: i64, input: RelatedPartyInput) -> Result<RelatedParty, String> {
    vault.related_party_update(&patient_id, &id, revision, input)
}
#[tauri::command]
fn related_party_archive(vault: tauri::State<'_, Vault>, patient_id: String, id: String, revision: i64) -> Result<RelatedParty, String> {
    vault.related_party_set_archived(&patient_id, &id, revision, true)
}
#[tauri::command]
fn related_party_restore(vault: tauri::State<'_, Vault>, patient_id: String, id: String, revision: i64) -> Result<RelatedParty, String> {
    vault.related_party_set_archived(&patient_id, &id, revision, false)
}

#[tauri::command]
fn agenda_list_series(vault: tauri::State<'_, Vault>) -> Result<Vec<AgendaSeries>, String> {
    vault.agenda_list_series()
}

#[tauri::command]
fn agenda_occurrences(
    vault: tauri::State<'_, Vault>,
    from: String,
    to: String,
) -> Result<Vec<AgendaOccurrence>, String> {
    vault.agenda_occurrences(&from, &to)
}

#[tauri::command]
fn agenda_history(vault: tauri::State<'_, Vault>) -> Result<Vec<AgendaEvent>, String> {
    vault.agenda_history()
}

#[tauri::command]
fn agenda_create_series(
    vault: tauri::State<'_, Vault>,
    input: AgendaSeriesInput,
) -> Result<AgendaSeries, String> {
    vault.agenda_create_series(input)
}

#[tauri::command]
fn agenda_end_series(vault: tauri::State<'_, Vault>, series_id: String, effective_date: String) -> Result<AgendaSeries, String> {
    vault.agenda_end_series(&series_id, &effective_date)
}

#[tauri::command]
fn agenda_cancel(
    vault: tauri::State<'_, Vault>,
    series_id: String,
    original_date: String,
    reason: String,
) -> Result<(), String> {
    vault.agenda_cancel(&series_id, &original_date, reason)
}

#[tauri::command]
fn agenda_reschedule(
    vault: tauri::State<'_, Vault>,
    series_id: String,
    original_date: String,
    input: RescheduleInput,
) -> Result<(), String> {
    vault.agenda_reschedule(&series_id, &original_date, input)
}

#[tauri::command]
fn behavior_list(vault: tauri::State<'_, Vault>) -> Result<Vec<BehaviorTemplate>, String> {
    vault.behavior_list()
}

#[tauri::command]
fn behavior_create(
    vault: tauri::State<'_, Vault>,
    title: String,
    description: String,
) -> Result<BehaviorTemplate, String> {
    vault.behavior_create(title, description)
}

#[tauri::command]
fn behavior_update(
    vault: tauri::State<'_, Vault>,
    id: String,
    version: i64,
    title: String,
    description: String,
) -> Result<BehaviorTemplate, String> {
    vault.behavior_update(&id, version, title, description)
}

#[tauri::command]
fn session_draft_start(
    vault: tauri::State<'_, Vault>,
    series_id: String,
    original_date: String,
) -> Result<SessionDraft, String> {
    vault.session_draft_start(&series_id, &original_date)
}

#[tauri::command]
fn session_draft_list(
    vault: tauri::State<'_, Vault>,
    patient_id: String,
) -> Result<Vec<SessionDraft>, String> {
    vault.session_draft_list(&patient_id)
}

#[tauri::command]
fn session_draft_save(
    vault: tauri::State<'_, Vault>,
    id: String,
    input: SessionDraftInput,
) -> Result<SessionDraft, String> {
    vault.session_draft_save(&id, input)
}

#[tauri::command]
fn session_draft_cancel(vault: tauri::State<'_, Vault>, id: String) -> Result<(), String> {
    vault.session_draft_cancel(&id)
}

#[tauri::command]
fn session_finalize(vault: tauri::State<'_, Vault>, id: String) -> Result<ClinicalSession, String> {
    vault.session_finalize(&id)
}

#[tauri::command]
fn session_timeline(
    vault: tauri::State<'_, Vault>,
    patient_id: String,
) -> Result<Vec<ClinicalSession>, String> {
    vault.session_timeline(&patient_id)
}

#[tauri::command]
fn session_addendum_create(vault: tauri::State<'_, Vault>, session_id: String, patient_id: String, content: String) -> Result<SessionAddendum, String> {
    vault.session_addendum_create(&session_id, &patient_id, content)
}

#[tauri::command]
fn session_addendum_list(vault: tauri::State<'_, Vault>, patient_id: String) -> Result<Vec<SessionAddendum>, String> {
    vault.session_addendum_list(&patient_id)
}

#[tauri::command]
fn record_copy_export(vault: tauri::State<'_, Vault>, patient_id: String) -> Result<bool, String> {
    // Validate access and size before opening the save dialog.
    vault.record_copy_text(&patient_id)?;
    let path = rfd::FileDialog::new()
        .add_filter("Texto UTF-8", &["txt"])
        .set_file_name("circulo-registro.txt")
        .save_file();
    match path {
        Some(path) => { vault.record_copy_to_path(&patient_id, &path)?; Ok(true) }
        None => Ok(false),
    }
}

#[tauri::command]
fn backup_create(vault: tauri::State<'_, Vault>, mut password: String) -> Result<bool, String> {
    let path = rfd::FileDialog::new()
        .add_filter("Backup cifrado Círculo", &["circulo-backup"])
        .set_file_name("circulo.circulo-backup")
        .save_file();
    match path {
        Some(path) => {
            vault.backup_to_path(&path, password)?;
            Ok(true)
        }
        None => {
            password.zeroize();
            Ok(false)
        }
    }
}

#[tauri::command]
fn auto_backup_status(vault: tauri::State<'_, Vault>) -> Result<AutoBackupStatus, String> {
    vault.auto_backup_status()
}

#[tauri::command]
fn auto_backup_retry(vault: tauri::State<'_, Vault>) -> Result<AutoBackupStatus, String> {
    vault.auto_backup_retry()
}

#[tauri::command]
fn auto_backup_validate(vault: tauri::State<'_, Vault>, password: String) -> Result<bool, String> {
    vault.validate_auto_backup(password)
}

#[tauri::command]
fn auto_backup_restore(
    vault: tauri::State<'_, Vault>,
    password: String,
    confirmed: bool,
) -> Result<(), String> {
    vault.restore_auto_backup(password, confirmed)
}

#[tauri::command]
fn backup_select(
    vault: tauri::State<'_, Vault>,
    mut password: String,
) -> Result<Option<BackupPreview>, String> {
    let path = rfd::FileDialog::new()
        .add_filter("Backup cifrado Círculo", &["circulo-backup"])
        .pick_file();
    match path {
        Some(path) => vault.select_backup(path, password).map(Some),
        None => {
            password.zeroize();
            vault.clear_selected_backup()?;
            Ok(None)
        }
    }
}

#[tauri::command]
fn backup_restore(
    vault: tauri::State<'_, Vault>,
    backup_password: String,
    local_password: String,
    confirmed: bool,
    quarantine_confirmed: bool,
) -> Result<(), String> {
    vault.restore_selected(
        backup_password,
        local_password,
        confirmed,
        quarantine_confirmed,
    )
}

#[tauri::command]
fn indicator_catalog(vault: tauri::State<'_, Vault>) -> Result<Vec<IndicatorDefinition>, String> {
    vault.indicator_catalog()
}

#[tauri::command]
fn recovery_inventory(vault: tauri::State<'_, Vault>) -> Result<RecoveryInventory, String> {
    vault.recovery_inventory()
}

#[tauri::command]
fn analytics_overview(
    vault: tauri::State<'_, Vault>,
    from: String,
    to: String,
    patient_id: Option<String>,
) -> Result<AnalyticsOverview, String> {
    vault.analytics_overview(&from, &to, patient_id.as_deref())
}

fn main() {
    #[cfg(feature = "native-smoke-test")]
    {
        let args: Vec<String> = std::env::args().skip(1).collect();
        let smoke = match args.as_slice() {
            [flag] if flag == "--self-test" => Some((native_smoke_test::run(), true)),
            [flag] if flag == "--self-test-child-write" => {
                Some((native_smoke_test::run_child("write"), false))
            }
            [flag] if flag == "--self-test-child-read" => {
                Some((native_smoke_test::run_child("read"), false))
            }
            _ => None,
        };
        if let Some((result, top_level)) = smoke {
            if let Err(error) = result {
                eprintln!("Self-test nativo falhou: {error}");
                std::process::exit(1);
            }
            if top_level {
                println!("Self-test nativo concluído com sucesso.");
            }
            return;
        }
        if args.iter().any(|arg| arg.starts_with("--self-test")) {
            eprintln!("Subcomando de self-test inválido.");
            std::process::exit(2);
        }
    }

    #[cfg(windows)]
    let _instance_guard = single_instance::Guard::acquire().unwrap_or_else(|error| {
        eprintln!("{error}");
        single_instance::show_startup_error(&error);
        std::process::exit(1);
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let dir = app.path().app_local_data_dir()?;
            app.manage(Vault::new(dir));
            let main_window = app
                .config()
                .app
                .windows
                .iter()
                .find(|window| window.label == "main")
                .ok_or_else(|| {
                    std::io::Error::new(
                        std::io::ErrorKind::NotFound,
                        "A janela principal do Círculo não foi configurada",
                    )
                })?;
            WebviewWindowBuilder::from_config(app, main_window)?
                .on_permission_request(|_, permission| match permission {
                    // A captura só começa após a pessoa apertar “Ditar comando”.
                    // Default mantém o prompt do WebView2 em vez de conceder
                    // acesso silencioso ao microfone.
                    PermissionKind::Microphone => PermissionResponse::Default,
                    _ => PermissionResponse::Deny,
                })
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            vault_status,
            professional_get,
            professional_save,
            case_context_create,
            case_context_list,
            vault_create,
            vault_unlock,
            vault_lock,
            patient_list,
            patient_get,
            patient_create,
            patient_update,
            patient_archive,
            patient_restore,
            related_party_list,
            related_party_create,
            related_party_update,
            related_party_archive,
            related_party_restore,
            agenda_list_series,
            agenda_occurrences,
            agenda_history,
            agenda_create_series,
            agenda_end_series,
            agenda_cancel,
            agenda_reschedule,
            behavior_list,
            behavior_create,
            behavior_update,
            session_draft_start,
            session_draft_list,
            session_draft_save,
            session_draft_cancel,
            session_finalize,
            session_timeline,
            session_addendum_create,
            session_addendum_list,
            record_copy_export,
            backup_create,
            auto_backup_status,
            auto_backup_retry,
            auto_backup_validate,
            auto_backup_restore,
            backup_select,
            backup_restore,
            indicator_catalog,
            recovery_inventory,
            analytics_overview,
            voice_transcribe
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar Círculo")
}
