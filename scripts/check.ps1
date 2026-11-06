$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'rust-env.ps1')
Push-Location (Join-Path $PSScriptRoot '..')
try {
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'TypeScript / Vite kontrolü başarısız.' }
    & cargo test -p roomit-core --locked
    if ($LASTEXITCODE -ne 0) { throw 'Rust çekirdek testleri başarısız.' }
    & cargo check --workspace --locked
    if ($LASTEXITCODE -ne 0) { throw 'Rust workspace kontrolü başarısız.' }
} finally {
    Pop-Location
}
