'use strict';
// Standard gzip transport only. The validator/viewer receive the exact original GLB.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const root=__dirname,inputs=JSON.parse(fs.readFileSync(path.join(root,'proof-inputs71.json')));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const check=(ok,message)=>{if(!ok)throw Error(message);};
const t=inputs.transport,a=inputs.asset;
check(t?.encoding==='gzip','Expected standard lossless gzip transport');
check(t.filename==='representative71.glb.gz'&&a.filename==='representative71.glb','Unexpected transport/output names');
check(Number.isSafeInteger(a.bytes)&&a.bytes>0&&a.bytes<=64*1024*1024,'Unexpected decoded GLB size');
const packed=fs.readFileSync(path.join(root,t.filename));
check(packed.length===t.bytes&&sha(packed)===t.sha256,'Compressed transport hash/length mismatch');
const decoded=zlib.gunzipSync(packed,{maxOutputLength:a.bytes});
check(decoded.length===a.bytes&&sha(decoded)===a.sha256,'Decoded GLB differs from the independently validated exporter bytes');
fs.writeFileSync(path.join(root,a.filename),decoded);
console.log('TRANSPORT71_RESTORED',JSON.stringify({encoding:'gzip',compressed:t,decoded:a,byteIdentical:true}));
