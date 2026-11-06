#!/usr/bin/env bash
set -euo pipefail

version=$(node -p "require('./package.json').version")
bundle=target/aarch64-apple-darwin/release/bundle
app="$bundle/macos/Roomit.app"
binary="$app/Contents/MacOS/roomit"
out=artifacts/macos-test
mkdir -p "$out"
test "$(lipo -archs "$binary")" = arm64
codesign --verify --deep --strict --verbose=2 "$app"
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Contents/Info.plist")" = "$version"
hdiutil verify "$bundle/dmg/Roomit_${version}_aarch64.dmg"
cp "$bundle/dmg/Roomit_${version}_aarch64.dmg" "$out/Roomit-${version}-macos-arm64.dmg"
# Tauri's macOS updater extracts an archive containing the .app bundle.
COPYFILE_DISABLE=1 tar -czf "$out/Roomit-${version}-macos-arm64.app.tar.gz" -C "$bundle/macos" Roomit.app

# Runner launch smoke test only; interactive device acceptance remains separate.
python3 - "$binary" <<'PY'
import subprocess, sys, time
process = subprocess.Popen([sys.argv[1]], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
try:
    time.sleep(8)
    if process.poll() is not None:
        out, err = process.communicate()
        raise SystemExit(f"App exited early: {process.returncode}\n{out.decode(errors='replace')}\n{err.decode(errors='replace')}")
    print("Native arm64 process remained running for 8 seconds; interactive UI not validated.")
finally:
    if process.poll() is None:
        process.terminate()
        try: process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
PY

node --input-type=module <<'JS'
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const directory='artifacts/macos-test';
const files=fs.readdirSync(directory).filter(f=>f.endsWith('.dmg')||f.endsWith('.tar.gz'));
const records=files.map(file=>({file,bytes:fs.statSync(`${directory}/${file}`).size,sha256:createHash('sha256').update(fs.readFileSync(`${directory}/${file}`)).digest('hex')}));
fs.writeFileSync(`${directory}/SHA256SUMS.txt`,records.map(r=>`${r.sha256}  ${r.file}`).join('\n')+'\n');
fs.writeFileSync(`${directory}/Roomit-build.json`,JSON.stringify({version:JSON.parse(fs.readFileSync('package.json')).version,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceTree:execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),target:'aarch64-apple-darwin',builtAt:new Date().toISOString(),appleSigning:'ad-hoc; not notarized',runnerLaunchSmokeTest:true,interactiveDeviceTest:false,files:records},null,2)+'\n');
JS
cp docs/MACOS-TESTING.md "$out/READ-ME-FIRST.md"
