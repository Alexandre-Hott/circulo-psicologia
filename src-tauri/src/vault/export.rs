//! Explicit plaintext export. Staging stays beside the selected destination,
//! never in system Temp. Normal errors remove it; a crash or abrupt power loss
//! can leave a `.circulo-record-*.tmp` plaintext file in that directory.
use super::{db, sessions};
use rusqlite::Connection;
use std::{io::Write, path::Path};

const MAX_BYTES: usize = 8 * 1024 * 1024;

fn field(out: &mut String, label: &str, value: &str) {
    // JSON string escaping keeps embedded newlines and control characters from
    // impersonating headings or fields in a plain-text copy.
    out.push_str(label);
    out.push_str(": ");
    out.push_str(&serde_json::to_string(value).expect("string serialization"));
    out.push('\n');
}

pub fn render(c: &Connection, patient_id: &str) -> Result<String, String> {
    let patient = db::patient_get(c, patient_id)?;
    let contexts = sessions::case_context_list(c, patient_id)?;
    let timeline = sessions::timeline(c, patient_id)?;
    let addenda = sessions::addendum_list(c, patient_id)?;
    let mut out = String::from("CÍRCULO — CÓPIA LEGÍVEL DO REGISTRO\nTexto UTF-8 sem criptografia. Revisão pelo profissional necessária.\n\nPACIENTE\n");
    field(&mut out, "ID", &patient.id);
    field(&mut out, "Nome", &patient.name);
    field(&mut out, "Ciclo de vida", &patient.life_cycle);
    if let Some(age) = patient.age {
        field(&mut out, "Idade registrada", &age.to_string());
    }
    if let Some(birth_date) = &patient.birth_date {
        field(&mut out, "Data de nascimento", birth_date);
    }
    if let Some(self_requester) = &patient.self_requester {
        let value = match self_requester.as_str() {
            "yes" => "sim",
            "no" => "não",
            _ => "não informado",
        };
        field(&mut out, "Solicitante é o paciente", value);
    }
    field(
        &mut out,
        "Modalidade preferida",
        &patient.preferred_modality,
    );
    if let Some(date) = patient.archived_at {
        field(&mut out, "Arquivado em", &date);
    }
    out.push_str("\nREVISÕES DO CONTEXTO (todas)\n");
    for item in contexts.iter().rev() {
        field(&mut out, "Registrado UTC", &item.recorded_at);
        if let Some(author) = &item.author {
            field(&mut out, "Autor declarado", &author.display_name);
            field(&mut out, "Registro declarado", &author.registration);
        }
        field(&mut out, "Demanda", &item.demand);
        field(&mut out, "Objetivos", &item.objectives);
        out.push('\n');
    }
    out.push_str("SESSÕES FINALIZADAS\n");
    for session in timeline.iter().rev() {
        field(&mut out, "Data", &session.session_date);
        field(&mut out, "Início", &session.start);
        field(&mut out, "Fim", &session.end);
        field(&mut out, "Modalidade", &session.modality);
        field(
            &mut out,
            "Remarcada",
            if session.was_rescheduled {
                "sim"
            } else {
                "não"
            },
        );
        if let Some(author) = &session.author {
            field(&mut out, "Autor declarado", &author.display_name);
            field(&mut out, "Registro declarado", &author.registration);
        }
        if let Some(at) = &session.recorded_at {
            field(&mut out, "Registrado UTC", at);
        }
        field(
            &mut out,
            "Observação",
            &session.observation,
        );
        if let Some(value) = &session.procedures { field(&mut out, "Procedimentos", value); }
        if let Some(value) = &session.outcome_decision { field(&mut out, "Decisão/desfecho", value); }
        if let Some(value) = &session.referral_closure { field(&mut out, "Encaminhamento/fechamento", value); }
        for behavior in &session.behaviors {
            field(&mut out, "Comportamento título", &behavior.title);
            field(&mut out, "Comportamento descrição", &behavior.description);
            field(
                &mut out,
                "Comportamento versão",
                &behavior.template_version.to_string(),
            );
        }
        for indicator in &session.indicators {
            field(&mut out, "Indicador nome", &indicator.name);
            field(&mut out, "Indicador definição", &indicator.definition);
            field(&mut out, "Indicador versão", &indicator.version.to_string());
            field(
                &mut out,
                "Indicador escala",
                &serde_json::to_string(&indicator.labels).map_err(|_| "Snapshot inválido.")?,
            );
            if let Some(value) = indicator.value {
                field(&mut out, "Indicador valor registrado", &value.to_string());
            } else {
                field(&mut out, "Indicador valor", "não registrado");
            }
            if let Some(note) = &indicator.note {
                field(&mut out, "Indicador nota", note);
            }
        }
        for item in addenda.iter().filter(|item| item.session_id == session.id) {
            field(&mut out, "Adendo UTC", &item.created_at);
            field(&mut out, "Adendo texto", &item.content);
        }
        out.push('\n');
        if out.len() > MAX_BYTES {
            return Err("Registro excede o limite de 8 MiB para cópia legível.".into());
        }
    }
    if out.len() > MAX_BYTES {
        return Err("Registro excede o limite de 8 MiB para cópia legível.".into());
    }
    Ok(out)
}

