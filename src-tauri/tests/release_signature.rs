use base64::Engine;
use minisign_verify::{PublicKey, Signature};

/// Run after scripts/release.ps1; never starts an installer or changes user data.
#[test]
#[ignore = "requires signed release artifacts"]
fn release_package_signature_rejects_tampering() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
    let config: serde_json::Value = serde_json::from_slice(&std::fs::read(root.join("src-tauri/tauri.conf.json")).unwrap()).unwrap();
    let public = config["plugins"]["updater"]["pubkey"].as_str().unwrap();
    let version = config["version"].as_str().unwrap();
    let package = root.join(format!("artifacts/releases/v{version}/Roomit-{version}-windows-x64-setup.exe"));
    let signature = std::fs::read_to_string(package.with_extension("exe.sig")).unwrap();
    let decode = |s:&str| String::from_utf8(base64::engine::general_purpose::STANDARD.decode(s.trim()).unwrap()).unwrap();
    let key = PublicKey::decode(&decode(public)).unwrap();
    let signature = Signature::decode(&decode(&signature)).unwrap();
    let mut bytes = std::fs::read(package).unwrap();
    key.verify(&bytes, &signature, true).unwrap();
    bytes[100] ^= 1;
    assert!(key.verify(&bytes, &signature, true).is_err(), "A tampered installer must never verify");
}
