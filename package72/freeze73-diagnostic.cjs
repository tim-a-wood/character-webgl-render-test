'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=__dirname,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const baseline=JSON.parse(fs.readFileSync(path.join(root,'proof-inputs72.json')));
if(baseline.schema!=='standard-character-browser-inputs72-v1')throw Error('Unrecognised frozen baseline');
for(const f of baseline.localFiles){const p=path.join(root,f.path),b=fs.readFileSync(p);if(fs.lstatSync(p).isSymbolicLink()||b.length!==f.bytes||sha(b)!==f.sha256)throw Error('Baseline changed: '+f.path);}
const substitutions={'index.html':'index73-diagnostic.html','viewer72.js':'viewer73-diagnostic.js'};
const localFiles=baseline.localFiles.map(f=>{const name=substitutions[f.path]||f.path,b=fs.readFileSync(path.join(root,name));return{path:name,bytes:b.length,sha256:sha(b)};});
const proof={...baseline,schema:'standard-character-diagnostic73-v1',entry:'index73-diagnostic.html',localFiles,
 productionViewerSha256:baseline.localFiles.find(f=>f.path==='viewer72.js').sha256,
 affectedNames:['Mobile_EyeCornea','Mobile_EyeMeniscus'],
 segments:[{label:'A-all-visible',eyesVisible:true},{label:'B-eye-transmission-meshes-hidden',eyesVisible:false}],
 policy:'Diagnostic only, one loaded model/context; source GLB, clock, materials and production viewer unchanged. Restore eye visibility after B. No publication/dispatch by this script.'};
fs.writeFileSync(path.join(root,'proof-inputs73-diagnostic.json'),JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify({frozen:true,asset:proof.asset.sha256,productionViewerSha256:proof.productionViewerSha256,files:localFiles.length,segments:proof.segments}));
