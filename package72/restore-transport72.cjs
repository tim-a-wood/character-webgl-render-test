'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const runtime=JSON.parse(fs.readFileSync(path.join(__dirname,'runtime72.json')));
const a=runtime.asset,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
if(!a||!Array.isArray(a.transport?.parts)||!a.transport.parts.length)throw Error('Missing frozen lossless transport');
if(!/^[A-Za-z0-9_.-]+\.glb$/.test(a.filename))throw Error('Unsafe output filename');
const chunks=a.transport.parts.map(p=>{if(!/^[A-Za-z0-9_.-]+\.part\d+$/.test(p.filename))throw Error('Unsafe transport filename');const b=fs.readFileSync(path.join(__dirname,p.filename));if(b.length!==p.bytes||sha(b)!==p.sha256)throw Error('Transport identity mismatch');return b;});
const bytes=Buffer.concat(chunks);if(bytes.length!==a.bytes||sha(bytes)!==a.sha256)throw Error('Final GLB identity mismatch');
fs.writeFileSync(path.join(__dirname,a.filename),bytes);console.log('TRANSPORT72_RESTORED',JSON.stringify({bytes:bytes.length,sha256:sha(bytes)}));
