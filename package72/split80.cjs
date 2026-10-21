'use strict';
// Lossless hosting transport only. Verify the complete standard GLB before making two declared parts.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const manifest = path.resolve(process.argv[2] || path.join(__dirname, 'runtime80-jog.json'));
const root = path.dirname(manifest), asset = JSON.parse(fs.readFileSync(manifest)).asset;
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const check = (ok, message) => {if (!ok) throw Error(message);};
check(asset && /^[A-Za-z0-9_.-]+\.glb$/.test(asset.filename), 'Unsafe complete GLB name');
check(Array.isArray(asset.parts) && asset.parts.length === 2, 'Exactly two declared parts required');
const bytes = fs.readFileSync(path.join(root, asset.filename));
check(bytes.length === asset.bytes && sha(bytes) === asset.sha256, 'Complete GLB identity mismatch');
check(bytes.readUInt32LE(0) === 0x46546c67 && bytes.readUInt32LE(4) === 2 && bytes.readUInt32LE(8) === bytes.length, 'Normal complete GLB2 required');
check(asset.parts.reduce((n,p) => n+p.bytes, 0) === bytes.length, 'Part lengths do not cover complete GLB');
let offset = 0;
for (const [i,part] of asset.parts.entries()) {
 check(part.filename === asset.filename + '.part' + i && Number.isSafeInteger(part.bytes) && part.bytes > 0 && part.bytes <= 25*1024*1024, 'Part name/size out of bounds');
 const chunk = bytes.subarray(offset, offset+part.bytes); offset += part.bytes;
 check(sha(chunk) === part.sha256, 'Declared part hash mismatch');
 const target = path.join(root, part.filename);
 if (fs.existsSync(target)) {const existing = fs.readFileSync(target);check(existing.length === part.bytes && sha(existing) === part.sha256, 'Refusing to overwrite different existing part');}
 else fs.writeFileSync(target, chunk, {flag:'wx'});
 const verified = fs.readFileSync(target);check(verified.length === part.bytes && sha(verified) === part.sha256, 'Written part identity mismatch');
}
console.log('SPLIT80_EXACT', JSON.stringify({wholeBytes:bytes.length,wholeSha256:asset.sha256,parts:asset.parts,policy:'Two lossless hosting parts; one ordinary complete GLB is parsed in the browser.'}));
