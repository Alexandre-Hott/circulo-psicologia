use super::{db, types::*};
use chrono::{Datelike, Duration, NaiveDate, NaiveTime, TimeZone};
use chrono_tz::America::Sao_Paulo;
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashSet;
fn date(s: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|_| "Data inválida.".into())
}
fn time(s: &str) -> Result<NaiveTime, String> {
    NaiveTime::parse_from_str(s, "%H:%M").map_err(|_| "Horário inválido.".into())
}
fn valid_slot(d: &str, a: &str, b: &str) -> Result<(), String> {
    let day = date(d)?;
    let start = time(a)?;
    let end = time(b)?;
    if start >= end {
        return Err("Intervalo de horário inválido.".into());
    }
    for t in [start, end] {
        match Sao_Paulo.from_local_datetime(&day.and_time(t)) {
            chrono::LocalResult::Single(_) => {}
            _ => return Err("Horário inexistente ou ambíguo no fuso local; escolha outro.".into()),
        }
    }
    Ok(())
}

fn first_weekday_on_or_after(first: NaiveDate, weekday: i64) -> NaiveDate {
    let offset = (weekday - first.weekday().num_days_from_sunday() as i64).rem_euclid(7);
    first + Duration::days(offset)
}

fn overlaps(a: &AgendaOccurrence, b: &AgendaOccurrence) -> bool {
    a.date == b.date && a.start < b.end && b.start < a.end
}

fn occurrence_from_events(
    c: &Connection,
    series: &AgendaSeries,
    original: &str,
    events: Vec<AgendaEvent>,
) -> Result<Option<AgendaOccurrence>, String> {
    let mut effective = original.to_string();
    let mut start = series.start.clone();
    let mut end = series.end.clone();
    let mut cancelled = false;
    let mut rescheduled = false;
    for event in events {
        match event.action.as_str() {
            "cancel" => cancelled = true,
            "reschedule" => {
                effective = event.effective_date.unwrap_or(effective);
                start = event.start.unwrap_or(start);
                end = event.end.unwrap_or(end);
                rescheduled = true;
            }
            _ => {}
        }
    }
    if cancelled {
        return Ok(None);
    }
    date(&effective)?;
    let completed = c.query_row(
        "SELECT EXISTS(SELECT 1 FROM sessions WHERE series_id=?1 AND original_date=?2)",
        params![series.id, original],
        |row| row.get::<_, bool>(0),
    ).map_err(|_| "Falha na Agenda.".to_string())?;
    Ok(Some(AgendaOccurrence {
        id: format!("{}:{original}", series.id),
        series_id: series.id.clone(),
        patient_id: series.patient_id.clone(),
        original_date: original.to_string(),
        date: effective,
        start,
        end,
        status: if completed { "completed" } else { "scheduled" }.into(),
        frequency: series.frequency.clone(),
        modality: series.modality.clone(),
        meeting_link: series.meeting_link.clone(),
        was_rescheduled: rescheduled,
    }))
}

/// Resolves an occurrence by its stable series/date identity, independently of its effective date.
pub fn occurrence_by_identity(
    c: &Connection,
    series_id: &str,
    original: &str,
) -> Result<Option<AgendaOccurrence>, String> {
    let original_date = date(original)?;
    let series = list_series(c)?
        .into_iter()
        .find(|series| series.id == series_id)
        .ok_or("Série não encontrada.")?;
    let first = date(&series.start_date)?;
    if series.frequency == "Avulsa" {
        if original_date != first || series.end_date.as_deref().is_some_and(|end| date(end).is_ok_and(|end| original_date > end)) { return Err("A identidade não corresponde ao compromisso avulso.".into()); }
        return occurrence_from_events(c, &series, original, events(c, series_id, original)?);
    }
    let anchor = first_weekday_on_or_after(first, series.weekday);
    let step = if series.frequency == "Quinzenal" {
        14
    } else {
        7
    };
    let offset = (original_date - anchor).num_days();
    if original_date < anchor
        || offset % step != 0
        || series
            .end_date
            .as_deref()
            .is_some_and(|end| date(end).is_ok_and(|end| original_date > end))
    {
        return Err("A identidade não corresponde a uma ocorrência da série.".into());
    }
    occurrence_from_events(c, &series, original, events(c, series_id, original)?)
}

