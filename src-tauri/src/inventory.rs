use serde::{Deserialize, Serialize};
use std::{collections::BTreeSet, path::{Path, PathBuf}};

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Tool {
    pub id: String, pub name: String, pub kind: String,
    pub commands: Vec<String>, pub app_names: Vec<String>,
    pub data_paths: Vec<String>, pub store_prefixes: Vec<String>,
}
pub(crate) fn catalog() -> Vec<Tool> {
    serde_json::from_str(include_str!("../../src/ai-catalog.json")).expect("Bundled AI catalog")
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InstalledTool {
    pub id: String, pub name: String, pub kind: String,
    pub installations: Vec<String>, pub data_paths: Vec<String>, pub evidence: Vec<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Inventory { pub tools: Vec<InstalledTool>, pub supported_count: usize, pub warnings: Vec<String> }

fn local(path: &Path) -> bool {
    path.is_absolute() && !path.to_string_lossy().starts_with("\\\\") && !path.to_string_lossy().starts_with("//")
}
fn existing(path: &Path) -> bool { local(path) && path.exists() }
fn path_commands(tool: &Tool, paths: &[PathBuf]) -> Vec<String> {
    let mut found = BTreeSet::new();
    for directory in paths.iter().filter(|p| local(p)) {
        for command in &tool.commands {
            #[cfg(windows)] let names = [format!("{command}.exe"), format!("{command}.cmd"), format!("{command}.bat"), format!("{command}.ps1")];
            #[cfg(not(windows))] let names = [command.clone()];
            for name in names {
                let path = directory.join(name);
                if path.is_file() { found.insert(path.to_string_lossy().into_owned()); }
            }
        }
    }
    found.into_iter().collect()
}

pub(crate) fn data_candidates(tool: &Tool, home: &Path) -> Vec<PathBuf> {
    let mut paths: Vec<_> = tool.data_paths.iter().map(|p| home.join(p)).collect();
    #[cfg(windows)] {
        let roaming = home.join("AppData/Roaming");
        let names: &[&str] = match tool.id.as_str() {
            "cursor" => &["Cursor"], "windsurf" => &["Windsurf"], "claude" => &["Claude"],
            "lmstudio" => &["LM Studio"], "jan" => &["Jan"], "anythingllm" => &["anythingllm-desktop"],
            "antigravity" => &["Antigravity"], "trae" => &["Trae"],
            "qwen" => &["Qwen"], "kimi" => &["Kimi"], "zcode" => &["ZCode", "@zcodedesktop"], _ => &[],
        };
        paths.extend(names.iter().map(|n| roaming.join(n)));
        if tool.id == "opencode" { paths.push(home.join("AppData/Local/opencode")); }
    }
    #[cfg(target_os = "macos")] {
        for name in &tool.app_names { paths.push(home.join("Library/Application Support").join(name)); }
    }
    paths
}

