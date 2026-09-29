#[cfg(windows)]
pub struct Guard(windows_sys::Win32::Foundation::HANDLE);

#[cfg(windows)]
impl Guard {
    pub fn acquire() -> Result<Self, String> {
        use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS};
        use windows_sys::Win32::System::Threading::CreateMutexW;

        // The user SID scopes the fixed local app profile's global kernel mutex.
        // No file in the profile (or vault) is opened or created.
        let sid = user_sid()?;
        let identity = format!("{sid}:br.circulo.psicologia");
        use sha2::{Digest, Sha256};
        let digest = Sha256::digest(identity.as_bytes());
        let name: Vec<u16> = format!("Global\\Circulo-{}\0", hex::encode(digest))
            .encode_utf16()
            .collect();
        let handle = unsafe { CreateMutexW(std::ptr::null(), 0, name.as_ptr()) };
        if handle.is_null() {
            return Err(format!(
                "não foi possível adquirir a guarda: {}",
                std::io::Error::last_os_error()
            ));
        }
        if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
            unsafe { CloseHandle(handle) };
            return Err("Círculo já está aberto para este usuário do Windows.".into());
        }
        Ok(Self(handle))
    }
}

#[cfg(windows)]
pub fn show_startup_error(error: &str) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};
    let title: Vec<u16> = "Círculo\0".encode_utf16().collect();
    let message: Vec<u16> = format!("{error}\0").encode_utf16().collect();
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            message.as_ptr(),
            title.as_ptr(),
            MB_OK | MB_ICONERROR,
        )
    };
}

#[cfg(windows)]
fn user_sid() -> Result<String, String> {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::Security::{GetTokenInformation, TokenUser, TOKEN_QUERY, TOKEN_USER};
    use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

    let mut token = std::ptr::null_mut();
    if unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) } == 0 {
        return Err(format!(
            "token do usuário indisponível: {}",
            std::io::Error::last_os_error()
        ));
    }
    let result = (|| {
        let mut size = 0;
        unsafe { GetTokenInformation(token, TokenUser, std::ptr::null_mut(), 0, &mut size) };
        if size == 0 {
            return Err("SID do usuário indisponível".into());
        }
        let mut buffer = vec![0u8; size as usize];
        if unsafe {
            GetTokenInformation(
                token,
                TokenUser,
                buffer.as_mut_ptr().cast(),
                size,
                &mut size,
            )
        } == 0
        {
            return Err(format!(
                "SID do usuário indisponível: {}",
                std::io::Error::last_os_error()
            ));
        }
        let token_user = unsafe { std::ptr::read_unaligned(buffer.as_ptr() as *const TOKEN_USER) };
        let sid = token_user.User.Sid;
        let mut sid_bytes = [0u8; 68];
        let length = unsafe { windows_sys::Win32::Security::GetLengthSid(sid) } as usize;
        if length == 0 || length > sid_bytes.len() {
            return Err("SID do usuário inválido".into());
        }
        unsafe { std::ptr::copy_nonoverlapping(sid.cast(), sid_bytes.as_mut_ptr(), length) };
        Ok(hex::encode(&sid_bytes[..length]))
    })();
    unsafe { CloseHandle(token) };
    result
}

#[cfg(windows)]
impl Drop for Guard {
    fn drop(&mut self) {
        unsafe { windows_sys::Win32::Foundation::CloseHandle(self.0) };
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::Guard;

    #[test]
    fn child_probe() {
        if std::env::var_os("CIRCULO_MUTEX_PROBE").is_none() {
            return;
        }
        assert_eq!(
            Guard::acquire().err().as_deref(),
            Some("Círculo já está aberto para este usuário do Windows.")
        );
    }

    #[test]
    fn second_process_is_rejected_then_reopen_succeeds() {
        let first = Guard::acquire().expect("first process must acquire guard");
        let output = std::process::Command::new(std::env::current_exe().unwrap())
            .arg("--exact")
            .arg("single_instance::tests::child_probe")
            .env("CIRCULO_MUTEX_PROBE", "1")
            .output()
            .expect("launch isolated second process");
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        drop(first);
        let reopened = Guard::acquire().expect("guard must be released after close");
        drop(reopened);
    }
}