fn check_proposed_series_conflicts(
    c: &Connection,
    input: &AgendaSeriesInput,
) -> Result<(), String> {
    let first = date(&input.start_date)?;
    let anchor = if input.frequency == "Avulsa" { first } else { first_weekday_on_or_after(first, input.weekday) };
    let horizon_end = anchor + Duration::days(364);
    let end = input
        .end_date
        .as_deref()
        .map(date)
        .transpose()?
        .unwrap_or(horizon_end)
        .min(horizon_end);
    if anchor > end {
        return Ok(());
    }
    let existing = occurrences(
        c,
        &anchor.format("%Y-%m-%d").to_string(),
        &end.format("%Y-%m-%d").to_string(),
    )?;
    let step = if input.frequency == "Avulsa" { 365 } else if input.frequency == "Quinzenal" {
        14
    } else {
        7
    };
    let mut original = anchor;
    while original <= end {
        let candidate = AgendaOccurrence {
            id: format!("new:{}", original.format("%Y-%m-%d")),
            series_id: "new-series".into(),
            patient_id: input.patient_id.clone(),
            original_date: original.format("%Y-%m-%d").to_string(),
            date: original.format("%Y-%m-%d").to_string(),
            start: input.start.clone(),
            end: input.end.clone(),
            status: "scheduled".into(),
            frequency: input.frequency.clone(),
            modality: input.modality.clone(),
            meeting_link: input.meeting_link.clone(),
            was_rescheduled: false,
        };
        if existing.iter().any(|other| overlaps(&candidate, other)) {
            return Err("O horário cria conflito com outra sessão.".into());
        }
        original += Duration::days(step);
    }
    // An open recurring series must also respect one-off appointments already stored
    // beyond the finite recurrence horizon, including their effective moved dates.
    if input.frequency != "Avulsa" {
        let defined_end = input.end_date.as_deref().map(date).transpose()?;
        for series in list_series(c)?.into_iter().filter(|series| series.frequency == "Avulsa") {
            let Some(appointment) = occurrence_by_identity(c, &series.id, &series.start_date)? else { continue };
            let day = date(&appointment.date)?;
            if day <= horizon_end || day < anchor || defined_end.is_some_and(|last| day > last)
                || (day - anchor).num_days() % step != 0 { continue; }
            if input.start < appointment.end && appointment.start < input.end {
                return Err("O horário cria conflito com outra sessão.".into());
            }
        }
    }
    Ok(())
}
pub fn list_series(c: &Connection) -> Result<Vec<AgendaSeries>, String> {
    let mut s=c.prepare("SELECT id,patient_id,weekday,start,end,frequency,start_date,end_date,modality,meeting_link FROM agenda_series ORDER BY start_date,start").map_err(|_|"Falha na Agenda.".to_string())?;
    let rows = s
        .query_map([], |r| {
            Ok(AgendaSeries {
                id: r.get(0)?,
                patient_id: r.get(1)?,
                weekday: r.get(2)?,
                start: r.get(3)?,
                end: r.get(4)?,
                frequency: r.get(5)?,
                start_date: r.get(6)?,
                end_date: r.get(7)?,
                modality: r.get(8)?,
                meeting_link: r.get(9)?,
            })
        })
        .map_err(|_| String::from("Falha na Agenda."))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|_| String::from("Falha na Agenda."))
}
fn events(c: &Connection, series: &str, orig: &str) -> Result<Vec<AgendaEvent>, String> {
    let mut q=c.prepare("SELECT id,series_id,action,original_date,effective_date,start,end,reason FROM agenda_events WHERE series_id=?1 AND original_date=?2 ORDER BY rowid").map_err(|_|"Falha na Agenda.".to_string())?;
    let rows = q
        .query_map(params![series, orig], |r| {
            Ok(AgendaEvent {
                id: r.get(0)?,
                series_id: r.get(1)?,
                action: r.get(2)?,
                original_date: r.get(3)?,
                effective_date: r.get(4)?,
                start: r.get(5)?,
                end: r.get(6)?,
                reason: r.get(7)?,
            })
        })
        .map_err(|_| String::from("Falha na Agenda."))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|_| String::from("Falha na Agenda."))
}
pub fn occurrences(c: &Connection, from: &str, to: &str) -> Result<Vec<AgendaOccurrence>, String> {
    let a = date(from)?;
    let b = date(to)?;
    if b < a || b - a > Duration::days(400) {
        return Err("Intervalo de consulta inválido.".into());
    }
    let mut out = Vec::new();
    for s in list_series(c)? {
        let first = date(&s.start_date)?;
        let anchor = if s.frequency == "Avulsa" { first } else { first_weekday_on_or_after(first, s.weekday) };
        let last = s
            .end_date
            .as_deref()
            .map(date)
            .transpose()?
            .unwrap_or(b)
            .min(b);
        let mut identities = HashSet::new();
        let mut day = first.max(a).max(anchor);
        while day <= last {
            let step = if s.frequency == "Avulsa" { 365 } else if s.frequency == "Quinzenal" { 14 } else { 7 };
            if (s.frequency != "Avulsa" || day == first) && (day - anchor).num_days() % step == 0 {
                identities.insert(day.format("%Y-%m-%d").to_string());
            }
            day += Duration::days(1)
        }
        let mut moved = c
            .prepare("SELECT DISTINCT original_date FROM agenda_events WHERE series_id=?1 AND action='reschedule' AND effective_date>=?2 AND effective_date<=?3")
            .map_err(|_| "Falha na Agenda.".to_string())?;
        let moved_rows = moved
            .query_map(
                params![
                    s.id,
                    a.format("%Y-%m-%d").to_string(),
                    b.format("%Y-%m-%d").to_string()
                ],
                |row| row.get::<_, String>(0),
            )
            .map_err(|_| "Falha na Agenda.".to_string())?;
        for original in moved_rows {
            identities.insert(original.map_err(|_| "Falha na Agenda.".to_string())?);
        }
        for original in identities {
            if let Some(occurrence) =
                occurrence_from_events(c, &s, &original, events(c, &s.id, &original)?)?
            {
                let effective = date(&occurrence.date)?;
                if effective >= a && effective <= b {
                    out.push(occurrence);
                }
            }
        }
    }
    out.sort_by(|x, y| (&x.date, &x.start, &x.series_id).cmp(&(&y.date, &y.start, &y.series_id)));
    Ok(out)
}
pub fn history(c: &Connection) -> Result<Vec<AgendaEvent>, String> {
    let mut q=c.prepare("SELECT id,series_id,action,original_date,effective_date,start,end,reason FROM agenda_events ORDER BY rowid DESC").map_err(|_|"Falha no histórico.".to_string())?;
    let rows = q
        .query_map([], |r| {
            Ok(AgendaEvent {
                id: r.get(0)?,
                series_id: r.get(1)?,
                action: r.get(2)?,
                original_date: r.get(3)?,
                effective_date: r.get(4)?,
                start: r.get(5)?,
                end: r.get(6)?,
                reason: r.get(7)?,
            })
        })
        .map_err(|_| String::from("Falha no histórico."))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|_| String::from("Falha no histórico."))
}
pub fn create_series(c: &Connection, i: AgendaSeriesInput) -> Result<AgendaSeries, String> {
    if !(0..=6).contains(&i.weekday)
        || !matches!(i.frequency.as_str(), "Semanal" | "Quinzenal" | "Avulsa")
        || i.frequency == "Avulsa" && (i.end_date.as_deref() != Some(i.start_date.as_str()) || date(&i.start_date).is_ok_and(|d| d.weekday().num_days_from_sunday() as i64 != i.weekday))
        || !matches!(i.modality.as_str(), "Online" | "Presencial")
        || i.end_date
            .as_deref()
            .is_some_and(|x| date(x).ok() < date(&i.start_date).ok())
        || i.modality == "Presencial" && i.meeting_link.is_some()
    {
        return Err("Dados da série inválidos.".into());
    }
    valid_slot(&i.start_date, &i.start, &i.end)?;
    check_proposed_series_conflicts(c, &i)?;
    let id = db::random_id();
    c.execute(
        "INSERT INTO agenda_series VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        params![
            id,
            i.patient_id,
            i.weekday,
            i.start,
            i.end,
            i.frequency,
            i.start_date,
            i.end_date,
            i.modality,
            i.meeting_link
        ],
    )
    .map_err(|_| "Não foi possível criar a série.".to_string())?;
    list_series(c)?
        .into_iter()
        .find(|s| s.id == id)
        .ok_or("Falha na Agenda.".into())
}
/// `effective_date` is the first original occurrence removed from the series.
pub fn end_series(c: &Connection, series_id: &str, effective_date: &str) -> Result<AgendaSeries, String> {
    let cutoff = date(effective_date)?;
    if cutoff < chrono::Local::now().with_timezone(&Sao_Paulo).date_naive() {
        return Err("Escolha uma data efetiva de hoje ou futura.".into());
    }
    let series = list_series(c)?.into_iter().find(|item| item.id == series_id)
        .ok_or("Série não encontrada.")?;
    if series.frequency == "Avulsa" { return Err("Compromisso avulso não é uma série recorrente.".into()); }
    if series.end_date.as_deref().is_some_and(|end| date(end).is_ok_and(|end| cutoff > end)) {
        return Err("A série já termina antes da data escolhida.".into());
    }
    // A past identity can still have a live appointment after the proposed end.
    // Resolve all its events so a later cancellation or move back is respected.
    let mut moved = c.prepare("SELECT DISTINCT original_date FROM agenda_events WHERE series_id=?1 AND original_date<?2 AND action='reschedule' AND effective_date>=?2")
        .map_err(|_| "Falha ao verificar remarcações da série.".to_string())?;
    let originals = moved.query_map(params![series_id, effective_date], |row| row.get::<_, String>(0))
        .map_err(|_| "Falha ao verificar remarcações da série.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Falha ao verificar remarcações da série.".to_string())?;
    for original in originals {
        if let Some(occurrence) = occurrence_from_events(c, &series, &original, events(c, series_id, &original)?)? {
            if date(&occurrence.date)? >= cutoff {
                return Err(format!("Não é possível encerrar: a ocorrência original {original} foi remarcada para {} após o corte. Remarque ou cancele essa ocorrência primeiro.", occurrence.date));
            }
        }
    }
    for (table, label) in [("sessions", "sessão finalizada"), ("session_drafts", "rascunho de sessão"), ("agenda_events", "alteração individual da agenda")] {
        let sql = format!("SELECT original_date FROM {table} WHERE series_id=?1 AND original_date>=?2 ORDER BY original_date LIMIT 1");
        let conflict: Option<String> = c.query_row(&sql, params![series_id, effective_date], |row| row.get(0))
            .optional().map_err(|_| "Falha ao verificar conflitos do encerramento.".to_string())?;
        if let Some(original) = conflict {
            return Err(format!("Não é possível encerrar: há {label} na ocorrência original {original}. Resolva o conflito ou escolha uma data posterior."));
        }
    }
    let last = cutoff.pred_opt().ok_or("Data efetiva inválida.")?;
    c.execute("UPDATE agenda_series SET end_date=?1 WHERE id=?2", params![last.format("%Y-%m-%d").to_string(), series_id])
        .map_err(|_| "Não foi possível encerrar a série.".to_string())?;
    list_series(c)?.into_iter().find(|item| item.id == series_id).ok_or("Falha na Agenda.".into())
}
pub fn cancel(c: &Connection, s: &str, d: &str, reason: String) -> Result<(), String> {
    occurrence_by_identity(c, s, d)?.ok_or("A ocorrência não está ativa.")?;
    let completed: bool = c.query_row(
        "SELECT EXISTS(SELECT 1 FROM sessions WHERE series_id=?1 AND original_date=?2)",
        params![s, d],
        |row| row.get(0),
    ).map_err(|_| "Falha ao verificar a sessão da ocorrência.".to_string())?;
    if completed {
        return Err("Ocorrência com sessão finalizada não pode ser cancelada.".into());
    }
    if reason.trim().is_empty() || reason.chars().count() > 240 {
        return Err("Informe um motivo administrativo (até 240 caracteres).".into());
    }
    if events(c, s, d)?.iter().any(|e| e.action == "cancel") {
        return Err("Ocorrência já cancelada.".into());
    }
    let n = c
        .execute(
            "INSERT INTO agenda_events VALUES(?1,?2,'cancel',?3,NULL,NULL,NULL,?4)",
            params![db::random_id(), s, d, reason.trim()],
        )
        .map_err(|_| "Não foi possível cancelar.".to_string())?;
    if n == 1 {
        Ok(())
    } else {
        Err("Não foi possível cancelar.".into())
    }
}
pub fn reschedule(c: &Connection, s: &str, d: &str, i: RescheduleInput) -> Result<(), String> {
    occurrence_by_identity(c, s, d)?.ok_or("A ocorrência não está ativa.")?;
    let completed: bool = c.query_row(
        "SELECT EXISTS(SELECT 1 FROM sessions WHERE series_id=?1 AND original_date=?2)",
        params![s, d],
        |row| row.get(0),
    ).map_err(|_| "Falha ao verificar a sessão da ocorrência.".to_string())?;
    if completed {
        return Err("Ocorrência com sessão finalizada não pode ser remarcada.".into());
    }
    valid_slot(&i.date, &i.start, &i.end)?;
    let series = list_series(c)?
        .into_iter()
        .find(|x| x.id == s)
        .ok_or("Série não encontrada.")?;
    if series.frequency == "Avulsa" && i.reason.as_deref().is_none_or(|reason| reason.trim().is_empty() || reason.chars().count() > 240) {
        return Err("Informe um motivo administrativo (até 240 caracteres).".into());
    }
    let original = date(d)?;
    if original < date(&series.start_date)?
        || series.frequency != "Avulsa" && series
            .end_date
            .as_deref()
            .is_some_and(|e| date(&i.date).ok() > date(e).ok())
    {
        return Err("Remarcação fora do período da série.".into());
    }
    let prior = events(c, s, d)?;
    if prior.iter().any(|e| e.action == "cancel") {
        return Err("Ocorrência cancelada não pode ser remarcada.".into());
    }
    let current = occurrence_by_identity(c, s, d)?.ok_or("A ocorrência não está ativa.")?;
    let current_day = occurrences(c, &current.date, &current.date)?;
    let preexisting_conflicts: HashSet<String> = current_day
        .iter()
        .filter(|other| other.id != current.id && overlaps(&current, other))
        .map(|other| other.id.clone())
        .collect();
    let proposed = AgendaOccurrence {
        id: format!("{s}:{d}"),
        series_id: s.to_string(),
        patient_id: series.patient_id.clone(),
        original_date: d.to_string(),
        date: i.date.clone(),
        start: i.start.clone(),
        end: i.end.clone(),
        status: "scheduled".into(),
        frequency: series.frequency.clone(),
        modality: series.modality.clone(),
        meeting_link: series.meeting_link.clone(),
        was_rescheduled: true,
    };
    let new_date = date(&i.date)?;
    let same_day = i.date.clone();
    let existing = occurrences(c, &same_day, &same_day)?;
    if existing
        .iter()
        .filter(|other| other.id != proposed.id)
        .any(|other| overlaps(&proposed, other) && !preexisting_conflicts.contains(&other.id))
    {
        return Err("O horário cria conflito com outra sessão.".into());
    }
    // A destination after a defined series end was rejected above; retain an explicit
    // parsed date here so malformed dates can never pass by string comparison.
    if series.frequency != "Avulsa" && series
        .end_date
        .as_deref()
        .is_some_and(|end| date(end).is_ok_and(|end| new_date > end))
    {
        return Err("Remarcação fora do período da série.".into());
    }
    let n = c
        .execute(
            "INSERT INTO agenda_events VALUES(?1,?2,'reschedule',?3,?4,?5,?6,?7)",
            params![
                db::random_id(),
                s,
                d,
                i.date,
                i.start,
                i.end,
                i.reason.filter(|x| x.chars().count() <= 240)
            ],
        )
        .map_err(|_| "Não foi possível remarcar.".to_string())?;
    if n == 1 {
        Ok(())
    } else {
        Err("Não foi possível remarcar.".into())
    }
}

