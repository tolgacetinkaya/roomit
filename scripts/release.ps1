param(
    [string]$SigningKey = '.local/signing/roomit.key',
    [switch]$SkipChecks
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'rust-env.ps1')
Push-Location (Join-Path $PSScriptRoot '..')
$previousKey = $env:TAURI_SIGNING_PRIVATE_KEY
try {
    if (-not (Test-Path -LiteralPath $SigningKey -PathType Leaf)) { throw 'Updater signing key not found. See docs/RELEASING.md.' }
    $env:TAURI_SIGNING_PRIVATE_KEY = (Resolve-Path -LiteralPath $SigningKey).Path
    if (-not $SkipChecks) { & .\scripts\check.ps1 }
    & npm run tauri -- build --ci --bundles nsis
    if ($LASTEXITCODE -ne 0) { throw 'Release build failed.' }
    & node scripts/release-manifest.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Release packaging failed.' }
} finally {
    $env:TAURI_SIGNING_PRIVATE_KEY = $previousKey
    Pop-Location
}
