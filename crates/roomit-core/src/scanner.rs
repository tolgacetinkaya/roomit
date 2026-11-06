use crate::{model::*, rules::{self, Context, Evidence, Rule}};
use std::{
    cmp::Reverse,
    collections::BinaryHeap,
    fs, io,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};

#[derive(Debug, Clone)]
pub struct ScanOptions {
    pub max_entries: u64,
    pub max_depth: usize,
    pub max_findings: usize,
    pub max_largest_entries: usize,
    pub max_warnings: usize,
    pub progress_interval: Duration,
}
impl Default for ScanOptions {
    fn default() -> Self {
        Self {
            max_entries: 1_000_000, max_depth: 128, max_findings: 10_000,
            max_largest_entries: 100, max_warnings: 100,
            progress_interval: Duration::from_millis(100),
        }
    }
}

/// Recursive scan with default bounds, for CLI/library callers.
pub fn inspect_workspace(root: &Path) -> io::Result<InspectionReport> {
    scan_workspace(root, ScanOptions::default(), &AtomicBool::new(false), |_| {})
}

/// A single, iterative depth-first walk. File contents are never opened.
/// Logical file lengths are aggregated bottom-up; directories are not rescanned.
/// The progress callback runs on the caller's thread. Cancellation returns a
/// partial report. This read-only walk is best-effort, not a filesystem snapshot.
pub fn scan_workspace<F: FnMut(&ScanProgress)>(
    root: &Path, options: ScanOptions, cancel: &AtomicBool, on_progress: F,
) -> io::Result<InspectionReport> {
    if !root.is_absolute() || options.max_entries == 0 {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "Mutlak bir klasör yolu ve pozitif tarama sınırı gerekir."));
    }
    let metadata = fs::symlink_metadata(root)?;
    if is_link(&metadata) || !metadata.is_dir() {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "Doğrudan bir klasör seçin; bağlantı veya dosya seçmeyin."));
    }
    let root = root.canonicalize()?;
    let (context, rule) = rules::root_context(&root);
    let mut scanner = Scanner {
        report: InspectionReport {
            root: display_path(&root), scope: "recursive", status: ScanStatus::Completed,
            total_size_complete: true, stats: ScanStats::default(), projects: Vec::new(),
            findings: Vec::new(), largest_entries: Vec::new(), warnings: Vec::new(),
            warnings_omitted: 0, results_truncated: false,
        },
        options, cancel, on_progress, last_progress: Instant::now(),
        largest: BinaryHeap::new(), halted: false,
    };
    scanner.progress(&root, true, false);
    let root_frame = scanner.open_directory(root.clone(), 0, context, rule, false)?;
    let mut stack = vec![root_frame];
    while !stack.is_empty() {
        if scanner.should_stop() {
            let frame = stack.last_mut().unwrap();
            frame.complete = false;
            frame.children.clear();
        }
        let child = stack.last_mut().unwrap().children.pop();
        if let Some(child) = child {
            let parent = stack.last().unwrap();
            let depth = parent.depth + 1;
            let matched_ancestor = parent.matched_ancestor || parent.rule.is_some();
            let (context, rule) = rules::directory_rule(&child, parent.context, &parent.evidence);
            if depth > scanner.options.max_depth {
                scanner.report.status = ScanStatus::Limited;
                scanner.warn(format!("Derinlik sınırı nedeniyle alt ağaç atlandı: {}", display_path(&child)));
                stack.push(Frame::unread(child, depth, context, rule, matched_ancestor));
            } else {
                // Only root open failures are fatal; an unreadable child remains
                // in the report as a partial directory and siblings continue.
                let frame = scanner.open_directory(child.clone(), depth, context, rule, matched_ancestor)
                    .unwrap_or_else(|error| {
                        scanner.report.stats.errors += 1;
                        scanner.warn(format!("{}: {error}", display_path(&child)));
                        Frame::unread(child, depth, context, rule, matched_ancestor)
                    });
                stack.push(frame);
            }
        } else {
            let frame = stack.pop().unwrap();
            scanner.record_directory(&frame);
            if let Some(parent) = stack.last_mut() {
                parent.bytes = scanner.add_bytes(parent.bytes, frame.bytes);
                parent.complete &= frame.complete;
            } else {
                scanner.report.total_size_complete = frame.complete;
            }
        }
    }
    scanner.report.findings.sort_by(|a, b| b.logical_bytes.cmp(&a.logical_bytes).then(a.path.cmp(&b.path)));
    scanner.report.projects.sort_by(|a, b| a.path.cmp(&b.path));
    scanner.report.largest_entries = scanner.largest.drain().map(|v| v.0).collect();
    scanner.report.largest_entries.sort_by(|a, b| b.logical_bytes.cmp(&a.logical_bytes).then(a.path.cmp(&b.path)));
    scanner.progress(&root, true, true);
    Ok(scanner.report)
}