pub fn write_new(path: &Path, text: &str) -> Result<(), String> {
    write_new_with(path, |file| {
        file.write_all(text.as_bytes())
            .and_then(|_| file.sync_all())
    })
}

fn write_new_with(
    path: &Path,
    write: impl FnOnce(&mut std::fs::File) -> std::io::Result<()>,
) -> Result<(), String> {
    if path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.eq_ignore_ascii_case("txt"))
        != Some(true)
    {
        return Err("Escolha um arquivo .txt.".into());
    }
    let parent = path.parent().ok_or("Destino inválido.")?;
    // NamedTempFile creates an unpredictable, exclusive sibling. It removes the
    // staging file on normal failure. A process crash can leave this plaintext
    // sibling behind; the user must inspect the chosen directory in that case.
    let mut stage = tempfile::Builder::new()
        .prefix(".circulo-record-")
        .suffix(".tmp")
        .tempfile_in(parent)
        .map_err(|_| "Não foi possível preparar a cópia no destino escolhido.".to_string())?;
    if write(stage.as_file_mut()).is_err() {
        return cleanup_error(stage, "Falha ao gravar a cópia.");
    }
    let stage = stage.into_temp_path();
    if publish_no_replace(&stage, path).is_err() {
        return cleanup_path_error(
            stage,
            "Não foi possível publicar a cópia; destino existente não será sobrescrito.",
        );
    }
    // Publication moved the stage. Dropping TempPath cannot remove the final path.
    Ok(())
}

fn cleanup_error(stage: tempfile::NamedTempFile, message: &str) -> Result<(), String> {
    stage.close().map_err(|_| {
        format!(
            "{message} A limpeza do arquivo temporário falhou; verifique o diretório escolhido."
        )
    })?;
    Err(message.into())
}

fn cleanup_path_error(stage: tempfile::TempPath, message: &str) -> Result<(), String> {
    stage.close().map_err(|_| {
        format!(
            "{message} A limpeza do arquivo temporário falhou; verifique o diretório escolhido."
        )
    })?;
    Err(message.into())
}

