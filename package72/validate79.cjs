'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),validator=require('gltf-validator');
const runtime=JSON.parse(fs.readFileSync('runtime79-jog.json')),b=fs.readFileSync(runtime.asset.filename),sha=crypto.createHash('sha256').update(b).digest('hex');
if(sha!==runtime.asset.sha256||b.length!==runtime.asset.bytes)throw Error('Frozen GLB mismatch');
validator.validateBytes(new Uint8Array(b),{uri:runtime.asset.filename,maxIssues:10000}).then(report=>{
const r={asset:{sha256:sha,bytes:b.length},validator:validator.version(),suppressedIssues:[],report};
fs.writeFileSync('validator79.json',JSON.stringify(r,null,2));console.log('VALIDATOR79_RESULT',JSON.stringify(r));if(report.issues.numErrors)process.exitCode=1;
}).catch(e=>{console.error(e);process.exitCode=1});
