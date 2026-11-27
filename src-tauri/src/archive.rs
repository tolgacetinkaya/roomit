use crate::{ScanLease, ScanRegistry, exclusions, saved_scan::SavedScanStore};
use roomit_core::{Exclusions, ScanProgress, ScanStats, display_path};
use rusqlite::{Connection, OpenFlags, params};
use serde::Serialize;
use std::{
    fs::{self, Metadata, ReadDir},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, State, ipc::Channel};

const PAGE_SIZE: u32 = 50;
const MAX_WARNINGS: usize = 20;

#[derive(Default, Clone)]
pub(crate) struct ArchiveStore(Arc<Mutex<Option<Arc<Snapshot>>>>);

struct Snapshot {
    id: String,
    database: tempfile::NamedTempFile,
    totals: Mutex<[Option<MatchTotals>; 2]>,
}

#[derive(Clone, Copy)]
struct MatchTotals {
    minimum: u64,
    total: u64,
    bytes: u128,
}

#[derive(Serialize)]
pub(crate) struct PersonalFolder {
    label: &'static str,
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveReport {
    id: String,
    roots: Vec<String>,
    complete: bool,
    warnings: Vec<String>,
    files_scanned: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveRow {
    path: String,
    bytes: String,
    count: u64,
    category: String,
    direct_only: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchivePage {
    rows: Vec<ArchiveRow>,
    total: u64,
    matched_bytes: String,
}

#[tauri::command]
pub(crate) async fn personal_folders(app: AppHandle) -> Vec<PersonalFolder> {
    let resolver = app.path();
    let paths = [
        ("Desktop", resolver.desktop_dir()),
        ("Documents", resolver.document_dir()),
        ("Downloads", resolver.download_dir()),
        ("Pictures", resolver.picture_dir()),
        ("Videos", resolver.video_dir()),
        ("Music", resolver.audio_dir()),
    ];
    tauri::async_runtime::spawn_blocking(move || {
        paths.into_iter().filter_map(|(label, path)| {
            path.ok().filter(|path| path.is_dir())
                .map(|path| PersonalFolder { label, path: display_path(&path) })
        }).collect()
    }).await.unwrap_or_default()
}

#[tauri::command]
pub(crate) async fn scan_archive(
    app: AppHandle,
    paths: Vec<String>,
    scan_id: String,
    on_progress: Channel<ScanProgress>,
    state: State<'_, ScanRegistry>,
    store: State<'_, ArchiveStore>,
    exclusions: State<'_, exclusions::ExclusionStore>,
    saved: State<'_, SavedScanStore>,
) -> Result<ArchiveReport, String> {
    let lease = state.begin(scan_id)?;
    let store = store.inner().clone();
    let exclusions = exclusions.inner().clone();
    let scan_directory = saved.directory.clone();
    let home = app.path().home_dir().ok();
    tauri::async_runtime::spawn_blocking(move || {
        let archive_directory = scan_directory.with_file_name("archive-scans");
        fs::create_dir_all(&archive_directory).map_err(|e| format!("Could not create archive scan directory: {e}"))?;
        let mut excluded: Vec<PathBuf> = exclusions.paths()?.into_iter().map(PathBuf::from).collect();
        excluded.extend(exclusions::automatic_paths().0);
        excluded.extend([exclusions.directory(), scan_directory, archive_directory.clone()]);
        if let Some(home) = home {
            if cfg!(target_os = "macos") {
                excluded.push(home.join("Library"));
            }
            if cfg!(windows) {
                excluded.push(home.join("AppData"));
            }
        }
        let policy = Exclusions::new(&excluded, cfg!(target_os = "macos"));
        let (snapshot, report) = scan(
            &archive_directory, paths, &lease.id, &policy, &lease.cancel,
            |progress| {
                if on_progress.send(progress).is_err() {
                    lease.cancel.store(true, Ordering::Relaxed);
                }
            },
        )?;
        store.publish(snapshot, lease)?;
        Ok(report)
    })
    .await
    .map_err(|e| e.to_string())?
}

impl ArchiveStore {
    fn publish(&self, snapshot: Snapshot, mut lease: ScanLease) -> Result<(), String> {
        // Serialize publication with cancel_scan so an accepted cancellation cannot replace results.
        let mut active = lease.registry.0.lock().map_err(|_| "Could not read scan state.")?;
        check_cancel(&lease.cancel)?;
        *self.0.lock().map_err(|_| "Could not save archive results.")? = Some(Arc::new(snapshot));
        *active = None;
        lease.id.clear();
        Ok(())
    }

    fn get(&self, id: &str) -> Result<Arc<Snapshot>, String> {
        self.0.lock().map_err(|_| "Could not read archive results.")?
            .as_ref().filter(|snapshot| snapshot.id == id).cloned()
            .ok_or_else(|| "Archive scan results are no longer available.".to_owned())
    }
}

#[tauri::command]
pub(crate) async fn archive_page(
    id: String,
    kind: String,
    minimum_bytes: String,
    page: u32,
    store: State<'_, ArchiveStore>,
) -> Result<ArchivePage, String> {
    let snapshot = store.get(&id)?;
    tauri::async_runtime::spawn_blocking(move || snapshot.page(&kind, &minimum_bytes, page))
        .await.map_err(|e| e.to_string())?
}

impl Snapshot {
    fn page(&self, kind: &str, minimum_bytes: &str, page: u32) -> Result<ArchivePage, String> {
        if !matches!(kind, "file" | "folder") || page == 0 {
            return Err("Invalid archive results page.".into());
        }
        let minimum = minimum_bytes.parse::<u64>().map_err(|_| "Invalid minimum archive size.")?;
        self.query(kind, minimum, page).map_err(|e| format!("Could not read archive results: {e}"))
    }

    fn query(&self, kind: &str, minimum: u64, page: u32) -> rusqlite::Result<ArchivePage> {
        let db = Connection::open_with_flags(self.database.path(), OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        let threshold = minimum.to_be_bytes();
        let offset = u64::from(page - 1) * u64::from(PAGE_SIZE);
        let mut statement = db.prepare(
            "SELECT path, bytes, count, category, direct_only FROM candidates
             WHERE kind = ?1 AND bytes >= ?2 ORDER BY bytes DESC, path LIMIT ?3 OFFSET ?4"
        )?;
        let rows = statement.query_map(params![kind, threshold, PAGE_SIZE, offset], |row| {
            Ok(ArchiveRow {
                path: row.get(0)?,
                bytes: u64::from_be_bytes(row.get(1)?).to_string(),
                count: row.get(2)?,
                category: row.get(3)?,
                direct_only: row.get(4)?,
            })
        })?.collect::<rusqlite::Result<Vec<_>>>()?;

        let totals = self.match_totals(&db, kind, minimum)?;
        Ok(ArchivePage { rows, total: totals.total, matched_bytes: totals.bytes.to_string() })
    }

    fn match_totals(&self, db: &Connection, kind: &str, minimum: u64) -> rusqlite::Result<MatchTotals> {
        let slot = usize::from(kind == "folder");
        if let Ok(cache) = self.totals.lock() {
            if let Some(totals) = cache[slot].filter(|totals| totals.minimum == minimum) {
                return Ok(totals);
            }
        }
        // Fixed-width byte keys retain integer precision beyond SQLite's signed range.
        let mut statement = db.prepare("SELECT bytes FROM candidates WHERE kind = ?1 AND bytes >= ?2")?;
        let mut matches = statement.query(params![kind, minimum.to_be_bytes()])?;
        let mut totals = MatchTotals { minimum, total: 0, bytes: 0 };
        while let Some(row) = matches.next()? {
            totals.total += 1;
            totals.bytes += u128::from(u64::from_be_bytes(row.get(0)?));
        }
        if let Ok(mut cache) = self.totals.lock() {
            cache[slot] = Some(totals);
        }
        Ok(totals)
    }
}

#[derive(Default)]
struct Group {
    bytes: u64,
    count: u64,
    category: Option<&'static str>,
}

impl Group {
    fn add(&mut self, bytes: u64, category: &'static str) {
        self.bytes = self.bytes.saturating_add(bytes);
        self.count += 1;
        self.category = Some(match self.category {
            None => category,
            Some(previous) if previous == category => category,
            Some(_) => "mixed",
        });
    }
}

struct Walker<'db, 'policy, P> {
    insert: rusqlite::Statement<'db>,
    policy: &'policy Exclusions,
    cancel: &'policy AtomicBool,
    progress: P,
    last_progress: Option<Instant>,
    stats: ScanStats,
    warnings: Vec<String>,
    root_index: usize,
    root_count: usize,
}

fn scan(
    directory: &Path, paths: Vec<String>, id: &str, policy: &Exclusions, cancel: &Arc<AtomicBool>,
    progress: impl FnMut(ScanProgress),
) -> Result<(Snapshot, ArchiveReport), String> {
    if paths.is_empty() {
        return Err("Select at least one folder to inspect for archive candidates.".into());
    }
    check_cancel(cancel)?;
    let database = tempfile::Builder::new().prefix("archive-").suffix(".sqlite")
        .tempfile_in(directory).map_err(|e| format!("Could not create archive snapshot: {e}"))?;
    let report = write_snapshot(database.path(), paths, id, policy, cancel, progress)?;
    Ok((Snapshot { id: id.to_owned(), database, totals: Mutex::default() }, report))
}

fn write_snapshot(
    database: &Path, paths: Vec<String>, id: &str, policy: &Exclusions, cancel: &Arc<AtomicBool>,
    mut progress: impl FnMut(ScanProgress),
) -> Result<ArchiveReport, String> {
    let sqlite_error = |e| format!("Could not write archive results: {e}");
    let mut db = Connection::open(database).map_err(sqlite_error)?;
    db.execute_batch(
        "PRAGMA journal_mode = OFF;
         CREATE TABLE candidates (
             kind TEXT NOT NULL, path TEXT NOT NULL, bytes BLOB NOT NULL,
             count INTEGER NOT NULL, category TEXT NOT NULL, direct_only INTEGER NOT NULL
         ) STRICT;"
    ).map_err(sqlite_error)?;
    let transaction = db.transaction().map_err(sqlite_error)?;
    let mut walker = Walker {
        insert: transaction.prepare("INSERT INTO candidates VALUES (?1, ?2, ?3, ?4, ?5, ?6)").map_err(sqlite_error)?,
        policy, cancel, progress: &mut progress, last_progress: None,
        stats: ScanStats::default(), warnings: Vec::new(), root_index: 0, root_count: 0,
    };
    let mut accepted = Vec::new();
    for path in paths {
        check_cancel(cancel)?;
        let path = PathBuf::from(path);
        match validate_root(&path, policy) {
            Ok(root) => accepted.push(root),
            Err(error) => walker.warn(&path, &error),
        }
    }
    let roots = disjoint_roots(accepted);
    walker.root_count = roots.len();
    let mut inspected = Vec::new();
    for (index, root) in roots.iter().enumerate() {
        check_cancel(cancel)?;
        walker.root_index = index + 1;
        walker.send_progress(root);
        if walker.root(root)? {
            inspected.push(display_path(root));
        }
    }
    check_cancel(cancel)?;
    if inspected.is_empty() {
        return Err(format!("No selected folder could be inspected. {}", walker.warnings.join(" ")));
    }
    if walker.stats.errors > walker.warnings.len() as u64 {
        walker.warnings.push(format!("{} more locations could not be inspected.", walker.stats.errors - walker.warnings.len() as u64));
    }
    let report = ArchiveReport {
        id: id.to_owned(),
        roots: inspected,
        complete: walker.stats.errors == 0,
        warnings: std::mem::take(&mut walker.warnings),
        files_scanned: walker.stats.files_scanned,
    };
    let (stats, root_count) = (walker.stats.clone(), walker.root_count);
    drop(walker);
    check_cancel(cancel)?;
    let interrupted = Arc::clone(cancel);
    transaction.progress_handler(1000, Some(move || interrupted.load(Ordering::Relaxed)));
    let indexed = transaction.execute_batch(
        "CREATE INDEX by_size ON candidates (kind, bytes DESC, path);"
    );
    check_cancel(cancel)?;
    indexed.map_err(sqlite_error)?;
    transaction.commit().map_err(sqlite_error)?;
    check_cancel(cancel)?;
    progress(ScanProgress {
        stats, current_path: String::new(), finished: true,
        root_index: root_count, root_count,
    });
    check_cancel(cancel)?;
    Ok(report)
}

impl<P: FnMut(ScanProgress)> Walker<'_, '_, P> {
    fn root(&mut self, root: &Path) -> Result<bool, String> {
        // Validate again before opening a selected root.
        let metadata = match validate_directory(root) {
            Ok(metadata) => metadata,
            Err(error) => { self.warn(root, &error); return Ok(false); }
        };
        let Some(entries) = self.directory(root) else { return Ok(false); };
        let mut direct = Group::default();
        for entry in entries {
            let Some((path, metadata)) = self.entry(entry, root, &metadata)? else { continue; };
            if metadata.is_dir() {
                let group = self.group(&path, &metadata)?;
                self.store_group(&path, &group, false)?;
            } else {
                self.file(&path, &metadata, &mut direct)?;
            }
        }
        self.store_group(root, &direct, true)?;
        Ok(true)
    }

    fn group(&mut self, directory: &Path, root_metadata: &Metadata) -> Result<Group, String> {
        let mut group = Group::default();
        let Some(entries) = self.directory(directory) else { return Ok(group); };
        let mut stack = vec![(directory.to_path_buf(), entries)];
        while let Some((parent, entries)) = stack.last_mut() {
            check_cancel(self.cancel)?;
            let Some(entry) = entries.next() else { stack.pop(); continue; };
            let Some((path, metadata)) = self.entry(entry, parent, root_metadata)? else { continue; };
            if metadata.is_dir() {
                if let Some(children) = self.directory(&path) {
                    stack.push((path, children));
                }
            } else {
                self.file(&path, &metadata, &mut group)?;
            }
        }
        Ok(group)
    }

    fn directory(&mut self, path: &Path) -> Option<ReadDir> {
        // Recheck directory type immediately before enumeration.
        match validate_directory(path).and_then(|_| fs::read_dir(path).map_err(|e| e.to_string())) {
            Ok(entries) => {
                self.stats.directories_scanned += 1;
                self.send_progress(path);
                Some(entries)
            }
            Err(error) => { self.warn(path, &error); None }
        }
    }

    fn entry(
        &mut self, entry: std::io::Result<fs::DirEntry>, parent: &Path, root_metadata: &Metadata,
    ) -> Result<Option<(PathBuf, Metadata)>, String> {
        check_cancel(self.cancel)?;
        self.stats.entries_seen += 1;
        let path = match entry {
            Ok(entry) => entry.path(),
            Err(error) => { self.warn(parent, &error.to_string()); return Ok(None); }
        };
        self.send_progress(&path);
        if self.policy.contains(&path) || managed(&path) {
            self.stats.excluded_entries += 1;
            return Ok(None);
        }
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) => { self.warn(&path, &error.to_string()); return Ok(None); }
        };
        if is_link(&metadata) {
            self.stats.skipped_links += 1;
            return Ok(None);
        }
        if excluded_attributes(&metadata) {
            self.stats.excluded_entries += 1;
            return Ok(None);
        }
        if other_device(root_metadata, &metadata) {
            self.stats.skipped_mounts += 1;
            return Ok(None);
        }
        if !metadata.is_dir() && !metadata.is_file() {
            self.stats.skipped_special += 1;
            return Ok(None);
        }
        Ok(Some((path, metadata)))
    }

    fn file(&mut self, path: &Path, metadata: &Metadata, group: &mut Group) -> Result<(), String> {
        self.stats.files_scanned += 1;
        self.stats.total_logical_bytes = self.stats.total_logical_bytes.saturating_add(metadata.len());
        if let Some(category) = category(path) {
            self.insert_row("file", path, metadata.len(), 1, category, false)?;
            group.add(metadata.len(), category);
        }
        Ok(())
    }

    fn store_group(&mut self, path: &Path, group: &Group, direct_only: bool) -> Result<(), String> {
        if let Some(category) = group.category {
            self.insert_row("folder", path, group.bytes, group.count, category, direct_only)?;
        }
        Ok(())
    }

    fn insert_row(
        &mut self, kind: &str, path: &Path, bytes: u64, count: u64, category: &str, direct_only: bool,
    ) -> Result<(), String> {
        self.insert.execute(params![kind, display_path(path), bytes.to_be_bytes(), count, category, direct_only])
            .map_err(|e| format!("Could not write archive candidate: {e}"))?;
        Ok(())
    }

    fn warn(&mut self, path: &Path, error: &str) {
        self.stats.errors += 1;
        if self.warnings.len() < MAX_WARNINGS {
            self.warnings.push(format!("{}: {error}", display_path(path)));
        }
    }

    fn send_progress(&mut self, path: &Path) {
        if self.last_progress.is_none_or(|last| last.elapsed() >= Duration::from_millis(150)) {
            self.last_progress = Some(Instant::now());
            (self.progress)(ScanProgress {
                stats: self.stats.clone(),
                current_path: display_path(path),
                finished: false, root_index: self.root_index, root_count: self.root_count,
            });
        }
    }
}

fn check_cancel(cancel: &AtomicBool) -> Result<(), String> {
    if cancel.load(Ordering::Relaxed) { Err("Archive scan canceled.".into()) } else { Ok(()) }
}

fn validate_root(path: &Path, policy: &Exclusions) -> Result<PathBuf, String> {
    if !path.is_absolute() || path.parent().is_none() {
        return Err("Select a folder inside a drive.".into());
    }
    if path.ancestors().any(managed) || policy.contains(path) {
        return Err("This location is excluded from archive scanning.".into());
    }
    // Reject links in a selected path's ancestors, including Windows junctions.
    for ancestor in path.ancestors() {
        if ancestor.parent().is_some() {
            validate_directory(ancestor)?;
        }
    }
    let canonical = dunce::canonicalize(path).map_err(|e| e.to_string())?;
    if canonical.ancestors().any(managed) || policy.contains(&canonical) {
        return Err("This location is excluded from archive scanning.".into());
    }
    Ok(canonical)
}

fn validate_directory(path: &Path) -> Result<Metadata, String> {
    let metadata = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if !metadata.is_dir() || is_link(&metadata) || excluded_attributes(&metadata) {
        return Err("Select an accessible folder directly.".into());
    }
    Ok(metadata)
}

fn disjoint_roots(mut roots: Vec<PathBuf>) -> Vec<PathBuf> {
    roots.sort_by_key(|path| path.components().count());
    let mut unique: Vec<PathBuf> = Vec::new();
    for root in roots {
        if !unique.iter().any(|parent| root.starts_with(parent)) {
            unique.push(root);
        }
    }
    unique
}

#[cfg(windows)]
fn is_link(metadata: &Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    metadata.file_attributes() & 0x400 != 0
}

#[cfg(not(windows))]
fn is_link(metadata: &Metadata) -> bool {
    metadata.is_symlink()
}

#[cfg(windows)]
fn excluded_attributes(metadata: &Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    metadata.file_attributes() & 0x4 != 0
}

#[cfg(not(windows))]
fn excluded_attributes(_metadata: &Metadata) -> bool { false }

#[cfg(unix)]
fn other_device(root: &Metadata, entry: &Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    root.dev() != entry.dev()
}

#[cfg(not(unix))]
fn other_device(_root: &Metadata, _entry: &Metadata) -> bool { false }

fn managed(path: &Path) -> bool {
    let name = path.file_name().and_then(|name| name.to_str()).unwrap_or("").to_ascii_lowercase();
    matches!(name.as_str(), "node_modules" | ".git" | ".ssh" | ".venv" | "venv" |
        "__pycache__" | ".cache" | ".ollama" | ".codex" | ".claude" | ".cursor" |
        ".lmstudio" | ".gemini" | "windowsapps")
        || name.ends_with(".photoslibrary") || name.ends_with(".photolibrary")
        || name.ends_with(".fcpbundle") || name.ends_with(".lrdata") || name.ends_with(".app")
}

fn category(path: &Path) -> Option<&'static str> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    Some(match extension.as_str() {
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "tif" | "tiff" | "heic" | "heif" |
        "avif" | "dng" | "cr2" | "cr3" | "nef" | "arw" | "raf" | "orf" | "rw2" => "photo",
        "mp4" | "m4v" | "mov" | "mkv" | "avi" | "webm" | "mts" | "m2ts" | "3gp" |
        "mpeg" | "mpg" | "wmv" => "video",
        "mp3" | "m4a" | "aac" | "flac" | "wav" | "aiff" | "ogg" | "opus" | "wma" => "audio",
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "odt" | "ods" | "odp" |
        "txt" | "rtf" | "csv" | "pages" | "numbers" | "key" | "epub" => "document",
        "msi" | "msix" | "msixbundle" | "appx" | "appxbundle" | "pkg" => "installer",
        "exe" if named_installer(path) => "installer",
        "iso" | "dmg" => "diskImage",
        "zip" | "rar" | "7z" | "tar" | "gz" | "tgz" | "bz2" | "xz" | "zst" => "archive",
        _ => return None,
    })
}

