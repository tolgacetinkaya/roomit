use std::path::PathBuf;
use sysinfo::{DiskRefreshKind, Disks};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalDisk {
    pub path: String,
    pub name: String,
    pub total_space: String,
    pub available_space: String,
    pub removable: bool,
}

/// Only volume metadata is read here; discovery never starts a file scan.
pub(crate) fn local_disks() -> Result<Vec<LocalDisk>, String> {
    let disks = Disks::new_with_refreshed_list_specifics(DiskRefreshKind::nothing().with_storage());
    let home = user_home();
    let roots = plan_roots(disks.iter().map(|disk| disk.mount_point().to_path_buf()).collect(), home.as_deref())?;
    Ok(roots.iter().filter_map(|root| disks.iter().find(|disk| disk.mount_point() == root).map(|disk| LocalDisk {
        path: root.to_string_lossy().into_owned(),
        name: disk.name().to_string_lossy().into_owned(),
        total_space: disk.total_space().to_string(),
        available_space: disk.available_space().to_string(),
        removable: disk.is_removable(),
    })).collect())
}

/// Validate against fresh discovery. A removed drive or arbitrary subfolder is
/// never silently scanned as a whole disk (nor replaced by another disk).
pub(crate) fn selected_root(requested: &str, roots: &[PathBuf]) -> Result<PathBuf, String> {
    roots.iter().find(|root| root.as_os_str() == std::ffi::OsStr::new(requested)).cloned()
        .ok_or_else(|| "The selected disk is disconnected or unavailable. Refresh the disk list.".into())
}

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
    if roots.is_empty() { return Err("No scannable local disks found. Select a folder instead.".into()); }
    if roots.len() > 256 { return Err("The disk count exceeds the scan limit. Select a folder instead.".into()); }
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
        let disks = local_disks().unwrap();
        assert!(disks.iter().all(|disk| disk.total_space.parse::<u64>().is_ok()
            && disk.available_space.parse::<u64>().is_ok()));
    }

    #[test]
    fn disk_selection_requires_an_exact_current_volume() {
        let a = if cfg!(windows) { PathBuf::from(r"C:\") } else { PathBuf::from("/") };
        let b = a.join("other-volume");
        let roots = vec![a.clone(), b.clone()];
        assert_eq!(selected_root(&b.to_string_lossy(), &roots).unwrap(), b);
        assert!(selected_root(&a.join("some-folder").to_string_lossy(), &roots).is_err());
        assert!(selected_root(&b.to_string_lossy(), &[a]).is_err());
        assert!(selected_root("", &roots).is_err());
    }
}
