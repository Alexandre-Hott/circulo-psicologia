//! Native local vault backend. This is a fresh reconstruction, not a byte-faithful recovery.
mod agenda;
mod analytics;
mod backup;
mod crypto;
mod daily;
mod db;
mod export;
mod indicators;
mod recovery;
mod related_parties;
mod sessions;
mod types;

use rusqlite::Connection;
use std::{
    fs,
    path::{Path, PathBuf},
    ops::Deref,
    sync::{Mutex, MutexGuard},
};
pub use types::*;
pub use analytics::AnalyticsOverview;
pub use sessions::SessionAddendum;
use zeroize::{Zeroize, Zeroizing};

const DB_NAME: &str = "circulo.db";
const KEY_NAME: &str = "vault.key";

pub struct Vault {
    root: PathBuf,
    state: Mutex<State>,
    operation: Mutex<()>,
}
struct VaultConnection<'a> {
    conn: Connection,
    _operation: MutexGuard<'a, ()>,
}
impl Deref for VaultConnection<'_> {
    type Target = Connection;
    fn deref(&self) -> &Connection { &self.conn }
}
struct State {
    conn: Option<Connection>,
    db_key: Option<Vec<u8>>,
    selected: Option<PathBuf>,
    auto_error: Option<String>,
    unlocked_day: Option<String>,
}

