use super::{crypto, db};
use crate::vault::types::BackupPreview;
use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    XChaCha20Poly1305, XNonce,
};
use rand::{rngs::OsRng, RngCore};
use rusqlite::Connection;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use zeroize::{Zeroize, Zeroizing};
const LIMIT: u64 = 64 * 1024 * 1024;
const PREFIX: usize = 4 + 16 + 24 + 100;

struct FileCleanup {
    path: PathBuf,
    armed: bool,
}

impl FileCleanup {
    fn new(path: PathBuf) -> Self {
        Self { path, armed: true }
    }

    fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for FileCleanup {
    fn drop(&mut self) {
        if self.armed {
            let _ = fs::remove_file(&self.path);
        }
    }
}
fn derive(p: &str, s: &[u8]) -> Result<Vec<u8>, String> {
    let params =
        Params::new(64 * 1024, 3, 1, Some(32)).map_err(|_| "Backup inválido.".to_string())?;
    let a = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut k = Zeroizing::new(vec![0; 32]);
    a.hash_password_into(p.as_bytes(), s, &mut k)
        .map_err(|_| "Backup inválido.".to_string())?;
    Ok(std::mem::take(&mut *k))
}
fn snapshot(root: &Path, key: &[u8], snapshot_key: &[u8]) -> Result<(PathBuf, Vec<u8>), String> {
    let src = root.join("circulo.db");
    let temp = root.join(format!(
        "snapshot-{}.db",
        hex::encode(rand::random::<[u8; 12]>())
    ));
    let mut cleanup = FileCleanup::new(temp.clone());
    let sk = Zeroizing::new(hex::encode(snapshot_key));
    let c =
        Connection::open(&src).map_err(|_| "Não foi possível preparar o backup.".to_string())?;
    db::configure(&c, key).map_err(|_| "Não foi possível preparar o backup.".to_string())?;
    let attach = Zeroizing::new(format!("ATTACH DATABASE '{}' AS snap KEY \"x'{}'\"; SELECT sqlcipher_export('snap'); PRAGMA snap.user_version=5; DETACH DATABASE snap;",temp.to_string_lossy().replace('\'',"''"), &*sk));
    c.execute_batch(&attach)
        .map_err(|_| "Não foi possível criar snapshot cifrado.".to_string())?;
    let s = Connection::open(&temp).map_err(|_| "Snapshot inválido.".to_string())?;
    db::configure(&s, snapshot_key).map_err(|_| "Snapshot inválido.".to_string())?;
    let cipher_check = integrity_rows(&s, "PRAGMA cipher_integrity_check")?;
    let sqlite_check = integrity_rows(&s, "PRAGMA integrity_check")?;
    if !(cipher_check.is_empty() || cipher_check == ["ok"])
        || sqlite_check != ["ok"]
        || s.query_row("PRAGMA user_version", [], |r| r.get::<_, u32>(0))
            .map_err(|_| "Snapshot inválido.".to_string())?
            != 5
    {
        return Err("Snapshot inválido.".into());
    }
    let bytes = fs::read(&temp).map_err(|_| "Snapshot indisponível.".to_string())?;
    if bytes.len() as u64 > LIMIT {
        return Err("Backup excede 64 MiB.".into());
    }
    let _ = key;
    cleanup.disarm();
    Ok((temp, bytes))
}

fn integrity_rows(c: &Connection, pragma: &str) -> Result<Vec<String>, String> {
    let mut statement = c
        .prepare(pragma)
        .map_err(|_| "Snapshot inválido.".to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|_| "Snapshot inválido.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Snapshot inválido.".to_string());
    rows
}
pub(super) fn package(bytes: &[u8], snapshot_key: &[u8], pw: &str) -> Result<Vec<u8>, String> {
    package_schema(bytes, snapshot_key, pw, 5)
}

pub(super) fn package_schema(
    bytes: &[u8],
    snapshot_key: &[u8],
    pw: &str,
    schema: u32,
) -> Result<Vec<u8>, String> {
    if bytes.len() as u64 > LIMIT {
        return Err("Backup excede 64 MiB.".into());
    }
    if !(1..=5).contains(&schema) {
        return Err("Versão de esquema inválida.".into());
    }
    let mut salt = [0; 16];
    let mut nonce = [0; 24];
    OsRng.fill_bytes(&mut salt);
    OsRng.fill_bytes(&mut nonce);
    if snapshot_key.len() != 32 {
        return Err("Chave de snapshot inválida.".into());
    }
    let hash = Sha256::digest(bytes);
    let mut manifest = Zeroizing::new(Vec::with_capacity(84));
    manifest.extend(snapshot_key);
    manifest.extend(hash);
    manifest.extend((bytes.len() as u64).to_le_bytes());
    manifest.extend(schema.to_le_bytes());
    manifest.extend(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
            .to_le_bytes(),
    );
    let k = Zeroizing::new(derive(pw, &salt)?);
    let cipher =
        XChaCha20Poly1305::new_from_slice(&k).map_err(|_| "Backup inválido.".to_string())?;
    let mut encrypted = cipher
        .encrypt(XNonce::from_slice(&nonce), manifest.as_slice())
        .map_err(|_| "Não foi possível cifrar backup.".to_string())?;
    if encrypted.len() != 100 {
        return Err("Formato de backup inválido.".into());
    }
    let mut out = b"CBK1".to_vec();
    out.extend(salt);
    out.extend(nonce);
    out.extend(encrypted.drain(..));
    out.extend(bytes);
    Ok(out)
}
pub(super) fn unpack(data: &[u8], pw: &str) -> Result<(Vec<u8>, Vec<u8>, u32, u64), String> {
    if data.len() < PREFIX || &data[..4] != b"CBK1" || data.len() as u64 > LIMIT + PREFIX as u64 {
        return Err("Backup inválido ou senha incorreta.".into());
    }
    let k = Zeroizing::new(derive(pw, &data[4..20])?);
    let cipher =
        XChaCha20Poly1305::new_from_slice(&k).map_err(|_| "Backup inválido.".to_string())?;
    let plain = Zeroizing::new(
        cipher
            .decrypt(XNonce::from_slice(&data[20..44]), &data[44..144])
            .map_err(|_| "Backup inválido ou senha incorreta.".to_string())?,
    );
    if plain.len() != 84 {
        return Err("Backup inválido.".into());
    }
    let dbbytes = &data[PREFIX..];
    let n = u64::from_le_bytes(plain[64..72].try_into().map_err(|_| "Backup inválido.")?);
    let schema = u32::from_le_bytes(plain[72..76].try_into().map_err(|_| "Backup inválido.")?);
    let ts = u64::from_le_bytes(plain[76..84].try_into().map_err(|_| "Backup inválido.")?);
    if n != dbbytes.len() as u64
        || n > LIMIT
        || schema == 0
        || schema > 5
        || Sha256::digest(dbbytes).as_slice() != &plain[32..64]
    {
        return Err("Backup inválido.".into());
    }
    Ok((dbbytes.to_vec(), plain[..32].to_vec(), schema, ts))
}
pub fn export(root: &Path, path: &Path, key: &[u8], password: String) -> Result<(), String> {
    let result = (|| {
        if path.exists() {
            return Err("O destino já existe; nenhum arquivo foi substituído.".into());
        }
        let snapshot_key = Zeroizing::new(rand::random::<[u8; 32]>());
        let (tmp, bytes) = snapshot(root, key, &snapshot_key[..])?;
        let _snapshot_cleanup = FileCleanup::new(tmp);
        let packed = package(&bytes, &snapshot_key[..], &password)?;
        crypto::atomic_write(path, &packed)
            .map_err(|_| "Não foi possível gravar backup.".to_string())?;
        Ok(())
    })();
    let mut p = password;
    p.zeroize();
    result
}
pub fn inspect(path: &Path, pw: &str) -> Result<BackupPreview, String> {
    let data = fs::read(path).map_err(|_| "Backup indisponível.".to_string())?;
    let (_, _, v, t) = unpack(&data, pw)?;
    Ok(BackupPreview {
        schema_version: v as i64,
        created_at: t as i64,
        size_bytes: (data.len() - PREFIX) as u64,
        profile_state: "ready".into(),
        replaces_existing: true,
    })
}

pub(super) fn empty_profile_directory(root: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(root) {
        Ok(metadata) => {
            if !metadata.is_dir() || metadata.file_type().is_symlink() {
                return Err(
                    "O destino não é um diretório de perfil vazio; nenhum arquivo foi alterado."
                        .into(),
                );
            }
            if fs::read_dir(root)
                .map_err(|_| "Não foi possível verificar o perfil local.".to_string())?
                .next()
                .is_some()
            {
                return Err("O perfil local contém arquivos; nenhum arquivo foi alterado.".into());
            }
            Ok(true)
        }
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(false),
        Err(_) => Err("Não foi possível verificar o perfil local.".into()),
    }
}

/// Publishes a validated v5 database and its new key envelope as one directory rename.
/// This is intentionally limited to an absent or completely empty profile directory.
pub fn restore_empty(
    root: &Path,
    path: &Path,
    pw: &str,
    local: &str,
    confirmed: bool,
) -> Result<(), String> {
    if !confirmed {
        return Err("Confirmação necessária.".into());
    }
    if local.chars().count() < 12 {
        return Err("A nova senha local deve ter no mínimo 12 caracteres.".into());
    }
    empty_profile_directory(root)?;
    let parent = root.parent().ok_or("Destino de perfil inválido.")?;
    if !parent.is_dir() {
        return Err("Diretório pai do perfil indisponível.".into());
    }
    let data = fs::read(path).map_err(|_| "Backup indisponível.".to_string())?;
    let (bytes, snapshot_key, version, _) = unpack(&data, pw)?;
    if version != 5 {
        return Err(
            "Este backup usa um esquema legado sem migração validada. O arquivo não foi alterado."
                .into(),
        );
    }
    let snapshot_key = Zeroizing::new(snapshot_key);
    let prepared = tempfile::Builder::new()
        .prefix(".circulo-import-")
        .tempdir_in(parent)
        .map_err(|_| "Não foi possível preparar o novo perfil.".to_string())?;
    let source_path = prepared.path().join("source.db");
    crypto::atomic_write(&source_path, &bytes)
        .map_err(|_| "Não foi possível validar o backup.".to_string())?;
    let source = Connection::open(&source_path).map_err(|_| "Backup inválido.".to_string())?;
    db::configure(&source, &snapshot_key).map_err(|_| "Backup inválido.".to_string())?;
    if db::schema_version(&source).map_err(|_| "Backup inválido.".to_string())? != 5 {
        return Err("Versão do backup inconsistente.".into());
    }
    db::migrate(&source).map_err(|_| "Integridade ou esquema do backup inválido.".to_string())?;

    let (envelope, publish_key) = crypto::new_envelope(local)
        .map_err(|_| "Não foi possível criar a chave local.".to_string())?;
    let publish_key = Zeroizing::new(publish_key);
    let output = prepared.path().join("circulo.db");
    let destkey = Zeroizing::new(hex::encode(&*publish_key));
    let publish = Zeroizing::new(format!(
        "ATTACH DATABASE '{}' AS incoming KEY \"x'{}'\"; SELECT sqlcipher_export('incoming'); PRAGMA incoming.user_version=5; DETACH DATABASE incoming;",
        output.to_string_lossy().replace('\'', "''"),
        &*destkey
    ));
    source
        .execute_batch(&publish)
        .map_err(|_| "Não foi possível recriptografar a restauração.".to_string())?;
    drop(source);
    let validated = Connection::open(&output).map_err(|_| "Restauração inválida.".to_string())?;
    db::configure(&validated, &publish_key).map_err(|_| "Restauração inválida.".to_string())?;
    db::migrate(&validated).map_err(|_| "Restauração inválida.".to_string())?;
    drop(validated);
    fs::remove_file(&source_path)
        .map_err(|_| "Não foi possível concluir o preparo do perfil.".to_string())?;
    crypto::atomic_write(&prepared.path().join("vault.key"), &envelope)
        .map_err(|_| "Não foi possível gravar a chave local.".to_string())?;
    let staged_files = fs::read_dir(prepared.path())
        .map_err(|_| "Não foi possível verificar o novo perfil.".to_string())?
        .map(|entry| entry.map(|file| file.file_name()))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Não foi possível verificar o novo perfil.".to_string())?;
    if staged_files.len() != 2
        || !staged_files.iter().any(|name| name == "circulo.db")
        || !staged_files.iter().any(|name| name == "vault.key")
    {
        return Err("O perfil preparado contém arquivos inesperados; nada foi publicado.".into());
    }
    if empty_profile_directory(root)? {
        fs::remove_dir(root)
            .map_err(|_| "O perfil deixou de estar vazio; nada foi publicado.".to_string())?;
    }
    fs::rename(prepared.path(), root).map_err(|_| {
        "Não foi possível publicar o perfil preparado; nada foi publicado.".to_string()
    })?;
    Ok(())
}

pub fn restore(
    root: &Path,
    path: &Path,
    pw: &str,
    local: &str,
    confirmed: bool,
    quarantine: bool,
    key: Option<&[u8]>,
) -> Result<(), String> {
    if !confirmed {
        return Err("Confirmação necessária.".into());
    }
    let data = fs::read(path).map_err(|_| "Backup indisponível.".to_string())?;
    let (bytes, snapshot_key, version, _) = unpack(&data, pw)?;
    let snapshot_key = Zeroizing::new(snapshot_key);
    if version != 5 {
        return Err(
            "Este backup usa um esquema legado sem migração validada. O arquivo não foi alterado."
                .into(),
        );
    }
    let rollback = root.join("restore.pending");
    if rollback.exists() {
        return Err("Existe recuperação pendente; nenhum arquivo foi substituído.".into());
    }
    let stage = root.join(format!(
        "restore-stage-{}.db",
        hex::encode(rand::random::<[u8; 12]>())
    ));
    let _stage_cleanup = FileCleanup::new(stage.clone());
    crypto::atomic_write(&stage, &bytes)
        .map_err(|_| "Não foi possível validar staging.".to_string())?;
    let source = Connection::open(&stage).map_err(|_| "Backup inválido.".to_string())?;
    db::configure(&source, &snapshot_key).map_err(|_| "Backup inválido.".to_string())?;
    let db_version = source
        .query_row("PRAGMA user_version", [], |r| r.get::<_, u32>(0))
        .map_err(|_| "Backup inválido.".to_string())?;
    if db_version != version {
        return Err("Versão do backup inconsistente.".into());
    }
    db::migrate(&source).map_err(|_| "Integridade ou esquema do backup inválido.".to_string())?;
    drop(source);
    let old = root.join("circulo.db");
    if old.exists() {
        let k = key.ok_or("Perfil local não desbloqueado.")?;
        let existing = Zeroizing::new(
            crypto::open_envelope(
                local,
                &fs::read(root.join("vault.key"))
                    .map_err(|_| "Senha local incorreta.".to_string())?,
            )
            .map_err(|_| "Senha local incorreta.".to_string())?,
        );
        if existing.as_slice() != k {
            return Err("Senha local incorreta.".into());
        }
        if !quarantine {
            return Err("Confirmação de preservação necessária.".into());
        }
        let pre = root.join(format!(
            "pre-restore-{}.circulo-backup",
            hex::encode(rand::random::<[u8; 16]>())
        ));
        let old_snapshot_key = Zeroizing::new(rand::random::<[u8; 32]>());
        let (old_snapshot, oldbytes) = snapshot(root, k, &old_snapshot_key[..])?;
        let _old_snapshot_cleanup = FileCleanup::new(old_snapshot);
        let backup = package(&oldbytes, &old_snapshot_key[..], local)?;
        crypto::atomic_write(&pre, &backup)
            .map_err(|_| "Não foi possível preservar o perfil anterior.".to_string())?;
    }
    let publish_key = key.ok_or("Chave local indisponível.")?;
    let output = root.join(format!(
        "restore-publish-{}.db",
        hex::encode(rand::random::<[u8; 12]>())
    ));
    let _output_cleanup = FileCleanup::new(output.clone());
    let target = Connection::open(&stage)
        .map_err(|_| "Não foi possível preparar a restauração.".to_string())?;
    db::configure(&target, &snapshot_key).map_err(|_| "Backup staging inválido.".to_string())?;
    let destkey = Zeroizing::new(hex::encode(publish_key));
    let publish = Zeroizing::new(format!("ATTACH DATABASE '{}' AS incoming KEY \"x'{}'\"; SELECT sqlcipher_export('incoming'); PRAGMA incoming.user_version={version}; DETACH DATABASE incoming;",output.to_string_lossy().replace('\'',"''"), &*destkey));
    target
        .execute_batch(&publish)
        .map_err(|_| "Não foi possível recriptografar a restauração.".to_string())?;
    drop(target);
    let v = Connection::open(&output).map_err(|_| "Restauração inválida.".to_string())?;
    db::configure(&v, publish_key).map_err(|_| "Restauração inválida.".to_string())?;
    v.query_row("SELECT count(*) FROM patients", [], |r| r.get::<_, i64>(0))
        .map_err(|_| "Restauração inválida.".to_string())?;
    drop(v);
    if old.exists() {
        fs::copy(&old, &rollback)
            .map_err(|_| "Não foi possível guardar recuperação.".to_string())?;
    }
    replace_file(&output, &old)?;
    let _ = fs::remove_file(&rollback);
    Ok(())
}
pub fn create_local_snapshot(root: &Path, key: &[u8]) -> Result<(), String> {
    let snapshot_key = Zeroizing::new(key.to_vec());
    let (tmp, _) = snapshot(root, key, &snapshot_key)?;
    let _snapshot_cleanup = FileCleanup::new(tmp.clone());
    let dest = root.join("auto-backup.db");
    replace_file(&tmp, &dest)
}
pub fn validate_local(root: &Path, key: &[u8]) -> Result<(), String> {
    if db::quick_check(&root.join("auto-backup.db"), key) {
        Ok(())
    } else {
        Err("Cópia automática inválida.".into())
    }
}
pub fn restore_local(root: &Path, key: &[u8]) -> Result<(), String> {
    validate_local(root, key)?;
    if root.join("restore.pending").exists() {
        return Err("Existe recuperação pendente; nenhum arquivo foi substituído.".into());
    }
    let active = root.join("circulo.db");
    let stage = root.join("auto-backup.db");
    let recovery = root.join(format!(
        "auto-restore-stage-{}.db",
        hex::encode(rand::random::<[u8; 12]>())
    ));
    let _recovery_cleanup = FileCleanup::new(recovery.clone());
    fs::copy(stage, &recovery).map_err(|_| "Não foi possível preparar recuperação.".to_string())?;
    if !db::quick_check(&recovery, key) {
        return Err("Cópia automática inválida; o perfil atual foi preservado.".into());
    }
    let replace = root.join("restore.pending");
    fs::copy(&active, &replace)
        .map_err(|_| "Não foi possível preservar o banco atual.".to_string())?;
    replace_file(&recovery, &active)?;
    Ok(())
}

pub fn recover_interrupted_restore(root: &Path, key: &[u8]) -> Result<(), String> {
    let active = root.join("circulo.db");
    let pending = root.join("restore.pending");
    if !pending.exists() {
        return Ok(());
    }
    if db::quick_check(&active, key) {
        if db::quick_check(&pending, key) {
            let preserved = root.join(format!(
                "pre-restore-recovery-{}.db",
                hex::encode(rand::random::<[u8; 16]>())
            ));
            fs::rename(&pending, &preserved).map_err(|_| {
                "A cópia anterior continua preservada em restore.pending.".to_string()
            })?;
        }
        return Ok(());
    }
    if !db::quick_check(&pending, key) {
        return Err(
            "A recuperação pendente não pôde ser validada. Os arquivos foram preservados; não tente sobrescrevê-los."
                .into(),
        );
    }
    replace_file(&pending, &active).map_err(|_| {
        "Não foi possível reverter a restauração; os arquivos foram preservados.".into()
    })
}
fn replace_file(from: &Path, to: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::{os::windows::ffi::OsStrExt, ptr};
        use windows_sys::Win32::Storage::FileSystem::{
            MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
        };
        let a: Vec<u16> = from.as_os_str().encode_wide().chain(Some(0)).collect();
        let b: Vec<u16> = to.as_os_str().encode_wide().chain(Some(0)).collect();
        let ok = unsafe {
            MoveFileExW(
                a.as_ptr(),
                b.as_ptr(),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
        };
        if ok == 0 {
            return Err("Falha ao publicar arquivo validado.".into());
        }
        let _ = ptr::null::<u8>();
    }
    #[cfg(not(windows))]
    {
        fs::rename(from, to).map_err(|_| "Falha ao publicar arquivo validado.".to_string())?;
    }
    Ok(())
}
