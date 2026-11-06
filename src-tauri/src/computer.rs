use std::path::PathBuf;
use sysinfo::{DiskRefreshKind, Disks};

/// sysinfo includes fixed/removable local volumes on Windows and browsable
/// local volumes on macOS, including APFS Data. It filters network mounts.
pub(crate) fn computer_roots() -> Result<Vec<PathBuf>, String> {
    let disks = Disks::new_with_refreshed_list_specifics(DiskRefreshKind::nothing());
    let candidates = disks.iter().map(|disk| disk.mount_point().to_path_buf()).collect();
    let home = user_home();
    let mut roots = plan_roots(candidates, home.as_deref())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if let Some(device) = home.as_ref().and_then(|home| std::fs::metadata(home).ok()).map(|metadata| metadata.dev()) {
            // APFS firmlink home paths can be on Data even when their visible
            // path is /Users. Prioritize that volume before the system volume.
            roots.sort_by_cached_key(|path| std::fs::metadata(path).map(|metadata| metadata.dev() != device).unwrap_or(true));
        }
    }
    #[cfg(not(unix))]
    { let _ = &mut roots; }
    Ok(roots)
}

pub(crate) fn preferred_home(roots: &[PathBuf]) -> Option<PathBuf> {
    let home = user_home()?;
    #[cfg(target_os = "macos")]
    {
        let data = PathBuf::from("/System/Volumes/Data");
        if roots.contains(&data) {
            if let Ok(relative) = home.strip_prefix("/") {
                let physical_home = data.join(relative);
                if physical_home.is_dir() { return Some(physical_home); }
            }
        }
    }
    #[cfg(not(target_os = "macos"))]
    { let _ = roots; }
    Some(home)
}

pub(crate) fn user_home() -> Option<PathBuf> {
    #[cfg(windows)]
    { std::env::var_os("USERPROFILE").map(PathBuf::from) }
    #[cfg(not(windows))]
    { std::env::var_os("HOME").map(PathBuf::from) }
}

fn plan_roots(mut roots: Vec<PathBuf>, home: Option<&std::path::Path>) -> Result<Vec<PathBuf>, String> {
    roots.retain(|path| path.is_absolute());
    roots.sort();
    roots.dedup();
    roots.sort_by_key(|path| (!home.is_some_and(|home| home.starts_with(path)), path.clone()));
    if roots.is_empty() { return Err("Taranabilir yerel disk bulunamadı. Klasör seçerek tarayabilirsiniz.".into()); }
    if roots.len() > 256 { return Err("Disk sayısı tarama sınırını aşıyor; klasör seçerek tarayın.".into()); }
    Ok(roots)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roots_are_unique_absolute_and_home_volume_is_first() {
        let base = if cfg!(windows) { PathBuf::from(r"C:\") } else { PathBuf::from("/") };
        let a = base.join("a");
        let b = base.join("b");
        let roots = plan_roots(vec![a.clone(), b.clone(), a, PathBuf::from("relative")], Some(&b.join("user"))).unwrap();
        assert_eq!(roots, [b, base.join("a")]);
    }

    #[test]
    fn nested_volume_paths_are_retained_for_partitioned_scanning() {
        let base = if cfg!(windows) { PathBuf::from(r"C:\") } else { PathBuf::from("/") };
        let nested = base.join("mounted");
        assert_eq!(plan_roots(vec![base, nested], None).unwrap().len(), 2);
        assert!(plan_roots(Vec::new(), None).is_err());
    }

    #[test]
    fn native_discovery_returns_absolute_paths_without_scanning_files() {
        let roots = computer_roots().unwrap();
        assert!(!roots.is_empty());
        assert!(roots.iter().all(|path| path.is_absolute()));
    }
}
