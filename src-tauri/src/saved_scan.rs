use std::{fs, io::{self, Write}, path::{Path, PathBuf}, sync::{Arc, Mutex}};
use rusqlite::{Connection, OpenFlags, params};
use serde::{Deserialize, Serialize};
use crate::{DesktopReport, size_index::IndexSnapshot};

const FORMAT: u32 = 1;
#[derive(Deserialize, Serialize)]
struct Pointer { format: u32, directory: String }
#[derive(Clone)]
pub(crate) struct SavedScanStore { pub directory: PathBuf, lock: Arc<Mutex<()>> }
impl SavedScanStore {
    pub fn new(directory: PathBuf) -> Self { Self { directory, lock: Arc::new(Mutex::new(())) } }
    /// Summary and full size index share one generation. Publish the pointer only
    /// after both have committed, so failed/interrupted scans keep the old result.
    pub fn save(&self, snapshot: &mut IndexSnapshot, report: &DesktopReport) -> Result<(), String> {
        let _guard = self.lock.lock().map_err(|_| "Could not lock saved results.")?;
        let generation = snapshot.database.parent().ok_or("Result folder not found.")?;
        let name = generation.file_name().and_then(|n| n.to_str()).ok_or("Invalid result folder.")?;
        if generation.parent() != Some(self.directory.as_path()) || !valid_generation(name) || snapshot.id != report.size_index_id {
            return Err("Saved results must be inside the app data folder.".into());
        }
        let connection = Connection::open_with_flags(&snapshot.database, OpenFlags::SQLITE_OPEN_READ_WRITE).map_err(|e| e.to_string())?;
        connection.execute_batch("PRAGMA synchronous=FULL; BEGIN IMMEDIATE;
            CREATE TABLE saved_report(id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
            PRAGMA user_version=1;").map_err(|e| e.to_string())?;
        connection.execute("INSERT INTO saved_report(id,json) VALUES(1,?1)", params![serde_json::to_string(report).map_err(|e| e.to_string())?]).map_err(|e| e.to_string())?;
        connection.execute_batch("COMMIT;").map_err(|e| e.to_string())?;
        drop(connection);
        fs::OpenOptions::new().read(true).write(true).open(&snapshot.database).and_then(|f| f.sync_all()).map_err(|e| e.to_string())?;
        let mut temporary = tempfile::NamedTempFile::new_in(&self.directory).map_err(|e| e.to_string())?;
        serde_json::to_writer(temporary.as_file_mut(), &Pointer { format: FORMAT, directory: name.into() }).map_err(|e| e.to_string())?;
        temporary.flush().map_err(|e| e.to_string())?;
        temporary.as_file().sync_all().map_err(|e| e.to_string())?;
        temporary.persist(self.directory.join("current.json")).map_err(|e| e.to_string())?;
        if let Some(directory) = snapshot.directory.take() { let _ = directory.keep(); }
        snapshot.persistent_root = Some(self.directory.clone());
        Ok(())
    }
    pub fn load(&self) -> Result<Option<(DesktopReport, IndexSnapshot)>, String> {
        let _guard = self.lock.lock().map_err(|_| "Could not lock saved results.")?;
        let pointer = match fs::read(self.directory.join("current.json")) {
            Ok(bytes) => serde_json::from_slice::<Pointer>(&bytes).map_err(|e| e.to_string())?,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(e.to_string()),
        };
        if pointer.format != FORMAT || !valid_generation(&pointer.directory) { return Err("Unsupported saved format or invalid result path.".into()); }
        let generation = self.directory.join(&pointer.directory);
        for path in [&generation, &generation.join("results.sqlite")] {
            let metadata = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
            if is_link(&metadata) { return Err("The saved result location cannot be a link.".into()); }
        }
        let database = generation.join("results.sqlite");
        let connection = Connection::open_with_flags(&database, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(|e| e.to_string())?;
        let version: u32 = connection.query_row("PRAGMA user_version", [], |row| row.get(0)).map_err(|e| e.to_string())?;
        if version != FORMAT { return Err("Unsupported saved scan version.".into()); }
        let json: String = connection.query_row("SELECT json FROM saved_report WHERE id=1", [], |row| row.get(0)).map_err(|e| e.to_string())?;
        let report: DesktopReport = serde_json::from_str(&json).map_err(|e| e.to_string())?;
        if report.size_index_id.is_empty() || report.size_index_id.len() > 128 || report.scanned_at_ms == 0 ||
            !["recursive", "disk", "computer", "ai"].contains(&report.report.scope.as_str()) {
            return Err("Invalid saved scan metadata.".into());
        }
        connection.prepare("SELECT kind,sort_key,path,search_key,complete FROM entries LIMIT 0").map_err(|e| e.to_string())?;
        let id = report.size_index_id.clone();
        Ok(Some((report, IndexSnapshot { id,
            database, directory: None, persistent_root: Some(self.directory.clone()), retired: Default::default() })))
    }
}
fn valid_generation(name: &str) -> bool {
    name.strip_prefix("scan-").is_some_and(|suffix| suffix.len() >= 6 && suffix.bytes().all(|b| b.is_ascii_alphanumeric()))
}
fn is_link(metadata: &fs::Metadata) -> bool {
    #[cfg(windows)]
    { use std::os::windows::fs::MetadataExt; metadata.file_attributes() & 0x400 != 0 }
    #[cfg(not(windows))]
    { metadata.is_symlink() }
}
pub(super) fn cleanup_generation(database: &Path, root: &Path) {
    let Some(generation) = database.parent() else { return };
    if generation.parent() != Some(root) || !generation.file_name().and_then(|s| s.to_str()).is_some_and(valid_generation) { return; }
    let Ok(metadata) = fs::symlink_metadata(generation) else { return };
    if is_link(&metadata) || !metadata.is_dir() { return; }
    // Resolve and verify the actual parent before removing an app-owned generation.
    if generation.canonicalize().ok().and_then(|p| p.parent().map(Path::to_path_buf)) != root.canonicalize().ok() { return; }
    let _ = fs::remove_dir_all(generation);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::size_index::{IndexWriter, PageRequest, ResultIndexes};
    use roomit_core::{EntryKind, SizedEntry, SizeSink};
    use std::sync::atomic::AtomicBool;
    fn report(id: &str, root: &Path) -> DesktopReport {
        DesktopReport { report: roomit_core::inspect_workspace(root).unwrap(), size_index_id: id.into(), scanned_at_ms: 1_794_000_000_000, persistence_error: None, watch_policy: None, ai_tool_id: None }
    }
    fn request(id: &str, query: &str) -> PageRequest {
        PageRequest { index_id: id.into(), request_id: "test-query".into(), kind: "file".into(), minimum_bytes: "5000000000".into(), query: query.into(), cursor: None, direction: "next".into(), include_total: true }
    }
    #[test]
    fn saved_reports_from_before_monitoring_load_without_a_watch_policy() {
        let fixture = tempfile::tempdir().unwrap();
        let mut json = serde_json::to_value(report("legacy", fixture.path())).unwrap();
        json.as_object_mut().unwrap().remove("watchPolicy");
        json.as_object_mut().unwrap().remove("aiToolId");
        let restored: DesktopReport = serde_json::from_value(json).unwrap();
        assert!(restored.watch_policy.is_none()); assert_eq!(restored.size_index_id, "legacy");
        assert!(restored.ai_tool_id.is_none());
    }
    #[test]
    fn ai_scope_survives_saved_scan_reopening() {
        let fixture = tempfile::tempdir().unwrap();
        let store = SavedScanStore::new(fixture.path().join("saved"));
        let mut report = report("ai", fixture.path()); report.report.scope = "ai".into();
        report.ai_tool_id = Some("codex".into());
        let mut snapshot = IndexWriter::new_in(&store.directory).unwrap().finish("ai".into()).unwrap();
        store.save(&mut snapshot, &report).unwrap(); drop(snapshot);
        let restored = store.load().unwrap().unwrap().0;
        assert_eq!(restored.report.scope, "ai");
        assert_eq!(restored.ai_tool_id.as_deref(), Some("codex"));
    }
    #[test]
    fn reopened_store_restores_report_exact_bytes_partial_flags_and_full_paged_index() {
        let fixture = tempfile::tempdir().unwrap();
        let store = SavedScanStore::new(fixture.path().join("saved"));
        let source = fixture.path().join("source"); fs::create_dir(&source).unwrap();
        fs::write(source.join("package.json"), b"{}").unwrap();
        fs::create_dir(source.join("node_modules")).unwrap(); fs::write(source.join("node_modules/library"), b"bytes").unwrap();
        let mut report = report("scan-id", &source);
        report.report.status = roomit_core::ScanStatus::Cancelled;
        report.report.total_size_complete = false;
        report.report.stats.total_logical_bytes = u64::MAX;
        let expected = serde_json::to_value(&report).unwrap();
        let mut writer = IndexWriter::new_in(&store.directory).unwrap();
        for number in 0..10_073 {
            writer.record(&SizedEntry { kind: EntryKind::File, path: format!("/Arşiv/model-{number:05}"), logical_bytes: if number == 10_072 { u64::MAX } else { 5_000_000_000 }, size_complete: number != 10_072 }).unwrap();
        }
        let mut snapshot = writer.finish("scan-id".into()).unwrap();
        store.save(&mut snapshot, &report).unwrap();
        let database = snapshot.database.clone(); drop(snapshot); drop(store);
        assert!(database.exists());
        let reopened = SavedScanStore::new(fixture.path().join("saved"));
        let (restored, index) = reopened.load().unwrap().unwrap();
        assert_eq!(serde_json::to_value(restored).unwrap(), expected);
        let first = index.query(&request("scan-id", ""), Arc::new(AtomicBool::new(false))).unwrap();
        assert_eq!(first.total.as_deref(), Some("10073")); assert_eq!(first.entries.len(), 50); assert!(first.has_next);
        assert_eq!(first.entries[0].logical_bytes, u64::MAX); assert!(!first.entries[0].size_complete);
        let found = index.query(&request("scan-id", "model-10071"), Arc::new(AtomicBool::new(false))).unwrap();
        assert_eq!(found.total.as_deref(), Some("1")); assert_eq!(found.entries[0].logical_bytes, 5_000_000_000);
        assert_eq!(fs::read(source.join("node_modules/library")).unwrap(), b"bytes");
    }
    #[test]
    fn replacement_waits_for_readers_and_shutdown_keeps_current_generation() {
        let fixture = tempfile::tempdir().unwrap(); let store = SavedScanStore::new(fixture.path().join("saved"));
        let source = fixture.path().join("source"); fs::create_dir(&source).unwrap();
        let indexes = ResultIndexes::default();
        let mut first = IndexWriter::new_in(&store.directory).unwrap().finish("first".into()).unwrap();
        store.save(&mut first, &report("first", &source)).unwrap(); indexes.publish(first).unwrap();
        let reader = indexes.get("first").unwrap(); let old = reader.database.clone();
        let mut second = IndexWriter::new_in(&store.directory).unwrap().finish("second".into()).unwrap();
        store.save(&mut second, &report("second", &source)).unwrap(); let current = second.database.clone();
        indexes.publish(second).unwrap(); assert!(old.exists());
        assert!(reader.query(&request("first", ""), Arc::new(AtomicBool::new(false))).is_ok());
        drop(reader); assert!(!old.exists()); drop(indexes); assert!(current.exists());
        assert_eq!(store.load().unwrap().unwrap().0.size_index_id, "second");
    }
    #[test]
    fn interrupted_or_failed_replacement_preserves_previous_saved_result() {
        let fixture = tempfile::tempdir().unwrap(); let store = SavedScanStore::new(fixture.path().join("saved"));
        let source = fixture.path().join("source"); fs::create_dir(&source).unwrap();
        let indexes = ResultIndexes::default();
        let mut first = IndexWriter::new_in(&store.directory).unwrap().finish("first".into()).unwrap();
        store.save(&mut first, &report("first", &source)).unwrap(); let old = first.database.clone(); indexes.publish(first).unwrap();
        let pointer = fs::read(store.directory.join("current.json")).unwrap();
        let interrupted = IndexWriter::new_in(&store.directory).unwrap(); let temporary = interrupted.directories_to_exclude()[0].clone(); drop(interrupted);
        assert!(!temporary.exists()); assert_eq!(fs::read(store.directory.join("current.json")).unwrap(), pointer);
        let mut failed = IndexWriter::new_in(&store.directory).unwrap().finish("failed".into()).unwrap();
        assert!(store.save(&mut failed, &report("wrong-id", &source)).is_err());
        indexes.publish(failed).unwrap(); drop(indexes); assert!(old.exists());
        assert_eq!(store.load().unwrap().unwrap().0.size_index_id, "first");
        assert_eq!(fs::read(store.directory.join("current.json")).unwrap(), pointer);
    }
    #[test]
    fn invalid_missing_and_corrupt_snapshots_surface_errors_without_overwriting_data() {
        let fixture = tempfile::tempdir().unwrap(); let store = SavedScanStore::new(fixture.path().join("saved"));
        assert!(store.load().unwrap().is_none()); fs::create_dir_all(&store.directory).unwrap();
        let pointer = store.directory.join("current.json"); fs::write(&pointer, br#"{"format":1,"directory":"../../outside"}"#).unwrap();
        assert!(store.load().is_err()); assert!(fs::read_to_string(&pointer).unwrap().contains("outside"));
        fs::write(&pointer, br#"{"format":1,"directory":"scan-abcdef"}"#).unwrap();
        assert!(store.load().is_err()); assert!(!store.directory.join("scan-abcdef/results.sqlite").exists());
        let source = fixture.path().join("source"); fs::create_dir(&source).unwrap();
        let mut snapshot = IndexWriter::new_in(&store.directory).unwrap().finish("valid".into()).unwrap();
        store.save(&mut snapshot, &report("valid", &source)).unwrap(); let database = snapshot.database.clone(); drop(snapshot);
        let connection = Connection::open(&database).unwrap(); connection.execute("UPDATE saved_report SET json='broken'", []).unwrap(); drop(connection);
        assert!(store.load().is_err()); assert!(database.exists());
        let outside = fixture.path().join("scan-outside"); fs::create_dir(&outside).unwrap(); fs::write(outside.join("keep"), b"keep").unwrap();
        cleanup_generation(&outside.join("results.sqlite"), &store.directory); assert!(outside.join("keep").exists());
    }
}
