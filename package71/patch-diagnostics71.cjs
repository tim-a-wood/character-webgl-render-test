'use strict';
const fs=require('node:fs'), crypto=require('node:crypto'), path=require('node:path');
const root=__dirname, sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const checks=[
  ['official-viewer/package-lock.json','081f46a185b80ffe8ca08dd04246a6411185df5a020022b24139ca87978a74af'],
  ['official-viewer/glTF-Sample-Renderer/package-lock.json','388377c9627b6970528f7f9495cf4641ae571b187bc7a11191d516ab5c26b5e6']
];
for(const [name,hash] of checks) if(sha(fs.readFileSync(path.join(root,name)))!==hash) throw Error('Upstream lock changed: '+name);
const file=path.join(root,'official-viewer/src/main.js'), before=fs.readFileSync(file,'utf8');
const old='    const state = view.createState();';
const added='\n    globalThis.__standardViewer71 = { view, state, canvas, getViewerState, setViewerState, uiEvents }; // Diagnostic references only; upstream rendering is unchanged.';
const patchedHash='7250e7240b7fa42aa636c26ea8a5c600b6d1e79bd09c82272f03b8518b1400f0';
if(sha(before)===patchedHash){console.log('Diagnostic-only reference binding already verified');process.exit(0);}
if(sha(before)!=='5edeb995790396c4685462baea4fd53fbe46ac2cb9ad1f0ca7a7e90000c2efca')throw Error('Unexpected upstream main.js');
if(before.split(old).length!==2)throw Error('Unexpected reference binding location');
const after=before.replace(old,old+added);
if(sha(after)!==patchedHash)throw Error('Unexpected diagnostic patch');
fs.writeFileSync(file,after);
console.log('Applied one diagnostic-only reference binding; upstream loader/rendering algorithms unchanged');
