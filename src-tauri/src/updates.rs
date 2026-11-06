use std::{sync::Mutex, time::Duration};
use tauri::{ipc::Channel, AppHandle};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct Updates(Mutex<Option<Update>>);

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Release { version: String, notes: String }

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress { phase: &'static str, downloaded: u64, total: Option<u64> }

fn allowed_package(url: &str) -> bool {
    url.starts_with("https://github.com/tolgacetinkaya/roomit/releases/download/")
        && !url.contains('?') && !url.contains('#')
}

#[tauri::command]
pub async fn check_for_update(app: AppHandle, updates: tauri::State<'_, Updates>) -> Result<Option<Release>, String> {
    let mut found = app.updater_builder().timeout(Duration::from_secs(30)).build()
        .map_err(|e| format!("Could not configure updates: {e}"))?.check().await
        .map_err(|e| format!("Could not check releases. Check your connection and try again: {e}"))?;
    if let Some(update) = &mut found {
        if !allowed_package(update.download_url.as_str()) { return Err("The release package URL is not a trusted Roomit download.".into()); }
        update.timeout = Some(Duration::from_secs(600));
    }
    let release = found.as_ref().map(|u| Release { version: u.version.clone(), notes: u.body.clone().unwrap_or_default() });
    *updates.0.lock().map_err(|_| "Could not read update state.")? = found;
    Ok(release)
}

#[tauri::command]
pub async fn install_release(app: AppHandle, updates: tauri::State<'_, Updates>, scans: tauri::State<'_, crate::ScanRegistry>, on_progress: Channel<Progress>) -> Result<(), String> {
    // Reuse the native exclusive work lease: scan start and installation cannot race.
    let _lease = scans.begin("roomit-update-install".into())?;
    let update = updates.0.lock().map_err(|_| "Could not read update state.")?.take()
        .ok_or("Check for updates before installing.")?;
    let retry = update.clone();
    let mut downloaded = 0u64;
    let progress = on_progress.clone();
    let result = async {
        // The official updater verifies the complete download with the embedded
        // public key before returning any bytes suitable for installation.
        let bytes = update.download(|chunk, total| {
            downloaded = downloaded.saturating_add(chunk as u64);
            let _ = progress.send(Progress { phase: "downloading", downloaded, total });
        }, || {}).await.map_err(|e| format!("Could not download or verify the update: {e}"))?;
        let _ = on_progress.send(Progress { phase: "installing", downloaded, total: Some(downloaded) });
        tauri::async_runtime::spawn_blocking(move || update.install(bytes)).await
            .map_err(|e| format!("Update installation task failed: {e}"))?
            .map_err(|e| format!("Could not install the update: {e}"))?;
        Ok(())
    }.await;
    if result.is_err() { *updates.0.lock().map_err(|_| "Could not read update state.")? = Some(retry); }
    // Windows exits from the official installer. macOS needs an explicit restart.
    if result.is_ok() { app.restart(); }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn packages_must_belong_to_the_roomit_https_release() {
        assert!(allowed_package("https://github.com/tolgacetinkaya/roomit/releases/download/v0.5.0/Roomit-setup.exe"));
        for url in ["http://github.com/tolgacetinkaya/roomit/releases/download/v1/a.exe", "https://github.com.evil.test/tolgacetinkaya/roomit/releases/download/v1/a.exe", "https://github.com/other/roomit/releases/download/v1/a.exe", "https://github.com/tolgacetinkaya/roomit/releases/download/v1/a.exe?redirect=x"] { assert!(!allowed_package(url)); }
    }
}
