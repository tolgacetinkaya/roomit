// Product identity only; generic Java/Python/Node processes are not assumed to
// be development tools. Paths remain in the native process sampler.
pub(crate) fn identity(name: &str, path: &str) -> Option<(String, String)> {
    let binary = name.to_lowercase();
    let binary = binary.trim_end_matches(".exe");
    let path = path.replace('\\', "/");
    let path = if cfg!(windows) { path.to_lowercase() } else { path };
    let products: &[(&str, &[&str], &[&str])] = &[
        ("Visual Studio Code", &["code", "code - insiders", "code-insiders"], &["microsoft vs code", "microsoft vs code insiders", "visual studio code.app", "visual studio code - insiders.app"]),
        ("Android Studio", &["studio64", "studio"], &["android studio", "android studio.app"]),
        ("IntelliJ IDEA", &["idea64", "idea"], &["intellij idea", "intellij idea.app", "intellij idea ce.app"]),
        ("PyCharm", &["pycharm64", "pycharm"], &["pycharm", "pycharm.app", "pycharm ce.app"]),
        ("WebStorm", &["webstorm64", "webstorm"], &["webstorm", "webstorm.app"]),
        ("Rider", &["rider64", "rider"], &["rider", "rider.app"]),
        ("CLion", &["clion64", "clion"], &["clion", "clion.app"]),
        ("RustRover", &["rustrover64", "rustrover"], &["rustrover", "rustrover.app"]),
        ("GoLand", &["goland64", "goland"], &["goland", "goland.app"]),
        ("PhpStorm", &["phpstorm64", "phpstorm"], &["phpstorm", "phpstorm.app"]),
        ("DataGrip", &["datagrip64", "datagrip"], &["datagrip", "datagrip.app"]),
        ("Visual Studio", &["devenv"], &["microsoft visual studio"]),
        ("Xcode", &["xcode"], &["xcode.app"]),
        ("Zed", &["zed"], &["zed", "zed.app"]),
        ("Sublime Text", &["sublime_text"], &["sublime text", "sublime text.app"]),
        ("Notepad++", &["notepad++"], &["notepad++"]),
        ("Docker Desktop", &["docker desktop", "com.docker.backend", "com.docker.build", "com.docker.proxy", "vpnkit"], &["docker.app"]),
    ];
    let helper = ["java", "javaw", "node", "electron", "fsnotifier", "jcef_helper", "chrome_crashpad_handler", "crashpad_handler"].contains(&binary)
        || binary.ends_with(" helper") || binary.ends_with(" helper (renderer)") || binary.ends_with(" helper (gpu)") || binary.ends_with(" helper (plugin)");
    for &(label, binaries, folders) in products {
        let launcher = binaries.contains(&binary);
        if !launcher && !helper { continue; }
        let mut end = 0;
        for segment in path.split('/') {
            end += segment.len();
            let key = segment.to_lowercase();
            if folders.iter().any(|folder| key == *folder || key.strip_prefix(folder).is_some_and(|suffix| suffix.starts_with(' ') && suffix.trim_start().starts_with(|c: char| c.is_ascii_digit()))) {
                return Some((path[..end].into(), label.into()));
            }
            end += 1;
        }
        // Known launcher names support portable/custom installations. Without
        // a recognized install root, helpers are deliberately not attributed.
        if launcher { return Some((path.clone(), label.into())); }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ide_helpers_share_the_installation_but_unrelated_runtimes_do_not() {
        let main=identity("studio64.exe","C:/Apps/Android Studio/bin/studio64.exe").unwrap();
        assert_eq!(main,identity("java.exe","C:/Apps/Android Studio/jbr/bin/java.exe").unwrap());
        assert!(identity("java.exe","C:/Java/bin/java.exe").is_none());
        assert!(identity("chrome.exe","C:/Apps/Android Studio/chrome.exe").is_none());
        assert!(identity("node.exe","C:/projects/microsoft vs code-fake/node.exe").is_none());
        assert_eq!(identity("Code Helper (Renderer)","/Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper (Renderer).app/x").unwrap().1,"Visual Studio Code");
        assert_eq!(identity("java","/apps/JetBrains/PyCharm 2026.2/jbr/bin/java").unwrap().1,"PyCharm");
        assert_eq!(identity("Code.exe","D:/portable/editor/Code.exe").unwrap().1,"Visual Studio Code");
        assert_ne!(main.0,identity("studio64.exe","D:/Android Studio/bin/studio64.exe").unwrap().0);
    }
}
