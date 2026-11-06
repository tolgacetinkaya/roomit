use serde::Serialize;
use std::cmp::Ordering;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Category {
    BuildOutput,
    Dependencies,
    PythonCache,
    AiUserData,
    AiSettings,
    AiModels,
    ProtectedData,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Disposition { ReviewRequired, Protected }

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum EntryKind { File, Directory }

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Finding {
    pub path: String,
    pub kind: EntryKind,
    pub category: Category,
    pub disposition: Disposition,
    pub tool: &'static str,
    pub rule_id: &'static str,
    pub reason: &'static str,
    #[serde(serialize_with = "serialize_bytes")]
    pub logical_bytes: u64,
    pub size_complete: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SizedEntry {
    #[serde(serialize_with = "serialize_bytes")]
    pub logical_bytes: u64,
    pub path: String,
    pub kind: EntryKind,
    pub size_complete: bool,
}

// A min-heap of Reverse<SizedEntry> retains the largest entries, preferring
// lexically earlier paths for equal sizes. Results use the same tie-break.
impl Ord for SizedEntry {
    fn cmp(&self, other: &Self) -> Ordering {
        self.logical_bytes.cmp(&other.logical_bytes)
            .then_with(|| other.path.cmp(&self.path))
            .then(self.kind.cmp(&other.kind))
            .then(self.size_complete.cmp(&other.size_complete))
    }
}
impl PartialOrd for SizedEntry {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> { Some(self.cmp(other)) }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub path: String,
    pub ecosystems: Vec<&'static str>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ScanStatus { Completed, Cancelled, Limited }

#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanStats {
    pub files_scanned: u64,
    pub directories_scanned: u64,
    pub entries_seen: u64,
    pub skipped_links: u64,
    pub skipped_special: u64,
    pub skipped_mounts: u64,
    pub excluded_entries: u64,
    pub errors: u64,
    pub projects_found: u64,
    pub findings_found: u64,
    /// Sum of regular file lengths, counting each encountered directory entry.
    /// Not allocated disk space, hardlink deduplication, or reclaimable bytes.
    #[serde(serialize_with = "serialize_bytes")]
    pub total_logical_bytes: u64,
    /// Union of recognized paths: a nested finding is not summed twice.
    #[serde(serialize_with = "serialize_bytes")]
    pub recognized_logical_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub stats: ScanStats,
    pub current_path: String,
    pub finished: bool,
    pub root_index: usize,
    pub root_count: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RootStatus { Completed, Cancelled, Limited, Failed, NotScanned, Excluded }

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RootReport {
    pub path: String,
    pub status: RootStatus,
    #[serde(serialize_with = "serialize_bytes")]
    pub logical_bytes: u64,
    pub size_complete: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectionReport {
    pub root: String,
    pub scope: &'static str,
    pub status: ScanStatus,
    pub total_size_complete: bool,
    pub stats: ScanStats,
    pub projects: Vec<Project>,
    pub findings: Vec<Finding>,
    /// Bounded top list, not a full in-memory file inventory. Directory entries
    /// overlap their children; do not add rows together to calculate totals.
    pub largest_entries: Vec<SizedEntry>,
    pub warnings: Vec<String>,
    pub warnings_omitted: u64,
    pub results_truncated: bool,
    pub roots: Vec<RootReport>,
}

// JavaScript numbers cannot represent every u64. Preserve exact byte counts
// across IPC/JSON, while Rust callers continue to use numeric counters.
fn serialize_bytes<S: serde::Serializer>(bytes: &u64, serializer: S) -> Result<S::Ok, S::Error> {
    serializer.serialize_str(&bytes.to_string())
}
