'use strict';
// Checksum-verified lossless transfer packaging. The browser receives a normal complete GLB.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=__dirname,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const runtime=JSON.parse(fs.readFileSync(path.join(root,'runtime76-jog.json')));
const delta=JSON.parse(fs.readFileSync(path.join(root,'transport76.json')));
const safe=n=>typeof n==='string'&&/^[A-Za-z0-9_.-]+\.glb$/.test(n);
if(!safe(runtime.transportBaselineAsset.filename)||!safe(runtime.asset.filename)||runtime.asset.filename===runtime.transportBaselineAsset.filename)throw Error('Unsafe transport output');
if(delta.schema!=='lossless-verified-byte-transport74-v1')throw Error('Unsupported byte transport');
const base=fs.readFileSync(path.join(root,runtime.transportBaselineAsset.filename));
if(base.length!==delta.baselineBytes||sha(base)!==delta.baselineSha256||delta.baselineSha256!==runtime.transportBaselineAsset.sha256)throw Error('Baseline identity mismatch');
if(delta.outputBytes!==runtime.asset.bytes||delta.outputSha256!==runtime.asset.sha256)throw Error('Output identity mismatch');
let bytes=0;const parts=[];
for(const op of delta.operations){let part;if(op.copy){const [start,len]=op.copy;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(len)||start<0||len<0||start+len>base.length)throw Error('Copy range out of bounds');part=base.subarray(start,start+len);}else if(typeof op.literal==='string'){part=Buffer.from(op.literal,'base64');if(part.toString('base64')!==op.literal)throw Error('Non-canonical literal');}else throw Error('Unknown operation');bytes+=part.length;if(bytes>delta.outputBytes)throw Error('Oversized reconstruction');parts.push(part);}
const final=Buffer.concat(parts);if(final.length!==delta.outputBytes||sha(final)!==delta.outputSha256)throw Error('Reconstructed final SHA mismatch');
fs.writeFileSync(path.join(root,runtime.asset.filename),final);console.log('TRANSPORT76_EXACT',JSON.stringify({bytes:final.length,sha256:sha(final),transportBytes:fs.statSync(path.join(root,'transport76.json')).size}));
