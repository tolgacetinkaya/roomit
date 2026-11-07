import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Run only after downloading a successful, source-verified Mac workflow artifact
// and signing the .app.tar.gz with the existing private updater key locally.
const [directory,tag]=process.argv.slice(2);
if(!directory||!tag||!/^v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(tag))throw Error('Usage: node scripts/macos-release-manifest.mjs DIRECTORY RELEASE_TAG');
const build=JSON.parse(fs.readFileSync(path.join(directory,'Roomit-build.json'),'utf8'));
if(build.target!=='aarch64-apple-darwin'||!/^\d+\.\d+\.\d+$/.test(build.version))throw Error('Expected a versioned Apple Silicon build.');
const version=build.version;
if(!tag.startsWith(`v${version}-`)&&tag!==`v${version}`)throw Error('Release tag does not match the built version.');
const digest=file=>createHash('sha256').update(fs.readFileSync(path.join(directory,file))).digest('hex');
for(const record of build.files){
  if(path.basename(record.file)!==record.file||digest(record.file)!==record.sha256)throw Error('Build artifact checksum mismatch.');
}
const archive=`Roomit-${version}-macos-arm64.app.tar.gz`;
const signature=fs.readFileSync(path.join(directory,archive+'.sig'),'utf8').trim();
if(!Buffer.from(signature,'base64').toString('utf8').includes('signature'))throw Error('Missing updater signature.');
const manifest={version,notes:'Apple Silicon Mac test build. Install in Applications. Updates require confirmation. GPU measurement is unavailable on macOS. This test app is ad-hoc signed and not Apple notarized.',pub_date:new Date().toISOString(),platforms:{'darwin-aarch64':{signature,url:`https://github.com/tolgacetinkaya/roomit/releases/download/${tag}/${archive}`}}};
fs.writeFileSync(path.join(directory,'latest-macos.json'),JSON.stringify(manifest,null,2)+'\n');
const files=[`Roomit-${version}-macos-arm64.dmg`,archive,archive+'.sig','latest-macos.json','Roomit-build.json','READ-ME-FIRST.md'];
fs.writeFileSync(path.join(directory,'SHA256SUMS.txt'),files.map(f=>`${digest(f)}  ${f}`).join('\n')+'\n');
console.log(JSON.stringify({directory,tag,version,files:[...files,'SHA256SUMS.txt']},null,2));