#[cfg(test)]
mod recurrence_and_conflict_tests {
    use super::*;
    use rusqlite::Connection;

    fn synthetic_db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(
            "CREATE TABLE agenda_series(id TEXT PRIMARY KEY,patient_id TEXT,weekday INTEGER,start TEXT,end TEXT,frequency TEXT,start_date TEXT,end_date TEXT,modality TEXT,meeting_link TEXT);
             CREATE TABLE agenda_events(id TEXT PRIMARY KEY,series_id TEXT,action TEXT,original_date TEXT,effective_date TEXT,start TEXT,end TEXT,reason TEXT);
             CREATE TABLE session_drafts(series_id TEXT,original_date TEXT);
             CREATE TABLE sessions(series_id TEXT,original_date TEXT);",
        )
        .unwrap();
        c
    }

    fn future_ending_cutoff() -> NaiveDate {
        let today = chrono::Local::now().with_timezone(&Sao_Paulo).date_naive();
        // Keep the cutoff safely future and every weekly identity on Thursday.
        first_weekday_on_or_after(today + Duration::days(14), 4)
    }

    #[test]
    fn ending_series_preserves_past_and_rejects_future_records() {
        let c = synthetic_db();
        let cutoff = future_ending_cutoff();
        let day = |offset| (cutoff + Duration::days(offset)).to_string();
        let start = day(-273);
        let past_moved = day(-20);
        let series = create_series(&c, series_input(4, "Semanal", &start, "14:00", "14:50")).unwrap();
        c.execute("INSERT INTO agenda_events VALUES('past',?1,'reschedule',?2,?3,'15:00','15:50','synthetic')", params![series.id, start, past_moved]).unwrap();
        for (table, original) in [("sessions", day(7)), ("session_drafts", day(14)), ("agenda_events", day(21))] {
            let sql = if table == "agenda_events" { "INSERT INTO agenda_events VALUES('future',?1,'cancel',?2,NULL,NULL,NULL,'synthetic')".to_string() } else { format!("INSERT INTO {table} VALUES(?1,?2)") };
            c.execute(&sql, params![series.id, original]).unwrap();
            let err = end_series(&c, &series.id, &day(0)).err().unwrap();
            assert!(err.contains("Não é possível encerrar"), "{err}");
            assert_eq!(list_series(&c).unwrap()[0].end_date, None);
            c.execute(&format!("DELETE FROM {table} WHERE original_date=?1"), [original]).unwrap();
        }
        let ended = end_series(&c, &series.id, &day(0)).unwrap();
        assert_eq!(ended.end_date, Some(day(-1)));
        assert!(occurrence_by_identity(&c, &series.id, &day(-7)).unwrap().is_some());
        assert!(occurrence_by_identity(&c, &series.id, &day(0)).is_err());
        assert_eq!(history(&c).unwrap().len(), 1);
        assert_eq!(occurrence_by_identity(&c, &series.id, &start).unwrap().unwrap().date, past_moved);
    }

    #[test]
    fn ending_before_start_keeps_series_and_removes_all_occurrences() {
        let c = synthetic_db();
        let cutoff = future_ending_cutoff();
        let day = |offset| (cutoff + Duration::days(offset)).to_string();
        let series = create_series(&c, series_input(4, "Semanal", &day(35), "14:00", "14:50")).unwrap();
        let ended = end_series(&c, &series.id, &day(0)).unwrap();
        assert_eq!(ended.end_date, Some(day(-1)));
        assert_eq!(list_series(&c).unwrap().len(), 1);
        assert!(occurrences(&c, &day(31), &day(60)).unwrap().is_empty());
        assert!(occurrence_by_identity(&c, &series.id, &day(35)).is_err());
    }

    #[test]
    fn moved_past_identity_after_cutoff_blocks_end_but_cancelled_one_does_not() {
        let c = synthetic_db();
        let cutoff = future_ending_cutoff();
        let day = |offset| (cutoff + Duration::days(offset)).to_string();
        let start = day(-273);
        let series = create_series(&c, series_input(4, "Semanal", &start, "14:00", "14:50")).unwrap();
        c.execute("INSERT INTO agenda_events VALUES('moved',?1,'reschedule',?2,?3,'15:00','15:50','synthetic')", params![series.id, start, day(7)]).unwrap();
        let err = end_series(&c, &series.id, &day(0)).err().unwrap();
        assert!(err.contains(&format!("remarcada para {}", day(7))), "{err}");
        assert_eq!(list_series(&c).unwrap()[0].end_date, None);
        c.execute("INSERT INTO agenda_events VALUES('cancelled',?1,'cancel',?2,NULL,NULL,NULL,'synthetic')", params![series.id, start]).unwrap();
        assert_eq!(end_series(&c, &series.id, &day(0)).unwrap().end_date, Some(day(-1)));
        assert_eq!(history(&c).unwrap().len(), 2);
    }

    #[test]
    fn existing_future_end_can_be_brought_forward() {
        let c = synthetic_db();
        let cutoff = future_ending_cutoff();
        let day = |offset| (cutoff + Duration::days(offset)).to_string();
        let mut input = series_input(4, "Semanal", &day(-273), "14:00", "14:50");
        input.end_date = Some(day(91));
        let series = create_series(&c, input).unwrap();
        assert_eq!(end_series(&c, &series.id, &day(0)).unwrap().end_date, Some(day(-1)));
        assert!(occurrence_by_identity(&c, &series.id, &day(0)).is_err());
    }

    fn series_input(
        weekday: i64,
        frequency: &str,
        start_date: &str,
        start: &str,
        end: &str,
    ) -> AgendaSeriesInput {
        AgendaSeriesInput {
            patient_id: "synthetic-patient".into(),
            weekday,
            start: start.into(),
            end: end.into(),
            frequency: frequency.into(),
            start_date: start_date.into(),
            end_date: None,
            modality: "Presencial".into(),
            meeting_link: None,
        }
    }

    #[test]
    fn weekly_series_starts_on_first_chosen_weekday_on_or_after_start_date() {
        let c = synthetic_db();
        let series = create_series(
            &c,
            series_input(1, "Semanal", "2026-01-01", "14:00", "14:50"),
        )
        .unwrap();
        let dates: Vec<_> = occurrences(&c, "2026-01-01", "2026-01-20")
            .unwrap()
            .into_iter()
            .map(|o| o.original_date)
            .collect();
        assert_eq!(
            dates,
            vec![
                String::from("2026-01-05"),
                String::from("2026-01-12"),
                String::from("2026-01-19")
            ]
        );
        assert_eq!(series.weekday, 1);
    }

    #[test]
    fn biweekly_series_anchors_after_start_date_then_advances_exactly_fourteen_days() {
        let c = synthetic_db();
        create_series(
            &c,
            series_input(1, "Quinzenal", "2026-01-08", "14:00", "14:50"),
        )
        .unwrap();
        let dates: Vec<_> = occurrences(&c, "2026-01-08", "2026-02-10")
            .unwrap()
            .into_iter()
            .map(|o| o.original_date)
            .collect();
        assert_eq!(
            dates,
            vec![
                String::from("2026-01-12"),
                String::from("2026-01-26"),
                String::from("2026-02-09")
            ]
        );
    }

    #[test]
    fn adjacent_intervals_are_allowed_but_overlapping_new_series_are_rejected() {
        let c = synthetic_db();
        create_series(
            &c,
            series_input(4, "Semanal", "2026-01-01", "14:00", "14:50"),
        )
        .unwrap();
        assert!(create_series(
            &c,
            series_input(4, "Semanal", "2026-01-01", "14:50", "15:30"),
        )
        .is_ok());
        assert!(create_series(
            &c,
            series_input(4, "Semanal", "2026-01-01", "14:49", "15:30"),
        )
        .err()
        .unwrap()
        .contains("conflito"));
    }

    #[test]
    fn reschedule_rejects_overlap_but_allows_touching_boundary() {
        let c = synthetic_db();
        let first = create_series(
            &c,
            series_input(4, "Semanal", "2026-01-01", "14:00", "14:50"),
        )
        .unwrap();
        let second = create_series(
            &c,
            series_input(4, "Semanal", "2026-01-01", "16:00", "16:50"),
        )
        .unwrap();
        let identity = "2026-01-01";
        assert!(reschedule(
            &c,
            &second.id,
            identity,
            RescheduleInput {
                date: identity.into(),
                start: "14:49".into(),
                end: "15:30".into(),
                reason: None,
            },
        )
        .err()
        .unwrap()
        .contains("conflito"));
        assert!(reschedule(
            &c,
            &second.id,
            identity,
            RescheduleInput {
                date: identity.into(),
                start: "14:50".into(),
                end: "15:30".into(),
                reason: None,
            },
        )
        .is_ok());
        assert_eq!(
            occurrence_by_identity(&c, &first.id, identity)
                .unwrap()
                .unwrap()
                .original_date,
            identity
        );
    }

    #[test]
    fn identity_resolves_reschedule_even_when_effective_date_is_outside_original_day_query() {
        let c = synthetic_db();
        let series = create_series(
            &c,
            series_input(4, "Semanal", "2026-01-01", "14:00", "14:50"),
        )
        .unwrap();
        reschedule(
            &c,
            &series.id,
            "2026-01-01",
            RescheduleInput {
                date: "2026-01-03".into(),
                start: "16:00".into(),
                end: "16:50".into(),
                reason: None,
            },
        )
        .unwrap();
        let resolved = occurrence_by_identity(&c, &series.id, "2026-01-01")
            .unwrap()
            .unwrap();
        assert_eq!(resolved.date, "2026-01-03");
        assert_eq!(resolved.original_date, "2026-01-01");
    }

    #[test]
    fn conflict_query_finds_an_old_identity_remarked_into_the_target_day() {
        let c = synthetic_db();
        let moved = create_series(
            &c,
            series_input(4, "Semanal", "2026-01-01", "14:00", "14:50"),
        )
        .unwrap();
        let destination = create_series(
            &c,
            series_input(4, "Semanal", "2026-01-08", "16:00", "16:50"),
        )
        .unwrap();
        assert!(reschedule(
            &c,
            &moved.id,
            "2026-01-01",
            RescheduleInput {
                date: "2026-01-08".into(),
                start: "16:10".into(),
                end: "17:00".into(),
                reason: None,
            },
        )
        .unwrap_err()
        .contains("conflito"));
        assert_eq!(
            occurrences(&c, "2026-01-08", "2026-01-08")
                .unwrap()
                .iter()
                .filter(|o| o.series_id == destination.id)
                .count(),
            1
        );
    }

    #[test]
    fn reschedule_does_not_reject_a_conflict_that_already_existed_unchanged() {
        let c = synthetic_db();
        c.execute_batch(
            "INSERT INTO agenda_series VALUES('legacy-a','synthetic-a',4,'14:00','14:50','Semanal','2026-01-01',NULL,'Presencial',NULL);
             INSERT INTO agenda_series VALUES('legacy-b','synthetic-b',4,'14:20','15:00','Semanal','2026-01-01',NULL,'Presencial',NULL);",
        )
        .unwrap();
        assert!(reschedule(
            &c,
            "legacy-a",
            "2026-01-01",
            RescheduleInput {
                date: "2026-01-01".into(),
                start: "14:00".into(),
                end: "14:50".into(),
                reason: None,
            },
        )
        .is_ok());
    }

    #[test]
    fn local_slot_rejects_synthetic_dst_gap_and_ambiguous_wall_times() {
        assert!(valid_slot("2018-11-04", "00:30", "01:30").is_err());
        assert!(valid_slot("2019-02-16", "23:30", "23:50").is_err());
    }

    #[test]
    fn completed_occurrence_rejects_changes_without_altering_history_or_future_occurrence() {
        let c = synthetic_db();
        let series = create_series(&c, series_input(4, "Semanal", "2026-01-01", "14:00", "14:50")).unwrap();
        c.execute("INSERT INTO sessions VALUES(?1,?2)", params![series.id, "2026-01-01"]).unwrap();
        let before = history(&c).unwrap();
        let completed_before = occurrence_by_identity(&c, &series.id, "2026-01-01").unwrap().unwrap();
        assert_eq!(completed_before.status, "completed");
        assert!(cancel(&c, &series.id, "2026-01-01", "motivo sintético".into()).unwrap_err().contains("sessão finalizada"));
        assert!(reschedule(&c, &series.id, "2026-01-01", RescheduleInput {
            date: "2026-01-03".into(), start: "16:00".into(), end: "16:50".into(), reason: None,
        }).unwrap_err().contains("sessão finalizada"));
        assert_eq!(history(&c).unwrap().iter().map(|e| (&e.id, &e.action, &e.original_date, &e.effective_date, &e.start, &e.end, &e.reason)).collect::<Vec<_>>(),
            before.iter().map(|e| (&e.id, &e.action, &e.original_date, &e.effective_date, &e.start, &e.end, &e.reason)).collect::<Vec<_>>());
        assert_eq!(occurrence_by_identity(&c, &series.id, "2026-01-01").unwrap().unwrap().date, completed_before.date);
        assert_eq!(occurrence_by_identity(&c, &series.id, "2026-01-01").unwrap().unwrap().status, "completed");
        assert!(reschedule(&c, &series.id, "2026-01-08", RescheduleInput {
            date: "2026-01-10".into(), start: "16:00".into(), end: "16:50".into(), reason: None,
        }).is_ok());
        assert_eq!(occurrence_by_identity(&c, &series.id, "2026-01-08").unwrap().unwrap().date, "2026-01-10");
    }

    #[test]
    fn completed_rescheduled_identity_preserves_existing_event_and_projection() {
        let c = synthetic_db();
        let series = create_series(&c, series_input(4, "Semanal", "2026-01-01", "14:00", "14:50")).unwrap();
        reschedule(&c, &series.id, "2026-01-01", RescheduleInput {
            date: "2026-01-03".into(), start: "16:00".into(), end: "16:50".into(), reason: Some("anterior".into()),
        }).unwrap();
        c.execute("INSERT INTO sessions VALUES(?1,?2)", params![series.id, "2026-01-01"]).unwrap();
        let before_history = history(&c).unwrap();
        let before_occurrence = occurrence_by_identity(&c, &series.id, "2026-01-01").unwrap().unwrap();
        assert_eq!(before_occurrence.status, "completed");
        assert_eq!(before_occurrence.date, "2026-01-03");
        assert!(cancel(&c, &series.id, "2026-01-01", "motivo sintético".into()).unwrap_err().contains("sessão finalizada"));
        assert!(reschedule(&c, &series.id, "2026-01-01", RescheduleInput {
            date: "2026-01-04".into(), start: "17:00".into(), end: "17:50".into(), reason: None,
        }).unwrap_err().contains("sessão finalizada"));
        assert_eq!(history(&c).unwrap().iter().map(|e| (&e.id, &e.action, &e.original_date, &e.effective_date, &e.start, &e.end, &e.reason)).collect::<Vec<_>>(),
            before_history.iter().map(|e| (&e.id, &e.action, &e.original_date, &e.effective_date, &e.start, &e.end, &e.reason)).collect::<Vec<_>>());
        let after = occurrence_by_identity(&c, &series.id, "2026-01-01").unwrap().unwrap();
        assert_eq!((after.id, after.original_date, after.date, after.start, after.end, after.status, after.was_rescheduled),
            (before_occurrence.id, before_occurrence.original_date, before_occurrence.date, before_occurrence.start, before_occurrence.end, before_occurrence.status, before_occurrence.was_rescheduled));
    }
}

