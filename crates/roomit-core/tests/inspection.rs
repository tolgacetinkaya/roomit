use roomit_core::{Category, Disposition, inspect_workspace};
use std::{fs, path::Path};
use tempfile::tempdir;

#[test]
fn requires_project_evidence_and_keeps_source_untouched() {
    let fixture = tempdir().unwrap();
    let root = fixture.path().canonicalize().unwrap();
    fs::create_dir(root.join("bin")).unwrap();
    fs::write(root.join("source.cs"), "// preserve me").unwrap();
    assert!(inspect_workspace(&root).unwrap().findings.is_empty());
    fs::write(root.join("App.csproj"), "<Project />").unwrap();
    let report = inspect_workspace(&root).unwrap();
    assert_eq!(report.projects, [".NET"]);
    assert_eq!(report.findings.len(), 1);
    assert_eq!(report.findings[0].category, Category::BuildOutput);
    assert_eq!(report.findings[0].disposition, Disposition::ReviewRequired);
    assert_eq!(fs::read_to_string(root.join("source.cs")).unwrap(), "// preserve me");
}

#[test]
fn ai_history_and_secrets_are_protected_instead_of_called_cache() {
    let fixture = tempdir().unwrap();
    let root = fixture.path().canonicalize().unwrap();
    fs::create_dir(root.join(".codex")).unwrap();
    fs::write(root.join(".codex/history.jsonl"), "private history").unwrap();
    fs::write(root.join("AGENTS.md"), "instructions").unwrap();
    fs::write(root.join(".env.local"), "secret").unwrap();
    let report = inspect_workspace(&root).unwrap();
    assert_eq!(report.findings.len(), 3);
    assert!(report.findings.iter().all(|f| f.disposition == Disposition::Protected));
    assert_eq!(fs::read_to_string(root.join(".codex/history.jsonl")).unwrap(), "private history");
}

#[test]
fn inspection_does_not_recurse_or_invent_size_results() {
    let fixture = tempdir().unwrap();
    let root = fixture.path().canonicalize().unwrap();
    fs::create_dir_all(root.join("nested/node_modules")).unwrap();
    fs::write(root.join("nested/package.json"), "{}").unwrap();
    let report = inspect_workspace(&root).unwrap();
    assert!(report.findings.is_empty());
    assert!(report.projects.is_empty());
    assert_eq!(report.scope, "directChildren");
}

#[test]
fn detects_multiple_ecosystems_with_stable_order() {
    let fixture = tempdir().unwrap();
    let root = fixture.path().canonicalize().unwrap();
    for file in ["package.json", "pyproject.toml"] { fs::write(root.join(file), "").unwrap(); }
    for dir in ["node_modules", "__pycache__"] { fs::create_dir(root.join(dir)).unwrap(); }
    let report = inspect_workspace(&root).unwrap();
    assert_eq!(report.projects, ["Node.js", "Python"]);
    assert_eq!(report.findings.len(), 2);
    assert!(report.findings[0].path.ends_with("__pycache__"));
}

#[test]
fn rejects_relative_paths_and_files() {
    assert!(inspect_workspace(Path::new(".")).is_err());
    let fixture = tempdir().unwrap();
    let file = fixture.path().join("file.txt");
    fs::write(&file, "").unwrap();
    assert!(inspect_workspace(&file).is_err());
    assert!(inspect_workspace(&fixture.path().join("missing")).is_err());
}

#[cfg(windows)]
#[test]
fn skips_junctions_and_rejects_a_junction_root() {
    use std::process::Command;
    let fixture = tempdir().unwrap();
    let root = fixture.path().canonicalize().unwrap();
    let outside = tempdir().unwrap();
    fs::write(root.join("package.json"), "{}").unwrap();
    let junction = root.join("node_modules");
    let output = Command::new("cmd").arg("/c").arg("mklink").arg("/J")
        .arg(&junction).arg(outside.path()).output().unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let report = inspect_workspace(&root).unwrap();
    assert!(report.findings.is_empty());
    assert_eq!(report.warnings.len(), 1);
    assert!(inspect_workspace(&junction).is_err());
    fs::remove_dir(junction).unwrap(); // Remove the fixture junction itself, not its target.
}

#[cfg(unix)]
#[test]
fn skips_symbolic_links_and_linked_project_markers() {
    use std::os::unix::fs::symlink;
    let fixture = tempdir().unwrap();
    let outside = tempdir().unwrap();
    fs::write(outside.path().join("package.json"), "{}").unwrap();
    symlink(outside.path().join("package.json"), fixture.path().join("package.json")).unwrap();
    fs::create_dir(fixture.path().join("node_modules")).unwrap();
    let report = inspect_workspace(fixture.path()).unwrap();
    assert!(report.projects.is_empty());
    assert!(report.findings.is_empty());
    assert_eq!(report.warnings.len(), 1);
    let linked_root = fixture.path().join("linked");
    symlink(outside.path(), &linked_root).unwrap();
    assert!(inspect_workspace(&linked_root).is_err());
}
