$ErrorActionPreference = 'Stop'

# Process-local fallback for a toolchain that exists but is absent from PATH.
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    $roomitRustBin = Join-Path $env:USERPROFILE '.rustup\toolchains\stable-x86_64-pc-windows-msvc\bin'
    if (-not (Test-Path -LiteralPath (Join-Path $roomitRustBin 'cargo.exe'))) {
        throw 'Rust toolchain bulunamadı. README içindeki Windows ön koşullarını tamamlayın.'
    }
    $env:PATH = $roomitRustBin + [IO.Path]::PathSeparator + $env:PATH
}

# Dependency cache stays inside this checkout and is ignored by Git.
$env:CARGO_HOME = Join-Path $PSScriptRoot '..\.local\cargo'
