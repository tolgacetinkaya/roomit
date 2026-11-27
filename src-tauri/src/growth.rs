use crate::{DesktopReport, saved_scan::SavedScanStore, size_index::IndexSnapshot};
use roomit_core::{RootStatus, ScanStatus};
use rusqlite::{Connection, OpenFlags, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::{Path, PathBuf}};

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Growth {
    pub previous_ms: Option<u64>,
    pub changes: Vec<Change>,
    pub note: String,
}
#[derive(Serialize, Deserialize)]
pub struct Change { pub label: String, pub location: String, pub delta: String }

#[derive(Serialize, Deserialize)]
struct Item { label: String, location: String, bytes: u64, complete: bool }
#[derive(Default, Serialize, Deserialize)]
struct Summary { complete: bool, items: BTreeMap<String, Item> }

fn path_key(path: &Path) -> String {
    let path = path.to_string_lossy();
    if cfg!(windows) { path.replace('/', "\\").to_lowercase() } else { path.into_owned() }
}
pub fn scope(mode: &str, tool: Option<&str>, roots: &[PathBuf], exclusions: &[PathBuf]) -> String {
    let keys = |paths: &[PathBuf]| {
        let mut all: Vec<_> = paths.iter().map(|p| path_key(p)).collect();
        all.sort(); all.dedup(); all
    };
    serde_json::to_string(&(1,mode,tool,keys(roots),keys(exclusions))).expect("plain scope")
}
impl Summary {
    fn add(&mut self, kind: &str, path: &str, label: &str, bytes: u64, complete: bool) {
        self.items.insert(format!("{kind}|{}",path_key(Path::new(path))), Item {
            location:path.into(), label:label.into(), bytes, complete,
        });
    }
    fn collect(report: &DesktopReport, db: &Connection) -> rusqlite::Result<Self> {
        let mut data = Self { complete: report.report.total_size_complete && !report.report.results_truncated, ..Default::default() };
        let mut children = db.prepare("SELECT path,sort_key,complete FROM entries WHERE parent_key=?1 AND kind=1")?;
        for root in &report.report.roots {
            if root.status != RootStatus::Completed { continue; }
            data.add("root",&root.path,"Scan location",root.logical_bytes,root.size_complete);
            let mut rows=children.query([crate::size_index::map_key(&root.path)])?;
            while let Some(row)=rows.next()? {
                let path:String=row.get(0)?;
                let key:String=row.get(1)?;
                let bytes=u64::MAX-key.parse::<u64>().map_err(|_|rusqlite::Error::InvalidQuery)?;
                data.add("directory",&path,"Folder",bytes,row.get(2)?);
            }
        }
        for project in &report.report.projects {
            if let Some(size)=&project.node_modules {
                let path=Path::new(&project.path).join("node_modules");
                data.add("dependencies",&path.to_string_lossy(),"Project dependencies",size.logical_bytes,size.size_complete);
            }
        }
        for (tool,info) in &report.breakdown {
            for (category,bucket) in &info.categories {
                let name=if tool=="codex" {"Codex"} else {"Claude Code"};
                data.items.insert(format!("tool:{tool}:{category}"),Item {
                    location:bucket.locations.iter().next().map(|p|p.to_string_lossy().into_owned()).unwrap_or_default(),
                    label:format!("{name} · {category}"),bytes:bucket.bytes,complete:info.complete,
                });
            }
        }
        Ok(data)
    }
}
fn difference(previous:&Summary, current:&Summary)->Vec<Change>{
    let mut changes=Vec::new();
    for (key,item) in &current.items {
        if !item.complete {continue;}
        let before=match previous.items.get(key) {
            Some(old) if old.complete=>old.bytes,
            None if previous.complete=>0,
            _=>continue,
        };
        if item.bytes!=before {changes.push((item, i128::from(item.bytes)-i128::from(before)));}
    }
    if current.complete {
        for (key,item) in &previous.items {
            if item.complete && item.bytes>0 && !current.items.contains_key(key) {changes.push((item,-i128::from(item.bytes)));}
        }
    }
    changes.sort_by(|(a,x),(b,y)|y.cmp(x).then_with(||a.location.cmp(&b.location)));
    changes.into_iter().map(|(item,delta)| Change {label:item.label.clone(),location:item.location.clone(),delta:delta.to_string()}).collect()
}

// History travels with the result generation. Only publishing the new current.json
// makes the new baseline visible; interrupted saves leave the old one intact.
pub fn compare(saved:&SavedScanStore, index:&IndexSnapshot, report:&DesktopReport, scope:&str)->Result<Growth,String>{
    let previous=saved.load()?.map(|(_,s)|s);
    let run=||->rusqlite::Result<Growth>{
        let mut db=Connection::open(&index.database)?;
        let tx=db.transaction()?;
        tx.execute_batch("CREATE TABLE baseline(scope TEXT PRIMARY KEY, at_ms INTEGER NOT NULL, data TEXT NOT NULL)")?;
        if let Some(old)=previous.as_ref(){
            let prior=Connection::open_with_flags(&old.database,OpenFlags::SQLITE_OPEN_READ_ONLY)?;
            if prior.table_exists(None,"baseline")? {
                let mut records=prior.prepare("SELECT scope,at_ms,data FROM baseline ORDER BY at_ms DESC LIMIT 8")?;
                let mut rows=records.query([])?;
                while let Some(row)=rows.next()? {
                    tx.execute("INSERT INTO baseline VALUES (?1,?2,?3)",params![row.get::<_,String>(0)?,row.get::<_,u64>(1)?,row.get::<_,String>(2)?])?;
                }
            }
        }
        let mut output=Growth::default();
        if report.report.status==ScanStatus::Completed {
            let current=Summary::collect(report,&tx)?;
            let prior:Option<(u64,String)>=tx.query_row("SELECT at_ms,data FROM baseline WHERE scope=?1",[scope],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
            if let Some((at,json))=prior{
                let old:Summary=serde_json::from_str(&json).map_err(|_|rusqlite::Error::InvalidQuery)?;
                output.previous_ms=Some(at);
                output.changes=difference(&old,&current);
                if !current.complete || !old.complete {output.note="Partial coverage. Only comparable measurements are shown.".into();}
            }else{output.note="Baseline saved. Scan the same locations with the same exclusions to compare.".into();}
            tx.execute("INSERT OR REPLACE INTO baseline VALUES (?1,?2,?3)",params![scope,report.scanned_at_ms,serde_json::to_string(&current).map_err(|_|rusqlite::Error::InvalidQuery)?])?;
            tx.execute("DELETE FROM baseline WHERE scope NOT IN (SELECT scope FROM baseline ORDER BY at_ms DESC LIMIT 8)",[])?;
        }else{output.note="Finish a scan to compare changes. The previous baseline is preserved.".into();}
        tx.commit()?;
        Ok(output)
    };
    run().map_err(|e|e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn missing_or_incomplete_measurements_are_not_shrinkage() {
        let mut before=Summary{complete:true,..Default::default()};
        before.add("folder","a","A",10,true);
        before.add("folder","b","B",20,true);
        let mut after=Summary::default();
        after.add("folder","b","B",1,false);
        assert!(difference(&before,&after).is_empty());
        after.complete=true;
        let delta=difference(&before,&after);
        assert_eq!(delta.len(),1); assert_eq!(delta[0].delta,"-10");
    }
}