fn named_installer(path: &Path) -> bool {
    let Some(stem) = path.file_stem().and_then(|part| part.to_str()) else { return false; };
    let stem = stem.to_ascii_lowercase();
    // This hint comes from the name alone and says nothing about dependencies.
    if stem.contains("portable") || stem.contains("uninstall") {
        return false;
    }
    let mut installer = false;
    for token in stem.split(|c: char| !c.is_alphanumeric()) {
        match token {
            "update" | "updater" => return false,
            "setup" | "installer" => installer = true,
            _ => {}
        }
    }
    installer
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(path: &Path, bytes: usize) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, vec![0; bytes]).unwrap();
    }

    fn inspect(
        cache: &Path, roots: &[&Path], excluded: &[PathBuf], cancel: &Arc<AtomicBool>,
    ) -> Result<(Snapshot, ArchiveReport), String> {
        scan(
            cache, roots.iter().map(|path| display_path(path)).collect(),
            "test", &Exclusions::new(excluded, true), cancel, |_| {},
        )
    }

    fn fixture() -> (tempfile::TempDir, PathBuf) {
        let directory = tempfile::tempdir().unwrap();
        let canonical = dunce::canonicalize(directory.path()).unwrap();
        (directory, canonical)
    }

    #[test]
    fn classifies_named_installers_and_disc_images_without_suggesting_generic_executables() {
        for path in ["setup.exe", "Game-Setup-x64.EXE", "Game_Installer_1.2.exe"] {
            assert_eq!(category(Path::new(path)), Some("installer"), "{path}");
        }
        for path in [
            "Game.exe", "GamePortable.exe", "Game-Setup-Portable.exe", "Game-Installer-Updater.exe",
            "GamePortable-Setup.exe", "uninstall-setup.exe", "SetupTool.exe",
        ] {
            assert_eq!(category(Path::new(path)), None, "{path}");
        }
        assert_eq!(category(Path::new("Linux-x64.ISO")), Some("diskImage"));
        assert_eq!(category(Path::new("Image.dmg")), Some("diskImage"));
        assert_eq!(category(Path::new("Backup.zip")), Some("archive"));
    }

    #[test]
    fn folder_totals_cover_disjoint_groups_and_direct_files() {
        let (_directory, fixture) = fixture();
        let root = fixture.join("Family");
        let album = root.join("Album");
        write(&album.join("first.JPEG"), 8);
        write(&album.join("Nested/second.nef"), 9);
        write(&album.join("Nested/notes.pdf"), 10);
        write(&root.join("moment.mov"), 24);
        write(&root.join("setup.msi"), 7);
        write(&root.join("Game.exe"), 40);
        write(&root.join("Managed.photoslibrary/hidden.jpg"), 50);
        write(&root.join("Album/Nested/node_modules/proxy.jpg"), 50);
        write(&root.join("Excluded/local.zip"), 50);
        write(&fixture.join("Outside/holiday.jpg"), 50);
        let (snapshot, report) = inspect(
            &fixture, &[&album, &root, &root], &[root.join("Excluded")],
            &Arc::new(AtomicBool::new(false)),
        ).unwrap();
        assert!(report.complete);
        assert_eq!(report.roots, [display_path(&dunce::canonicalize(&root).unwrap())]);
        assert_eq!(report.files_scanned, 6);

        let files = snapshot.page("file", "10", 1).unwrap();
        assert_eq!(files.total, 2);
        assert_eq!(files.matched_bytes, "34");
        assert_eq!(files.rows[0].category, "video");
        assert_eq!(files.rows[1].category, "document");

        let folders = snapshot.page("folder", "10", 1).unwrap();
        assert_eq!(folders.total, 2);
        assert_eq!(folders.matched_bytes, "58");
        assert_eq!((folders.rows[0].direct_only, folders.rows[0].count), (true, 2));
        assert_eq!((folders.rows[1].direct_only, folders.rows[1].count), (false, 3));
        assert_eq!(folders.rows[1].category, "mixed");
        assert!(folders.rows[1].path.ends_with("Album"));
    }

    #[test]
    fn paging_is_stable_and_totals_include_every_match() {
        let (_directory, fixture) = fixture();
        let root = fixture.join("Downloads");
        for index in 0..51 {
            write(&root.join(format!("file-{index:02}.zip")), 4);
        }
        let (snapshot, _) = inspect(&fixture, &[&root], &[], &Arc::new(AtomicBool::new(false))).unwrap();
        let first = snapshot.page("file", "4", 1).unwrap();
        let second = snapshot.page("file", "4", 2).unwrap();
        assert_eq!((first.rows.len(), second.rows.len()), (50, 1));
        assert!(first.rows[0].path.ends_with("file-00.zip"));
        assert!(second.rows[0].path.ends_with("file-50.zip"));
        assert_eq!((second.total, second.matched_bytes), (51, "204".into()));
        assert_eq!(snapshot.page("file", "18446744073709551615", 1).unwrap().total, 0);
        assert!(snapshot.page("file", "4", 0).is_err());
    }

    #[test]
    fn missing_roots_and_cancellation_keep_previous_results_available() {
        let (_directory, fixture) = fixture();
        let root = fixture.join("Pictures");
        let missing = fixture.join("Missing");
        write(&root.join("family.heic"), 12);
        let store = ArchiveStore::default();
        let registry = ScanRegistry::default();
        let lease = registry.begin("test".to_owned()).unwrap();
        let (snapshot, report) = inspect(&fixture, &[&root, &missing], &[], &lease.cancel).unwrap();
        assert!(!report.complete);
        assert_eq!(report.warnings.len(), 1);
        assert!(report.warnings[0].contains("Missing"));
        store.publish(snapshot, lease).unwrap();
        assert!(inspect(&fixture, &[&missing], &[], &Arc::new(AtomicBool::new(false))).is_err());

        let next = registry.begin("next".to_owned()).unwrap();
        let (candidate, _) = inspect(&fixture, &[&root], &[], &next.cancel).unwrap();
        assert!(registry.cancel("next").unwrap());
        assert_eq!(store.publish(candidate, next).unwrap_err(), "Archive scan canceled.");
        assert_eq!(store.get("test").unwrap().page("file", "0", 1).unwrap().total, 1);
        let cancel = Arc::new(AtomicBool::new(false));
        assert!(scan(&fixture, vec![display_path(&root)], "next",
            &Exclusions::new(&[], false), &cancel,
            |_| cancel.store(true, Ordering::Relaxed),
        ).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn links_are_skipped_and_linked_ancestors_cannot_be_selected() {
        let (_directory, fixture) = fixture();
        let root = fixture.join("Pictures");
        let outside = fixture.join("Outside/Album");
        write(&root.join("cover.jpg"), 2);
        write(&outside.join("photo.jpg"), 17);
        let link = root.join("Link");
        std::os::unix::fs::symlink(outside.parent().unwrap(), &link).unwrap();
        let (snapshot, _) = inspect(&fixture, &[&root], &[], &Arc::new(AtomicBool::new(false))).unwrap();
        assert_eq!(snapshot.page("file", "0", 1).unwrap().total, 1);
        assert!(inspect(&fixture, &[&link.join("Album")], &[], &Arc::new(AtomicBool::new(false))).is_err());
    }
}
