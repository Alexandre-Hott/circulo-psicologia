//! Read-only aggregates over finalized sessions whose civil `session_date` falls
//! in the inclusive range. That same session set is the denominator for every
//! count; scheduled/canceled occurrences and drafts are excluded. Archived
//! patients remain in historical counts. A selected behavior is a session
//! observation, not a diagnosis. `occurrences` counts distinct finalized
//! sessions containing the snapshot, while `uniquePatients` counts people.
use chrono::{Months, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsOverview {
    pub total_completed_sessions: i64,
    pub unique_patients: i64,
    pub daily_counts: Vec<DailyCount>,
    pub monthly_counts: Vec<MonthlyCount>,
    pub behavior_counts: Vec<BehaviorCount>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyCount {
    pub date: String,
    pub count: i64,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyCount {
    pub month: String,
    pub count: i64,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BehaviorCount {
    pub template_id: String,
    pub template_version: i64,
    pub title: String,
    pub occurrences: i64,
    pub unique_patients: i64,
}

pub struct AnalyticsInput<'a> {
    from: &'a str,
    to: &'a str,
    patient_id: Option<&'a str>,
}

fn civil_date(value: &str) -> Result<NaiveDate, String> {
    if value.len() != 10
        || !value.as_bytes().iter().enumerate().all(|(i, byte)| {
            if i == 4 || i == 7 {
                *byte == b'-'
            } else {
                byte.is_ascii_digit()
            }
        })
    {
        return Err("Data civil inválida; use AAAA-MM-DD.".into());
    }
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| "Data civil inválida; use AAAA-MM-DD.".into())
}

pub fn validate<'a>(
    from: &'a str,
    to: &'a str,
    patient_id: Option<&'a str>,
) -> Result<AnalyticsInput<'a>, String> {
    let first = civil_date(from)?;
    let last = civil_date(to)?;
    if last < first
        || first
            .checked_add_months(Months::new(60))
            .is_none_or(|limit| last > limit)
    {
        return Err("Intervalo inválido; use até cinco anos em ordem cronológica.".into());
    }
    if patient_id.is_some_and(|id| {
        id.is_empty()
            || id.len() > 64
            || !id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    }) {
        return Err("Identificador de paciente inválido.".into());
    }
    Ok(AnalyticsInput {
        from,
        to,
        patient_id,
    })
}