impl Vault {
    pub fn record_copy_text(&self, patient_id: &str) -> Result<String, String> {
        let c = self.open_conn()?;
        export::render(&c, patient_id)
    }
    pub fn record_copy_to_path(&self, patient_id: &str, path: &Path) -> Result<(), String> {
        self.record_copy_with(patient_id, |text| export::write_new(path, text))
    }
    fn record_copy_with(&self, patient_id: &str, publish: impl FnOnce(&str) -> Result<(), String>) -> Result<(), String> {
        // VaultConnection owns the operation mutex through publication. lock()
        // cannot return while this copy is still being written.
        let c = self.open_conn()?;
        let text = export::render(&c, patient_id)?;
        publish(&text)
    }
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            operation: Mutex::new(()),
            state: Mutex::new(State {
                conn: None,
                db_key: None,
                selected: None,
                auto_error: None,
                unlocked_day: None,
            }),
        }
    }
    fn err(_: impl std::fmt::Debug) -> String {
        "Operação não concluída. Verifique os dados e tente novamente.".into()
    }
    fn lock_state(&self) -> Result<std::sync::MutexGuard<'_, State>, String> {
        self.state.lock().map_err(|_| "Cofre indisponível.".into())
    }
    fn lock_operation(&self) -> Result<MutexGuard<'_, ()>, String> {
        self.operation.lock().map_err(|_| "Cofre indisponível.".into())
    }
    fn open_conn(&self) -> Result<VaultConnection<'_>, String> {
        let operation = self.lock_operation()?;
        self.expire_day()?;
        let key = Zeroizing::new(
            self.lock_state()?
                .db_key
                .clone()
                .ok_or("Cofre bloqueado.")?,
        );
        let c = Connection::open(self.root.join(DB_NAME)).map_err(Self::err)?;
        db::configure(&c, &key).map_err(Self::err)?;
        Ok(VaultConnection { conn: c, _operation: operation })
    }
    fn mutate<T>(&self, f: impl FnOnce(&Connection) -> Result<T, String>) -> Result<T, String> {
        let c = self.open_conn()?;
        let tx = c.unchecked_transaction().map_err(Self::err)?;
        let value = f(&tx)?;
        tx.commit().map_err(Self::err)?;
        if self.auto_backup_inner().is_err() {
            if let Ok(mut s) = self.state.lock() {
                s.auto_error = Some("Cópia automática pendente; use Tentar novamente.".into());
            }
        }
        drop(c);
        Ok(value)
    }
    fn auto_backup_inner(&self) -> Result<(), String> {
        let key = Zeroizing::new(
            self.lock_state()?
                .db_key
                .clone()
                .ok_or("Cofre bloqueado.")?,
        );
        backup::create_local_snapshot(&self.root, &key)
            .map_err(|_| "Cópia automática pendente.".to_string())
    }
    pub fn status(&self) -> Result<VaultStatus, String> {
        let _operation = self.lock_operation()?;
        fs::create_dir_all(&self.root).map_err(Self::err)?;
        self.expire_day()?;
        self.try_daily_unlock();
        let db = self.root.join(DB_NAME).exists();
        let key = self.root.join(KEY_NAME).exists();
        Ok(VaultStatus {
            initialized: db && key,
            unlocked: self.lock_state()?.db_key.is_some(),
            profile_state: if db && key {
                "complete"
            } else if db || key {
                "incomplete"
            } else {
                "empty"
            }
            .into(),
        })
    }
    pub fn create(&self, mut password: String) -> Result<(), String> {
        let _operation = self.lock_operation()?;
        let result = (|| {
            if password.chars().count() < 12 {
                return Err("A senha deve ter no mínimo 12 caracteres.".into());
            }
            fs::create_dir_all(&self.root).map_err(Self::err)?;
            if self.root.join(DB_NAME).exists() || self.root.join(KEY_NAME).exists() {
                return Err("O perfil local já existe ou está incompleto.".into());
            }
            let (envelope, key) = crypto::new_envelope(&password)
                .map_err(|_| "Não foi possível criar o cofre.".to_string())?;
            let mut key = Zeroizing::new(key);
            let dbpath = self.root.join(DB_NAME);
            let c = Connection::open(&dbpath).map_err(Self::err)?;
            db::configure(&c, &key).map_err(Self::err)?;
            db::migrate(&c).map_err(Self::err)?;
            drop(c);
            crypto::atomic_write(&self.root.join(KEY_NAME), &envelope)
                .map_err(|_| "Não foi possível criar o cofre.".to_string())?;
            let mut s = self.lock_state()?;
            s.db_key = Some(std::mem::take(&mut *key));
            s.unlocked_day = Some(daily::today());
            s.conn = None;
            let _ = daily::save(&self.root, &envelope, s.db_key.as_ref().unwrap());
            Ok(())
        })();
        password.zeroize();
        result
    }
    pub fn unlock(&self, mut password: String) -> Result<(), String> {
        let _operation = self.lock_operation()?;
        self.unlock_inner(&mut password)
    }
    fn unlock_inner(&self, password: &mut String) -> Result<(), String> {
        let result = (|| {
            let envelope = fs::read(self.root.join(KEY_NAME))
                .map_err(|_| "Senha incorreta ou cofre indisponível.".to_string())?;
            let mut key = Zeroizing::new(
                crypto::open_envelope(&password, &envelope)
                    .map_err(|_| "Senha incorreta ou cofre indisponível.".to_string())?,
            );
            backup::recover_interrupted_restore(&self.root, &key)?;
            let c = Connection::open(self.root.join(DB_NAME))
                .map_err(|_| "Senha incorreta ou cofre indisponível.".to_string())?;
            db::configure(&c, &key)
                .map_err(|_| "Senha incorreta ou cofre indisponível.".to_string())?;
            let schema = db::schema_version(&c).map_err(|_| {
                "Não foi possível validar o cofre; o arquivo original foi preservado.".to_string()
            })?;
            if (1..5).contains(&schema) {
                return Err(format!(
                    "Este cofre usa o esquema legado v{schema}, cuja migração não está validada. O arquivo original foi preservado e não foi alterado."
                ));
            }
            db::migrate(&c).map_err(|_| "Não foi possível validar o cofre.".to_string())?;
            let mut s = self.lock_state()?;
            s.db_key = Some(std::mem::take(&mut *key));
            s.unlocked_day = Some(daily::today());
            s.conn = None;
            let _ = daily::save(&self.root, &envelope, s.db_key.as_ref().unwrap());
            Ok(())
        })();
        password.zeroize();
        result
    }
    pub fn lock(&self) -> Result<(), String> {
        let _operation = self.lock_operation()?;
        daily::revoke(&self.root).map_err(|_| "Não foi possível revogar o desbloqueio diário; o cofre permanece aberto.".to_string())?;
        self.lock_inner()
    }
    fn lock_inner(&self) -> Result<(), String> {
        let mut s = self.lock_state()?;
        s.conn = None;
        if let Some(mut k) = s.db_key.take() {
            k.zeroize()
        }
        s.selected = None;
        s.unlocked_day = None;
        Ok(())
    }
    fn expire_day(&self) -> Result<(), String> {
        let expired = self.lock_state()?.unlocked_day.as_deref().is_some_and(|d| d != daily::today());
        if expired {
            daily::revoke(&self.root).map_err(|_| "Não foi possível revogar o desbloqueio diário; acesso ao cofre suspenso.".to_string())?;
            self.lock_inner()?;
        }
        Ok(())
    }
    fn try_daily_unlock(&self) {
        if self.lock_state().map_or(true, |s| s.db_key.is_some()) { return; }
        let Ok(envelope) = fs::read(self.root.join(KEY_NAME)) else { return; };
        let Some(key) = daily::load(&self.root, &envelope) else { return; };
        if !self.root.join(DB_NAME).is_file() { return; }
        if backup::recover_interrupted_restore(&self.root, &key).is_err() { return; }
        let Ok(c) = Connection::open(self.root.join(DB_NAME)) else { return; };
        if db::configure(&c, &key).is_err() { return; }
        let Ok(schema) = db::schema_version(&c) else { return; };
        if schema < 5 || db::migrate(&c).is_err() { return; }
        if let Ok(mut s) = self.lock_state() {
            s.db_key = Some(key.to_vec());
            s.unlocked_day = Some(daily::today());
        }
    }
    pub fn patient_list(&self, archived: bool) -> Result<Vec<ClinicalPatient>, String> {
        let c = self.open_conn()?;
        db::patients_list(&c, archived)
    }
    pub fn patient_get(&self, id: &str) -> Result<ClinicalPatient, String> {
        let c = self.open_conn()?;
        db::patient_get(&c, id)
    }
    pub fn patient_create(&self, input: PatientInput) -> Result<ClinicalPatient, String> {
        self.mutate(|c| db::patient_create(c, input))
    }
    pub fn patient_update(
        &self,
        id: &str,
        rev: i64,
        input: PatientInput,
    ) -> Result<ClinicalPatient, String> {
        let id = id.to_string();
        self.mutate(|c| db::patient_update(c, &id, rev, input))
    }
    pub fn patient_set_archived(
        &self,
        id: &str,
        rev: i64,
        archived: bool,
    ) -> Result<ClinicalPatient, String> {
        let id = id.to_string();
        self.mutate(|c| db::patient_archive(c, &id, rev, archived))
    }
    pub fn related_party_list(&self, patient_id: &str, archived: bool) -> Result<Vec<RelatedParty>, String> {
        let c = self.open_conn()?;
        related_parties::list(&c, patient_id, archived)
    }
    pub fn related_party_create(&self, patient_id: &str, input: RelatedPartyInput) -> Result<RelatedParty, String> {
        self.mutate(|c| related_parties::create(c, patient_id, input))
    }
    pub fn related_party_update(&self, patient_id: &str, id: &str, revision: i64, input: RelatedPartyInput) -> Result<RelatedParty, String> {
        self.mutate(|c| related_parties::update(c, patient_id, id, revision, input))
    }
    pub fn related_party_set_archived(&self, patient_id: &str, id: &str, revision: i64, archived: bool) -> Result<RelatedParty, String> {
        self.mutate(|c| related_parties::set_archived(c, patient_id, id, revision, archived))
    }
    pub fn agenda_list_series(&self) -> Result<Vec<AgendaSeries>, String> {
        let c = self.open_conn()?;
        agenda::list_series(&c)
    }
    pub fn agenda_occurrences(
        &self,
        from: &str,
        to: &str,
    ) -> Result<Vec<AgendaOccurrence>, String> {
        let c = self.open_conn()?;
        agenda::occurrences(&c, from, to)
    }
    pub fn agenda_history(&self) -> Result<Vec<AgendaEvent>, String> {
        let c = self.open_conn()?;
        agenda::history(&c)
    }
    pub fn agenda_create_series(&self, input: AgendaSeriesInput) -> Result<AgendaSeries, String> {
        self.mutate(|c| agenda::create_series(c, input))
    }
    pub fn agenda_end_series(&self, series_id: &str, effective_date: &str) -> Result<AgendaSeries, String> {
        self.mutate(|c| agenda::end_series(c, series_id, effective_date))
    }
    pub fn agenda_cancel(&self, s: &str, d: &str, r: String) -> Result<(), String> {
        let s = s.to_string();
        let d = d.to_string();
        self.mutate(|c| agenda::cancel(c, &s, &d, r))
    }
    pub fn agenda_reschedule(&self, s: &str, d: &str, i: RescheduleInput) -> Result<(), String> {
        let s = s.to_string();
        let d = d.to_string();
        self.mutate(|c| agenda::reschedule(c, &s, &d, i))
    }
    pub fn behavior_list(&self) -> Result<Vec<BehaviorTemplate>, String> {
        let c = self.open_conn()?;
        sessions::behavior_list(&c)
    }
    pub fn professional_get(&self) -> Result<Option<ProfessionalIdentity>, String> {
        let c = self.open_conn()?;
        sessions::professional_get(&c)
    }
    pub fn professional_save(&self, identity: ProfessionalIdentity) -> Result<ProfessionalIdentity, String> {
        self.mutate(|c| sessions::professional_save(c, identity))
    }
    pub fn case_context_create(&self, patient_id: &str, demand: String, objectives: String) -> Result<CaseContextRevision, String> {
        let patient_id = patient_id.to_string();
        self.mutate(|c| sessions::case_context_create(c, &patient_id, demand, objectives))
    }
    pub fn case_context_list(&self, patient_id: &str) -> Result<Vec<CaseContextRevision>, String> {
        let c = self.open_conn()?;
        sessions::case_context_list(&c, patient_id)
    }
    pub fn behavior_create(&self, t: String, d: String) -> Result<BehaviorTemplate, String> {
        self.mutate(|c| sessions::behavior_create(c, t, d))
    }
    pub fn behavior_update(
        &self,
        id: &str,
        v: i64,
        t: String,
        d: String,
    ) -> Result<BehaviorTemplate, String> {
        let id = id.to_string();
        self.mutate(|c| sessions::behavior_update(c, &id, v, t, d))
    }
    pub fn session_draft_start(&self, s: &str, d: &str) -> Result<SessionDraft, String> {
        let s = s.to_string();
        let d = d.to_string();
        self.mutate(|c| sessions::draft_start(c, &s, &d))
    }
    pub fn session_draft_list(&self, p: &str) -> Result<Vec<SessionDraft>, String> {
        let c = self.open_conn()?;
        sessions::draft_list(&c, p)
    }
    pub fn session_draft_save(
        &self,
        id: &str,
        i: SessionDraftInput,
    ) -> Result<SessionDraft, String> {
        let id = id.to_string();
        self.mutate(|c| sessions::draft_save(c, &id, i))
    }
    pub fn session_draft_cancel(&self, id: &str) -> Result<(), String> {
        let id = id.to_string();
        self.mutate(|c| sessions::draft_cancel(c, &id))
    }
    pub fn session_finalize(&self, id: &str) -> Result<ClinicalSession, String> {
        let id = id.to_string();
        self.mutate(|c| sessions::finalize(c, &id))
    }
    pub fn session_timeline(&self, p: &str) -> Result<Vec<ClinicalSession>, String> {
        let c = self.open_conn()?;
        sessions::timeline(&c, p)
    }
    pub fn analytics_overview(&self, from: &str, to: &str, patient_id: Option<&str>) -> Result<AnalyticsOverview, String> {
        let input = analytics::validate(from, to, patient_id)?;
        let c = self.open_conn()?;
        c.execute_batch("PRAGMA query_only=ON")
            .map_err(|_| "Não foi possível consultar análises.".to_string())?;
        analytics::overview(&c, &input)
    }
    pub fn session_addendum_create(&self, session_id: &str, patient_id: &str, content: String) -> Result<SessionAddendum, String> {
        self.mutate(|c| sessions::addendum_create(c, session_id, patient_id, content))
    }
    pub fn session_addendum_list(&self, patient_id: &str) -> Result<Vec<SessionAddendum>, String> {
        let c = self.open_conn()?;
        sessions::addendum_list(&c, patient_id)
    }
    pub fn backup_to_path(&self, path: &Path, password: String) -> Result<(), String> {
        let _operation = self.lock_operation()?;
        let key = Zeroizing::new(
            self.lock_state()?
                .db_key
                .clone()
                .ok_or("Cofre bloqueado.")?,
        );
        backup::export(&self.root, path, &key, password)
    }
    pub fn select_backup(
        &self,
        path: PathBuf,
        mut password: String,
    ) -> Result<BackupPreview, String> {
        let _operation = self.lock_operation()?;
        let result = backup::inspect(&path, &password);
        password.zeroize();
        let mut p = result?;
        let db_exists = self.root.join(DB_NAME).exists();
        let key_exists = self.root.join(KEY_NAME).exists();
        p.replaces_existing = db_exists && key_exists;
        if p.schema_version != 5 {
            p.profile_state = "legacy-unsupported".into();
        } else if !p.replaces_existing {
            p.profile_state = if db_exists
                || key_exists
                || backup::empty_profile_directory(&self.root).is_err()
            {
                "incomplete-profile-unsupported".into()
            } else {
                "empty".into()
            };
        }
        self.lock_state()?.selected = Some(path);
        Ok(p)
    }
    pub fn clear_selected_backup(&self) -> Result<(), String> {
        let _operation = self.lock_operation()?;
        self.lock_state()?.selected = None;
        Ok(())
    }
    pub fn restore_selected(
        &self,
        mut backup_password: String,
        mut local_password: String,
        confirmed: bool,
        quarantine_confirmed: bool,
    ) -> Result<(), String> {
        let _operation = self.lock_operation()?;
        let p = self
            .lock_state()?
            .selected
            .clone()
            .ok_or("Nenhum backup selecionado.")?;
        let mut key = self.lock_state()?.db_key.clone();
        let db_exists = self.root.join(DB_NAME).exists();
        let key_exists = self.root.join(KEY_NAME).exists();
        // Revocation must succeed before either restore path can publish data.
        if let Err(_) = daily::revoke(&self.root) {
            if let Some(copy) = key.as_mut() { copy.zeroize(); }
            backup_password.zeroize();
            local_password.zeroize();
            return Err("Não foi possível revogar o desbloqueio diário; nenhum backup foi restaurado.".into());
        }
        let result = if !db_exists && !key_exists && key.is_none() {
            backup::restore_empty(&self.root, &p, &backup_password, &local_password, confirmed)
        } else if db_exists && key_exists {
            backup::restore(
                &self.root,
                &p,
                &backup_password,
                &local_password,
                confirmed,
                quarantine_confirmed,
                key.as_deref(),
            )
        } else {
            Err("O perfil local está incompleto; nenhum arquivo foi alterado.".into())
        };
        if let Some(copy) = key.as_mut() {
            copy.zeroize();
        }
        backup_password.zeroize();
        if let Err(e) = result {
            local_password.zeroize();
            return Err(e);
        }
        self.lock_inner()?;
        self.unlock_inner(&mut local_password)
    }
    pub fn auto_backup_status(&self) -> Result<AutoBackupStatus, String> {
        let _operation = self.lock_operation()?;
        self.auto_backup_status_inner()
    }
    fn auto_backup_status_inner(&self) -> Result<AutoBackupStatus, String> {
        let s = self.lock_state()?;
        let p = self.root.join("auto-backup.db");
        Ok(AutoBackupStatus {
            dirty: s.auto_error.is_some(),
            error: s.auto_error.clone(),
            available: s.db_key.is_some(),
            present: p.exists(),
            key_envelope_present: self.root.join(KEY_NAME).exists(),
            last_verified_at: None,
        })
    }
    pub fn auto_backup_retry(&self) -> Result<AutoBackupStatus, String> {
        let _operation = self.lock_operation()?;
        self.auto_backup_inner()?;
        self.lock_state()?.auto_error = None;
        self.auto_backup_status_inner()
    }
    pub fn validate_auto_backup(&self, mut password: String) -> Result<bool, String> {
        let _operation = self.lock_operation()?;
        let result = (|| {
            let envelope = fs::read(self.root.join(KEY_NAME))
                .map_err(|_| "Cópia automática indisponível.".to_string())?;
            let key = Zeroizing::new(
                crypto::open_envelope(&password, &envelope)
                    .map_err(|_| "Senha incorreta ou cópia inválida.".to_string())?,
            );
            let valid = backup::validate_local(&self.root, &key).is_ok();
            Ok(valid)
        })();
        password.zeroize();
        result
    }
    pub fn restore_auto_backup(&self, mut password: String, confirmed: bool) -> Result<(), String> {
        let _operation = self.lock_operation()?;
        let result = (|| {
            if !confirmed {
                return Err("Confirmação necessária.".into());
            }
            let envelope = fs::read(self.root.join(KEY_NAME))
                .map_err(|_| "Cópia automática indisponível.".to_string())?;
            let mut key = Zeroizing::new(
                crypto::open_envelope(&password, &envelope)
                    .map_err(|_| "Senha incorreta ou cópia inválida.".to_string())?,
            );
            daily::revoke(&self.root).map_err(|_| "Não foi possível revogar o desbloqueio diário.".to_string())?;
            backup::restore_local(&self.root, &key)?;
            let c = Connection::open(self.root.join(DB_NAME)).map_err(Self::err)?;
            db::configure(&c, &key).map_err(Self::err)?;
            db::migrate(&c).map_err(|_| "Cópia automática inválida.".to_string())?;
            let mut state = self.lock_state()?;
            state.db_key = Some(std::mem::take(&mut *key));
            state.unlocked_day = Some(daily::today());
            state.selected = None;
            Ok(())
        })();
        password.zeroize();
        result
    }
    pub fn indicator_catalog(&self) -> Result<Vec<IndicatorDefinition>, String> {
        Ok(types::indicator_catalog())
    }
    pub fn recovery_inventory(&self) -> Result<RecoveryInventory, String> {
        let _operation = self.lock_operation()?;
        let key = Zeroizing::new(
            self.lock_state()?
                .db_key
                .clone()
                .ok_or("Cofre bloqueado.")?,
        );
        recovery::inventory(&self.root, &key)
    }
}

#[cfg(test)]
mod tests;
