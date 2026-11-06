$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'rust-env.ps1')
Push-Location (Join-Path $PSScriptRoot '..')
try {
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'TypeScript / Vite kontrolü başarısız.' }
    & npm test
    if ($LASTEXITCODE -ne 0) { throw 'Arayüz rapor testleri başarısız.' }
    & cargo test -p roomit-core --locked
    if ($LASTEXITCODE -ne 0) { throw 'Rust çekirdek testleri başarısız.' }
    & cargo check --workspace --locked
    if ($LASTEXITCODE -ne 0) { throw 'Rust workspace kontrolü başarısız.' }
    & cargo test -p roomit --lib --locked
    if ($LASTEXITCODE -ne 0) { throw 'Masaüstü tarama durum testleri başarısız.' }
} finally {
    Pop-Location
}
