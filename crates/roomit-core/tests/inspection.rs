use roomit_core::{Category, Disposition, EntryKind, ScanOptions, ScanStatus, inspect_workspace, scan_workspace};
use std::{fs, path::Path, sync::atomic::{AtomicBool, Ordering}, time::Duration};
use tempfile::tempdir;

fn file(root: &Path, relative: &str, bytes: usize) {
    let path = root.join(relative);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, vec![b'x'; bytes]).unwrap();
}

#[test]
fn sizes_nested_files_and_empty_directories_in_one_tree() {
    let fixture = tempdir().unwrap();
    file(fixture.path(), "a/one.txt", 7);
    file(fixture.path(), "a/b/two.txt", 11);
    file(fixture.path(), "zero.txt", 0);
    fs::create_dir(fixture.path().join("empty")).unwrap();
    let report = inspect_workspace(fixture.path()).unwrap();
    assert_eq!(report.scope, "recursive");
    assert_eq!(report.status, ScanStatus::Completed);
    assert!(report.total_size_complete);
    assert_eq!(report.stats.total_logical_bytes, 18);
    assert_eq!(report.stats.files_scanned, 3);
    assert_eq!(report.stats.directories_scanned, 4);
    let a = report.largest_entries.iter().find(|e| e.path.ends_with("a") && e.kind == EntryKind::Directory).unwrap();
    assert_eq!(a.logical_bytes, 18);
    let empty = report.largest_entries.iter().find(|e| e.path.ends_with("empty")).unwrap();
    assert_eq!(empty.logical_bytes, 0);
    assert_eq!(fs::read(fixture.path().join("a/one.txt")).unwrap(), vec![b'x'; 7]);
}

#[test]
fn requires_project_evidence_and_keeps_source_untouched() {
    let fixture = tempdir().unwrap();
    file(fixture.path(), "bin/output.dll", 12);
    file(fixture.path(), "source.cs", 9);
    assert!(inspect_workspace(fixture.path()).unwrap().findings.is_empty());
    file(fixture.path(), "App.csproj", 4);
    let report = inspect_workspace(fixture.path()).unwrap();
    assert_eq!(report.projects[0].ecosystems, [".NET"]);
    assert_eq!(report.findings.len(), 1);
    assert_eq!(report.findings[0].category, Category::BuildOutput);
    assert_eq!(report.findings[0].disposition, Disposition::ReviewRequired);
    assert_eq!(report.findings[0].logical_bytes, 12);
    assert_eq!(report.stats.total_logical_bytes, 25);
    assert_eq!(fs::read(fixture.path().join("source.cs")).unwrap(), vec![b'x'; 9]);
}

#[test]
fn discovers_nested_projects_in_multiple_ecosystems() {
    let fixture = tempdir().unwrap();
    for (marker, output) in [
        ("dotnet/App.csproj", "dotnet/obj/build.bin"),
        ("node/package.json", "node/node_modules/lib/index.js"),
        ("python/pyproject.toml", "python/src/__pycache__/file.pyc"),
        ("rust/Cargo.toml", "rust/target/debug/app"),
        ("java/build.gradle.kts", "java/build/classes/main.class"),
    ] { file(fixture.path(), marker, 1); file(fixture.path(), output, 20); }
    let report = inspect_workspace(fixture.path()).unwrap();
    assert_eq!(report.projects.len(), 5);
    assert_eq!(report.findings.len(), 5);
    assert_eq!(report.stats.total_logical_bytes, 105);
    assert_eq!(report.stats.recognized_logical_bytes, 100);
    assert!(report.findings.iter().all(|f| f.logical_bytes == 20 && f.size_complete));
}

