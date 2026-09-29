use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    ChaCha20Poly1305, Nonce,
};
use rand::{rngs::OsRng, RngCore};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
};
use zeroize::Zeroizing;
const KEY_MAGIC: &[u8; 5] = b"CKEY1";
fn derive(password: &str, salt: &[u8]) -> Result<Vec<u8>, ()> {
    let p = Params::new(64 * 1024, 3, 1, Some(32)).map_err(|_| ())?;
    let a = Argon2::new(Algorithm::Argon2id, Version::V0x13, p);
    let mut out = Zeroizing::new(vec![0; 32]);
    a.hash_password_into(password.as_bytes(), salt, &mut out)
        .map_err(|_| ())?;
    Ok(std::mem::take(&mut *out))
}
pub fn new_envelope(password: &str) -> Result<(Vec<u8>, Vec<u8>), ()> {
    let mut salt = [0; 16];
    let mut nonce = [0; 12];
    let mut key = Zeroizing::new(vec![0; 32]);
    OsRng.fill_bytes(&mut salt);
    OsRng.fill_bytes(&mut nonce);
    OsRng.fill_bytes(&mut key);
    let wrapping = Zeroizing::new(derive(password, &salt)?);
    let cipher = ChaCha20Poly1305::new_from_slice(&wrapping).map_err(|_| ())?;
    let encrypted = cipher
        .encrypt(Nonce::from_slice(&nonce), key.as_slice())
        .map_err(|_| ())?;
    let mut data = KEY_MAGIC.to_vec();
    data.extend(salt);
    data.extend(nonce);
    data.extend(encrypted);
    Ok((data, std::mem::take(&mut *key)))
}
pub fn open_envelope(password: &str, data: &[u8]) -> Result<Vec<u8>, ()> {
    if data.len() != 81 || !data.starts_with(KEY_MAGIC) {
        return Err(());
    }
    let salt = &data[5..21];
    let nonce = &data[21..33];
    let wrapping = Zeroizing::new(derive(password, salt)?);
    let cipher = ChaCha20Poly1305::new_from_slice(&wrapping).map_err(|_| ())?;
    cipher
        .decrypt(Nonce::from_slice(nonce), &data[33..])
        .map_err(|_| ())
}
pub fn atomic_write(path: &Path, data: &[u8]) -> Result<(), ()> {
    if path.exists() {
        return Err(());
    }
    let parent = path.parent().ok_or(())?;
    fs::create_dir_all(parent).map_err(|_| ())?;
    let nonce = rand::random::<[u8; 16]>();
    let tmp = parent.join(format!(".circulo-{}.tmp", hex::encode(nonce)));
    let mut f = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&tmp)
        .map_err(|_| ())?;
    f.write_all(data).map_err(|_| ())?;
    f.sync_all().map_err(|_| ())?;
    drop(f);
    fs::rename(tmp, path).map_err(|_| ())?;
    Ok(())
}