pub(crate) fn discover() -> Result<Inventory, String> {
    let home = crate::computer::user_home().ok_or("Home folder not found.")?;
    let mut paths: Vec<PathBuf> = std::env::var_os("PATH").map(|p| std::env::split_paths(&p).collect()).unwrap_or_default();
    paths.extend([home.join(".local/bin"), home.join(".cargo/bin"), home.join(".bun/bin"), home.join("AppData/Roaming/npm"), home.join(".opencode/bin"), home.join(".lmstudio/bin"), PathBuf::from("/opt/homebrew/bin"), PathBuf::from("/usr/local/bin")]);
    let mut warnings = Vec::new();
    let registrations = registrations(&mut warnings);
    let packaged = store_packages(&home, &mut warnings);
    let tools = catalog(); let supported_count = tools.len();
    let tools = tools.into_iter().filter_map(|tool| {
        let mut installations: BTreeSet<String> = path_commands(&tool, &paths).into_iter().collect();
        let mut evidence = BTreeSet::new();
        if !installations.is_empty() { evidence.insert("CLI file / PATH".to_string()); }
        for name in &tool.app_names {
            for (display, location) in &registrations {
                if app_name_matches(display, name) {
                    evidence.insert(format!("Installation record: {display}"));
                    if let Some(path) = location.as_ref().filter(|p| existing(p)) { installations.insert(path.to_string_lossy().into_owned()); }
                }
            }
            for path in app_candidates(&home, name) {
                if existing(&path) { installations.insert(path.to_string_lossy().into_owned()); evidence.insert("Application file".into()); }
            }
        }
        for name in &packaged {
            if tool.store_prefixes.iter().any(|prefix| name.starts_with(prefix)) { evidence.insert("Windows uygulama paketi".into()); }
        }
        let data_paths: Vec<_> = data_candidates(&tool, &home).into_iter().filter(|p| p.is_dir() && local(p)).map(|p| p.to_string_lossy().into_owned()).collect();
        if installations.is_empty() && evidence.is_empty() && data_paths.is_empty() { return None; }
        Some(InstalledTool { id: tool.id, name: tool.name, kind: tool.kind, installations: installations.into_iter().collect(), data_paths, evidence: evidence.into_iter().collect() })
    }).collect();
    Ok(Inventory { tools, supported_count, warnings })
}
fn app_name_matches(display: &str, name: &str) -> bool {
    let display = display.to_lowercase(); let name = name.to_lowercase();
    display == name || display.strip_prefix(&name).is_some_and(|suffix| suffix.starts_with(' ') && suffix.trim_start().starts_with(|c: char| c.is_ascii_digit() || c == '('))
}
pub(crate) fn display_icon_directory(value: &str) -> Option<PathBuf> {
    // DisplayIcon is metadata, never a command line to execute. Remove only a
    // numeric resource index, preserving commas that are part of the file path.
    let value=value.trim();
    let path=value.rsplit_once(',').filter(|(_,index)|index.trim().parse::<i32>().is_ok()).map(|(path,_)|path).unwrap_or(value).trim().trim_matches('"');
    let path=Path::new(path);
    if !local(path) || !path.is_file() { return None; }
    path.parent().filter(|parent|parent.parent().is_some()).map(Path::to_path_buf)
}
pub(crate) fn icon_install_directory(display: &str, value: &str) -> Option<PathBuf> {
    let directory=display_icon_directory(value)?;
    let key=|name:&str|name.to_lowercase().chars().filter(|c|c.is_alphanumeric()).collect::<String>();
    let folder=key(&directory.file_name()?.to_string_lossy());
    // An icon in Desktop/Documents/a shared icon folder must not exclude that
    // entire user directory. Only a recognized product-named installation qualifies.
    catalog().iter().flat_map(|tool|&tool.app_names).any(|name|app_name_matches(display,name)&&folder==key(name)).then_some(directory)
}
fn app_candidates(home: &Path, name: &str) -> Vec<PathBuf> {
    #[cfg(windows)] {
        let mut result = Vec::new();
        for root in [home.join("AppData/Local/Programs"), home.join("AppData/Local"), PathBuf::from(std::env::var_os("ProgramFiles").unwrap_or_default())] {
            result.push(root.join(name).join(format!("{name}.exe")));
            result.push(root.join(name).join(format!("{}.exe", name.to_lowercase().replace(' ', "-"))));
        }
        result
    }
    #[cfg(not(windows))] { vec![PathBuf::from("/Applications").join(format!("{name}.app")), home.join("Applications").join(format!("{name}.app"))] }
}
#[cfg(windows)]
fn registrations(warnings: &mut Vec<String>) -> Vec<(String, Option<PathBuf>)> {
    use winreg::{RegKey, enums::*};
    let mut result = Vec::new();
    for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        for view in [KEY_WOW64_64KEY, KEY_WOW64_32KEY] {
            match RegKey::predef(hive).open_subkey_with_flags("Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall", KEY_READ | view) {
                Ok(key) => for name in key.enum_keys().take(20_000).flatten() {
                    if let Ok(entry) = key.open_subkey(name) {
                        if let Ok(display) = entry.get_value::<String, _>("DisplayName") {
                            let location=entry.get_value::<String,_>("InstallLocation").ok().map(PathBuf::from).filter(|p|existing(p))
                                .or_else(||entry.get_value::<String,_>("DisplayIcon").ok().and_then(|value|display_icon_directory(&value)));
                            result.push((display, location));
                        }
                    }
                },
                Err(error) if error.kind() != std::io::ErrorKind::NotFound => warnings.push("Some Windows installation records were inaccessible.".into()),
                _ => {},
            }
        }
    }
    result
}
#[cfg(not(windows))] fn registrations(_: &mut Vec<String>) -> Vec<(String, Option<PathBuf>)> { Vec::new() }
#[cfg(windows)]
fn store_packages(home: &Path, warnings: &mut Vec<String>) -> Vec<String> {
    use winreg::{RegKey, enums::*};
    let _ = home;
    match RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags("Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\Repository\\Packages", KEY_READ) {
        Ok(key) => key.enum_keys().take(20_000).flatten().collect(),
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => { warnings.push("Could not read Windows app packages.".into()); Vec::new() },
        _ => Vec::new(),
    }
}
#[cfg(not(windows))] fn store_packages(_: &Path, _: &mut Vec<String>) -> Vec<String> { Vec::new() }

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn cli_discovery_checks_exact_files_without_executing_them() {
        let root = tempfile::tempdir().unwrap(); let tool = catalog().remove(0);
        let name = if cfg!(windows) { "codex.cmd" } else { "codex" };
        std::fs::write(root.path().join(name), b"not executable").unwrap();
        std::fs::write(root.path().join("codex-backup.exe"), b"not a match").unwrap();
        assert_eq!(path_commands(&tool, &[root.path().into()]).len(), 1);
        assert!(!app_name_matches("Claude Code", "Claude"));
        assert!(app_name_matches("Cursor 1.2.3", "Cursor"));
    }
    #[test] fn display_icon_uses_literal_paths_and_versioned_ai_registrations_match() {
        let fixture=tempfile::tempdir().unwrap();let directory=fixture.path().join("LM Studio, extra");std::fs::create_dir(&directory).unwrap();
        let file=directory.join("LM Studio.exe");std::fs::write(&file,b"metadata only").unwrap();
        assert_eq!(display_icon_directory(&format!("\"{}\",0",file.display())),Some(directory));
        let desktop=fixture.path().join("Desktop");std::fs::create_dir(&desktop).unwrap();
        let icon=desktop.join("LM Studio.exe");std::fs::write(&icon,b"metadata only").unwrap();
        assert!(icon_install_directory("LM Studio",&icon.to_string_lossy()).is_none());
        let install=fixture.path().join("LM Studio");std::fs::create_dir(&install).unwrap();
        let icon=install.join("LM Studio.exe");std::fs::write(&icon,b"metadata only").unwrap();
        assert_eq!(icon_install_directory("LM Studio 0.4.24+1",&icon.to_string_lossy()),Some(install));
        assert!(display_icon_directory("https://example.com/a.exe,0").is_none());
        for (display,name) in [("LM Studio 0.4.24+1","LM Studio"),("Qwen 1.0.3","Qwen"),("ZCode 3.10.2","ZCode"),("Kimi","Kimi")] {assert!(app_name_matches(display,name));}
        for id in ["zcode","qwen","kimi","lmstudio"] {assert!(catalog().iter().any(|t|t.id==id));}
    }
    #[test] fn catalog_ids_are_unique_and_data_roots_are_scoped() {
        let tools = catalog(); let ids: BTreeSet<_> = tools.iter().map(|t| &t.id).collect(); assert_eq!(ids.len(), tools.len());
        let home = tempfile::tempdir().unwrap();
        for tool in tools { for path in data_candidates(&tool, home.path()) { assert!(path.starts_with(home.path())); assert_ne!(path, home.path()); } }
    }
    #[test] fn native_inventory_reports_evidence_without_starting_applications() {
        let inventory = discover().unwrap(); assert_eq!(inventory.supported_count, catalog().len());
        assert!(inventory.tools.iter().all(|t| !t.evidence.is_empty() || !t.installations.is_empty() || !t.data_paths.is_empty()));
        println!("Native AI inventory: {} catalog matches; {} installation/process evidence; {} data-only", inventory.tools.len(), inventory.tools.iter().filter(|t| !t.evidence.is_empty()).count(), inventory.tools.iter().filter(|t| t.evidence.is_empty() && t.installations.is_empty()).count());
        println!("Reported catalog identities: {:?}",inventory.tools.iter().map(|t|(&t.id,!t.evidence.is_empty())).collect::<Vec<_>>());
    }
}
