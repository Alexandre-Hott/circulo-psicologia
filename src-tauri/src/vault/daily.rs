//! Disposable, per-Windows-user daily DB key cache. Never a source of profile truth.
use chrono::Local;
use sha2::{Digest, Sha256};
use std::{fs, path::Path};
use zeroize::Zeroizing;

const NAME: &str = "daily-unlock.dpapi";
const REVOKED: &str = "daily-unlock.revoked";
const MAGIC: &[u8] = b"CDAY1";

pub fn today() -> String {
    Local::now().date_naive().format("%Y-%m-%d").to_string()
}

fn payload(day: &str, envelope: &[u8], key: &[u8]) -> Vec<u8> {
    let mut data = Vec::with_capacity(5 + 10 + 32 + key.len());
    data.extend_from_slice(MAGIC);
    data.extend_from_slice(day.as_bytes());
    data.extend_from_slice(&Sha256::digest(envelope));
    data.extend_from_slice(key);
    data
}
fn valid(plain: &[u8], day: &str, envelope: &[u8]) -> bool {
    let expected = payload(day, envelope, &[]);
    plain.len() == expected.len() + 32 && plain.starts_with(&expected)
}

pub fn save(root: &Path, envelope: &[u8], key: &[u8]) -> Result<(), ()> {
    #[cfg(windows)]
    {
        let plain = Zeroizing::new(payload(&today(), envelope, key));
        let sealed = Zeroizing::new(dpapi::protect(&plain)?);
        let temp = root.join(format!(
            ".daily-{}.tmp",
            hex::encode(rand::random::<[u8; 8]>())
        ));
        fs::write(&temp, &*sealed).map_err(|_| ())?;
        let target = root.join(NAME);
        if target.exists() {
            fs::remove_file(&target).map_err(|_| ())?;
        }
        fs::rename(&temp, target).map_err(|_| ())?;
        match fs::remove_file(root.join(REVOKED)) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(_) => Err(()),
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (root, envelope, key);
        Err(())
    }
}

pub fn load(root: &Path, envelope: &[u8]) -> Option<Zeroizing<Vec<u8>>> {
    #[cfg(windows)]
    {
        if root.join(REVOKED).exists() {
            return None;
        }
        let sealed = fs::read(root.join(NAME)).ok()?;
        let plain = Zeroizing::new(dpapi::unprotect(&sealed).ok()?);
        let expected_len = payload(&today(), envelope, &[]).len();
        if !valid(&plain, &today(), envelope) {
            return None;
        }
        Some(Zeroizing::new(plain[expected_len..].to_vec()))
    }
    #[cfg(not(windows))]
    {
        let _ = (root, envelope);
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn day_and_envelope_bind_the_cached_key() {
        let data = payload("2026-09-28", b"envelope-a", &[7; 32]);
        assert!(valid(&data, "2026-09-28", b"envelope-a"));
        assert!(!valid(&data, "2026-09-29", b"envelope-a"));
        assert!(!valid(&data, "2026-09-28", b"envelope-b"));
    }
}

pub fn revoke(root: &Path) -> Result<(), ()> {
    match fs::symlink_metadata(root.join(NAME)) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(_) => return Err(()),
        Ok(_) => {}
    }
    // The marker survives restart when Windows refuses deletion of a read-only cache.
    let marked = fs::write(root.join(REVOKED), b"revoked").is_ok();
    let removed = match fs::remove_file(root.join(NAME)) {
        Ok(()) => true,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => true,
        Err(_) => false,
    };
    if marked || removed {
        Ok(())
    } else {
        Err(())
    }
}

#[cfg(windows)]
mod dpapi {
    use std::{ffi::c_void, ptr};
    use zeroize::Zeroizing;
    #[repr(C)]
    struct Blob {
        len: u32,
        data: *mut u8,
    }
    #[link(name = "Crypt32")]
    extern "system" {
        fn CryptProtectData(
            input: *const Blob,
            description: *const u16,
            entropy: *const Blob,
            reserved: *mut c_void,
            prompt: *mut c_void,
            flags: u32,
            output: *mut Blob,
        ) -> i32;
        fn CryptUnprotectData(
            input: *const Blob,
            description: *mut *mut u16,
            entropy: *const Blob,
            reserved: *mut c_void,
            prompt: *mut c_void,
            flags: u32,
            output: *mut Blob,
        ) -> i32;
    }
    #[link(name = "Kernel32")]
    extern "system" {
        fn LocalFree(memory: *mut c_void) -> *mut c_void;
    }
    fn apply(input: &[u8], protect: bool) -> Result<Vec<u8>, ()> {
        let len = u32::try_from(input.len()).map_err(|_| ())?;
        let source = Blob {
            len,
            data: input.as_ptr() as *mut u8,
        };
        let mut output = Blob {
            len: 0,
            data: ptr::null_mut(),
        };
        // Flags 0 retain DPAPI's CURRENT_USER scope; no machine-wide flag.
        let ok = unsafe {
            if protect {
                CryptProtectData(
                    &source,
                    ptr::null(),
                    ptr::null(),
                    ptr::null_mut(),
                    ptr::null_mut(),
                    0,
                    &mut output,
                )
            } else {
                CryptUnprotectData(
                    &source,
                    ptr::null_mut(),
                    ptr::null(),
                    ptr::null_mut(),
                    ptr::null_mut(),
                    0,
                    &mut output,
                )
            }
        };
        if ok == 0 {
            return Err(());
        }
        let bytes = unsafe { std::slice::from_raw_parts(output.data, output.len as usize) };
        let copy = Zeroizing::new(bytes.to_vec());
        if !protect {
            unsafe {
                ptr::write_bytes(output.data, 0, output.len as usize);
            }
        }
        unsafe {
            LocalFree(output.data.cast());
        }
        Ok(copy.to_vec())
    }
    pub fn protect(input: &[u8]) -> Result<Vec<u8>, ()> {
        apply(input, true)
    }
    pub fn unprotect(input: &[u8]) -> Result<Vec<u8>, ()> {
        apply(input, false)
    }
}
