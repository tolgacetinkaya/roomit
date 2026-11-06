mod computer;
mod reveal;
mod size_index;
mod exclusions;
mod saved_scan;
mod watch;
mod ai;
mod inventory;
mod monitor;
mod gpu;
mod updates;

use std::{
    path::PathBuf,
    sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}},
};
use tauri::{ipc::Channel, Manager};

#[derive(Default, Clone)]
struct ScanRegistry(Arc<Mutex<Option<ActiveScan>>>);
struct ActiveScan { id: String, cancel: Arc<AtomicBool> }
struct ScanLease { registry: ScanRegistry, id: String, cancel: Arc<AtomicBool> }

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopReport {
    #[serde(flatten)] report: roomit_core::InspectionReport,
    size_index_id: String,
    scanned_at_ms: u64,
    persistence_error: Option<String>,
    #[serde(default)] watch_policy: Option<watch::WatchPolicy>,
}

impl ScanRegistry {
    fn begin(&self, id: String) -> Result<ScanLease, String> {
        if id.is_empty() || id.len() > 128 { return Err("Invalid scan ID.".into()); }
        let mut active = self.0.lock().map_err(|_| "Could not read scan state.")?;
        if active.is_some() { return Err("A scan is already running. Wait for it to finish or cancel it.".into()); }
        let cancel = Arc::new(AtomicBool::new(false));
        *active = Some(ActiveScan { id: id.clone(), cancel: cancel.clone() });
        Ok(ScanLease { registry: self.clone(), id, cancel })
    }
    fn cancel(&self, id: &str) -> Result<bool, String> {
        let active = self.0.lock().map_err(|_| "Could not read scan state.")?;
        if let Some(active) = active.as_ref().filter(|scan| scan.id == id) {
            active.cancel.store(true, Ordering::Relaxed);
            Ok(true)
        } else { Ok(false) }
    }
}
impl Drop for ScanLease {
    fn drop(&mut self) {
        if let Ok(mut active) = self.registry.0.lock() {
            if active.as_ref().is_some_and(|scan| scan.id == self.id) { *active = None; }
        }
    }
}

#[tauri::command]
async fn inspect_workspace(
    root: String,
    mode: String,
    scan_id: String,
    on_progress: Channel<roomit_core::ScanProgress>,
    state: tauri::State<'_, ScanRegistry>,
    indexes: tauri::State<'_, size_index::ResultIndexes>,
    queries: tauri::State<'_, size_index::QueryRegistry>,
    exclusions: tauri::State<'_, exclusions::ExclusionStore>,
    saved: tauri::State<'_, saved_scan::SavedScanStore>,
    watches: tauri::State<'_, watch::WatchRegistry>,
) -> Result<DesktopReport, String> {
    if !["folder", "computer", "disk", "ai"].contains(&mode.as_str()) { return Err("Invalid scan scope.".into()); }
    let lease = state.begin(scan_id)?;
    let scanned_at_ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_millis() as u64;
    let saved = saved.inner().clone();
    // Snapshot persisted choices before starting. A read error blocks the scan;
    // silently scanning a folder the user excluded would violate their choice.
    let mut excluded_paths: Vec<PathBuf> = exclusions.paths()?.into_iter().map(PathBuf::from).collect();
    excluded_paths.push(exclusions.directory());
    excluded_paths.push(saved.directory.clone());
    excluded_paths.extend(exclusions::automatic_paths().0);
    queries.cancel_all()?;
    let indexes = indexes.inner().clone();
    let watches = watches.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _lease = lease; // Releases registry even on scan errors or worker panic.
        // Keep the previous snapshot available until the replacement succeeds.
        let mut writer = size_index::IndexWriter::new_in(&saved.directory).map_err(|e| format!("Could not create result directory: {e}"))?;
        excluded_paths.extend(writer.directories_to_exclude());
        let roots = if mode == "ai" { ai::roots()? } else if mode == "folder" { vec![PathBuf::from(&root)] } else {
            let roots = computer::computer_roots()?;
            if mode == "disk" { vec![computer::selected_root(&root, &roots)?] } else { roots }
        };
        let watch_policy = watch::WatchPolicy { excluded_paths: excluded_paths.clone(), app_bundles: cfg!(target_os = "macos"), system_attributes: cfg!(windows) };
        // Arm before traversal: a mutation during a scan can already invalidate
        // its measured rows. Failed scans drop this candidate, keeping the old watch.
        let monitoring = watch::WatchSession::start(_lease.id.clone(), roots.clone(), watch_policy.clone());
        let mut progress = |progress: &roomit_core::ScanProgress| {
                if on_progress.send(progress.clone()).is_err() {
                    _lease.cancel.store(true, Ordering::Relaxed);
                }
        };
        let report = if mode != "folder" {
            let mut options = roomit_core::ScanOptions::computer(computer::preferred_home(&roots));
            options.excluded_paths = excluded_paths;
            options.exclude_app_bundles = cfg!(target_os = "macos");
            options.exclude_system_attributes = cfg!(windows);
            let mut report = roomit_core::scan_locations_with_sink(&roots, options, &_lease.cancel, &mut progress, &mut writer)
                .map_err(|error| error.to_string())?;
            if mode == "disk" { report.scope = "disk".into(); report.root = root; }
            if mode == "ai" { report.scope = "ai".into(); report.root = "Known AI data locations".into(); }
            Ok(report)
        } else {
            let options = roomit_core::ScanOptions { max_entries: None, max_depth: None,
                excluded_paths, exclude_app_bundles: cfg!(target_os = "macos"),
                exclude_system_attributes: cfg!(windows), ..Default::default() };
            roomit_core::scan_workspace_with_sink(&PathBuf::from(root), options, &_lease.cancel, &mut progress, &mut writer)
        }.map_err(|error| error.to_string())?;
        let id = _lease.id.clone();
        let mut snapshot = writer.finish(id.clone())?;
        let mut report = DesktopReport { report, size_index_id: id, scanned_at_ms, persistence_error: None, watch_policy: Some(watch_policy) };
        if let Err(error) = saved.save(&mut snapshot, &report) { report.persistence_error = Some(error); }
        indexes.publish(snapshot)?;
        watches.publish(monitoring)?;
        Ok(report)
    })
    .await
    .map_err(|error| format!("Scan task could not be completed: {error}"))?
}

