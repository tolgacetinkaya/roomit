use crate::inventory::{catalog, Tool};
use serde::Serialize;
use std::{collections::{HashMap,HashSet}, sync::{Arc, Mutex}, time::{Instant, SystemTime, UNIX_EPOCH}};
use sysinfo::{Networks, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

#[derive(Default, Clone)]
pub(crate) struct Monitor(pub Arc<Mutex<Sampler>>);
pub(crate) struct Sampler {
    system: System, networks: Networks, network_baselines: HashMap<String,(u64,u64)>,
    gpu: crate::gpu::Collector, process_starts: HashMap<u32,u64>, last: Option<Instant>, cached: Option<Snapshot>,
}
impl Default for Sampler {
    fn default() -> Self { Self { system: System::new(), networks: Networks::new(), network_baselines: HashMap::new(), gpu: Default::default(), process_starts: HashMap::new(), last: None, cached: None } }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProcessRow {
    pub pid: u32, pub name: String, pub tool_id: Option<String>, pub cpu_percent: Option<f32>, pub memory_bytes: String,
    pub gpu: crate::gpu::Reading,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ToolGpu { pub tool_id: String, pub reading: crate::gpu::Reading }
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NetworkRow { pub name: String, pub received_per_second: Option<f64>, pub sent_per_second: Option<f64> }
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Snapshot {
    pub sampled_at_ms: u64, pub cpu_percent: Option<f32>, pub memory_used: String, pub memory_total: String,
    pub memory_installed: Option<String>,
    pub processes: Vec<ProcessRow>, pub networks: Vec<NetworkRow>, pub cpu_count: usize,
    pub gpu_status: String, pub app_network_status: String,
    pub gpu_ai: crate::gpu::Reading, pub gpu_tools: Vec<ToolGpu>,
}
#[cfg(windows)]
fn installed_kib_to_bytes(kib:u64)->Option<u64>{kib.checked_mul(1024).filter(|bytes|*bytes>0)}
fn installed_memory()->Option<u64>{
    #[cfg(windows)] {
        // Firmware capacity is stable for the lifetime of this process. Read
        // once, without spawning commands or confusing it with OS-visible RAM.
        static INSTALLED:std::sync::OnceLock<Option<u64>>=std::sync::OnceLock::new();
        *INSTALLED.get_or_init(||{
            let mut kib=0;
            let ok=unsafe{windows_sys::Win32::System::SystemInformation::GetPhysicallyInstalledSystemMemory(&mut kib)};
            if ok==0 {None}else{installed_kib_to_bytes(kib)}
        })
    }
    #[cfg(not(windows))] {None}
}
fn network_rates(previous: Option<(u64,u64)>, current:(u64,u64), seconds: Option<f64>) -> (Option<f64>,Option<f64>) {
    match (previous,seconds) {
        (Some((rx,tx)),Some(s)) if (0.2..=15.0).contains(&s) && current.0>=rx && current.1>=tx => (Some((current.0-rx) as f64/s),Some((current.1-tx) as f64/s)),
        _ => (None,None),
    }
}
fn stable_process_ids(current:&HashMap<u32,u64>,previous:&HashMap<u32,u64>)->HashSet<u32>{
    current.iter().filter(|(pid,start)|**start!=0 && previous.get(pid)==Some(start)).map(|(pid,_)|*pid).collect()
}
fn same_install_helper(child_name: &str, child_exe: Option<&std::path::Path>, parent_name: &str, parent_exe: Option<&std::path::Path>) -> bool {
    let child = child_name.to_lowercase().trim_end_matches(".exe").to_string();
    let parent = parent_name.to_lowercase().trim_end_matches(".exe").to_string();
    if !["chrome_crashpad_handler", "crashpad_handler", "electron", "node", "utility"].contains(&child.as_str()) || ["node", "nodejs", "python", "python3", "bun"].contains(&parent.as_str()) { return false; }
    match (child_exe.and_then(|p|p.parent()),parent_exe.and_then(|p|p.parent())) {
        (Some(child),Some(parent)) => if cfg!(windows) { child.to_string_lossy().eq_ignore_ascii_case(&parent.to_string_lossy()) } else { child==parent },
        _ => false,
    }
}
fn process_tool(name: &str, exe: &str, script: &str, tools: &[Tool]) -> Option<String> {
    let name = name.to_lowercase().trim_end_matches(".exe").to_string(); let exe = exe.replace('\\', "/").to_lowercase();
    // Local model engines may run under a different executable name. Require
    // both a known worker name and a product-specific installation/data path;
    // an arbitrary llama-server or child process is not an AI-tool identity.
    if ["llama-server", "llm-engine-host", "lmstudio-daemon"].contains(&name.as_str()) &&
        (exe.contains("/.lmstudio/") || exe.contains("/lm studio/") || exe.contains("/lm-studio/")) {return Some("lmstudio".into());}
    if ["ollama_llama_server", "llama-server"].contains(&name.as_str()) &&
        (exe.contains("/ollama/") || exe.contains("/.ollama/")) {return Some("ollama".into());}
    if name == "claude" && (exe.contains("/claude_") || exe.contains("/programs/claude/") || exe.contains("/claude.app/")) { return Some("claude".into()); }
    for tool in tools {
        if tool.commands.iter().any(|c| c == &name) { return Some(tool.id.clone()); }
        // Electron app names and fixed package identifiers; never match arbitrary prompt text.
        if tool.app_names.iter().any(|n| n.to_lowercase() == name) { return Some(tool.id.clone()); }
        if tool.id == "codex" && exe.contains("/openai.codex_") { return Some(tool.id.clone()); }
        if tool.id == "chatgpt" && exe.contains("/openai.chatgpt") { return Some(tool.id.clone()); }
    }
    if ["node", "nodejs", "bun"].contains(&name.as_str()) {
        let script = script.replace('\\', "/").to_lowercase();
        for (marker, id) in [("/node_modules/@openai/codex/", "codex"), ("/node_modules/@anthropic-ai/claude-code/", "claude-code"), ("/node_modules/@google/gemini-cli/", "gemini"), ("/node_modules/opencode-ai/", "opencode"), ("/node_modules/@qwen-code/qwen-code/", "qwen"), ("/node_modules/@moonshot-ai/kimi-code/", "kimi")] {
            if script.contains(marker) { return Some(id.into()); }
        }
    }
    None
}
impl Sampler {
    pub fn sample(&mut self) -> Snapshot {
        let now = Instant::now();
        if self.last.is_some_and(|last| now.duration_since(last).as_secs_f64() < 1.0) {
            if let Some(cached) = &self.cached { return cached.clone(); }
        }
        let seconds = self.last.map(|last| now.duration_since(last).as_secs_f64());
        let warmed = seconds.is_some_and(|s| (0.2..=15.0).contains(&s));
        self.system.refresh_memory(); self.system.refresh_cpu_usage();
        self.system.refresh_processes_specifics(ProcessesToUpdate::All, true,
            ProcessRefreshKind::nothing().with_cpu().with_memory().with_exe(UpdateKind::OnlyIfNotSet).with_cmd(UpdateKind::OnlyIfNotSet).without_tasks());
        self.networks.refresh(true);
        let process_starts: HashMap<_,_> = self.system.processes().iter().map(|(pid,p)|(pid.as_u32(),p.start_time())).collect();
        let stable_pids=if warmed {stable_process_ids(&process_starts,&self.process_starts)}else{HashSet::new()};
        let gpu_frame = self.gpu.sample();
        let gpu_reading=|pids:&[u32]|{
            let mut reading=gpu_frame.reading(pids,&stable_pids);
            if gpu_frame.status==crate::gpu::Status::Measured && !pids.is_empty() && pids.iter().all(|pid|process_starts.get(pid)==Some(&0)){
                reading.percent=None;reading.status=crate::gpu::Status::Unavailable;
                reading.reason="Süreç başlangıç kimliği doğrulanamadığı için GPU değeri bu sürece bağlanamadı.".into();
            }
            reading
        };
        let tools = catalog(); let cpu_count = self.system.cpus().len().max(1);
        let mut owners: HashMap<u32, String> = HashMap::new();
        for (pid, p) in self.system.processes() {
            let exe = p.exe().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
            let script = p.cmd().get(1).map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
            if let Some(tool) = process_tool(&p.name().to_string_lossy(), &exe, &script, &tools) { owners.insert(pid.as_u32(), tool); }
        }
        // Only known helper names in the same installation directory inherit ownership.
        // A tool launching Chrome, Docker, a compiler or another app does not own its RAM.
        for _ in 0..16 {
            let mut added = Vec::new();
            for (pid, p) in self.system.processes() {
                if !owners.contains_key(&pid.as_u32()) {
                    if let Some((owner,parent)) = p.parent().and_then(|pid| owners.get(&pid.as_u32()).zip(self.system.process(pid))) {
                        if same_install_helper(&p.name().to_string_lossy(),p.exe(),&parent.name().to_string_lossy(),parent.exe()) { added.push((pid.as_u32(),owner.clone())); }
                    }
                }
            }
            if added.is_empty() { break; } owners.extend(added);
        }
        let mut processes: Vec<_> = self.system.processes().iter().filter(|(pid, _)| pid.as_u32() != 0).map(|(pid,p)| ProcessRow {
            pid: pid.as_u32(), name: p.name().to_string_lossy().into_owned(), tool_id: owners.get(&pid.as_u32()).cloned(),
            cpu_percent: warmed.then(|| (p.cpu_usage() / cpu_count as f32).clamp(0.0, 100.0)), memory_bytes: p.memory().to_string(),
            gpu: gpu_reading(&[pid.as_u32()]),
        }).collect();
        processes.sort_by(|a,b| b.memory_bytes.parse::<u64>().unwrap_or(0).cmp(&a.memory_bytes.parse().unwrap_or(0)).then(a.pid.cmp(&b.pid)));
        let networks = self.networks.iter().map(|(name, data)| {
            let rates = network_rates(self.network_baselines.get(name).copied(), (data.total_received(),data.total_transmitted()), seconds);
            NetworkRow { name: name.clone(), received_per_second: rates.0, sent_per_second: rates.1 }
        }).collect();
        self.network_baselines = self.networks.iter().map(|(name,data)|(name.clone(),(data.total_received(),data.total_transmitted()))).collect();
        let mut tool_pids: HashMap<String,Vec<u32>> = HashMap::new();
        for (pid,tool) in &owners {tool_pids.entry(tool.clone()).or_default().push(*pid);}
        let mut gpu_tools: Vec<_> = tool_pids.into_iter().map(|(tool_id,pids)|ToolGpu {tool_id,reading:gpu_reading(&pids)}).collect();
        gpu_tools.sort_by(|a,b|a.tool_id.cmp(&b.tool_id));
        let gpu_ai=gpu_reading(&owners.keys().copied().collect::<Vec<_>>());
        let snapshot = Snapshot { sampled_at_ms: SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64,
            cpu_percent: warmed.then(|| self.system.global_cpu_usage().clamp(0.0, 100.0)), memory_used: self.system.used_memory().to_string(), memory_total: self.system.total_memory().to_string(),
            memory_installed:installed_memory().filter(|bytes|*bytes>=self.system.total_memory()).map(|bytes|bytes.to_string()),
            processes, networks, cpu_count, gpu_status: gpu_frame.reason.clone(), gpu_ai, gpu_tools,
            app_network_status: "Ağ hızı adaptör bazındadır. Uygulama başına trafik ve LAN / internet ayrımı henüz ölçülmüyor.".into() };
        self.process_starts=process_starts;self.last = Some(Instant::now()); self.cached = Some(snapshot.clone()); snapshot
    }
}
#[cfg(test)] mod tests {
    use super::*;
    #[cfg(windows)]
    #[test] fn installed_ram_kib_conversion_rejects_missing_and_overflow_without_rounding(){
        assert_eq!(installed_kib_to_bytes(134217728),Some(137438953472));
        assert_eq!(installed_kib_to_bytes(0),None);
        assert_eq!(installed_kib_to_bytes(u64::MAX),None);
    }
    #[test] fn reused_new_and_unknown_process_start_times_are_not_gpu_identities() {
        let previous=HashMap::from([(1,100),(2,200),(3,0)]);
        let current=HashMap::from([(1,101),(2,200),(3,0),(4,400)]);
        assert_eq!(stable_process_ids(&current,&previous),HashSet::from([2]));
    }
    #[test] fn network_rates_need_a_baseline_and_do_not_treat_resets_as_traffic() {
        assert_eq!(network_rates(None,(1_000_000,100),Some(2.0)),(None,None));
        assert_eq!(network_rates(Some((100,50)),(10,1),Some(2.0)),(None,None));
        assert_eq!(network_rates(Some((100,50)),(500,250),Some(2.0)),(Some(200.0),Some(100.0)));
        assert_eq!(network_rates(Some((100,50)),(500,250),Some(30.0)),(None,None));
    }
    #[test] fn launching_another_application_never_assigns_its_usage_to_the_ai_parent() {
        use std::path::Path;
        let app=Some(Path::new("/apps/Codex/codex.exe"));
        assert!(same_install_helper("crashpad_handler.exe",Some(Path::new("/apps/Codex/crashpad_handler.exe")),"codex.exe",app));
        assert!(!same_install_helper("chrome.exe",Some(Path::new("/apps/Chrome/chrome.exe")),"codex.exe",app));
        assert!(!same_install_helper("Docker Desktop.exe",Some(Path::new("/apps/Docker/Docker Desktop.exe")),"codex.exe",app));
        assert!(!same_install_helper("node.exe",Some(Path::new("/apps/node/node.exe")),"codex.exe",app));
        assert!(!same_install_helper("node.exe",Some(Path::new("/apps/node/node.exe")),"node.exe",Some(Path::new("/apps/node/node.exe"))));
    }
    #[test] fn exact_identity_and_cli_scripts_do_not_match_prompt_text() {
        let tools = catalog();
        assert_eq!(process_tool("codex.exe", "", "", &tools).as_deref(), Some("codex"));
        assert_eq!(process_tool("node.exe", "", "C:/npm/node_modules/@anthropic-ai/claude-code/cli.js", &tools).as_deref(), Some("claude-code"));
        assert!(process_tool("not-codex.exe", "", "", &tools).is_none());
        assert!(process_tool("python", "", "ask claude about codex", &tools).is_none());
        assert!(process_tool("node", "", "prompt mentioning opencode", &tools).is_none());
        assert_eq!(process_tool("Claude.exe", "C:/Program Files/WindowsApps/Claude_1.0/Claude.exe", "", &tools).as_deref(), Some("claude"));
    }
    #[test] fn local_model_workers_need_both_known_binary_and_product_path() {
        let tools=catalog();
        assert_eq!(process_tool("llama-server.exe","C:/Users/test/.lmstudio/extensions/backends/cuda/llama-server.exe","",&tools).as_deref(),Some("lmstudio"));
        assert_eq!(process_tool("ollama_llama_server.exe","C:/Programs/Ollama/lib/ollama_llama_server.exe","",&tools).as_deref(),Some("ollama"));
        assert!(process_tool("llama-server.exe","C:/work/custom/llama-server.exe","",&tools).is_none());
        assert!(process_tool("chrome.exe","C:/Users/test/.lmstudio/chrome.exe","",&tools).is_none());
    }
    #[test] fn real_sampler_warms_up_and_never_exports_commands() {
        let mut sampler = Sampler::default(); let first = sampler.sample(); assert!(first.cpu_percent.is_none());
        assert!(first.networks.iter().all(|n| n.received_per_second.is_none()));
        assert!(!first.processes.is_empty());
        let serialized = serde_json::to_value(&first).unwrap(); assert!(serialized["processes"][0].get("cmd").is_none());
        assert_eq!(sampler.sample().sampled_at_ms, first.sampled_at_ms);
        std::thread::sleep(std::time::Duration::from_millis(1100));
        let next = sampler.sample(); assert!(next.cpu_percent.is_some());
        if let Some(installed)=&next.memory_installed {assert!(installed.parse::<u64>().unwrap()>=next.memory_total.parse::<u64>().unwrap());}
        println!("Native RAM bytes: installed={:?}; OS-visible={}; used={}",next.memory_installed,next.memory_total,next.memory_used);
        assert!(next.processes.iter().all(|p| p.cpu_percent.is_some_and(|v| (0.0..=100.0).contains(&v))));
        assert!(next.networks.iter().all(|n| n.received_per_second.is_some()));
        assert!(next.processes.iter().all(|p|p.gpu.percent.is_none_or(|value|value.is_finite()&&(0.0..=100.0).contains(&value))));
        println!("Native monitor GPU: measured process readings={}, tool states={:?}",next.processes.iter().filter(|p|p.gpu.percent.is_some()).count(),next.gpu_tools.iter().map(|tool|(&tool.tool_id,tool.reading.status,tool.reading.percent)).collect::<Vec<_>>());
    }
}
