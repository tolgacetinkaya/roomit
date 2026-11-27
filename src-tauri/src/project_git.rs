use std::{io::ErrorKind, path::Path, sync::atomic::{AtomicBool, Ordering}};
use git2::{ErrorCode, Repository, StatusOptions};
use roomit_core::Exclusions;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub(super) enum ProjectGit {
    NoRepository,
    Unavailable,
    Repository {
        #[serde(rename = "lastCommitTime")]
        last_commit_time: Option<i64>,
        dirty: Option<bool>,
    },
}

fn tree_entry(commit: &git2::Commit<'_>, relative: &Path) -> Result<Option<git2::Oid>, git2::Error> {
    match commit.tree()?.get_path(relative) {
        Ok(entry) => Ok(Some(entry.id())),
        Err(error) if error.code() == ErrorCode::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

// Follow the current branch's path history. At a merge, follow the parent
// that supplied the project's tree. Unrelated commits leave its date intact.
fn last_project_commit(mut commit: git2::Commit<'_>, relative: &Path, cancel: &AtomicBool) -> Result<Option<i64>, git2::Error> {
    if relative.as_os_str().is_empty() { return Ok(Some(commit.time().seconds())); }
    let entry = tree_entry(&commit, relative)?;
    loop {
        if cancel.load(Ordering::Relaxed) { return Err(git2::Error::from_str("Scan cancelled")); }
        let mut unchanged = None;
        for index in 0..commit.parent_count() {
            let parent = commit.parent(index)?;
            if tree_entry(&parent, relative)? == entry { unchanged = Some(parent); break; }
        }
        match unchanged {
            Some(parent) => commit = parent,
            None if commit.parent_count() == 0 && entry.is_none() => return Ok(None),
            None => return Ok(Some(commit.time().seconds())),
        }
    }
}

/// Read the checked-out commit and restrict status to this project's subtree.
/// No Git executable, hooks, remote access or index writes are needed.
pub(super) fn inspect(project: &Path, exclusions: &Exclusions, cancel: &AtomicBool) -> ProjectGit {
    for directory in project.ancestors() {
        let marker = directory.join(".git");
        if exclusions.contains(&marker) { return ProjectGit::Unavailable; }
        match std::fs::symlink_metadata(&marker) {
            Err(error) if error.kind() == ErrorKind::NotFound => continue,
            #[cfg(windows)]
            Ok(meta) if std::os::windows::fs::MetadataExt::file_attributes(&meta) & 0x400 != 0 => return ProjectGit::Unavailable,
            Ok(meta) if meta.is_file() || meta.is_dir() => {}
            _ => return ProjectGit::Unavailable,
        }
        let Ok(repo) = Repository::open(directory) else { return ProjectGit::Unavailable };
        if [repo.path(), repo.commondir()].iter().any(|p| exclusions.contains(p) || exclusions.has_descendant(p)) {
            return ProjectGit::Unavailable;
        }
        if repo.workdir().and_then(|p| p.canonicalize().ok()) != directory.canonicalize().ok() {
            return ProjectGit::Unavailable;
        }
        let relative = project.strip_prefix(directory).expect("ancestor");
        let last_commit_time = match repo.head().and_then(|head| head.peel_to_commit()) {
            Ok(commit) => match last_project_commit(commit, relative, cancel) {
                Ok(time) => time,
                Err(_) => return ProjectGit::Unavailable,
            },
            Err(error) if error.code() == ErrorCode::UnbornBranch => None,
            Err(_) => return ProjectGit::Unavailable,
        };
        // libgit2 cannot prune arbitrary Roomit exclusions during status.
        // Preserve the commit date and leave the status unknown in that case.
        let dirty = if exclusions.has_descendant(project) { None } else {
            let mut options = StatusOptions::new();
            options.include_untracked(true).include_ignored(false).recurse_untracked_dirs(false)
                .update_index(false).include_unreadable(true);
            if project != directory {
                let mut pattern = relative.components().map(|part| {
                    part.as_os_str().to_string_lossy().replace('[', "[[]").replace('*', "[*]").replace('?', "[?]")
                }).collect::<Vec<_>>().join("/");
                // A leading bang or hash has special meaning to libgit2.
                // Scope results by components below as well as by pathspec.
                if pattern.starts_with(['!', '#']) { pattern.replace_range(..1, "?"); }
                options.pathspec(format!("{pattern}/*")).recurse_untracked_dirs(true);
            }
            repo.statuses(Some(&mut options)).ok().and_then(|entries| {
                let mut dirty = Some(false);
                for entry in entries.iter() {
                    if !relative.as_os_str().is_empty() {
                        let Some(path) = entry.path() else { dirty = None; continue };
                        if !Path::new(path).starts_with(relative) { continue; }
                    }
                    if !(entry.status() - git2::Status::WT_UNREADABLE).is_empty() { return Some(true); }
                    dirty = None;
                }
                dirty
            })
        };
        return ProjectGit::Repository { last_commit_time, dirty };
    }
    ProjectGit::NoRepository
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn local_head_and_project_scoped_changes_are_read_only() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let cancel = AtomicBool::new(false);
        let pkg = root.join("packages/pkg[1]");
        let policy = Exclusions::new(&[], false);
        fs::create_dir_all(&pkg).unwrap();
        assert!(matches!(inspect(&pkg, &policy, &cancel), ProjectGit::NoRepository));
        let repo = Repository::init(root).unwrap();
        fs::write(pkg.join("a"), "one").unwrap();
        let initial = inspect(&pkg, &policy, &cancel);
        assert!(matches!(initial, ProjectGit::Repository { last_commit_time: None, dirty: Some(true) }), "{initial:?}");
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("packages/pkg[1]/a")).unwrap();
        index.write().unwrap();
        let tree = repo.find_tree(index.write_tree().unwrap()).unwrap();
        let sig = git2::Signature::new("Fixture", "fixture@example.invalid", &git2::Time::new(1700000000, 0)).unwrap();
        repo.commit(Some("HEAD"), &sig, &sig, "fixture", &tree, &[]).unwrap();
        fs::write(root.join("sibling"), "other project").unwrap();
        index.add_path(Path::new("sibling")).unwrap();
        index.write().unwrap();
        let sibling_tree = repo.find_tree(index.write_tree().unwrap()).unwrap();
        let newer = git2::Signature::new("Fixture", "fixture@example.invalid", &git2::Time::new(1800000000, 0)).unwrap();
        let parent = repo.head().unwrap().peel_to_commit().unwrap();
        repo.commit(Some("HEAD"), &newer, &newer, "sibling only", &sibling_tree, &[&parent]).unwrap();
        fs::write(root.join("untracked-sibling"), "outside").unwrap();
        let index_path = repo.path().join("index");
        let before = fs::read(&index_path).unwrap();
        assert!(matches!(inspect(&pkg, &policy, &cancel), ProjectGit::Repository { last_commit_time: Some(1700000000), dirty: Some(false) }));
        fs::write(pkg.join("a"), "unstaged change").unwrap();
        assert!(matches!(inspect(&pkg, &policy, &cancel), ProjectGit::Repository { dirty: Some(true), .. }));
        assert_eq!(before, fs::read(&index_path).unwrap());
        index.add_path(Path::new("packages/pkg[1]/a")).unwrap();
        index.write().unwrap();
        assert!(matches!(inspect(&pkg, &policy, &cancel), ProjectGit::Repository { dirty: Some(true), .. }));
        let excluded = Exclusions::new(&[pkg.join("private")], false);
        assert!(matches!(inspect(&pkg, &excluded, &cancel), ProjectGit::Repository { dirty: None, .. }));
    }
}
