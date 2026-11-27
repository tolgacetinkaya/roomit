use std::{collections::{BTreeMap, BTreeSet}, path::{Path, PathBuf}};
use roomit_core::{EntryKind, SizedEntry};
use serde::{Deserialize, Serialize};

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bucket {
    #[serde(with = "bytes")]
    pub bytes: u64,
    pub locations: BTreeSet<PathBuf>,
}

pub(crate) mod bytes {
    use serde::{Deserialize, Deserializer, Serializer};
    pub fn serialize<S: Serializer>(value: &u64, s: S) -> Result<S::Ok, S::Error> { s.serialize_str(&value.to_string()) }
    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<u64, D::Error> {
        String::deserialize(d)?.parse().map_err(serde::de::Error::custom)
    }
}

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStorage {
    #[serde(default)] pub complete: bool,
    #[serde(skip)] pub covered_roots: BTreeSet<PathBuf>,
    pub categories: BTreeMap<String, Bucket>,
    pub projects: BTreeMap<PathBuf, Bucket>,
}

pub type Breakdown = BTreeMap<String, ToolStorage>;

pub fn category_roots() -> Vec<(PathBuf, String)> {
    let Some(home) = crate::computer::user_home() else { return Vec::new() };
    crate::inventory::catalog().iter().filter(|t| matches!(t.id.as_str(), "codex" | "claude-code"))
        .flat_map(|tool| crate::inventory::data_candidates(tool, &home).into_iter()
            .filter_map(|p| dunce::canonicalize(p).ok()).map(|p| (p, tool.id.clone())))
        .collect()
}

fn classify(tool: &str, relative: &Path) -> (&'static str, Option<PathBuf>) {
    let mut parts = relative.iter();
    let first = parts.next().and_then(|p| p.to_str()).unwrap_or("");
    let file = relative.file_name().and_then(|p| p.to_str()).unwrap_or("");
    let jsonl = file.ends_with(".jsonl");
    if tool == "claude-code" && first == "projects" && jsonl {
        if let Some(project)=parts.next() {
            let inside:Vec<_>=parts.collect();
            if inside.len()==1 || inside.iter().any(|s|*s=="subagents") {
                return ("chats", Some(Path::new(first).join(project)));
            }
        }
    }
    if relative == Path::new("history.jsonl") || (tool == "codex" && matches!(first, "sessions" | "archived_sessions") && jsonl) { return ("chats", None); }
    if matches!(first, "log" | "logs" | "debug") || file.ends_with(".log")
        || (tool == "codex" && first == file && file.starts_with("logs_") && (file.ends_with(".sqlite") || file.ends_with(".sqlite-wal") || file.ends_with(".sqlite-shm"))) {
        return ("logs", None);
    }
    if matches!(first, "cache" | "caches" | ".cache" | "Cache" | "GPUCache" | "Code Cache")
        || relative.starts_with("plugins/cache") { return ("cache", None); }
    ("other", None)
}

pub fn record(data: &mut Breakdown, roots: &[(PathBuf, String)], entry: &SizedEntry) {
    let path = Path::new(&entry.path);
    for (root, tool) in roots {
        let Ok(relative) = path.strip_prefix(root) else { continue };
        let info = data.entry(tool.clone()).or_default();
        if entry.kind != EntryKind::File {
            if relative.as_os_str().is_empty() && entry.size_complete {info.covered_roots.insert(root.clone());}
            break;
        }
        let (category, project) = classify(tool, relative);
        let bucket = info.categories.entry(category.into()).or_default();
        bucket.bytes += entry.logical_bytes;
        // Reveal a stable top-level folder, even when it contains millions of files.
        let location = if category == "other" {
            root.clone()
        } else if relative.starts_with("plugins/cache") { root.join("plugins/cache") }
        else { root.join(relative.iter().next().unwrap()) };
        bucket.locations.insert(location);
        if let Some(project) = project {
            info.projects.entry(root.join(project)).or_default().bytes += entry.logical_bytes;
        }
        break;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn classifies_by_location_and_counts_each_file_once() {
        let root = PathBuf::from("/test/.claude");
        let roots = vec![(root.clone(), "claude-code".into())];
        let mut data = Breakdown::new();
        for path in ["projects/demo/thread.jsonl", "projects/demo/tool-results/image.png", "debug/run.txt", "plugins/cache/file", "settings.json"] {
            record(&mut data, &roots, &SizedEntry { path: root.join(path).to_string_lossy().into_owned(), kind: EntryKind::File, logical_bytes: 9, size_complete: true });
        }
        let info = &data["claude-code"];
        assert_eq!(info.categories["other"].bytes, 18);
        assert_eq!(info.projects[&root.join("projects/demo")].bytes, 9);
        assert_eq!(info.categories.values().map(|v| v.bytes).sum::<u64>(), 45);
        assert_eq!(classify("codex", Path::new("archived_sessions/a.jsonl")).0, "chats");
        assert_eq!(classify("codex", Path::new("auth.json")).0, "other");
    }
}
