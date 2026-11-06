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
    pub max_entries: Option<u64>,
    pub max_depth: Option<usize>,
    pub max_findings: usize,
    pub max_largest_entries: usize,
    pub max_warnings: usize,
    pub progress_interval: Duration,
    /// Computer mode partitions volumes; Unix mount crossings are not followed.
    pub same_file_system: bool,
    /// Prefer the branch containing this directory, e.g. the current user's home.
    pub preferred_path: Option<PathBuf>,
}
impl Default for ScanOptions {
    fn default() -> Self {
        Self {
            max_entries: Some(1_000_000), max_depth: Some(128), max_findings: 10_000,
            max_largest_entries: 100, max_warnings: 100,
            progress_interval: Duration::from_millis(100),
            same_file_system: false, preferred_path: None,
        }
    }
}

impl ScanOptions {
    /// Computer scans have no entry or depth cutoff. Output retention is still
    /// bounded independently; progress and cancellation continue throughout.
    pub fn computer(preferred_path: Option<PathBuf>) -> Self {
        Self { max_entries: None, max_depth: None, same_file_system: true,
            preferred_path, ..Default::default() }
    }
}

pub fn inspect_workspace(root: &Path) -> io::Result<InspectionReport> {
    scan_workspace(root, ScanOptions::default(), &AtomicBool::new(false), |_| {})
}

/// A read-only, iterative walk of one explicitly selected directory.
pub fn scan_workspace<F: FnMut(&ScanProgress)>(
    root: &Path, options: ScanOptions, cancel: &AtomicBool, on_progress: F,
) -> io::Result<InspectionReport> {
    run_scan(&[root.to_path_buf()], options, cancel, on_progress, false)
}

/// Scan several roots with shared limits, cumulative progress, and one bounded
/// result set. Other requested roots are pruned from ancestor walks, so nested
/// mounts/roots are not counted twice. Root failures do not abort other roots.
pub fn scan_locations<F: FnMut(&ScanProgress)>(
    roots: &[PathBuf], options: ScanOptions, cancel: &AtomicBool, on_progress: F,
) -> io::Result<InspectionReport> {
    run_scan(roots, options, cancel, on_progress, true)
}

fn checked_root(root: &Path) -> io::Result<PathBuf> {
    let metadata = fs::symlink_metadata(root)?;
    if is_link(&metadata) || !metadata.is_dir() {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "Doğrudan bir klasör seçin; bağlantı veya dosya seçmeyin."));
    }
    root.canonicalize()
}

