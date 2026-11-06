use std::path::{Path, PathBuf};

pub(crate) fn checked_path(value: &str) -> Result<PathBuf, String> {
    let path = Path::new(value);
    if !path.is_absolute() {
        return Err("Geçerli bir yerel dosya veya klasör yolu gerekir.".into());
    }
    let metadata = path.symlink_metadata().map_err(|_| "Konum artık mevcut değil veya erişilemiyor. Yeniden taramayı deneyin.")?;
    if !metadata.is_file() && !metadata.is_dir() {
        return Err("Yalnızca dosya ve klasör konumları gösterilebilir.".into());
    }
    path.canonicalize().map_err(|_| "Konuma erişilemiyor. Yeniden taramayı deneyin.".into())
}

pub(crate) fn reveal(value: &str) -> Result<(), String> {
    let path = checked_path(value)?;
    // Reveal only: never open a file with its associated application, and never
    // interpolate paths into a shell command. No general opener IPC is exposed.
    tauri_plugin_opener::reveal_item_in_dir(path)
        .map_err(|error| format!("Konum dosya yöneticisinde gösterilemedi: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_urls_relative_and_missing_paths() {
        for path in ["", "relative/file", "https://example.com", "file:///tmp/test"] {
            assert!(checked_path(path).is_err());
        }
        let missing = std::env::temp_dir().join(format!("roomit-missing-{}", std::process::id())).join("absent");
        assert!(checked_path(&missing.to_string_lossy()).is_err());
    }

    #[test]
    fn accepts_existing_directories_and_files_as_literal_paths() {
        let root = std::env::temp_dir().join(format!("roomit-reveal-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let file = root.join("Türkçe, boşluk & (model).exe");
        std::fs::write(&file, b"not executable; metadata test only").unwrap();
        assert_eq!(checked_path(&file.to_string_lossy()).unwrap(), file.canonicalize().unwrap());
        assert_eq!(checked_path(&root.to_string_lossy()).unwrap(), root.canonicalize().unwrap());
        std::fs::remove_file(file).unwrap();
        std::fs::remove_dir(root).unwrap();
    }

    #[test]
    #[ignore = "Opens the native file manager; requires ROOMIT_REVEAL_TEST_PATH"]
    fn native_file_manager_reveal() {
        let path = std::env::var("ROOMIT_REVEAL_TEST_PATH").expect("Provide a fixture file path");
        reveal(&path).unwrap();
    }
}
