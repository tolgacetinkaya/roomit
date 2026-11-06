use crate::{Category, Disposition};
use std::path::Path;

#[derive(Clone, Copy)]
pub(crate) struct Rule {
    pub category: Category,
    pub disposition: Disposition,
    pub tool: &'static str,
    pub id: &'static str,
    pub reason: &'static str,
}

#[derive(Clone, Copy)]
pub(crate) enum AiTool { Codex, Claude, Cursor, Ollama, Other(&'static str) }
impl AiTool {
    fn name(self) -> &'static str {
        match self { Self::Codex => "Codex", Self::Claude => "Claude Code", Self::Cursor => "Cursor", Self::Ollama => "Ollama", Self::Other(name) => name }
    }
}

#[derive(Clone, Copy)]
pub(crate) enum Context {
    Workspace { python: bool },
    Artifact,
    Protected,
    Ai { tool: AiTool, level: usize },
}
impl Context {
    pub fn discovers_projects(self) -> bool { matches!(self, Self::Workspace { .. }) }
}

#[derive(Default)]
pub(crate) struct Evidence {
    dotnet: bool, node: bool, python: bool, rust: bool, java: bool,
}
impl Evidence {
    pub fn observe_file(&mut self, path: &Path) {
        let name = path.file_name().and_then(|v| v.to_str()).unwrap_or("");
        self.dotnet |= matches!(path.extension().and_then(|v| v.to_str()), Some("csproj" | "fsproj" | "vbproj"));
        self.node |= name == "package.json";
        self.python |= matches!(name, "pyproject.toml" | "requirements.txt" | "setup.py" | "Pipfile");
        self.rust |= name == "Cargo.toml";
        self.java |= matches!(name, "build.gradle" | "build.gradle.kts" | "pom.xml");
    }
    pub fn ecosystems(&self) -> Vec<&'static str> {
        [(self.dotnet, ".NET"), (self.node, "Node.js"), (self.python, "Python"), (self.rust, "Rust"), (self.java, "Java / Gradle")]
            .into_iter().filter_map(|(present, name)| present.then_some(name)).collect()
    }
}

fn protected(category: Category, tool: &'static str, id: &'static str, reason: &'static str) -> Rule {
    Rule { category, tool, id, reason, disposition: Disposition::Protected }
}
fn review(category: Category, tool: &'static str, id: &'static str, reason: &'static str) -> Rule {
    Rule { category, tool, id, reason, disposition: Disposition::ReviewRequired }
}

pub(crate) fn root_context(path: &Path) -> (Context, Option<Rule>) {
    directory_rule(path, Context::Workspace { python: false }, &Evidence::default())
}

