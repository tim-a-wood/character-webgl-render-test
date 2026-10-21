'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const validator = require('gltf-validator');
const assetPath = path.resolve(process.argv[2] || path.join(__dirname, 'representative71.glb'));
const outputPath = path.resolve(process.argv[3] || path.join(__dirname, 'validator71.json'));
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

(async () => {
  const bytes = fs.readFileSync(assetPath);
  if (validator.version() !== '2.0.0-dev.3.10') throw Error('Unpinned Khronos validator');
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw Error('Invalid glTF 2.0 binary envelope');
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
  const references = [...(json.buffers || []), ...(json.images || [])].filter(x => x.uri).map(x => x.uri);
  if (references.length) throw Error('Representative GLB must be self-contained, without external resource URIs');
  const report = await validator.validateBytes(new Uint8Array(bytes), {
    uri: path.basename(assetPath), format: 'glb', maxIssues: 0,
    externalResourceFunction: uri => { throw Error('Unexpected external resource: ' + uri); }
  });
  const parentByNode=new Map();
  (json.nodes||[]).forEach((node,index)=>(node.children||[]).forEach(child=>parentByNode.set(child,index)));
  const identity=node=>{
    const same=(a,b)=>a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<1e-12);
    return (!node.matrix||same(node.matrix,[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]))&&
      (!node.translation||same(node.translation,[0,0,0]))&&(!node.rotation||same(node.rotation,[0,0,0,1]))&&(!node.scale||same(node.scale,[1,1,1]));
  };
  const transformedByAnimation=new Set((json.animations||[]).flatMap(a=>a.channels.filter(c=>['translation','rotation','scale'].includes(c.target.path)).map(c=>c.target.node)));
  const warningEvidence=report.issues.messages.filter(i=>i.severity===1).map(issue=>{
    if(issue.code!=='NODE_SKINNED_MESH_NON_ROOT')return {code:issue.code,pointer:issue.pointer,reviewed:false};
    const nodeIndex=Number(issue.pointer.split('/')[2]), ancestors=[],seen=new Set([nodeIndex]);
    let p=parentByNode.get(nodeIndex),cycle=false;
    while(p!==undefined){if(seen.has(p)){cycle=true;break;}seen.add(p);ancestors.push(p);p=parentByNode.get(p);}
    const affected=[nodeIndex,...ancestors];
    const allTransformsIdentity=affected.every(i=>identity(json.nodes[i]));
    const noAnimatedTransforms=affected.every(i=>!transformedByAnimation.has(i))&&!(json.extensionsUsed||[]).includes('KHR_animation_pointer');
    return {code:issue.code,pointer:issue.pointer,nodeIndex,ancestorIndices:ancestors,allTransformsIdentity,noAnimatedTransforms,cycle,
      reviewed:ancestors.length>0&&!cycle&&allTransformsIdentity&&noAnimatedTransforms,
      note:'For this frozen export only, ignoring identity, unanimated skinned-mesh/ancestor transforms cannot change placement. This classification does not establish deformation or visual fidelity.'};
  });
  const grouped = {};
  for (const issue of report.issues.messages) {
    const key = issue.severity + ':' + issue.code;
    const group = grouped[key] ||= {severity: issue.severity, code: issue.code, count: 0, example: issue.message, pointers: []};
    group.count += 1;
    if (group.pointers.length < 8) group.pointers.push(issue.pointer ?? issue.offset ?? null);
  }
  const classifications = Object.values(grouped).map(group => ({...group,
    disposition: group.severity === 0 ? 'blocking-error' : group.severity === 1 ? (warningEvidence.filter(e=>e.code===group.code).every(e=>e.reviewed)?'reviewed-identity-hierarchy-warning':'warning-requires-explicit-review') : 'informational',
    note: group.code === 'UNUSED_OBJECT' ? 'These retained UV attributes are unused by the diagnostic untextured materials; this is not final material/appearance acceptance.' : 'No severity overrides or ignored issues were applied. See specific transform/animation evidence for warning review.'
  }));
  const result = {
    format: 'standard-gltf-validation71-v1', validatedAt: new Date().toISOString(),
    validator: {name: 'Khronos glTF Validator', version: validator.version(), source: 'https://github.com/KhronosGroup/glTF-Validator', suppressedIssues: []},
    asset: {filename: path.basename(assetPath), bytes: bytes.length, sha256: sha256(bytes), generator: json.asset.generator,
      meshes: (json.meshes || []).length, skins: (json.skins || []).length,
      morphTargets: (json.meshes || []).map((m, i) => ({mesh: i, name: m.name, targets: Math.max(...m.primitives.map(p => p.targets?.length || 0))})),
      animations: (json.animations || []).map((a, i) => ({index: i, name: a.name, channels: a.channels.length,
        paths: [...new Set(a.channels.map(c => c.target.path))],
        startSeconds: Math.min(...a.samplers.map(s => json.accessors[s.input].min[0])),
        endSeconds: Math.max(...a.samplers.map(s => json.accessors[s.input].max[0]))})),
      extensionsUsed: json.extensionsUsed || [], externalReferences: references,
      cameras: (json.nodes || []).map((n, i) => n.camera === undefined ? null : {node: i, name: n.name, camera: n.camera}).filter(Boolean)},
    formatPass: report.issues.numErrors === 0,
    warningReviewComplete: warningEvidence.every(e=>e.reviewed),
    classifications, warningEvidence, report
  };
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
  console.log('VALIDATOR71_RESULT', JSON.stringify(result));
  if (!result.formatPass || !result.warningReviewComplete) process.exitCode = 1;
})().catch(error => { console.error('VALIDATOR71_FAILED', error.stack); process.exitCode = 1; });