pub fn overview(c: &Connection, input: &AnalyticsInput<'_>) -> Result<AnalyticsOverview, String> {
    if let Some(id) = input.patient_id {
        let exists: Option<i64> = c
            .query_row("SELECT 1 FROM patients WHERE id=?1", [id], |row| row.get(0))
            .optional()
            .map_err(|_| "Não foi possível consultar análises.".to_string())?;
        if exists.is_none() {
            return Err("Paciente não encontrado.".into());
        }
    }
    let filter = "session_date BETWEEN ?1 AND ?2 AND (?3 IS NULL OR patient_id=?3)";
    let (total_completed_sessions, unique_patients) = c
        .query_row(
            &format!("SELECT COUNT(*), COUNT(DISTINCT patient_id) FROM sessions WHERE {filter}"),
            params![input.from, input.to, input.patient_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "Não foi possível consultar análises.".to_string())?;

    let mut daily_query = c.prepare(&format!("SELECT session_date, COUNT(*) FROM sessions WHERE {filter} GROUP BY session_date ORDER BY session_date"))
        .map_err(|_| "Não foi possível consultar análises.".to_string())?;
    let daily_counts = daily_query
        .query_map(params![input.from, input.to, input.patient_id], |row| {
            Ok(DailyCount {
                date: row.get(0)?,
                count: row.get(1)?,
            })
        })
        .map_err(|_| "Não foi possível consultar análises.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Não foi possível consultar análises.".to_string())?;

    let mut monthly_query = c.prepare(&format!("SELECT substr(session_date,1,7), COUNT(*) FROM sessions WHERE {filter} GROUP BY substr(session_date,1,7) ORDER BY substr(session_date,1,7)"))
        .map_err(|_| "Não foi possível consultar análises.".to_string())?;
    let monthly_counts = monthly_query
        .query_map(params![input.from, input.to, input.patient_id], |row| {
            Ok(MonthlyCount {
                month: row.get(0)?,
                count: row.get(1)?,
            })
        })
        .map_err(|_| "Não foi possível consultar análises.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Não foi possível consultar análises.".to_string())?;

    // DISTINCT session IDs avoid double counting a duplicated snapshot entry.
    // Version and title come from the immutable session snapshot, not today's
    // editable library. One template can therefore have several historical rows.
    let mut behavior_query = c.prepare(
        "SELECT json_extract(j.value,'$.templateId'), json_extract(j.value,'$.templateVersion'), json_extract(j.value,'$.title'), \
         COUNT(DISTINCT s.id), COUNT(DISTINCT s.patient_id) \
         FROM sessions s JOIN json_each(s.behaviors) j \
         WHERE s.session_date BETWEEN ?1 AND ?2 AND (?3 IS NULL OR s.patient_id=?3) \
         GROUP BY json_extract(j.value,'$.templateId'), json_extract(j.value,'$.templateVersion'), json_extract(j.value,'$.title') \
         ORDER BY COUNT(DISTINCT s.id) DESC, json_extract(j.value,'$.title'), json_extract(j.value,'$.templateId'), json_extract(j.value,'$.templateVersion')"
    ).map_err(|_| "Não foi possível consultar análises.".to_string())?;
    let behavior_counts = behavior_query
        .query_map(params![input.from, input.to, input.patient_id], |row| {
            Ok(BehaviorCount {
                template_id: row.get(0)?,
                template_version: row.get(1)?,
                title: row.get(2)?,
                occurrences: row.get(3)?,
                unique_patients: row.get(4)?,
            })
        })
        .map_err(|_| "Não foi possível consultar análises.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Não foi possível consultar análises.".to_string())?;

    Ok(AnalyticsOverview {
        total_completed_sessions,
        unique_patients,
        daily_counts,
        monthly_counts,
        behavior_counts,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::Vault;
    use serde_json::json;
    use tempfile::TempDir;

    fn add_session(
        c: &Connection,
        id: &str,
        patient: &str,
        date: &str,
        behaviors: serde_json::Value,
    ) {
        c.execute(
            "INSERT INTO sessions(id,patient_id,session_date,start,end,modality,was_rescheduled,observation,behaviors,indicators) VALUES(?1,?2,?3,'10:00','10:50','Presencial',0,'private synthetic observation',?4,'[]')",
            params![id, patient, date, behaviors.to_string()],
        ).unwrap();
    }

    #[test]
    fn finalized_history_uses_inclusive_civil_dates_snapshots_and_distinct_sessions() {
        let root = TempDir::new().unwrap();
        let vault = Vault::new(root.path().join("synthetic-analytics"));
        vault.create("synthetic-password-123".into()).unwrap();
        {
            let c = vault.open_conn().unwrap();
            c.execute_batch(
                "INSERT INTO patients(id,revision,name,life_cycle,preferred_modality,archived_at) VALUES
                 ('p1',1,'Private One','Criança','Presencial',NULL),
                 ('p2',1,'Private Two','Criança','Presencial','2026-02-15');
                 INSERT INTO behavior_templates(id,title,description,version) VALUES('template-a','Current library title','',3);
                 INSERT INTO session_drafts(id,patient_id,series_id,original_date,observation,behavior_ids,indicators) VALUES('draft','p1','series','2026-02-01','private draft','[\"template-a\"]','[]');"
            ).unwrap();
            let old = json!({"templateId":"template-a","templateVersion":1,"title":"Snapshot title","description":"private description"});
            let revised = json!({"templateId":"template-a","templateVersion":2,"title":"Revised snapshot","description":"private description"});
            add_session(&c, "s0", "p1", "2026-01-30", json!([old]));
            add_session(&c, "s1", "p1", "2026-01-31", json!([old]));
            add_session(&c, "s2", "p1", "2026-02-01", json!([old, old]));
            add_session(&c, "s3", "p2", "2026-02-01", json!([old]));
            add_session(&c, "s4", "p2", "2026-02-28", json!([revised]));
            add_session(&c, "s5", "p2", "2026-03-01", json!([revised]));
        }

        let result = vault
            .analytics_overview("2026-01-31", "2026-02-28", None)
            .unwrap();
        assert_eq!(result.total_completed_sessions, 4);
        assert_eq!(result.unique_patients, 2);
        assert_eq!(
            result.daily_counts,
            vec![
                DailyCount {
                    date: "2026-01-31".into(),
                    count: 1
                },
                DailyCount {
                    date: "2026-02-01".into(),
                    count: 2
                },
                DailyCount {
                    date: "2026-02-28".into(),
                    count: 1
                },
            ]
        );
        assert_eq!(
            result.monthly_counts,
            vec![
                MonthlyCount {
                    month: "2026-01".into(),
                    count: 1
                },
                MonthlyCount {
                    month: "2026-02".into(),
                    count: 3
                },
            ]
        );
        assert_eq!(
            result.behavior_counts,
            vec![
                BehaviorCount {
                    template_id: "template-a".into(),
                    template_version: 1,
                    title: "Snapshot title".into(),
                    occurrences: 3,
                    unique_patients: 2
                },
                BehaviorCount {
                    template_id: "template-a".into(),
                    template_version: 2,
                    title: "Revised snapshot".into(),
                    occurrences: 1,
                    unique_patients: 1
                },
            ]
        );
        let serialized = serde_json::to_value(&result).unwrap();
        assert_eq!(serialized["totalCompletedSessions"], 4);
        assert_eq!(serialized["behaviorCounts"][0]["templateVersion"], 1);
        assert!(!serialized.to_string().contains("Private"));
        assert!(!serialized.to_string().contains("private"));

        let scoped = vault
            .analytics_overview("2026-01-31", "2026-02-28", Some("p2"))
            .unwrap();
        assert_eq!(
            (scoped.total_completed_sessions, scoped.unique_patients),
            (2, 1)
        );
        assert_eq!(scoped.behavior_counts[0].unique_patients, 1);
        assert_eq!(scoped.behavior_counts[0].occurrences, 1);
        assert_eq!(
            vault
                .analytics_overview("2026-01-31", "2026-02-28", Some("missing"))
                .unwrap_err(),
            "Paciente não encontrado."
        );
        vault.lock().unwrap();
        assert_eq!(
            vault
                .analytics_overview("2026-01-31", "2026-02-28", None)
                .unwrap_err(),
            "Cofre bloqueado."
        );
    }

    #[test]
    fn rejects_invalid_dates_ranges_and_patient_identifiers() {
        for (from, to) in [
            ("2026-2-01", "2026-02-28"),
            ("2026-02-30", "2026-03-01"),
            ("2026-03-01", "2026-02-28"),
            ("2020-01-01", "2026-01-01"),
            ("2020-01-01", "2025-01-02"),
            ("2026-02-01T00:00:00", "2026-02-28"),
        ] {
            assert!(validate(from, to, None).is_err());
        }
        assert!(validate("2024-02-29", "2024-02-29", None).is_ok());
        for patient_id in ["", " p1", "p1;DROP TABLE sessions", "á", "a/b"] {
            assert!(validate("2026-01-01", "2026-01-01", Some(patient_id)).is_err());
        }
    }
}
