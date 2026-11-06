$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'rust-env.ps1')
Push-Location (Join-Path $PSScriptRoot '..')
try {
    & npm run tauri -- dev
    if ($LASTEXITCODE -ne 0) { throw 'Roomit başlatılamadı.' }
} finally {
    Pop-Location
}
