mod computer;

use std::{
    path::PathBuf,
    sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}},
};
use tauri::ipc::Channel;

#[derive(Default, Clone)]
struct ScanRegistry(Arc<Mutex<Option<ActiveScan>>>);
struct ActiveScan { id: String, cancel: Arc<AtomicBool> }
struct ScanLease { registry: ScanRegistry, id: String, cancel: Arc<AtomicBool> }

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
) -> Result<roomit_core::InspectionReport, String> {
    if mode != "folder" && mode != "computer" { return Err("Geçersiz tarama kapsamı.".into()); }
    let lease = state.begin(scan_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _lease = lease; // Releases registry even on scan errors or worker panic.
        let mut progress = |progress: &roomit_core::ScanProgress| {
                if on_progress.send(progress.clone()).is_err() {
                    _lease.cancel.store(true, Ordering::Relaxed);
                }
        };
        if mode == "computer" {
            let roots = computer::computer_roots()?;
            let options = roomit_core::ScanOptions {
                same_file_system: true, preferred_path: computer::preferred_home(&roots),
                ..Default::default()
            };
            roomit_core::scan_locations(&roots, options, &_lease.cancel, &mut progress)
        } else {
            roomit_core::scan_workspace(&PathBuf::from(root), roomit_core::ScanOptions::default(), &_lease.cancel, &mut progress)
        }.map_err(|error| error.to_string())
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
fn cancel_scan(scan_id: String, state: tauri::State<'_, ScanRegistry>) -> Result<bool, String> {
    state.cancel(&scan_id)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(ScanRegistry::default())
        .invoke_handler(tauri::generate_handler![inspect_workspace, cancel_scan, computer_scan_roots])
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