#[test]
fn ai_directories_settings_and_models_remain_protected_and_are_not_double_counted() {
    let fixture = tempdir().unwrap();
    for (path, bytes) in [
        ("project/.codex/sessions/one.jsonl", 13),
        ("project/.claude/settings.json", 7),
        ("project/.cursor/rules/project.mdc", 11),
        ("project/.ollama/models/blobs/model", 23),
        ("project/AGENTS.md", 5),
        ("project/.env.local", 3),
        ("project/.github/copilot-instructions.md", 2),
    ] { file(fixture.path(), path, bytes); }
    let report = inspect_workspace(fixture.path()).unwrap();
    assert_eq!(report.stats.total_logical_bytes, 64);
    assert_eq!(report.stats.recognized_logical_bytes, 64);
    assert!(report.findings.iter().all(|f| f.disposition == Disposition::Protected));
    assert!(report.findings.iter().any(|f| f.category == Category::AiModels && f.logical_bytes == 23));
    assert!(report.findings.iter().any(|f| f.tool == "Codex" && f.logical_bytes == 13));
    assert!(report.findings.iter().any(|f| f.tool == "GitHub Copilot"));
    assert!(report.findings.iter().map(|f| f.logical_bytes).sum::<u64>() > 64);
    assert_eq!(fs::read(fixture.path().join("project/.codex/sessions/one.jsonl")).unwrap(), vec![b'x'; 13]);
}

#[test]
fn selected_ai_root_is_recognized_and_sized() {
    let fixture = tempdir().unwrap();
    file(fixture.path(), ".codex/sessions/data.jsonl", 19);
    let report = inspect_workspace(&fixture.path().join(".codex")).unwrap();
    assert_eq!(report.findings[0].tool, "Codex");
    assert_eq!(report.findings[0].logical_bytes, 19);
    assert_eq!(report.stats.recognized_logical_bytes, 19);
}

#[test]
fn dependencies_and_ai_internals_do_not_create_fake_projects() {
    let fixture = tempdir().unwrap();
    file(fixture.path(), "package.json", 1);
    file(fixture.path(), "node_modules/library/package.json", 2);
    file(fixture.path(), "node_modules/library/AGENTS.md", 3);
    file(fixture.path(), "node_modules/library/node_modules/inner/file", 4);
    file(fixture.path(), ".claude/example/package.json", 5);
    file(fixture.path(), ".claude/example/node_modules/file", 6);
    let report = inspect_workspace(fixture.path()).unwrap();
    assert_eq!(report.projects.len(), 1);
    assert_eq!(report.findings.len(), 2);
    assert_eq!(report.stats.total_logical_bytes, 21);
    assert_eq!(report.stats.recognized_logical_bytes, 20);
}

#[test]
fn a_directory_named_like_a_project_marker_is_not_evidence() {
    let fixture = tempdir().unwrap();
    fs::create_dir_all(fixture.path().join("package.json")).unwrap();
    file(fixture.path(), "node_modules/lib", 9);
    let report = inspect_workspace(fixture.path()).unwrap();
    assert!(report.projects.is_empty());
    assert!(report.findings.is_empty());
    assert_eq!(report.stats.total_logical_bytes, 9);
}

#[test]
fn entries_limit_returns_explicit_partial_totals() {
    let fixture = tempdir().unwrap();
    for i in 0..10 { file(fixture.path(), &format!("{i}.txt"), 2); }
    let options = ScanOptions { max_entries: 3, ..Default::default() };
    let report = scan_workspace(fixture.path(), options, &AtomicBool::new(false), |_| {}).unwrap();
    assert_eq!(report.status, ScanStatus::Limited);
    assert!(!report.total_size_complete);
    assert_eq!(report.stats.entries_seen, 3);
    assert_eq!(report.stats.total_logical_bytes, 6);
    assert!(!report.warnings.is_empty());
}

#[test]
fn a_queued_directory_disappearing_does_not_abort_other_subtrees() {
    let fixture = tempdir().unwrap();
    let root = fixture.path().canonicalize().unwrap();
    file(&root, "trigger.txt", 1);
    fs::create_dir(root.join("a-gone")).unwrap();
    file(&root, "b-stays/data", 7);
    let mut removed = false;
    let options = ScanOptions { progress_interval: Duration::ZERO, ..Default::default() };
    let report = scan_workspace(&root, options, &AtomicBool::new(false), |progress| {
        if progress.stats.files_scanned == 1 && progress.current_path.ends_with(root.file_name().unwrap().to_str().unwrap()) && !removed {
            fs::remove_dir(root.join("a-gone")).unwrap();
            removed = true;
        }
    }).unwrap();
    assert!(removed);
    assert_eq!(report.stats.errors, 1);
    assert_eq!(report.stats.total_logical_bytes, 8);
    assert!(!report.total_size_complete);
    assert!(report.largest_entries.iter().any(|entry| entry.path.ends_with("a-gone") && !entry.size_complete));
    assert!(report.largest_entries.iter().any(|entry| entry.path.ends_with("b-stays") && entry.logical_bytes == 7));
}

