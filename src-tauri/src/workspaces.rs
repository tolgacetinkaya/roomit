use crate::{development, inventory, monitor};
use roomit_core::Exclusions;
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::{collections::{BTreeMap, BTreeSet}, path::{Path, PathBuf}};
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

#[derive(Default, Serialize)]
#[serde(rename_all="camelCase")]
pub(crate) struct Workspace {
    path: PathBuf,
    running: BTreeSet<String>,
    recent: BTreeSet<String>,
    session_files: BTreeSet<PathBuf>,
    last_used: Option<i64>,
}

#[derive(Default, Serialize)]
pub(crate) struct Discovery {
    projects: Vec<Workspace>,
    warnings: Vec<String>,
}

fn local_path(path: &Path, policy: &Exclusions) -> Option<PathBuf> {
    let value = path.to_str()?;
    #[cfg(windows)]
    let value = value.strip_prefix(r"\\?\").unwrap_or(value);
    let path = Path::new(value);
    if !path.is_absolute() || value.starts_with(r"\\") || value.starts_with("//") || policy.contains(path) { return None; }
    let resolved = dunce::canonicalize(path).ok()?;
    if !policy.contains(&resolved) && resolved.parent().is_some() { Some(resolved) } else { None }
}

fn project_folder(path: &Path, policy: &Exclusions, from_session: bool) -> Option<PathBuf> {
    let folder = local_path(path, policy)?;
    if !folder.is_dir() { return None; }
    for parent in folder.ancestors().filter(|p| p.parent().is_some()) {
        if [".git","package.json","Cargo.toml","pyproject.toml","go.mod","pom.xml","build.gradle","build.gradle.kts"]
            .iter().map(|m| parent.join(m)).any(|p| !policy.contains(&p) && p.exists()) {
            return Some(parent.into());
        }
    }
    from_session.then_some(folder)
}

fn recent_projects(database: &Path, sql: &str, since: i64) -> rusqlite::Result<Vec<(String,i64,Option<String>)>> {
    let db = Connection::open_with_flags(database, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    db.busy_timeout(std::time::Duration::from_millis(200))?;
    let mut query = db.prepare(sql)?;
    let rows = query.query_map([since], |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?)))?;
    rows.collect()
}

const CODEX: &str = "SELECT cwd, updated_at, rollout_path FROM threads WHERE archived=0 AND updated_at>=?1";
const OPENCODE: &str = "SELECT directory, max(time_updated)/1000 AS last_used, NULL FROM session WHERE time_updated>=?1*1000 GROUP BY directory ORDER BY last_used DESC";

pub(crate) fn discover(policy: Exclusions, home: &Path) -> Discovery {
    let mut folders = BTreeMap::<PathBuf, Workspace>::new();
    let tools = inventory::catalog();
    let mut result = Discovery::default();
    let mut session_folders = BTreeMap::new();
    let mut system = System::new();
    system.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing()
        .with_cwd(UpdateKind::Always).with_exe(UpdateKind::Always).with_cmd(UpdateKind::Always).without_tasks());
    for process in system.processes().values() {
        let Some(cwd) = process.cwd() else { continue };
        let exe = process.exe().and_then(Path::to_str).unwrap_or("");
        let name = process.name().to_string_lossy();
        let script = process.cmd().get(1).and_then(|s| s.to_str()).unwrap_or("");
        let owner = monitor::process_tool(&name, exe, script, &tools)
            .and_then(|id| tools.iter().find(|t| t.id == id).map(|t| t.name.clone()))
            .or_else(|| development::identity(&name, exe).map(|(_, name)| name));
        if let Some(owner) = owner {
            if let Some(path) = project_folder(cwd, &policy, false) {
                folders.entry(path.clone()).or_insert_with(|| Workspace {path,..Default::default()}).running.insert(owner);
            }
        }
    }
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64;
    for tool in tools.iter().filter(|t| matches!(t.id.as_str(), "codex"|"opencode")) {
        let (filename, query) = if tool.id == "codex" { ("state_5.sqlite", CODEX) } else { ("opencode.db", OPENCODE) };
        let databases: BTreeSet<_> = inventory::data_candidates(tool,home).iter()
            .filter_map(|root| local_path(&root.join(filename), &policy)).collect();
        for db in databases {
            match recent_projects(&db, query, now - 7*86400) {
                Ok(rows) => for (cwd,time,session) in rows {
                    let folder = session_folders.entry(cwd.clone()).or_insert_with(|| project_folder(Path::new(&cwd), &policy, true).filter(|p| p != home));
                    if let Some(path) = folder.clone() {
                        let item = folders.entry(path.clone()).or_insert_with(|| Workspace {path,..Default::default()});
                        if let (Some(file),Some(root)) = (session, db.parent()) {
                            let path = PathBuf::from(file);
                            let path = PathBuf::from(roomit_core::display_path(&path));
                            if ["sessions","archived_sessions"].iter().any(|name| path.starts_with(root.join(name))) && !policy.contains(&path) && !path.components().any(|c| c==std::path::Component::ParentDir) {
                                item.session_files.insert(path);
                            }
                        }
                        item.recent.insert(tool.name.clone());
                        item.last_used = Some(item.last_used.unwrap_or(time).max(time));
                    }
                },
                Err(_) => result.warnings.push(format!("{} workspace history is unavailable.",tool.name)),
            }
        }
    }
    result.projects = folders.into_values().collect();
    result.projects.sort_by(|a,b| a.running.is_empty().cmp(&b.running.is_empty()).then(b.last_used.cmp(&a.last_used)).then(a.path.cmp(&b.path)));
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn process_evidence_requires_project_markers_and_respects_exclusions() {
        let tmp = tempfile::tempdir().unwrap();
        let child = tmp.path().join("src");
        std::fs::create_dir(&child).unwrap();
        let policy = Exclusions::new(&[],false);
        assert!(project_folder(&child.join("missing"),&policy,false).is_none());
        std::fs::write(tmp.path().join("Cargo.toml"),"").unwrap();
        assert_eq!(project_folder(&child,&policy,false),dunce::canonicalize(tmp.path()).ok());
        assert!(project_folder(&child,&Exclusions::new(&[child.clone()],false),true).is_none());
    }
    #[test]
    fn recent_history_uses_directory_and_time_without_messages() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("history");
        let db = Connection::open(&file).unwrap();
        db.execute_batch("CREATE TABLE threads(cwd,updated_at,archived,rollout_path); INSERT INTO threads VALUES ('old',1,0,NULL),('active',20,0,'session.jsonl'),('archived',22,1,NULL);
            CREATE TABLE session(directory,time_updated); INSERT INTO session VALUES ('active',20000),('old',1000);").unwrap();
        assert_eq!(recent_projects(&file,CODEX,5).unwrap(),vec![("active".into(),20,Some("session.jsonl".into()))]);
        assert_eq!(recent_projects(&file,OPENCODE,5).unwrap(),vec![("active".into(),20,None)]);
    }
}
