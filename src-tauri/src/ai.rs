use std::path::{Path, PathBuf};

/// Probe only the supported per-user data roots, never enumerate home or disks.
pub(crate) fn roots(tool_id: Option<&str>) -> Result<Vec<PathBuf>, String> {
    let home = crate::computer::user_home().ok_or("Home folder not found. Select a folder to scan.")?;
    let roots = selected_roots(&home, tool_id)?;
    if roots.is_empty() { return Err("No known AI data folders found. Choose a folder to scan a custom location.".into()); }
    Ok(roots)
}
#[cfg(test)]
fn known_roots(home: &Path) -> Vec<PathBuf> {
    selected_roots(home, None).expect("Bundled AI catalog")
}
pub(crate) fn tool_name(tool_id: Option<&str>) -> Result<Option<String>, String> {
    tool_id.map(|id| crate::inventory::catalog().into_iter().find(|tool| tool.id == id)
        .map(|tool| tool.name).ok_or_else(|| "Unknown AI tool. Select a supported tool.".into())).transpose()
}
fn selected_roots(home: &Path, tool_id: Option<&str>) -> Result<Vec<PathBuf>, String> {
    tool_name(tool_id)?;
    let mut candidates: Vec<_> = crate::inventory::catalog().iter()
        .filter(|tool| tool_id.is_none_or(|id| tool.id == id))
        .flat_map(|tool| crate::inventory::data_candidates(tool, home)).collect();
    candidates.sort(); candidates.dedup();
    let mut roots: Vec<PathBuf> = candidates.into_iter()
        .filter(|path| std::fs::symlink_metadata(path).is_ok_and(|m| {
            #[cfg(windows)]
            let link = { use std::os::windows::fs::MetadataExt; m.file_attributes() & 0x400 != 0 };
            #[cfg(not(windows))]
            let link = m.is_symlink();
            m.is_dir() && !link
        })).collect();
    let all = roots.clone(); roots.retain(|path| !all.iter().any(|parent| path != parent && path.starts_with(parent)));
    Ok(roots)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, sync::atomic::AtomicBool};
    #[test]
    fn single_app_scan_excludes_other_apps_and_keeps_exact_bytes() {
        let home = tempfile::tempdir().unwrap();
        for (path, data) in [(".codex/sessions", "123"), (".claude/projects", "1234567"), (".ollama/models", "12345")] {
            fs::create_dir_all(home.path().join(path)).unwrap();
            fs::write(home.path().join(path).join("data"), data).unwrap();
        }
        let roots = selected_roots(home.path(), Some("codex")).unwrap();
        assert_eq!(roots, vec![home.path().join(".codex")]);
        let report = roomit_core::scan_locations(&roots, roomit_core::ScanOptions::computer(None), &AtomicBool::new(false), |_| {}).unwrap();
        assert_eq!(report.stats.files_scanned, 1);
        assert_eq!(report.stats.total_logical_bytes, 3);
        assert!(report.findings.iter().any(|f| f.tool == "Codex" && f.disposition == roomit_core::Disposition::Protected));
        assert_eq!(fs::read(home.path().join(".codex/sessions/data")).unwrap(), b"123");
        let mut options = roomit_core::ScanOptions::computer(None);
        options.excluded_paths.push(home.path().join(".codex/sessions"));
        let excluded = roomit_core::scan_locations(&roots, options, &AtomicBool::new(false), |_| {}).unwrap();
        assert_eq!(excluded.stats.total_logical_bytes, 0);
        let cancelled = roomit_core::scan_locations(&roots, roomit_core::ScanOptions::computer(None), &AtomicBool::new(true), |_| {}).unwrap();
        assert_eq!(cancelled.status, roomit_core::ScanStatus::Cancelled);
    }
    #[test]
    fn absent_or_invalid_tool_never_broadens_the_scope() {
        let home = tempfile::tempdir().unwrap();
        fs::create_dir_all(home.path().join(".ollama/models")).unwrap();
        assert!(selected_roots(home.path(), Some("codex")).unwrap().is_empty());
        for id in ["", "unknown", "../", ".ollama"] {
            assert!(selected_roots(home.path(), Some(id)).is_err());
        }
    }
    #[test]
    fn nested_tool_root_does_not_expand_to_another_tools_parent() {
        let home = tempfile::tempdir().unwrap();
        fs::create_dir_all(home.path().join(".gemini/antigravity")).unwrap();
        assert_eq!(selected_roots(home.path(), Some("antigravity")).unwrap(), vec![home.path().join(".gemini/antigravity")]);
    }
    #[test]
    fn targeted_roots_do_not_walk_unrelated_folders_and_keep_ai_sizes() {
        let home = tempfile::tempdir().unwrap();
        fs::create_dir_all(home.path().join(".codex/sessions")).unwrap();
        fs::write(home.path().join(".codex/sessions/file"), b"123").unwrap();
        fs::create_dir_all(home.path().join(".ollama/models")).unwrap();
        fs::write(home.path().join(".ollama/models/file"), b"12345").unwrap();
        fs::create_dir_all(home.path().join("unrelated/huge-tree")).unwrap();
        fs::write(home.path().join("unrelated/huge-tree/file"), b"not part of this scan").unwrap();
        fs::write(home.path().join(".claude"), b"file, not directory").unwrap();
        let roots = known_roots(home.path()); assert_eq!(roots.len(), 2);
        assert!(roots.iter().all(|p| p.parent() == Some(home.path())));
        let report = roomit_core::scan_locations(&roots, roomit_core::ScanOptions::computer(None), &AtomicBool::new(false), |_| {}).unwrap();
        assert_eq!(report.stats.files_scanned, 2); assert_eq!(report.stats.total_logical_bytes, 8);
        assert!(report.findings.iter().any(|f| f.tool == "Codex"));
        assert!(report.findings.iter().any(|f| f.tool == "Ollama"));
        assert!(report.largest_entries.iter().all(|e| !e.path.contains("unrelated")));
    }
    #[test]
    fn extended_ai_roots_are_protected_and_nested_roots_are_not_counted_twice() {
        let home = tempfile::tempdir().unwrap();
        for path in [".local/share/opencode", ".config/opencode", ".gemini/antigravity", ".lmstudio"] {
            fs::create_dir_all(home.path().join(path)).unwrap(); fs::write(home.path().join(path).join("data"),b"123").unwrap();
        }
        let roots = known_roots(home.path());
        assert!(!roots.iter().any(|p| p.ends_with("antigravity")));
        let report = roomit_core::scan_locations(&roots, roomit_core::ScanOptions::computer(None), &AtomicBool::new(false), |_| {}).unwrap();
        assert_eq!(report.stats.total_logical_bytes,12);
        for tool in ["OpenCode", "Gemini CLI", "LM Studio"] {
            assert!(report.findings.iter().any(|f| f.tool==tool && f.disposition==roomit_core::Disposition::Protected));
        }
    }
    #[test]
    fn missing_ai_roots_never_fall_back_to_home_or_all_drives() {
        let home = tempfile::tempdir().unwrap();
        fs::create_dir(home.path().join("ordinary")).unwrap();
        assert!(known_roots(home.path()).is_empty());
    }
}
