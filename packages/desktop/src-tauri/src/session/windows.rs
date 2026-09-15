use super::Session;
use std::{fs, io::Write, path::Path, ptr};
use windows_sys::Win32::{
    Foundation::LocalFree,
    Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    },
};

fn crypt(data: &[u8], encrypt: bool) -> Result<Vec<u8>, String> {
    let input = CRYPT_INTEGER_BLOB {
        cbData: data.len().try_into().map_err(|_| "Session is too large")?,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: ptr::null_mut(),
    };
    // SAFETY: input remains alive for the call; output is allocated by DPAPI
    // and freed with LocalFree below. No machine-wide flag is used: DPAPI
    // binds encryption to the current Windows user's logon credentials.
    let ok = unsafe {
        if encrypt {
            CryptProtectData(
                &input,
                ptr::null(),
                ptr::null(),
                ptr::null(),
                ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &input,
                ptr::null_mut(),
                ptr::null(),
                ptr::null(),
                ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        }
    };
    if ok == 0 {
        return Err(format!(
            "Windows session protection failed: {}",
            std::io::Error::last_os_error()
        ));
    }
    // SAFETY: a successful DPAPI call owns output.cbData bytes at pbData.
    let bytes = unsafe {
        let bytes = if output.cbData == 0 {
            Vec::new()
        } else {
            std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec()
        };
        LocalFree(output.pbData.cast());
        bytes
    };
    Ok(bytes)
}

pub(super) fn read(path: &Path) -> Result<Option<Session>, String> {
    let encrypted = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Session file read failed: {error}")),
    };
    let plaintext = crypt(&encrypted, false)?;
    serde_json::from_slice(&plaintext)
        .map(Some)
        .map_err(|_| "Invalid saved session".into())
}

pub(super) fn write(path: &Path, session: &Session) -> Result<(), String> {
    let plaintext = serde_json::to_vec(session).map_err(|_| "Session encoding failed")?;
    // Encrypt before opening any file: even temporary files contain only ciphertext.
    let encrypted = crypt(&plaintext, true)?;
    let directory = path.parent().ok_or("Invalid session file path")?;
    fs::create_dir_all(directory).map_err(|e| format!("Session directory creation failed: {e}"))?;
    let mut pending = tempfile::NamedTempFile::new_in(directory)
        .map_err(|e| format!("Session file creation failed: {e}"))?;
    pending
        .write_all(&encrypted)
        .map_err(|e| format!("Session file write failed: {e}"))?;
    pending
        .as_file()
        .sync_all()
        .map_err(|e| format!("Session file sync failed: {e}"))?;
    // Same-directory replacement preserves the previous file if writing fails.
    pending
        .persist(path)
        .map_err(|e| format!("Session file replacement failed: {}", e.error))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::Tokens;

    #[test]
    fn encrypted_session_survives_reopen_rotation_and_logout() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("session.dpapi");
        assert!(read(&path).unwrap().is_none());
        let mut session = Session {
            version: 1,
            server_url: "https://example.test/api/v1".into(),
            tokens: Tokens {
                token: Some("access-token-secret".into()),
                refresh_token: Some("refresh-token-secret".into()),
            },
        };
        write(&path, &session).unwrap();
        let bytes = fs::read(&path).unwrap();
        assert!(!bytes
            .windows(b"refresh-token-secret".len())
            .any(|w| w == b"refresh-token-secret"));
        assert!(read(&path).unwrap().unwrap().tokens == session.tokens);
        session.tokens.refresh_token = Some("rotated-refresh-token".into());
        write(&path, &session).unwrap();
        assert!(read(&path).unwrap().unwrap().tokens == session.tokens);
        session.tokens = Tokens::default();
        write(&path, &session).unwrap();
        assert!(read(&path).unwrap().unwrap().tokens == Tokens::default());
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    #[test]
    fn corrupt_file_is_reported_and_preserved() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("session.dpapi");
        fs::write(&path, b"invalid ciphertext").unwrap();
        assert!(read(&path).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"invalid ciphertext");
    }
}
