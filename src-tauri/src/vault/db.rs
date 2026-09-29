use super::types::*;
use rand::{rngs::OsRng, RngCore};
use rusqlite::{params, Connection};
use std::path::Path;
use zeroize::Zeroizing;

pub fn configure(c: &Connection, key: &[u8]) -> rusqlite::Result<()> {
    let h = Zeroizing::new(hex::encode(key));
    let command = Zeroizing::new(format!("PRAGMA key = \"x'{}'\"; PRAGMA cipher_memory_security = ON; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;", &*h));
    c.execute_batch(&command)?;
    c.query_row("SELECT count(*) FROM sqlite_master", [], |r| {
        r.get::<_, i64>(0)
    })?;
    Ok(())
}
pub fn migrate(c: &Connection) -> rusqlite::Result<()> {
    let v: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if v > 5 || (1..5).contains(&v) {
        return Err(rusqlite::Error::InvalidQuery);
    }
    if v == 0 {
        let tables: i64 = c.query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
            [],
            |r| r.get(0),
        )?;
        if tables != 0 {
            return Err(rusqlite::Error::InvalidQuery);
        }
    }
    let tx = c.unchecked_transaction()?;
    if v < 1 {
        tx.execute_batch("CREATE TABLE patients(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,name TEXT NOT NULL,life_cycle TEXT NOT NULL,age INTEGER,preferred_modality TEXT NOT NULL,archived_at TEXT); CREATE TABLE behavior_templates(id TEXT PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL,version INTEGER NOT NULL,active INTEGER NOT NULL DEFAULT 1); CREATE TABLE agenda_series(id TEXT PRIMARY KEY,patient_id TEXT NOT NULL REFERENCES patients(id),weekday INTEGER NOT NULL,start TEXT NOT NULL,end TEXT NOT NULL,frequency TEXT NOT NULL,start_date TEXT NOT NULL,end_date TEXT,modality TEXT NOT NULL,meeting_link TEXT); CREATE TABLE agenda_events(id TEXT PRIMARY KEY,series_id TEXT NOT NULL,action TEXT NOT NULL,original_date TEXT NOT NULL,effective_date TEXT,start TEXT,end TEXT,reason TEXT); CREATE TABLE session_drafts(id TEXT PRIMARY KEY,patient_id TEXT NOT NULL,series_id TEXT NOT NULL,original_date TEXT NOT NULL,observation TEXT NOT NULL,behavior_ids TEXT NOT NULL,indicators TEXT NOT NULL); CREATE TABLE sessions(id TEXT PRIMARY KEY,patient_id TEXT NOT NULL,session_date TEXT NOT NULL,start TEXT NOT NULL,end TEXT NOT NULL,modality TEXT NOT NULL,was_rescheduled INTEGER NOT NULL,observation TEXT NOT NULL,behaviors TEXT NOT NULL,indicators TEXT NOT NULL,series_id TEXT,original_date TEXT); CREATE UNIQUE INDEX one_session_per_occurrence ON sessions(series_id,original_date) WHERE series_id IS NOT NULL; PRAGMA user_version=5;")?;
    }
    tx.execute_batch("CREATE TABLE IF NOT EXISTS session_addenda(id TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES sessions(id),patient_id TEXT NOT NULL REFERENCES patients(id),created_at TEXT NOT NULL,content TEXT NOT NULL CHECK(length(content)>0 AND length(content)<=4000)); CREATE INDEX IF NOT EXISTS session_addenda_by_session ON session_addenda(session_id,created_at,id); CREATE TRIGGER IF NOT EXISTS session_addenda_no_update BEFORE UPDATE ON session_addenda BEGIN SELECT RAISE(ABORT,'Adendo imutável'); END; CREATE TRIGGER IF NOT EXISTS session_addenda_no_delete BEFORE DELETE ON session_addenda BEGIN SELECT RAISE(ABORT,'Adendo imutável'); END;")?;
    tx.execute_batch("CREATE TABLE IF NOT EXISTS professional_identity(id INTEGER PRIMARY KEY CHECK(id=1),display_name TEXT NOT NULL,registration TEXT NOT NULL);")?;
    tx.execute_batch("CREATE TABLE IF NOT EXISTS case_context_revisions(id TEXT PRIMARY KEY,patient_id TEXT NOT NULL REFERENCES patients(id),recorded_at TEXT NOT NULL,demand TEXT NOT NULL CHECK(length(demand)>0 AND length(demand)<=4000),objectives TEXT NOT NULL CHECK(length(objectives)>0 AND length(objectives)<=4000),author_name TEXT,author_registration TEXT); CREATE INDEX IF NOT EXISTS case_context_by_patient ON case_context_revisions(patient_id,recorded_at DESC,id DESC); CREATE TRIGGER IF NOT EXISTS case_context_no_update BEFORE UPDATE ON case_context_revisions BEGIN SELECT RAISE(ABORT,'Contexto imutável'); END; CREATE TRIGGER IF NOT EXISTS case_context_no_delete BEFORE DELETE ON case_context_revisions BEGIN SELECT RAISE(ABORT,'Contexto imutável'); END;")?;
    let patient_columns: Vec<String> = tx.prepare("PRAGMA table_info(patients)")?.query_map([], |r| r.get(1))?.collect::<Result<_, _>>()?;
    if !patient_columns.iter().any(|n| n == "birth_date") { tx.execute_batch("ALTER TABLE patients ADD COLUMN birth_date TEXT")?; }
    if !patient_columns.iter().any(|n| n == "self_requester") { tx.execute_batch("ALTER TABLE patients ADD COLUMN self_requester TEXT")?; }
    tx.execute_batch("CREATE TABLE IF NOT EXISTS related_parties(id TEXT PRIMARY KEY,patient_id TEXT NOT NULL REFERENCES patients(id),revision INTEGER NOT NULL,name TEXT NOT NULL,relation TEXT NOT NULL,requester INTEGER NOT NULL CHECK(requester IN (0,1)),legal_guardian INTEGER NOT NULL CHECK(legal_guardian IN (0,1)),administrative_contact INTEGER NOT NULL CHECK(administrative_contact IN (0,1)),archived_at TEXT); CREATE INDEX IF NOT EXISTS related_parties_patient ON related_parties(patient_id,archived_at,name,id);")?;
    let mut columns = tx.prepare("PRAGMA table_info(sessions)")?;
    let names: Vec<String> = columns.query_map([], |r| r.get(1))?.collect::<Result<_, _>>()?;
    drop(columns);
    for (name, sql) in [("author_name", "ALTER TABLE sessions ADD COLUMN author_name TEXT"), ("author_registration", "ALTER TABLE sessions ADD COLUMN author_registration TEXT"), ("recorded_at", "ALTER TABLE sessions ADD COLUMN recorded_at TEXT")] {
        if !names.iter().any(|column| column == name) { tx.execute_batch(sql)?; }
    }
    for (table, fields) in [
        ("session_drafts", [("procedures", "TEXT NOT NULL DEFAULT ''"), ("outcome_decision", "TEXT NOT NULL DEFAULT ''"), ("referral_closure", "TEXT")]),
        ("sessions", [("procedures", "TEXT"), ("outcome_decision", "TEXT"), ("referral_closure", "TEXT")]),
    ] {
        if table == "session_drafts" && v == 5 && tx.query_row("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='session_drafts'", [], |r| r.get::<_, i64>(0))? == 0 { continue; }
        let mut statement = tx.prepare(&format!("PRAGMA table_info({table})"))?;
        let existing: Vec<String> = statement.query_map([], |r| r.get(1))?.collect::<Result<_, _>>()?;
        drop(statement);
        for (field, definition) in fields {
            if !existing.iter().any(|name| name == field) {
                tx.execute_batch(&format!("ALTER TABLE {table} ADD COLUMN {field} {definition}"))?;
            }
        }
    }
    tx.execute_batch("CREATE TRIGGER IF NOT EXISTS sessions_no_update BEFORE UPDATE ON sessions BEGIN SELECT RAISE(ABORT,'Sessão imutável'); END; CREATE TRIGGER IF NOT EXISTS sessions_no_delete BEFORE DELETE ON sessions BEGIN SELECT RAISE(ABORT,'Sessão imutável'); END;")?;
    tx.commit()?;
    let cipher_rows = check_rows(c, "PRAGMA cipher_integrity_check")?;
    let sqlite_rows = check_rows(c, "PRAGMA integrity_check")?;
    if !valid_cipher_integrity_rows(&cipher_rows) || !valid_sqlite_integrity_rows(&sqlite_rows) {
        return Err(rusqlite::Error::InvalidQuery);
    }
    Ok(())
}

