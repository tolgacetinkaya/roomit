//! Roomit's UI-independent, read-only inspection foundation.
//!
//! This first slice inspects one explicitly selected directory. It does not
//! recurse, read file contents, calculate sizes, or authorize removal.

use serde::Serialize;
use std::{fs, io, path::Path};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Category {
    BuildOutput,
    Dependencies,
    PythonCache,
    AiUserData,
    ProtectedData,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Disposition {
    ReviewRequired,
    Protected,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Finding {
    pub path: String,
    pub category: Category,
    pub disposition: Disposition,
    pub rule_id: &'static str,
    pub reason: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectionReport {
    pub root: String,
    pub scope: &'static str,
    pub projects: Vec<&'static str>,
    pub findings: Vec<Finding>,
    pub warnings: Vec<String>,
}

/// Inspect direct children only, without following symbolic links or Windows
/// reparse points. A detected artifact is a review item, never a deletion permit.
pub fn inspect_workspace(root: &Path) -> io::Result<InspectionReport> {
    if !root.is_absolute() {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "Mutlak bir klasör yolu girin."));
    }
    let metadata = fs::symlink_metadata(root)?;
    if is_link(&metadata) || !metadata.is_dir() {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "Doğrudan bir klasör seçin; bağlantı veya dosya seçmeyin."));
    }
    let root = root.canonicalize()?;
    let mut report = InspectionReport {
        root: root.to_string_lossy().into_owned(),
        scope: "directChildren",
        projects: Vec::new(),
        findings: Vec::new(),
        warnings: Vec::new(),
    };
    let mut entries = Vec::new();
    for entry in fs::read_dir(&root)? {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                report.warnings.push(format!("Bir öğe okunamadı: {error}"));
                continue;
            }
        };
        match fs::symlink_metadata(entry.path()) {
            Ok(metadata) if is_link(&metadata) => report.warnings.push(format!(
                "Bağlantı/reparse point atlandı: {}", entry.path().display()
            )),
            Ok(metadata) => entries.push((entry.file_name(), entry.path(), metadata.is_dir())),
            Err(error) => report.warnings.push(format!("{}: {error}", entry.path().display())),
        }
    }
    entries.sort_by(|a, b| a.0.cmp(&b.0));
    let has_file = |name: &str| entries.iter().any(|(n, _, dir)| !dir && n == name);
    let dotnet = entries.iter().any(|(_, path, dir)| {
        !dir && matches!(path.extension().and_then(|v| v.to_str()), Some("csproj" | "fsproj" | "vbproj"))
    });
    let node = has_file("package.json");
    let python = ["pyproject.toml", "requirements.txt", "setup.py", "Pipfile"]
        .iter().any(|name| has_file(name));
    if dotnet { report.projects.push(".NET"); }
    if node { report.projects.push("Node.js"); }
    if python { report.projects.push("Python"); }

    for (name, path, dir) in entries {
        let Some(name) = name.to_str() else { continue };
        let classification = match (name, dir) {
            (".codex" | ".claude" | ".cursor", true) => Some((
                Category::AiUserData, Disposition::Protected, "ai-user-directory",
                "AI aracına ait geçmiş, ayar veya proje verileri içerebilir; cache kabul edilmez.",
            )),
            ("AGENTS.md" | "CLAUDE.md" | ".cursorrules", false) => Some((
                Category::AiUserData, Disposition::Protected, "ai-project-instructions",
                "AI proje talimatları korunur.",
            )),
            (".git" | ".ssh", _) => Some((
                Category::ProtectedData, Disposition::Protected, "protected-directory",
                "Sürüm geçmişi veya erişim verileri korunur.",
            )),
            (value, false) if value == ".env" || value.starts_with(".env.") => Some((
                Category::ProtectedData, Disposition::Protected, "environment-file",
                "Ortam ayarları ve kimlik bilgileri içerebilir; içerik okunmaz.",
            )),
            ("bin" | "obj", true) if dotnet => Some((
                Category::BuildOutput, Disposition::ReviewRequired, "dotnet-project-output",
                "Aynı klasörde .NET proje dosyası bulundu. İçerik ve yeniden üretim koşulları henüz doğrulanmadı.",
            )),
            ("node_modules", true) if node => Some((
                Category::Dependencies, Disposition::ReviewRequired, "node-project-dependencies",
                "Aynı klasörde package.json bulundu. Bağımlılıkları kaldırmak yeniden kurulum gerektirebilir.",
            )),
            ("__pycache__", true) if python => Some((
                Category::PythonCache, Disposition::ReviewRequired, "python-project-cache",
                "Aynı klasörde Python proje belirteci bulundu. Bu yalnızca ilk sınıflandırmadır.",
            )),
            _ => None,
        };
        if let Some((category, disposition, rule_id, reason)) = classification {
            report.findings.push(Finding {
                path: path.to_string_lossy().into_owned(), category, disposition, rule_id, reason,
            });
        }
    }
    report.warnings.sort();
    Ok(report)
}

fn is_link(metadata: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        metadata.file_attributes() & 0x400 != 0 // FILE_ATTRIBUTE_REPARSE_POINT
    }
    #[cfg(not(windows))]
    {
        metadata.file_type().is_symlink()
    }
}
