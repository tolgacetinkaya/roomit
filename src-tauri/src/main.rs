// Roomit is a GUI app in both debug and release builds on Windows.
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

fn main() {
    roomit_lib::run()
}
