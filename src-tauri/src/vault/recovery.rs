use super::{db, types::*};
use rusqlite::Connection;
use std::{
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};
fn safe_root(root: &Path) -> Result<PathBuf, String> {
    let m = fs::symlink_metadata(root).map_err(|_| "Diretório indisponível.".to_string())?;
    if !m.is_dir() || m.file_type().is_symlink() {
        return Err("Diretório de recuperação inválido.".into());
    }
    root.canonicalize()
        .map_err(|_| "Diretório indisponível.".into())
}
fn regular(p: &Path) -> bool {
    fs::symlink_metadata(p).is_ok_and(|m| {
        m.is_file() && !m.file_type().is_symlink() && {
            #[cfg(windows)]
            {
                use std::os::windows::fs::MetadataExt;
                (m.file_attributes() & 0x400) == 0
            }
            #[cfg(not(windows))]
            {
                true
            }
        }
    })
}
fn eligibles(root: &Path, key: &[u8]) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let Ok(rd) = fs::read_dir(root) else {
        return out;
    };
    for e in rd.flatten() {
        let p = e.path();
        let name = e.file_name().to_string_lossy().to_string();
        if !name.starts_with("pre-migration-")
            || !name.ends_with(".db")
            || name.len() != 14 + 32 + 3
            || !name[14..46].bytes().all(|b| b.is_ascii_hexdigit())
            || !regular(&p)
        {
            continue;
        }
        let Ok(c) = Connection::open(&p) else {
            continue;
        };
        if db::configure(&c, key).is_err() {
            continue;
        }
        let v = c
            .query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
            .unwrap_or(0);
        if !(1..=3).contains(&v) {
            continue;
        }
        let check = c
            .query_row("PRAGMA cipher_integrity_check", [], |r| {
                r.get::<_, String>(0)
            })
            .is_ok_and(|x| x == "ok");
        if check {
            out.push(p)
        }
    }
    out
}
pub fn inventory(root: &Path, key: &[u8]) -> Result<RecoveryInventory, String> {
    let canonical = safe_root(root)?;
    let candidates = eligibles(&canonical, key);
    let mut categories = Vec::new();
    let names = [
        ("Cópias pré-migração", "pre-migration-"),
        ("Cópias pré-restauração", "pre-restore-"),
        ("Quarentenas", "quarantine-"),
        ("Staging e recuperação", "restore-"),
    ];
    for (label, prefix) in names {
        let files: Vec<_> = fs::read_dir(&canonical)
            .map_err(|_| "Falha ao inspecionar recuperação.".to_string())?
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().starts_with(prefix))
            .collect();
        let mut bytes = 0;
        let mut oldest = None;
        let mut newest = None;
        let mut complete = true;
        for e in &files {
            match fs::symlink_metadata(e.path()) {
                Ok(m) => {
                    bytes += m.len();
                    if let Ok(t) = m.modified() {
                        if let Ok(s) = t.duration_since(UNIX_EPOCH) {
                            let n = s.as_secs();
                            oldest = Some(oldest.map_or(n, |x: u64| x.min(n)));
                            newest = Some(newest.map_or(n, |x: u64| x.max(n)))
                        }
                    }
                }
                Err(_) => complete = false,
            }
        }
        categories.push(RecoveryCategory {
            category: label.into(),
            count: files.len() as u64,
            bytes,
            size_complete: complete,
            oldest_at: oldest.map(|x| x.to_string()),
            newest_at: newest.map(|x| x.to_string()),
        })
    }
    let blocked = fs::read_dir(&canonical)
        .ok()
        .into_iter()
        .flatten()
        .flatten()
        .any(|e| {
            let n = e.file_name().to_string_lossy().to_string();
            n == "restore.pending"
                || n.starts_with("restore-stage-")
                || n.starts_with("auto-restore-stage-")
        });
    let eligible_bytes = candidates
        .iter()
        .filter_map(|p| fs::metadata(p).ok().map(|m| m.len()))
        .sum();
    Ok(RecoveryInventory {
        categories,
        eligible_count: candidates.len() as u64,
        eligible_bytes,
        cleanup_blocked: blocked,
    })
}