#[tauri::command]
async fn computer_scan_roots() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        computer::computer_roots().map(|roots| roots.into_iter().map(|path| path.to_string_lossy().into_owned()).collect())
    }).await.map_err(|error| format!("Could not load disks: {error}"))?
}

#[tauri::command]
async fn load_last_scan(saved: tauri::State<'_, saved_scan::SavedScanStore>, indexes: tauri::State<'_, size_index::ResultIndexes>,
    scans: tauri::State<'_, ScanRegistry>, exclusions: tauri::State<'_, exclusions::ExclusionStore>, watches: tauri::State<'_, watch::WatchRegistry>) -> Result<Option<DesktopReport>, String> {
    let saved = saved.inner().clone(); let indexes = indexes.inner().clone(); let scans = scans.inner().clone();
    let exclusions = exclusions.inner().clone(); let watches = watches.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let active = scans.0.lock().map_err(|_| "Could not read scan state.")?;
        if active.is_some() { return Err("Saved results cannot be loaded while scanning.".into()); }
        let Some((report, snapshot)) = saved.load()? else { return Ok(None) };
        let policy = match &report.watch_policy { Some(policy) => policy.clone(), None => {
            let mut excluded_paths: Vec<PathBuf> = exclusions.paths()?.into_iter().map(PathBuf::from).collect();
            excluded_paths.extend(exclusions::automatic_paths().0); excluded_paths.push(exclusions.directory()); excluded_paths.push(saved.directory.clone());
            watch::WatchPolicy { excluded_paths, app_bundles: cfg!(target_os = "macos"), system_attributes: cfg!(windows) }
        } };
        let roots = report.report.roots.iter().filter(|r| r.status != roomit_core::RootStatus::Excluded && r.status != roomit_core::RootStatus::NotScanned)
            .map(|r| PathBuf::from(&r.path)).collect();
        let monitoring = watch::WatchSession::start(report.size_index_id.clone(), roots, policy);
        indexes.publish(snapshot)?;
        watches.publish(monitoring)?;
        Ok(Some(report))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn watch_status(index_id: String, watches: tauri::State<'_, watch::WatchRegistry>) -> Result<watch::WatchStatus, String> {
    let watches = watches.inner().clone();
    tauri::async_runtime::spawn_blocking(move || watches.status(&index_id)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_exclusions(store: tauri::State<'_, exclusions::ExclusionStore>) -> Result<exclusions::ExclusionView, String> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || exclusions::view(&store)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn change_exclusions(add: Vec<String>, remove: Option<String>, store: tauri::State<'_, exclusions::ExclusionStore>,
    scans: tauri::State<'_, ScanRegistry>) -> Result<Vec<String>, String> {
    // Keep edits and scan-start mutually exclusive; each report has one policy.
    let scans = scans.inner().clone(); let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let active = scans.0.lock().map_err(|_| "Could not read scan state.")?;
        if active.is_some() { return Err("Wait for the scan to finish before changing exclusions.".into()); }
        store.change(add, remove)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn local_disks() -> Result<Vec<computer::LocalDisk>, String> {
    tauri::async_runtime::spawn_blocking(computer::local_disks).await
        .map_err(|error| format!("Could not load disks: {error}"))?
}

#[tauri::command]
fn cancel_scan(scan_id: String, state: tauri::State<'_, ScanRegistry>) -> Result<bool, String> {
    state.cancel(&scan_id)
}

#[tauri::command]
async fn reveal_path(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || reveal::reveal(&path)).await
        .map_err(|error| format!("Could not reveal location: {error}"))?
}

#[tauri::command]
async fn query_size_entries(request: size_index::PageRequest,
    indexes: tauri::State<'_, size_index::ResultIndexes>, queries: tauri::State<'_, size_index::QueryRegistry>,
) -> Result<size_index::SizePage, String> {
    let index = indexes.get(&request.index_id)?;
    let lease = queries.begin(&request)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _lease = lease;
        index.query(&request, _lease.cancel.clone())
    })
        .await.map_err(|error| format!("Result loading task failed: {error}"))?
}

#[tauri::command]
fn cancel_size_query(request_id: String, queries: tauri::State<'_, size_index::QueryRegistry>) -> Result<bool, String> {
    queries.cancel(&request_id)
}

#[tauri::command]
async fn map_children(index_id: String, path: String, indexes: tauri::State<'_, size_index::ResultIndexes>) -> Result<Vec<roomit_core::SizedEntry>, String> {
    let index = indexes.get(&index_id)?;
    tauri::async_runtime::spawn_blocking(move || index.map_children(&path)).await.map_err(|e| e.to_string())?
}
#[tauri::command]
async fn discover_ai_tools() -> Result<inventory::Inventory, String> {
    tauri::async_runtime::spawn_blocking(inventory::discover).await.map_err(|e| e.to_string())?
}
#[tauri::command]
async fn resource_snapshot(state: tauri::State<'_, monitor::Monitor>) -> Result<monitor::Snapshot, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.0.lock().map_err(|_| "Could not read live monitoring state.".to_string()).map(|mut sampler| sampler.sample())).await.map_err(|e| e.to_string())?
}
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(updates::Updates::default())
        .manage(ScanRegistry::default())
        .manage(monitor::Monitor::default())
        .manage(size_index::ResultIndexes::default())
        .manage(size_index::QueryRegistry::default())
        .manage(watch::WatchRegistry::default())
        .setup(|app| {
            app.manage(exclusions::ExclusionStore::new(app.path().app_config_dir()?));
            app.manage(saved_scan::SavedScanStore::new(app.path().app_local_data_dir()?.join("last-scan")));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![inspect_workspace, cancel_scan, computer_scan_roots, local_disks, reveal_path, query_size_entries, cancel_size_query, get_exclusions, change_exclusions, load_last_scan, watch_status, discover_ai_tools, resource_snapshot, map_children, updates::check_for_update, updates::install_release, updates::download_latest_portable])
        .run(tauri::generate_context!())
        .expect("Roomit could not start");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn permits_one_scan_and_only_its_owner_can_cancel() {
        let registry = ScanRegistry::default();
        let first = registry.begin("first".into()).unwrap();
        assert!(registry.begin("second".into()).is_err());
        assert!(!registry.cancel("second").unwrap());
        assert!(!first.cancel.load(Ordering::Relaxed));
        assert!(registry.cancel("first").unwrap());
        assert!(first.cancel.load(Ordering::Relaxed));
        drop(first);
        assert!(!registry.cancel("first").unwrap());
        assert!(registry.begin("second".into()).is_ok());
    }

    #[test]
    fn a_worker_panic_does_not_leave_the_scan_registry_locked() {
        let registry = ScanRegistry::default();
        let lease = registry.begin("panic".into()).unwrap();
        let worker = std::thread::spawn(move || {
            let _lease = lease;
            panic!("simulated worker panic");
        });
        assert!(worker.join().is_err());
        assert!(registry.begin("after-panic".into()).is_ok());
        assert!(registry.begin(String::new()).is_err());
    }
}