#[cfg(test)]
mod one_off_tests {
    use super::*;

    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("CREATE TABLE agenda_series(id TEXT PRIMARY KEY,patient_id TEXT,weekday INTEGER,start TEXT,end TEXT,frequency TEXT,start_date TEXT,end_date TEXT,modality TEXT,meeting_link TEXT); CREATE TABLE agenda_events(id TEXT PRIMARY KEY,series_id TEXT,action TEXT,original_date TEXT,effective_date TEXT,start TEXT,end TEXT,reason TEXT); CREATE TABLE sessions(id TEXT PRIMARY KEY,patient_id TEXT,session_date TEXT,start TEXT,end TEXT,modality TEXT,was_rescheduled INTEGER,observation TEXT,behaviors TEXT,indicators TEXT,series_id TEXT,original_date TEXT);").unwrap();
        c
    }

    fn input(day: &str, start: &str, end: &str) -> AgendaSeriesInput {
        AgendaSeriesInput { patient_id: "synthetic-patient".into(), weekday: date(day).unwrap().weekday().num_days_from_sunday() as i64, start: start.into(), end: end.into(), frequency: "Avulsa".into(), start_date: day.into(), end_date: Some(day.into()), modality: "Presencial".into(), meeting_link: None }
    }

    #[test]
    fn one_off_projects_once_and_blocks_overlap() {
        let c = db();
        let item = create_series(&c, input("2026-01-05", "14:00", "14:50")).unwrap();
        assert_eq!(occurrences(&c, "2026-01-01", "2026-01-31").unwrap().len(), 1);
        assert!(occurrence_by_identity(&c, &item.id, "2026-01-12").is_err());
        assert!(create_series(&c, input("2026-01-05", "14:30", "15:00")).is_err());
        assert!(create_series(&c, input("2026-01-12", "14:30", "15:00")).is_ok());
    }

    #[test]
    fn one_off_can_move_and_cancel_with_stable_identity() {
        let c = db();
        let item = create_series(&c, input("2026-01-05", "14:00", "14:50")).unwrap();
        reschedule(&c, &item.id, "2026-01-05", RescheduleInput { date: "2026-02-10".into(), start: "16:00".into(), end: "16:50".into(), reason: Some("synthetic change".into()) }).unwrap();
        assert!(occurrences(&c, "2026-01-05", "2026-01-05").unwrap().is_empty());
        let moved = occurrences(&c, "2026-02-10", "2026-02-10").unwrap();
        assert_eq!(moved.len(), 1);
        assert_eq!(moved[0].original_date, "2026-01-05");
        cancel(&c, &item.id, "2026-01-05", "synthetic cancellation".into()).unwrap();
        assert!(occurrences(&c, "2026-02-10", "2026-02-10").unwrap().is_empty());
    }

    #[test]
    fn open_recurrence_checks_stored_one_off_beyond_first_year() {
        let c = db();
        let far = create_series(&c, input("2028-01-03", "14:20", "14:50")).unwrap();
        let mut recurring = input("2026-01-05", "14:00", "14:50");
        recurring.frequency = "Semanal".into();
        recurring.end_date = None;
        assert!(create_series(&c, recurring.clone()).is_err());
        reschedule(&c, &far.id, "2028-01-03", RescheduleInput {
            date: "2028-01-04".into(), start: "14:20".into(), end: "14:50".into(), reason: Some("synthetic move".into()),
        }).unwrap();
        assert!(create_series(&c, recurring.clone()).is_ok());

        let c = db();
        let far = create_series(&c, input("2028-01-04", "14:20", "14:50")).unwrap();
        reschedule(&c, &far.id, "2028-01-04", RescheduleInput {
            date: "2028-01-03".into(), start: "14:20".into(), end: "14:50".into(), reason: Some("synthetic move".into()),
        }).unwrap();
        assert!(create_series(&c, recurring).is_err());
    }
}
