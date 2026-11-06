use std::{path::{Path, PathBuf}, sync::{Arc, Mutex}};
use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WatchPolicy { pub excluded_paths: Vec<PathBuf>, pub app_bundles: bool, pub system_attributes: bool }

#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WatchStatus { pub index_id: String, pub stale: bool, pub unavailable: Option<String> }

struct Changes { status: Mutex<WatchStatus>, roots: Vec<PathBuf>, excluded: roomit_core::Exclusions, system_attributes: bool }
impl Changes {
    fn changed(&self, path: &Path) {
        if self.status.lock().is_ok_and(|s| s.stale) { return; }
        if !self.roots.iter().any(|root| inside(path, root)) || self.excluded.contains(path) { return; }
        if self.system_attributes && system_entry(path) { return; }
        if let Ok(mut status) = self.status.lock() { status.stale = true; }
    }
    fn unavailable(&self, reason: &str) {
        if let Ok(mut status) = self.status.lock() { status.unavailable.get_or_insert_with(|| reason.into()); }
    }
}
fn inside(path: &Path, root: &Path) -> bool {
    #[cfg(windows)]
    { PathBuf::from(path.to_string_lossy().trim_start_matches(r"\\?\").to_lowercase()).starts_with(PathBuf::from(root.to_string_lossy().trim_start_matches(r"\\?\").to_lowercase())) }
    #[cfg(not(windows))]
    { path.starts_with(root) }
}
fn system_entry(path: &Path) -> bool {
    #[cfg(windows)]
    { use std::os::windows::fs::MetadataExt; std::fs::symlink_metadata(path).is_ok_and(|m| m.file_attributes() & (4 | 0x400) != 0) }
    #[cfg(not(windows))]
    { let _ = path; false }
}
fn link(metadata: &std::fs::Metadata) -> bool {
    #[cfg(windows)]
    { use std::os::windows::fs::MetadataExt; metadata.file_attributes() & 0x400 != 0 }
    #[cfg(not(windows))]
    { metadata.is_symlink() }
}

pub(crate) struct WatchSession { changes: Arc<Changes>, _native: Native }
impl WatchSession {
    pub fn start(id: String, roots: Vec<PathBuf>, policy: WatchPolicy) -> Self {
        let excluded = roomit_core::Exclusions::new(&policy.excluded_paths, policy.app_bundles);
        let mut rejected = false;
        let mut roots: Vec<_> = roots.into_iter().filter(|p| !excluded.contains(p)).filter(|p| {
            if std::fs::symlink_metadata(p).is_ok_and(|m| link(&m)) { rejected = true; false } else { true }
        }).map(|p| p.canonicalize().unwrap_or(p)).collect();
        roots.sort(); roots.dedup();
        let changes = Arc::new(Changes { status: Mutex::new(WatchStatus { index_id: id, stale: false, unavailable: None }), roots,
            excluded, system_attributes: policy.system_attributes });
        if changes.roots.is_empty() { changes.unavailable("No scan locations could be monitored."); }
        if rejected { changes.unavailable("A scan location was replaced by a link and is not monitored."); }
        let native = Native::start(changes.clone());
        Self { changes, _native: native }
    }
    pub fn status(&self) -> WatchStatus {
        // Probe only the small list of root handles/paths, never enumerate files.
        // This also catches a renamed/deleted root or a disconnected volume.
        let stale = self.changes.status.lock().unwrap().stale;
        if !stale {
            for root in &self.changes.roots {
                if !std::fs::symlink_metadata(root).is_ok_and(|m| m.is_dir() && !link(&m)) {
                    self.changes.unavailable("A scanned location is inaccessible. Changes cannot be monitored.");
                    self.changes.changed(root);
                }
            }
        }
        self.changes.status.lock().unwrap().clone()
    }
}
#[derive(Default, Clone)]
pub(crate) struct WatchRegistry(Arc<Mutex<Option<Arc<WatchSession>>>>);
impl WatchRegistry {
    pub fn publish(&self, session: WatchSession) -> Result<(), String> {
        let old = self.0.lock().map_err(|_| "Could not read monitoring state.")?.replace(Arc::new(session));
        drop(old); Ok(())
    }
    pub fn status(&self, id: &str) -> Result<WatchStatus, String> {
        let session = self.0.lock().map_err(|_| "Could not read monitoring state.")?.as_ref().filter(|s| s.changes.status.lock().unwrap().index_id == id).cloned();
        session.map(|s| s.status()).ok_or_else(|| "Change monitoring is not active for these results.".into())
    }
}

#[cfg(windows)]
use windows_native::Native;
#[cfg(windows)]
mod windows_native {
    use super::*;
    use std::{io, os::windows::ffi::{OsStrExt, OsStringExt}, ptr, sync::mpsc, thread};
    use windows_sys::Win32::{Foundation::*, Storage::FileSystem::*, System::{IO::*, Threading::*}};

    struct Handle(HANDLE);
    // These kernel handles have no thread affinity. Shared handles below are
    // manual-reset stop events; directory/IO handles remain owned by one worker.
    unsafe impl Send for Handle {}
    unsafe impl Sync for Handle {}
    impl Drop for Handle { fn drop(&mut self) { unsafe { CloseHandle(self.0); } } }
    fn event() -> io::Result<Handle> {
        let handle = unsafe { CreateEventW(ptr::null(), 1, 0, ptr::null()) };
        if handle.is_null() { Err(io::Error::last_os_error()) } else { Ok(Handle(handle)) }
    }
    pub(super) struct Native { stop: Option<Arc<Handle>>, workers: Vec<thread::JoinHandle<()>> }
    impl Native {
        pub fn start(changes: Arc<Changes>) -> Self {
            let mut result = Self { stop: None, workers: Vec::new() };
            let stop = match event() { Ok(stop) => Arc::new(stop), Err(_) => { changes.unavailable("Could not start change monitoring."); return result } };
            result.stop = Some(stop.clone());
            let mut paths: Vec<_> = changes.roots.iter().cloned().map(|p| (p, true)).collect();
            // A directory handle reports its children. Watch its parent without
            // recursion too, so renaming/removing/replacing the root is detected.
            for root in &changes.roots {
                if let Some(parent) = root.parent() {
                    if !paths.iter().any(|(p, _)| p == parent) { paths.push((parent.to_path_buf(), false)); }
                }
            }
            for (root, recursive) in paths {
                let (ready, receiver) = mpsc::sync_channel(1);
                let state = changes.clone(); let stop = stop.clone();
                match thread::Builder::new().name("roomit-changes".into()).spawn(move || {
                    if run(&root, recursive, &stop, &state, ready).is_err() { state.unavailable("Change monitoring stopped or could not start at a scan location."); }
                }) {
                    Ok(worker) => { result.workers.push(worker); if receiver.recv().is_err() { changes.unavailable("Could not start change monitoring at a scan location."); } }
                    Err(_) => changes.unavailable("Could not start the change monitoring worker."),
                }
            }
            result
        }
    }
    impl Drop for Native {
        fn drop(&mut self) {
            if let Some(stop) = &self.stop { unsafe { SetEvent(stop.0); } }
            for worker in self.workers.drain(..) { let _ = worker.join(); }
        }
    }
    fn run(root: &Path, recursive: bool, stop: &Handle, changes: &Changes, ready: mpsc::SyncSender<()>) -> io::Result<()> {
        let path: Vec<u16> = root.as_os_str().encode_wide().chain(Some(0)).collect();
        let directory = unsafe { CreateFileW(path.as_ptr(), FILE_LIST_DIRECTORY, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            ptr::null(), OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OVERLAPPED, ptr::null_mut()) };
        if directory == INVALID_HANDLE_VALUE { return Err(io::Error::last_os_error()); }
        let directory = Handle(directory); let completed = event()?;
        let mut overlapped = Box::new(OVERLAPPED::default()); overlapped.hEvent = completed.0;
        // DWORD-aligned and at the 64 KiB network limit. Neither this buffer
        // nor OVERLAPPED moves or drops until pending IO has completed/cancelled.
        let mut buffer = vec![0u32; 16_384]; let mut ready = Some(ready);
        loop {
            unsafe { ResetEvent(completed.0); }
            let queued = unsafe { ReadDirectoryChangesW(directory.0, buffer.as_mut_ptr().cast(), (buffer.len() * 4) as u32, recursive.into(),
                FILE_NOTIFY_CHANGE_FILE_NAME | FILE_NOTIFY_CHANGE_DIR_NAME | FILE_NOTIFY_CHANGE_SIZE | FILE_NOTIFY_CHANGE_LAST_WRITE | FILE_NOTIFY_CHANGE_CREATION | FILE_NOTIFY_CHANGE_ATTRIBUTES,
                ptr::null_mut(), &mut *overlapped, None) };
            if queued == 0 && unsafe { GetLastError() } != ERROR_IO_PENDING { return Err(io::Error::last_os_error()); }
            if let Some(ready) = ready.take() { let _ = ready.send(()); }
            let handles = [stop.0, completed.0];
            let wait = unsafe { WaitForMultipleObjects(2, handles.as_ptr(), 0, INFINITE) };
            if wait != WAIT_OBJECT_0 + 1 {
                unsafe { CancelIoEx(directory.0, &*overlapped); }
                let mut ignored = 0; unsafe { GetOverlappedResult(directory.0, &*overlapped, &mut ignored, 1); }
                return if wait == WAIT_OBJECT_0 { Ok(()) } else { Err(io::Error::last_os_error()) };
            }
            let mut bytes = 0;
            if unsafe { GetOverlappedResult(directory.0, &*overlapped, &mut bytes, 0) } == 0 {
                changes.unavailable("Some file change events were lost. Rescanning is recommended.");
                return Err(io::Error::last_os_error());
            }
            if bytes == 0 {
                // Windows explicitly signals a discarded/overflowed event batch
                // with zero bytes. Never silently report complete monitoring.
                changes.unavailable("Too many changes to verify freshness. Rescanning is recommended.");
            } else {
                if bytes as usize > buffer.len() * 4 { return Err(io::Error::other("Invalid change event packet.")); }
                let data = unsafe { std::slice::from_raw_parts(buffer.as_ptr().cast::<u8>(), bytes as usize) };
                match parse_names(data) {
                    Ok(names) => for name in names { changes.changed(&root.join(name)); },
                    Err(_) => changes.unavailable("Some file changes could not be read. Rescanning is recommended."),
                }
            }
        }
    }
    pub(super) fn parse_names(data: &[u8]) -> Result<Vec<PathBuf>, ()> {
        let mut names = Vec::new(); let mut offset = 0;
        loop {
            let header = data.get(offset..offset + 12).ok_or(())?;
            let next = u32::from_le_bytes(header[0..4].try_into().unwrap()) as usize;
            let length = u32::from_le_bytes(header[8..12].try_into().unwrap()) as usize;
            if length == 0 || length % 2 != 0 { return Err(()); }
            let end = offset.checked_add(12).and_then(|v| v.checked_add(length)).ok_or(())?;
            let name = data.get(offset + 12..end).ok_or(())?;
            let units: Vec<u16> = name.chunks_exact(2).map(|s| u16::from_le_bytes([s[0], s[1]])).collect();
            let path = PathBuf::from(std::ffi::OsString::from_wide(&units));
            if path.is_absolute() || path.components().any(|c| !matches!(c, std::path::Component::Normal(_))) { return Err(()); }
            names.push(path);
            if next == 0 { return Ok(names); }
            if next < 12 + length || next % 4 != 0 { return Err(()); }
            offset = offset.checked_add(next).ok_or(())?;
        }
    }
}

#[cfg(target_os = "macos")]
struct Native { _watcher: Option<notify::RecommendedWatcher> }
#[cfg(target_os = "macos")]
impl Native {
    fn start(changes: Arc<Changes>) -> Self {
        use notify::{Watcher, RecursiveMode, EventKind, Config};
        let state = changes.clone();
        let watcher = notify::RecommendedWatcher::new(move |event: notify::Result<notify::Event>| {
            match event {
                Ok(event) if event.need_rescan() => state.unavailable("Some file change events were lost. Rescanning is recommended."),
                Ok(event) if !matches!(event.kind, EventKind::Access(_)) => {
                    if event.paths.is_empty() { state.unavailable("The file change location could not be identified."); }
                    for path in event.paths { state.changed(&path); }
                }
                Ok(_) => {},
                Err(_) => state.unavailable("File change monitoring stopped or could not start."),
            }
        }, Config::default().with_follow_symlinks(false));
        let mut watcher = match watcher { Ok(watcher) => watcher, Err(_) => { changes.unavailable("Could not start file change monitoring."); return Self { _watcher: None } } };
        for root in &changes.roots { if watcher.watch(root, RecursiveMode::Recursive).is_err() { changes.unavailable("File changes cannot be monitored at a location."); } }
        Self { _watcher: Some(watcher) }
    }
}
#[cfg(not(any(windows, target_os = "macos")))]
struct Native;
#[cfg(not(any(windows, target_os = "macos")))]
impl Native { fn start(changes: Arc<Changes>) -> Self { changes.unavailable("Change monitoring is not supported on this system."); Self } }

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, time::{Instant, Duration}};
    fn policy(excluded_paths: Vec<PathBuf>) -> WatchPolicy { WatchPolicy { excluded_paths, app_bundles: true, system_attributes: cfg!(windows) } }
    fn wait_stale(session: &WatchSession) {
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            if session.status().stale { return; }
            std::thread::sleep(Duration::from_millis(20));
        }
        panic!("Native change was not reported: {:?}", session.status());
    }
    #[cfg(windows)]
    #[test]
    fn windows_native_detects_create_modify_rename_remove_and_root_rename() {
        for action in ["create", "modify", "rename", "remove", "root-rename"] {
            let fixture = tempfile::tempdir().unwrap(); let root = fixture.path().join("watched");
            fs::create_dir_all(root.join("nested")).unwrap(); fs::write(root.join("nested/file"), b"old").unwrap();
            let session = WatchSession::start(action.into(), vec![root.clone()], policy(vec![]));
            assert!(session.status().unavailable.is_none(), "{:?}", session.status());
            match action {
                "create" => fs::write(root.join("nested/new-file"), b"new").unwrap(),
                "modify" => fs::write(root.join("nested/file"), b"different data").unwrap(),
                "rename" => fs::rename(root.join("nested/file"), root.join("nested/renamed")).unwrap(),
                "remove" => fs::remove_file(root.join("nested/file")).unwrap(),
                _ => fs::rename(&root, fixture.path().join("moved")).unwrap(),
            }
            wait_stale(&session);
        }
    }
    #[cfg(windows)]
    #[test]
    fn windows_excluded_subtrees_app_bundles_and_reads_do_not_invalidate_results() {
        let fixture = tempfile::tempdir().unwrap(); let root = fixture.path().join("watched");
        for dir in ["skip", "skip-sibling", "Editor.app/Contents"] { fs::create_dir_all(root.join(dir)).unwrap(); }
        fs::write(root.join("keep"), b"unchanged").unwrap();
        let session = WatchSession::start("excluded".into(), vec![root.clone()], policy(vec![root.join("skip")]));
        fs::write(root.join("skip/new"), b"excluded").unwrap(); fs::write(root.join("Editor.app/Contents/new"), b"installed").unwrap();
        assert_eq!(fs::read(root.join("keep")).unwrap(), b"unchanged");
        std::thread::sleep(Duration::from_millis(400));
        assert!(!session.status().stale); assert!(session.status().unavailable.is_none());
        fs::write(root.join("skip-sibling/keep"), b"included").unwrap(); wait_stale(&session);
    }
    #[cfg(windows)]
    #[test]
    fn replacing_a_watch_discards_old_events_and_new_session_starts_clean() {
        let fixture = tempfile::tempdir().unwrap(); let one = fixture.path().join("one"); let two = fixture.path().join("two");
        fs::create_dir(&one).unwrap(); fs::create_dir(&two).unwrap();
        let registry = WatchRegistry::default();
        let old = WatchSession::start("old".into(), vec![one.clone()], policy(vec![]));
        fs::write(one.join("old"), b"change").unwrap(); wait_stale(&old); registry.publish(old).unwrap();
        registry.publish(WatchSession::start("new".into(), vec![two.clone()], policy(vec![]))).unwrap();
        assert!(registry.status("old").is_err()); fs::write(one.join("ignored"), b"old scope").unwrap();
        std::thread::sleep(Duration::from_millis(150)); assert!(!registry.status("new").unwrap().stale);
        fs::write(two.join("new"), b"new scope").unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        while !registry.status("new").unwrap().stale && Instant::now() < deadline { std::thread::sleep(Duration::from_millis(20)); }
        assert!(registry.status("new").unwrap().stale);
    }
    #[test]
    fn missing_root_and_lost_events_never_claim_complete_monitoring() {
        let fixture = tempfile::tempdir().unwrap();
        let session = WatchSession::start("missing".into(), vec![fixture.path().join("missing")], policy(vec![]));
        assert!(session.status().unavailable.is_some());
        let state = Changes { status: Mutex::new(WatchStatus { index_id: "loss".into(), stale: false, unavailable: None }), roots: vec![fixture.path().to_path_buf()], excluded: roomit_core::Exclusions::new(&[], false), system_attributes: false };
        state.unavailable("Event batch lost"); assert!(state.status.lock().unwrap().unavailable.is_some());
        state.changed(&fixture.path().join("included")); assert!(state.status.lock().unwrap().stale);
        state.unavailable("Later error"); assert!(state.status.lock().unwrap().stale);
    }
    #[cfg(windows)]
    #[test]
    fn windows_notification_parser_preserves_unicode_and_rejects_invalid_packets() {
        let units: Vec<u16> = "nested\\Türkçe file.txt".encode_utf16().collect();
        let mut packet = vec![0u8; 12]; packet[4..8].copy_from_slice(&1u32.to_le_bytes());
        packet[8..12].copy_from_slice(&((units.len() * 2) as u32).to_le_bytes());
        for unit in units { packet.extend_from_slice(&unit.to_le_bytes()); }
        assert_eq!(windows_native::parse_names(&packet).unwrap(), [PathBuf::from("nested/Türkçe file.txt")]);
        assert!(windows_native::parse_names(&[]).is_err());
        assert!(windows_native::parse_names(&packet[..packet.len() - 1]).is_err());
        packet[0..4].copy_from_slice(&4u32.to_le_bytes()); assert!(windows_native::parse_names(&packet).is_err());
    }
}
