use std::{collections::BTreeMap, fs::{File, OpenOptions}, io::{self, Read}, path::Path, sync::atomic::{AtomicBool, Ordering}, time::{Instant, UNIX_EPOCH}};
use roomit_core::{EntryKind, Exclusions, SizedEntry};
use rusqlite::{Connection, OpenFlags, params};
use serde::{Deserialize, Serialize};
use sha2::{Digest,Sha256};
use crate::size_index::IndexSnapshot;

#[derive(Debug, Serialize, Deserialize)]
pub struct ModelGroup { pub bytes:String, pub paths:Vec<String> }
#[derive(Serialize)]
pub struct Verified { pub matches:Vec<Vec<String>>, pub skipped:usize }
#[derive(Clone, Serialize)]
pub struct Progress { file:usize, count:usize, percent:f64 }

fn candidate(path:&Path)->bool {
    if path.extension().and_then(|s|s.to_str()).is_some_and(|s|["gguf","safetensors","onnx"].iter().any(|ext|s.eq_ignore_ascii_case(ext))) { return true; }
    path.parent().is_some_and(|p|p.ends_with("models/blobs"))
        && path.file_name().and_then(|s|s.to_str()).and_then(|s|s.strip_prefix("sha256-"))
            .is_some_and(|hash|hash.len()==64 && hash.bytes().all(|b|b.is_ascii_hexdigit()))
}