#[cfg(windows)]
fn publish_no_replace(stage: &Path, destination: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_WRITE_THROUGH};
    let from: Vec<u16> = stage.as_os_str().encode_wide().chain(Some(0)).collect();
    let to: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    // No REPLACE_EXISTING flag: Windows fails if the destination already exists.
    if unsafe { MoveFileExW(from.as_ptr(), to.as_ptr(), MOVEFILE_WRITE_THROUGH) } == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn publish_no_replace(stage: &Path, destination: &Path) -> std::io::Result<()> {
    std::fs::hard_link(stage, destination)?;
    std::fs::remove_file(stage)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    #[test]
    fn patient_identification_is_scoped_optional_and_readable() {
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        for (id, birth_date, self_requester) in [
            ("a", Some("2001-02-03\nPACIENTE"), Some("yes")),
            ("b", None, Some("no")),
            ("c", None, None),
        ] {
            c.execute(
                "INSERT INTO patients(id,revision,name,life_cycle,preferred_modality,birth_date,self_requester) VALUES(?1,1,?1,'Infância','Presencial',?2,?3)",
                params![id, birth_date, self_requester],
            ).unwrap();
        }
        let a = render(&c, "a").unwrap();
        assert!(a.contains("Data de nascimento: \"2001-02-03\\nPACIENTE\""));
        assert!(a.contains("Solicitante é o paciente: \"sim\""));
        let b = render(&c, "b").unwrap();
        assert!(!b.contains("Data de nascimento:"));
        assert!(b.contains("Solicitante é o paciente: \"não\""));
        assert!(!b.contains("2001-02-03"));
        let absent = render(&c, "c").unwrap();
        assert!(!absent.contains("Data de nascimento:"));
        assert!(!absent.contains("Solicitante é o paciente:"));
    }

    #[test]
    fn oversized_patient_identification_is_rejected() {
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        let oversized = "x".repeat(MAX_BYTES);
        c.execute(
            "INSERT INTO patients(id,revision,name,life_cycle,preferred_modality,birth_date) VALUES('a',1,'Synthetic','Infância','Presencial',?1)",
            [&oversized],
        ).unwrap();
        assert!(render(&c, "a").unwrap_err().contains("8 MiB"));
    }
    #[test]
    fn scoped_escaped_complete_and_no_overwrite() {
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        for id in ["a", "b"] {
            c.execute("INSERT INTO patients(id,revision,name,life_cycle,preferred_modality) VALUES(?1,1,?2,'Infância','Presencial')", [id, id]).unwrap();
        }
        c.execute("INSERT INTO case_context_revisions(id,patient_id,recorded_at,demand,objectives) VALUES('c','a','2026-01-01T00:00:00Z','linha\nSESSÕES FINALIZADAS','objetivo')", []).unwrap();
        c.execute("INSERT INTO sessions(id,patient_id,session_date,start,end,modality,was_rescheduled,observation,behaviors,indicators,procedures,outcome_decision,referral_closure) VALUES('s','a','2026-01-02','10:00','10:50','Online',0,'observação','[]','[]','synthetic procedure','synthetic outcome','synthetic referral')", []).unwrap();
        c.execute("INSERT INTO session_addenda(id,session_id,patient_id,created_at,content) VALUES('d','s','a','2026-01-03T00:00:00Z','correção')", []).unwrap();
        let a = render(&c, "a").unwrap();
        assert!(a.contains("linha\\nSESSÕES FINALIZADAS"));
        assert!(a.contains("observação") && a.contains("correção") && a.contains("objetivo"));
        assert!(a.contains("Procedimentos: \"synthetic procedure\""));
        assert!(a.contains("Decisão/desfecho: \"synthetic outcome\""));
        assert!(a.contains("Encaminhamento/fechamento: \"synthetic referral\""));
        c.execute("INSERT INTO sessions(id,patient_id,session_date,start,end,modality,was_rescheduled,observation,behaviors,indicators) VALUES('s2','a','2026-01-04','10:00','10:50','Online',0,'synthetic second observation','[]',?1)", [r#"[{"id":"synthetic","version":1,"name":"Synthetic indicator","definition":"Synthetic definition","labels":["A","B"],"value":null,"note":null}]"#]).unwrap();
        let with_unrecorded = render(&c, "a").unwrap();
        assert!(with_unrecorded.contains("Indicador nome: \"Synthetic indicator\""));
        assert!(with_unrecorded.contains("Indicador valor: \"não registrado\""));
        let b = render(&c, "b").unwrap();
        assert!(!b.contains("observação") && !b.contains("correção") && !b.contains("objetivo"));
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("copy.txt");
        write_new(&path, &a).unwrap();
        assert!(write_new(&path, &b).is_err());
        assert_eq!(std::fs::read_to_string(path).unwrap(), a);
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    #[test]
    fn failed_write_removes_staging_and_never_publishes_partial_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("record.txt");
        let result = write_new_with(&path, |file| {
            file.write_all(b"partial plaintext")?;
            Err(std::io::Error::other("simulated write failure"))
        });
        assert!(result.is_err());
        assert!(!path.exists());
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0);
    }
}