fn run_scan<F: FnMut(&ScanProgress)>(
    roots: &[PathBuf], mut options: ScanOptions, cancel: &AtomicBool, on_progress: F, computer: bool,
) -> io::Result<InspectionReport> {
    if roots.is_empty() || roots.len() > 256 || roots.iter().any(|root| !root.is_absolute()) || options.max_entries == Some(0) {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "1–256 mutlak klasör yolu ve pozitif tarama sınırı gerekir."));
    }
    let mut plans = Vec::new();
    for root in roots {
        let (path, error) = match checked_root(root) {
            Ok(path) => (path, None),
            Err(error) if !computer => return Err(error),
            Err(error) => (root.to_path_buf(), Some(error.to_string())),
        };
        if !plans.iter().any(|(existing, _)| existing == &path) { plans.push((path, error)); }
    }
    options.preferred_path = options.preferred_path.and_then(|path| path.canonicalize().ok());
    let root_label = if computer { "Bütün bilgisayar".into() } else { display_path(&plans[0].0) };
    let mut scanner = Scanner {
        report: InspectionReport {
            root: root_label, scope: if computer { "computer" } else { "recursive" }, status: ScanStatus::Completed,
            total_size_complete: true, stats: ScanStats::default(), projects: Vec::new(),
            findings: Vec::new(), largest_entries: Vec::new(), warnings: Vec::new(),
            warnings_omitted: 0, results_truncated: false, roots: Vec::new(),
        },
        root_count: plans.len(), root_index: 0,
        partition_roots: plans.iter().filter(|(_, error)| error.is_none()).map(|(path, _)| path.clone()).collect(),
        root_device: None,
        options, cancel, on_progress, last_progress: Instant::now(),
        largest: BinaryHeap::new(), halted: false,
    };
    for (index, (root, error)) in plans.into_iter().enumerate() {
        scanner.root_index = index + 1;
        if scanner.should_stop() {
            scanner.report.total_size_complete = false;
            scanner.report.roots.push(RootReport { path: display_path(&root), status: RootStatus::NotScanned,
                logical_bytes: 0, size_complete: false, error: None });
            continue;
        }
        let result = if let Some(error) = error {
            Err(io::Error::other(error))
        } else {
            scanner.progress(&root, true, false);
            scanner.walk(&root)
        };
        match result {
            Ok((bytes, complete)) => {
                let status = if scanner.report.status == ScanStatus::Cancelled { RootStatus::Cancelled }
                    else if scanner.halted { RootStatus::Limited } else { RootStatus::Completed };
                scanner.report.total_size_complete &= complete;
                scanner.report.roots.push(RootReport { path: display_path(&root), status,
                    logical_bytes: bytes, size_complete: complete, error: None });
            }
            Err(error) if !computer => return Err(error),
            Err(error) => {
                scanner.report.stats.errors += 1;
                scanner.report.total_size_complete = false;
                scanner.warn(format!("Disk/klasör taranamadı: {}: {error}", display_path(&root)));
                scanner.report.roots.push(RootReport { path: display_path(&root), status: RootStatus::Failed,
                    logical_bytes: 0, size_complete: false, error: Some(error.to_string()) });
            }
        }
    }
    scanner.report.findings.sort_by(|a, b| b.logical_bytes.cmp(&a.logical_bytes).then(a.path.cmp(&b.path)));
    scanner.report.projects.sort_by(|a, b| a.path.cmp(&b.path));
    scanner.report.largest_entries = scanner.largest.drain().map(|v| v.0).collect();
    scanner.report.largest_entries.sort_by(|a, b| b.logical_bytes.cmp(&a.logical_bytes).then(a.path.cmp(&b.path)));
    scanner.progress(Path::new(""), true, true);
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
    partition_roots: Vec<PathBuf>,
    root_device: Option<u64>,
    root_index: usize,
    root_count: usize,
}
impl<F: FnMut(&ScanProgress)> Scanner<'_, F> {
    fn walk(&mut self, root: &Path) -> io::Result<(u64, bool)> {
        self.root_device = device_id(&fs::symlink_metadata(root)?);
        let (context, rule) = rules::root_context(root);
        let mut stack = vec![self.open_directory(root.to_path_buf(), 0, context, rule, false)?];
        let mut root_result = (0, false);
        while !stack.is_empty() {
            if self.should_stop() {
                let frame = stack.last_mut().unwrap();
                frame.complete = false;
                frame.children.clear();
            }
            if let Some(child) = stack.last_mut().unwrap().children.pop() {
                let parent = stack.last().unwrap();
                let depth = parent.depth + 1;
                let matched_ancestor = parent.matched_ancestor || parent.rule.is_some();
                let (context, rule) = rules::directory_rule(&child, parent.context, &parent.evidence);
                let frame = if self.options.max_depth.is_some_and(|limit| depth > limit) {
                    self.report.status = ScanStatus::Limited;
                    self.warn(format!("Derinlik sınırı nedeniyle alt ağaç atlandı: {}", display_path(&child)));
                    Frame::unread(child, depth, context, rule, matched_ancestor)
                } else {
                    self.open_directory(child.clone(), depth, context, rule, matched_ancestor).unwrap_or_else(|error| {
                        self.report.stats.errors += 1;
                        self.warn(format!("{}: {error}", display_path(&child)));
                        Frame::unread(child, depth, context, rule, matched_ancestor)
                    })
                };
                stack.push(frame);
            } else {
                let frame = stack.pop().unwrap();
                self.record_directory(&frame);
                if let Some(parent) = stack.last_mut() {
                    parent.bytes = self.add_bytes(parent.bytes, frame.bytes);
                    parent.complete &= frame.complete;
                } else { root_result = (frame.bytes, frame.complete); }
            }
        }
        Ok(root_result)
    }
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
            (self.on_progress)(&ScanProgress { stats: self.report.stats.clone(), current_path: display_path(path), finished,
                root_index: self.root_index, root_count: self.root_count });
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
            if self.options.max_entries.is_some_and(|limit| self.report.stats.entries_seen >= limit) {
                self.halted = true;
                self.report.status = ScanStatus::Limited;
                frame.complete = false;
                self.warn(format!("{} öğe sınırına ulaşıldı; sonuçlar kısmi.", self.options.max_entries.unwrap()));
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
                Ok(metadata) if metadata.is_dir() && (
                    self.partition_roots.contains(&path) ||
                    (self.options.same_file_system && device_id(&metadata) != self.root_device)
                ) => {
                    self.report.stats.skipped_mounts += 1;
                    frame.complete = false;
                    self.warn(format!("Disk sınırı / ayrı tarama kökü atlandı: {}", display_path(&path)));
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
        let preferred = self.options.preferred_path.as_ref();
        frame.children.sort_by(|a, b| {
            let priority = |path: &PathBuf| preferred.is_some_and(|preferred| preferred.starts_with(path));
            priority(a).cmp(&priority(b)).then_with(|| b.cmp(a))
        });
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

fn device_id(metadata: &fs::Metadata) -> Option<u64> {
    #[cfg(unix)]
    { use std::os::unix::fs::MetadataExt; Some(metadata.dev()) }
    #[cfg(not(unix))]
    { let _ = metadata; None }
}