pub(crate) fn directory_rule(path: &Path, context: Context, evidence: &Evidence) -> (Context, Option<Rule>) {
    let name = path.file_name().and_then(|v| v.to_str()).unwrap_or("");
    match context {
        Context::Artifact | Context::Protected => (context, None),
        Context::Ai { tool, level } => {
            let category = match (tool, level, name) {
                (AiTool::Ollama, 0, "models") => Some(Category::AiModels),
                (AiTool::Cursor, 0, "rules") => Some(Category::AiSettings),
                _ => None,
            };
            let rule = category.map(|category| protected(category, tool.name(), "ai-known-subdirectory",
                "AI aracının model veya talimat verisi olarak tanındı; içerik okunmadı, veri korunur."));
            (Context::Ai { tool, level: level + 1 }, rule)
        }
        Context::Workspace { python } => {
            let ai_tool = match name {
                ".codex" => Some(AiTool::Codex), ".claude" => Some(AiTool::Claude),
                ".cursor" | "Cursor" => Some(AiTool::Cursor), ".ollama" => Some(AiTool::Ollama),
                "opencode" => Some(AiTool::Other("OpenCode")),
                ".gemini" => Some(AiTool::Other("Gemini CLI")),
                ".lmstudio" | "LM Studio" => Some(AiTool::Other("LM Studio")),
                ".jan" | "Jan" => Some(AiTool::Other("Jan")),
                ".copilot" => Some(AiTool::Other("GitHub Copilot")),
                "windsurf" | "Windsurf" => Some(AiTool::Other("Windsurf")),
                "Claude" => Some(AiTool::Other("Claude")),
                "anythingllm-desktop" | "AnythingLLM" => Some(AiTool::Other("AnythingLLM")),
                "Antigravity" => Some(AiTool::Other("Antigravity")),
                ".trae" | "Trae" => Some(AiTool::Other("Trae")),
                ".zcode" | "ZCode" | "@zcodedesktop" => Some(AiTool::Other("ZCode")),
                ".qwen" | "Qwen" => Some(AiTool::Other("Qwen")),
                ".kimi" | ".kimi-code" | "Kimi" => Some(AiTool::Other("Kimi")), _ => None,
            };
            if let Some(tool) = ai_tool {
                return (Context::Ai { tool, level: 0 }, Some(protected(Category::AiUserData, tool.name(),
                    "ai-user-directory", "AI aracına ait geçmiş, ayar veya proje verileri içerebilir; cache kabul edilmez.")));
            }
            if matches!(name, ".git" | ".ssh") {
                return (Context::Protected, Some(protected(Category::ProtectedData, "Kullanıcı verisi",
                    "protected-directory", "Sürüm geçmişi veya erişim verileri korunur.")));
            }
            let rule = match name {
                "bin" | "obj" if evidence.dotnet => Some(review(Category::BuildOutput, ".NET", "dotnet-project-output",
                    "Üst klasörde .NET proje belirteci bulundu. Yeniden üretilebilirlik doğrulanmadı; inceleme gerekir.")),
                "node_modules" if evidence.node => Some(review(Category::Dependencies, "Node.js", "node-project-dependencies",
                    "Üst klasörde package.json bulundu. Bağımlılıkların kaldırılması yeniden kurulum gerektirebilir.")),
                "__pycache__" if python || evidence.python => Some(review(Category::PythonCache, "Python", "python-project-cache",
                    "Python proje ağacındaki bytecode klasörü olarak tanındı; silme izni verilmez.")),
                ".venv" | "venv" if evidence.python => Some(review(Category::Dependencies, "Python", "python-project-environment",
                    "Python proje belirteci yanında ortam klasörü bulundu; yalnızca isim ve konumla sınıflandırıldı.")),
                "target" if evidence.rust => Some(review(Category::BuildOutput, "Rust", "rust-project-output",
                    "Üst klasörde Cargo.toml bulundu. Derleme çıktısı adayı; özel içerik olasılığı dışlanmadı.")),
                "build" | "target" if evidence.java => Some(review(Category::BuildOutput, "Java / Gradle", "java-project-output",
                    "Üst klasörde Gradle veya Maven proje belirteci bulundu; inceleme gerekir.")),
                _ => None,
            };
            let next = if rule.is_some() || matches!(name, "node_modules" | ".venv" | "venv") {
                Context::Artifact
            } else { Context::Workspace { python: python || evidence.python } };
            (next, rule)
        }
    }
}

pub(crate) fn file_rule(path: &Path, context: Context) -> Option<Rule> {
    let name = path.file_name().and_then(|v| v.to_str())?;
    let parent_name = path.parent().and_then(Path::file_name).and_then(|v| v.to_str()).unwrap_or("");
    match context {
        Context::Workspace { .. } => match name {
            "AGENTS.md" | "CLAUDE.md" | "GEMINI.md" | ".cursorrules" => Some(protected(Category::AiSettings, "AI proje talimatları",
                "ai-project-instructions", "AI proje talimatı olarak tanındı; içerik okunmaz ve veri korunur.")),
            "copilot-instructions.md" if parent_name == ".github" => Some(protected(Category::AiSettings, "GitHub Copilot",
                "copilot-project-instructions", "GitHub Copilot proje talimatları korunur.")),
            ".git" => Some(protected(Category::ProtectedData, "Git", "git-worktree-reference", "Git worktree bağlantı dosyası korunur.")),
            value if value == ".env" || value.starts_with(".env.") => Some(protected(Category::ProtectedData, "Ortam ayarları",
                "environment-file", "Kimlik bilgileri içerebilir; içerik okunmaz ve veri korunur.")),
            _ => None,
        },
        Context::Ai { tool: AiTool::Claude, level: 0 } if matches!(name, "settings.json" | "settings.local.json") =>
            Some(protected(Category::AiSettings, "Claude Code", "claude-settings", "Claude Code ayar dosyası; içerik okunmaz ve veri korunur.")),
        _ => None,
    }
}
