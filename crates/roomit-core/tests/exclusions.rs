use roomit_core::{ScanOptions, RootStatus, scan_workspace_with_sink, scan_locations};
use std::{fs, path::Path, sync::atomic::AtomicBool};

fn file(root: &Path, path: &str, bytes: usize) {
    let path = root.join(path); fs::create_dir_all(path.parent().unwrap()).unwrap(); fs::write(path, vec![1; bytes]).unwrap();
}

#[test]
fn exclusions_prune_subtrees_and_files_without_prefix_collisions_or_index_rows() {
    let fixture = tempfile::tempdir().unwrap();
    file(fixture.path(), "app/nested/secret", 101);
    file(fixture.path(), "apple/keep", 7);
    file(fixture.path(), "skip.bin", 23);
    file(fixture.path(), "project/package.json", 2);
    file(fixture.path(), "project/node_modules/library", 11);
    let options = ScanOptions { excluded_paths: vec![fixture.path().join("app"), fixture.path().join("skip.bin")], ..Default::default() };
    let mut rows = Vec::new();
    let mut sink = |entry: &roomit_core::SizedEntry| { rows.push(entry.clone()); Ok(()) };
    let report = scan_workspace_with_sink(fixture.path(), options, &AtomicBool::new(false), |_| {}, &mut sink).unwrap();
    assert_eq!(report.stats.total_logical_bytes, 20);
    assert_eq!(report.stats.excluded_entries, 2);
    assert_eq!(report.stats.files_scanned, 3);
    assert!(report.total_size_complete); // Complete within the selected scope.
    assert!(rows.iter().all(|row| !row.path.contains("secret") && !row.path.ends_with("skip.bin") && !row.path.ends_with("app")));
    assert!(rows.iter().any(|row| row.path.ends_with("keep")));
    assert_eq!(report.findings.len(), 1);
    assert_eq!(fs::metadata(fixture.path().join("app/nested/secret")).unwrap().len(), 101);
}

#[test]
fn excluded_ancestor_blocks_direct_selection_and_separately_requested_nested_roots() {
    let fixture = tempfile::tempdir().unwrap();
    file(fixture.path(), "excluded/nested/hidden", 99);
    file(fixture.path(), "included/keep", 3);
    let options = ScanOptions { excluded_paths: vec![fixture.path().join("excluded")], ..Default::default() };
    let mut sink = |_: &roomit_core::SizedEntry| panic!("Excluded root must emit nothing");
    assert!(scan_workspace_with_sink(&fixture.path().join("excluded/nested"), options.clone(), &AtomicBool::new(false), |_| {}, &mut sink).is_err());
    let report = scan_locations(&[fixture.path().to_path_buf(), fixture.path().join("excluded/nested")], options, &AtomicBool::new(false), |_| {}).unwrap();
    assert_eq!(report.stats.total_logical_bytes, 3);
    assert_eq!(report.roots[1].status, RootStatus::Excluded);
    assert!(report.total_size_complete);
}

#[test]
fn app_bundle_rule_applies_to_any_ancestor_but_keeps_ai_and_project_data() {
    let fixture = tempfile::tempdir().unwrap();
    file(fixture.path(), "Custom/Editor.APP/Contents/data", 100);
    file(fixture.path(), ".ollama/models/model", 17);
    file(fixture.path(), "app-data/keep", 2);
    let options = ScanOptions { exclude_app_bundles: true, ..Default::default() };
    let report = scan_locations(&[fixture.path().to_path_buf(), fixture.path().join("Custom/Editor.APP/Contents")], options, &AtomicBool::new(false), |_| {}).unwrap();
    assert_eq!(report.stats.total_logical_bytes, 19);
    assert_eq!(report.roots[1].status, RootStatus::Excluded);
    assert!(report.findings.iter().any(|f| f.tool == "Ollama"));
}

#[cfg(windows)]
#[test]
fn windows_exclusions_ignore_case_and_system_files_are_not_measured() {
    use std::process::Command;
    let fixture = tempfile::tempdir().unwrap();
    file(fixture.path(), "MixedCase/hidden", 50);
    file(fixture.path(), "system.bin", 90);
    file(fixture.path(), "keep", 4);
    let system = fixture.path().join("system.bin");
    assert!(Command::new("attrib.exe").arg("+s").arg(&system).status().unwrap().success());
    let options = ScanOptions { excluded_paths: vec![fixture.path().join("mixedcase")], exclude_system_attributes: true, ..Default::default() };
    let report = scan_locations(&[fixture.path().to_path_buf()], options, &AtomicBool::new(false), |_| {}).unwrap();
    // Restore test-owned metadata even when assertions below fail.
    assert!(Command::new("attrib.exe").arg("-s").arg(&system).status().unwrap().success());
    assert_eq!(report.stats.total_logical_bytes, 4);
    assert_eq!(report.stats.excluded_entries, 2);
}
