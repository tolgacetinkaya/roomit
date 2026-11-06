mod computer;
mod reveal;
mod size_index;
mod exclusions;

use std::{
    path::PathBuf,
    sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}},
};
use tauri::{ipc::Channel, Manager};

#[derive(Default, Clone)]
struct ScanRegistry(Arc<Mutex<Option<ActiveScan>>>);
struct ActiveScan { id: String, cancel: Arc<AtomicBool> }
struct ScanLease { registry: ScanRegistry, id: String, cancel: Arc<AtomicBool> }

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopReport {
    #[serde(flatten)] report: roomit_core::InspectionReport,
    size_index_id: String,
}

impl ScanRegistry {
    fn begin(&self, id: String) -> Result<ScanLease, String> {
        if id.is_empty() || id.len() > 128 { return Err("Geçersiz tarama kimliği.".into()); }
        let mut active = self.0.lock().map_err(|_| "Tarama durumu okunamadı.")?;
        if active.is_some() { return Err("Bir tarama zaten sürüyor. Tamamlanmasını veya iptalini bekleyin.".into()); }
        let cancel = Arc::new(AtomicBool::new(false));
        *active = Some(ActiveScan { id: id.clone(), cancel: cancel.clone() });
        Ok(ScanLease { registry: self.clone(), id, cancel })
    }
    fn cancel(&self, id: &str) -> Result<bool, String> {
        let active = self.0.lock().map_err(|_| "Tarama durumu okunamadı.")?;
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
) -> Result<DesktopReport, String> {
    if mode != "folder" && mode != "computer" && mode != "disk" { return Err("Geçersiz tarama kapsamı.".into()); }
    let lease = state.begin(scan_id)?;
    // Snapshot persisted choices before starting. A read error blocks the scan;
    // silently scanning a folder the user excluded would violate their choice.
    let mut excluded_paths: Vec<PathBuf> = exclusions.paths()?.into_iter().map(PathBuf::from).collect();
    excluded_paths.push(exclusions.directory());
    excluded_paths.extend(exclusions::automatic_paths().0);
    queries.cancel_all()?;
    let indexes = indexes.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _lease = lease; // Releases registry even on scan errors or worker panic.
        indexes.clear()?;
        let mut writer = size_index::IndexWriter::new().map_err(|e| format!("Geçici sonuç dizini oluşturulamadı: {e}"))?;
        excluded_paths.extend(writer.directories_to_exclude());
        let mut progress = |progress: &roomit_core::ScanProgress| {
                if on_progress.send(progress.clone()).is_err() {
                    _lease.cancel.store(true, Ordering::Relaxed);
                }
        };
        let report = if mode == "computer" || mode == "disk" {
            let roots = computer::computer_roots()?;
            let roots = if mode == "disk" { vec![computer::selected_root(&root, &roots)?] } else { roots };
            let mut options = roomit_core::ScanOptions::computer(computer::preferred_home(&roots));
            options.excluded_paths = excluded_paths;
            options.exclude_app_bundles = cfg!(target_os = "macos");
            options.exclude_system_attributes = cfg!(windows);
            let mut report = roomit_core::scan_locations_with_sink(&roots, options, &_lease.cancel, &mut progress, &mut writer)
                .map_err(|error| error.to_string())?;
            if mode == "disk" { report.scope = "disk"; report.root = root; }
            Ok(report)
        } else {
            let options = roomit_core::ScanOptions { max_entries: None, max_depth: None,
                excluded_paths, exclude_app_bundles: cfg!(target_os = "macos"),
                exclude_system_attributes: cfg!(windows), ..Default::default() };
            roomit_core::scan_workspace_with_sink(&PathBuf::from(root), options, &_lease.cancel, &mut progress, &mut writer)
        }.map_err(|error| error.to_string())?;
        let id = _lease.id.clone();
        indexes.publish(writer.finish(id.clone())?)?;
        Ok(DesktopReport { report, size_index_id: id })
    })
    .await
    .map_err(|error| format!("Tarama görevi tamamlanamadı: {error}"))?
}

#[tauri::command]
async fn computer_scan_roots() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        computer::computer_roots().map(|roots| roots.into_iter().map(|path| path.to_string_lossy().into_owned()).collect())
    }).await.map_err(|error| format!("Disk listesi alınamadı: {error}"))?
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
        let active = scans.0.lock().map_err(|_| "Tarama durumu okunamadı.")?;
        if active.is_some() { return Err("Hariç tutma listesini değiştirmek için taramanın bitmesini bekleyin.".into()); }
        store.change(add, remove)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn local_disks() -> Result<Vec<computer::LocalDisk>, String> {
    tauri::async_runtime::spawn_blocking(computer::local_disks).await
        .map_err(|error| format!("Disk listesi alınamadı: {error}"))?
}

#[tauri::command]
fn cancel_scan(scan_id: String, state: tauri::State<'_, ScanRegistry>) -> Result<bool, String> {
    state.cancel(&scan_id)
}

#[tauri::command]
async fn reveal_path(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || reveal::reveal(&path)).await
        .map_err(|error| format!("Konum gösterilemedi: {error}"))?
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
        .await.map_err(|error| format!("Sonuç yükleme görevi tamamlanamadı: {error}"))?
}

#[tauri::command]
fn cancel_size_query(request_id: String, queries: tauri::State<'_, size_index::QueryRegistry>) -> Result<bool, String> {
    queries.cancel(&request_id)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(ScanRegistry::default())
        .manage(size_index::ResultIndexes::default())
        .manage(size_index::QueryRegistry::default())
        .setup(|app| {
            app.manage(exclusions::ExclusionStore::new(app.path().app_config_dir()?));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![inspect_workspace, cancel_scan, computer_scan_roots, local_disks, reveal_path, query_size_entries, cancel_size_query, get_exclusions, change_exclusions])
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
