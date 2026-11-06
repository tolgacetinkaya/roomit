use std::{fs, io::{self, Write}, path::{Path, PathBuf}, sync::{Arc, Mutex}};
use serde::{Serialize, Deserialize};

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Settings { excluded_paths: Vec<String> }

#[derive(Clone)]
pub struct ExclusionStore { file: PathBuf, lock: Arc<Mutex<()>> }
impl ExclusionStore {
    pub fn new(directory: PathBuf) -> Self { Self { file: directory.join("scan-exclusions.json"), lock: Arc::new(Mutex::new(())) } }
    fn load(&self) -> Result<Settings, String> {
        match fs::read(&self.file) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(|e| format!("Could not read exclusions: {e}. The file was preserved.")),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(Settings::default()),
            Err(e) => Err(format!("Could not read exclusions: {e}")),
        }
    }
    pub fn paths(&self) -> Result<Vec<String>, String> {
        let _guard = self.lock.lock().map_err(|_| "Could not lock settings.")?;
        Ok(self.load()?.excluded_paths)
    }
    pub fn directory(&self) -> PathBuf { self.file.parent().unwrap().to_path_buf() }
    pub fn change(&self, add: Vec<String>, remove: Option<String>) -> Result<Vec<String>, String> {
        let _guard = self.lock.lock().map_err(|_| "Could not lock settings.")?;
        let mut settings = self.load()?;
        // Validate the entire addition before writing anything. Existing missing
        // paths (e.g. an unplugged disk) remain saved until explicitly removed.
        let additions = add.iter().map(|s| checked_directory(s)).collect::<Result<Vec<_>, _>>()?;
        if let Some(remove) = remove { settings.excluded_paths.retain(|s| !same_path(s, &remove)); }
        for path in additions {
            if !settings.excluded_paths.iter().any(|s| same_path(s, &path)) { settings.excluded_paths.push(path); }
        }
        let parent = self.file.parent().unwrap();
        fs::create_dir_all(parent).map_err(|e| format!("Could not create settings folder: {e}"))?;
        let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
        serde_json::to_writer_pretty(temporary.as_file_mut(), &settings).map_err(|e| e.to_string())?;
        temporary.flush().map_err(|e| e.to_string())?;
        temporary.as_file().sync_all().map_err(|e| e.to_string())?;
        temporary.persist(&self.file).map_err(|e| format!("Could not save exclusions: {e}"))?;
        Ok(settings.excluded_paths)
    }
}
fn same_path(a: &str, b: &str) -> bool {
    if cfg!(windows) { a.eq_ignore_ascii_case(b) } else { a == b }
}
fn checked_directory(value: &str) -> Result<String, String> {
    let path = Path::new(value);
    if !path.is_absolute() { return Err("Select an absolute folder path.".into()); }
    let metadata = fs::symlink_metadata(path).map_err(|e| format!("Could not validate folder: {e}"))?;
    #[cfg(windows)]
    let link = { use std::os::windows::fs::MetadataExt; metadata.file_attributes() & 0x400 != 0 };
    #[cfg(not(windows))]
    let link = metadata.is_symlink();
    if !metadata.is_dir() || link { return Err("Select a folder directly instead of a link.".into()); }
    let path = path.canonicalize().map_err(|e| e.to_string())?;
    let text = path.to_string_lossy();
    #[cfg(windows)]
    { Ok(if let Some(unc) = text.strip_prefix(r"\\?\UNC\") { format!(r"\\{unc}") } else { text.trim_start_matches(r"\\?\").to_owned() }) }
    #[cfg(not(windows))]
    { Ok(text.into_owned()) }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExclusionView { pub user_paths: Vec<String>, pub automatic_paths: Vec<String>, pub notes: Vec<String> }

pub fn view(store: &ExclusionStore) -> Result<ExclusionView, String> {
    let (paths, notes) = automatic_paths();
    Ok(ExclusionView { user_paths: store.paths()?, automatic_paths: paths.iter().map(|p| p.to_string_lossy().into_owned()).collect(), notes })
}

pub fn automatic_paths() -> (Vec<PathBuf>, Vec<String>) {
    let mut paths = Vec::new();
    let mut notes = Vec::new();
    #[cfg(windows)]
    {
        for key in ["SystemRoot", "ProgramFiles", "ProgramFiles(x86)", "ProgramW6432", "ProgramData"] {
            if let Some(value) = std::env::var_os(key) { paths.push(PathBuf::from(value)); }
        }
        // Standard installation/system names on every local volume, including
        // installations on another drive. Never recursively inspect these trees.
        for disk in sysinfo::Disks::new_with_refreshed_list().list() {
            for name in ["Windows", "Program Files", "Program Files (x86)", "ProgramData", "WindowsApps", "WpSystem", "Recovery", "System Volume Information", "$RECYCLE.BIN", "$Windows.~BT", "$Windows.~WS", "Config.Msi", "MSOCache"] {
                paths.push(disk.mount_point().join(name));
            }
            for name in ["pagefile.sys", "swapfile.sys", "hiberfil.sys", "DumpStack.log.tmp", "bootmgr", "BOOTNXT"] { paths.push(disk.mount_point().join(name)); }
        }
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            let local = PathBuf::from(local);
            for name in ["Programs", "Microsoft/WindowsApps", "Packages"] { paths.push(local.join(name)); }
        }
        if let Ok(exe) = std::env::current_exe() { paths.push(exe); }
        registered_installations(&mut paths, &mut notes);
    }
    #[cfg(target_os = "macos")]
    {
        // Do not exclude /System wholesale: APFS user data is mounted beneath
        // /System/Volumes/Data. Apply its system subtrees individually instead.
        for name in ["/Applications", "/Library", "/bin", "/sbin", "/usr", "/opt", "/private", "/etc", "/var", "/tmp", "/dev", "/cores", "/.Spotlight-V100", "/.fseventsd", "/.Trashes", "/System/Applications", "/System/Library", "/System/DriverKit", "/System/iOSSupport", "/System/Cryptexes", "/System/Volumes/Preboot", "/System/Volumes/VM", "/System/Volumes/Update"] {
            paths.push(PathBuf::from(name));
            if !name.starts_with("/System/") { paths.push(PathBuf::from(format!("/System/Volumes/Data{name}"))); }
        }
        for (directory, allowed_child) in [("/System", "Volumes"), ("/System/Volumes", "Data")] {
            if let Ok(entries) = fs::read_dir(directory) {
                paths.extend(entries.flatten().filter(|e| e.file_name() != allowed_child).map(|e| e.path()));
            }
        }
        for disk in sysinfo::Disks::new_with_refreshed_list().list() {
            for name in [".Spotlight-V100", ".fseventsd", ".Trashes", ".DocumentRevisions-V100"] { paths.push(disk.mount_point().join(name)); }
        }
        if let Some(home) = std::env::var_os("HOME") { paths.push(PathBuf::from(home).join("Applications")); }
        notes.push("Application bundles (.app) are excluded, even when a subfolder is selected.".into());
    }
    paths.retain(|p| p.is_absolute()); paths.sort(); paths.dedup();
    (paths, notes)
}

#[cfg(windows)]
fn registered_installations(paths: &mut Vec<PathBuf>, notes: &mut Vec<String>) {
    use winreg::{HKCU, HKLM, enums::{KEY_READ, KEY_WOW64_32KEY, KEY_WOW64_64KEY}};
    for hive in [HKCU, HKLM] {
        for view in [KEY_WOW64_32KEY, KEY_WOW64_64KEY] {
            for (branch, value, executable) in [
                (r"Software\Microsoft\Windows\CurrentVersion\Uninstall", "InstallLocation", false),
                (r"Software\Microsoft\Windows\CurrentVersion\Uninstall", "DisplayIcon", true),
                (r"Software\Microsoft\Windows\CurrentVersion\App Paths", "", true),
            ] {
                let key = match hive.open_subkey_with_flags(branch, KEY_READ | view) {
                    Ok(key) => key,
                    Err(e) if e.kind() == io::ErrorKind::NotFound => continue,
                    Err(_) => { notes.push("Some application records could not be read. Standard system and installation locations remain excluded.".into()); continue; }
                };
                for name in key.enum_keys().flatten() {
                    let Ok(app) = key.open_subkey_with_flags(name, KEY_READ | view) else { continue };
                    let Ok(location) = app.get_value::<String, _>(value) else { continue };
                    let candidate = PathBuf::from(location.trim().trim_matches('"'));
                    let candidate = if value == "DisplayIcon" { app.get_value::<String,_>("DisplayName").ok().and_then(|display|crate::inventory::icon_install_directory(&display,&location)) }
                        else if executable { candidate.parent().map(Path::to_path_buf) } else { Some(candidate) };
                    if let Some(candidate) = candidate.filter(|p| p.is_absolute() && p.parent().is_some() && p.file_name().is_some()) {
                        // Empty/drive-root registrations must not hide a whole disk.
                        paths.push(candidate);
                    }
                }
            }
        }
    }
    notes.sort(); notes.dedup();
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_policy_contains_system_locations_and_never_excludes_a_volume_root() {
        let (paths, _) = automatic_paths();
        assert!(paths.iter().all(|p| p.is_absolute() && p.parent().is_some()));
        #[cfg(windows)]
        {
            assert!(paths.contains(&PathBuf::from(std::env::var_os("SystemRoot").unwrap())));
            assert!(paths.contains(&std::env::current_exe().unwrap()));
            assert!(paths.iter().any(|p| p.ends_with("Program Files")));
        }
        #[cfg(target_os = "macos")]
        {
            assert!(paths.contains(&PathBuf::from("/System/Library")));
            assert!(!paths.contains(&PathBuf::from("/System")));
            assert!(!paths.contains(&PathBuf::from("/System/Volumes/Data")));
        }
    }
    #[test]
    fn persists_deduplicates_and_preserves_missing_paths_until_removed() {
        let fixture = tempfile::tempdir().unwrap();
        let dir = fixture.path().join("Türkçe klasör"); fs::create_dir(&dir).unwrap();
        let store = ExclusionStore::new(fixture.path().join("config"));
        let paths = store.change(vec![dir.to_string_lossy().into(), dir.to_string_lossy().into()], None).unwrap();
        assert_eq!(paths.len(), 1);
        fs::remove_dir(&dir).unwrap();
        let reopened = ExclusionStore::new(fixture.path().join("config"));
        assert_eq!(reopened.paths().unwrap(), paths);
        assert!(reopened.change(vec!["relative".into()], None).is_err());
        assert_eq!(reopened.paths().unwrap(), paths);
        assert!(reopened.change(vec![], Some(paths[0].clone())).unwrap().is_empty());
        assert!(store.paths().unwrap().is_empty());
    }
    #[test]
    fn corrupt_settings_are_not_overwritten_and_failed_saves_are_reported() {
        let fixture = tempfile::tempdir().unwrap();
        let store = ExclusionStore::new(fixture.path().to_path_buf());
        fs::write(&store.file, b"broken").unwrap();
        assert!(store.paths().is_err());
        assert!(store.change(vec![], None).is_err());
        assert_eq!(fs::read(&store.file).unwrap(), b"broken");
        let blocked = fixture.path().join("file"); fs::write(&blocked, b"keep").unwrap();
        assert!(ExclusionStore::new(blocked).change(vec![], None).is_err());
    }
}
