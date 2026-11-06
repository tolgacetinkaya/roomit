use roomit_core::{EntryKind, SizeSink, SizedEntry};
use rusqlite::{Connection, OpenFlags, params};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, io, path::PathBuf,
    sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}}};
use tempfile::TempDir;

const PAGE_SIZE: usize = 50;
const INSERT: &str = "INSERT OR REPLACE INTO entries(kind,sort_key,path,search_key,complete) VALUES(?1,?2,?3,?4,?5)";
const FILTER: &str = "kind=?1 AND sort_key<=?2 AND instr(search_key,?3)>0";

fn kind_number(kind: &str) -> Result<i64, String> {
    match kind { "file" => Ok(0), "directory" => Ok(1), _ => Err("Geçersiz öğe türü.".into()) }
}
fn search_key(text: &str) -> String { text.replace('I', "ı").replace('İ', "i").to_lowercase() }
fn size_key(bytes: u64) -> String { format!("{:020}", u64::MAX - bytes) }

/// This writer owns an app-created temporary database, never a scanned file.
/// Each insert updates the disk B-tree; there is no final all-results sort.
pub(crate) struct IndexWriter {
    connection: Connection,
    directory: TempDir,
    rows_in_batch: usize,
}
impl IndexWriter {
    pub fn directories_to_exclude(&self) -> Vec<PathBuf> {
        let path = self.directory.path().to_path_buf();
        #[cfg(target_os = "macos")]
        {
            // APFS Data can expose the same directory through a second path.
            let mut paths = vec![path.clone()];
            if let Ok(relative) = path.strip_prefix("/") {
                paths.push(PathBuf::from("/System/Volumes/Data").join(relative));
            }
            paths
        }
        #[cfg(not(target_os = "macos"))]
        { vec![path] }
    }
    #[cfg(test)]
    pub fn new() -> Result<Self, String> {
        let directory = tempfile::Builder::new().prefix("roomit-results-").tempdir().map_err(|e| e.to_string())?;
        Self::in_directory(directory)
    }
    pub fn new_in(parent: &std::path::Path) -> Result<Self, String> {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        let directory = tempfile::Builder::new().prefix("scan-").tempdir_in(parent).map_err(|e| e.to_string())?;
        Self::in_directory(directory)
    }
    fn in_directory(directory: TempDir) -> Result<Self, String> {
        let connection = Connection::open(directory.path().join("results.sqlite")).map_err(|e| e.to_string())?;
        connection.execute_batch("PRAGMA journal_mode=DELETE; PRAGMA synchronous=NORMAL;
            PRAGMA cache_size=-4096; PRAGMA temp_store=FILE; PRAGMA mmap_size=0;
            CREATE TABLE entries(kind INTEGER NOT NULL, sort_key TEXT NOT NULL, path TEXT NOT NULL,
                search_key TEXT NOT NULL, complete INTEGER NOT NULL,
                PRIMARY KEY(kind,sort_key,path)) WITHOUT ROWID;
            BEGIN IMMEDIATE;").map_err(|e| e.to_string())?;
        Ok(Self { connection, directory, rows_in_batch: 0 })
    }
    pub fn finish(self, id: String) -> Result<IndexSnapshot, String> {
        self.connection.execute_batch("COMMIT;").map_err(|e| e.to_string())?;
        // Close before allowing the temporary directory to be deleted on Windows.
        let Self { connection, directory, .. } = self;
        drop(connection);
        Ok(IndexSnapshot { id, database: directory.path().join("results.sqlite"), directory: Some(directory), persistent_root: None, retired: AtomicBool::new(false) })
    }
}
impl SizeSink for IndexWriter {
    fn record(&mut self, entry: &SizedEntry) -> io::Result<()> {
        let result = (|| -> rusqlite::Result<()> {
            let kind = if entry.kind == EntryKind::File { 0 } else { 1 };
            self.connection.prepare_cached(INSERT)?.execute(params![kind, size_key(entry.logical_bytes),
                entry.path, search_key(&entry.path), entry.size_complete])?;
            self.rows_in_batch += 1;
            if self.rows_in_batch >= 1000 {
                self.connection.execute_batch("COMMIT; BEGIN IMMEDIATE;")?;
                self.rows_in_batch = 0;
            }
            Ok(())
        })();
        result.map_err(|error| io::Error::other(format!("Geçici sonuç dizinine yazılamadı: {error}")))
    }
}

pub(crate) struct IndexSnapshot {
    pub id: String,
    pub(super) database: PathBuf,
    pub(super) directory: Option<TempDir>,
    pub(super) persistent_root: Option<PathBuf>,
    pub(super) retired: AtomicBool,
}
impl Drop for IndexSnapshot {
    fn drop(&mut self) {
        if self.retired.load(Ordering::Relaxed) {
            if let Some(root) = &self.persistent_root { crate::saved_scan::cleanup_generation(&self.database, root); }
        }
    }
}
#[derive(Clone, Default)]
pub(crate) struct ResultIndexes(Arc<Mutex<Option<Arc<IndexSnapshot>>>>);
impl ResultIndexes {
    #[cfg(test)]
    pub fn clear(&self) -> Result<(), String> {
        let old = self.0.lock().map_err(|_| "Sonuç dizini kilitlenemedi.")?.take();
        drop(old); Ok(())
    }
    pub fn publish(&self, snapshot: IndexSnapshot) -> Result<(), String> {
        let database = snapshot.database.clone();
        let persistent = snapshot.persistent_root.is_some();
        let old = self.0.lock().map_err(|_| "Sonuç dizini kilitlenemedi.")?.replace(Arc::new(snapshot));
        if let Some(old) = &old {
            if persistent && old.database != database { old.retired.store(true, Ordering::Relaxed); }
        }
        drop(old); Ok(())
    }
    pub fn get(&self, id: &str) -> Result<Arc<IndexSnapshot>, String> {
        self.0.lock().map_err(|_| "Sonuç dizini kilitlenemedi.")?.as_ref()
            .filter(|snapshot| snapshot.id == id).cloned()
            .ok_or_else(|| "Bu taramanın sonuçları artık açık değil. Yeniden tarayın.".into())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Cursor { pub sort_key: String, pub path: String }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PageRequest {
    pub index_id: String,
    pub request_id: String,
    pub kind: String,
    pub minimum_bytes: String,
    pub query: String,
    pub cursor: Option<Cursor>,
    pub direction: String,
    pub include_total: bool,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SizePage {
    pub entries: Vec<SizedEntry>,
    pub total: Option<String>,
    pub first: Option<Cursor>,
    pub last: Option<Cursor>,
    pub has_previous: bool,
    pub has_next: bool,
}

impl IndexSnapshot {
    pub fn query(&self, request: &PageRequest, cancel: Arc<AtomicBool>) -> Result<SizePage, String> {
        if cancel.load(Ordering::Relaxed) { return Err("Sonuç yükleme iptal edildi.".into()); }
        let kind = kind_number(&request.kind)?;
        let minimum = request.minimum_bytes.parse::<u64>().map_err(|_| "Geçersiz boyut filtresi.")?;
        if request.query.len() > 4096 { return Err("Arama metni çok uzun.".into()); }
        let previous = match request.direction.as_str() { "next" => false, "previous" => true, _ => return Err("Geçersiz sayfa yönü.".into()) };
        if let Some(cursor) = &request.cursor {
            if cursor.sort_key.len() != 20 || cursor.sort_key.parse::<u64>().is_err() || cursor.path.len() > 131_072 {
                return Err("Geçersiz sonuç sayfası.".into());
            }
        }
        let connection = Connection::open_with_flags(&self.database, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX)
            .map_err(|e| e.to_string())?;
        connection.execute_batch("PRAGMA cache_size=-4096; PRAGMA temp_store=FILE; PRAGMA mmap_size=0;").map_err(|e| e.to_string())?;
        let interrupted = cancel.clone();
        connection.progress_handler(1000, Some(move || interrupted.load(Ordering::Relaxed)));
        let result = (|| -> rusqlite::Result<SizePage> {
            let threshold = size_key(minimum);
            let needle = search_key(request.query.trim());
            let total = if request.include_total {
                Some(connection.query_row(&format!("SELECT count(*) FROM entries WHERE {FILTER}"),
                    params![kind, threshold, needle], |row| row.get::<_, i64>(0))?.to_string())
            } else { None };
            let boundary = if request.cursor.is_some() { if previous { " AND (sort_key,path)<(?4,?5)" } else { " AND (sort_key,path)>(?4,?5)" } } else { "" };
            let order = if previous { "sort_key DESC,path DESC" } else { "sort_key,path" };
            let sql = format!("SELECT sort_key,path,complete FROM entries WHERE {FILTER}{boundary} ORDER BY {order} LIMIT {PAGE_SIZE}");
            let mut statement = connection.prepare(&sql)?;
            let map_row = |row: &rusqlite::Row<'_>| -> rusqlite::Result<(Cursor, bool)> {
                Ok((Cursor { sort_key: row.get(0)?, path: row.get(1)? }, row.get(2)?))
            };
            let mut values: Vec<(Cursor, bool)> = if let Some(cursor) = &request.cursor {
                statement.query_map(params![kind, threshold, needle, cursor.sort_key, cursor.path], map_row)?.collect::<rusqlite::Result<_>>()?
            } else { statement.query_map(params![kind, threshold, needle], map_row)?.collect::<rusqlite::Result<_>>()? };
            if previous { values.reverse(); }
            let first = values.first().map(|(cursor, _)| cursor.clone());
            let last = values.last().map(|(cursor, _)| cursor.clone());
            let exists = |cursor: &Cursor, operator: &str| -> rusqlite::Result<bool> {
                connection.query_row(&format!("SELECT EXISTS(SELECT 1 FROM entries WHERE {FILTER} AND (sort_key,path){operator}(?4,?5) LIMIT 1)"),
                    params![kind, threshold, needle, cursor.sort_key, cursor.path], |row| row.get(0))
            };
            let has_previous = first.as_ref().map(|cursor| exists(cursor, "<")).transpose()?.unwrap_or(false);
            let has_next = last.as_ref().map(|cursor| exists(cursor, ">")).transpose()?.unwrap_or(false);
            let entries = values.into_iter().map(|(cursor, complete)| {
                let key = cursor.sort_key.parse::<u64>().map_err(|e| rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e)))?;
                Ok(SizedEntry { logical_bytes: u64::MAX - key,
                    path: cursor.path, kind: if kind == 0 { EntryKind::File } else { EntryKind::Directory }, size_complete: complete })
            }).collect::<rusqlite::Result<_>>()?;
            Ok(SizePage { entries, total, first, last, has_previous, has_next })
        })();
        result.map_err(|error| if cancel.load(Ordering::Relaxed) { "Sonuç yükleme iptal edildi.".into() } else { format!("Sonuçlar okunamadı: {error}") })
    }
}

#[derive(Clone, Default)]
pub(crate) struct QueryRegistry(Arc<Mutex<HashMap<i64, QueryJob>>>);
struct QueryJob { id: String, cancel: Arc<AtomicBool> }
pub(crate) struct QueryLease { registry: QueryRegistry, kind: i64, id: String, pub cancel: Arc<AtomicBool> }
impl QueryRegistry {
    pub fn begin(&self, request: &PageRequest) -> Result<QueryLease, String> {
        let kind = kind_number(&request.kind)?;
        if request.request_id.is_empty() || request.request_id.len() > 128 { return Err("Geçersiz sorgu kimliği.".into()); }
        let mut jobs = self.0.lock().map_err(|_| "Sonuç yükleme durumu okunamadı.")?;
        if let Some(old) = jobs.remove(&kind) { old.cancel.store(true, Ordering::Relaxed); }
        let cancel = Arc::new(AtomicBool::new(false));
        jobs.insert(kind, QueryJob { id: request.request_id.clone(), cancel: cancel.clone() });
        Ok(QueryLease { registry: self.clone(), kind, id: request.request_id.clone(), cancel })
    }
    pub fn cancel(&self, id: &str) -> Result<bool, String> {
        let jobs = self.0.lock().map_err(|_| "Sonuç yükleme durumu okunamadı.")?;
        for job in jobs.values().filter(|job| job.id == id) { job.cancel.store(true, Ordering::Relaxed); return Ok(true); }
        Ok(false)
    }
    pub fn cancel_all(&self) -> Result<(), String> {
        for job in self.0.lock().map_err(|_| "Sonuç yükleme durumu okunamadı.")?.values() { job.cancel.store(true, Ordering::Relaxed); }
        Ok(())
    }
}
impl Drop for QueryLease {
    fn drop(&mut self) {
        if let Ok(mut jobs) = self.registry.0.lock() {
            if jobs.get(&self.kind).is_some_and(|job| job.id == self.id) { jobs.remove(&self.kind); }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{collections::HashSet, time::Instant};
    fn request(kind: &str, minimum: u64) -> PageRequest {
        PageRequest { index_id: "test".into(), request_id: "query".into(), kind: kind.into(),
            minimum_bytes: minimum.to_string(), query: String::new(), cursor: None,
            direction: "next".into(), include_total: true }
    }
    fn entry(path: String, bytes: u64, kind: EntryKind) -> SizedEntry {
        SizedEntry { path, logical_bytes: bytes, kind, size_complete: true }
    }
    fn page(index: &IndexSnapshot, request: &PageRequest) -> SizePage {
        index.query(request, Arc::new(AtomicBool::new(false))).unwrap()
    }

    #[test]
    fn every_match_beyond_ten_thousand_is_reachable_for_both_kinds_with_stable_ties() {
        let mut writer = IndexWriter::new().unwrap();
        for number in 0..10_073 {
            for kind in [EntryKind::File, EntryKind::Directory] {
                writer.record(&entry(format!("/Türkçe/item-{number:05}"), 5_000_000_000 + number % 7, kind)).unwrap();
            }
        }
        let index = writer.finish("test".into()).unwrap();
        for kind in ["file", "directory"] {
            let mut request = request(kind, 5_000_000_000);
            let first = page(&index, &request);
            assert_eq!(first.total.as_deref(), Some("10073"));
            assert_eq!(first.entries.len(), PAGE_SIZE);
            assert!(!first.has_previous && first.has_next);
            let first_paths: Vec<_> = first.entries.iter().map(|e| e.path.clone()).collect();
            request.cursor = first.last.clone(); request.include_total = false;
            let second = page(&index, &request);
            request.cursor = second.first; request.direction = "previous".into();
            let backwards = page(&index, &request);
            assert_eq!(backwards.entries.iter().map(|e| e.path.clone()).collect::<Vec<_>>(), first_paths);
            let mut seen = HashSet::new();
            request.cursor = None; request.direction = "next".into();
            loop {
                let response = page(&index, &request);
                assert!(response.entries.len() <= PAGE_SIZE);
                for entry in &response.entries { assert!(seen.insert(entry.path.clone()), "duplicate cursor row"); }
                if !response.has_next { break; }
                request.cursor = response.last;
            }
            assert_eq!(seen.len(), 10_073);
            request.cursor = None; request.minimum_bytes = "5000000007".into(); request.include_total = true;
            assert_eq!(page(&index, &request).total.as_deref(), Some("0"));
            request.minimum_bytes = "0".into(); request.query = "item-10072".into();
            assert_eq!(page(&index, &request).entries.len(), 1);
        }
    }

    #[test]
    fn exact_u64_sizes_literal_search_partial_flags_and_cursor_validation() {
        let mut writer = IndexWriter::new().unwrap();
        writer.record(&entry("/below".into(), 4_999_999_999, EntryKind::File)).unwrap();
        writer.record(&entry("/equal".into(), 5_000_000_000, EntryKind::File)).unwrap();
        writer.record(&entry("/max".into(), u64::MAX, EntryKind::File)).unwrap();
        writer.record(&SizedEntry { size_complete: false, ..entry("/İstanbul/Işık/%_'quote".into(), 5_000_000_000, EntryKind::Directory) }).unwrap();
        let index = writer.finish("test".into()).unwrap();
        let result = page(&index, &request("file", 5_000_000_000));
        assert_eq!(result.total.as_deref(), Some("2"));
        assert_eq!(result.entries[0].logical_bytes, u64::MAX);
        assert_eq!(page(&index, &request("file", u64::MAX)).entries.len(), 1);
        let mut req = request("directory", 5_000_000_000); req.query = "istanbul/ışık/%_'".into();
        assert!(!page(&index, &req).entries[0].size_complete);
        req.minimum_bytes = "-1".into();
        assert!(index.query(&req, Arc::new(AtomicBool::new(false))).is_err());
        req.minimum_bytes = "0".into(); req.cursor = Some(Cursor { sort_key: "not-a-key".into(), path: String::new() });
        assert!(index.query(&req, Arc::new(AtomicBool::new(false))).is_err());
    }

    #[test]
    fn canceled_query_generations_do_not_cancel_the_next_job_or_the_other_kind() {
        let registry = QueryRegistry::default();
        let old = registry.begin(&request("file", 0)).unwrap();
        let mut req = request("file", 0); req.request_id = "new".into();
        let new = registry.begin(&req).unwrap();
        let directory = registry.begin(&request("directory", 0)).unwrap();
        assert!(old.cancel.load(Ordering::Relaxed));
        assert!(!new.cancel.load(Ordering::Relaxed));
        drop(old);
        assert!(registry.cancel("new").unwrap());
        assert!(new.cancel.load(Ordering::Relaxed));
        assert!(!directory.cancel.load(Ordering::Relaxed));
        registry.cancel_all().unwrap(); assert!(directory.cancel.load(Ordering::Relaxed));
        let index = IndexWriter::new().unwrap().finish("test".into()).unwrap();
        assert!(index.query(&request("file", 0), Arc::new(AtomicBool::new(true))).unwrap_err().contains("iptal"));
    }

    #[test]
    fn replacing_an_index_keeps_inflight_readers_alive_and_removes_only_owned_temp_data() {
        let indexes = ResultIndexes::default();
        indexes.publish(IndexWriter::new().unwrap().finish("old".into()).unwrap()).unwrap();
        let reader = indexes.get("old").unwrap(); let path = reader.database.clone();
        indexes.publish(IndexWriter::new().unwrap().finish("new".into()).unwrap()).unwrap();
        assert!(indexes.get("old").is_err()); assert!(path.exists());
        assert_eq!(page(&reader, &request("file", 0)).total.as_deref(), Some("0"));
        drop(reader); assert!(!path.exists());
        let current = indexes.get("new").unwrap().database.clone();
        indexes.clear().unwrap(); assert!(!current.exists());
    }

    #[test]
    fn large_catalog_keeps_pages_small_and_uses_the_ordered_primary_index() {
        let started = Instant::now(); let mut writer = IndexWriter::new().unwrap();
        for number in 0..100_001 {
            writer.record(&entry(format!("/models/model-{number:06}.bin"), 5_000_000_000 + number, EntryKind::File)).unwrap();
        }
        let index = writer.finish("test".into()).unwrap(); let indexed = started.elapsed();
        let query_start = Instant::now(); let result = page(&index, &request("file", 0)); let query_time = query_start.elapsed();
        assert_eq!(result.total.as_deref(), Some("100001")); assert_eq!(result.entries.len(), PAGE_SIZE);
        let connection = Connection::open(&index.database).unwrap();
        let plan: Vec<String> = connection.prepare("EXPLAIN QUERY PLAN SELECT sort_key,path,complete FROM entries WHERE kind=0 AND sort_key<='18446744073709551615' AND (sort_key,path)>('00000000000000000000','') ORDER BY sort_key,path LIMIT 50").unwrap()
            .query_map([], |row| row.get(3)).unwrap().collect::<rusqlite::Result<_>>().unwrap();
        assert!(!plan.iter().any(|line| line.to_lowercase().contains("temp b-tree")), "{plan:?}");
        println!("100001-row metadata catalog: write={indexed:?}, first 50 rows + exact count={query_time:?}, database={} bytes; 4 MiB connection cache", std::fs::metadata(&index.database).unwrap().len());
    }

    #[test]
    fn cancelled_walk_finishes_a_queryable_partial_index() {
        let fixture = tempfile::tempdir().unwrap();
        std::fs::create_dir(fixture.path().join("nested")).unwrap();
        for number in 0..20 { std::fs::write(fixture.path().join(format!("nested/{number:02}")), b"abc").unwrap(); }
        let cancel = AtomicBool::new(false); let mut writer = IndexWriter::new().unwrap(); let mut received = 0;
        let mut sink = |entry: &SizedEntry| {
            writer.record(entry)?;
            if entry.kind == EntryKind::File { received += 1; if received == 2 { cancel.store(true, Ordering::Relaxed); } }
            Ok(())
        };
        let report = roomit_core::scan_workspace_with_sink(fixture.path(), roomit_core::ScanOptions::default(), &cancel, |_| {}, &mut sink).unwrap();
        drop(sink);
        assert_eq!(report.status, roomit_core::ScanStatus::Cancelled);
        assert_eq!(report.stats.total_logical_bytes, 6);
        let index = writer.finish("partial".into()).unwrap();
        assert_eq!(page(&index, &request("file", 0)).total.as_deref(), Some("2"));
        let directories = page(&index, &request("directory", 0));
        assert!(!directories.entries[0].size_complete);
    }
}
