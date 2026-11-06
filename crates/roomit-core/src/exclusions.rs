use std::{collections::HashSet, path::{Path, PathBuf}};

/// Component boundaries matter: excluding `app` must not exclude `apple`.
/// Ancestor lookups avoid comparing every file to every installed application.
pub(crate) struct Exclusions {
    paths: HashSet<PathBuf>,
    app_bundles: bool,
}
fn key(path: &Path) -> PathBuf {
    #[cfg(windows)]
    { PathBuf::from(path.to_string_lossy().trim_start_matches(r"\\?\").to_lowercase()) }
    #[cfg(not(windows))]
    { path.to_path_buf() }
}
impl Exclusions {
    pub fn new(paths: &[PathBuf], app_bundles: bool) -> Self {
        let mut keys = HashSet::new();
        for path in paths {
            keys.insert(key(path));
            if let Ok(canonical) = path.canonicalize() { keys.insert(key(&canonical)); }
        }
        Self { paths: keys, app_bundles }
    }
    pub fn contains(&self, path: &Path) -> bool {
        let normalized = key(path);
        normalized.ancestors().any(|ancestor| self.paths.contains(ancestor) ||
            (self.app_bundles && ancestor.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("app"))))
    }
}
