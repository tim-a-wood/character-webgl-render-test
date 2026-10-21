'use strict';
// Only after an audited standard-export GLB and runtime72.json.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = __dirname, sha = b => crypto.createHash('sha256').update(b).digest('hex');
const runtime = JSON.parse(fs.readFileSync(path.join(root, 'runtime72.json')));
if (!runtime.asset || !/^[a-zA-Z0-9_.-]+\.glb$/.test(runtime.asset.filename)) throw Error('Pending: no frozen whole-character asset');
const asset = fs.readFileSync(path.join(root, runtime.asset.filename));
if (sha(asset) !== runtime.asset.sha256 || asset.length !== runtime.asset.bytes) throw Error('Runtime asset identity mismatch');
const vendor = JSON.parse(fs.readFileSync(path.join(root, 'vendor-integrity72.json')));
for (const item of vendor.files) if (sha(fs.readFileSync(path.join(root, item.path))) !== item.sha256) throw Error('Changed official vendor file: ' + item.path);
const names = ['index.html', 'viewer72.css', 'viewer72.js', 'metrics72.js', 'runtime72.json', 'ATTRIBUTION72.md', runtime.asset.filename, ...vendor.files.map(f => f.path)];
const localFiles = names.map(name => {
  const file = path.join(root, name); if (fs.lstatSync(file).isSymbolicLink()) throw Error('Symlink rejected');
  const bytes = fs.readFileSync(file); return { path: name, bytes: bytes.length, sha256: sha(bytes) };
});
const proof = { schema: 'standard-character-browser-inputs72-v1', entry: 'index.html', asset: runtime.asset,
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, playbackSeconds: 30,
  network: { offline: false, latency: 40, downloadThroughput: 1250000, uploadThroughput: 625000, connectionType: 'cellular4g' },
  cpuThrottlingRate: 2, conditionsLabel: 'Synthetic throttled desktop Chromium/SwiftShader; not a phone or cellular-network measurement.',
  localFiles, externalAssets: [], expectedClip: runtime.clip, expectedDuration: runtime.duration };
fs.writeFileSync(path.join(root, 'proof-inputs72.json'), JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify({ frozen: true, files: localFiles.length, bytes: localFiles.reduce((n, f) => n + f.bytes, 0), asset: runtime.asset }));
