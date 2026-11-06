use std::{env, path::PathBuf, process::ExitCode};

fn main() -> ExitCode {
    let Some(root) = env::args_os().nth(1) else {
        eprintln!("Usage: cargo run -p roomit-core --example inspect -- <absolute-project-path>");
        return ExitCode::FAILURE;
    };
    match roomit_core::inspect_workspace(&PathBuf::from(root)) {
        Ok(report) => {
            println!("{}", serde_json::to_string_pretty(&report).expect("report is serializable"));
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("Inspection failed: {error}");
            ExitCode::FAILURE
        }
    }
}
