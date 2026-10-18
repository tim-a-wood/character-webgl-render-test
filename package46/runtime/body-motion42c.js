// Einar v1 © Blender Foundation / Blender Studio, CC BY 4.0.
// Additional source-evaluated keys for one wrist gesture, not a general body rig.
import {BufferAttribute} from 'three';
async function hash(a){const b=a instanceof ArrayBuffer?a:a.buffer.slice(a.byteOffset,a.byteOffset+a.byteLength);return [...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function checked(url,expected){const r=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer'});if(!r.ok)throw Error('Motion42 HTTP '+r.status);const a=await r.arrayBuffer();if(await hash(a)!==expected)throw Error('Motion42 SHA mismatch');return a;}
export function weights42(value){if(!Number.isFinite(value)||value<0||value>1)throw Error('Motion42 pose must be between0 and1');const keys=[0,.125,.25,.5,.75,1],w=[0,0,0,0,0];if(value===1){w[0]=1;return w;}let lo=0;while(lo<4&&value>keys[lo+1])lo++;const t=(value-keys[lo])/(keys[lo+1]-keys[lo]);if(lo>0)w[lo]=1-t;if(lo+1===5)w[0]=t;else w[lo+1]=t;return w;}
export async function attachBodyMotion42({body,dataUrl,dataSha256,manifestUrl,manifestSha256}){
 const manifest=JSON.parse(new TextDecoder().decode(await checked(manifestUrl,manifestSha256)));
 if(manifest.version!==42||manifest.meshes.length!==14||manifest.compressedSha256!==dataSha256)throw Error('Motion42 manifest contract');
 const compressed=await checked(dataUrl,dataSha256),buffer=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
 if(buffer.byteLength!==manifest.decodedBytes||await hash(buffer)!==manifest.decodedSha256)throw Error('Motion42 decoded SHA');
 const scene=body.scene||body,prepared=[];const found=new Map();scene.traverse(o=>{if(o.isMesh){if(found.has(o.name))throw Error('Motion42 duplicate mesh '+o.name);found.set(o.name,o);}});
 for(const spec of manifest.meshes){const mesh=found.get('BODY27-'+spec.name);if(!mesh)throw Error('Motion42 missing '+spec.name);const g=mesh.geometry;if(!g.morphTargetsRelative||g.morphAttributes.position?.length!==1||g.morphAttributes.normal?.length!==1||g.attributes.tangent)throw Error('Motion42 incompatible morph layout '+spec.name);
  const attrs={POSITION:g.attributes.position,NORMAL:g.attributes.normal,INDEX:g.index,morphPOSITION:g.morphAttributes.position[0],morphNORMAL:g.morphAttributes.normal[0]};
  for(const [name,attr]of Object.entries(attrs)){
   if(!attr||attr.isInterleavedBufferAttribute)throw Error('Motion42 baseline layout '+spec.name+' '+name);
   let values=attr.array;
   // Three r160 DRACOLoader always decodes indices to Uint32; Blender respects the accessor component type.
   // Validate every numeric index before canonical serialization; never change the actual geometry index.
   if(name==='INDEX'){const expected=spec.baseline.INDEX,types={uint16:Uint16Array,uint32:Uint32Array},Type=types[expected.dtype];if(!Type||values.length!==expected.shape.reduce((a,b)=>a*b,1))throw Error('Motion42 index layout');const max=expected.dtype==='uint16'?65535:4294967295;for(const v of values)if(!Number.isInteger(v)||v<0||v>max||v>=spec.count)throw Error('Motion42 index range');values=new Type(values);}
   if(await hash(values)!==spec.baseline[name].sha256)throw Error('Motion42 baseline '+spec.name+' '+name);
  }
  const added={position:[],normal:[]};for(const k of spec.keys)for(const kind of ['position','normal']){const d=k[kind];if(d.offset%4||d.length!==spec.count*12||d.offset+d.length>buffer.byteLength)throw Error('Motion42 delta bounds');const a=new Float32Array(buffer,d.offset,d.length/4);if(await hash(a)!==d.sha256)throw Error('Motion42 delta SHA');for(const v of a)if(!Number.isFinite(v))throw Error('Motion42 nonfinite');const attr=new BufferAttribute(a,3);attr.name='wrist-source-'+k.value;added[kind].push(attr);}
  prepared.push({mesh,g,added,oldPosition:g.morphAttributes.position,oldNormal:g.morphAttributes.normal,oldDictionary:mesh.morphTargetDictionary,oldInfluences:mesh.morphTargetInfluences,oldBox:g.boundingBox?.clone()||null,oldSphere:g.boundingSphere?.clone()||null});
 }
 // No scene mutation occurs until all hashes and layouts pass.
 for(const x of prepared){x.g.morphAttributes.position=[...x.oldPosition,...x.added.position];x.g.morphAttributes.normal=[...x.oldNormal,...x.added.normal];x.mesh.updateMorphTargets();x.g.computeBoundingBox();x.g.computeBoundingSphere();}
 let disposed=false;const metadata={version:42,pose:0,meshes:prepared.length,vertices:manifest.meshes.reduce((n,m)=>n+m.count,0),keys:manifest.keys,compressedBytes:compressed.byteLength,deltaBytes:buffer.byteLength,sourceApproximation:true,fullRig:false};
 function setPose(value){if(disposed)throw Error('Motion42 disposed');const weights=weights42(value);for(const x of prepared)x.mesh.morphTargetInfluences.splice(0,5,...weights);metadata.pose=value;if(body.metadata)body.metadata.pose=value;return {pose:value,weights};}
 setPose(0);
 return {setPose,metadata,dispose(){if(disposed)return;disposed=true;for(const x of prepared){x.g.morphAttributes.position=x.oldPosition;x.g.morphAttributes.normal=x.oldNormal;x.mesh.morphTargetDictionary=x.oldDictionary;x.mesh.morphTargetInfluences=x.oldInfluences;x.g.boundingBox=x.oldBox;x.g.boundingSphere=x.oldSphere;}if(body.metadata)body.metadata.pose=0;}};
}
