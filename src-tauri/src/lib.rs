use std::path::PathBuf;

#[tauri::command]
async fn inspect_workspace(root: String) -> Result<roomit_core::InspectionReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        roomit_core::inspect_workspace(&PathBuf::from(root)).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("İnceleme görevi tamamlanamadı: {error}"))?
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![inspect_workspace])
        .run(tauri::generate_context!())
        .expect("Roomit could not start");
}
