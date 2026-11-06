use roomit_core::{RootStatus, ScanOptions, ScanStatus, scan_locations};
use std::{fs, path::Path, sync::atomic::{AtomicBool, Ordering}, time::Duration};
use tempfile::tempdir;

fn file(root: &Path, name: &str, bytes: usize) {
    let path = root.join(name);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, vec![b'x'; bytes]).unwrap();
}

#[test]
fn multi_root_totals_and_progress_are_cumulative() {
    let fixture = tempdir().unwrap();
    file(fixture.path(), "one/package.json", 2);
    file(fixture.path(), "one/node_modules/file", 5);
    file(fixture.path(), "two/.codex/sessions/file", 7);
    let roots = [fixture.path().join("one"), fixture.path().join("two")];
    let mut events = Vec::new();
    let report = scan_locations(&roots, ScanOptions::default(), &AtomicBool::new(false), |progress| events.push(progress.clone())).unwrap();
    assert_eq!(report.scope, "computer");
    assert_eq!(report.roots.len(), 2);
    assert_eq!(report.stats.total_logical_bytes, 14);
    assert_eq!(report.stats.recognized_logical_bytes, 12);
    assert_eq!(report.roots.iter().map(|root| root.logical_bytes).sum::<u64>(), 14);
    assert!(report.total_size_complete);
    assert!(events.windows(2).all(|pair| pair[0].stats.total_logical_bytes <= pair[1].stats.total_logical_bytes));
    assert_eq!(events.iter().filter(|event| event.finished).count(), 1);
    assert!(events.last().unwrap().finished);
    assert_eq!(events.last().unwrap().root_count, 2);
}

#[test]
fn nested_roots_are_partitioned_without_double_counting() {
    let fixture = tempdir().unwrap();
    file(fixture.path(), "outer/file", 3);
    file(fixture.path(), "outer/mounted/file", 11);
    let roots = [fixture.path().join("outer"), fixture.path().join("outer/mounted")];
    let report = scan_locations(&roots, ScanOptions::default(), &AtomicBool::new(false), |_| {}).unwrap();
    assert_eq!(report.stats.total_logical_bytes, 14);
    assert_eq!(report.stats.files_scanned, 2);
    assert_eq!(report.stats.skipped_mounts, 1);
    assert_eq!(report.roots[0].logical_bytes, 3);
    assert_eq!(report.roots[1].logical_bytes, 11);
    assert!(!report.total_size_complete); // An intentionally pruned parent is conservative.
}

#[test]
fn one_failed_root_does_not_prevent_the_next_root() {
    let fixture = tempdir().unwrap();
    file(fixture.path(), "one/file", 5);
    file(fixture.path(), "two/file", 7);
    let roots = [fixture.path().join("one"), fixture.path().join("missing"), fixture.path().join("two")];
    let report = scan_locations(&roots, ScanOptions::default(), &AtomicBool::new(false), |_| {}).unwrap();
    assert_eq!(report.roots[1].status, RootStatus::Failed);
    assert!(report.roots[1].error.is_some());
    assert_eq!(report.roots[2].status, RootStatus::Completed);
    assert_eq!(report.stats.total_logical_bytes, 12);
    assert_eq!(report.stats.errors, 1);
    assert!(!report.total_size_complete);
}

#[test]
fn cancellation_marks_remaining_roots_unscanned() {
    let fixture = tempdir().unwrap();
    file(fixture.path(), "one/file", 5);
    file(fixture.path(), "two/file", 7);
    let roots = [fixture.path().join("one"), fixture.path().join("two")];
    let cancel = AtomicBool::new(false);
    let options = ScanOptions { progress_interval: Duration::ZERO, ..Default::default() };
    let report = scan_locations(&roots, options, &cancel, |progress| {
        if progress.stats.files_scanned >= 1 { cancel.store(true, Ordering::Relaxed); }
    }).unwrap();
    assert_eq!(report.status, ScanStatus::Cancelled);
    assert_eq!(report.stats.total_logical_bytes, 5);
    assert_eq!(report.roots[1].status, RootStatus::NotScanned);
}