#[test]
fn depth_limit_marks_ancestor_sizes_partial_and_keeps_scanning_siblings() {
    let fixture = tempdir().unwrap();
    file(fixture.path(), "a/deep/file", 20);
    file(fixture.path(), "b/file", 7);
    let options = ScanOptions { max_depth: 1, ..Default::default() };
    let report = scan_workspace(fixture.path(), options, &AtomicBool::new(false), |_| {}).unwrap();
    assert_eq!(report.status, ScanStatus::Limited);
    assert!(!report.total_size_complete);
    assert_eq!(report.stats.total_logical_bytes, 7);
    assert!(report.largest_entries.iter().any(|e| e.path.ends_with("deep") && !e.size_complete));
    assert!(report.largest_entries.iter().any(|e| e.path.ends_with("b") && e.logical_bytes == 7 && e.size_complete));
}

#[test]
fn cancellation_returns_measured_bytes_and_a_final_progress_event() {
    let fixture = tempdir().unwrap();
    for i in 0..20 { file(fixture.path(), &format!("{i}.txt"), 3); }
    let cancel = AtomicBool::new(false);
    let mut events = Vec::new();
    let options = ScanOptions { progress_interval: Duration::ZERO, ..Default::default() };
    let report = scan_workspace(fixture.path(), options, &cancel, |progress| {
        events.push(progress.clone());
        if progress.stats.files_scanned >= 5 { cancel.store(true, Ordering::Relaxed); }
    }).unwrap();
    assert_eq!(report.status, ScanStatus::Cancelled);
    assert!(!report.total_size_complete);
    assert_eq!(report.stats.files_scanned, 5);
    assert_eq!(report.stats.total_logical_bytes, 15);
    assert!(!events[0].finished);
    assert!(events.last().unwrap().finished);
    assert_eq!(events.last().unwrap().stats.total_logical_bytes, 15);
}

#[test]
fn already_cancelled_scan_does_not_walk() {
    let fixture = tempdir().unwrap();
    file(fixture.path(), "file", 5);
    let report = scan_workspace(fixture.path(), ScanOptions::default(), &AtomicBool::new(true), |_| {}).unwrap();
    assert_eq!(report.status, ScanStatus::Cancelled);
    assert_eq!(report.stats.files_scanned, 0);
    assert_eq!(report.stats.directories_scanned, 0);
    assert!(!report.total_size_complete);
}

#[test]
fn capped_result_lists_do_not_change_scan_totals() {
    let fixture = tempdir().unwrap();
    for (name, size) in [(".env.a", 3), (".env.b", 5), (".env.c", 7)] { file(fixture.path(), name, size); }
    let options = ScanOptions { max_findings: 1, max_largest_entries: 2, ..Default::default() };
    let report = scan_workspace(fixture.path(), options, &AtomicBool::new(false), |_| {}).unwrap();
    assert_eq!(report.status, ScanStatus::Completed);
    assert!(report.total_size_complete);
    assert!(report.results_truncated);
    assert_eq!(report.stats.findings_found, 3);
    assert_eq!(report.findings.len(), 1);
    assert_eq!(report.stats.total_logical_bytes, 15);
    assert_eq!(report.stats.recognized_logical_bytes, 15);
    assert_eq!(report.largest_entries.len(), 2);
    assert_eq!(report.largest_entries[0].logical_bytes, 7);
    assert_eq!(report.largest_entries[1].logical_bytes, 5);
}

