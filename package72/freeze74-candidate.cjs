'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=__dirname,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const baseline=JSON.parse(fs.readFileSync(path.join(root,'proof-inputs72.json')));
if(baseline.schema!=='standard-character-browser-inputs72-v1')throw Error('Unrecognised frozen baseline');
for(const f of baseline.localFiles){const p=path.join(root,f.path),b=fs.readFileSync(p);if(fs.lstatSync(p).isSymbolicLink()||b.length!==f.bytes||sha(b)!==f.sha256)throw Error('Baseline changed: '+f.path);}
const substitutions={'index.html':'index74-candidate.html','viewer72.js':'viewer74-candidate.js'};
const localFiles=baseline.localFiles.map(f=>{const name=substitutions[f.path]||f.path,b=fs.readFileSync(path.join(root,name));return{path:name,bytes:b.length,sha256:sha(b)};});
const proof={...baseline,schema:'standard-character-candidate74-v1',entry:'index74-candidate.html',localFiles,
 productionViewerSha256:baseline.localFiles.find(f=>f.path==='viewer72.js').sha256,
 affectedNames:['Mobile_EyeCornea','Mobile_EyeMeniscus'],
 segments:[{label:'A-original-eye-surfaces',mode:'baseline'},{label:'B-alpha-eye-surfaces',mode:'candidate'}],
 candidate:{reviewerApprovalRequired:true,opacity:0.08,transmission:0,transparent:true,depthWrite:false,side:'FrontSide',geometryAndSourceMapsUnchanged:true,
  walkReset:'Exact selected walk frame0 including authored morph weights',faceReset:'Unanimated source neutral',finiteEnd:'Stops at final sample, no seamless-loop claim'},
 policy:'Candidate review only. One loaded model/context; source GLB, clock and production viewer unchanged. No publication/dispatch/deployment by this script.'};
fs.writeFileSync(path.join(root,'proof-inputs74-candidate.json'),JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify({frozen:true,asset:proof.asset.sha256,productionViewerSha256:proof.productionViewerSha256,files:localFiles.length,segments:proof.segments}));