pub fn schema_version(c: &Connection) -> rusqlite::Result<i64> {
    c.query_row("PRAGMA user_version", [], |r| r.get(0))
}

fn check_rows(c: &Connection, sql: &str) -> rusqlite::Result<Vec<String>> {
    let mut statement = c.prepare(sql)?;
    let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
    rows.collect()
}

fn valid_cipher_integrity_rows(rows: &[String]) -> bool {
    rows.is_empty() || rows == ["ok"]
}

fn valid_sqlite_integrity_rows(rows: &[String]) -> bool {
    rows == ["ok"]
}
pub fn random_id() -> String {
    let mut b = [0; 16];
    OsRng.fill_bytes(&mut b);
    hex::encode(b)
}
pub fn patients_list(c: &Connection, archived: bool) -> Result<Vec<ClinicalPatient>, String> {
    let mut q=c.prepare("SELECT id,revision,name,life_cycle,age,preferred_modality,archived_at,birth_date,self_requester FROM patients WHERE (?1=1 OR archived_at IS NULL) ORDER BY name,id").map_err(|_|"Não foi possível consultar pacientes.".to_string())?;
    let rows = q
        .query_map([archived], |r| {
            Ok(ClinicalPatient {
                id: r.get(0)?,
                revision: r.get(1)?,
                name: r.get(2)?,
                life_cycle: r.get(3)?,
                age: r.get(4)?,
                preferred_modality: r.get(5)?,
                archived_at: r.get(6)?,
                birth_date: r.get(7)?,
                self_requester: r.get(8)?,
            })
        })
        .map_err(|_| "Não foi possível consultar pacientes.".to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Não foi possível consultar pacientes.".into())
}
pub fn patient_get(c: &Connection, id: &str) -> Result<ClinicalPatient, String> {
    patients_list(c, true)?
        .into_iter()
        .find(|p| p.id == id)
        .ok_or("Paciente não encontrado.".into())
}
fn valid_patient(i: &PatientInput) -> Result<(), String> {
    if i.name.trim().is_empty()
        || i.name.chars().count() > 160
        || i.age.is_some_and(|a| a < 0)
        || !matches!(
            i.life_cycle.as_str(),
            "Criança" | "Adolescente" | "Adulto" | "Idoso" | "Não informado"
        )
        || !matches!(i.preferred_modality.as_str(), "" | "Presencial" | "Online")
        || i.birth_date.as_ref().and_then(|v| v.as_ref()).is_some_and(|v| !valid_birth_date(v))
        || i.self_requester.as_ref().and_then(|v| v.as_ref()).is_some_and(|v| !matches!(v.as_str(), "yes" | "no"))
    {
        return Err("Dados do paciente inválidos.".into());
    }
    Ok(())
}
pub(super) fn valid_birth_date(s: &str) -> bool {
    let today = chrono::Utc::now().with_timezone(&chrono_tz::America::Sao_Paulo).date_naive();
    s.len() == 10 && s.as_bytes().get(4) == Some(&b'-') && s.as_bytes().get(7) == Some(&b'-')
        && chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").is_ok_and(|date| date <= today)
}
pub fn patient_create(c: &Connection, i: PatientInput) -> Result<ClinicalPatient, String> {
    valid_patient(&i)?;
    let id = random_id();
    c.execute(
        "INSERT INTO patients(id,revision,name,life_cycle,age,preferred_modality,archived_at,birth_date,self_requester) VALUES(?1,1,?2,?3,?4,?5,NULL,?6,?7)",
        params![id, i.name.trim(), i.life_cycle, i.age, i.preferred_modality,i.birth_date.flatten(),i.self_requester.flatten()],
    )
    .map_err(|_| "Não foi possível cadastrar paciente.".to_string())?;
    patient_get(c, &id)
}
pub fn patient_update(
    c: &Connection,
    id: &str,
    rev: i64,
    i: PatientInput,
) -> Result<ClinicalPatient, String> {
    valid_patient(&i)?;
    let birth_present = i.birth_date.is_some();
    let self_present = i.self_requester.is_some();
    let n=c.execute("UPDATE patients SET revision=revision+1,name=?1,life_cycle=?2,age=?3,preferred_modality=?4,birth_date=CASE WHEN ?7 THEN ?8 ELSE birth_date END,self_requester=CASE WHEN ?9 THEN ?10 ELSE self_requester END WHERE id=?5 AND revision=?6 AND archived_at IS NULL",params![i.name.trim(),i.life_cycle,i.age,i.preferred_modality,id,rev,birth_present,i.birth_date.flatten(),self_present,i.self_requester.flatten()]).map_err(|_|"Não foi possível atualizar paciente.".to_string())?;
    if n != 1 {
        return Err("O cadastro mudou; atualize a lista e tente novamente.".into());
    }
    patient_get(c, id)
}
pub fn patient_archive(
    c: &Connection,
    id: &str,
    rev: i64,
    archived: bool,
) -> Result<ClinicalPatient, String> {
    let stamp = if archived {
        Some(chrono::Utc::now().to_rfc3339())
    } else {
        None
    };
    let n = c
        .execute(
            "UPDATE patients SET revision=revision+1,archived_at=?1 WHERE id=?2 AND revision=?3 AND (archived_at IS NULL)=?4",
            params![stamp, id, rev, archived],
        )
        .map_err(|_| "Não foi possível atualizar paciente.".to_string())?;
    if n != 1 {
        return Err("O cadastro mudou; atualize a lista e tente novamente.".into());
    }
    patient_get(c, id)
}
pub fn quick_check(path: &Path, key: &[u8]) -> bool {
    Connection::open(path)
        .ok()
        .and_then(|c| {
            configure(&c, key).ok()?;
            migrate(&c).ok()?;
            Some(())
        })
        .is_some()
}

#[cfg(test)]
mod integrity_diagnostics_tests {
    use super::*;

    #[test]
    fn version_five_migration_adds_addenda_without_changing_backup_schema_version() {
        let c = Connection::open_in_memory().unwrap();
        migrate(&c).unwrap();
        c.execute("INSERT INTO patients(id,revision,name,life_cycle,age,preferred_modality) VALUES('old',1,'Synthetic old','Adulto',32,'Online')", []).unwrap();
        c.execute_batch("DROP INDEX related_parties_patient; DROP TABLE related_parties; ALTER TABLE patients DROP COLUMN birth_date; ALTER TABLE patients DROP COLUMN self_requester;").unwrap();
        c.execute_batch("DROP TRIGGER session_addenda_no_update; DROP TRIGGER session_addenda_no_delete; DROP TABLE session_addenda; DROP INDEX IF EXISTS session_addenda_by_session;").unwrap();
        assert_eq!(schema_version(&c).unwrap(), 5);
        migrate(&c).unwrap();
        assert_eq!(schema_version(&c).unwrap(), 5);
        assert_eq!(c.query_row("SELECT count(*) FROM sqlite_master WHERE name='session_addenda'", [], |r| r.get::<_,i64>(0)).unwrap(), 1);
        assert_eq!(c.query_row("SELECT count(*) FROM sqlite_master WHERE name='case_context_revisions'", [], |r| r.get::<_,i64>(0)).unwrap(), 1);
        let old = patient_get(&c, "old").unwrap();
        assert_eq!(old.birth_date, None);
        assert_eq!(old.self_requester, None);
        assert!(super::super::related_parties::list(&c, "old", false).unwrap().is_empty());
    }

    #[test]
    fn legacy_v5_session_keeps_unknown_author_and_utc_timestamp() {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("CREATE TABLE patients(id TEXT PRIMARY KEY); CREATE TABLE sessions(id TEXT PRIMARY KEY,patient_id TEXT,session_date TEXT,start TEXT,end TEXT,modality TEXT,was_rescheduled INTEGER,observation TEXT,behaviors TEXT,indicators TEXT); INSERT INTO patients VALUES('p'); INSERT INTO sessions VALUES('s','p','2026-01-01','10:00','10:50','Online',0,'synthetic','[]','[]'); PRAGMA user_version=5;").unwrap();
        migrate(&c).unwrap();
        let old = super::super::sessions::timeline(&c, "p").unwrap().pop().unwrap();
        assert_eq!(c.query_row("SELECT count(*) FROM case_context_revisions WHERE patient_id='p'", [], |r| r.get::<_,i64>(0)).unwrap(), 0);
        assert!(old.author.is_none());
        assert!(old.procedures.is_none());
        assert!(old.outcome_decision.is_none());
        assert!(old.referral_closure.is_none());
        assert!(old.recorded_at.is_none());
        assert!(c.execute("UPDATE sessions SET observation='changed' WHERE id='s'", []).is_err());
        assert!(c.execute("DELETE FROM sessions WHERE id='s'", []).is_err());
        assert_eq!(schema_version(&c).unwrap(), 5);
    }

    #[test]
    fn cipher_check_distinguishes_no_findings_from_sql_failure_and_reported_error() {
        let c = Connection::open_in_memory().unwrap();
        let no_findings = check_rows(&c, "SELECT 'unused' WHERE 0").unwrap();
        assert!(no_findings.is_empty());
        assert!(valid_cipher_integrity_rows(&no_findings));

        let reported = check_rows(&c, "SELECT 'synthetic cipher integrity error'").unwrap();
        assert!(!valid_cipher_integrity_rows(&reported));
        assert!(check_rows(&c, "SELECT * FROM no_such_synthetic_table").is_err());
    }

    #[test]
    fn clean_sqlcipher_database_passes_cipher_and_sqlite_integrity_checks() {
        let dir = tempfile::tempdir().unwrap();
        let c = Connection::open(dir.path().join("synthetic-integrity.db")).unwrap();
        configure(&c, &[0x5a; 32]).unwrap();
        c.execute_batch("CREATE TABLE synthetic_integrity_probe(id INTEGER PRIMARY KEY);")
            .unwrap();
        let cipher_rows = check_rows(&c, "PRAGMA cipher_integrity_check").unwrap();
        let sqlite_rows = check_rows(&c, "PRAGMA integrity_check").unwrap();
        assert!(valid_cipher_integrity_rows(&cipher_rows));
        assert_eq!(sqlite_rows, vec!["ok"]);
    }

    #[test]
    fn sqlite_integrity_check_requires_exactly_one_ok_result() {
        let c = Connection::open_in_memory().unwrap();
        assert!(valid_sqlite_integrity_rows(
            &check_rows(&c, "SELECT 'ok'").unwrap()
        ));
        assert!(!valid_sqlite_integrity_rows(
            &check_rows(&c, "SELECT 'unused' WHERE 0").unwrap()
        ));
        assert!(!valid_sqlite_integrity_rows(
            &check_rows(&c, "SELECT 'synthetic integrity error'").unwrap()
        ));
        assert!(check_rows(&c, "SELECT * FROM no_such_synthetic_table").is_err());
    }

    #[test]
    fn unverified_legacy_schema_is_rejected_without_modifying_the_database() {
        let dir = tempfile::tempdir().unwrap();
        let c = Connection::open(dir.path().join("synthetic-legacy.db")).unwrap();
        configure(&c, &[0x37; 32]).unwrap();
        c.execute_batch("CREATE TABLE synthetic_legacy_probe(value TEXT); PRAGMA user_version=3;")
            .unwrap();

        assert!(migrate(&c).is_err());
        assert_eq!(schema_version(&c).unwrap(), 3);
        assert_eq!(
            c.query_row(
                "SELECT count(*) FROM sqlite_master WHERE name='synthetic_legacy_probe'",
                [],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
            1
        );
    }

    #[test]
    fn populated_version_zero_database_is_rejected_without_modification() {
        let dir = tempfile::tempdir().unwrap();
        let c = Connection::open(dir.path().join("synthetic-unknown.db")).unwrap();
        configure(&c, &[0x38; 32]).unwrap();
        c.execute_batch("CREATE TABLE synthetic_unknown_probe(value TEXT);")
            .unwrap();

        assert!(migrate(&c).is_err());
        assert_eq!(schema_version(&c).unwrap(), 0);
        assert_eq!(
            c.query_row(
                "SELECT count(*) FROM sqlite_master WHERE name='synthetic_unknown_probe'",
                [],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
            1
        );
    }
}