#[test]
fn entry_budget_and_result_caps_are_shared_across_roots() {
    let fixture = tempdir().unwrap();
    file(fixture.path(), "one/.env", 3);
    file(fixture.path(), "two/.env", 5);
    let roots = [fixture.path().join("one"), fixture.path().join("two")];
    let options = ScanOptions { max_findings: 1, max_largest_entries: 1, ..Default::default() };
    let report = scan_locations(&roots, options, &AtomicBool::new(false), |_| {}).unwrap();
    assert_eq!(report.stats.findings_found, 2);
    assert_eq!(report.findings.len(), 1);
    assert_eq!(report.largest_entries.len(), 1);
    assert_eq!(report.stats.total_logical_bytes, 8);
    assert!(report.results_truncated);
    let options = ScanOptions { max_entries: Some(1), ..Default::default() };
    let limited = scan_locations(&roots, options, &AtomicBool::new(false), |_| {}).unwrap();
    assert_eq!(limited.status, ScanStatus::Limited);
    assert_eq!(limited.stats.total_logical_bytes, 3);
    assert_eq!(limited.stats.entries_seen, 1);
}

#[test]
fn duplicate_roots_are_not_rescanned_and_empty_requests_are_rejected() {
    let fixture = tempdir().unwrap();
    file(fixture.path(), "file", 9);
    let roots = [fixture.path().to_path_buf(), fixture.path().canonicalize().unwrap()];
    let report = scan_locations(&roots, ScanOptions::default(), &AtomicBool::new(false), |_| {}).unwrap();
    assert_eq!(report.roots.len(), 1);
    assert_eq!(report.stats.total_logical_bytes, 9);
    assert!(scan_locations(&[], ScanOptions::default(), &AtomicBool::new(false), |_| {}).is_err());
}

#[test]
fn preferred_user_branch_is_visited_before_other_directories_under_a_budget() {
    let fixture = tempdir().unwrap();
    file(fixture.path(), "a-noise/file", 1);
    file(fixture.path(), "z-user/file", 9);
    let options = ScanOptions { max_entries: Some(3), preferred_path: Some(fixture.path().join("z-user")), ..Default::default() };
    let report = scan_locations(&[fixture.path().to_path_buf()], options, &AtomicBool::new(false), |_| {}).unwrap();
    assert_eq!(report.stats.total_logical_bytes, 9);
    assert_eq!(report.status, ScanStatus::Limited);
}

#[test]
fn computer_mode_has_no_count_or_depth_cutoff_and_visits_later_roots() {
    let fixture = tempdir().unwrap();
    let deep = std::iter::repeat_n("x", 140).collect::<Vec<_>>().join("/");
    file(fixture.path(), &format!("one/{deep}/data"), 7);
    for index in 0..250 { file(fixture.path(), &format!("two/{index}"), 1); }
    let roots = [fixture.path().join("one"), fixture.path().join("two")];
    let options = ScanOptions::computer(None);
    assert_eq!(options.max_entries, None);
    assert_eq!(options.max_depth, None);
    let report = scan_locations(&roots, options, &AtomicBool::new(false), |_| {}).unwrap();
    assert_eq!(report.status, ScanStatus::Completed);
    assert!(report.total_size_complete);
    assert_eq!(report.stats.total_logical_bytes, 257);
    assert_eq!(report.stats.files_scanned, 251);
    assert!(report.roots.iter().all(|root| root.status == RootStatus::Completed));
}

#[test]
fn unlimited_computer_scan_still_cancels_with_bounded_output() {
    let fixture = tempdir().unwrap();
    for index in 0..100 { file(fixture.path(), &format!("{index}"), 2); }
    let cancel = AtomicBool::new(false);
    let options = ScanOptions { progress_interval: Duration::ZERO, max_largest_entries: 3,
        ..ScanOptions::computer(None) };
    let report = scan_locations(&[fixture.path().to_path_buf()], options, &cancel, |progress| {
        if progress.stats.files_scanned >= 12 { cancel.store(true, Ordering::Relaxed); }
    }).unwrap();
    assert_eq!(report.status, ScanStatus::Cancelled);
    assert_eq!(report.stats.files_scanned, 12);
    assert_eq!(report.stats.total_logical_bytes, 24);
    assert_eq!(report.largest_entries.len(), 3);
}