#[derive(PartialEq)]
struct Stamp { identity:String, modified:String, bytes:u64 }
fn stamp(file:&File)->io::Result<Stamp> {
    let meta=file.metadata()?;
    if !meta.is_file(){return Err(io::Error::other("File type changed"));}
    #[cfg(windows)] let (volume,id)={
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & (0x400|4)!=0 {return Err(io::Error::other("Protected or linked file"));}
        let info=winapi_util::file::information(file)?; (info.volume_serial_number(),info.file_index())
    };
    #[cfg(unix)] let (volume,id)={use std::os::unix::fs::MetadataExt; (meta.dev(),meta.ino())};
    if id==0{return Err(io::Error::other("No file identity"));}
    let modified=meta.modified()?.duration_since(UNIX_EPOCH).map_err(io::Error::other)?.as_nanos().to_string();
    Ok(Stamp{identity:format!("{volume}:{id}"),modified,bytes:meta.len()})
}
fn open(path:&Path,metadata_only:bool)->io::Result<File>{
    if !path.is_absolute() || dunce::canonicalize(path)?!=path {return Err(io::Error::other("Location changed"));}
    let mut options=OpenOptions::new();
    options.read(true);
    #[cfg(windows)] {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(0x00200000);
        if metadata_only {options.access_mode(0x80);}
    }
    #[cfg(not(windows))] let _=metadata_only;
    options.open(path)
}
pub fn record(db:&Connection,entry:&SizedEntry)->rusqlite::Result<bool> {
    let path=Path::new(&entry.path);
    if entry.kind!=EntryKind::File || entry.logical_bytes==0 || !candidate(path){return Ok(true);}
    let Ok(info)=open(path,true).and_then(|file|stamp(&file)) else {return Ok(false)};
    if info.bytes!=entry.logical_bytes {return Ok(false);}
    db.prepare_cached("INSERT OR IGNORE INTO model_files(bytes,identity,modified,path) VALUES(?1,?2,?3,?4)")?
        .execute(params![info.bytes,info.identity,info.modified,entry.path])?;
    Ok(true)
}
pub fn groups(index:&IndexSnapshot)->rusqlite::Result<Vec<ModelGroup>> {
    let db=Connection::open_with_flags(&index.database,OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let mut query=db.prepare("SELECT bytes,path FROM model_files WHERE bytes IN (SELECT bytes FROM model_files GROUP BY bytes HAVING count(*)>1) ORDER BY bytes DESC,path")?;
    let mut rows=query.query([])?;
    let mut groups:Vec<ModelGroup>=Vec::new();
    while let Some(row)=rows.next()? {
        let bytes=row.get::<_,u64>(0)?.to_string();
        if groups.last().is_none_or(|g|g.bytes!=bytes){groups.push(ModelGroup{bytes,paths:vec![]});}
        groups.last_mut().unwrap().paths.push(row.get(1)?);
    }
    Ok(groups)
}
pub fn verify(index:&IndexSnapshot,bytes:u64,excluded:&Exclusions,cancel:&AtomicBool,mut progress:impl FnMut(Progress)->bool)->Result<Verified,String>{
    let load=||->rusqlite::Result<Vec<(String,Stamp)>>{
        let db=Connection::open_with_flags(&index.database,OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        let mut query=db.prepare("SELECT path,identity,modified FROM model_files WHERE bytes=?1 ORDER BY path")?;
        let records=query.query_map([bytes],|r|Ok((r.get(0)?,Stamp{identity:r.get(1)?,modified:r.get(2)?,bytes})))?;
        records.collect()
    };
    let files=load().map_err(|e|e.to_string())?;
    if files.len()<2||bytes==0{return Err("This size group has no comparable models.".into());}
    let mut buf=vec![0u8;1024*1024];
    let mut hashes=BTreeMap::<[u8;32],Vec<String>>::new();
    let mut skipped=0;
    let count=files.len(); let mut last=Instant::now();
    for (i,(name,expected)) in files.into_iter().enumerate(){
        let path=Path::new(&name);
        if cancel.load(Ordering::Relaxed)||!progress(Progress{file:i+1,count,percent:100.*i as f64/count as f64}){return Err("Verification cancelled.".into());}
        if excluded.contains(path)||!candidate(path){skipped+=1;continue;}
        let Ok(mut file)=open(path,false) else{skipped+=1;continue;};
        if stamp(&file).ok().as_ref()!=Some(&expected){skipped+=1;continue;}
        let mut hash=Sha256::new(); let mut read=0u64;
        while read<bytes {
            if cancel.load(Ordering::Relaxed){return Err("Verification cancelled.".into());}
            let Ok(n)=file.read(&mut buf) else {break};
            if n==0 {break;}
            hash.update(&buf[..n]); read+=n as u64;
            if last.elapsed().as_millis()>=150 {
                if !progress(Progress{file:i+1,count,percent:100.*(i as f64+read as f64/bytes as f64)/count as f64}){return Err("Verification cancelled.".into());}
                last=Instant::now();
            }
        }
        if read==bytes && stamp(&file).ok().as_ref()==Some(&expected)
            && open(path,true).and_then(|f|stamp(&f)).ok().as_ref()==Some(&expected) {
            hashes.entry(hash.finalize().into()).or_default().push(name);
        }else{skipped+=1;}
    }
    Ok(Verified{matches:hashes.into_values().filter(|v|v.len()>1).collect(),skipped})
}

#[cfg(test)]
mod tests {
    use super::*;
    use roomit_core::SizeSink;
    #[test]
    fn distinct_candidates_and_consent_verification() {
        let temp=tempfile::tempdir().unwrap();
        let root=dunce::canonicalize(temp.path()).unwrap();
        let mut writer=crate::size_index::IndexWriter::new().unwrap();
        for (name,content) in [("one.gguf","abcd"),("two.safetensors","abcd"),("different.gguf","abce"),("ignore.txt","abcd")] {
            std::fs::write(root.join(name),content).unwrap();
        }
        std::fs::hard_link(root.join("one.gguf"),root.join("alias.gguf")).unwrap();
        for name in ["one.gguf","two.safetensors","different.gguf","ignore.txt","alias.gguf"] {
            writer.record(&SizedEntry{path:root.join(name).to_string_lossy().into_owned(),logical_bytes:4,size_complete:true,kind:EntryKind::File}).unwrap();
        }
        let index=writer.finish("test".into()).unwrap();
        let list=groups(&index).unwrap();
        assert_eq!(list.len(),1);
        assert_eq!(list[0].paths.len(),3);
        let exclusions=Exclusions::new(&[],false);
        let cancel=AtomicBool::new(false);
        let result=verify(&index,4,&exclusions,&cancel,|_|true).unwrap();
        assert_eq!(result.matches.len(),1);
        assert_eq!(result.matches[0].len(),2);
        let restricted=Exclusions::new(&[root.join("two.safetensors")],false);
        assert!(verify(&index,4,&restricted,&cancel,|_|true).unwrap().matches.is_empty());
        std::fs::write(root.join("two.safetensors"),"changed").unwrap();
        let result=verify(&index,4,&exclusions,&cancel,|_|true).unwrap();
        assert_eq!(result.skipped,1); assert!(result.matches.is_empty());
        cancel.store(true,Ordering::Relaxed);
        assert!(verify(&index,4,&exclusions,&cancel,|_|true).is_err());
        assert!(candidate(&root.join("models/blobs").join(format!("sha256-{}","a".repeat(64)))));
    }
}