struct Frame {
    path: PathBuf,
    depth: usize,
    context: Context,
    evidence: Evidence,
    rule: Option<Rule>,
    matched_ancestor: bool,
    bytes: u64,
    complete: bool,
    children: Vec<PathBuf>,
}
impl Frame {
    fn unread(path: PathBuf, depth: usize, context: Context, rule: Option<Rule>, matched_ancestor: bool) -> Self {
        Self { path, depth, context, rule, matched_ancestor, evidence: Evidence::default(), bytes: 0, complete: false, children: Vec::new() }
    }
}

struct Scanner<'a, F> {
    report: InspectionReport,
    options: ScanOptions,
    cancel: &'a AtomicBool,
    on_progress: F,
    last_progress: Instant,
    largest: BinaryHeap<Reverse<SizedEntry>>,
    halted: bool,
}
impl<F: FnMut(&ScanProgress)> Scanner<'_, F> {
    fn should_stop(&mut self) -> bool {
        if self.cancel.load(Ordering::Relaxed) {
            self.report.status = ScanStatus::Cancelled;
            self.halted = true;
        }
        self.halted
    }

    fn warn(&mut self, warning: String) {
        if self.report.warnings.len() < self.options.max_warnings { self.report.warnings.push(warning); }
        else { self.report.warnings_omitted += 1; }
    }

    fn add_bytes(&mut self, a: u64, b: u64) -> u64 {
        a.checked_add(b).unwrap_or_else(|| {
            self.halted = true;
            self.report.status = ScanStatus::Limited;
            self.warn("Boyut sayacı sınırına ulaşıldı; tarama tamamlanmadı.".into());
            u64::MAX
        })
    }

    fn progress(&mut self, path: &Path, force: bool, finished: bool) {
        if force || self.last_progress.elapsed() >= self.options.progress_interval {
            (self.on_progress)(&ScanProgress { stats: self.report.stats.clone(), current_path: display_path(path), finished });
            self.last_progress = Instant::now();
        }
    }

    fn open_directory(&mut self, path: PathBuf, depth: usize, context: Context, rule: Option<Rule>, matched_ancestor: bool) -> io::Result<Frame> {
        let mut frame = Frame::unread(path, depth, context, rule, matched_ancestor);
        if self.should_stop() { return Ok(frame); }
        // Recheck immediately before opening a queued directory. This reduces
        // link-swap exposure but cannot make a live walk race-free.
        let metadata = fs::symlink_metadata(&frame.path)?;
        if is_link(&metadata) {
            self.report.stats.skipped_links += 1;
            self.warn(format!("Değişen bağlantı/reparse point atlandı: {}", display_path(&frame.path)));
            return Ok(frame);
        }
        if !metadata.is_dir() { return Err(io::Error::other("Klasör tarama sırasında değişti.")); }
        let iterator = fs::read_dir(&frame.path)?;
        self.report.stats.directories_scanned += 1;
        frame.complete = true;
        for entry in iterator {
            if self.should_stop() { frame.complete = false; break; }
            if self.report.stats.entries_seen >= self.options.max_entries {
                self.halted = true;
                self.report.status = ScanStatus::Limited;
                frame.complete = false;
                self.warn(format!("{} öğe sınırına ulaşıldı; sonuçlar kısmi.", self.options.max_entries));
                break;
            }
            self.report.stats.entries_seen += 1;
            let entry = match entry {
                Ok(entry) => entry,
                Err(error) => {
                    self.report.stats.errors += 1;
                    frame.complete = false;
                    self.warn(format!("{} içinde bir öğe okunamadı: {error}", display_path(&frame.path)));
                    continue;
                }
            };
            let path = entry.path();
            match fs::symlink_metadata(&path) {
                Ok(metadata) if is_link(&metadata) => {
                    self.report.stats.skipped_links += 1;
                    frame.complete = false;
                    self.warn(format!("Bağlantı/reparse point atlandı: {}", display_path(&path)));
                }
                Ok(metadata) if metadata.is_dir() => frame.children.push(path.clone()),
                Ok(metadata) if metadata.is_file() => {
                    let bytes = metadata.len();
                    self.report.stats.files_scanned += 1;
                    self.report.stats.total_logical_bytes = self.add_bytes(self.report.stats.total_logical_bytes, bytes);
                    frame.bytes = self.add_bytes(frame.bytes, bytes);
                    if context.discovers_projects() { frame.evidence.observe_file(&path); }
                    if let Some(rule) = rules::file_rule(&path, context) {
                        self.record_finding(&path, EntryKind::File, bytes, true, rule, matched_ancestor || frame.rule.is_some());
                    }
                    self.keep_largest(SizedEntry { path: display_path(&path), kind: EntryKind::File, logical_bytes: bytes, size_complete: true });
                }
                Ok(_) => {
                    self.report.stats.skipped_special += 1;
                    frame.complete = false;
                    self.warn(format!("Özel dosya türü atlandı: {}", display_path(&path)));
                }
                Err(error) => {
                    self.report.stats.errors += 1;
                    frame.complete = false;
                    self.warn(format!("{}: {error}", display_path(&path)));
                }
            }
            self.progress(&path, false, false);
        }
        if context.discovers_projects() {
            let ecosystems = frame.evidence.ecosystems();
            if !ecosystems.is_empty() {
                self.report.stats.projects_found += 1;
                if self.report.projects.len() < self.options.max_findings {
                    self.report.projects.push(Project { path: display_path(&frame.path), ecosystems });
                } else { self.report.results_truncated = true; }
            }
        }
        // Reverse so pop() visits lexically earlier directories first. File
        // enumeration remains filesystem ordered, notably for partial scans.
        frame.children.sort_by(|a, b| b.cmp(a));
        self.progress(&frame.path, false, false);
        Ok(frame)
    }

    fn record_directory(&mut self, frame: &Frame) {
        if let Some(rule) = frame.rule {
            self.record_finding(&frame.path, EntryKind::Directory, frame.bytes, frame.complete, rule, frame.matched_ancestor);
        }
        if frame.depth > 0 {
            self.keep_largest(SizedEntry { path: display_path(&frame.path), kind: EntryKind::Directory, logical_bytes: frame.bytes, size_complete: frame.complete });
        }
    }

    fn record_finding(&mut self, path: &Path, kind: EntryKind, bytes: u64, complete: bool, rule: Rule, matched_ancestor: bool) {
        self.report.stats.findings_found += 1;
        if !matched_ancestor {
            self.report.stats.recognized_logical_bytes = self.add_bytes(self.report.stats.recognized_logical_bytes, bytes);
        }
        if self.report.findings.len() < self.options.max_findings {
            self.report.findings.push(Finding {
                path: display_path(path), kind, category: rule.category, disposition: rule.disposition,
                tool: rule.tool, rule_id: rule.id, reason: rule.reason, logical_bytes: bytes, size_complete: complete,
            });
        } else { self.report.results_truncated = true; }
    }

    fn keep_largest(&mut self, entry: SizedEntry) {
        if self.options.max_largest_entries == 0 { return; }
        self.largest.push(Reverse(entry));
        if self.largest.len() > self.options.max_largest_entries { self.largest.pop(); }
    }
}

fn display_path(path: &Path) -> String {
    let text = path.to_string_lossy();
    #[cfg(windows)]
    {
        if let Some(unc) = text.strip_prefix(r"\\?\UNC\") { return format!(r"\\{unc}"); }
        if let Some(local) = text.strip_prefix(r"\\?\") { return local.to_owned(); }
    }
    text.into_owned()
}

fn is_link(metadata: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        metadata.file_attributes() & 0x400 != 0 // FILE_ATTRIBUTE_REPARSE_POINT
    }
    #[cfg(not(windows))]
    { metadata.file_type().is_symlink() }
}