#[test]
fn hardlinks_count_logical_lengths_per_path_not_physical_space() {
    let fixture = tempdir().unwrap();
    file(fixture.path(), "one", 9);
    fs::hard_link(fixture.path().join("one"), fixture.path().join("two")).unwrap();
    let report = inspect_workspace(fixture.path()).unwrap();
    assert_eq!(report.stats.files_scanned, 2);
    assert_eq!(report.stats.total_logical_bytes, 18);
}

#[test]
fn report_serialization_matches_the_frontend_contract() {
    let fixture = tempdir().unwrap();
    file(fixture.path(), "CLAUDE.md", 4);
    let value = serde_json::to_value(inspect_workspace(fixture.path()).unwrap()).unwrap();
    assert_eq!(value["scope"], "recursive");
    assert_eq!(value["status"], "completed");
    assert_eq!(value["totalSizeComplete"], true);
    assert_eq!(value["stats"]["totalLogicalBytes"], "4");
    assert_eq!(value["findings"][0]["logicalBytes"], "4");
    assert_eq!(value["findings"][0]["category"], "aiSettings");
    assert_eq!(value["findings"][0]["kind"], "file");
    assert_eq!(value["findings"][0]["sizeComplete"], true);
    assert!(value["largestEntries"].is_array());
}

#[test]
fn rejects_relative_missing_and_file_roots() {
    assert!(inspect_workspace(Path::new(".")).is_err());
    let fixture = tempdir().unwrap();
    file(fixture.path(), "file", 0);
    assert!(inspect_workspace(&fixture.path().join("file")).is_err());
    assert!(inspect_workspace(&fixture.path().join("missing")).is_err());
    let options = ScanOptions { max_entries: 0, ..Default::default() };
    assert!(scan_workspace(fixture.path(), options, &AtomicBool::new(false), |_| {}).is_err());
}

#[cfg(windows)]
#[test]
fn junctions_and_cycles_are_skipped_and_warnings_are_bounded() {
    use std::process::Command;
    let fixture = tempdir().unwrap();
    let outside = tempdir().unwrap();
    file(outside.path(), "private", 100);
    for name in ["a", "b", "loop"] {
        let target = if name == "loop" { fixture.path() } else { outside.path() };
        let output = Command::new("cmd").args(["/c", "mklink", "/J"])
            .arg(fixture.path().join(name)).arg(target).output().unwrap();
        assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    }
    let options = ScanOptions { max_warnings: 1, ..Default::default() };
    let report = scan_workspace(fixture.path(), options, &AtomicBool::new(false), |_| {}).unwrap();
    assert_eq!(report.stats.skipped_links, 3);
    assert_eq!(report.stats.total_logical_bytes, 0);
    assert_eq!(report.warnings.len(), 1);
    assert_eq!(report.warnings_omitted, 2);
    assert!(!report.total_size_complete);
    assert!(inspect_workspace(&fixture.path().join("a")).is_err());
    for name in ["a", "b", "loop"] { fs::remove_dir(fixture.path().join(name)).unwrap(); }
    assert!(outside.path().join("private").is_file());
}

#[cfg(unix)]
#[test]
fn symbolic_links_and_cycles_are_skipped_and_markers_are_not_followed() {
    use std::os::unix::fs::symlink;
    let fixture = tempdir().unwrap();
    let outside = tempdir().unwrap();
    file(outside.path(), "package.json", 100);
    symlink(outside.path().join("package.json"), fixture.path().join("package.json")).unwrap();
    symlink(fixture.path(), fixture.path().join("loop")).unwrap();
    symlink(outside.path(), fixture.path().join("outside")).unwrap();
    fs::create_dir(fixture.path().join("node_modules")).unwrap();
    let options = ScanOptions { max_warnings: 1, ..Default::default() };
    let report = scan_workspace(fixture.path(), options, &AtomicBool::new(false), |_| {}).unwrap();
    assert!(report.projects.is_empty());
    assert!(report.findings.is_empty());
    assert_eq!(report.stats.total_logical_bytes, 0);
    assert_eq!(report.stats.skipped_links, 3);
    assert_eq!(report.warnings_omitted, 2);
    assert!(!report.total_size_complete);
    assert!(inspect_workspace(&fixture.path().join("outside")).is_err());
}
